
# GTD App for Google Apps Script

A personal productivity application based on the Getting Things Done (GTD) methodology, built with Google Apps Script and HTML/CSS/JS.

## Features

### Core GTD
- **Unified Inbox**: Capture everything as tasks with `status='inbox'`. New items (Quick Capture, Email, Import) appear here first.
- **Unified Item Architecture**:
    - **Tasks**: Standard actionable items (Contexts, Energy, Time).
    - **Projects**: Multi-step outcomes (Areas, Folder hierarchy).
    - **Folders**: Organizational containers (Ignored by attention alerts).
    - **Single Dialog**: Edit any item type in one unified interface. Easily convert Tasks ↔ Projects ↔ Folders.
- **Attention View**: Keep your system clean.
    - **Stalled Projects**: Identifies active projects with no next actions.
    - **Task Hygiene**: Flags next actions missing contexts or time estimates.
- **Contexts**: Filter tasks by context (e.g., @home, @work).
- **Weekly Review**: Dedicated workflow for reviewing your system.

### User Experience
- **Keyboard Shortcuts**: Power user navigation:
    - `j` / `k`: Next / Previous Item
    - `x`: Toggle Checkbox
    - `#`: Delete Item
    - `Enter` / `o`: Open Item
    - `g` then `i`/`n`/`p`: Go to Inbox/Next/Projects
- **Mobile Optimized**: Responsive design with sidebar navigation and optimized touch targets.

### AI & Automation
- **AI Email Scanner**: Uses Google Gemini to scan your Gmail Inbox for actionable items.
    - Auto-discovers the best available model (e.g., Gemini 2.0 Flash).
    - Filters out newsletters, receipts, and generic notifications.
    - Labels actionable emails as `GTD/Suggested`.
- **Gmail Import**: Import emails labeled `GTD/ToProcess` directly as tasks.

### Smart Categorization (New!)
- **Keyboard Shortcuts (Vim-style)**: Rapidly set metadata without mousing.
    - `p` (Project), `c` (Context), `t` (Time), `d` (Due).
    - Toggle values: `i` (Importance), `u` (Urgency), `e` (Energy).
- **Magic Wand (AI)**:
    - Type a task description and press `Cmd+J`.
    - Type a task description and press `Cmd+J`.
    - Gemini automatically infers Context, Project, Importance, Urgency, and Time Estimate from your text.

### Customizable Weekly Review
- **Numeric Cadence**: Set custom review intervals for any project (e.g., `1` week, `4` weeks, `52` weeks).
- **Due for Review Dashboard**: Automatically surfaces projects that are "stale" based on your custom cadence.
- **Smart Backfill**: Initializes review dates based on activity so you aren't overwhelmed by "overdue" items on day one.

### Advanced
- **Search**:
    - **Visual Hierarchy**: Search results show parent projects indented for context (e.g. `Bar > Foo`).
- **Export**: Download your completed task history to CSV (now with date-stamped filenames).
- **Database Compaction**: Clean up deleted items to keep the app fast.

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
- The first time you load the web app, it will automatically create the necessary sheets (`Tasks`, `Contexts`, `Areas`, `Settings`).

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
