/**
 * GTD System - Upgrade Service
 * Handles data migration and schema upgrades for parent relationship refactor.
 * Phase 1: Migrate data, keep column.
 * Phase 2: Clear column.
 * Phase 3: Delete column.
 */

const UpgradeService = {

  /**
   * Phase 1: Migrate projectId data to parentTaskId
   * Safe to run multiple times.
   */
  migrateProjectIds: function() {
    const sheet = getSheet(SHEETS.TASKS);
    if (!sheet) return { success: false, error: 'Tasks sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Hardcoded indices to ensure safety regardless of Config.gs changes during transition
    // Original Schema: 
    // ID=0, TITLE=1, NOTES=2, STATUS=3, PROJECT_ID=4, ... PARENT_TASK_ID=17
    
    // We scan headers to be sure about column positions
    const projectIdIndex = headers.indexOf('projectId');
    const parentTaskIdIndex = headers.indexOf('parentTaskId');
    
    if (projectIdIndex === -1) {
      return { success: false, error: 'projectId column not found. Already deleted?' };
    }
    if (parentTaskIdIndex === -1) {
      return { success: false, error: 'parentTaskId column not found' };
    }
    
    let updatedCount = 0;
    const updates = [];
    
    // Start at row 1 (skip header)
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const projectId = row[projectIdIndex];
        const parentTaskId = row[parentTaskIdIndex];
        
        let newValue = parentTaskId;
        let changed = false;
        
        // Logic: 
        // 1. If parentTaskId is empty, copy projectId
        // 2. If both exist and differ, overwrite parentTaskId with projectId (User preference: projectId is correct)
        
        if (!parentTaskId && projectId) {
            newValue = projectId;
            changed = true;
        } else if (parentTaskId && projectId && parentTaskId !== projectId) {
            newValue = projectId; 
            changed = true;
        }
        
        if (changed) {
            // We store the update to be batch processed
            // Store: { row: i + 1, col: parentTaskIdIndex + 1, value: newValue }
            // Actually, let's just update the in-memory data and flush the whole column or blocks?
            // Easiest for Apps Script is likely direct cell update or batch range if contiguous.
            // Let's modify the row in `data` and write back the column later?
            
            // Updating a single cell is slow. Let's build a matrix of just that column.
            updates.push({
                rowIndex: i,
                value: newValue
            });
            updatedCount++;
        }
    }
    
    if (updatedCount > 0) {
        // Batch write the parentTaskId column
        // We get the full range for that column
        const columnRange = sheet.getRange(2, parentTaskIdIndex + 1, data.length - 1, 1);
        const columnValues = columnRange.getValues();
        
        updates.forEach(u => {
            // updates use index relative to data array (header included), so we subtract 1 for data-only array
           columnValues[u.rowIndex - 1][0] = u.value; 
        });
        
        columnRange.setValues(columnValues);
    }
    
    return { 
        success: true, 
        message: 'Migration complete', 
        updatedRows: updatedCount 
    };
  },
  
  /**
   * Phase 2: Clear the projectId column values (Verification Step)
   * Run this after verifying Phase 1 works.
   */
  clearProjectIdColumn: function() {
    const sheet = getSheet(SHEETS.TASKS);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const projectIdIndex = headers.indexOf('projectId');
    
    if (projectIdIndex === -1) {
       return { success: true, message: 'Column already gone' };
    }
    
    // Clear content of column, keep header? Or clear values skipping header?
    // User asked to "clear to verify". Safe to keep header for now so code doesn't crash if it checks existence.
    // Clear rows 2 to N
    if (sheet.getLastRow() > 1) {
        sheet.getRange(2, projectIdIndex + 1, sheet.getLastRow() - 1, 1).clearContent();
    }
    
    return { success: true, message: 'ProjectId values cleared' };
  },
  
  /**
   * Phase 3: Delete the column entirely
   * Run this last.
   */
  deleteProjectIdColumn: function() {
    const sheet = getSheet(SHEETS.TASKS);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const projectIdIndex = headers.indexOf('projectId');
    
    if (projectIdIndex === -1) {
        return { success: false, error: 'Column not found' };
    }
    
    sheet.deleteColumn(projectIdIndex + 1);
    
    return { success: true, message: 'ProjectId column deleted' };
  }
};

/**
 * Global wrapper to run Phase 1 migration from editor
 */
function runPhase1Migration() {
  return UpgradeService.migrateProjectIds();
}

/**
 * Global wrapper to run Phase 2 verification (Clear Column)
 */
function runPhase2ClearColumn() {
  return UpgradeService.clearProjectIdColumn();
}

/**
 * Global wrapper to run Phase 3 (Delete Column)
 */
function runPhase3Deletion() {
  return UpgradeService.deleteProjectIdColumn();
}
