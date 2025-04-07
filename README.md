# Next.js Google Sheets Sales Data Processor

This project provides a web interface to upload multiple sales data files (CSV or XLSX), one for each store, to specified tabs in a Google Sheet. It automatically sorts the data alphabetically based on the "Product Category" column within each sheet tab and applies formatting (headers, borders, alternating row colors).

## Features

-   Manage a list of stores in a table interface.
-   Add or remove stores dynamically.
-   Upload individual CSV or XLSX files for each store.
-   Specify a target Google Sheet tab name for each store (defaults to store name).
-   Process all selected files sequentially with a single button click.
-   Provides status feedback for each upload (Selected, Processing, Success, Error).
-   Authenticates securely with Google Sheets API using a service account.
-   **Sorts data** alphabetically by the "Product Category" column *within each target sheet*.
-   **Clears** the target sheet tab before writing new data.
-   **Formats** the uploaded data in each sheet:
    -   Bold header row with custom background/text color.
    -   Alternating row colors (banding) for the entire dataset.
    -   Borders around the entire dataset.
-   Option to enable/disable the actual Google Sheets update.
-   Frontend built with React (Next.js).
-   Backend uses Next.js API Routes (handling one upload at a time).
-   Deployable on Vercel.
-   UI styled to match the provided dark theme screenshot.

## Prerequisites

-   Node.js (v18 or later recommended)
-   npm or yarn
-   A Google Account
-   A Google Cloud Platform (GCP) Project

## Setup Steps

1.  **Clone the Repository:**
    ```bash
    git clone <your-repository-url>
    cd your-nextjs-sheets-app # Or your chosen directory name
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    # You also need 'uuid' for this version:
    npm install uuid
    # or
    # yarn add uuid
    ```

3.  **Google Cloud & Sheets Setup:** (Same as previous instructions)
    *   Create GCP Project, Enable Sheets API, Create Service Account (download JSON), Create/Prepare Google Sheet, Share Sheet with Service Account Email (Editor role).

4.  **Configure Environment Variables:** (Same as previous instructions)
    *   Rename `.env.local.example` to `.env.local`.
    *   Fill in `SPREADSHEET_ID` and the full `GOOGLE_SERVICE_ACCOUNT` JSON content.

5.  **Run Locally:**
    ```bash
    npm run dev
    ```
    Open your browser to `http://localhost:3000`. The UI should match the screenshot. You can add/remove stores, change tab names, select files, and process them.

## Deployment to Vercel

(Same as previous instructions)

1.  Push to GitHub/GitLab/Bitbucket (ensure `.env.local` is ignored).
2.  Import Project on Vercel.
3.  Configure **Environment Variables** on Vercel (`SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT`).
4.  Deploy.

## Updating the Application

(Same as previous instructions)

1.  Make changes locally.
2.  Commit and push to Git.
3.  Vercel auto-deploys.

## Customization

-   **Category Column for Sorting:** Defined by `CATEGORY_COLUMN_NAME` constant in `pages/api/upload.js`.
-   **Formatting:** Adjust colors/styles in the `requests` array within `pages/api/upload.js`.
-   **UI Styling:** Modify inline styles in `pages/index.js` or implement a more robust CSS solution (CSS Modules, Tailwind CSS).
-   **Initial Stores:** Change the `INITIAL_STORES` array in `pages/index.js` to set different default stores on load.