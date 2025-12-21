/**
 * GTD System - Task Service
 * Handles all task CRUD operations
 */

const TaskService = {
  
  /**
   * Get all tasks (excluding deleted)
   */
  /**
   * Get all items (tasks and projects)
   */
  getAllItems: function() {
    var sheet = getSheet(SHEETS.TASKS);
    if (!sheet) {
      Logger.log('Tasks sheet not found!');
      return [];
    }
    
    var data = sheet.getDataRange().getValues();
    Logger.log('Tasks sheet has ' + data.length + ' rows');
    
    var items = [];
    
    for (var i = 1; i < data.length; i++) {
      try {
        var item = this.rowToTask(data[i]);
        if (item.status !== STATUS.DELETED) {
            items.push(item);
        }
      } catch (e) {
        Logger.log('Error parsing row ' + i + ': ' + e.toString());
      }
    }
    
    return items;
  },

  /**
   * Get all tasks (excluding projects and deleted)
   */
  getAllTasks: function() {
    return this.getAllItems().filter(t => t.type === TASK_TYPE.TASK || !t.type);
  },
  
  /**
   * Get tasks by status
   */
  getTasksByStatus: function(status) {
    return this.getAllTasks().filter(t => t.status === status);
  },

  /**
   * Get items by type
   */
  getItemsByType: function(type) {
    return this.getAllItems().filter(t => t.type === type);
  },
  
  /**
   * Get tasks by project
   */
  getTasksByProject: function(projectId) {
    // Phase 1: Filter by parentTaskId
    return this.getAllTasks().filter(t => t.parentTaskId === projectId);
  },
  
  /**
   * Get tasks by context
   */
  getTasksByContext: function(contextId) {
    return this.getAllTasks().filter(t => t.contextId === contextId);
  },
  
  /**
   * Get a single task by ID
   */
  getTask: function(taskId) {
    const sheet = getSheet(SHEETS.TASKS);
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][TASK_COLS.ID] === taskId) {
        return this.rowToTask(data[i]);
      }
    }
    
    return null;
  },
  
  /**
   * Create a new task
   */
  createTask: function(taskData) {
    const sheet = getSheet(SHEETS.TASKS);
    const timestamp = now();
    
    const task = {
      id: generateUUID(),
      title: taskData.title || '',
      notes: taskData.notes || '',
      status: taskData.status || STATUS.INBOX,
      // Phase 1: Map projectId input to parentTaskId if provided
      projectId: taskData.parentTaskId || taskData.projectId || '', // Legacy prop mapped to new source
      contextId: taskData.contextId || '',
      waitingFor: taskData.waitingFor || '',
      dueDate: taskData.dueDate || '',
      scheduledDate: taskData.scheduledDate || '',
      completedDate: '',
      createdDate: timestamp,
      modifiedDate: timestamp,
      emailId: taskData.emailId || '',
      emailThreadId: taskData.emailThreadId || '',
      priority: 0,
      energyRequired: taskData.energyRequired || ENERGY.MEDIUM,
      timeEstimate: taskData.timeEstimate || '',
      // Phase 1: Prefer parentTaskId, fallback to projectId input
      parentTaskId: taskData.parentTaskId || taskData.projectId || '',
      sortOrder: taskData.sortOrder || this.getNextSortOrder(),
      type: taskData.type || TASK_TYPE.TASK,
      areaId: taskData.areaId || ''
    };
    
    // Calculate priority if it's a task
    if (task.type === TASK_TYPE.TASK) {
        task.priority = PriorityService.calculatePriority(task);
    }
    
    const row = this.taskToRow(task);
    sheet.appendRow(row);
    
    return task;
  },
  
  /**
   * Update an existing task
   */
  updateTask: function(taskId, updates) {
    // Need to handle variable column length if schema updated but data not migrated fully?
    // Assuming Config.gs TASK_COLS matches the sheet columns after updateSchema is run.
    const sheet = getSheet(SHEETS.TASKS);
    const rowNum = findRowById(sheet, taskId, TASK_COLS.ID);
    
    if (rowNum === -1) {
      return { success: false, error: 'Task not found' };
    }
    
    // Get all columns based on Config
    const numCols = Object.keys(TASK_COLS).length;
    // We protect against reading more columns than exist
    const maxCols = sheet.getLastColumn();
    const readCols = Math.min(numCols, maxCols);
    
    const data = sheet.getRange(rowNum, 1, 1, readCols).getValues()[0];
    const task = this.rowToTask(data);
    
    // Apply updates
    Object.assign(task, updates);
    task.modifiedDate = now();
    
    // Handle completion
    if (updates.status === STATUS.DONE && !task.completedDate) {
      task.completedDate = now();
    }
    
    // Recalculate priority
    if (task.type === TASK_TYPE.TASK) {
        task.priority = PriorityService.calculatePriority(task);
    }
    
    const row = this.taskToRow(task);
    
    // Safety: Ensure sheet has enough columns
    const currentMaxCols = sheet.getLastColumn();
    if (row.length > currentMaxCols) {
        const missing = row.length - currentMaxCols;
        sheet.insertColumnsAfter(currentMaxCols, missing);
        // Optionally update headers here if we knew them, but appendRow usually handles it for data
    }

    // Write back. 
    // MigrationService.updateSchema() should be run first preferably, but this handles lazy expansion.
    sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
    
    return { success: true, task: task };
  },
  
  /**
   * Delete a task (soft delete)
   */
  deleteTask: function(taskId) {
    return this.updateTask(taskId, { status: STATUS.DELETED });
  },
  
  /**
   * Permanently delete a task
   */
  hardDeleteTask: function(taskId) {
    const sheet = getSheet(SHEETS.TASKS);
    const rowNum = findRowById(sheet, taskId, TASK_COLS.ID);
    
    if (rowNum === -1) {
      return { success: false, error: 'Task not found' };
    }
    
    sheet.deleteRow(rowNum);
    return { success: true };
  },
  
  /**
   * Mark task as complete
   */
  completeTask: function(taskId) {
    return this.updateTask(taskId, { 
      status: STATUS.DONE,
      completedDate: now()
    });
  },
  
  /**
   * Move task to different status
   */
  moveToStatus: function(taskId, newStatus) {
    return this.updateTask(taskId, { status: newStatus });
  },
  
  /**
   * Get next actions (grouped by context)
   */
  getNextActions: function() {
    const tasks = this.getTasksByStatus(STATUS.NEXT);
    const contexts = ContextService.getAllContexts();
    
    // Create context lookup
    const contextMap = {};
    contexts.forEach(c => contextMap[c.id] = c);
    
    // Group by context
    const grouped = {};
    tasks.forEach(task => {
      const contextId = task.contextId || 'none';
      if (!grouped[contextId]) {
        grouped[contextId] = {
          context: contextMap[contextId] || { id: 'none', name: 'No Context', icon: '📋' },
          tasks: []
        };
      }
      grouped[contextId].tasks.push(task);
    });
    
    // Sort tasks within each group by priority
    Object.values(grouped).forEach(group => {
      group.tasks.sort((a, b) => b.priority - a.priority);
    });
    
    return grouped;
  },
  
  /**
   * Get waiting for items
   */
  getWaitingFor: function() {
    return this.getTasksByStatus(STATUS.WAITING);
  },
  
  /**
   * Get scheduled items
   */
  getScheduled: function() {
    const tasks = this.getTasksByStatus(STATUS.SCHEDULED);
    return sortBy(tasks, 'scheduledDate', true);
  },
  
  /**
   * Get someday/maybe items
   */
  getSomeday: function() {
    return this.getTasksByStatus(STATUS.SOMEDAY);
  },
  
  /**
   * Get overdue tasks
   */
  getOverdue: function() {
    return this.getAllTasks().filter(task => {
      return task.status !== STATUS.DONE && 
             task.status !== STATUS.DELETED &&
             task.dueDate && 
             isOverdue(task.dueDate);
    });
  },
  
  /**
   * Get tasks due today
   */
  getDueToday: function() {
    return this.getAllTasks().filter(task => {
      return task.status !== STATUS.DONE && 
             task.status !== STATUS.DELETED &&
             task.dueDate && 
             isToday(task.dueDate);
    });
  },
  
  /**
   * Get subtasks of a task
   */
  getSubtasks: function(parentTaskId) {
    return this.getAllTasks().filter(t => t.parentTaskId === parentTaskId);
  },
  
  /**
   * Recalculate all task priorities
   */
  recalculateAllPriorities: function() {
    const sheet = getSheet(SHEETS.TASKS);
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
        // Only recalc for TASKS
      const type = data[i][TASK_COLS.TYPE] || TASK_TYPE.TASK;
      if (type !== TASK_TYPE.TASK) continue;

      const task = this.rowToTask(data[i]);
      if (task.status !== STATUS.DONE && task.status !== STATUS.DELETED) {
        const newPriority = PriorityService.calculatePriority(task);
        sheet.getRange(i + 1, TASK_COLS.PRIORITY + 1).setValue(newPriority);
      }
    }
    
    return { success: true, message: 'Priorities recalculated' };
  },
  
  /**
   * Get next sort order value
   */
  getNextSortOrder: function() {
    // Get max sort order from relevant items? Or global?
    // Let's use global to avoid collisions if we mix views
    const items = this.getAllItems();
    if (items.length === 0) return 1;
    
    const maxOrder = Math.max(...items.map(t => t.sortOrder || 0));
    return maxOrder + 1;
  },
  
  /**
   * Convert row array to task object
   */
  rowToTask: function(row) {
    if (!row || row.length === 0) {
      return { id: '', title: '', status: STATUS.INBOX };
    }
    
    return {
      id: row[TASK_COLS.ID] || '',
      title: row[TASK_COLS.TITLE] || '',
      notes: row[TASK_COLS.NOTES] || '',
      status: row[TASK_COLS.STATUS] || STATUS.INBOX,
      // Phase 1: Map projectId property to PARENT_TASK_ID column
      // This ensures legacy code reading .projectId gets the correct value
      projectId: row[TASK_COLS.PARENT_TASK_ID] || '', 
      contextId: row[TASK_COLS.CONTEXT_ID] || '',
      waitingFor: row[TASK_COLS.WAITING_FOR] || '',
      dueDate: safeFormatDate(row[TASK_COLS.DUE_DATE]),
      scheduledDate: safeFormatDate(row[TASK_COLS.SCHEDULED_DATE]),
      completedDate: formatDateTime(row[TASK_COLS.COMPLETED_DATE]),
      createdDate: formatDateTime(row[TASK_COLS.CREATED_DATE]),
      modifiedDate: formatDateTime(row[TASK_COLS.MODIFIED_DATE]),
      emailId: row[TASK_COLS.EMAIL_ID] || '',
      emailThreadId: row[TASK_COLS.EMAIL_THREAD_ID] || '',
      priority: row[TASK_COLS.PRIORITY] || 0,
      energyRequired: row[TASK_COLS.ENERGY_REQUIRED] || ENERGY.MEDIUM,
      timeEstimate: row[TASK_COLS.TIME_ESTIMATE] || '',
      parentTaskId: row[TASK_COLS.PARENT_TASK_ID] || '',
      sortOrder: row[TASK_COLS.SORT_ORDER] || 0,
      type: row[TASK_COLS.TYPE] || TASK_TYPE.TASK,
      areaId: row[TASK_COLS.AREA_ID] || '',
      importance: row[TASK_COLS.IMPORTANCE] || '',
      urgency: row[TASK_COLS.URGENCY] || '',
      isStarred: row[TASK_COLS.IS_STARRED] === true || row[TASK_COLS.IS_STARRED] === 'true'
    };
  },
  
  /**
   * Convert task object to row array
   */
  taskToRow: function(task) {
    // Ensure array is large enough for all columns
    const maxColIndex = Math.max(...Object.values(TASK_COLS));
    const row = new Array(maxColIndex + 1).fill('');
    
    row[TASK_COLS.ID] = task.id;
    row[TASK_COLS.TITLE] = task.title;
    row[TASK_COLS.NOTES] = task.notes;
    row[TASK_COLS.STATUS] = task.status;
    // Phase 1: Clear the projectId column (write empty string)
    // We do NOT write task.projectId here anymore.
    row[TASK_COLS.PROJECT_ID] = ''; 
    row[TASK_COLS.CONTEXT_ID] = task.contextId;
    row[TASK_COLS.WAITING_FOR] = task.waitingFor;
    row[TASK_COLS.DUE_DATE] = task.dueDate;
    row[TASK_COLS.SCHEDULED_DATE] = task.scheduledDate;
    row[TASK_COLS.COMPLETED_DATE] = task.completedDate;
    row[TASK_COLS.CREATED_DATE] = task.createdDate;
    row[TASK_COLS.MODIFIED_DATE] = task.modifiedDate;
    row[TASK_COLS.EMAIL_ID] = task.emailId;
    row[TASK_COLS.EMAIL_THREAD_ID] = task.emailThreadId;
    row[TASK_COLS.PRIORITY] = task.priority;
    row[TASK_COLS.ENERGY_REQUIRED] = task.energyRequired;
    row[TASK_COLS.TIME_ESTIMATE] = task.timeEstimate;
    row[TASK_COLS.PARENT_TASK_ID] = task.parentTaskId;
    row[TASK_COLS.SORT_ORDER] = task.sortOrder;
    row[TASK_COLS.TYPE] = task.type;
    row[TASK_COLS.AREA_ID] = task.areaId;
    row[TASK_COLS.IMPORTANCE] = task.importance;
    row[TASK_COLS.URGENCY] = task.urgency;
    row[TASK_COLS.IS_STARRED] = task.isStarred;
    return row;
  }
};