/**
 * GTD System - Migration Service
 * Handles one-time migration of Projects into the Tasks sheet.
 */
const MigrationService = {

  /**
   * Migrate all data from Projects sheet to Tasks sheet
   */
  migrateProjectsToTasks: function() {
    const ss = getSpreadsheet();
    const projectSheet = ss.getSheetByName(SHEETS.PROJECTS);
    const taskSheet = ss.getSheetByName(SHEETS.TASKS);
    
    if (!projectSheet || !taskSheet) {
      return { success: false, error: 'Missing required sheets' };
    }
    
    const projectData = projectSheet.getDataRange().getValues();
    // Headers are in row 0, data starts at row 1
    if (projectData.length <= 1) {
      return { success: true, message: 'No projects to migrate' };
    }
    
    const migratedRows = [];
    let projectsMigrated = 0;
    
    // Iterate through projects and map to task structure
    // We start at 1 to skip header
    for (let i = 1; i < projectData.length; i++) {
        const pRow = projectData[i];
        
        // Extract Project Data using existing Schema constants
        // Note: We need to use values directly because the rowToProject might expect the service to be active
        const id = pRow[PROJECT_COLS.ID];
        const name = pRow[PROJECT_COLS.NAME];
        const description = pRow[PROJECT_COLS.DESCRIPTION];
        const status = pRow[PROJECT_COLS.STATUS]; 
        const areaId = pRow[PROJECT_COLS.AREA_ID];
        const dueDate = pRow[PROJECT_COLS.DUE_DATE];
        const createdDate = pRow[PROJECT_COLS.CREATED_DATE];
        const completedDate = pRow[PROJECT_COLS.COMPLETED_DATE];
        const sortOrder = pRow[PROJECT_COLS.SORT_ORDER];
        const parentProjectId = pRow[PROJECT_COLS.PARENT_PROJECT_ID];
        
        // Map Status
        let newStatus = 'active'; // Valid for Project type tasks
        if (status === 'completed') newStatus = 'done';
        if (status === 'dropped') newStatus = 'deleted';
        if (status === 'someday') newStatus = 'someday';
        
        // Create new Task Row
        // We need to match the TASK_COLS structure. 
        // IMPORTANT: We need Config.gs to be updated FIRST to have the new columns.
        // For now, we assume the new columns are appended at the end:
        // 19: TYPE, 20: AREA_ID
        
        const row = new Array(21).fill('');
        
        row[TASK_COLS.ID] = id;
        row[TASK_COLS.TITLE] = name;
        row[TASK_COLS.NOTES] = description;
        row[TASK_COLS.STATUS] = newStatus;
        row[TASK_COLS.PROJECT_ID] = ''; // Projects don't have a project ID (usually), or we could self-ref? No.
        row[TASK_COLS.CONTEXT_ID] = '';
        row[TASK_COLS.WAITING_FOR] = '';
        row[TASK_COLS.DUE_DATE] = dueDate;
        row[TASK_COLS.SCHEDULED_DATE] = '';
        row[TASK_COLS.COMPLETED_DATE] = completedDate;
        row[TASK_COLS.CREATED_DATE] = createdDate;
        row[TASK_COLS.MODIFIED_DATE] = now(); // Mark modified time as now
        row[TASK_COLS.EMAIL_ID] = '';
        row[TASK_COLS.EMAIL_THREAD_ID] = '';
        row[TASK_COLS.PRIORITY] = 0;
        row[TASK_COLS.ENERGY_REQUIRED] = '';
        row[TASK_COLS.TIME_ESTIMATE] = '';
        row[TASK_COLS.PARENT_TASK_ID] = parentProjectId; // Map parent project to parent task
        row[TASK_COLS.SORT_ORDER] = sortOrder;
        
        // New Columns
        row[19] = 'project'; // Type
        row[20] = areaId;    // Area
        
        migratedRows.push(row);
        projectsMigrated++;
    }
    
    // Append to Tasks sheet
    if (migratedRows.length > 0) {
      taskSheet.getRange(taskSheet.getLastRow() + 1, 1, migratedRows.length, migratedRows[0].length).setValues(migratedRows);
    }
    
    return { success: true, count: projectsMigrated };
  },

  /**
   * Add new headers to Tasks sheet if missing
   */
  updateSchema: function() {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.TASKS);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    let updated = false;
    
    if (headers.indexOf('type') === -1) {
      sheet.getRange(1, headers.length + 1).setValue('type');
      updated = true;
    }
    
    // Re-fetch headers to get correct index for next check
    const newHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    if (newHeaders.indexOf('areaId') === -1) {
      sheet.getRange(1, newHeaders.length + 1).setValue('areaId');
      updated = true;
    }
    
    return { success: true, updated: updated };
  }
};
