/**
 * GTD System - AI Service
 * Integration with Google Gemini for email analysis
 */

const AIService = {
  
  /**
   * Analyze an email to determine if it requires user action
   * @param {string} subject - Email subject
   * @param {string} body - Email body (plain text)
   * @param {string} sender - Sender email/name
   * @param {string} userEmail - Current user's email (to identify direct requests)
   * @returns {Object} { requiresAction: boolean, reason: string }
   */
  analyzeEmail: function(subject, body, sender, userEmail) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.error('Gemini API Key not found');
      return { requiresAction: false, reason: 'API Key missing' };
    }

    const prompt = `
      You are a personal productivity assistant. Analyze the following email and determine if it requires a specific action, input, or response from the user (${userEmail}).
      
      Sender: ${sender}
      Subject: ${subject}
      Body:
      ${body.substring(0, 2000)} // Truncate to avoid token limits
      
      Criteria for "Action Required" (Must meet at least one):
      1. The email is a DIRECT personal message from a human asking for a reply or action.
      2. The email assigns a specific, non-automated task or deadline.
      
      Criteria for "NO Action Required" (Ignore these even if they imply action):
      1. Platform Notifications (e.g., "You have new invitations", "X commented on your post", "New login detected").
      2. Generic invitations (e.g., LinkedIn connection requests, friend requests).
      3. Newsletters, receipts, or automated system alerts.
      4. "Call to Action" marketing or engagement emails (e.g., "Check out your stats", "Complete your profile").
      
      CRITICAL: If the sender is a system/bot (like "notifications@linkedin.com") and not a specific person, default to false unless it is a critical security alert.
      
      Return ONLY a JSON object with the following format:
      {
        "requiresAction": boolean,
        "reason": "Short explanation of why"
      }
    `;

    // Auto-discover best available model
    const modelName = this.getModelName(apiKey);
    if (!modelName) {
      return { requiresAction: false, reason: 'No suitable Gemini model found', success: false };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
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
        console.error('Gemini API Error:', responseText);
        return { requiresAction: false, reason: 'API Error: ' + responseCode };
      }

      const data = JSON.parse(responseText);
      const content = data.candidates[0].content.parts[0].text;
      
      // Clean up markdown code blocks if present
      const jsonString = content.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const result = JSON.parse(jsonString);
      result.success = true;
      return result;
      
    } catch (e) {
      console.error('AI Analysis Failed:', e);
      return { requiresAction: false, reason: 'Analysis Exception', success: false };
    }
  },

  /**
   * Get Gemini API Key from Script Properties
   */
  getApiKey: function() {
    return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  },

  /**
   * List available Gemini models
   * Debugging tool to find valid model names
   */
  listAvailableModels: function() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.log('API Key missing');
      return;
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    try {
      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true
      });
      
      console.log('Available Models Response:', response.getContentText());
      return response.getContentText();
    } catch (e) {
      console.error('Failed to list models:', e);
      return e.toString();
    }
  },

  /**
   * Get the best available Gemini model name
   * Caches the result in Script Properties
   */
  getModelName: function(apiKey) {
    // Check cache first
    const props = PropertiesService.getScriptProperties();
    const cachedModel = props.getProperty('GEMINI_MODEL');
    if (cachedModel) return cachedModel;
    
    console.log('Auto-discovering Gemini model...');
    
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
      
      if (response.getResponseCode() !== 200) {
        console.error('Failed to list models:', response.getContentText());
        return null;
      }
      
      const data = JSON.parse(response.getContentText());
      if (!data.models) return null;
      
      // Preferred models in order
      const preferences = [
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-1.0-pro',
        'gemini-pro'
      ];
      
      // Find the first preferred model that exists in the available list
      // and supports 'generateContent'
      let selectedModel = null;
      
      for (const pref of preferences) {
        const match = data.models.find(m => 
          (m.name === `models/${pref}` || m.name === pref) && 
          m.supportedGenerationMethods.includes('generateContent')
        );
        if (match) {
          selectedModel = match.name;
          break;
        }
      }
      
      // Fallback: take any model with 'flash' in the name
      if (!selectedModel) {
        const flashModel = data.models.find(m => 
          m.name.includes('flash') && 
          m.supportedGenerationMethods.includes('generateContent')
        );
        if (flashModel) selectedModel = flashModel.name;
      }
      
      if (selectedModel) {
        console.log(`Selected Gemini model: ${selectedModel}`);
        props.setProperty('GEMINI_MODEL', selectedModel);
        return selectedModel;
      }
      
      console.error('No suitable Gemini model found');
      return null;
      
    } catch (e) {
      console.error('Error discovering model:', e);
      return null;
    }
  }
};
