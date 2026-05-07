/**
 * Migration Routine: SQL to Firestore
 * Contains functions to port data and verify integrity.
 */

function migrateSqlToFirestore() {
  Logger.log("Starting SQL to Firestore Migration...");
  
  // Ensure we can reach Firestore
  const pid = FirestoreService.getProjectId();
  if (!pid) {
    Logger.log("ERROR: FIRESTORE_PROJECT_ID not set.");
    return { success: false, error: "FIRESTORE_PROJECT_ID not set." };
  }
  
  // Read all from SQL
  Logger.log("Reading Tasks from SQL...");
  const tasks = DatabaseService.getAllItems();
  Logger.log(`Found ${tasks.length} tasks.`);
  
  Logger.log("Reading Contexts from SQL...");
  const contexts = DatabaseService.getAllContexts();
  
  Logger.log("Reading Areas from SQL...");
  const areas = DatabaseService.getAllAreas();
  
  Logger.log("Reading Settings from SQL...");
  const settings = DatabaseService.getSettings();

  // Write to Firestore (Batch using UrlFetchApp.fetchAll for speed)
  let successCount = 0;
  let errors = [];
  
  const baseUrl = FirestoreService.getBaseUrl();
  const headers = FirestoreService.getHeaders();
  
  const allRequests = [];
  
  // Prepare Task Requests
  tasks.forEach(t => {
      const doc = FirestoreService.jsToDocument(t);
      allRequests.push({
          url: baseUrl + '/tasks/' + t.id,
          method: 'PATCH',
          headers: headers,
          payload: JSON.stringify(doc),
          muteHttpExceptions: true
      });
  });

  // Prepare Context Requests
  contexts.forEach(c => {
      const doc = FirestoreService.jsToDocument(c);
      allRequests.push({
          url: baseUrl + '/contexts/' + c.id,
          method: 'PATCH',
          headers: headers,
          payload: JSON.stringify(doc),
          muteHttpExceptions: true
      });
  });

  // Prepare Area Requests
  areas.forEach(a => {
      const doc = FirestoreService.jsToDocument(a);
      allRequests.push({
          url: baseUrl + '/areas/' + a.id,
          method: 'PATCH',
          headers: headers,
          payload: JSON.stringify(doc),
          muteHttpExceptions: true
      });
  });

  // Prepare Settings Requests
  for (const key in settings) {
      const doc = FirestoreService.jsToDocument({ config_key: key, config_value: settings[key] });
      allRequests.push({
          url: baseUrl + '/settings/' + key,
          method: 'PATCH',
          headers: headers,
          payload: JSON.stringify(doc),
          muteHttpExceptions: true
      });
  }
  
  Logger.log("Total documents to migrate: " + allRequests.length);
  
  // Execute in batches to avoid UrlFetchApp rate limits
  const BATCH_SIZE = 50; // Reduced from 500 to 50 to avoid "Service invoked too many times"
  for (let i = 0; i < allRequests.length; i += BATCH_SIZE) {
      const batch = allRequests.slice(i, i + BATCH_SIZE);
      Logger.log("Sending batch " + (i+1) + " to " + Math.min(i+BATCH_SIZE, allRequests.length) + "...");
      
      try {
          const responses = UrlFetchApp.fetchAll(batch);
          responses.forEach((res, idx) => {
              if (res.getResponseCode() === 200) {
                  successCount++;
              } else {
                  errors.push("Doc error: " + res.getContentText());
              }
          });
      } catch (e) {
          errors.push("Batch " + i + " threw: " + e.toString());
      }
      
      // Mandatory sleep to appease Apps Script's urlfetch rate limits
      Utilities.sleep(1000);
  }

  Logger.log(`Migration Complete. Migrated ${successCount} documents. Errors: ${errors.length}`);
  if (errors.length > 0) {
    Logger.log("First few errors: " + errors.slice(0, 5).join(" | "));
  }
  
  return { success: errors.length === 0, count: successCount, errors: errors };
}


