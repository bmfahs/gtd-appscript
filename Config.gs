/**
 * GTD System Configuration
 * Update these values for your setup
 */

// Spreadsheet ID management
function getSpreadsheetId() {
  return PropertiesService.getScriptProperties().getProperty('SHEET_ID');
}

function setSpreadsheetId(id) {
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', id);
  return { success: true, message: 'Spreadsheet ID updated' };
}

// Sheet names
const SHEETS = {
  TASKS: 'Tasks',
  PROJECTS: 'Projects',
  CONTEXTS: 'Contexts',
  AREAS: 'Areas',
  SETTINGS: 'Settings'
};

// Task statuses
const STATUS = {
  INBOX: 'inbox',
  NEXT: 'next',
  WAITING: 'waiting',
  SCHEDULED: 'scheduled',
  SOMEDAY: 'someday',
  REFERENCE: 'reference',
  DONE: 'done',
  DELETED: 'deleted'
};

// Energy levels
const ENERGY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

// Project statuses
const PROJECT_STATUS = {
  ACTIVE: 'active',
  SOMEDAY: 'someday',
  COMPLETED: 'completed',
  DROPPED: 'dropped'
};

// Task Types
const TASK_TYPE = {
  TASK: 'task',
  PROJECT: 'project',
  FOLDER: 'folder'
};

// Column indices for Tasks sheet (0-based)
// Column definition for Tasks sheet (used to generate indices)
// Column definition for Tasks sheet (used to generate indices)
// We detect if 'projectId' exists in the Sheet to determine which schema to use
const TASK_COLUMN_ORDER = (function() {
  const legacyOrder = [
    'ID', 'TITLE', 'NOTES', 'STATUS',
    'PROJECT_ID', // Legacy column
    'CONTEXT_ID', 'WAITING_FOR', 'DUE_DATE', 'SCHEDULED_DATE',
    'COMPLETED_DATE', 'CREATED_DATE', 'MODIFIED_DATE', 'EMAIL_ID',
    'EMAIL_THREAD_ID', 'PRIORITY', 'ENERGY_REQUIRED', 'TIME_ESTIMATE',
    'PARENT_TASK_ID', 'SORT_ORDER', 'TYPE', 'AREA_ID'
  ];
  
  const newOrder = [
    'ID', 'TITLE', 'NOTES', 'STATUS',
    // PROJECT_ID Removed
    'CONTEXT_ID', 'WAITING_FOR', 'DUE_DATE', 'SCHEDULED_DATE',
    'COMPLETED_DATE', 'CREATED_DATE', 'MODIFIED_DATE', 'EMAIL_ID',
    'EMAIL_THREAD_ID', 'PRIORITY', 'ENERGY_REQUIRED', 'TIME_ESTIMATE',
    'PARENT_TASK_ID', 'SORT_ORDER', 'TYPE', 'AREA_ID'
  ];
  
  try {
    // Attempt to detect schema from actual Sheet
    // Note: This runs every time the script loads.
    // If we can't access the sheet (e.g. auth mode, error), fallback to Legacy (safest).
    const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!sheetId) return legacyOrder;
    
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('Tasks'); // Hardcoded name to avoid circ ref with SHEETS constant
    if (!sheet) return legacyOrder;
    
    // Read only the header row (Row 1)
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Check if 'projectId' column exists
    const hasProjectId = headers.includes('projectId');
    
    return hasProjectId ? legacyOrder : newOrder;
    
  } catch (e) {
    // If any error occurs (e.g. permission issues in simple triggers), fallback to legacy
    Logger.log('Schema detection failed, using legacy: ' + e.toString());
    return legacyOrder;
  }
})();

// Generate indices dynamically
const TASK_COLS = TASK_COLUMN_ORDER.reduce((acc, key, index) => {
  acc[key] = index;
  // If we are in New Order, we might want to map PROJECT_ID to something?
  // No, code should check if TASK_COLS.PROJECT_ID is undefined if it wants to be robust,
  // but our Refactor (Phase 1) ensures we don't start reading/writing PROJECT_ID column index directly 
  // without reason. However, `row[TASK_COLS.PROJECT_ID]` will equal `row[undefined]` which is undefined. 
  return acc;
}, {});

// Column indices for Projects sheet (0-based) (Legacy/Backup)
const PROJECT_COLS = {
  ID: 0,
  NAME: 1,
  DESCRIPTION: 2,
  STATUS: 3,
  AREA_ID: 4,
  DUE_DATE: 5,
  CREATED_DATE: 6,
  COMPLETED_DATE: 7,
  SORT_ORDER: 8,
  PARENT_PROJECT_ID: 9
};

// Column indices for Contexts sheet (0-based)
const CONTEXT_COLS = {
  ID: 0,
  NAME: 1,
  ICON: 2,
  SORT_ORDER: 3
};

// Column indices for Areas sheet (0-based)
const AREA_COLS = {
  ID: 0,
  NAME: 1,
  ICON: 2,
  SORT_ORDER: 3
};

// Priority algorithm weights
const PRIORITY_WEIGHTS = {
  DUE_DATE: 20,
  PROJECT_IMPORTANCE: 15,
  CONTEXT_MATCH: 15,
  ENERGY_MATCH: 10,
  TIME_AVAILABLE: 10,
  AGE: 15,
  DEPENDENCIES: 15
};

/**
 * Get the spreadsheet instance
 */
function getSpreadsheet() {
  const id = getSpreadsheetId();
  if (!id) {
    throw new Error('Spreadsheet ID not set. Run setSpreadsheetId(id) first.');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Get a specific sheet by name
 */
function getSheet(sheetName) {
  return getSpreadsheet().getSheetByName(sheetName);
}