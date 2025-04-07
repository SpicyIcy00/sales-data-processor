// pages/api/ensureSheetTab.js
import { google } from 'googleapis';

// --- Configuration --- (Should match upload.js)
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
let credentials;
try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
        throw new Error("GOOGLE_SERVICE_ACCOUNT environment variable not set.");
    }
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (error) {
    console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT JSON:", error);
}

// --- Helper Functions (Copied/Adapted from upload.js) ---

const getAuth = () => {
    if (!credentials) {
        throw new Error("Google Service Account credentials are not configured correctly.");
    }
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth.getClient();
};

const getSheetsApi = async () => {
    const auth = await getAuth();
    return google.sheets({ version: 'v4', auth });
};

// Slightly modified getSheetId: Doesn't need to return ID here, just ensure existence
const ensureSheetExists = async (sheetsApi, spreadsheetId, sheetTitle) => {
    try {
        const response = await sheetsApi.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets(properties(title))', // Only need titles to check existence
        });
        const sheetExists = response.data.sheets.some(s => s.properties.title === sheetTitle);

        if (!sheetExists) {
            console.log(`Sheet "${sheetTitle}" not found. Attempting to create it.`);
            await sheetsApi.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{ addSheet: { properties: { title: sheetTitle } } }]
                }
            });
            console.log(`Sheet "${sheetTitle}" created successfully.`);
            return true; // Indicates creation or prior existence
        } else {
            console.log(`Sheet "${sheetTitle}" already exists.`);
            return true; // Indicates prior existence
        }
    } catch (error) {
        console.error(`Error ensuring sheet "${sheetTitle}" exists:`, error);
        // Check for specific Google API errors if needed
        if (error.code === 403) { // Permission denied
             throw new Error(`Permission denied for sheet "${sheetTitle}". Ensure the service account has editor access to the spreadsheet.`);
        }
        throw new Error(`Failed to ensure sheet tab "${sheetTitle}" exists. ${error.message}`);
    }
};


// --- API Handler ---
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

    if (!SPREADSHEET_ID || !credentials) {
        return res.status(500).json({ message: "Server configuration error (Spreadsheet ID or Credentials)." });
    }

    try {
        const { sheetTab } = req.body; // Expecting { "sheetTab": "NewStoreName" }

        if (!sheetTab || typeof sheetTab !== 'string' || sheetTab.trim() === '') {
            return res.status(400).json({ message: "Sheet tab name is required." });
        }

        const trimmedSheetTab = sheetTab.trim();
        const sheetsApi = await getSheetsApi();

        await ensureSheetExists(sheetsApi, SPREADSHEET_ID, trimmedSheetTab);

        console.log(`Successfully ensured sheet tab exists: ${trimmedSheetTab}`);
        return res.status(200).json({ message: `Sheet tab "${trimmedSheetTab}" is ready.` });

    } catch (error) {
        console.error("ensureSheetTab API failed:", error);
        // Return a more specific error message if available
        return res.status(500).json({ message: error.message || "Failed to ensure sheet tab exists." });
    }
}