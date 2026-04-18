/**
 * Backup Service
 * Handles nightly snapshot generation of the Database/Google Sheets to Google Drive.
 * Acts as a failsafe when using Cloud SQL to provide simple file-based Point in Time Recovery.
 */

const BackupService = {
  
  /**
   * The name of the backup folder in Google Drive.
   */
  FOLDER_NAME: 'GTD_Database_Backups',

  /**
   * Generates a complete snapshot of the system and archives it as a JSON file in Google Drive.
   */
  runNightlyBackup: function() {
    try {
      const timestamp = new Date();
      const dateStr = timestamp.toISOString().split('T')[0];
      const fileName = 'gtd_backup_' + dateStr + '.json';
      
      Logger.log('Starting nightly backup: ' + fileName);
      
      // 1. Gather all data
      // Bypassing cache to ensure pristine DB readout
      const data = {
        timestamp: timestamp.toISOString(),
        tasks: TaskService.getAllItems(), // Contains both tasks and projects under the hood in SQL
        contexts: ContextService.getAllContexts(),
        areas: AreaService.getAllAreas(),
        settings: getSettings()
      };
      
      const payload = JSON.stringify(data, null, 2);
      
      // 2. Prepare Google Drive Folder
      const folders = DriveApp.getFoldersByName(this.FOLDER_NAME);
      let backupFolder;
      if (folders.hasNext()) {
        backupFolder = folders.next();
      } else {
        backupFolder = DriveApp.createFolder(this.FOLDER_NAME);
      }
      
      // 3. Write File
      backupFolder.createFile(fileName, payload, MimeType.PLAIN_TEXT);
      
      // 4. Cleanup old backups (Keep last 30 days)
      this.cleanupOldBackups(backupFolder, 30);
      
      Logger.log('Backup successful.');
      return { success: true, message: 'Backup created: ' + fileName };
      
    } catch (e) {
      Logger.log('Backup error: ' + e.toString());
      return { success: false, error: e.toString() };
    }
  },
  
  /**
   * Keeps the backup folder tidy by deleting old backup files
   */
  cleanupOldBackups: function(folder, maxDays) {
    const files = folder.getFiles();
    const now = new Date().getTime();
    const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    
    while (files.hasNext()) {
      const file = files.next();
      // Verify it's a backup file
      if (file.getName().startsWith('gtd_backup_') && file.getName().endsWith('.json')) {
        const fileDate = file.getDateCreated().getTime();
        const ageMs = now - fileDate;
        
        if (ageMs > maxAgeMs) {
          file.setTrashed(true);
          deletedCount++;
        }
      }
    }
    
    if (deletedCount > 0) {
       Logger.log('Deleted ' + deletedCount + ' old backup files.');
    }
  },

  /**
   * Sets up the Time-driven trigger for the nightly backup.
   * Can be run manually once to initialize.
   */
  setupTrigger: function() {
    const triggerName = 'executeNightlyBackup';
    
    // First, clear any existing triggers so we don't duplicate
    const triggers = ScriptApp.getProjectTriggers();
    let alreadyExists = false;
    
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === triggerName) {
        // Soft reset: remove and recreate, or just leave it. Let's recreate to be safe.
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    
    // Install trigger: run every day around 3 AM in the script's timezone
    ScriptApp.newTrigger(triggerName)
      .timeBased()
      .everyDays(1)
      .atHour(3)
      .create();
      
    return { success: true, message: 'Nightly backup trigger installed.' };
  }
};
