/**
 * GTD System - Main Entry Point
 * Handles web app routing and initialization
 */



/**
 * Serves the web app
 * Dual-Mode:
 * 1. Owner -> Full GTD App (Index)
 * 2. Anonymous/Others -> Quick Capture Form (QuickCapture)
 */
function doGet(e) {
  var params = e ? e.parameter : {};
  
  // Detect if the visitor is the Owner
  // Session.getActiveUser().getEmail() is empty if anonymous or incognito
  // Session.getEffectiveUser().getEmail() is always the script owner (Me)
  // Note: This relies on "Execute as Me" deployment setting.
  const activeUser = Session.getActiveUser().getEmail();
  const title = (activeUser === Session.getEffectiveUser().getEmail()) ? 'GTD System' : 'Quick Capture';
  
  // Decide which page to show
  // If Debug page requested AND user is owner, allow it.
  if (params.page === 'debug' && activeUser === Session.getEffectiveUser().getEmail()) {
    return HtmlService.createHtmlOutputFromFile('DebugPage')
      .setTitle('GTD Debug')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (params.page === 'import' && activeUser === Session.getEffectiveUser().getEmail()) {
     // Owner -> Import Tool
     return HtmlService.createHtmlOutputFromFile('Import')
      .setTitle('GTD Import & Scan')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } else if (activeUser === Session.getEffectiveUser().getEmail() && params.page !== 'capture') {
     // Owner -> Full App
     return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle(title)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } else {
     // Anonymous/Public -> Simple Capture Form
     return HtmlService.createHtmlOutputFromFile('QuickCapture')
      .setTitle(title)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
}

/**
 * Handle POST requests (WebHook for Quick Capture)
 * Payload: { "key": "SECRET", "title": "...", "notes": "..." }
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'No data' })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const storedKey = PropertiesService.getScriptProperties().getProperty('API_SECRET');

    // Simple security check
    if (!storedKey || data.key !== storedKey) {
       return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid API Key' })).setMimeType(ContentService.MimeType.JSON);
    }

    // Create Task
    const task = TaskService.createTask({
      title: data.title || 'Quick Capture',
      notes: data.notes || '',
      status: 'inbox',
      createdDate: new Date().toISOString()
    });

    return ContentService.createTextOutput(JSON.stringify({ success: true, id: task.id })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Initialize the system - creates sheets if they don't exist
 */
function initializeSystem() {
  const ss = getSpreadsheet();
  
  // Create Tasks sheet if missing
  if (!ss.getSheetByName(SHEETS.TASKS)) {
    const tasks = ss.insertSheet(SHEETS.TASKS);
    tasks.appendRow([
      'id', 'title', 'notes', 'status', 'projectId', 'contextId',
      'waitingFor', 'dueDate', 'scheduledDate', 'completedDate',
      'createdDate', 'modifiedDate', 'emailId', 'emailThreadId',
      'priority', 'energyRequired', 'timeEstimate', 'parentTaskId', 'sortOrder'
    ]);
    tasks.setFrozenRows(1);
  }
  
  // Create Projects sheet if missing
  if (!ss.getSheetByName(SHEETS.PROJECTS)) {
    const projects = ss.insertSheet(SHEETS.PROJECTS);
    projects.appendRow([
      'id', 'name', 'description', 'status', 'areaId',
      'dueDate', 'createdDate', 'completedDate', 'sortOrder'
    ]);
    projects.setFrozenRows(1);
  }
  

  
  // Create Contexts sheet if missing
  if (!ss.getSheetByName(SHEETS.CONTEXTS)) {
    const contexts = ss.insertSheet(SHEETS.CONTEXTS);
    contexts.appendRow(['id', 'name', 'icon', 'sortOrder']);
    contexts.setFrozenRows(1);
    
    // Add default contexts
    const defaultContexts = [
      [generateUUID(), '@home', '🏠', 1],
      [generateUUID(), '@office', '🏢', 2],
      [generateUUID(), '@computer', '💻', 3],
      [generateUUID(), '@phone', '📱', 4],
      [generateUUID(), '@errands', '🚗', 5],
      [generateUUID(), '@anywhere', '🌍', 6]
    ];
    defaultContexts.forEach(ctx => contexts.appendRow(ctx));
  }
  
  // Create Areas sheet if missing
  if (!ss.getSheetByName(SHEETS.AREAS)) {
    const areas = ss.insertSheet(SHEETS.AREAS);
    areas.appendRow(['id', 'name', 'icon', 'sortOrder']);
    areas.setFrozenRows(1);
    
    // Add default areas
    const defaultAreas = [
      [generateUUID(), 'Work', '💼', 1],
      [generateUUID(), 'Personal', '👤', 2],
      [generateUUID(), 'Health', '❤️', 3],
      [generateUUID(), 'Finance', '💰', 4]
    ];
    defaultAreas.forEach(area => areas.appendRow(area));
  }
  
  // Create Settings sheet if missing
  if (!ss.getSheetByName(SHEETS.SETTINGS)) {
    const settings = ss.insertSheet(SHEETS.SETTINGS);
    settings.appendRow(['key', 'value']);
    settings.setFrozenRows(1);
    
    // Add default settings
    const defaultSettings = [
      ['defaultContext', ''],
      ['reviewDay', 'Sunday'],
      ['workStartHour', '9'],
      ['workEndHour', '17'],
      ['currentEnergyLevel', 'medium'],
      ['availableMinutes', '60']
    ];
    defaultSettings.forEach(s => settings.appendRow(s));
  }
  
  return { success: true, message: 'System initialized' };
}

// ============================================
// API Functions called from client-side
// ============================================

/**
 * Clear the data cache (Call this on every write operation)
 */
function clearDataCache() {
  try {
    const cache = CacheService.getUserCache();
    cache.remove('gtd_all_data');
    Logger.log('Cache cleared');
  } catch (e) {
    Logger.log('Error clearing cache: ' + e.toString());
  }
}

/**
 * Get all data for initial load
 */
function getAllData(forceRefresh) {
  Logger.log('getAllData() called');
  try {
    const cache = CacheService.getUserCache();
    if (forceRefresh) {
        cache.remove('gtd_all_data');
    } else {
        const cached = cache.get('gtd_all_data');
        if (cached) {
          Logger.log('Serving data from cache');
          return JSON.parse(cached);
        }
    }

    // Optimization: If SQL Backend is active, grab everything in ONE single database connection
    // to avoid the 3-5 second handshake penalty per individual service query.
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
        const payload = DatabaseService.getAllDataPayload();
        const sanitizedSql = JSON.parse(JSON.stringify(payload));
        // Cache it too
        try { cache.put('gtd_all_data', JSON.stringify(sanitizedSql), 21600); } catch(e){}
        return sanitizedSql;
    }

    // Optimization: Read Tasks sheet once for both Tasks and Projects
    // And filter out 'done' items to reduce payload size
    const allItems = TaskService.getAllItems();
    
    // Filter Tasks (Type = Task or hidden/missing, and NOT Done)
    const activeTasks = allItems.filter(function(t) {
        return (t.type === TASK_TYPE.TASK || !t.type) && t.status !== STATUS.DONE;
    });

    // Filter Projects (Type = Project OR Folder, and Status != 'completed' which maps to 'done' internally)
    const activeProjectItems = allItems.filter(function(t) {
        return (t.type === TASK_TYPE.PROJECT || t.type === TASK_TYPE.FOLDER) && t.status !== STATUS.DONE;
    });

    // Map to Project objects
    const projects = activeProjectItems.map(function(p) {
        return ProjectService.taskToProject(p);
    });

    const data = {
      tasks: activeTasks,
      projects: projects,
      contexts: ContextService.getAllContexts(),
      areas: AreaService.getAllAreas(),
      settings: getSettings()
    };
    Logger.log('getAllData() optimized success. Tasks: ' + activeTasks.length + ', Projects: ' + projects.length);
    // Sanitize data before sending to client (google.script.run silently fails on Dates/NaN)
    const sanitized = JSON.parse(JSON.stringify(data));
    
    // Store in cache for 6 hours (21600 seconds), maximum size is 100KB per value.
    try {
        const jsonString = JSON.stringify(sanitized);
        if (jsonString.length < 100000) {
            cache.put('gtd_all_data', jsonString, 21600);
            Logger.log('Saved to cache');
        } else {
            Logger.log('Payload too large for cache (' + jsonString.length + ' bytes)');
        }
    } catch (ce) {
        Logger.log('Cache save error: ' + ce.toString());
    }

    return sanitized;
  } catch (e) {
    Logger.log('getAllData() error: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
    
    // If sheets don't exist, initialize first
    try {
      if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
         Logger.log('SQL Backend active. Ignoring fallback initialization.');
         throw new Error("Critical fallback skipped because SQL is active. Database schema must be migrated manually.");
      }
      Logger.log('Attempting to initialize system...');
      initializeSystem();
      // On init, empty is fine
      const data = {
        tasks: [],
        projects: [],
        contexts: ContextService.getAllContexts(),
        areas: AreaService.getAllAreas(),
        settings: getSettings()
      };
      Logger.log('getAllData() success after init');
      return JSON.parse(JSON.stringify(data));
    } catch (e2) {
      Logger.log('getAllData() fatal error: ' + e2.toString());
      throw e2;
    }
  }
}

/**
 * Get settings
 */
function getSettings() {
  if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) return DatabaseService.getSettings();

  const sheet = getSheet(SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  const settings = {};
  
  for (let i = 1; i < data.length; i++) {
    let key = data[i][0];
    let value = data[i][1];
    
    settings[key] = value;
  }
  
  return settings;
}

/**
 * Update a setting
 */
function updateSetting(key, value) {
  if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
      if (typeof clearDataCache === 'function') clearDataCache();
      return DatabaseService.updateSetting(key, value);
  }

  const sheet = getSheet(SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      if (typeof clearDataCache === 'function') clearDataCache();
      return { success: true };
    }
  }
  
  // Setting doesn't exist, add it
  sheet.appendRow([key, value]);
  if (typeof clearDataCache === 'function') clearDataCache();
  return { success: true };
}

