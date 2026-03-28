/**
 * GTD System - AI Agent Service (Hybrid On-Demand)
 * Handles dual-context (Global + Project) logic
 */

const AIAgentService = {
  
  /**
   * Generate insights for a specific project
   */
  generateProjectInsights: function(projectId) {
    const project = ProjectService.getProject(projectId);
    if (!project) return { success: false, error: 'Project not found' };
    
    // Global context
    const settings = getSettings();
    const globalContext = settings['GLOBAL_AI_CONTEXT'] || '';
    
    // Project context
    const projectContext = project.aiContext || '';
    
    if (!globalContext && !projectContext) {
      return { success: false, error: 'No AI Context found. Please add Global or Project AI Context to use insights.' };
    }
    
    const tasks = TaskService.getTasksByProject(projectId).filter(t => t.status !== STATUS.DONE && t.status !== STATUS.DELETED);
    const taskDescriptions = tasks.map(t => `- ${t.title} [Status: ${t.status}]`).join('\\n');
    
    const prompt = `
      You are an expert productivity consultant and GTD manager.
      
      GLOBAL AI CONTEXT (Guiding principles & priorities for the whole system):
      """
      ${globalContext || "(No global context defined)"}
      """
      
      CURRENT PROJECT: "${project.name}"
      PROJECT-SPECIFIC CONTEXT (Rules and objectives for this specific project):
      """
      ${projectContext || "(No project specific context defined)"}
      """
      
      ACTIVE TASKS IN THIS PROJECT:
      ${taskDescriptions || "(No active tasks)"}
      
      Analyze the contexts and tasks to provide actionable insights for this project, keeping the global context in mind.
      Respond strictly in JSON format:
      {
        "nextSteps": ["string", "string"],
        "focusAreas": ["string", "string"],
        "suggestedTasks": ["string", "string"]
      }
    `;
    
    const res = this.callGemini(prompt);
    if (res.success && res.data) {
      return { 
        success: true, 
        nextSteps: res.data.nextSteps || [],
        focusAreas: res.data.focusAreas || [],
        suggestedTasks: res.data.suggestedTasks || []
      };
    }
    return { success: false, error: 'Failed to generate insights: ' + (res.error || 'Unknown AI failure') };
  },
  
  /**
   * Suggest alignment for an Inbox item
   */
  suggestAlignmentForInbox: function(taskIds) {
    if (!taskIds || !taskIds.length) return { success: false, error: 'No tasks provided' };
    
    const tasks = taskIds.map(id => TaskService.getTask(id)).filter(t => t);
    if (!tasks.length) return { success: false, error: 'Tasks not found' };
    
    const settings = getSettings();
    const globalContext = settings['GLOBAL_AI_CONTEXT'] || '';
    
    const projects = ProjectService.getActiveProjects();
    const projectSnippets = projects.map(p => {
      let snippet = `ID: ${p.id} | Name: ${p.name}`;
      if (p.aiContext) snippet += ` | Context: ${p.aiContext.substring(0, 100)}...`;
      return snippet;
    }).join('\n');
    
    const tasksSnippets = tasks.map(t => `ID: ${t.id} | Title: "${t.title}" | Notes: "${t.notes}"`).join('\n');

    const prompt = `
      You are an expert productivity consultant. Route the following Inbox tasks.
      
      GLOBAL AI CONTEXT:
      """
      ${globalContext || "(No global context defined)"}
      """
      
      INBOX TASKS TO ROUTE:
      ${tasksSnippets}
      
      AVAILABLE ACTIVE PROJECTS:
      ${projectSnippets || "(No active projects)"}
      
      Based heavily on the GLOBAL AI CONTEXT, route each task to an existing project or suggest forming a new one.
      
      Respond strictly in JSON format as an ARRAY of objects, one for each task:
      [
        {
          "taskId": "ID of the task",
          "suggestedAction": "EXISTING_PROJECT" or "NEW_PROJECT",
          "projectId": "ID of existing project if EXISTING_PROJECT, otherwise empty string",
          "newProjectName": "Name of new project if NEW_PROJECT, otherwise empty string",
          "newParentProjectId": "If NEW_PROJECT, the ID of the parent project/folder it should logically be placed in based on the global context rules. Empty string if root.",
          "reasoning": "Brief explanation of why"
        }
      ]
    `;
    const res = this.callGemini(prompt);
    if (!res.success) return res;
    
    return { success: true, suggestions: res.data || [] };
  },
  
  /**
   * Rewrite AI Context based on User Correction
   */
  learnFromCorrection: function(taskId, wrongId, rightId) {
    const task = TaskService.getTask(taskId);
    const wrongProject = ProjectService.getProject(wrongId) || { name: wrongId };
    const rightProject = ProjectService.getProject(rightId);
    
    if (!task || !rightProject) return { success: false, error: 'Missing entities' };
    
    const rightContext = rightProject.aiContext || '';
    
    const prompt = `
      You are an underlying GTD application AI. The user just taught you how they categorize tasks!
      
      TASK DETAILS:
      Title: "${task.title}"
      Notes: "${task.notes}"
      
      EVENT:
      The user explicitly placed this task into the project/folder "${rightProject.name}", moving it away from "${wrongProject.name}".
      
      CURRENT CONTEXT FOR "${rightProject.name}":
      """
      ${rightContext || "(No existing context)"}
      """
      
      Task: Rewrite the AI context for "${rightProject.name}" so that you can automatically suggest placing similar tasks here in the future.
      Preserve all other existing rules in the context. Keep it concise.
      
      Respond strictly in JSON format:
      {
        "newAiContext": "The complete, rewritten context for the right project."
      }
    `;
    
    const res = this.callGemini(prompt);
    if (res.success && res.data && res.data.newAiContext) {
      ProjectService.updateProject(rightId, { aiContext: res.data.newAiContext });
      return { success: true, message: 'Context updated automatically', newContext: res.data.newAiContext };
    }
    return { success: false, error: 'Failed to rewrite context' };
  },
  
  /**
   * Rewrite Global Context based on Structural Movement
   */
  trainGlobalContextOnProjectMove: function(projectId, oldParentId, newParentId, fallbackName) {
    if (!newParentId) return { success: false, reason: 'Moved to root' };
    
    let project = ProjectService.getProject(projectId);
    let newParent = ProjectService.getProject(newParentId);
    
    if (!project && fallbackName) {
        project = { name: fallbackName };
    }
    
    if (!project || !newParent) {
        return { success: false, error: 'Database mismatch: Child Found=' + !!project + ', Parent Found=' + !!newParent };
    }
    
    const settings = getSettings();
    const globalContext = settings['GLOBAL_AI_CONTEXT'] || '';
    
    const prompt = `
      You are an underlying GTD application AI. The user just taught you how they structure their projects!
      
      EVENT:
      The user moved the project/folder "${project.name}" so that it is now inside the parent folder/project "${newParent.name}".
      
      CURRENT GLOBAL AI CONTEXT:
      """
      ${globalContext || "(No existing rule)"}
      """
      
      Task: Rewrite the GLOBAL AI CONTEXT to implicitly include a one-sentence rule that new projects similar to "${project.name}" should automatically be suggested to be created inside the parent project "${newParent.name}".
      Preserve all other existing rules in the context. Keep it concise.
      
      Respond strictly in JSON format:
      {
        "newAiContext": "The completely rewritten global AI context string."
      }
    `;
    
    const res = this.callGemini(prompt);
    if (res.success && res.data && res.data.newAiContext) {
      updateSetting('GLOBAL_AI_CONTEXT', res.data.newAiContext);
      return { success: true, newContext: res.data.newAiContext };
    }
    return { success: false, error: 'Gemini Parsing Error: ' + (res.error || 'Empty newAiContext payload returned.') };
  },
  
  /**
   * Generate Initial Context for user-created New Projects
   */
  generateInitialContextForNewProject: function(taskId, projectName) {
    const task = TaskService.getTask(taskId);
    if (!task) return { success: false, error: 'Missing task' };
    
    const prompt = `
      You are an underlying GTD application AI. The user rejected an AI suggestion, and instead decided to create a completely new project named "${projectName}" specifically to hold the following task:
      
      TASK DETAILS:
      Title: "${task.title}"
      Notes: "${task.notes}"
      
      Task: Generate a concise 1-2 sentence AI project context rule that dictates what types of future tasks safely belong in this exact project.
      
      Respond strictly in JSON format:
      {
        "newAiContext": "Rule for routing future tasks here."
      }
    `;
    
    const res = this.callGemini(prompt);
    if (res.success && res.data && res.data.newAiContext) {
      return { success: true, newContext: res.data.newAiContext };
    }
    return { success: false, error: 'Failed to generate initial context' };
  },
  
  /**
   * Helper to call Gemini AI
   */
  callGemini: function(prompt) {
    const apiKey = AIService.getApiKey();
    if (!apiKey) return { success: false, error: 'Gemini API Key missing in Script Properties' };
    
    const modelName = AIService.getModelName(apiKey);
    if (!modelName) return { success: false, error: 'No suitable Gemini model found' };
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    };
    
    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      
      if (responseCode !== 200) {
        return { success: false, error: 'API Error (' + responseCode + '): ' + responseText };
      }
      
      const data = JSON.parse(responseText);
      if (!data.candidates || data.candidates.length === 0) {
          return { success: false, error: 'No response from AI' };
      }
      const content = data.candidates[0].content.parts[0].text;
      
      const jsonString = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(jsonString);
      return { success: true, data: result };
      
    } catch (e) {
      return { success: false, error: 'Analysis failed: ' + e.toString() };
    }
  }
};

/**
 * Global functions exposed to the client
 */
function generateProjectInsights(projectId) {
  return AIAgentService.generateProjectInsights(projectId);
}

function suggestAlignmentForInbox(taskIds) {
  return AIAgentService.suggestAlignmentForInbox(taskIds);
}

function learnFromCorrection(taskId, wrongId, rightId) {
  return AIAgentService.learnFromCorrection(taskId, wrongId, rightId);
}

function trainGlobalContextOnProjectMove(projectId, oldParentId, newParentId, fallbackName) {
  return AIAgentService.trainGlobalContextOnProjectMove(projectId, oldParentId, newParentId, fallbackName);
}

function generateInitialContextForNewProject(taskId, projectName) {
  return AIAgentService.generateInitialContextForNewProject(taskId, projectName);
}

function getGlobalAIContext() {
  return getSettings()['GLOBAL_AI_CONTEXT'] || '';
}

function updateGlobalAIContext(contextText) {
  return updateSetting('GLOBAL_AI_CONTEXT', contextText);
}
