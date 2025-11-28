/**
 * GTD System - Priority Service
 * Implements the 7-factor priority algorithm
 */

const PriorityService = {
  
  /**
   * Calculate priority score for a task
   * Returns a score from 0-100
   */
  calculatePriority: function(task, settings) {
    if (!settings) {
      settings = getSettings();
    }
    
    let score = 0;
    
    // Factor 1: Due Date Proximity (0-20 points)
    score += this.calculateDueDateScore(task.dueDate);
    
    // Factor 2: Project Importance (0-15 points)
    score += this.calculateProjectScore(task.projectId);
    
    // Factor 3: Context Match (0-15 points)
    score += this.calculateContextScore(task.contextId, settings.currentContext);
    
    // Factor 4: Energy Match (0-10 points)
    score += this.calculateEnergyScore(task.energyRequired, settings.currentEnergyLevel);
    
    // Factor 5: Time Available (0-10 points)
    score += this.calculateTimeScore(task.timeEstimate, settings.availableMinutes);
    
    // Factor 6: Age (0-15 points)
    score += this.calculateAgeScore(task.createdDate);
    
    // Factor 7: Dependencies (0-15 points)
    score += this.calculateDependencyScore(task.id);
    
    return Math.round(score);
  },
  
  /**
   * Factor 1: Due Date Proximity
   * Closer due dates = higher score
   */
  calculateDueDateScore: function(dueDate) {
    if (!dueDate) return 0;
    
    const due = parseDate(dueDate);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    const daysUntilDue = Math.ceil((due - todayDate) / (1000 * 60 * 60 * 24));
    
    // Overdue items get maximum points
    if (daysUntilDue < 0) return PRIORITY_WEIGHTS.DUE_DATE;
    
    // Due today
    if (daysUntilDue === 0) return PRIORITY_WEIGHTS.DUE_DATE;
    
    // Due tomorrow
    if (daysUntilDue === 1) return PRIORITY_WEIGHTS.DUE_DATE * 0.9;
    
    // Due this week
    if (daysUntilDue <= 7) return PRIORITY_WEIGHTS.DUE_DATE * 0.7;
    
    // Due this month
    if (daysUntilDue <= 30) return PRIORITY_WEIGHTS.DUE_DATE * 0.4;
    
    // Due later
    return PRIORITY_WEIGHTS.DUE_DATE * 0.1;
  },
  
  /**
   * Factor 2: Project Importance
   * Based on project due date and active status
   */
  calculateProjectScore: function(projectId) {
    if (!projectId) return 0;
    
    const project = ProjectService.getProject(projectId);
    if (!project) return 0;
    
    let score = 0;
    
    // Active projects get base points
    if (project.status === PROJECT_STATUS.ACTIVE) {
      score += PRIORITY_WEIGHTS.PROJECT_IMPORTANCE * 0.5;
    }
    
    // Project with due date gets more points
    if (project.dueDate) {
      const dueDateScore = this.calculateDueDateScore(project.dueDate);
      score += (dueDateScore / PRIORITY_WEIGHTS.DUE_DATE) * (PRIORITY_WEIGHTS.PROJECT_IMPORTANCE * 0.5);
    }
    
    return score;
  },
  
  /**
   * Factor 3: Context Match
   * Tasks matching current context score higher
   */
  calculateContextScore: function(taskContextId, currentContextId) {
    if (!taskContextId || !currentContextId) {
      // No context set = available anywhere, moderate score
      return PRIORITY_WEIGHTS.CONTEXT_MATCH * 0.5;
    }
    
    if (taskContextId === currentContextId) {
      return PRIORITY_WEIGHTS.CONTEXT_MATCH;
    }
    
    return 0;
  },
  
  /**
   * Factor 4: Energy Match
   * Tasks matching current energy level score higher
   */
  calculateEnergyScore: function(taskEnergy, currentEnergy) {
    if (!taskEnergy || !currentEnergy) {
      return PRIORITY_WEIGHTS.ENERGY_MATCH * 0.5;
    }
    
    const energyLevels = { low: 1, medium: 2, high: 3 };
    const taskLevel = energyLevels[taskEnergy] || 2;
    const currentLevel = energyLevels[currentEnergy] || 2;
    
    // Perfect match
    if (taskLevel === currentLevel) {
      return PRIORITY_WEIGHTS.ENERGY_MATCH;
    }
    
    // Task requires less energy than available = good
    if (taskLevel < currentLevel) {
      return PRIORITY_WEIGHTS.ENERGY_MATCH * 0.7;
    }
    
    // Task requires more energy than available = less ideal
    return PRIORITY_WEIGHTS.ENERGY_MATCH * 0.3;
  },
  
  /**
   * Factor 5: Time Available
   * Tasks that fit in available time score higher
   */
  calculateTimeScore: function(timeEstimate, availableMinutes) {
    if (!timeEstimate || !availableMinutes) {
      return PRIORITY_WEIGHTS.TIME_AVAILABLE * 0.5;
    }
    
    const estimate = parseInt(timeEstimate) || 30;
    const available = parseInt(availableMinutes) || 60;
    
    // Task fits perfectly (within 20% of available time)
    if (estimate >= available * 0.8 && estimate <= available) {
      return PRIORITY_WEIGHTS.TIME_AVAILABLE;
    }
    
    // Task fits with time to spare
    if (estimate < available) {
      return PRIORITY_WEIGHTS.TIME_AVAILABLE * 0.8;
    }
    
    // Task doesn't fit
    return PRIORITY_WEIGHTS.TIME_AVAILABLE * 0.2;
  },
  
  /**
   * Factor 6: Age
   * Older incomplete tasks get higher priority to prevent stagnation
   */
  calculateAgeScore: function(createdDate) {
    if (!createdDate) return 0;
    
    const created = parseDate(createdDate);
    const now = new Date();
    const daysOld = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    
    // Less than a day old
    if (daysOld < 1) return 0;
    
    // 1-3 days old
    if (daysOld <= 3) return PRIORITY_WEIGHTS.AGE * 0.2;
    
    // 4-7 days old
    if (daysOld <= 7) return PRIORITY_WEIGHTS.AGE * 0.4;
    
    // 1-2 weeks old
    if (daysOld <= 14) return PRIORITY_WEIGHTS.AGE * 0.6;
    
    // 2-4 weeks old
    if (daysOld <= 28) return PRIORITY_WEIGHTS.AGE * 0.8;
    
    // More than a month old
    return PRIORITY_WEIGHTS.AGE;
  },
  
  /**
   * Factor 7: Dependencies
   * Tasks that block other tasks get higher priority
   */
  calculateDependencyScore: function(taskId) {
    // Count how many tasks have this task as their parent
    const allTasks = TaskService.getAllTasks();
    const dependentTasks = allTasks.filter(t => 
      t.parentTaskId === taskId && 
      t.status !== STATUS.DONE && 
      t.status !== STATUS.DELETED
    );
    
    const count = dependentTasks.length;
    
    if (count === 0) return 0;
    if (count === 1) return PRIORITY_WEIGHTS.DEPENDENCIES * 0.3;
    if (count <= 3) return PRIORITY_WEIGHTS.DEPENDENCIES * 0.6;
    
    return PRIORITY_WEIGHTS.DEPENDENCIES;
  },
  
  /**
   * Get priority label for display
   */
  getPriorityLabel: function(score) {
    if (score >= 80) return { label: 'Critical', class: 'priority-critical' };
    if (score >= 60) return { label: 'High', class: 'priority-high' };
    if (score >= 40) return { label: 'Medium', class: 'priority-medium' };
    if (score >= 20) return { label: 'Low', class: 'priority-low' };
    return { label: 'None', class: 'priority-none' };
  },
  
  /**
   * Update context and energy settings (for priority recalculation)
   */
  updateCurrentContext: function(contextId) {
    updateSetting('currentContext', contextId);
    TaskService.recalculateAllPriorities();
  },
  
  updateCurrentEnergy: function(energyLevel) {
    updateSetting('currentEnergyLevel', energyLevel);
    TaskService.recalculateAllPriorities();
  },
  
  updateAvailableTime: function(minutes) {
    updateSetting('availableMinutes', minutes);
    TaskService.recalculateAllPriorities();
  }
};