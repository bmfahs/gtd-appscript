/**
 * Firestore Service
 * Handles native REST API connections to Google Cloud Firestore
 * Requires OAuth scope: https://www.googleapis.com/auth/datastore
 */

const FirestoreService = {
  
  _projectIdCache: null,
  
  getProjectId: function() {
    if (this._projectIdCache) return this._projectIdCache;
    const props = PropertiesService.getScriptProperties();
    const pid = props.getProperty('FIRESTORE_PROJECT_ID');
    if (!pid) {
      throw new Error('Missing FIRESTORE_PROJECT_ID in Script Properties. Required for Firestore backend.');
    }
    this._projectIdCache = pid;
    return pid;
  },
  
  getBaseUrl: function() {
    return 'https://firestore.googleapis.com/v1/projects/' + this.getProjectId() + '/databases/(default)/documents';
  },

  getHeaders: function() {
    return {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Type': 'application/json'
    };
  },

  // ==========================================
  // Serialization Helpers
  // ==========================================

  jsToFirestore: function(obj) {
    if (obj === null || obj === undefined) return { nullValue: null };
    if (typeof obj === 'string') return { stringValue: obj };
    if (typeof obj === 'boolean') return { booleanValue: obj };
    if (typeof obj === 'number') {
      if (Number.isInteger(obj)) return { integerValue: obj.toString() }; // Firestore wants strings for integers in REST
      return { doubleValue: obj };
    }
    if (Array.isArray(obj)) {
      return { arrayValue: { values: obj.map(this.jsToFirestore.bind(this)) } };
    }
    if (typeof obj === 'object') {
      const fields = {};
      for (const key in obj) {
        if (obj[key] !== undefined) {
           fields[key] = this.jsToFirestore(obj[key]);
        }
      }
      return { mapValue: { fields: fields } };
    }
    return { stringValue: String(obj) };
  },

  firestoreToJs: function(val) {
    if (val.nullValue !== undefined) return null;
    if (val.stringValue !== undefined) return val.stringValue;
    if (val.booleanValue !== undefined) return val.booleanValue;
    if (val.integerValue !== undefined) return parseInt(val.integerValue, 10);
    if (val.doubleValue !== undefined) return parseFloat(val.doubleValue);
    if (val.arrayValue !== undefined) {
      return (val.arrayValue.values || []).map(this.firestoreToJs.bind(this));
    }
    if (val.mapValue !== undefined) {
      const obj = {};
      const fields = val.mapValue.fields || {};
      for (const key in fields) {
        obj[key] = this.firestoreToJs(fields[key]);
      }
      return obj;
    }
    return null;
  },

  documentToJs: function(doc) {
    if (!doc || !doc.fields) return null;
    const obj = {};
    for (const key in doc.fields) {
      obj[key] = this.firestoreToJs(doc.fields[key]);
    }
    // Set ID from the document name path
    if (doc.name) {
      const parts = doc.name.split('/');
      obj.id = parts[parts.length - 1];
    }
    return obj;
  },

  jsToDocument: function(obj) {
    const fields = {};
    for (const key in obj) {
      if (key === 'id') continue; // ID is stored in the document name path
      if (obj[key] !== undefined) {
        fields[key] = this.jsToFirestore(obj[key]);
      }
    }
    return { fields: fields };
  },

  // ==========================================
  // Core REST Fetcher
  // ==========================================

  fetchCollection: function(collectionId) {
    const url = this.getBaseUrl() + '/' + collectionId + '?pageSize=1000';
    let results = [];
    let pageToken = null;
    
    do {
      const fetchUrl = pageToken ? url + '&pageToken=' + encodeURIComponent(pageToken) : url;
      const res = UrlFetchApp.fetch(fetchUrl, {
        method: 'GET',
        headers: this.getHeaders(),
        muteHttpExceptions: true
      });
      
      if (res.getResponseCode() !== 200) {
        Logger.log("Firestore Fetch Error: " + res.getContentText());
        break;
      }
      
      const data = JSON.parse(res.getContentText());
      if (data.documents) {
        results = results.concat(data.documents);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    
    return results.map(doc => this.documentToJs(doc));
  },

  fetchDocument: function(collectionId, docId) {
    const url = this.getBaseUrl() + '/' + collectionId + '/' + docId;
    const res = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 404) return null;
    if (res.getResponseCode() !== 200) {
       Logger.log("Firestore FetchDoc Error: " + res.getContentText());
       return null;
    }
    return this.documentToJs(JSON.parse(res.getContentText()));
  },

  writeDocument: function(collectionId, docId, obj, isUpdate) {
    // If it's an update, we should really use the patch method with updateMask.
    // For simplicity, Firestore supports overwriting entirely, but PATCH is better.
    // Wait, the standard "updateTask" pattern in our app provides a partial object (updates array).
    // So we MUST use PATCH with an updateMask, or read-modify-write.
    // Actually, `FirestoreService.updateTaskBatch` can use Firestore Transactions/Batches.
    
    // For a single document write:
    const doc = this.jsToDocument(obj);
    let url = this.getBaseUrl() + '/' + collectionId + '/' + docId;
    
    let method = 'PATCH'; // In Firestore, PATCH creates if missing, unless updateMask is used strictly.
    
    // If it's a partial update, we only include the fields provided in obj in the updateMask
    let queryParams = [];
    if (isUpdate) {
        for (const key in obj) {
            if (key !== 'id') {
                queryParams.push('updateMask.fieldPaths=' + encodeURIComponent(key));
            }
        }
    }
    
    if (queryParams.length > 0) {
        url += '?' + queryParams.join('&');
    }

    const res = UrlFetchApp.fetch(url, {
      method: method,
      headers: this.getHeaders(),
      payload: JSON.stringify(doc),
      muteHttpExceptions: true
    });
    
    if (res.getResponseCode() !== 200) {
       Logger.log("Firestore Write Error: " + res.getContentText());
       return { success: false, error: res.getContentText() };
    }
    return { success: true, doc: this.documentToJs(JSON.parse(res.getContentText())) };
  },

  deleteDocument: function(collectionId, docId) {
    const url = this.getBaseUrl() + '/' + collectionId + '/' + docId;
    const res = UrlFetchApp.fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
      muteHttpExceptions: true
    });
    return { success: res.getResponseCode() === 200 };
  },

  // ==========================================
  // API Matches DatabaseService
  // ==========================================

  getAllDataPayload: function() {
    Logger.log("Fetching Payload from Firestore...");
    
    // fetchCollection automatically handles pagination
    const allItems = this.fetchCollection('tasks');
    const ctxRaw = this.fetchCollection('contexts');
    const areasRaw = this.fetchCollection('areas');
    const setRaw = this.fetchCollection('settings');
    
    const payload = {
      tasks: [],
      projects: [],
      contexts: ctxRaw.sort((a,b) => a.sortOrder - b.sortOrder),
      areas: areasRaw.sort((a,b) => a.sortOrder - b.sortOrder),
      settings: {}
    };
    
    setRaw.forEach(s => {
      payload.settings[s.config_key] = s.config_value;
    });

    // We must handle the mapping of parentTaskId to projectId exactly like SQL
    allItems.forEach(obj => {
       obj.projectId = obj.parentTaskId || "";
       obj.isStarred = obj.isStarred === true || obj.isStarred === 1 || obj.isStarred === "1";
       obj.priority = parseInt(obj.priority) || 0;
       obj.sortOrder = parseInt(obj.sortOrder) || 0;
       obj.reviewCadence = parseInt(obj.reviewCadence) || 1;
    });

    payload.tasks = allItems.filter(t => (t.type === 'task' || !t.type) && t.status !== 'done' && t.status !== 'deleted' && t.isDeleted !== true && t.isDeleted !== 'true');
    
    const activeProjectItems = allItems.filter(t => (t.type === 'project' || t.type === 'folder') && t.status !== 'done' && t.status !== 'deleted' && t.isDeleted !== true && t.isDeleted !== 'true');
    payload.projects = activeProjectItems.map(task => {
      let status = task.status;
      if (status === 'done') status = 'completed';
      return {
        id: task.id, name: task.title, description: task.notes, status: status,
        areaId: task.areaId, dueDate: task.dueDate, createdDate: task.createdDate, completedDate: task.completedDate,
        sortOrder: task.sortOrder, parentProjectId: task.parentTaskId, type: task.type || 'project',
        scheduledDate: task.scheduledDate, reviewCadence: task.reviewCadence, lastReviewed: task.lastReviewed,
        aiContext: task.aiContext || ''
      };
    });

    return payload;
  },

  getAllItems: function() {
    return this.fetchCollection('tasks').filter(t => t.status !== 'deleted');
  },

  getTask: function(taskId) {
    return this.fetchDocument('tasks', taskId);
  },

  hasActiveChildren: function(parentId) {
     const tasks = this.fetchCollection('tasks');
     return tasks.some(t => t.parentTaskId === parentId && t.isDeleted !== true && t.isDeleted !== 'true' && !['completed', 'done', 'dropped', 'deleted', 'reference'].includes(t.status));
  },

  createTask: function(task) {
    if (!task.id) task.id = Utilities.getUuid();
    // Normalize logic parity with SQL
    task.priority = Math.round(task.priority || 0);
    task.sortOrder = Math.round(task.sortOrder || 0);
    task.reviewCadence = Math.round(task.reviewCadence || 1);
    
    const res = this.writeDocument('tasks', task.id, task, false);
    if (res.success && typeof clearDataCache === 'function') clearDataCache();
    
    // Explicitly return the task object for parity with DatabaseService
    res.task = task;
    return res;
  },

  updateTask: function(taskId, updates) {
     const existing = this.getTask(taskId);
     if (!existing) return { success: false, error: 'Task not found in Firestore' };
     
     const merged = Object.assign({}, existing, updates);
     merged.modifiedDate = new Date().toISOString();
     if (merged.type === 'task') {
         merged.priority = PriorityService.calculatePriority(merged);
     }
     
     // Write partial updates
     const res = this.writeDocument('tasks', taskId, merged, true);
     if (res.success && typeof clearDataCache === 'function') clearDataCache();
     return res;
  },

  updateTasksBatch: function(updatesArray) {
     if (!updatesArray || updatesArray.length === 0) return { success: true, count: 0, error: '' };
     
     // Firestore supports commit batches, but for Apps Script simplicity, we'll do sequential PATCHes
     // via UrlFetchApp.fetchAll for incredible speed.
     
     // First, read all necessary docs sequentially (or fetchAll)
     const baseUrl = this.getBaseUrl();
     const headers = this.getHeaders();
     
     const getReqs = updatesArray.map(u => ({
         url: baseUrl + '/tasks/' + u.id,
         method: 'GET',
         headers: headers,
         muteHttpExceptions: true
     }));
     
     const getResponses = UrlFetchApp.fetchAll(getReqs);
     
     const patchReqs = [];
     let validCount = 0;
     let errors = [];
     
     updatesArray.forEach((u, i) => {
         const getRes = getResponses[i];
         if (getRes.getResponseCode() !== 200) {
             errors.push(u.id + ': Task not found');
             return;
         }
         
         const existing = this.documentToJs(JSON.parse(getRes.getContentText()));
         const merged = Object.assign({}, existing, u.updates);
         merged.modifiedDate = new Date().toISOString();
         if (merged.type === 'task') merged.priority = PriorityService.calculatePriority(merged);
         
         const doc = this.jsToDocument(merged);
         
         // Generate PATCH URL with updateMask
         let url = baseUrl + '/tasks/' + u.id;
         let queryParams = [];
         for (const key in merged) {
             if (key !== 'id') queryParams.push('updateMask.fieldPaths=' + encodeURIComponent(key));
         }
         if (queryParams.length > 0) url += '?' + queryParams.join('&');
         
         patchReqs.push({
             url: url,
             method: 'PATCH',
             headers: headers,
             payload: JSON.stringify(doc),
             muteHttpExceptions: true
         });
         validCount++;
     });
     
     if (patchReqs.length > 0) {
         const patchResponses = UrlFetchApp.fetchAll(patchReqs);
         patchResponses.forEach((res, i) => {
            if (res.getResponseCode() !== 200) {
                errors.push('Batch Write Error: ' + res.getContentText());
            }
         });
     }
     
     if (typeof clearDataCache === 'function') clearDataCache();
     return { success: errors.length === 0, count: validCount, error: errors.join(', ') };
  },

  hardDeleteTask: function(taskId) {
     const res = this.deleteDocument('tasks', taskId);
     if (res.success && typeof clearDataCache === 'function') clearDataCache();
     return res;
  },
  
  // ==========================================
  // SQL ROUTES FOR CONTEXTS, AREAS & SETTINGS
  // ==========================================

  getAllContexts: function() { return this.fetchCollection('contexts').sort((a,b) => a.sortOrder - b.sortOrder); },
  getTaskContext: function(id) { return this.fetchDocument('contexts', id); },
  createContext: function(data) {
     const id = Utilities.getUuid();
     data.id = id;
     this.writeDocument('contexts', id, data, false);
     return data;
  },
  updateContext: function(id, updates) {
     const existing = this.getTaskContext(id);
     if (!existing) return { success: false };
     const merged = Object.assign({}, existing, updates);
     this.writeDocument('contexts', id, merged, true);
     return { success: true, context: merged };
  },
  deleteContext: function(id) { return this.deleteDocument('contexts', id); },

  getAllAreas: function() { return this.fetchCollection('areas').sort((a,b) => a.sortOrder - b.sortOrder); },
  getArea: function(id) { return this.fetchDocument('areas', id); },
  createArea: function(data) {
     const id = Utilities.getUuid();
     data.id = id;
     this.writeDocument('areas', id, data, false);
     return data;
  },
  updateArea: function(id, updates) {
     const existing = this.getArea(id);
     if (!existing) return { success: false };
     const merged = Object.assign({}, existing, updates);
     this.writeDocument('areas', id, merged, true);
     return { success: true, area: merged };
  },
  deleteArea: function(id) { return this.deleteDocument('areas', id); },

  getSettings: function() {
     const settingsArr = this.fetchCollection('settings');
     const obj = {};
     settingsArr.forEach(s => {
         obj[s.config_key] = s.config_value;
     });
     return obj;
  },
  updateSetting: function(key, value) {
     this.writeDocument('settings', key, { config_key: key, config_value: value }, true);
     return { success: true };
  }
};