/**
 * Quick capture - add to inbox
 */
/**
 * Quick capture - add to inbox
 */
function quickCapture(title, notes) {
  // Inbox Unification: New items are strictly status='inbox' at the root level.
  // We no longer nest under an "<Inbox>" folder task.
  
  return TaskService.createTask({
    title: title,
    notes: notes || '',
    status: STATUS.INBOX,
    parentTaskId: '' 
  });
}

/**
 * Get inbox count for badge
 */
function getInboxCount() {
  const tasks = TaskService.getTasksByStatus(STATUS.INBOX);
  return tasks.length;
}

/**
 * Process Gmail messages into tasks
 */
function processEmailToTask(messageId) {
  return GmailService.createTaskFromEmail(messageId);
}

/**
 * Get recent emails for add-on
 */
function getRecentEmails(count) {
  return GmailService.getRecentEmails(count || 10);
}

// ============================================
// Wrapper functions for client-side calls
// (google.script.run can only call top-level functions)
// ============================================

/**
 * Update a task
 */
function updateTask(taskId, updates) {

  try {
    return TaskService.updateTask(taskId, updates);
  } catch (e) {
    Logger.log('updateTask error: ' + e);
    return { success: false, error: e.toString() };
  }
}


/**
 * Batch update tasks
 */
