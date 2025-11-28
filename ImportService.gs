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
      
      nodes.forEach(node => {
        this.processNode(node, null, null, results, contextCache);
      });
      
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
  processNode: function(node, parentTaskId, currentProjectId, results, contextCache) {
    let caption = 'Unknown';
    try {
      caption = node.getChildText('Caption');
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
      } else if (isProject) {
        // Projects don't have task status usually, but we need one if it's treated as a task too?
        // In this system, Projects are separate entities.
      }
      
      let newProjectId = currentProjectId;
      let newTaskId = null;
      
      if (isProject) {
        // Create Project
        const projectData = {
          name: caption,
          description: note || '',
          status: completedDate ? PROJECT_STATUS.COMPLETED : PROJECT_STATUS.ACTIVE,
          dueDate: dueDate,
          createdDate: now(), // MLO doesn't seem to have created date easily accessible in this snippet
          parentProjectId: currentProjectId || ''
        };
        
        if (completedDate) {
          projectData.completedDate = formatDateTime(new Date(completedDate));
        }
        
        try {
            const project = ProjectService.createProject(projectData);
            newProjectId = project.id;
            results.projectsCreated++;
        } catch (err) {
            results.errors.push('Failed to create project "' + caption + '": ' + err.toString());
            results.skipped++;
            return; // Stop processing children if parent failed? Maybe continue?
            // If project creation failed, we can't link children to it.
            // Let's continue but children won't have this project ID if we don't handle it.
            // Actually, if project failed, newProjectId is null (or previous).
        }
        
      } else {
        // Create Task
        const taskData = {
          title: caption,
          notes: note || '',
          status: status,
          projectId: currentProjectId || '',
          contextId: contextId,
          dueDate: dueDate,
          scheduledDate: startDate,
          parentTaskId: parentTaskId || ''
        };
        
        try {
            const task = TaskService.createTask(taskData);
            newTaskId = task.id;
            
            if (completedDate) {
              TaskService.updateTask(task.id, { 
                status: STATUS.DONE, 
                completedDate: formatDateTime(new Date(completedDate)) 
              });
            }
            
            results.tasksCreated++;
        } catch (err) {
             results.errors.push('Failed to create task "' + caption + '": ' + err.toString());
             results.skipped++;
             return; // Stop processing children if parent failed
        }
      }
      
      // Process Children
      const children = node.getChildren('TaskNode');
      children.forEach(child => {
        this.processNode(child, newTaskId, newProjectId, results, contextCache);
      });
      
    } catch (e) {
      Logger.log('Error processing node "' + caption + '": ' + e.toString());
      results.errors.push('Error processing node "' + caption + '": ' + e.toString());
      results.skipped++;
    }
  },

  /**
   * Get or create context by name
   */
  getOrCreateContextId: function(name, results, contextCache) {
    if (!name) return '';
    
    // Clean name (remove @ or ! prefix often used in MLO)
    const cleanName = name.replace(/^[@!]/, '').trim();
    const key = cleanName.toLowerCase();
    
    if (contextCache[key]) {
      return contextCache[key].id;
    }
    
    // Create new context
    const newContext = ContextService.createContext({
      name: cleanName,
      icon: '🏷️' // Default icon
    });
    
    contextCache[key] = newContext;
    results.contextsCreated++;
    return newContext.id;
  },

  /**
   * Parse MLO date string (ISO 8601ish) to YYYY-MM-DD
   */
  parseMloDate: function(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return formatDate(date);
    } catch (e) {
      return '';
    }
  },

  /**
   * Remove invalid XML characters
   */
  sanitizeXml: function(xml) {
    if (!xml) return '';
    // Remove control characters 0-31 except 9 (tab), 10 (LF), 13 (CR)
    // Also remove 127 (DEL)
    return xml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  },

  /**
   * Check if node is a project or contains any projects recursively
   */
  isOrContainsProject: function(node) {
    if (node.getChildText('IsProject') === '-1') {
      return true;
    }
    const children = node.getChildren('TaskNode');
    for (let i = 0; i < children.length; i++) {
      if (this.isOrContainsProject(children[i])) {
        return true;
      }
    }
    return false;
  }
};
