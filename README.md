# GTD App for Google Apps Script

A personal productivity application based on the Getting Things Done (GTD) methodology, built with Google Apps Script and HTML/CSS/JS.

## Features

### Core GTD
- **Inbox Processing**: Capture everything as tasks with `status='inbox'`. New items appear at the root level.
- **Project Management**: Unified storage (Projects are tasks). Create sub-projects and convert tasks to projects instantly.
- **Contexts**: Filter tasks by context (e.g., @home, @work).
- **Weekly Review**: Dedicated workflow for reviewing your system.
- **Next Actions Badge**: Visual indicator for tasks due today or overdue.

### User Experience
- **Keyboard Shortcuts**: Gmail/Vim-style navigation (`j`/`k` to move, `x` to check, `?` for help).
- **Mobile Optimized**: Improved Android deep linking for Gmail threads.

### AI & Automation
- **AI Email Scanner**: Uses Google Gemini to scan your Gmail Inbox for actionable items.
    - Auto-discovers the best available model (e.g., Gemini 2.0 Flash).
    - Filters out newsletters, receipts, and generic notifications (like LinkedIn).
    - Labels actionable emails as `GTD/Suggested`.
- **Gmail Import**: Import emails labeled `GTD/ToProcess` directly as tasks.

### Advanced
- **Search**: Hierarchical search for tasks and projects.
- **Export**: Download your completed task history to CSV.
- **MLO Import**: Python script (`compact_mlo.py`) to migrate from MyLifeOrganized.
- **Database Compaction**: Clean up deleted items to keep the app fast.
- **Unified Data Model**: Projects and Tasks share the same sheet for easier maintenance and upgrades.

## Prerequisites
- A Google Account.
- Access to Google Drive and Google Sheets.
- (Optional) A Google Cloud Project with **Gemini API** enabled for AI features.

## Installation

1.  **Create a Project**:
    - Go to [script.google.com](https://script.google.com).
    - Click **New Project**.
    - Name it "GTD App".

2.  **Copy Files**:
    - Copy the contents of the `.gs` and `.html` files from this repository into your new Apps Script project.
    - **Important**: Update `appsscript.json` (Project Settings > Show manifest) with the provided manifest file to enable necessary permissions.

## Setup

### 1. Database Setup
- Create a new Google Sheet named "GTD Database".
- Copy the **Spreadsheet ID** from the URL.
- In Apps Script, go to **Project Settings** > **Script Properties**.
- Add Property: `SHEET_ID` = `your_spreadsheet_id`

### 2. AI Configuration (Optional)
To enable the AI Email Scanner:
- Get a [Gemini API Key](https://aistudio.google.com/app/apikey).
- In **Script Properties**, add: `GEMINI_API_KEY` = `your_api_key`
- (Optional) Add `USER_EMAIL` property if you want the AI to be specific about your identity.

### 3. Initialize
- The first time you load the web app, it will automatically create the necessary sheets (`Tasks`, `Projects`, etc.).

## Usage

### Web App
- **Deploy**: Click **Deploy** > **New deployment** > **Web app**.
- **Access**: Open the provided URL on desktop or mobile.
- **Add to Home Screen**: On mobile, use "Add to Home Screen" for an app-like experience.

### AI Scanner
- **Manual**: Click the "Scan Inbox (AI)" button in the Inbox view.
- **Automatic**: Set up a Time-driven trigger in Apps Script to run `scanInboxForSuggestions` every 15-30 minutes.

### Gmail Import
- Label emails in Gmail with `GTD/ToProcess`.
- Click "Import (GTD/ToProcess)" in the Inbox view to convert them to tasks.

## Deployment Notes
- If you see "Code Updated!" alerts, ensure you are using the **Test Deployment** URL (`/dev`) for development or redeploying a new version for the **Published URL** (`/exec`).