function updateTasks(updatesArray) {
  var start = new Date().getTime();
  
  // Ultra-Fast SQL Batch interceptor bypasses sequential 300ms proxy loops
  if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND && typeof DatabaseService.updateTasksBatch === 'function') {
      var res = DatabaseService.updateTasksBatch(updatesArray);
      var end = new Date().getTime();
      Logger.log("updateTasksBatch executed " + updatesArray.length + " updates in " + (end - start) + "ms. Success: " + res.success);
      return res;
  }

  // Legacy sequential fallback for Google Sheets
  // updatesArray = [{ id: '...', updates: { ... } }]
  var results = [];
  var errors = [];
  updatesArray.forEach(function(u) {
    try {
      var res = TaskService.updateTask(u.id, u.updates);
      if (!res.success) {
        errors.push('Task ' + u.id + ': ' + res.error);
      }
      results.push(res);
    } catch (e) {
      Logger.log('Error updating task ' + u.id + ': ' + e.toString());
      errors.push('Task ' + u.id + ': ' + e.toString());
    }
  });

  if (errors.length > 0) {
    return { success: false, error: errors.join('; '), count: results.length };
  }
  
  return { success: true, count: results.length };
}

/**
 * Complete a task
 */
function completeTask(taskId) {
  var task = TaskService.getTask(taskId);
  if (!task) return { success: false, error: 'Task not found' };
  
  var updates = {
    status: STATUS.DONE,
    completedDate: now()
  };
  
  var result = TaskService.updateTask(taskId, updates);
  if (result.success) {
    return { success: true, task: TaskService.getTask(taskId) };
  } else {
    return result;
  }
}

