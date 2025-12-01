/**
 * GTD System - Main Entry Point
 * Handles web app routing and initialization
 */

/**
 * Serves the web app
 */
function doGet(e) {
  var params = e ? e.parameter : {};
  var page = params.page || 'inbox';
  
  if (page === 'debug') {
    return HtmlService.createHtmlOutputFromFile('DebugPage')
      .setTitle('GTD Debug')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('GTD System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
 * Get all data for initial load
 */
function getAllData() {
  Logger.log('getAllData() called');
  try {
    const data = {
      tasks: TaskService.getAllTasks(),
      projects: ProjectService.getAllProjects(),
      contexts: ContextService.getAllContexts(),
      areas: AreaService.getAllAreas(),
      settings: getSettings()
    };
    Logger.log('getAllData() success, returning data keys: ' + Object.keys(data).join(', '));
    return data;
  } catch (e) {
    Logger.log('getAllData() error: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
    
    // If sheets don't exist, initialize first
    try {
      Logger.log('Attempting to initialize system...');
      initializeSystem();
      const data = {
        tasks: TaskService.getAllTasks(),
        projects: ProjectService.getAllProjects(),
        contexts: ContextService.getAllContexts(),
        areas: AreaService.getAllAreas(),
        settings: getSettings()
      };
      Logger.log('getAllData() success after init');
      return data;
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
  const sheet = getSheet(SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  const settings = {};
  
  for (let i = 1; i < data.length; i++) {
    settings[data[i][0]] = data[i][1];
  }
  
  return settings;
}

/**
 * Update a setting
 */
function updateSetting(key, value) {
  const sheet = getSheet(SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return { success: true };
    }
  }
  
  // Setting doesn't exist, add it
  sheet.appendRow([key, value]);
  return { success: true };
}

/**
 * Quick capture - add to inbox
 */
function quickCapture(title, notes) {
  var parentId = '';
  
  // Find Inbox task to use as parent
  var tasks = TaskService.getAllTasks();
  var inboxTask = tasks.find(function(t) { 
    return t.title === '<Inbox>' || t.title === 'Inbox'; 
  });
  
  if (inboxTask) {
    parentId = inboxTask.id;
  }

  return TaskService.createTask({
    title: title,
    notes: notes || '',
    status: STATUS.INBOX,
    parentTaskId: parentId
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
  return TaskService.updateTask(taskId, updates);
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
function convertTaskToProject(taskId) {
  var task = TaskService.getTask(taskId);
  if (!task) return { success: false, error: 'Task not found' };
  
  // 1. Create Project
  var projectData = {
    name: task.title,
    description: task.notes,
    status: 'active',
    areaId: '', // Could inherit context mapping if we had it, but blank is safer
    dueDate: task.dueDate
  };
  
  var newProject = ProjectService.createProject(projectData);
  
  // 2. Move Children
  var allTasks = TaskService.getAllTasks();
  var children = allTasks.filter(function(t) { return t.parentTaskId === taskId; });
  
  children.forEach(function(child) {
    TaskService.updateTask(child.id, {
      parentTaskId: '', // Clear parent task
      projectId: newProject.id // Set new project
    });
  });
  
  // 3. Delete Original Task
  // We use hard delete here because we are "moving" it to a project
  TaskService.hardDeleteTask(taskId);
  
  return { success: true, project: newProject };
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
  
  // 2. Compact Projects
  var projectSheet = getSheet(SHEETS.PROJECTS);
  var projectData = projectSheet.getDataRange().getValues();
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
    projectSheet.getRange(2, 1, projectsToKeep.length - 1, projectsToKeep[0].length).setValues(projectsToKeep.slice(1));
  }
  
  return result;
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
 * Debug: List available Gemini models
 */
function listGeminiModels() {
  return AIService.listAvailableModels();
}