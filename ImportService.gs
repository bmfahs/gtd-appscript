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
      
      // Batch container
      const itemsToCreate = [];
      
      nodes.forEach(node => {
        this.processNode(node, null, null, results, contextCache, itemsToCreate, isInsideInbox);
      });
      
      Logger.log('Items to create: ' + itemsToCreate.length);
      if (itemsToCreate.length > 0) {
        // We use TaskService.taskToRow for everything now
        const taskSheet = getSheet(SHEETS.TASKS);
        const taskRows = itemsToCreate.map(t => TaskService.taskToRow(t));
        
        // Batch write
        taskSheet.getRange(taskSheet.getLastRow() + 1, 1, taskRows.length, taskRows[0].length).setValues(taskRows);
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
  processNode: function(node, parentTaskId, currentProjectId, results, contextCache, itemsToCreate, isInsideInbox = false) {
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
          this.processNode(child, parentTaskId, currentProjectId, results, contextCache, itemsToCreate, isInsideInbox);
        });
        return;
      }

      // Check if this is the <Inbox> folder
      // If so, all children are inside inbox
      let childIsInsideInbox = isInsideInbox;
      if (caption === '<Inbox>') {
        childIsInsideInbox = true;
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
      let status = STATUS.INBOX; // Default
      
      if (completedDate) {
        status = STATUS.DONE;
        // Map completed project status if needed, but 'done' is fine for unified model
      } else if (startDate && new Date(startDate) > new Date()) {
        status = STATUS.SCHEDULED;
      } else if (dueDate) {
        status = STATUS.NEXT;
      } else {
        // If inside <Inbox>, keep as Inbox. Otherwise default to Next Action.
        status = childIsInsideInbox ? STATUS.INBOX : STATUS.NEXT;
      }
      
      // If it's a project (and active), set status to active?
      if (isProject && !completedDate) {
          status = 'active'; // Project active status
      }
      
      const timestamp = now();
      const uuid = generateUUID();
      
      // Unified Object Model
      const itemData = {
        id: uuid,
        title: caption,
        notes: note || '',
        status: status,
        projectId: currentProjectId || '', // Linked to parent project (legacy concept, now usually managed via parentTaskId)
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
        parentTaskId: parentTaskId || '', // Main hierarchy link
        sortOrder: 0,
        type: isProject ? TASK_TYPE.PROJECT : TASK_TYPE.TASK,
        areaId: ''
      };
      
      itemsToCreate.push(itemData);
      
      if (isProject) {
          results.projectsCreated++;
      } else {
          results.tasksCreated++;
      }
      
      // For children, if this is a project, it becomes the "currentProjectId" (for legacy lookups) 
      // AND checks parentTaskId which is the structural parent.
      const nextProjectId = isProject ? uuid : currentProjectId;
      
      // Process Children
      const children = node.getChildren('TaskNode');
      children.forEach(child => {
        this.processNode(child, uuid, nextProjectId, results, contextCache, itemsToCreate, childIsInsideInbox);
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
