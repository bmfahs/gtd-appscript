/**
 * GeminiService.gs
 * Handles interactions with Google's Gemini API for AI-powered features.
 */

const GeminiService = (function() {

  function getApiKey() {
    return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  }

  function resolveModel(apiKey) {
      if (typeof GEMINI_MODEL !== 'undefined' && GEMINI_MODEL !== 'auto') return GEMINI_MODEL;

      // Check Cache
      // Check Cache
      const props = PropertiesService.getScriptProperties();
      const cached = props.getProperty('CACHED_GEMINI_MODEL');
      if (cached && !cached.includes('vision') && !cached.includes('flash') && !cached.includes('tts')) {
          console.log('Using Cached Gemini Model: ' + cached);
          return cached;
      } else if (cached) {
          console.log('Invalidating cached model (Vision/Flash/TTS): ' + cached);
          props.deleteProperty('CACHED_GEMINI_MODEL');
      }

      try {
        const resp = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey);
        const data = JSON.parse(resp.getContentText());
        
        // Filter for Gemini models (Exclude Vision and TTS)
        let candidates = (data.models || []).filter(m => {
          const name = m.name.toLowerCase();
          return name.includes('gemini') && 
                 !name.includes('vision') &&
                 !name.includes('tts');
        });

        if (candidates.length > 0) {
            // Scoring Function to find the best reasoning model
            // 3.0 > 2.0 > 1.5
            candidates.sort((a, b) => {
                const getScore = (m) => {
                    const name = m.name.toLowerCase();
                    let score = 0;
                    
                    // Base Score from Version
                    const match = name.match(/gemini-(\d+\.\d+)/);
                    if (match) {
                        score += parseFloat(match[1]) * 100;
                    } else if (name.includes('gemini-exp')) {
                         // "gemini-exp" without version usually implies latest cutting edge
                         score += 250; // Treat as ~2.5 (Between 2.0 and 3.0)
                    } else {
                        score += 100; // Baseline 1.0
                    }
                    
                    // Modifiers
                    if (name.includes('ultra')) score += 20;
                    if (name.includes('pro')) score += 10;
                    if (name.includes('exp')) score += 5; 
                    
                    // Penalties
                    if (name.includes('flash')) score -= 75; // Heavier penalty for Flash (user preference)
                    
                    return score;
                };
                
                return getScore(b) - getScore(a); // Descending score
            });

           // Log top 3 for debugging transparency
           const top3 = candidates.slice(0, 3).map(c => c.name.replace('models/', ''));
           console.log('Top AI Model Candidates:', top3);

           const best = candidates[0].name.replace('models/', '');
           props.setProperty('CACHED_GEMINI_MODEL', best);
           console.log('Auto-detected Best Gemini Model: ' + best);
           return best;
        }
      } catch (e) {
        console.error('Failed to list models: ' + e);
      }
      return 'gemini-1.5-pro'; // Fallback to safe default
  }

  /**
   * Safe wrapper to call Gemini API with retry logic for 400 errors.
   */
  function callGemini(prompt, apiKey, modelOverride) {
      // 1. Determine Model
      let model = modelOverride || resolveModel(apiKey);
      console.log('Gemini Request [Attempt 1] using:', model);

      const payload = {
          "contents": [{ "parts": [{ "text": prompt }] }]
      };
      
      const options = {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true // We need to check status code manually
      };

      try {
          // Attempt 1
          let url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
          let resp = UrlFetchApp.fetch(url, options);
          
          if (resp.getResponseCode() === 400) {
              const body = resp.getContentText();
              console.warn('Gemini 400 Error (Modality Mismatch?):', body);
              
              // RETRY LOGIC
              // If we used an auto-detected/experimental model, switch to known stable version
              if (!modelOverride && model !== 'gemini-1.5-pro-002') {
                  console.warn('Falling back to SAFE model: gemini-1.5-pro-002');
                  model = 'gemini-1.5-pro-002'; // Known stable version
                  url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
                  resp = UrlFetchApp.fetch(url, options); // Retry
              }
          }

          if (resp.getResponseCode() !== 200) {
               throw new Error('Gemini API Error ' + resp.getResponseCode() + ': ' + resp.getContentText());
          }

          const json = JSON.parse(resp.getContentText());
          if (json.candidates && json.candidates.length > 0) {
              let text = json.candidates[0].content.parts[0].text;
              text = text.replace(/```json/g, '').replace(/```/g, '').trim();
              return JSON.parse(text);
          } else {
              if (json.promptFeedback && json.promptFeedback.blockReason) {
                   throw new Error('Blocked: ' + json.promptFeedback.blockReason);
              }
              return []; // Or handle as error
          }

      } catch (e) {
          console.error('Gemini Call Failed:', e);
          throw e; // Re-throw to caller
      }
  }

  /**
   * Generates a list of tasks for a given project description using Gemini.
   */
  function suggestTasksForProject(projectName, projectNotes) {
    const key = getApiKey();
    if (!key) throw new Error('GEMINI_API_KEY not found in Script Properties.');

    const prompt = `
      You are a GTD (Getting Things Done) expert. 
      I have a project named "${projectName}". 
      Context/Notes: "${projectNotes || ''}".
      
      Please generate a list of 3-7 concrete, actionable "Next Action" steps to complete this project.
      Return ONLY a raw JSON array of strings, e.g., ["Call Bob", "Draft email"]. Do not include markdown formatting.
    `;

    return callGemini(prompt, key);
  }

  /**
   * Process a natural language voice command with full system context.
   */
  function processVoiceCommand(transcript) {
    const key = getApiKey();
    if (!key) throw new Error('Gemini API Key missing');

    const projects = ProjectService.getActiveProjects().map(p => ({
      id: p.id, type: 'project', name: p.name, description: p.notes
    }));
    
    const tasks = TaskService.getAllTasks().filter(t => 
      ['inbox', 'next', 'waiting', 'scheduled'].includes(t.status)
    ).map(t => ({
      id: t.id, type: 'task', title: t.title, projectId: t.parentTaskId, status: t.status
    }));
    
    const context = { projects: projects, tasks: tasks };
    
    const prompt = `
      You are a GTD Assistant.
      
      CURRENT SYSTEM STATE:
      ${JSON.stringify(context)}
      
      USER COMMAND: "${transcript}"
      
      INSTRUCTIONS:
      Determine the user's intent and return a JSON object with one of the following schemas. 
      Do NOT return markdown. Return ONLY the JSON object.
      
      1. Add Task:
      { "action": "create", "data": { "title": "...", "notes": "...", "projectId": "ID_FROM_CONTEXT_OR_NULL" } }
      (If user mentions a project name, find its ID in the context. If ambiguous, set projectId to null).
      
      2. Convert Task to Project:
      { "action": "convert", "targetId": "TASK_ID", "data": { "type": "project", "status": "active" } }
      (Find the task ID based on fuzzy title match).
      
      3. Plan Project (Suggest Tasks):
      { "action": "ai_plan", "targetId": "PROJECT_ID", "projectName": "NAME" }
      (If user wants suggestions for a project).
      
      4. Unknown/Clarify:
      { "action": "error", "message": "I didn't understand. Could you clarify?" }
      
      CRITICAL: Always use existing IDs from the context if referring to existing items.
    `;

    try {
        const result = callGemini(prompt, key);
        // Ensure result structure is valid
        if (result && (result.action || Array.isArray(result))) {
           return result;
        }
        return { action: 'error', message: 'Invalid JSON response from AI' };
    } catch (e) {
        return { action: 'error', message: 'AI Error: ' + e.message };
    }
  }

  return {
    suggestTasksForProject: suggestTasksForProject,
    processVoiceCommand: processVoiceCommand
  };

})();

// Expose to frontend
function processVoiceCommandWrapper(transcript) {
  return GeminiService.processVoiceCommand(transcript);
}

function suggestProjectTasksWrapper(id) {
  const project = ProjectService.getProject(id);
  if (!project) throw new Error('Project not found');
  
  return GeminiService.suggestTasksForProject(project.name, project.notes || project.description);
}

// End of GeminiService.gs
