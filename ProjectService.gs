/**
 * GTD System - Project Service
 * Handles all project CRUD operations
 */

/**
 * GTD System - Project Service
 * Handles all project CRUD operations
 * Refactored to use Tasks sheet (Type = 'project')
 */

const ProjectService = {
  
  /**
   * Get all projects
   */
  getAllProjects: function() {
    // Delegate to TaskService
    const projects = TaskService.getItemsByType(TASK_TYPE.PROJECT);
    return projects.map(p => this.taskToProject(p));
  },
  
  /**
   * Get active projects
   */
  getActiveProjects: function() {
    return this.getAllProjects().filter(p => p.status === 'active');
  },
  
  /**
   * Get someday projects
   */
  getSomedayProjects: function() {
    return this.getAllProjects().filter(p => p.status === 'someday');
  },
  
  /**
   * Get completed projects
   */
  getCompletedProjects: function() {
    // Project 'completed' status maps to Task 'done' status internally, but project object exposes 'completed'
    return this.getAllProjects().filter(p => p.status === 'completed');
  },
  
  /**
   * Get a single project by ID
   */
  getProject: function(projectId) {
    const task = TaskService.getTask(projectId);
    if (task && task.type === TASK_TYPE.PROJECT) {
      return this.taskToProject(task);
    }
    return null;
  },
  
  /**
   * Create a new project
   */
  createProject: function(projectData) {
    // Create via TaskService
    const taskData = {
      title: projectData.name,
      notes: projectData.description,
      status: projectData.status || 'active', // 'active' is valid for project type
      // dueDate: projectData.dueDate,
      dueDate: projectData.dueDate,
      type: projectData.type || TASK_TYPE.PROJECT,
      areaId: projectData.areaId,
      sortOrder: projectData.sortOrder,
      parentTaskId: projectData.parentProjectId // Map parent project to parent task
    };
    
    const task = TaskService.createTask(taskData);
    return this.taskToProject(task);
  },
  
  /**
   * Update an existing project
   */
  updateProject: function(projectId, updates) {
    // Map project updates to task updates
    const taskUpdates = {};
    if (updates.name !== undefined) taskUpdates.title = updates.name;
    if (updates.description !== undefined) taskUpdates.notes = updates.description;
    if (updates.status !== undefined) {
        taskUpdates.status = updates.status;
        // Map legacy statuses if needed, though 'active'/'completed' are fine
        if (updates.status === 'completed') taskUpdates.status = STATUS.DONE;
    } 
    if (updates.areaId !== undefined) taskUpdates.areaId = updates.areaId;
    if (updates.dueDate !== undefined) taskUpdates.dueDate = updates.dueDate;
    if (updates.sortOrder !== undefined) taskUpdates.sortOrder = updates.sortOrder;
    if (updates.parentProjectId !== undefined) taskUpdates.parentTaskId = updates.parentProjectId;
    if (updates.type !== undefined) taskUpdates.type = updates.type;
    
    const result = TaskService.updateTask(projectId, taskUpdates);
    
    if (result.success) {
      return { success: true, project: this.taskToProject(result.task) };
    }
    return result;
  },
  
  /**
   * Delete a project
   */
  deleteProject: function(projectId) {
    // Delegate to TaskService soft delete
    return TaskService.deleteTask(projectId);
  },
  
  /**
   * Complete a project
   */
  completeProject: function(projectId) {
    // Delegate to TaskService complete
    return TaskService.completeTask(projectId);
  },
  
  /**
   * Get projects with their next actions
   */
  getProjectsWithNextActions: function() {
    const projects = this.getActiveProjects();
    const allTasks = TaskService.getAllTasks(); // Returns only type='task'
    
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
    return TaskService.getNextSortOrder();
  },
  
  /**
   * Adapter: Convert Task object to Project object
   * This maintains API compatibility for frontend
   */
  taskToProject: function(task) {
    if (!task) return null;
    
    // Map status for frontend compatibility
    // Internal: 'done' -> External: 'completed'
    let status = task.status;
    if (status === STATUS.DONE) status = 'completed';
    
    return {
      id: task.id,
      name: task.title,
      description: task.notes,
      status: status,
      areaId: task.areaId,
      dueDate: task.dueDate,
      createdDate: task.createdDate,
      completedDate: task.completedDate,
      sortOrder: task.sortOrder,
      sortOrder: task.sortOrder,
      parentProjectId: task.parentTaskId, // Parent Task IS Parent Project
      type: task.type || TASK_TYPE.PROJECT
    };
  }
};