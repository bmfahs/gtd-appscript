/**
 * GTD System - Import Service
 * Handles importing data from external sources (MLO XML)
 */

const ImportService = {

  /**
   * Import MLO XML Data
   * @param {string} xmlContent - The raw XML string
   */
  importMloXml: function(xmlContent) {
    try {
      const cleanXml = this.sanitizeXml(xmlContent);
      const document = XmlService.parse(cleanXml);
      const root = document.getRootElement();
      const taskTree = root.getChild('TaskTree');
      
      if (!taskTree) {
        return { success: false, error: 'Invalid XML: No TaskTree found' };
      }
      
      const nodes = taskTree.getChildren('TaskNode');
      const results = {
        tasksCreated: 0,
        projectsCreated: 0,
        contextsCreated: 0,
        skipped: 0,
        errors: []
      };
      
      Logger.log('Starting import of ' + nodes.length + ' top-level nodes');
      
      // Cache existing contexts to avoid repeated lookups
      const contextCache = {};
      ContextService.getAllContexts().forEach(c => contextCache[c.name.toLowerCase()] = c);
      
      // Batch containers
      const tasksToCreate = [];
      const projectsToCreate = [];
      
      nodes.forEach(node => {
        this.processNode(node, null, null, results, contextCache, tasksToCreate, projectsToCreate);
      });
      
      Logger.log('Tasks to create: ' + tasksToCreate.length);
      if (tasksToCreate.length > 0) {
        Logger.log('First task sample: ' + JSON.stringify(tasksToCreate[0]));
        const taskSheet = getSheet(SHEETS.TASKS);
        const taskRows = tasksToCreate.map(t => objectToRow(t, TASK_COLS));
        Logger.log('First task row sample: ' + JSON.stringify(taskRows[0]));
        taskSheet.getRange(taskSheet.getLastRow() + 1, 1, taskRows.length, taskRows[0].length).setValues(taskRows);
      }
      
      if (projectsToCreate.length > 0) {
        const projectSheet = getSheet(SHEETS.PROJECTS);
        const projectRows = projectsToCreate.map(p => objectToRow(p, PROJECT_COLS));
        projectSheet.getRange(projectSheet.getLastRow() + 1, 1, projectRows.length, projectRows[0].length).setValues(projectRows);
      }
      
      Logger.log('Import completed. Results: ' + JSON.stringify(results));
      return { success: true, results: results };
      
    } catch (e) {
      Logger.log('Import Error: ' + e.toString());
      return { success: false, error: e.toString() };
    }
  },

  /**
   * Recursive function to process a TaskNode
   */
  processNode: function(node, parentTaskId, currentProjectId, results, contextCache, tasksToCreate, projectsToCreate) {
    let caption = 'Unknown';
    try {
      // Caption is an attribute, not a child element
      const captionAttr = node.getAttribute('Caption');
      if (captionAttr) {
        caption = captionAttr.getValue();
      }
      
      // Skip empty nodes (often root containers), but process their children
      if (!caption || caption.trim() === '') {
        const children = node.getChildren('TaskNode');
        children.forEach(child => {
          this.processNode(child, parentTaskId, currentProjectId, results, contextCache, tasksToCreate, projectsToCreate);
        });
        return;
      }
      
      // Promote to project if it is one OR contains one
      const isProject = this.isOrContainsProject(node);
      const note = node.getChildText('Note');
      
      // Handle Contexts (Places)
      let contextId = '';
      const placesNode = node.getChild('Places');
      if (placesNode) {
        const place = placesNode.getChildText('Place');
        if (place) {
          contextId = this.getOrCreateContextId(place, results, contextCache);
        }
      }
      
      // Dates
      const dueDate = this.parseMloDate(node.getChildText('DueDateTime'));
      const startDate = this.parseMloDate(node.getChildText('StartDateTime'));
      const completedDate = this.parseMloDate(node.getChildText('CompletionDateTime'));
      
      // Determine Status
      let status = STATUS.INBOX;
      if (completedDate) {
        status = STATUS.DONE;
      } else if (startDate && new Date(startDate) > new Date()) {
        status = STATUS.SCHEDULED;
      } else if (dueDate) {
        status = STATUS.NEXT;
      }
      
      let newProjectId = currentProjectId;
      let newTaskId = null;
      const timestamp = now();
      
      if (isProject) {
        // Create Project Object
        const projectId = generateUUID();
        const projectData = {
          id: projectId,
          name: caption,
          description: note || '',
          status: completedDate ? PROJECT_STATUS.COMPLETED : PROJECT_STATUS.ACTIVE,
          areaId: '', // Default
          dueDate: dueDate,
          createdDate: timestamp,
          completedDate: completedDate ? formatDateTime(new Date(completedDate)) : '',
          sortOrder: 0, // Default
          parentProjectId: currentProjectId || ''
        };
        
        projectsToCreate.push(projectData);
        results.projectsCreated++;
        newProjectId = projectId;
        
      } else {
        // Create Task Object
        const taskId = generateUUID();
        const taskData = {
          id: taskId,
          title: caption,
          notes: note || '',
          status: status,
          projectId: currentProjectId || '',
          contextId: contextId,
          waitingFor: '',
          dueDate: dueDate,
          scheduledDate: startDate,
          completedDate: completedDate ? formatDateTime(new Date(completedDate)) : '',
          createdDate: timestamp,
          modifiedDate: timestamp,
          emailId: '',
          emailThreadId: '',
          priority: 0,
          energyRequired: ENERGY.MEDIUM,
          timeEstimate: '',
          parentTaskId: parentTaskId || '',
          sortOrder: 0
        };
        
        tasksToCreate.push(taskData);
        results.tasksCreated++;
        newTaskId = taskId;
      }
      
      // Process Children
      const children = node.getChildren('TaskNode');
      children.forEach(child => {
        this.processNode(child, newTaskId, newProjectId, results, contextCache, tasksToCreate, projectsToCreate);
      });
      
    } catch (err) {
      results.errors.push('Failed to process node "' + caption + '": ' + err.toString());
      results.skipped++;
    }
  },

  /**
   * Check if node is a project or contains sub-projects
   */
  isOrContainsProject: function(node) {
    // Check explicit flags
    if (node.getChildText('IsProject') === '-1' || node.getChildText('IsProject') === 'true') return true;
    if (node.getAttribute('IsFolder') === 'true' || node.getChildText('IsFolder') === 'true') return true;
    
    // Recursive check: If it contains a project, it should be treated as a project (container)
    const children = node.getChildren('TaskNode');
    for (let i = 0; i < children.length; i++) {
      if (this.isOrContainsProject(children[i])) {
        return true;
      }
    }
    
    return false;
  },

  /**
   * Get or create context
   */
  getOrCreateContextId: function(contextName, results, contextCache) {
    const key = contextName.toLowerCase();
    if (contextCache[key]) {
      return contextCache[key].id;
    }
    
    // Create new context
    // NOTE: We can't easily batch this because we need the ID immediately for the cache.
    // Since contexts are few, we can create them one by one.
    try {
      const newContext = ContextService.createContext({ name: contextName, icon: '🏷️' });
      contextCache[key] = newContext;
      results.contextsCreated++;
      return newContext.id;
    } catch (e) {
      return '';
    }
  },

  /**
   * Parse MLO date format (2023-10-27T10:00:00)
   */
  parseMloDate: function(dateStr) {
    if (!dateStr) return '';
    // MLO: 2023-10-27T10:00:00
    // Google: yyyy-MM-dd
    try {
      return dateStr.split('T')[0];
    } catch (e) {
      return '';
    }
  },
  
  /**
   * Sanitize XML string
   */
  sanitizeXml: function(xml) {
    if (!xml) return '';
    // Remove potential BOM
    xml = xml.replace(/^\uFEFF/, '');
    // Remove control characters 0-31 except 9 (tab), 10 (LF), 13 (CR)
    // Also remove 127 (DEL)
    return xml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }
};
