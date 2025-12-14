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
  PROJECT: 'project'
};

// Column indices for Tasks sheet (0-based)
const TASK_COLS = {
  ID: 0,
  TITLE: 1,
  NOTES: 2,
  STATUS: 3,
  PROJECT_ID: 4,
  CONTEXT_ID: 5,
  WAITING_FOR: 6,
  DUE_DATE: 7,
  SCHEDULED_DATE: 8,
  COMPLETED_DATE: 9,
  CREATED_DATE: 10,
  MODIFIED_DATE: 11,
  EMAIL_ID: 12,
  EMAIL_THREAD_ID: 13,
  PRIORITY: 14,
  ENERGY_REQUIRED: 15,
  TIME_ESTIMATE: 16,
  PARENT_TASK_ID: 17,
  SORT_ORDER: 18,
  TYPE: 19,
  AREA_ID: 20
};

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