/**
 * Complete a project
 */
function completeProject(projectId) {
  var project = ProjectService.getProject(projectId);
  if (!project) return { success: false, error: 'Project not found' };
  
  var updates = {
    status: 'completed',
    completedDate: now()
  };
  
  var result = ProjectService.updateProject(projectId, updates);
  if (result.success) {
    return { success: true, project: ProjectService.getProject(projectId) };
  } else {
    return result;
  }
}

/**
 * Convert a task to a project
 */
/**
 * Convert a task to a project
 */
function convertTaskToProject(taskId) {
  var task = TaskService.getTask(taskId);
  if (!task) return { success: false, error: 'Task not found' };
  
  // New simplified logic: Just update the type!
  // We maintain the ID, so all children (subtasks) remain attached automatically.
  
  var updates = {
    type: TASK_TYPE.PROJECT,
    status: 'active' // Ensure it's active
  };
  
  // We can also clear contexts if projects shouldn't have them, 
  // but keeping them might be useful? Let's keep them for flexibility.
  
  var result = TaskService.updateTask(taskId, updates);
  
  if (result.success) {
    // Return formatted as a project for the frontend
    return { success: true, project: ProjectService.getProject(taskId) };
  } else {
    return result;
  }
}

/**
 * Delete a task
 */
function deleteTask(taskId) {
  return TaskService.deleteTask(taskId);
}

/**
 * Create a project
 */
function createProject(projectData) {
  return ProjectService.createProject(projectData);
}

/**
 * Update a project
 */
function updateProject(projectId, updates) {
  return ProjectService.updateProject(projectId, updates);
}

/**
 * Delete a project
 */
function deleteProject(projectId) {
  return ProjectService.deleteProject(projectId);
}

/**
 * Create a context
 */
function createContext(contextData) {
  return ContextService.createContext(contextData);
}

/**
 * Create an area
 */
function createArea(areaData) {
  return AreaService.createArea(areaData);
}

/**
 * Simple ping function to test if server calls work at all
 */
function ping() {
  return { 
    success: true, 
    timestamp: new Date().toISOString(),
    message: 'Server is responding'
  };
}

/**
 * Test function to check Sheet ID configuration
 */
/**
 * Test function to check Sheet ID configuration
 */
function testSheetConnection() {
  try {
    const sheetId = getSpreadsheetId();
    if (!sheetId) {
      return { 
        success: false, 
        error: 'SHEET_ID not configured. Run setSpreadsheetId(id) first.' 
      };
    }
    
    const ss = SpreadsheetApp.openById(sheetId);
    return { 
      success: true, 
      sheetName: ss.getName(),
      sheetUrl: ss.getUrl()
    };
  } catch (e) {
    return { 
      success: false, 
      error: 'Cannot access spreadsheet: ' + e.toString(),
      sheetId: getSpreadsheetId()
    };
  }
}

/**
 * Debug function to test reading tasks from the sheet
 */
