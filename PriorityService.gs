/**
 * GTD System - Priority Service
 * Implements MLO-style Computed Score Algorithm
 * Score = (Importance * Urgency) + StarBonus + Modifiers
 */

const PriorityService = {
  
  /**
   * Calculate priority score for a task (MLO Style)
   * Returns a float score (Higher = Top of list)
   */
  calculatePriority: function(task, settings) {
    if (!settings) {
      settings = getSettings();
    }
    
    // 1. START DATE CHECK (The Gatekeeper)
    // If Scheduled start date is in the future, priority is effectively zero/hidden
    if (task.scheduledDate) {
      const start = parseDate(task.scheduledDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (start > today) {
        return 0.1; // "Future" status, very low priority but not invisible
      }
    }

    // 2. BASE METRICS
    // Default to Low/Normal if unset to avoid zero-multiplication issues
    // Importance: 1 (Min) to 5 (Max)
    let imp = task.importance ? parseInt(task.importance) : 2; 
    
    // Urgency: 1 (Min) to 5 (Max)
    let urg = task.urgency ? parseInt(task.urgency) : 2;

    // 3. DUE DATE MODIFIER (Increases Urgency)
    // If due date is approaching, Urgency skyrockets
    if (task.dueDate) {
      const dueScore = this.calculateDueDateMultiplier(task.dueDate);
      urg = urg * dueScore; // MLO behavior: Due date amplifies urgency
    }

    // 4. COMPUTED BASE SCORE
    // Importance * Urgency
    let computedScore = (imp * 10) * (urg * 10); // Scale up for visibility

    // 5. STAR BONUS (Top of Pile)
    if (task.isStarred) {
      computedScore += PRIORITY_WEIGHTS.STAR_BONUS;
    }

    // 6. CONTEXTUAL MODIFIERS (Additive Bonuses)
    
    // Context Match
    if (task.contextId && settings.currentContext && task.contextId === settings.currentContext) {
      computedScore += 50; // Significant boost for context match
    }

    // Energy Match
    if (task.energyRequired && settings.currentEnergyLevel) {
       if (task.energyRequired === settings.currentEnergyLevel) computedScore += 20;
       // Lower energy requirement than available is also good
       else if (settings.currentEnergyLevel === 'high' && task.energyRequired !== 'high') computedScore += 10;
    }

    // Age Bonus (Anti-Stagnation)
    if (task.createdDate) {
        computedScore += this.calculateAgeScore(task.createdDate);
    }
    
    return parseFloat(computedScore.toFixed(2));
  },
  
  /**
   * Calculate multiplier based on Due Date proximity
   * Returns 1.0 (far), increasing to 3.0+ (overdue)
   */
  calculateDueDateMultiplier: function(dueDate) {
    if (!dueDate) return 1.0;
    
    const due = parseDate(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = due - today;
    const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Overdue: Extreme urgency
    if (daysUntilDue < 0) return 4.0 + (Math.abs(daysUntilDue) * 0.1);
    
    // Due Today: Very High
    if (daysUntilDue === 0) return 3.0;
    
    // Due Tomorrow
    if (daysUntilDue === 1) return 2.0;
    
    // Due this week (Linear scaling from 1.5 to 1.1)
    if (daysUntilDue <= 7) return 1.5;
    
    return 1.0;
  },

  /**
   * Minor bonus for older tasks
   */
  calculateAgeScore: function(createdDate) {
    if (!createdDate) return 0;
    const created = parseDate(createdDate);
    const now = new Date();
    const daysOld = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    
    // Cap at 15 points
    return Math.min(daysOld * 0.5, 15);
  },
  
  /**
   * Dependency check (Stubbed for performance)
   */
  calculateDependencyScore: function(taskId) {
    return 0; 
  },
  
  /**
   * Get priority label for display
   * Adjusted for new scoring scale (0-1000+)
   */
  getPriorityLabel: function(score) {
    if (score >= 400) return { label: 'Critical', class: 'priority-critical' }; // Star + High/High
    if (score >= 200) return { label: 'High', class: 'priority-high' };         // High/High or Star/Low
    if (score >= 100) return { label: 'Medium', class: 'priority-medium' };     // Normal
    return { label: 'Low', class: 'priority-low' };
  },
  
  // Settings updates trigger recalculation
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