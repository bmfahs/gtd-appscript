/**
 * Database Service
 * Handles native JDBC connections to Google Cloud SQL (PostgreSQL/MySQL)
 */

const DatabaseService = {
  
  _cachedConn: null,
  _settingsCache: null,
  
  getConnection: function() {
    if (this._cachedConn && !this._cachedConn.isClosed()) {
      return this._cachedConn;
    }
    
    const props = PropertiesService.getScriptProperties();
    const dbUser = (props.getProperty('DB_USER') || '').trim();
    const dbPassword = props.getProperty('DB_PASSWORD'); // Passwords can theoretically have trailing spaces
    const dbName = (props.getProperty('DB_NAME') || '').trim();
    const dbType = (props.getProperty('DB_TYPE') || 'postgresql').trim();
    const dbInstance = (props.getProperty('DB_INSTANCE_CONNECTION_NAME') || '').trim();
    const dbHost = (props.getProperty('DB_HOST') || '').trim();
    
    if (!dbUser || !dbPassword || !dbName) {
      throw new Error('Missing database credentials in Script Properties. Require: DB_USER, DB_PASSWORD, DB_NAME');
    }
    
    let dbUrl;
    if (dbType === 'postgresql') {
      if (!dbHost) throw new Error('PostgreSQL requires DB_HOST (IP address) in Script Properties instead of connection name.');
      dbUrl = 'jdbc:postgresql://' + dbHost + '/' + dbName;
      Logger.log("CONNECTING POSTGRES URL: " + dbUrl + " with USER: " + dbUser);
      this._cachedConn = Jdbc.getConnection(dbUrl, dbUser, dbPassword);
      return this._cachedConn;
    } else {
      if (!dbInstance) throw new Error('MySQL via getCloudSqlConnection requires DB_INSTANCE_CONNECTION_NAME in Script Properties.');
      dbUrl = 'jdbc:google:mysql://' + dbInstance + '/' + dbName;
      Logger.log("CONNECTING MYSQL APP SCRIPT PROXY URL: " + dbUrl + " with USER: " + dbUser);
      this._cachedConn = Jdbc.getCloudSqlConnection(dbUrl, dbUser, dbPassword);
      return this._cachedConn;
    }
  },

  /**
   * Initializes the SQL Database tables using the configured connection.
   * This is a bootstrap operation for a fresh SQL database.
   */
  initSchema: function() {
    let conn;
    try {
      conn = this.getConnection();
      const statement = conn.createStatement();
      
      const isPostgres = (PropertiesService.getScriptProperties().getProperty('DB_TYPE') || 'postgresql') === 'postgresql';
      const booleanType = isPostgres ? 'BOOLEAN' : 'TINYINT(1)';
      const textType = 'TEXT';
      const varcharType = 'VARCHAR(255)';

      // 1. Tasks Table (Covers Projects & Folders seamlessly)
      statement.execute(`
        CREATE TABLE IF NOT EXISTS tasks (
          id VARCHAR(36) PRIMARY KEY,
          title ${textType},
          notes ${textType},
          status VARCHAR(50),
          contextId VARCHAR(36),
          waitingFor ${textType},
          dueDate VARCHAR(50),
          scheduledDate VARCHAR(50),
          completedDate VARCHAR(50),
          createdDate VARCHAR(50),
          modifiedDate VARCHAR(50),
          emailId ${varcharType},
          emailThreadId ${varcharType},
          priority INT,
          energyRequired VARCHAR(50),
          timeEstimate VARCHAR(50),
          parentTaskId VARCHAR(36),
          sortOrder INT,
          type VARCHAR(50),
          areaId VARCHAR(36),
          importance VARCHAR(50),
          urgency VARCHAR(50),
          isStarred ${booleanType},
          lastReviewed VARCHAR(50),
          reviewCadence INT,
          aiContext ${textType}
        )
      `);
      
      // Create Indexes to drastically speed up hierarchy UI and status aggregation
      const indexQueries = [
         "CREATE INDEX idx_tasks_parent ON tasks(parentTaskId)",
         "CREATE INDEX idx_tasks_type ON tasks(type)",
         "CREATE INDEX idx_tasks_status ON tasks(status)",
         "CREATE INDEX idx_tasks_area ON tasks(areaId)",
         "CREATE INDEX idx_tasks_context ON tasks(contextId)"
      ];
      
      indexQueries.forEach(q => {
         try { statement.execute(q); } catch(ex) { 
           // Ignore duplicate key errors if the schema is run multiple times
           if (!ex.message.includes('Duplicate key name')) {
             Logger.log("Index warn: " + ex.message); 
           }
         }
      });

      // 2. Contexts Table
      statement.execute(`
        CREATE TABLE IF NOT EXISTS contexts (
          id VARCHAR(36) PRIMARY KEY,
          name ${varcharType},
          icon VARCHAR(50),
          sortOrder INT
        )
      `);

      // 3. Areas Table
      statement.execute(`
        CREATE TABLE IF NOT EXISTS areas (
          id VARCHAR(36) PRIMARY KEY,
          name ${varcharType},
          icon VARCHAR(50),
          sortOrder INT,
          aiContext ${textType}
        )
      `);

      // 4. Settings Table
      statement.execute(`
        CREATE TABLE IF NOT EXISTS settings (
          config_key VARCHAR(255) PRIMARY KEY,
          config_value ${textType}
        )
      `);
      
      statement.close();
      return { success: true, message: "Cloud SQL Schema Initialized" };
    } catch (e) {
      Logger.log("initSchema error: " + e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * Translates a raw SQL ResultSet row into a strictly formatted Task JS Object
   */
  _mapResultSetToTask: function(rs) {
    return {
      id: rs.getString(1),
      title: rs.getString(2) || "",
      notes: rs.getString(3) || "",
      status: rs.getString(4) || "inbox",
      contextId: rs.getString(5) || "",
      waitingFor: rs.getString(6) || "",
      dueDate: rs.getString(7) || "",
      scheduledDate: rs.getString(8) || "",
      completedDate: rs.getString(9) || "",
      createdDate: rs.getString(10) || "",
      modifiedDate: rs.getString(11) || "",
      emailId: rs.getString(12) || "",
      emailThreadId: rs.getString(13) || "",
      priority: rs.getInt(14) || 0,
      energyRequired: rs.getString(15) || "medium",
      timeEstimate: rs.getString(16) || "",
      parentTaskId: rs.getString(17) || "",
      sortOrder: rs.getInt(18) || 0,
      type: rs.getString(19) || "task",
      areaId: rs.getString(20) || "",
      importance: rs.getString(21) || "",
      urgency: rs.getString(22) || "",
      isStarred: rs.getBoolean(23),
      lastReviewed: rs.getString(24) || "",
      reviewCadence: rs.getInt(25) || 1,
      aiContext: rs.getString(26) || "",
      projectId: rs.getString(17) || "" // Legacy mapping fallback
    };
  },

  getAllItems: function() {
    let conn;
    try {
      conn = this.getConnection();
      const stmt = conn.createStatement();
      const rs = stmt.executeQuery("SELECT * FROM tasks");
      const items = [];
      while (rs.next()) {
        const item = this._mapResultSetToTask(rs);
        if (item.status !== 'deleted') {
            items.push(item);
        }
      }
      rs.close();
      stmt.close();
      return items;
    } catch (e) {
      Logger.log("getAllItems SQL Error: " + e.message);
      return [];
    }
  },

  getTask: function(taskId) {
    let conn;
    try {
      conn = this.getConnection();
      const stmt = conn.prepareStatement("SELECT * FROM tasks WHERE id = ?");
      stmt.setString(1, taskId);
      const rs = stmt.executeQuery();
      
      let task = null;
      if (rs.next()) {
        task = this._mapResultSetToTask(rs);
      }
      rs.close();
      stmt.close();
      return task;
    } catch (e) {
      Logger.log("getTask SQL Error: " + e.message);
      return null;
    }
  },

  hasActiveChildren: function(parentId) {
    let conn;
    try {
      conn = this.getConnection();
      const stmt = conn.prepareStatement("SELECT COUNT(*) FROM tasks WHERE parentTaskId = ? AND status != 'completed' AND status != 'done' AND status != 'dropped' AND status != 'deleted'");
      stmt.setString(1, parentId);
      const rs = stmt.executeQuery();
      
      let hasActive = false;
      if (rs.next()) {
        hasActive = rs.getInt(1) > 0;
      }
      rs.close();
      stmt.close();
      return hasActive;
    } catch (e) {
      Logger.log("hasActiveChildren SQL Error: " + e.message);
      return false; // Fail open to allow operation if DB acts up
    }
  },

  getMaxSortOrder: function() {
    let conn;
    try {
      conn = this.getConnection();
      const stmt = conn.createStatement();
      const rs = stmt.executeQuery("SELECT MAX(sortOrder) FROM tasks");
      let maxSort = 0;
      if (rs.next()) {
        maxSort = rs.getInt(1);
      }
      rs.close();
      stmt.close();
      return maxSort;
    } catch (e) {
      Logger.log("getMaxSortOrder SQL Error: " + e.message);
      return 0;
    }
  },

  createTask: function(task) {
    try {
      const conn = this.getConnection();
      const q = `INSERT INTO tasks (
        id, title, notes, status, contextId, waitingFor, dueDate, scheduledDate,
        completedDate, createdDate, modifiedDate, emailId, emailThreadId, priority,
        energyRequired, timeEstimate, parentTaskId, sortOrder, type, areaId,
        importance, urgency, isStarred, lastReviewed, reviewCadence, aiContext
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      const stmt = conn.prepareStatement(q);
      stmt.setString(1, task.id);
      stmt.setString(2, task.title || "");
      stmt.setString(3, task.notes || "");
      stmt.setString(4, task.status || "inbox");
      stmt.setString(5, task.contextId || "");
      stmt.setString(6, task.waitingFor || "");
      stmt.setString(7, task.dueDate || "");
      stmt.setString(8, task.scheduledDate || "");
      stmt.setString(9, task.completedDate || "");
      stmt.setString(10, task.createdDate || "");
      stmt.setString(11, task.modifiedDate || "");
      stmt.setString(12, task.emailId || "");
      stmt.setString(13, task.emailThreadId || "");
      stmt.setInt(14, Math.round(task.priority || 0));
      stmt.setString(15, task.energyRequired || "medium");
      stmt.setString(16, String(task.timeEstimate || ""));
      stmt.setString(17, task.parentTaskId || "");
      stmt.setInt(18, Math.round(task.sortOrder || 0));
      stmt.setString(19, task.type || "task");
      stmt.setString(20, task.areaId || "");
      stmt.setString(21, String(task.importance || ""));
      stmt.setString(22, String(task.urgency || ""));
      
      if (typeof task.isStarred === 'boolean') {
          stmt.setBoolean(23, task.isStarred);
      } else {
          stmt.setBoolean(23, task.isStarred === 'true' || task.isStarred === true);
      }
      
      stmt.setString(24, task.lastReviewed || "");
      stmt.setInt(25, Math.round(task.reviewCadence || 1));
      stmt.setString(26, task.aiContext || "");
      
      stmt.executeUpdate();
      stmt.close();
      if (typeof clearDataCache === 'function') clearDataCache();
      return { success: true, task: task };
    } catch (e) {
      Logger.log("createTask SQL Error: " + e.message);
      return { success: false, error: e.message };
    }
  },

  updateTask: function(taskId, updates) {
    const task = this.getTask(taskId);
    if (!task) return { success: false, error: 'Task not found in SQL DB' };
    
    // Dynamic logic maps identical Object.assign override parameters exactly equivalent to the Sheet variant.
    const merged = Object.assign({}, task, updates);
    merged.modifiedDate = new Date().toISOString();
    
    // Recalc priority if needed
    if (merged.type === 'task') {
        merged.priority = PriorityService.calculatePriority(merged);
    }
    
    try {
      const conn = this.getConnection();
      const stmt = conn.prepareStatement(`
        UPDATE tasks SET 
          title=?, notes=?, status=?, contextId=?, waitingFor=?, dueDate=?, scheduledDate=?,
          completedDate=?, modifiedDate=?, priority=?, energyRequired=?, timeEstimate=?,
          parentTaskId=?, sortOrder=?, areaId=?, importance=?, urgency=?, isStarred=?,
          lastReviewed=?, reviewCadence=?, aiContext=?, type=?
        WHERE id=?
      `);
      
      stmt.setString(1, merged.title || "");
      stmt.setString(2, merged.notes || "");
      stmt.setString(3, merged.status || "inbox");
      stmt.setString(4, merged.contextId || "");
      stmt.setString(5, merged.waitingFor || "");
      stmt.setString(6, merged.dueDate || "");
      stmt.setString(7, merged.scheduledDate || "");
      stmt.setString(8, merged.completedDate || "");
      stmt.setString(9, merged.modifiedDate || "");
      stmt.setInt(10, Math.round(merged.priority || 0));
      stmt.setString(11, merged.energyRequired || "medium");
      stmt.setString(12, String(merged.timeEstimate || ""));
      stmt.setString(13, merged.parentTaskId || "");
      stmt.setInt(14, Math.round(merged.sortOrder || 0));
      stmt.setString(15, merged.areaId || "");
      stmt.setString(16, String(merged.importance || ""));
      stmt.setString(17, String(merged.urgency || ""));
      if (typeof merged.isStarred === 'boolean') {
          stmt.setBoolean(18, merged.isStarred);
      } else {
          stmt.setBoolean(18, merged.isStarred === 'true' || merged.isStarred === true);
      }
      stmt.setString(19, merged.lastReviewed || "");
      stmt.setInt(20, Math.round(merged.reviewCadence || 1));
      stmt.setString(21, merged.aiContext || "");
      stmt.setString(22, merged.type || "task");
      stmt.setString(23, taskId);
      
      stmt.executeUpdate();
      stmt.close();
      if (typeof clearDataCache === 'function') clearDataCache();
      
      // Optimization: No need to perform another SELECT round-tip here.
      // merged contains the truth we just wrote. Return it directly.
      return { success: true, task: merged }; 
    } catch (e) {
      Logger.log("updateTask SQL Error: " + e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * Ultra-fast Batch Updater to eliminate the 300ms proxy latency per task
   */
  updateTasksBatch: function(updatesArray) {
    if (!updatesArray || updatesArray.length === 0) return { success: true, count: 0, error: '' };
    
    let validUpdates = [];
    let errors = [];
    
    // 1. In-Memory Resolution utilizing a lightning fast isolated subset fetch
    try {
        const conn = this.getConnection();
        const ids = updatesArray.map(u => u.id);
        const placeholders = ids.map(() => '?').join(',');
        const stmt = conn.prepareStatement(`SELECT * FROM tasks WHERE id IN (${placeholders})`);
        
        for (let i = 0; i < ids.length; i++) {
            stmt.setString(i + 1, ids[i]);
        }
        
        const rs = stmt.executeQuery();
        const taskMap = {};
        while (rs.next()) {
            const t = this._mapResultSetToTask(rs);
            taskMap[t.id] = t;
        }
        rs.close();
        stmt.close();
        
        updatesArray.forEach(u => {
            const task = taskMap[u.id];
            if (!task) { errors.push(u.id + ': Task not found'); return; }
            
            const merged = Object.assign({}, task, u.updates);
            merged.modifiedDate = new Date().toISOString();
            if (merged.type === 'task') merged.priority = PriorityService.calculatePriority(merged);
            
            validUpdates.push({ id: u.id, merged: merged });
        });
    } catch(e) {
        Logger.log("updateTasksBatch fetch SQL Error: " + e.message);
        return { success: false, count: 0, error: e.message };
    }
    
    if (validUpdates.length === 0) return { success: false, count: 0, error: errors.join(', ') };

    // 2. Transmit Bulk Sequence via executing Batch Statements
    try {
      const conn = this.getConnection();
      conn.setAutoCommit(false); // Enable strict Transaction wrapper
      
      const stmt = conn.prepareStatement(`
        UPDATE tasks SET 
          title=?, notes=?, status=?, contextId=?, waitingFor=?, dueDate=?, scheduledDate=?,
          completedDate=?, modifiedDate=?, priority=?, energyRequired=?, timeEstimate=?,
          parentTaskId=?, sortOrder=?, areaId=?, importance=?, urgency=?, isStarred=?,
          lastReviewed=?, reviewCadence=?, aiContext=?, type=?
        WHERE id=?
      `);
      
      validUpdates.forEach(v => {
          const merged = v.merged;
          stmt.setString(1, merged.title || "");
          stmt.setString(2, merged.notes || "");
          stmt.setString(3, merged.status || "inbox");
          stmt.setString(4, merged.contextId || "");
          stmt.setString(5, merged.waitingFor || "");
          stmt.setString(6, merged.dueDate || "");
          stmt.setString(7, merged.scheduledDate || "");
          stmt.setString(8, merged.completedDate || "");
          stmt.setString(9, merged.modifiedDate || "");
          stmt.setInt(10, Math.round(merged.priority || 0));
          stmt.setString(11, merged.energyRequired || "medium");
          stmt.setString(12, String(merged.timeEstimate || ""));
          stmt.setString(13, merged.parentTaskId || "");
          stmt.setInt(14, Math.round(merged.sortOrder || 0));
          stmt.setString(15, merged.areaId || "");
          stmt.setString(16, String(merged.importance || ""));
          stmt.setString(17, String(merged.urgency || ""));
          // JDBC boolean safety fallback
          if (typeof merged.isStarred === 'boolean') {
              stmt.setBoolean(18, merged.isStarred);
          } else {
              stmt.setBoolean(18, merged.isStarred === 'true' || merged.isStarred === true);
          }
          stmt.setString(19, merged.lastReviewed || "");
          stmt.setInt(20, Math.round(merged.reviewCadence || 1));
          stmt.setString(21, merged.aiContext || "");
          stmt.setString(22, merged.type || "task");
          stmt.setString(23, v.id);
          stmt.addBatch();
      });
      
      stmt.executeBatch();
      conn.commit();
      conn.setAutoCommit(true);
      stmt.close();
      
      if (typeof clearDataCache === 'function') clearDataCache();
      
      return { success: errors.length === 0, count: validUpdates.length, error: errors.join(', ') };
    } catch (e) {
      Logger.log("updateTasksBatch SQL Error: " + e.message);
      return { success: false, count: 0, error: e.message };
    }
  },

  hardDeleteTask: function(taskId) {
    try {
      conn = this.getConnection();
      const stmt = conn.prepareStatement("DELETE FROM tasks WHERE id = ?");
      stmt.setString(1, taskId);
      stmt.executeUpdate();
      stmt.close();
      if (typeof clearDataCache === 'function') clearDataCache();
      return { success: true };
    } catch (e) {
      Logger.log("hardDeleteTask SQL Error: " + e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * One-Time Migration Runner: Parses the active Google Sheet memory arrays
   * and maps them identically into the brand new Database relational tables.
   */
  migrateFromSheetsToSql: function() {
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
        return { success: false, error: 'USE_SQL_BACKEND is incredibly currently set to TRUE in Config.gs. You must run Migration while it is FALSE so we can read from the Sheets!' };
    }
    
    // Auto-create matrix
    const initRes = this.initSchema();
    if (!initRes.success) return { success: false, error: 'Schema creation failed: ' + initRes.error };
    
    let conn;
    try {
      // Step 1: Query local sheets directly
      const allTasks = TaskService.getAllItems();
      const allContexts = ContextService.getAllContexts();
      const allAreas = AreaService.getAllAreas();
      
      conn = this.getConnection();
      conn.setAutoCommit(false); // Enable batch transactions for mass inject speed
      
      const taskStmt = conn.prepareStatement(`
        INSERT INTO tasks (id, title, notes, status, contextId, waitingFor, dueDate, scheduledDate, completedDate,
        createdDate, modifiedDate, emailId, emailThreadId, priority, energyRequired, timeEstimate, parentTaskId, sortOrder, type, areaId, importance, urgency, isStarred, lastReviewed, reviewCadence, aiContext) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      let count = 0;
      allTasks.forEach(task => {
        taskStmt.setString(1, task.id);
        taskStmt.setString(2, task.title || "");
        taskStmt.setString(3, task.notes || "");
        taskStmt.setString(4, task.status || "inbox");
        taskStmt.setString(5, task.contextId || "");
        taskStmt.setString(6, task.waitingFor || "");
        taskStmt.setString(7, task.dueDate || "");
        taskStmt.setString(8, task.scheduledDate || "");
        taskStmt.setString(9, task.completedDate || "");
        taskStmt.setString(10, task.createdDate || "");
        taskStmt.setString(11, task.modifiedDate || "");
        taskStmt.setString(12, task.emailId || "");
        taskStmt.setString(13, task.emailThreadId || "");
        taskStmt.setInt(14, task.priority || 0);
        taskStmt.setString(15, task.energyRequired || "medium");
        taskStmt.setString(16, task.timeEstimate || "");
        taskStmt.setString(17, task.parentTaskId || task.projectId || "");
        taskStmt.setInt(18, task.sortOrder || 0);
        taskStmt.setString(19, task.type || "task");
        taskStmt.setString(20, task.areaId || "");
        taskStmt.setString(21, task.importance || "");
        taskStmt.setString(22, task.urgency || "");
        taskStmt.setBoolean(23, task.isStarred || false);
        taskStmt.setString(24, task.lastReviewed || "");
        taskStmt.setInt(25, task.reviewCadence || 1);
        taskStmt.setString(26, task.aiContext || "");
        taskStmt.addBatch();
        count++;
      });
      if (allTasks.length > 0) taskStmt.executeBatch();
      taskStmt.close();
      
      // Migrate Contexts
      const ctxStmt = conn.prepareStatement(`INSERT INTO contexts (id, name, icon, sortOrder) VALUES (?, ?, ?, ?)`);
      allContexts.forEach(c => {
        ctxStmt.setString(1, c.id);
        ctxStmt.setString(2, c.name || "");
        ctxStmt.setString(3, c.icon || "");
        ctxStmt.setInt(4, c.sortOrder || 0);
        ctxStmt.addBatch();
      });
      if (allContexts.length > 0) ctxStmt.executeBatch();
      ctxStmt.close();
      
      // Migrate Areas
      const areaStmt = conn.prepareStatement(`INSERT INTO areas (id, name, icon, sortOrder, aiContext) VALUES (?, ?, ?, ?, ?)`);
      allAreas.forEach(a => {
        areaStmt.setString(1, a.id);
        areaStmt.setString(2, a.name || "");
        areaStmt.setString(3, a.icon || "");
        areaStmt.setInt(4, a.sortOrder || 0);
        areaStmt.setString(5, a.aiContext || "");
        areaStmt.addBatch();
      });
      if (allAreas.length > 0) areaStmt.executeBatch();
      areaStmt.close();
      
      // Migrate Settings
      const allSettings = getSettings();
      const setStmt = conn.prepareStatement(`INSERT INTO settings (config_key, config_value) VALUES (?, ?)`);
      Object.keys(allSettings).forEach(key => {
        setStmt.setString(1, key);
        setStmt.setString(2, allSettings[key]);
        setStmt.addBatch();
      });
      if (Object.keys(allSettings).length > 0) setStmt.executeBatch();
      setStmt.close();
      
      conn.commit();
      return { success: true, count: count, message: `Successfully ported ${count} rows to Cloud SQL Engine! Update USE_SQL_BACKEND to true to finalize!` };
      
    } catch (e) {
      Logger.log("Migration failure: " + e.message);
      if (conn) conn.rollback();
      return { success: false, error: e.message };
    }
  },

  /**
   * Compacts the database by removing 'done' and 'deleted' tasks, 
   * and 'completed' and 'dropped' projects/folders.
   */
  compactDatabase: function() {
    let conn;
    try {
      conn = this.getConnection();
      const stmt = conn.createStatement();
      const tasksRemoved = stmt.executeUpdate("DELETE FROM tasks WHERE type='task' AND status IN ('done', 'deleted')");
      const projectsRemoved = stmt.executeUpdate("DELETE FROM tasks WHERE type IN ('project', 'folder') AND status IN ('completed', 'dropped', 'done', 'deleted')");
      stmt.close();
      
      if (typeof clearDataCache === 'function') clearDataCache();
      
      return { 
        tasksRemoved: tasksRemoved, 
        projectsRemoved: projectsRemoved,
        success: true 
      };
    } catch (e) {
      Logger.log("compactDatabase SQL Error: " + e.message);
      return { tasksRemoved: 0, projectsRemoved: 0, error: e.message, success: false };
    }
  },

  // ==========================================
  // SQL ROUTES FOR CONTEXTS, AREAS & SETTINGS
  // ==========================================

  getAllContexts: function() {
    let conn;
    try {
      conn = this.getConnection();
      const rs = conn.createStatement().executeQuery("SELECT * FROM contexts ORDER BY sortOrder ASC");
      const items = [];
      while (rs.next()) {
        items.push({ id: rs.getString("id"), name: rs.getString("name"), icon: rs.getString("icon"), sortOrder: rs.getInt("sortOrder") });
      }
      rs.close(); return items;
    } catch (e) { Logger.log("getAllContexts SQL err: "+e); return []; }
  },

  getTaskContext: function(id) {
    let conn; try { conn = this.getConnection(); const stmt = conn.prepareStatement("SELECT * FROM contexts WHERE id=?"); stmt.setString(1, id); const rs = stmt.executeQuery(); let item = null; if (rs.next()) item = { id: rs.getString("id"), name: rs.getString("name"), icon: rs.getString("icon"), sortOrder: rs.getInt("sortOrder") }; rs.close(); return item; } catch (e) { return null; }
  },

  createContext: function(data) {
    let conn; try { conn = this.getConnection(); const stmt = conn.prepareStatement("INSERT INTO contexts (id, name, icon, sortOrder) VALUES (?, ?, ?, ?)"); const id = generateUUID(); stmt.setString(1, id); stmt.setString(2, data.name || ''); stmt.setString(3, data.icon || ''); stmt.setInt(4, data.sortOrder || 0); stmt.executeUpdate(); return { id: id, name: data.name, icon: data.icon, sortOrder: data.sortOrder }; } catch(e) { return null; }
  },

  updateContext: function(id, updates) {
    const existing = this.getTaskContext(id); if (!existing) return { success: false }; const merged = Object.assign({}, existing, updates);
    let conn; try { conn = this.getConnection(); const stmt = conn.prepareStatement("UPDATE contexts SET name=?, icon=?, sortOrder=? WHERE id=?"); stmt.setString(1, merged.name); stmt.setString(2, merged.icon); stmt.setInt(3, merged.sortOrder); stmt.setString(4, id); stmt.executeUpdate(); return { success: true, context: merged }; } catch(e) { return { success: false }; }
  },

  deleteContext: function(id) {
    let conn; try { conn = this.getConnection(); const stmt = conn.prepareStatement("DELETE FROM contexts WHERE id=?"); stmt.setString(1, id); stmt.executeUpdate(); return { success: true }; } catch(e) { return { success: false }; }
  },

  getAllAreas: function() {
    let conn; try { conn = this.getConnection(); const rs = conn.createStatement().executeQuery("SELECT * FROM areas ORDER BY sortOrder ASC"); const items = []; while (rs.next()) { items.push({ id: rs.getString("id"), name: rs.getString("name"), icon: rs.getString("icon"), sortOrder: rs.getInt("sortOrder"), aiContext: rs.getString("aiContext") }); } rs.close(); return items; } catch (e) { Logger.log("getAllAreas err: "+e); return []; }
  },

  getArea: function(id) {
    let conn; try { conn = this.getConnection(); const stmt = conn.prepareStatement("SELECT * FROM areas WHERE id=?"); stmt.setString(1, id); const rs = stmt.executeQuery(); let item = null; if (rs.next()) item = { id: rs.getString("id"), name: rs.getString("name"), icon: rs.getString("icon"), sortOrder: rs.getInt("sortOrder"), aiContext: rs.getString("aiContext") }; rs.close(); return item; } catch(e) { return null; }
  },

  createArea: function(data) {
    let conn; try { conn = this.getConnection(); const stmt = conn.prepareStatement("INSERT INTO areas (id, name, icon, sortOrder, aiContext) VALUES (?, ?, ?, ?, ?)"); const id = generateUUID(); stmt.setString(1, id); stmt.setString(2, data.name || ''); stmt.setString(3, data.icon || ''); stmt.setInt(4, data.sortOrder || 0); stmt.setString(5, data.aiContext || ''); stmt.executeUpdate(); return { id: id, name: data.name, icon: data.icon, sortOrder: data.sortOrder, aiContext: data.aiContext }; } catch(e) { return null; }
  },

  updateArea: function(id, updates) {
    const existing = this.getArea(id); if (!existing) return { success: false }; const merged = Object.assign({}, existing, updates);
    let conn; try { conn = this.getConnection(); const stmt = conn.prepareStatement("UPDATE areas SET name=?, icon=?, sortOrder=?, aiContext=? WHERE id=?"); stmt.setString(1, merged.name); stmt.setString(2, merged.icon); stmt.setInt(3, merged.sortOrder); stmt.setString(4, merged.aiContext); stmt.setString(5, id); stmt.executeUpdate(); return { success: true, area: merged }; } catch(e) { return { success: false }; }
  },

  deleteArea: function(id) {
    let conn; try { conn = this.getConnection(); const stmt = conn.prepareStatement("DELETE FROM areas WHERE id=?"); stmt.setString(1, id); stmt.executeUpdate(); return { success: true }; } catch(e) { return { success: false }; }
  },

  getSettings: function() {
    if (this._settingsCache) return this._settingsCache;
    
    let conn; 
    try { 
        conn = this.getConnection(); 
        const rs = conn.createStatement().executeQuery("SELECT * FROM settings"); 
        const settings = {}; 
        while(rs.next()) { 
            settings[rs.getString("config_key")] = rs.getString("config_value"); 
        } 
        rs.close(); 
        this._settingsCache = settings; // Memoize for this execution
        return settings; 
    } catch(e) { 
        return {}; 
    }
  },

  updateSetting: function(key, value) {
    let conn; try { conn = this.getConnection(); 
    const del = conn.prepareStatement("DELETE FROM settings WHERE config_key=?"); del.setString(1, key); del.executeUpdate(); del.close();
    const ins = conn.prepareStatement("INSERT INTO settings (config_key, config_value) VALUES (?, ?)"); ins.setString(1, key); ins.setString(2, value); ins.executeUpdate(); ins.close();
    return { success: true }; } catch(e) { return { success: false }; }
  },

  getAllDataPayload: function() {
    let conn;
    try {
      conn = this.getConnection();
      
      const payload = {
        tasks: [],
        projects: [],
        contexts: [],
        areas: [],
        settings: {}
      };
      
      const isPg = (PropertiesService.getScriptProperties().getProperty('DB_TYPE') || 'postgresql') === 'postgresql';

      // 1. Fetch all tasks and projects
      const mysqlTaskJson = "JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'title', COALESCE(t.title, ''), 'notes', COALESCE(t.notes, ''), 'status', COALESCE(t.status, 'inbox'), 'contextId', COALESCE(t.contextId, ''), 'waitingFor', COALESCE(t.waitingFor, ''), 'dueDate', COALESCE(t.dueDate, ''), 'scheduledDate', COALESCE(t.scheduledDate, ''), 'completedDate', COALESCE(t.completedDate, ''), 'createdDate', COALESCE(t.createdDate, ''), 'modifiedDate', COALESCE(t.modifiedDate, ''), 'emailId', COALESCE(t.emailId, ''), 'emailThreadId', COALESCE(t.emailThreadId, ''), 'priority', COALESCE(t.priority, 0), 'energyRequired', COALESCE(t.energyRequired, 'medium'), 'timeEstimate', COALESCE(t.timeEstimate, ''), 'parentTaskId', COALESCE(t.parentTaskId, ''), 'sortOrder', COALESCE(t.sortOrder, 0), 'type', COALESCE(t.type, 'task'), 'areaId', COALESCE(t.areaId, ''), 'importance', COALESCE(t.importance, ''), 'urgency', COALESCE(t.urgency, ''), 'isStarred', COALESCE(t.isStarred, false), 'reviewCadence', COALESCE(t.reviewCadence, 1), 'lastReviewed', COALESCE(t.lastReviewed, ''), 'aiContext', COALESCE(t.aiContext, '')))";
      const qTask = isPg ? "SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM tasks WHERE status != 'deleted') t" : `SELECT ${mysqlTaskJson} FROM (SELECT * FROM tasks WHERE status != 'deleted') t`;
      
      const stmt1 = conn.createStatement();
      // Increase group_concat limit implicitly just in case standard mysql defaults bite us (silent override)
      try { stmt1.execute("SET SESSION group_concat_max_len = 10000000;"); } catch(e){}
      
      const taskRs = stmt1.executeQuery(qTask);
      let allItems = [];
      if (taskRs.next()) {
        try {
            const rawStr = taskRs.getString(1); // EXACTLY ONE RPC CALL for the ENTIRE table payload!
            if (rawStr && rawStr !== 'null') {
                const arr = JSON.parse(rawStr);
                if (Array.isArray(arr)) {
                    allItems = arr.map(obj => {
                        obj.projectId = obj.parentTaskId || "";
                        obj.isStarred = obj.isStarred === true || obj.isStarred === 1 || obj.isStarred === "1";
                        obj.priority = parseInt(obj.priority) || 0;
                        obj.sortOrder = parseInt(obj.sortOrder) || 0;
                        obj.reviewCadence = parseInt(obj.reviewCadence) || 1;
                        return obj;
                    });
                }
            }
        } catch(e){}
      }
      taskRs.close();
      stmt1.close();
      
      payload.tasks = allItems.filter(t => (t.type === 'task' || !t.type) && t.status !== 'done');
      
      const activeProjectItems = allItems.filter(t => (t.type === 'project' || t.type === 'folder') && t.status !== 'done');
      payload.projects = activeProjectItems.map(task => {
        let status = task.status;
        if (status === 'done') status = 'completed';
        return {
          id: task.id, name: task.title, description: task.notes, status: status,
          areaId: task.areaId, dueDate: task.dueDate, createdDate: task.createdDate, completedDate: task.completedDate,
          sortOrder: task.sortOrder, parentProjectId: task.parentTaskId, type: task.type || 'project',
          scheduledDate: task.scheduledDate, reviewCadence: task.reviewCadence, lastReviewed: task.lastReviewed,
          aiContext: task.aiContext || ''
        };
      });

      // 2. Fetch contexts
      const mysqlCtxJson = "JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'name', t.name, 'icon', t.icon, 'sortOrder', t.sortOrder))";
      const qCtx = isPg ? "SELECT json_agg(row_to_json(t)) FROM (SELECT id, name, icon, sortOrder FROM contexts ORDER BY sortOrder ASC) t" : `SELECT ${mysqlCtxJson} FROM (SELECT * FROM contexts ORDER BY sortOrder ASC) t`;
      const stmt2 = conn.createStatement();
      const ctxRs = stmt2.executeQuery(qCtx);
      if (ctxRs.next()) {
        try { 
            const rawStr = ctxRs.getString(1);
            if (rawStr && rawStr !== 'null') {
                const arr = JSON.parse(rawStr);
                if (Array.isArray(arr)) payload.contexts = arr;
            }
        } catch(e){}
      }
      ctxRs.close();
      stmt2.close();

      // 3. Fetch areas
      const mysqlAreaJson = "JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'name', t.name, 'icon', t.icon, 'sortOrder', t.sortOrder, 'aiContext', t.aiContext))";
      const qArea = isPg ? "SELECT json_agg(row_to_json(t)) FROM (SELECT id, name, icon, sortOrder, aiContext FROM areas ORDER BY sortOrder ASC) t" : `SELECT ${mysqlAreaJson} FROM (SELECT * FROM areas ORDER BY sortOrder ASC) t`;
      const stmt3 = conn.createStatement();
      const areaRs = stmt3.executeQuery(qArea);
      if (areaRs.next()) {
        try { 
            const rawStr = areaRs.getString(1);
            if (rawStr && rawStr !== 'null') {
                const arr = JSON.parse(rawStr);
                if (Array.isArray(arr)) payload.areas = arr;
            }
        } catch(e){}
      }
      areaRs.close();
      stmt3.close();

      // 4. Fetch settings
      const mysqlSetJson = "JSON_ARRAYAGG(JSON_OBJECT('config_key', t.config_key, 'config_value', t.config_value))";
      const qSet = isPg ? "SELECT json_agg(row_to_json(t)) FROM (SELECT config_key, config_value FROM settings) t" : `SELECT ${mysqlSetJson} FROM (SELECT * FROM settings) t`;
      const stmt4 = conn.createStatement();
      const setRs = stmt4.executeQuery(qSet);
      if (setRs.next()) {
        try { 
            const rawStr = setRs.getString(1);
            if (rawStr && rawStr !== 'null') {
                const arr = JSON.parse(rawStr);
                if (Array.isArray(arr)) {
                    arr.forEach(s => payload.settings[s.config_key] = s.config_value);
                }
            }
        } catch(e){}
      }
      setRs.close();
      stmt4.close();

      return payload;
    } catch (e) {
      Logger.log("getAllDataPayload SQL Error: " + e.message);
      return { tasks: [], projects: [], contexts: [], areas: [], settings: {} };
    }
  }
};