function verifyFirestoreMigration() {
  Logger.log("--- Starting Migration Verification ---");
  
  Logger.log("1. Fetching SQL Data...");
  const sqlTasks = DatabaseService.getAllItems();
  const sqlAreas = DatabaseService.getAllAreas();
  
  Logger.log("2. Fetching Firestore Data...");
  const fsTasks = FirestoreService.getAllItems();
  const fsAreas = FirestoreService.getAllAreas();
  
  let mismatches = [];
  
  // Create Maps
  const fsTaskMap = {};
  fsTasks.forEach(t => { fsTaskMap[t.id] = t; });
  
  const fsAreaMap = {};
  fsAreas.forEach(a => { fsAreaMap[a.id] = a; });
  
  Logger.log(`Comparing ${sqlTasks.length} SQL tasks against ${fsTasks.length} Firestore tasks...`);
  
  const sqlTaskMap = {};
  sqlTasks.forEach(t => { sqlTaskMap[t.id] = t; });
  
  // Diagnose extra tasks in Firestore
  let orphanCount = 0;
  if (fsTasks.length > sqlTasks.length) {
      Logger.log("=========================================");
      Logger.log("DIAGNOSTIC: Found extra tasks in Firestore that are NOT in SQL.");
      fsTasks.forEach(fsTask => {
          if (!sqlTaskMap[fsTask.id]) {
              orphanCount++;
              Logger.log(`Orphan #${orphanCount}:`);
              Logger.log(`  ID: ${fsTask.id}`);
              Logger.log(`  Title: ${fsTask.title}`);
              Logger.log(`  Status: ${fsTask.status}`);
              Logger.log(`  Type: ${fsTask.type}`);
              Logger.log(`  Created: ${fsTask.createdDate}`);
              Logger.log(`  Notes: ${fsTask.notes ? fsTask.notes.substring(0, 50) + '...' : ''}`);
              Logger.log("-----------------------------------------");
          }
      });
      mismatches.push(`Found ${orphanCount} extra tasks in Firestore. Check logs for details.`);
  } else if (sqlTasks.length !== fsTasks.length) {
     mismatches.push(`Task Count Mismatch! SQL: ${sqlTasks.length}, FS: ${fsTasks.length}`);
  }
  
  sqlTasks.forEach(sqlTask => {
     const fsTask = fsTaskMap[sqlTask.id];
     if (!fsTask) {
        mismatches.push(`Missing in FS: Task ${sqlTask.id} (${sqlTask.title})`);
        return;
     }
     
     // Deep check EVERY field
     for (const key in sqlTask) {
        // Skip keys that are intentionally different or dynamic
        if (key === 'projectId') continue; // Legacy fallback in DatabaseService
        
        const sqlVal = sqlTask[key];
        const fsVal = fsTask[key];
        
        // Firestore numeric strings vs SQL ints
        if (typeof sqlVal === 'number' && typeof fsVal === 'number') {
            if (sqlVal !== fsVal) mismatches.push(`[${sqlTask.id}] ${key} diff: SQL[${sqlVal}] vs FS[${fsVal}]`);
        } else if (String(sqlVal) !== String(fsVal) && !(sqlVal === "" && fsVal === null) && !(sqlVal === null && fsVal === "")) {
            // Empty string and null are often equivalent in these backend ports
            mismatches.push(`[${sqlTask.id}] ${key} diff: SQL[${sqlVal}] vs FS[${fsVal}]`);
        }
     }
  });
  
  Logger.log(`Comparing ${sqlAreas.length} SQL areas against ${fsAreas.length} Firestore areas...`);
  sqlAreas.forEach(sqlArea => {
     const fsArea = fsAreaMap[sqlArea.id];
     if (!fsArea) {
        mismatches.push(`Missing in FS: Area ${sqlArea.id}`);
        return;
     }
     if (sqlArea.aiContext !== fsArea.aiContext) mismatches.push(`aiContext diff on ${sqlArea.id}: SQL[${sqlArea.aiContext}] vs FS[${fsArea.aiContext}]`);
  });
  
  if (mismatches.length === 0) {
    Logger.log("✅ Verification SUCCESS! All records transferred identically, including AI Contexts.");
    return { success: true };
  } else {
    Logger.log("❌ Verification FAILED! Found " + mismatches.length + " mismatches.");
    mismatches.slice(0, 20).forEach(m => Logger.log("   -> " + m));
    return { success: false, mismatches: mismatches };
  }
}
