/**
 * GTD System - Gmail Service
 * Handles Gmail integration for task capture
 */

const GmailService = {
  
  /**
   * Create a task from an email message
   */
  createTaskFromEmail: function(messageId) {
    try {
      const message = GmailApp.getMessageById(messageId);
      if (!message) {
        return { success: false, error: 'Message not found' };
      }
      
      const thread = message.getThread();
      const subject = message.getSubject();
      const from = message.getFrom();
      const date = message.getDate();
      const body = message.getPlainBody();
      
      // Create task with email context
      const task = TaskService.createTask({
        title: subject || 'Email follow-up',
        notes: this.formatEmailNotes(from, date, body),
        status: STATUS.INBOX,
        emailId: messageId,
        emailThreadId: thread.getId()
      });
      
      // Add a label to the email to mark it as captured
      const label = this.getOrCreateLabel('GTD/Captured');
      thread.addLabel(label);
      
      return { success: true, task: task };
    } catch (e) {
      return { success: false, error: e.toString() };
    }
  },
  
  /**
   * Format email content for task notes
   */
  formatEmailNotes: function(from, date, body) {
    const formattedDate = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    const truncatedBody = body ? body.substring(0, 500) : '';
    
    return `From: ${from}
Date: ${formattedDate}

${truncatedBody}${body && body.length > 500 ? '...' : ''}`;
  },
  
  /**
   * Get or create a Gmail label
   */
  getOrCreateLabel: function(labelName) {
    let label = GmailApp.getUserLabelByName(labelName);
    if (!label) {
      label = GmailApp.createLabel(labelName);
    }
    return label;
  },
  
  /**
   * Get recent emails for the add-on sidebar
   */
  getRecentEmails: function(count) {
    const threads = GmailApp.getInboxThreads(0, count || 10);
    const emails = [];
    
    threads.forEach(thread => {
      const message = thread.getMessages()[0];
      emails.push({
        id: message.getId(),
        threadId: thread.getId(),
        subject: thread.getFirstMessageSubject(),
        from: message.getFrom(),
        date: message.getDate(),
        snippet: thread.getMessages().slice(-1)[0].getPlainBody().substring(0, 100),
        isUnread: thread.isUnread(),
        hasTask: this.emailHasTask(message.getId())
      });
    });
    
    return emails;
  },
  
  /**
   * Check if an email already has an associated task
   */
  emailHasTask: function(messageId) {
    const tasks = TaskService.getAllTasks();
    return tasks.some(t => t.emailId === messageId);
  },
  
  /**
   * Import emails labeled 'GTD/ToProcess'
   */
  importToProcessEmails: function() {
    const labelName = 'GTD/ToProcess';
    const addedLabelName = 'GTD/Added';
    
    const label = GmailApp.getUserLabelByName(labelName);
    if (!label) {
      return { success: false, error: `Label '${labelName}' not found.` };
    }
    
    const threads = label.getThreads(0, 50); // Limit to 50 to avoid timeout
    if (threads.length === 0) {
      return { success: true, count: 0 };
    }
    
    const addedLabel = this.getOrCreateLabel(addedLabelName);
    let count = 0;
    
    // Inbox Unification:
    // We no longer look for an <Inbox> folder. All new items go to root with status='inbox'.
    const parentTaskId = '';
    
    threads.forEach(thread => {
      const message = thread.getMessages()[0]; // Use first message for details
      const subject = thread.getFirstMessageSubject();
      const permalink = thread.getPermalink();
      
      // Create Task
      TaskService.createTask({
        title: subject || '(No Subject)',
        notes: `[Open in Gmail](${permalink})\n\n` + message.getPlainBody().substring(0, 200) + '...',
        status: STATUS.INBOX,
        emailId: message.getId(),
        emailThreadId: thread.getId(),
        parentTaskId: parentTaskId
      });
      
      count++;
    });

    // Batch Label Operations
    addedLabel.addToThreads(threads);
    label.removeFromThreads(threads);
    
    return { success: true, count: count };
  },

  /**
   * Get the current email in Gmail add-on context
   */
  getCurrentEmail: function(e) {
    if (!e || !e.gmail || !e.gmail.messageId) {
      return null;
    }
    
    const messageId = e.gmail.messageId;
    const message = GmailApp.getMessageById(messageId);
    
    return {
      id: messageId,
      threadId: message.getThread().getId(),
      subject: message.getSubject(),
      from: message.getFrom(),
      date: message.getDate(),
      body: message.getPlainBody(),
      hasTask: this.emailHasTask(messageId)
    };
  },
  
  /**
   * Open the email in Gmail (returns URL)
   */
  getEmailUrl: function(threadId) {
    return `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
  },
  
  /**
   * Search emails
   */
  searchEmails: function(query, maxResults) {
    const threads = GmailApp.search(query, 0, maxResults || 20);
    const results = [];
    
    threads.forEach(thread => {
      const message = thread.getMessages()[0];
      results.push({
        id: message.getId(),
        threadId: thread.getId(),
        subject: thread.getFirstMessageSubject(),
        from: message.getFrom(),
        date: message.getDate(),
        hasTask: this.emailHasTask(message.getId())
      });
    });
    
    return results;
  },
  
  /**
   * Scan Inbox for emails requiring action using AI
   * Uses checkpointing to resume if stopped
   */
  scanInboxForSuggestions: function() {
    const startTime = new Date().getTime();
    const TIME_LIMIT = 5 * 60 * 1000; // 5 minutes
    
    const scannedLabel = this.getOrCreateLabel('GTD/Scanned');
    const suggestedLabel = this.getOrCreateLabel('GTD/Suggested');
    
    // Search for unscanned inbox threads
    // Note: Gmail search is not real-time, so we might see recently labeled threads
    const query = 'label:inbox -label:GTD/Scanned -label:GTD/Suggested';
    const BATCH_SIZE = 20; 
    const threads = GmailApp.search(query, 0, BATCH_SIZE);
    
    console.log(`Found ${threads.length} threads to scan`);
    
    if (threads.length === 0) {
      return { complete: true, count: 0 };
    }
    
    const userEmail = Session.getActiveUser().getEmail() || 
                      PropertiesService.getScriptProperties().getProperty('USER_EMAIL') || 
                      'user';
    
    let processedCount = 0;
    let firstError = null;
    
    for (const thread of threads) {
      // Check time limit
      if (new Date().getTime() - startTime > TIME_LIMIT) {
        console.log('Time limit reached, stopping.');
        return { complete: false, count: processedCount, threadsFound: threads.length, error: firstError };
      }
      
      const messages = thread.getMessages();
      const lastMessage = messages[messages.length - 1]; // Analyze latest message
      
      // Skip if sent by user
      if (lastMessage.getFrom().includes(userEmail)) {
        thread.addLabel(scannedLabel);
        processedCount++;
        continue;
      }
      
      const analysis = AIService.analyzeEmail(
        lastMessage.getSubject(),
        lastMessage.getPlainBody(),
        lastMessage.getFrom(),
        userEmail
      );
      
      if (analysis.success) {
        if (analysis.requiresAction) {
          console.log(`Suggested: ${lastMessage.getSubject()} (${analysis.reason})`);
          thread.addLabel(suggestedLabel);
        }
        thread.addLabel(scannedLabel);
        processedCount++;
      } else {
        const msg = `Analysis failed for ${lastMessage.getSubject()}. Reason: ${analysis.reason}`;
        console.log(msg);
        Logger.log(msg); // Ensure it hits Execution Log
        if (!firstError) firstError = analysis.reason;
      }
    }
    
    return { complete: threads.length < BATCH_SIZE, count: processedCount, threadsFound: threads.length, error: firstError };
  }
};

// ============================================
// Gmail Add-on Functions
// ============================================

/**
 * Gmail Add-on: Build homepage card
 */
function buildAddOnHomepage(e) {
  const card = CardService.newCardBuilder();
  
  card.setHeader(CardService.newCardHeader().setTitle('GTD Quick Capture'));
  
  // Quick capture section
  const captureSection = CardService.newCardSection()
    .setHeader('Quick Capture');
  
  captureSection.addWidget(
    CardService.newTextInput()
      .setFieldName('quickTitle')
      .setTitle('Task Title')
      .setHint('What needs to be done?')
  );
  
  captureSection.addWidget(
    CardService.newTextButton()
      .setText('Add to Inbox')
      .setOnClickAction(CardService.newAction().setFunctionName('addQuickTask'))
  );
  
  card.addSection(captureSection);
  
  // Recent tasks section
  const tasksSection = CardService.newCardSection()
    .setHeader('Recent Inbox Items');
  
  const inboxTasks = TaskService.getTasksByStatus(STATUS.INBOX).slice(0, 5);
  
  if (inboxTasks.length === 0) {
    tasksSection.addWidget(
      CardService.newTextParagraph().setText('Inbox is empty!')
    );
  } else {
    inboxTasks.forEach(task => {
      tasksSection.addWidget(
        CardService.newTextParagraph().setText(`• ${task.title}`)
      );
    });
  }
  
  card.addSection(tasksSection);
  
  // Link to full app
  const linkSection = CardService.newCardSection();
  linkSection.addWidget(
    CardService.newTextButton()
      .setText('Open GTD System')
      .setOpenLink(CardService.newOpenLink()
        .setUrl(ScriptApp.getService().getUrl())
        .setOpenAs(CardService.OpenAs.FULL_SIZE))
  );
  
  card.addSection(linkSection);
  
  return card.build();
}

/**
 * Gmail Add-on: Build contextual card for email
 */
function buildAddOnContextualCard(e) {
  const email = GmailService.getCurrentEmail(e);
  
  if (!email) {
    return buildAddOnHomepage(e);
  }
  
  const card = CardService.newCardBuilder();
  
  card.setHeader(CardService.newCardHeader().setTitle('Create Task from Email'));
  
  const section = CardService.newCardSection();
  
  // Show email info
  section.addWidget(
    CardService.newTextParagraph()
      .setText(`<b>Subject:</b> ${email.subject}`)
  );
  
  section.addWidget(
    CardService.newTextParagraph()
      .setText(`<b>From:</b> ${email.from}`)
  );
  
  if (email.hasTask) {
    section.addWidget(
      CardService.newTextParagraph()
        .setText('✅ Task already created for this email')
    );
  } else {
    // Task title (pre-filled with subject)
    section.addWidget(
      CardService.newTextInput()
        .setFieldName('taskTitle')
        .setTitle('Task Title')
        .setValue(email.subject)
    );
    
    // Notes
    section.addWidget(
      CardService.newTextInput()
        .setFieldName('taskNotes')
        .setTitle('Additional Notes')
        .setMultiline(true)
    );
    
    // Create button
    section.addWidget(
      CardService.newTextButton()
        .setText('Create Task')
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('createTaskFromCurrentEmail')
            .setParameters({ messageId: email.id })
        )
    );
  }
  
  card.addSection(section);
  
  return card.build();
}

/**
 * Gmail Add-on: Create task from current email
 */
function createTaskFromCurrentEmail(e) {
  const messageId = e.parameters.messageId;
  const title = e.formInput.taskTitle;
  const notes = e.formInput.taskNotes || '';
  
  const message = GmailApp.getMessageById(messageId);
  const thread = message.getThread();
  
  // Create the task
  const task = TaskService.createTask({
    title: title,
    notes: GmailService.formatEmailNotes(message.getFrom(), message.getDate(), message.getPlainBody()) + 
           (notes ? '\n\nAdditional notes: ' + notes : ''),
    status: STATUS.INBOX,
    emailId: messageId,
    emailThreadId: thread.getId()
  });
  
  // Label the email
  const label = GmailService.getOrCreateLabel('GTD/Captured');
  thread.addLabel(label);
  
  // Show confirmation
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Task created successfully!'))
    .setNavigation(CardService.newNavigation().updateCard(buildAddOnContextualCard(e)))
    .build();
}

/**
 * Gmail Add-on: Add quick task
 */
function addQuickTask(e) {
  const title = e.formInput.quickTitle;
  
  if (!title) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Please enter a task title'))
      .build();
  }
  
  TaskService.createTask({
    title: title,
    status: STATUS.INBOX
  });
  
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Task added to inbox!'))
    .setNavigation(CardService.newNavigation().updateCard(buildAddOnHomepage(e)))
    .build();
}

/**
 * Gmail Add-on: Get add-on manifest triggers
 */
function onGmailMessageOpen(e) {
  return buildAddOnContextualCard(e);
}

function onGmailHomePageOpen(e) {
  return buildAddOnHomepage(e);
}