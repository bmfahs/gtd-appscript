# GTD App for Google Apps Script

A personal productivity application based on the Getting Things Done (GTD) methodology, built with Google Apps Script and HTML/CSS/JS.

## Features
- **Inbox Processing**: Quickly capture and process tasks.
- **Project Management**: Organize tasks into projects and areas.
- **Contexts**: Filter tasks by context (e.g., @home, @work).
- **Weekly Review**: Dedicated workflow for reviewing your system.
- **Search**: Hierarchical search for tasks and projects.
- **Export**: Download your completed task history.

## Prerequisites
- A Google Account.
- Access to Google Drive and Google Sheets.

## Installation

1.  **Create a Project**:
    - Go to [script.google.com](https://script.google.com).
    - Click **New Project**.
    - Name it "GTD App" (or whatever you prefer).

2.  **Copy Files**:
    - Copy the contents of the `.gs` and `.html` files from this repository into your new Apps Script project.
    - Ensure filenames match (e.g., `Code.gs`, `Index.html`).

## Setup

1.  **Create the Database**:
    - Create a new Google Sheet in your Google Drive.
    - Name it "GTD Database" (or similar).
    - **Note**: You do not need to create any sheets or columns manually. The app will do this for you automatically on the first run.

2.  **Link the Spreadsheet**:
    - Copy the **Spreadsheet ID** from the URL of your Google Sheet.
      - URL format: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit...`
    - In your Apps Script project, open `Config.gs`.
    - Find the `setSpreadsheetId` function.
    - Run this function once with your ID, OR manually set a **Script Property**:
      - Go to **Project Settings** (gear icon).
      - Scroll to **Script Properties**.
      - Add a property:
        - **Property**: `SHEET_ID`
        - **Value**: `your_spreadsheet_id_here`

3.  **Initialize**:
    - The first time you load the web app, it will detect that the sheets are missing and automatically create them (`Tasks`, `Projects`, `Contexts`, `Areas`, `Settings`) with the correct columns and some default data.

## Deployment

1.  Click **Deploy** > **New deployment**.
2.  Select type: **Web app**.
3.  **Description**: "Initial deploy".
4.  **Execute as**: `Me` (your email).
5.  **Who has access**: `Only myself` (recommended for personal use).
6.  Click **Deploy**.
7.  Copy the **Web App URL**.

## Usage

- Open the Web App URL in your browser (desktop or mobile).
- Add the page to your home screen for an app-like experience.
- **Quick Capture**: Use the input at the bottom (mobile) or top (desktop) to add tasks to your Inbox.
- **Process**: Go to Inbox to clarify and organize tasks.
- **Review**: Use the Weekly Review page to keep your system current.