function debugReadTasks() {
  var result = {
    sheetFound: false,
    rowCount: 0,
    headerRow: [],
    dataRows: [],
    parsedTasks: [],
    errors: []
  };
  
  try {
    var sheet = getSheet(SHEETS.TASKS);
    if (!sheet) {
      result.errors.push('Tasks sheet not found');
      return result;
    }
    result.sheetFound = true;
    
    var data = sheet.getDataRange().getValues();
    result.rowCount = data.length;
    
    if (data.length > 0) {
      result.headerRow = data[0];
    }
    
    // Show first 5 data rows (raw)
    for (var i = 1; i < Math.min(data.length, 6); i++) {
      result.dataRows.push({
        rowNum: i + 1,
        id: data[i][0],
        title: data[i][1],
        status: data[i][3],
        raw: data[i].slice(0, 5) // First 5 columns
      });
    }
    
    // Try to parse tasks
    for (var j = 1; j < data.length; j++) {
      try {
        var task = TaskService.rowToTask(data[j]);
        result.parsedTasks.push({
          id: task.id,
          title: task.title,
          status: task.status
        });
      } catch (e) {
        result.errors.push('Row ' + (j+1) + ': ' + e.toString());
      }
    }
    
  } catch (e) {
    result.errors.push('General error: ' + e.toString());
  }
  
  return result;
}

/**
 * Import MLO Data
 */
function importMloData(xmlContent) {
  return ImportService.importMloXml(xmlContent);
}

/**
 * Export completed items as CSV
 */
