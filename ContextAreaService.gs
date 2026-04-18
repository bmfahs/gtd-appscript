/**
 * GTD System - Context Service
 * Handles context operations
 */

const ContextService = {
  
  /**
   * Get all contexts
   */
  getAllContexts: function() {
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) return DatabaseService.getAllContexts();
    
    const sheet = getSheet(SHEETS.CONTEXTS);
    const data = sheet.getDataRange().getValues();
    const contexts = [];
    
    for (let i = 1; i < data.length; i++) {
      contexts.push(this.rowToContext(data[i]));
    }
    
    return sortBy(contexts, 'sortOrder', true);
  },
  
  /**
   * Get a single context by ID
   */
  getContext: function(contextId) {
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) return DatabaseService.getTaskContext(contextId);

    const contexts = this.getAllContexts();
    return contexts.find(c => c.id === contextId) || null;
  },
  
  /**
   * Create a new context
   */
  createContext: function(contextData) {
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
        if (typeof clearDataCache === 'function') clearDataCache();
        return DatabaseService.createContext(contextData);
    }

    const sheet = getSheet(SHEETS.CONTEXTS);
    
    const context = {
      id: generateUUID(),
      name: contextData.name || '',
      icon: contextData.icon || '📋',
      sortOrder: contextData.sortOrder || this.getNextSortOrder()
    };
    
    const row = [context.id, context.name, context.icon, context.sortOrder];
    sheet.appendRow(row);
    
    if (typeof clearDataCache === 'function') clearDataCache();
    return context;
  },
  
  /**
   * Update a context
   */
  updateContext: function(contextId, updates) {
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
        if (typeof clearDataCache === 'function') clearDataCache();
        return DatabaseService.updateContext(contextId, updates);
    }

    const sheet = getSheet(SHEETS.CONTEXTS);
    const rowNum = findRowById(sheet, contextId, CONTEXT_COLS.ID);
    
    if (rowNum === -1) {
      return { success: false, error: 'Context not found' };
    }
    
    const data = sheet.getRange(rowNum, 1, 1, 4).getValues()[0];
    const context = this.rowToContext(data);
    
    Object.assign(context, updates);
    
    const row = [context.id, context.name, context.icon, context.sortOrder];
    sheet.getRange(rowNum, 1, 1, 4).setValues([row]);
    
    if (typeof clearDataCache === 'function') clearDataCache();
    return { success: true, context: context };
  },
  
  /**
   * Delete a context
   */
  deleteContext: function(contextId) {
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
        if (typeof clearDataCache === 'function') clearDataCache();
        return DatabaseService.deleteContext(contextId);
    }

    const sheet = getSheet(SHEETS.CONTEXTS);
    const rowNum = findRowById(sheet, contextId, CONTEXT_COLS.ID);
    
    if (rowNum === -1) {
      return { success: false, error: 'Context not found' };
    }
    
    sheet.deleteRow(rowNum);
    if (typeof clearDataCache === 'function') clearDataCache();
    return { success: true };
  },
  
  /**
   * Get next sort order
   */
  getNextSortOrder: function() {
    const contexts = this.getAllContexts();
    if (contexts.length === 0) return 1;
    return Math.max(...contexts.map(c => c.sortOrder || 0)) + 1;
  },
  
  /**
   * Convert row to context object
   */
  rowToContext: function(row) {
    return {
      id: row[CONTEXT_COLS.ID] || '',
      name: row[CONTEXT_COLS.NAME] || '',
      icon: row[CONTEXT_COLS.ICON] || '📋',
      sortOrder: row[CONTEXT_COLS.SORT_ORDER] || 0
    };
  }
};

/**
 * GTD System - Area Service
 * Handles area operations
 */

const AreaService = {
  
  /**
   * Get all areas
   */
  getAllAreas: function() {
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) return DatabaseService.getAllAreas();

    const sheet = getSheet(SHEETS.AREAS);
    const data = sheet.getDataRange().getValues();
    const areas = [];
    
    for (let i = 1; i < data.length; i++) {
      areas.push(this.rowToArea(data[i]));
    }
    
    return sortBy(areas, 'sortOrder', true);
  },
  
  /**
   * Get a single area by ID
   */
  getArea: function(areaId) {
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) return DatabaseService.getArea(areaId);

    const areas = this.getAllAreas();
    return areas.find(a => a.id === areaId) || null;
  },
  
  /**
   * Create a new area
   */
  createArea: function(areaData) {
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
        if (typeof clearDataCache === 'function') clearDataCache();
        return DatabaseService.createArea(areaData);
    }

    const sheet = getSheet(SHEETS.AREAS);
    
    const area = {
      id: generateUUID(),
      name: areaData.name || '',
      icon: areaData.icon || '📁',
      sortOrder: areaData.sortOrder || this.getNextSortOrder(),
      aiContext: areaData.aiContext || ''
    };
    
    const row = [area.id, area.name, area.icon, area.sortOrder, area.aiContext];
    sheet.appendRow(row);
    
    if (typeof clearDataCache === 'function') clearDataCache();
    return area;
  },
  
  /**
   * Update an area
   */
  updateArea: function(areaId, updates) {
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
        if (typeof clearDataCache === 'function') clearDataCache();
        return DatabaseService.updateArea(areaId, updates);
    }

    const sheet = getSheet(SHEETS.AREAS);
    const rowNum = findRowById(sheet, areaId, AREA_COLS.ID);
    
    if (rowNum === -1) {
      return { success: false, error: 'Area not found' };
    }
    
    const data = sheet.getRange(rowNum, 1, 1, 5).getValues()[0];
    const area = this.rowToArea(data);
    
    Object.assign(area, updates);
    
    const row = [area.id, area.name, area.icon, area.sortOrder, area.aiContext || ''];
    sheet.getRange(rowNum, 1, 1, 5).setValues([row]);
    
    if (typeof clearDataCache === 'function') clearDataCache();
    return { success: true, area: area };
  },
  
  /**
   * Delete an area
   */
  deleteArea: function(areaId) {
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
        if (typeof clearDataCache === 'function') clearDataCache();
        return DatabaseService.deleteArea(areaId);
    }

    const sheet = getSheet(SHEETS.AREAS);
    const rowNum = findRowById(sheet, areaId, AREA_COLS.ID);
    
    if (rowNum === -1) {
      return { success: false, error: 'Area not found' };
    }
    
    sheet.deleteRow(rowNum);
    if (typeof clearDataCache === 'function') clearDataCache();
    return { success: true };
  },
  
  /**
   * Get next sort order
   */
  getNextSortOrder: function() {
    const areas = this.getAllAreas();
    if (areas.length === 0) return 1;
    return Math.max(...areas.map(a => a.sortOrder || 0)) + 1;
  },
  
  /**
   * Convert row to area object
   */
  rowToArea: function(row) {
    return {
      id: row[AREA_COLS.ID] || '',
      name: row[AREA_COLS.NAME] || '',
      icon: row[AREA_COLS.ICON] || '📁',
      sortOrder: row[AREA_COLS.SORT_ORDER] || 0,
      aiContext: row[AREA_COLS.AI_CONTEXT] || ''
    };
  }
};