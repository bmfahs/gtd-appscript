/**
 * GTD System - AI Agent Service (Hybrid On-Demand)
 * Handles dual-context (Global + Project) logic
 */

const AIAgentService = {

  /**
   * Helper to evaluate and aggregate the full parental structural ruleset graph up to the root
   */
  getContextLineage: function(startItem, allItems) {
    if (!startItem || !allItems || allItems.length === 0) return "(No project specific context defined)";
    
    const itemMap = {};
    allItems.forEach(i => itemMap[i.id] = i);
    
    const lineage = [];
    let currentId = startItem.id;
    const visited = new Set();
    
    while (currentId && itemMap[currentId] && !visited.has(currentId)) {
        visited.add(currentId);
        const node = itemMap[currentId];
        
        let ctx = node.aiContext ? node.aiContext.trim() : "";
        if (ctx) {
            let label = node.type ? node.type.toUpperCase() : "CONTAINER";
            lineage.push(`[${label}: ${node.title}]: ${ctx}`);
        }
        
        currentId = node.parentTaskId; // Navigate Upwards
    }
    
    if (lineage.length === 0) return "(No parent context defined)";
    return lineage.reverse().join("\\n      ");
  },

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
    const allItems = TaskService.getAllItems();
    const projectContext = this.getContextLineage(project, allItems);
    
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
    
    // Exploit the high-speed JSON Unified Payload instead of firing N individual SQL JDBC ResultSet iterations
    let payload;
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
        payload = DatabaseService.getAllDataPayload();
    } else {
        payload = {
            tasks: TaskService.getAllItems(),
            projects: ProjectService.getActiveProjects(),
            settings: getSettings()
        };
    }
    
    const taskMap = {};
    payload.tasks.forEach(t => taskMap[t.id] = t);
    
    const tasks = taskIds.map(id => taskMap[id]).filter(t => t);
    if (!tasks.length) return { success: false, error: 'Tasks not found in payload' };
    
    const settings = payload.settings || {};
    const globalContext = settings['GLOBAL_AI_CONTEXT'] || '';
    
    const projects = payload.projects.filter(p => p.status === 'active');
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
   * Suggest Attention view fixes (Stalled Projects + Task Hygiene)
   */
  suggestAttentionFixes: function(payload) {
    if (!payload || (!payload.stalledProjectIds.length && !payload.malformedTaskIds.length)) {
      return { success: false, error: 'No items provided' };
    }
    
    const settings = getSettings();
    const globalContext = settings['GLOBAL_AI_CONTEXT'] || '';
    
    const contexts = ContextService.getAllContexts();
    const contextSnippets = contexts.map(c => `ID: ${c.id} | Name: ${c.name}`).join('\\n');
    
    Logger.log("AIAgent: Fetching Unified DB Payload");
    let dbPayload;
    if (typeof USE_SQL_BACKEND !== 'undefined' && USE_SQL_BACKEND) {
        dbPayload = DatabaseService.getAllDataPayload();
    } else {
        dbPayload = {
            tasks: TaskService.getAllItems(),
            projects: ProjectService.getActiveProjects(),
            settings: settings
        };
    }
    // Reconstruct a unified array to mimic getAllItems() for the lineage scanner
    const allItems = [...dbPayload.tasks, ...dbPayload.projects];
    
    // O(1) Dictionary Lookup
    const itemMap = {};
    allItems.forEach(i => itemMap[i.id] = i);
    
    Logger.log("AIAgent: Resolving Items from Payload");
    const stalledProjects = (payload.stalledProjectIds || []).map(id => itemMap[id]).filter(p => p);
    const malformedTasks = (payload.malformedTaskIds || []).map(id => itemMap[id]).filter(t => t);
    
    const stalledProjectSnippets = stalledProjects.map(p => {
        const lineage = this.getContextLineage(p, allItems);
        return `ID: ${p.id} | Name: "${p.name}" | Inherited Rules:\n      ${lineage}`;
    }).join('\\n\\n');
    
    const malformedTaskSnippets = malformedTasks.map(t => {
      let snippet = `ID: ${t.id} | Title: "${t.title}" | Notes: "${t.notes}"`;
      if (t.parentTaskId) {
        const parent = itemMap[t.parentTaskId]; 
        if (parent) {
           const lineage = this.getContextLineage(parent, allItems);
           if (lineage !== "(No parent context defined)") {
               snippet += `\\n        Parent Heirarchy Rules:\\n        ${lineage.replace(/\\n/g, ' ')}`;
           }
        }
      }
      return snippet;
    }).join('\\n\\n');

    const prompt = `
      You are an expert productivity consultant. The user has requested AI assistance for their "Attention Queue".
      This queue consists of "Stalled Projects" (projects with zero active tasks) and "Malformed Tasks" (tasks missing required hygiene metadata).
      
      GLOBAL AI CONTEXT (Guiding principles & priorities):
      """
      ${globalContext || "(No global context defined)"}
      """
      
      AVAILABLE ACTIVE CONTEXTS (For task routing):
      ${contextSnippets || "(No contexts defined)"}
      
      --- STALLED PROJECTS TO FIX ---
      ${stalledProjectSnippets || "(None)"}
      
      --- MALFORMED TASKS TO FIX ---
      ${malformedTaskSnippets || "(None)"}
      
      Based heavily on the GLOBAL AI CONTEXT, Project-specific Contexts, and task details:
      1. For each Stalled Project, determine if the project is actually finished (suggest "MARK_COMPLETED") OR if it needs a next step (suggest "NEW_TASK" and provide EXACTLY ONE highly actionable task title that will immediately unblock the project).
      2. For each Malformed Task, determine if the task sounds too complex and actually requires multiple steps to complete (suggest "CONVERT_TO_PROJECT"). If it is a simple single-step action, suggest "UPDATE_METADATA". **CRITICAL: Regardless of whether you suggest UPDATE_METADATA or CONVERT_TO_PROJECT, you MUST ALWAYS provide fallback estimates for all 4 missing hygiene fields** (Context ID, Time Estimate in minutes, Importance 1-4, Urgency 1-4).
      
      Respond strictly in JSON format matching this exact schema:
      {
        "stalledProjects": [
          {
            "projectId": "ID of project",
            "actionType": "NEW_TASK" or "MARK_COMPLETED",
            "suggestedNextActionTitle": "Title of proposed unblocking task, if NEW_TASK"
          }
        ],
        "malformedTasks": [
          {
            "taskId": "ID of task",
            "actionType": "UPDATE_METADATA" or "CONVERT_TO_PROJECT",
            "contextId": "ID of best matching context from the list above",
            "timeEstimate": 15,
            "importance": "3",
            "urgency": "2"
          }
        ]
      }
    `;

    const res = this.callGemini(prompt);
    if (!res.success) return res;
    
    return { 
      success: true, 
      suggestions: {
        stalledProjects: res.data.stalledProjects || [],
        malformedTasks: res.data.malformedTasks || []
      }
    };
  },
  
  /**
   * Rewrite AI Context based on User Correction
   */
  learnFromCorrection: function(taskId, wrongId, rightId) {
    const task = TaskService.getTask(taskId);
    const wrongProject = ProjectService.getProject(wrongId) || { name: wrongId };
    const rightProject = ProjectService.getProject(rightId);
    
    if (!task || !rightProject) return { success: false, error: 'Missing entities' };
    
    const allItems = TaskService.getAllItems();
    const rightContext = this.getContextLineage(rightProject, allItems);
    
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
   * Rewrite AI Context based on User Attention Fix Correction
   */
  learnFromAttentionCorrection: function(itemId, itemType, aiSuggestion, userCorrection) {
    const settings = getSettings();
    const globalContext = settings['GLOBAL_AI_CONTEXT'] || '';
    
    let itemDetails = '';
    if (itemType === 'project') {
       const p = ProjectService.getProject(itemId);
       itemDetails = `Project: "${p ? p.name : itemId}"`;
    } else {
       const t = TaskService.getTask(itemId);
       itemDetails = `Task: "${t ? t.title : itemId}" | Notes: "${t ? t.notes : ''}"`;
    }
    
    const prompt = `
      You are an underlying GTD application AI. The user just corrected your logic!
      
      ITEM DETAILS:
      ${itemDetails}
      
      EVENT:
      The AI suggested: "${aiSuggestion}"
      The user rejected it and explicitly corrected it to: "${userCorrection}"
      
      CURRENT GLOBAL CONTEXT:
      """
      ${globalContext || "(No existing rules)"}
      """
      
      Task: Rewrite the GLOBAL AI CONTEXT so that it implicitly learns exactly why the user's correction is the preferred logic for items of this nature.
      Preserve all other existing rules in the context. Keep it concise.
      
      Respond strictly in JSON format matching this schema:
      {
        "newAiContext": "The completely rewritten global AI context string."
      }
    `;
    
    const res = this.callGemini(prompt);
    if (res.success && res.data && res.data.newAiContext) {
      updateSetting('GLOBAL_AI_CONTEXT', res.data.newAiContext);
      return { success: true, newContext: res.data.newAiContext };
    }
    return { success: false, error: 'Failed to rewrite context: ' + (res.error || '') };
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
        if (responseCode === 429 || responseCode === 404) {
            PropertiesService.getScriptProperties().deleteProperty('GEMINI_MODEL');
        }
        return { success: false, error: 'API Error (' + responseCode + ') on model [' + modelName + ']: ' + responseText };
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
  },

  /**
   * Helper payload fetcher to Google Gemini API (Safe Sequential Batching)
   */
  callGeminiBatch: function(prompts) {
    const results = [];
    
    for (let i = 0; i < prompts.length; i++) {
        // Built-in pacing mitigates Google Gemini Free Tier limits (15 Requests Per Minute)
        // The natural API latency (~2-3s) combined with this sleep essentially paces it perfectly.
        if (i > 0) Utilities.sleep(1500); 
        
        const res = this.callGemini(prompts[i]);
        results.push(res);
    }
    
    return results;
  },

  /**
   * Synthesize AI Contexts Bottom-Up
   * Recursively passes child context rulesets upward to formalize master parent contexts safely
   * Supports 'startIndex' continuation loops to bypass 6-minute GAS timeouts.
   */
  synthesizeAllContexts: function(startIndex = 0) {
    const START_TIME = Date.now();
    const MAX_RUN_TIME = 260000; // 4.3 minutes (safely away from 6.0 min limit)
    
    startIndex = startIndex || 0;
    const cache = CacheService.getUserCache();
    
    if (startIndex === 0) {
        cache.put('AI_SYNTHESIS_STAGE', JSON.stringify({ message: 'Mapping database dependency tree...' }), 600);
    }
    
    const allItems = TaskService.getAllItems().filter(item => !item.isDeleted && item.status !== 'completed' && item.status !== 'done' && item.status !== 'dropped');
    
    const childrenMap = {};
    const itemMap = {};
    
    allItems.forEach(item => {
        itemMap[item.id] = item;
        childrenMap[item.id] = [];
    });
    
    allItems.forEach(item => {
        const pid = item.parentTaskId; 
        if (pid && itemMap[pid]) {
            childrenMap[pid].push(item);
        }
    });

    const depths = {};
    function getDepth(id) {
        if (depths[id] !== undefined) return depths[id];
        const children = childrenMap[id] || [];
        if (children.length === 0) {
            depths[id] = 0;
            return 0;
        }
        let maxChildDepth = -1;
        children.forEach(c => {
            const cd = getDepth(c.id);
            if (cd > maxChildDepth) maxChildDepth = cd;
        });
        depths[id] = maxChildDepth + 1;
        return depths[id];
    }
    
    const projectsAndFolders = allItems.filter(i => i.type === 'project' || i.type === 'folder');
    projectsAndFolders.forEach(p => getDepth(p.id));
    
    const byDepth = {};
    let maxDepth = -1;
    projectsAndFolders.forEach(p => {
        const d = depths[p.id];
        if (!byDepth[d]) byDepth[d] = [];
        byDepth[d].push(p);
        if (d > maxDepth) maxDepth = d;
    });
    
    // Linearize the tree strictly from bottom (Depth 0) to top (Depth N)
    const flatLinearGraph = [];
    for (let d = 0; d <= maxDepth; d++) {
        const nodesAtDepth = byDepth[d] || [];
        nodesAtDepth.forEach(n => flatLinearGraph.push(n));
    }
    
    let totalSynthesized = 0;
    
    for (let i = startIndex; i < flatLinearGraph.length; i++) {
        // Enforce script execution timeout protection
        if (Date.now() - START_TIME > MAX_RUN_TIME) {
            cache.put('AI_SYNTHESIS_STAGE', JSON.stringify({ message: `Avoiding script timeout... saving graph state at chunk ${i}/${flatLinearGraph.length}` }), 600);
            return { success: true, count: totalSynthesized, hasMore: true, nextIndex: i, totalTarget: flatLinearGraph.length };
        }
        
        const node = flatLinearGraph[i];
        
        cache.put('AI_SYNTHESIS_STAGE', JSON.stringify({ message: `Generating Ruleset for Sub-System [${i + 1}/${flatLinearGraph.length}]: "${node.title}"` }), 600);
        
        const children = childrenMap[node.id] || [];
        
        let childDescriptions = children.map(c => {
            if (c.type === 'task') return `- TASK: "${c.title}" ${c.notes ? '(' + c.notes + ')' : ''}`;
            const childContext = itemMap[c.id].aiContext || '(No context)';
            return `- SUB-${c.type.toUpperCase()}: "${c.title}" Context Rules: ${childContext}`;
        }).join('\n');
        
        if (children.length === 0) {
           childDescriptions = "(This container currently lacks contents. Infer its operational intent directly from its namespace/metadata parameters.)";
        }
        
        const prompt = `
          You are an autonomous GTD AI Assistant assigned to mapping dynamic workflow architectures.
          Generate a highly concise 1-3 sentence AI Context ruleset specifying EXACTLY what types of objectives and task methodologies belong within this structural boundary.
          
          STRUCTURAL BOUNDARY [${node.type.toUpperCase()}]: "${node.title}"
          NATIVE NOTES: "${node.notes || ''}"
          
          CONTENTS ENCAPSULATED BY THIS BOUNDARY:
          ${childDescriptions}
          
          Task: Formulate the overarching AI Context summarizing the combined objectives of its descendants seamlessly.
          
          Respond strictly in JSON format matching this schema:
          { "newAiContext": "The new context string..." }
        `;
        
        // Dynamic pacing to respect rate limits between sequential jumps
        if (i > startIndex) Utilities.sleep(1500);
        
        const res = this.callGemini(prompt);
        if (res.success && res.data && res.data.newAiContext) {
            itemMap[node.id].aiContext = res.data.newAiContext;
            TaskService.updateTask(node.id, { aiContext: res.data.newAiContext });
            totalSynthesized++;
        }
    }
    
    // Safety check before evaluating the Global payload 
    if (Date.now() - START_TIME > MAX_RUN_TIME) {
         return { success: true, count: totalSynthesized, hasMore: true, nextIndex: flatLinearGraph.length, totalTarget: flatLinearGraph.length };
    }
    
    // 4. Construct unified global architecture via Root dependencies
    cache.put('AI_SYNTHESIS_STAGE', JSON.stringify({ message: 'Aggregating root structures into Global Context...' }), 600);
    const rootNodes = projectsAndFolders.filter(p => !p.parentTaskId);
    const rootDescriptions = rootNodes.map(r => `- Root ${r.type.toUpperCase()}: "${r.title}" | Operational Context: ${itemMap[r.id].aiContext}`).join('\n');
    
    const globalPrompt = `
      You are the core logic framework driving a GTD database. The user has requested a completely updated Brain Ruleset structure.
      
      Here are all of their Top-Level Sub-Systems driving the engine:
      ${rootDescriptions}
      
      Synthesize a comprehensive unified "GLOBAL AI CONTEXT" that fully captures the user's total worldview and systemic goals. 
      Formulate exact logic rules for how incoming items / fresh items should be autonomously targeted, structured, estimated, and categorized dynamically over time.
      
      Respond strictly in JSON format matching this schema:
      { "newGlobalContext": "The fresh overarching framework string..." }
    `;
    
    const globalRes = this.callGemini(globalPrompt);
    if (globalRes.success && globalRes.data && globalRes.data.newGlobalContext) {
       if (typeof updateSetting === 'function') {
           updateSetting('GLOBAL_AI_CONTEXT', globalRes.data.newGlobalContext);
       }
       totalSynthesized++; 
    }
    
    // Signal underlying cache wipe since global sweeps aggressively rewrite values 
    if (typeof clearDataCache === 'function') clearDataCache();
    
    cache.put('AI_SYNTHESIS_STAGE', JSON.stringify({ message: 'Completed successfully!' }), 600);
    
    return { success: true, count: totalSynthesized, hasMore: false };
  }
};