function exportCompletedItems() {
  var tasks = TaskService.getTasksByStatus(STATUS.DONE);
  var projects = ProjectService.getCompletedProjects();
  
  var csv = 'Type,Title,CompletedDate,Notes\n';
  
  projects.forEach(function(p) {
    var date = p.completedDate ? new Date(p.completedDate).toLocaleDateString() : '';
    // Escape quotes in title/notes
    var title = (p.name || '').replace(/"/g, '""');
    var notes = (p.description || '').replace(/"/g, '""');
    csv += '"Project","' + title + '","' + date + '","' + notes + '"\n';
  });
  
  tasks.forEach(function(t) {
    var date = t.completedDate ? new Date(t.completedDate).toLocaleDateString() : '';
    var title = (t.title || '').replace(/"/g, '""');
    var notes = (t.notes || '').replace(/"/g, '""');
    csv += '"Task","' + title + '","' + date + '","' + notes + '"\n';
  });
  return csv;
}

/**
 * Compact the database by removing completed/deleted items
 */
function compactDatabase() {
  if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
    return DatabaseService.compactDatabase();
  }

  var result = {
    tasksRemoved: 0,
    projectsRemoved: 0
  };
  
  // 1. Compact Tasks
  var taskSheet = getSheet(SHEETS.TASKS);
  var taskData = taskSheet.getDataRange().getValues();
  var taskHeader = taskData[0];
  var tasksToKeep = [taskHeader];
  
  for (var i = 1; i < taskData.length; i++) {
    var row = taskData[i];
    var status = row[TASK_COLS.STATUS]; 
    if (status !== 'done' && status !== 'deleted') {
      tasksToKeep.push(row);
    } else {
      result.tasksRemoved++;
    }
  }
  
  if (result.tasksRemoved > 0) {
    taskSheet.clear();
    taskSheet.getRange(1, 1, tasksToKeep.length, tasksToKeep[0].length).setValues(tasksToKeep);
  }
  
  // 2. Compact Projects (Legacy Sheet)
  // We keep this for now to clean up the old sheet if it still exists
  var projectSheet = getSheet(SHEETS.PROJECTS);
  if (projectSheet) {
      var projectData = projectSheet.getDataRange().getValues();
      if (projectData.length > 0) {
          var projectHeader = projectData[0];
          var projectsToKeep = [projectHeader];
          
          for (var j = 1; j < projectData.length; j++) {
            var pRow = projectData[j];
            var pStatus = pRow[3]; // Project status index
            
            if (pStatus !== 'completed' && pStatus !== 'dropped') {
              projectsToKeep.push(pRow);
            } else {
              result.projectsRemoved++;
            }
          }
          
          if (result.projectsRemoved > 0) {
            projectSheet.clear();
            projectSheet.getRange(1, 1, projectsToKeep.length, projectsToKeep[0].length).setValues(projectsToKeep);
          }
      }
  }
  
  return result;
}

/**
 * Run Data Migration (One-time)
 */
function runMigration() {
  // 1. Update Schema first
  MigrationService.updateSchema();
  // 2. Migrate Data
  return MigrationService.migrateProjectsToTasks();
}

/**
 * Update Schema Only
 */
function updateSchema() {
  return MigrationService.updateSchema();
}

/**
 * Import emails from Gmail
 */
function importGmailTasks() {
  return GmailService.importToProcessEmails();
}

/**
 * Scan Inbox for AI suggestions
 * Can be run manually or via time-based trigger
 */
function scanInboxForSuggestions() {
  return GmailService.scanInboxForSuggestions();
}

/**
 * Wrapper to create a task from client side
 * needed because createTask is not exposed directly
 */
function createTaskWrapper(taskData) {
  var task = TaskService.createTask({
    title: taskData.title,
    notes: taskData.notes,
    status: taskData.status,
    // Phase 1: Map projectId to parentTaskId
    parentTaskId: taskData.parentTaskId || taskData.projectId,
    contextId: taskData.contextId,
    energyRequired: taskData.energyRequired,
    timeEstimate: taskData.timeEstimate,
    waitingFor: taskData.waitingFor,
    dueDate: taskData.dueDate,
    scheduledDate: taskData.scheduledDate,
    parentTaskId: taskData.parentTaskId, // Allow creating subtasks if needed
    type: taskData.type, // Should always be 'task' here but good to pass
    importance: taskData.importance,
    urgency: taskData.urgency,
    isStarred: taskData.isStarred
  });
  return { success: true, task: task };
}

/**
 * Wrapper for Batch Creation
 */
function createTaskBatchWrapper(tasks) {
  if (!tasks || !tasks.length) return { success: true, count: 0 };
  
  var count = 0;
  for (var i = 0; i < tasks.length; i++) {
    try {
      TaskService.createTask({
        title: tasks[i].title,
        notes: tasks[i].notes,
        status: 'inbox',
        type: 'task',
        importance: tasks[i].importance || '',
        urgency: tasks[i].urgency || ''
      });
      count++;
    } catch (e) {
      console.error('Batch Create Error at index ' + i + ': ' + e);
    }
  }
  return { success: true, count: count };
}

/**
 * Setup/View API Secret for Quick Capture
 * Run this function manually to see your API Key
 */
function setupApiSecret() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('API_SECRET');
  
  if (!secret) {
    secret = Utilities.getUuid();
    props.setProperty('API_SECRET', secret);
    Logger.log('Generated NEW API Secret: ' + secret);
  } else {
    Logger.log('Current API Secret: ' + secret);
  }
  
  Logger.log('Quick Capture URL: ' + ScriptApp.getService().getUrl());
  Logger.log('Use this in iOS Shortcuts/Zapier/curl with JSON: {"key": "...", "title": "..."}');
  return secret;
}

/**
 * AI Smart Categorization Wrapper
 * Called by client to infer metadata from text.
 */
function analyzeTaskWrapper(text) {
  // 1. Get Context (Projects & Contexts)
  // We only send minimal data (id + name) to save tokens context window
  var projects = ProjectService.getActiveProjects().map(function(p) {
    return { id: p.id, name: p.name };
  });
  
  var contexts = ContextService.getAllContexts().map(function(c) {
    return { id: c.id, name: c.name };
  });

  // 2. Call Gemini
  var analysis = GeminiService.analyzeTaskString(text, contexts, projects);
  
  return analysis;
}

/**
 * Wrapper to convert a task to a project (User Request)
 */
function convertTaskToProjectWrapper(id) {
  var result = TaskService.updateTask(id, {
    type: 'project',
    status: 'active'
  });
  return result;
}

/**
 * Helper to get the script URL for frontend navigation
 */
function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * Wrapper to mark an item as reviewed
 */
function markReviewedWrapper(id) {
    var today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return TaskService.updateTask(id, {
        lastReviewed: today
    });
}

function checkDatabaseIntegrity() {
  return TaskService.checkDatabaseIntegrity();
}

function fixDatabaseIntegrity() {
  return TaskService.fixDatabaseIntegrity();
}

function synthesizeAllContexts(startIndex) {
  return AIAgentService.synthesizeAllContexts(startIndex);
}

function getSynthesisProgress() {
  return AIAgentService.getSynthesisProgress();
}

/**
 * Enterprise Database Migration Route
 */
function migrateToCloudSql() {
  return DatabaseService.migrateFromSheetsToSql();
}

/**
 * Executes a nightly database backup to a JSON file in Google Drive.
 * This should be scheduled by a time-driven trigger.
 */
function executeNightlyBackup() {
  return BackupService.runNightlyBackup();
}

/**
 * One-time setup utility to programmatically register the nightly backup trigger.
 * Run this function manually from the Apps Script editor.
 */
function setupBackupTrigger() {
  return BackupService.setupTrigger();
}

/**
 * Diagnostic tool to bench SQL latency and expose hidden timeout errors
 * Run this directly from the backend editor to instantly see why it is hanging!
 */
function testSqlSpeed() {
  Logger.log("Starting SQL Speed Test...");
  const start = Date.now();
  
  if (typeof USE_SQL_BACKEND === 'undefined' || !USE_SQL_BACKEND) {
    Logger.log("ABORT: USE_SQL_BACKEND is set to false in Config.gs!");
    return;
  }
  
  try {
    Logger.log("1. Connecting to Cloud SQL Proxy...");
    const connStart = Date.now();
    const conn = DatabaseService.getConnection();
    Logger.log(`-> Connection established in ${Date.now() - connStart}ms!`);
    
    Logger.log("2. Testing Unified Payload method...");
    
    // Clear out any frontend payload cache from when it was repeatedly failing, to force the UI to fetch!
    try { CacheService.getUserCache().remove('gtd_all_data'); } catch(e){}
    const payloadStart = Date.now();
    const payload = DatabaseService.getAllDataPayload();
    Logger.log(`-> Payload fetched in ${Date.now() - payloadStart}ms!`);
    
    Logger.log(`Total tasks found: ${payload.tasks ? payload.tasks.length : 'undefined/error'}`);
    Logger.log(`Total settings found: ${payload.settings ? Object.keys(payload.settings).length : 'undefined/error'}`);
    
    Logger.log(`SUCCESS! Total Execution Time: ${Date.now() - start}ms`);
    return payload;
  } catch (e) {
    Logger.log(`FATAL ERROR AFTER ${Date.now() - start}ms: ` + e.toString());
    throw e;
  }
}

/**
 * Utility to instantly fix missing tables ("Table 'gtd.settings' doesn't exist")
 * without needing to rerun the entire Sheet Migration process.
 */
function forceRebuildSchema() {
  const result = DatabaseService.initSchema();
  if (result.success) {
    Logger.log("SUCCESS! All tables built.");
    syncSettingsFromSheets(); // Automatically populate config
  } else {
    Logger.log("FAILED to build schema: " + result.error);
  }
}

/**
 * Syncs the Config properties (like AI Contexts) directly from Google Sheets
 * deeply into the active SQL DB without overwriting active tasks.
 */
function syncSettingsFromSheets() {
  Logger.log("Synchronizing settings from Google Sheets...");
  try {
      const id = getSpreadsheetId();
      if (!id) return;
      const sheet = SpreadsheetApp.openById(id).getSheetByName(SHEETS.SETTINGS);
      if (!sheet) {
          Logger.log("No Settings sheet found.");
          return;
      }
      
      const data = sheet.getDataRange().getValues();
      const settings = {};
      
      for (let i = 1; i < data.length; i++) {
        const key = data[i][0];
        const value = data[i][1];
        if (key) settings[key] = value;
      }
      
      const conn = DatabaseService.getConnection();
      // Use REPLACE INTO (MySQL) to gracefully overwrite missing/corrupted settings keys
      const isPg = (PropertiesService.getScriptProperties().getProperty('DB_TYPE') || 'postgresql') === 'postgresql';
      const insertQuery = isPg ? 
         `INSERT INTO settings (config_key, config_value) VALUES (?, ?) ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value` :
         `REPLACE INTO settings (config_key, config_value) VALUES (?, ?)`;
         
      const setStmt = conn.prepareStatement(insertQuery);
      
      let count = 0;
      Object.keys(settings).forEach(key => {
        setStmt.setString(1, key);
        setStmt.setString(2, settings[key]);
        setStmt.addBatch();
        count++;
      });
      if (count > 0) setStmt.executeBatch();
      setStmt.close();
      Logger.log(`Successfully mapped ${count} AI routing/config settings to the DB!`);
  } catch(e) {
      Logger.log("Error migrating local settings: " + e.message);
  }
}

/**
 * Diagnostic tool to check AI Button processing
 */
function testAiCommand() {
  Logger.log("Testing AI suggestAlignmentForInbox...");
  try {
    const tasks = DatabaseService.getAllItems().filter(t => t.status === 'inbox');
    if (tasks.length === 0) {
      Logger.log("No inbox tasks found in the SQL Database to test with! Create one first.");
      return;
    }
    const targetId = tasks[0].id;
    Logger.log("Routing Task ID: " + targetId + " | Title: " + tasks[0].title);
    
    const result = suggestAlignmentForInbox([targetId]);
    Logger.log("AI Result: " + JSON.stringify(result, null, 2));
  } catch(e) {
    Logger.log("Fatal Exception: " + e.message + "\\n" + e.stack);
  }
}

/**
 * Diagnostic tool to wipe stale Model Caches and safely Auto-Discover the correct Paid API endpoint model
 */
function checkGeminiDebug() {
    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      Logger.log("ERROR: No GEMINI_API_KEY found in Script Properties!");
      return;
    }
    
    Logger.log("1. Wiping Stale Model Caches to force Google to re-evaluate available paid models...");
    props.deleteProperty('GEMINI_MODEL');
    props.deleteProperty('CACHED_GEMINI_MODEL');
    
    try {
      Logger.log("2. Polling API Key for available provisioned models...");
      const listResp = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey, {muteHttpExceptions: true});
      const data = JSON.parse(listResp.getContentText());
      if (!data.models) {
          Logger.log("API List failed: " + listResp.getContentText());
          return;
      }
      
      let validModels = data.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'));
      Logger.log("Available GenerateContent Models found: " + validModels.length);
      
      // Look for latest flash proxy or stable pro
      let targetModel = validModels.find(m => m.name.includes('gemini-1.5-flash-latest') || m.name.includes('gemini-2.0-flash')) || validModels[0];
      Logger.log("Selected target model for test: " + targetModel.name);
      
      const url = "https://generativelanguage.googleapis.com/v1beta/" + targetModel.name + ":generateContent?key=" + apiKey;
      const payload = { contents: [{ parts: [{ text: "Hello!" }] }] };
      
      Logger.log("3. Sending diagnostic PING to " + targetModel.name + "...");
      const resp = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      
      const code = resp.getResponseCode();
      Logger.log("HTTP Response Code: " + code);
      
      if (code === 429) {
          Logger.log("CRITICAL 429 QUOTA ERROR DETECTED ON TARGET MODEL.");
          Logger.log("Google Cloud has hard-locked this Paid Key to Zero Queries-Per-Minute. You must request a quota increase in GCP Console for Generative Language API.");
      } else if (code === 404) {
          Logger.log("CRITICAL 404 PATH ERROR. Model name resolution failed natively: " + resp.getContentText());
      } else if (code === 200) {
          Logger.log("SUCCESS! The API Call worked perfectly and returned: " + resp.getContentText().substring(0, 150) + "...");
      } else {
          Logger.log("UNKNOWN ERROR: " + resp.getContentText());
      }
    } catch(e) {
      Logger.log("Execution Crash: " + e.message);
    }
}



