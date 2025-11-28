/**
 * GTD System - Project Service
 * Handles all project CRUD operations
 */

const ProjectService = {
  
  /**
   * Get all projects
   */
  getAllProjects: function() {
    const sheet = getSheet(SHEETS.PROJECTS);
    const data = sheet.getDataRange().getValues();
    const projects = [];
    
    for (let i = 1; i < data.length; i++) {
      projects.push(this.rowToProject(data[i]));
    }
    
    return projects;
  },
  
  /**
   * Get active projects
   */
  getActiveProjects: function() {
    return this.getAllProjects().filter(p => p.status === PROJECT_STATUS.ACTIVE);
  },
  
  /**
   * Get someday projects
   */
  getSomedayProjects: function() {
    return this.getAllProjects().filter(p => p.status === PROJECT_STATUS.SOMEDAY);
  },
  
  /**
   * Get completed projects
   */
  getCompletedProjects: function() {
    return this.getAllProjects().filter(p => p.status === PROJECT_STATUS.COMPLETED);
  },
  
  /**
   * Get a single project by ID
   */
  getProject: function(projectId) {
    const sheet = getSheet(SHEETS.PROJECTS);
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][PROJECT_COLS.ID] === projectId) {
        return this.rowToProject(data[i]);
      }
    }
    
    return null;
  },
  
  /**
   * Create a new project
   */
  createProject: function(projectData) {
    const sheet = getSheet(SHEETS.PROJECTS);
    const timestamp = now();
    
    const project = {
      id: generateUUID(),
      name: projectData.name || '',
      description: projectData.description || '',
      status: projectData.status || PROJECT_STATUS.ACTIVE,
      areaId: projectData.areaId || '',
      dueDate: projectData.dueDate || '',
      createdDate: timestamp,
      completedDate: '',
      sortOrder: projectData.sortOrder || this.getNextSortOrder(),
      parentProjectId: projectData.parentProjectId || ''
    };
    
    const row = this.projectToRow(project);
    sheet.appendRow(row);
    
    return project;
  },
  
  /**
   * Update an existing project
   */
  updateProject: function(projectId, updates) {
    const sheet = getSheet(SHEETS.PROJECTS);
    const rowNum = findRowById(sheet, projectId, PROJECT_COLS.ID);
    
    if (rowNum === -1) {
      return { success: false, error: 'Project not found' };
    }
    
    const data = sheet.getRange(rowNum, 1, 1, 10).getValues()[0];
    const project = this.rowToProject(data);
    
    // Apply updates
    Object.assign(project, updates);
    
    // Handle completion
    if (updates.status === PROJECT_STATUS.COMPLETED && !project.completedDate) {
      project.completedDate = now();
    }
    
    const row = this.projectToRow(project);
    sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
    
    return { success: true, project: project };
  },
  
  /**
   * Delete a project
   */
  deleteProject: function(projectId) {
    return this.updateProject(projectId, { status: PROJECT_STATUS.DROPPED });
  },
  
  /**
   * Complete a project
   */
  completeProject: function(projectId) {
    return this.updateProject(projectId, { 
      status: PROJECT_STATUS.COMPLETED,
      completedDate: now()
    });
  },
  
  /**
   * Get projects with their next actions
   */
  getProjectsWithNextActions: function() {
    const projects = this.getActiveProjects();
    const allTasks = TaskService.getAllTasks();
    
    return projects.map(project => {
      const tasks = allTasks.filter(t => 
        t.projectId === project.id && 
        t.status !== STATUS.DONE && 
        t.status !== STATUS.DELETED
      );
      
      const nextAction = tasks.find(t => t.status === STATUS.NEXT);
      const hasNextAction = !!nextAction;
      
      return {
        ...project,
        taskCount: tasks.length,
        nextAction: nextAction,
        hasNextAction: hasNextAction,
        tasks: tasks
      };
    });
  },
  
  /**
   * Get projects without next actions (for weekly review)
   */
  getProjectsWithoutNextActions: function() {
    return this.getProjectsWithNextActions().filter(p => !p.hasNextAction && p.taskCount > 0);
  },
  
  /**
   * Get projects by area
   */
  getProjectsByArea: function(areaId) {
    return this.getAllProjects().filter(p => p.areaId === areaId);
  },
  
  /**
   * Get next sort order value
   */
  getNextSortOrder: function() {
    const projects = this.getAllProjects();
    if (projects.length === 0) return 1;
    
    const maxOrder = Math.max(...projects.map(p => p.sortOrder || 0));
    return maxOrder + 1;
  },
  
  /**
   * Convert row array to project object
   */
  rowToProject: function(row) {
    return {
      id: row[PROJECT_COLS.ID] || '',
      name: row[PROJECT_COLS.NAME] || '',
      description: row[PROJECT_COLS.DESCRIPTION] || '',
      status: row[PROJECT_COLS.STATUS] || PROJECT_STATUS.ACTIVE,
      areaId: row[PROJECT_COLS.AREA_ID] || '',
      dueDate: formatDate(row[PROJECT_COLS.DUE_DATE]),
      createdDate: formatDateTime(row[PROJECT_COLS.CREATED_DATE]),
      completedDate: formatDateTime(row[PROJECT_COLS.COMPLETED_DATE]),
      sortOrder: row[PROJECT_COLS.SORT_ORDER] || 0,
      parentProjectId: row[PROJECT_COLS.PARENT_PROJECT_ID] || ''
    };
  },
  
  /**
   * Convert project object to row array
   */
  projectToRow: function(project) {
    const row = new Array(10).fill('');
    row[PROJECT_COLS.ID] = project.id;
    row[PROJECT_COLS.NAME] = project.name;
    row[PROJECT_COLS.DESCRIPTION] = project.description;
    row[PROJECT_COLS.STATUS] = project.status;
    row[PROJECT_COLS.AREA_ID] = project.areaId;
    row[PROJECT_COLS.DUE_DATE] = project.dueDate;
    row[PROJECT_COLS.CREATED_DATE] = project.createdDate;
    row[PROJECT_COLS.COMPLETED_DATE] = project.completedDate;
    row[PROJECT_COLS.SORT_ORDER] = project.sortOrder;
    row[PROJECT_COLS.PARENT_PROJECT_ID] = project.parentProjectId;
    return row;
  }
};