/**
 * Endpoint for Frontend polling of live API synthesis runs
 */
function getSynthesisProgress() {
    var raw = CacheService.getUserCache().get('AI_SYNTHESIS_STAGE');
    if (raw) {
        try {
            return JSON.parse(raw);
        } catch(e) {}
    }
    return null;
}

/**
 * Global functions exposed to the client
 */
function generateProjectInsights(projectId) {
  return AIAgentService.generateProjectInsights(projectId);
}

function suggestAlignmentForInbox(taskIds) {
  return AIAgentService.suggestAlignmentForInbox(taskIds);
}

function suggestAttentionFixes(payload) {
  return AIAgentService.suggestAttentionFixes(payload);
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

function learnFromAttentionCorrection(itemId, itemType, aiSuggestion, userCorrection) {
  return AIAgentService.learnFromAttentionCorrection(itemId, itemType, aiSuggestion, userCorrection);
}

function teachProjectWaitReason(projectId, reason, date) {
  return AIAgentService.teachProjectWaitReason(projectId, reason, date);
}

function getGlobalAIContext() {
  return getSettings()['GLOBAL_AI_CONTEXT'] || '';
}

function updateGlobalAIContext(contextText) {
  return updateSetting('GLOBAL_AI_CONTEXT', contextText);
}
