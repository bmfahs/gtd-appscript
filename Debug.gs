/**
 * Debug functions to test the system
 * Run these from the Apps Script editor to diagnose issues
 */

/**
 * Test 1: Can we access the spreadsheet?
 * Run this first to verify Sheet ID is correct
 */
function debugTestSpreadsheet() {
  try {
    const sheetId = getSpreadsheetId();
    if (!sheetId) {
      Logger.log('FAILED: Spreadsheet ID not set. Run setSpreadsheetId(id) first.');
      return { success: false, error: 'Spreadsheet ID not set' };
    }
    const ss = SpreadsheetApp.openById(sheetId);
    Logger.log('SUCCESS: Spreadsheet found: ' + ss.getName());
    Logger.log('URL: ' + ss.getUrl());
    
    // List all sheets
    const sheets = ss.getSheets();
    Logger.log('Sheets in this spreadsheet:');
    sheets.forEach(s => Logger.log('  - ' + s.getName()));
    
    return { success: true, name: ss.getName(), sheetCount: sheets.length };
  } catch (e) {
    Logger.log('FAILED: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Test 2: Can we read from Tasks sheet?
 */
function debugTestTasksSheet() {
  try {
    const sheet = getSheet(SHEETS.TASKS);
    if (!sheet) {
      Logger.log('FAILED: Tasks sheet not found. Run initializeSystem() first.');
      return { success: false, error: 'Tasks sheet not found' };
    }
    
    const data = sheet.getDataRange().getValues();
    Logger.log('SUCCESS: Tasks sheet has ' + data.length + ' rows (including header)');
    Logger.log('Headers: ' + data[0].join(', '));
    
    return { success: true, rowCount: data.length };
  } catch (e) {
    Logger.log('FAILED: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Test 3: Can TaskService work?
 */
function debugTestTaskService() {
  try {
    Logger.log('Testing TaskService.getAllTasks()...');
    const tasks = TaskService.getAllTasks();
    Logger.log('SUCCESS: Got ' + tasks.length + ' tasks');
    
    if (tasks.length > 0) {
      Logger.log('First task: ' + JSON.stringify(tasks[0]));
    }
    
    return { success: true, taskCount: tasks.length };
  } catch (e) {
    Logger.log('FAILED: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
    return { success: false, error: e.toString() };
  }
}

/**
 * Test 4: Can getAllData work?
 */
function debugTestGetAllData() {
  try {
    Logger.log('Testing getAllData()...');
    const data = getAllData();
    
    Logger.log('SUCCESS: getAllData returned:');
    Logger.log('  Tasks: ' + (data.tasks ? data.tasks.length : 'undefined'));
    Logger.log('  Projects: ' + (data.projects ? data.projects.length : 'undefined'));
    Logger.log('  Contexts: ' + (data.contexts ? data.contexts.length : 'undefined'));
    Logger.log('  Areas: ' + (data.areas ? data.areas.length : 'undefined'));
    Logger.log('  Settings: ' + JSON.stringify(data.settings));
    
    return { success: true, data: data };
  } catch (e) {
    Logger.log('FAILED: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
    return { success: false, error: e.toString() };
  }
}

/**
 * Test 5: Test quick capture
 */
function debugTestQuickCapture() {
  try {
    Logger.log('Testing quickCapture()...');
    const task = quickCapture('Debug test task ' + new Date().toISOString(), 'Created by debug test');
    
    Logger.log('SUCCESS: Created task:');
    Logger.log(JSON.stringify(task, null, 2));
    
    return { success: true, task: task };
  } catch (e) {
    Logger.log('FAILED: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
    return { success: false, error: e.toString() };
  }
}

/**
 * Run all tests
 */
function debugRunAllTests() {
  Logger.log('========================================');
  Logger.log('GTD System Debug Tests');
  Logger.log('========================================');
  Logger.log('');
  
  Logger.log('--- Test 1: Spreadsheet Access ---');
  debugTestSpreadsheet();
  Logger.log('');
  
  Logger.log('--- Test 2: Tasks Sheet ---');
  debugTestTasksSheet();
  Logger.log('');
  
  Logger.log('--- Test 3: TaskService ---');
  debugTestTaskService();
  Logger.log('');
  
  Logger.log('--- Test 4: getAllData ---');
  debugTestGetAllData();
  Logger.log('');
  
  Logger.log('--- Test 5: Quick Capture ---');
  debugTestQuickCapture();
  Logger.log('');
  
  Logger.log('========================================');
  Logger.log('Tests complete. Check logs above.');
  Logger.log('========================================');
}

/**
 * Find task by title
 */
function debugFindInboxTask() {
  const tasks = TaskService.getAllTasks();
  const inboxTasks = tasks.filter(t => t.title.toLowerCase().includes('inbox'));
  
  Logger.log('Found ' + inboxTasks.length + ' tasks with "Inbox" in title:');
  inboxTasks.forEach(t => {
    Logger.log('- [' + t.id + '] ' + t.title + ' (Status: ' + t.status + ')');
  });
  
  return inboxTasks;
}

/**
 * Inspect Projects sheet raw data
 */
function debugInspectProjectSheet() {
  const sheet = getSheet(SHEETS.PROJECTS);
  const data = sheet.getDataRange().getValues();
  
  Logger.log('--- Projects Sheet Inspection ---');
  Logger.log('Total Rows: ' + data.length);
  
  if (data.length > 0) {
    Logger.log('Headers: ' + JSON.stringify(data[0]));
    
    // Check first 5 rows
    const limit = Math.min(data.length, 6);
    for (let i = 1; i < limit; i++) {
      Logger.log('Row ' + i + ': ' + JSON.stringify(data[i]));
    }
  }
  
  // Helper to safely stringify values
  const safeData = data.slice(0, 6).map(row => row.map(cell => String(cell)));
  
  return {
    headers: safeData.length > 0 ? safeData[0] : [],
    sampleRows: safeData.slice(1)
  };
}

/**
 * Fix Project Sheet Headers
 */
function fixProjectHeaders() {
  const sheet = getSheet(SHEETS.PROJECTS);
  const headers = [
    'ID', 'Name', 'Description', 'Status', 'Area ID', 
    'Due Date', 'Created Date', 'Completed Date', 'Sort Order', 'Parent Project ID'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  return { success: true, message: 'Headers updated' };
}
