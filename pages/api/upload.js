import formidable from 'formidable';
import fs from 'fs/promises';
import { google } from 'googleapis';
import { parse } from 'csv-parse/sync';
import xlsx from 'xlsx';

// --- Define EXACTLY the headers we need and will output ---
const OUTPUT_HEADERS = ["Product Name", "Product Category", "Total Items Sold"];
const [PRODUCT_NAME_COLUMN, CATEGORY_COLUMN_NAME, SALES_COLUMN_NAME] = OUTPUT_HEADERS;

export const config = {
    api: { bodyParser: false },
};

// --- Auth and Sheets Setup (Cached) ---
let googleAuthClient = null;
let sheetsApi = null;
async function getSheetsService() {
    if (sheetsApi) return sheetsApi;
    try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
        googleAuthClient = await auth.getClient();
        sheetsApi = google.sheets({ version: 'v4', auth: googleAuthClient });
        console.log("Google Sheets API client initialized.");
        return sheetsApi;
    } catch (error) {
        console.error("Failed to initialize Google Sheets API client:", error);
        throw new Error("Server configuration error: Could not initialize Google Sheets access.");
    }
}

// --- Get/Create Sheet ID ---
const getSheetId = async (sheetsApiInstance, spreadsheetId, sheetTitle) => {
    try {
        const response = await sheetsApiInstance.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title))' });
        const sheet = response.data.sheets.find(s => s.properties.title === sheetTitle);
        if (!sheet) {
            console.log(`Sheet "${sheetTitle}" not found. Creating it.`);
            const addSheetResponse = await sheetsApiInstance.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] } });
            const newSheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;
            console.log(`Sheet "${sheetTitle}" created with ID: ${newSheetId}`);
            return newSheetId;
        }
        return sheet.properties.sheetId;
    } catch (error) {
        console.error(`Error getting/creating sheet ID for "${sheetTitle}":`, error);
        throw new Error(`Failed to access or create sheet tab "${sheetTitle}". Check permissions or API errors.`);
    }
};

// --- Parse Sales Number ---
const parseSales = (value) => {
    if (value === null || value === undefined || value === '') return -Infinity;
    const num = Number(String(value).replace(/,/g, ''));
    return isNaN(num) ? -Infinity : num;
};

// --- Main API Handler ---
export default async function handler(req, res) {
    try {
        await getSheetsService(); // Ensure API client is ready
    } catch (initError) {
        return res.status(500).json({ message: initError.message });
    }

    const form = formidable();
    let fields = null; // Declare fields in the outer scope
    let files = null;  // Declare files in the outer scope

    try {
        // Assign parsed fields/files to the outer scope variables
        ({ fields, files } = await new Promise((resolve, reject) => {
            form.parse(req, (err, parsedFields, parsedFiles) => {
                if (err) return reject(err);
                resolve({ fields: parsedFields, files: parsedFiles });
            });
        }));

        // File Validation
        if (!files?.file?.[0]) return res.status(400).json({ message: "No file uploaded." });
        const file = files.file[0];
        const tempFilePath = file.filepath; // Define here for access in finally block within try

        // Tab Name Validation (checks 'sheetTab' then 'store')
        let tabName = fields?.sheetTab?.[0]?.trim();
        if (!tabName) tabName = fields?.store?.[0]?.trim();
        if (!tabName) return res.status(400).json({ message: "Sheet tab name ('sheetTab' or 'store' field) not specified." });

        // Spreadsheet ID Validation
        const spreadsheetId = process.env.SPREADSHEET_ID;
        if (!spreadsheetId) return res.status(500).json({ message: "Server configuration error: SPREADSHEET_ID not set." });

        // --- 1. Parse File Data ---
        let rawData = []; // Expect array of objects
        try {
            console.log(`Parsing file: ${file.originalFilename}`);
            if (file.originalFilename.toLowerCase().endsWith('.csv')) {
                const content = await fs.readFile(tempFilePath);
                rawData = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
            } else if (file.originalFilename.toLowerCase().endsWith('.xlsx')) {
                const workbook = xlsx.readFile(tempFilePath);
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                rawData = xlsx.utils.sheet_to_json(sheet, { defval: null });
            } else {
                throw new Error("Unsupported file type (CSV/XLSX only).");
            }
        } catch (parseError) {
             console.error("File parsing error:", parseError);
             throw new Error(`Error parsing file: ${parseError.message}`);
        } finally {
             await fs.unlink(tempFilePath).catch(e => console.error("Error deleting temp file:", e)); // Cleanup temp file
        }

        if (!rawData || rawData.length === 0) return res.status(400).json({ message: "File contains no data rows." });
        console.log(`Parsed ${rawData.length} raw data rows.`);

        // --- 2. Process Data: Find Headers, Filter, Group, Sort ---
        const firstRowKeys = Object.keys(rawData[0] || {});
        const findActualHeader = (targetHeader) => firstRowKeys.find(key => key.toLowerCase() === targetHeader.toLowerCase()) || null;

        const actualProductNameHeader = findActualHeader(PRODUCT_NAME_COLUMN);
        const actualCategoryHeader = findActualHeader(CATEGORY_COLUMN_NAME);
        const actualSalesHeader = findActualHeader(SALES_COLUMN_NAME);

        if (!actualProductNameHeader) return res.status(400).json({ message: `Required header similar to "${PRODUCT_NAME_COLUMN}" not found.` });
        if (!actualCategoryHeader) return res.status(400).json({ message: `Required header similar to "${CATEGORY_COLUMN_NAME}" not found.` });
        if (!actualSalesHeader) return res.status(400).json({ message: `Required header similar to "${SALES_COLUMN_NAME}" not found.` });

        console.log(`Using Headers - Name: ${actualProductNameHeader}, Category: ${actualCategoryHeader}, Sales: ${actualSalesHeader}`);

        const groupedData = {};
        let processedRowCount = 0;
        for (const item of rawData) {
             if (typeof item !== 'object' || item === null) continue;
             const name = item[actualProductNameHeader] ? String(item[actualProductNameHeader]).trim() : '';
             const cat = item[actualCategoryHeader] ? String(item[actualCategoryHeader]).trim() : 'Uncategorized';
             const sold = parseSales(item[actualSalesHeader]);
             if (!name) continue;
             if (!groupedData[cat]) groupedData[cat] = [];
             groupedData[cat].push({ name, cat, sold });
             processedRowCount++;
        }
        console.log(`Processed ${processedRowCount} valid rows into groups.`);

        const sortedCategories = Object.keys(groupedData).sort((a, b) => a.localeCompare(b));

        // --- Reconstruct Final Data Array (Using Bot's Blank Row Logic) ---
        const finalRows = [OUTPUT_HEADERS];
        const emptyRow = ['', '', ''];

        sortedCategories.forEach((category, index) => {
            console.log(`Adding category: ${category}`);
            const sortedItems = groupedData[category].sort((a, b) => {
                if (b.sold !== a.sold) return b.sold - a.sold;
                return a.name.localeCompare(b.name);
            });
            for (const item of sortedItems) {
                const displaySold = item.sold === -Infinity ? '' : item.sold;
                finalRows.push([item.name, item.cat, displaySold]);
            }
            // Always add blank row after category items
            console.log(`   --- Adding blank row after ${category} ---`);
            finalRows.push(emptyRow);
        });

        // Remove the very last blank row
        if (finalRows.length > 1 && finalRows[finalRows.length - 1].every(cell => cell === '')) {
             console.log("   --- Removing trailing blank row ---");
             finalRows.pop();
        }
        console.log(`Final data array has ${finalRows.length} rows (using bot logic).`);

        // --- 3. Interact with Google Sheets ---
        const targetSheetId = await getSheetId(sheetsApi, spreadsheetId, tabName);

        // --- 4. Clear Existing Values AND Formatting ---
        console.log(`Clearing sheet: ${tabName} (Sheet ID: ${targetSheetId})`);
        const clearGridRange = { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: 1500, startColumnIndex: 0, endColumnIndex: 26 };
        const clearRequest = { repeatCell: { range: clearGridRange, cell: { userEnteredFormat: {}, userEnteredValue: null }, fields: "userEnteredFormat,userEnteredValue" } };
        await sheetsApi.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [clearRequest] } });
        console.log(`Sheet ${tabName} cleared.`);

        // --- 5. Write the new data ---
        console.log(`Writing ${finalRows.length} rows to sheet: ${tabName}`);
        await sheetsApi.spreadsheets.values.update({ spreadsheetId: spreadsheetId, range: `${tabName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: finalRows } });

        // --- 6. Apply Formatting (BANDING STILL DISABLED for testing) ---
        console.log(`Applying formatting (Banding Disabled)...`);
        const rowCount = finalRows.length;
        const colCount = OUTPUT_HEADERS.length;
        const LIGHT_GRAY_BORDER = { red: 0.85, green: 0.85, blue: 0.85 };
        // const LIGHT_GRAY_BAND = { red: 0.95, green: 0.95, blue: 0.95 }; // Banding color defined but request below is commented out

        const formatRequests = [];

        // a) Borders (Light Gray, Solid, Thin) - KEEP ACTIVE
        formatRequests.push({
            updateBorders: {
                range: { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: colCount },
                top:    { style: "SOLID", width: 1, colorStyle: { rgbColor: LIGHT_GRAY_BORDER } },
                bottom: { style: "SOLID", width: 1, colorStyle: { rgbColor: LIGHT_GRAY_BORDER } },
                left:   { style: "SOLID", width: 1, colorStyle: { rgbColor: LIGHT_GRAY_BORDER } },
                right:  { style: "SOLID", width: 1, colorStyle: { rgbColor: LIGHT_GRAY_BORDER } },
                innerHorizontal: { style: "SOLID", width: 1, colorStyle: { rgbColor: LIGHT_GRAY_BORDER } },
                innerVertical:   { style: "SOLID", width: 1, colorStyle: { rgbColor: LIGHT_GRAY_BORDER } }
            }
        });

        // b) Banding (Keep Commented Out for this test)
        /*
        if (rowCount > 1) {
             formatRequests.push({
                 addBanding: {
                     bandedRange: {
                         range: { sheetId: targetSheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: colCount },
                         rowProperties: {
                             firstBandColorStyle: { rgbColor: {} }, // Default White
                             secondBandColorStyle: { rgbColor: LIGHT_GRAY_BAND } // Use very light gray
                         },
                     }
                 }
             });
        }
        */

         // c) Header Formatting - KEEP ACTIVE
         formatRequests.push({
             repeatCell: {
                 range: { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
                 cell: { userEnteredFormat: {
                     backgroundColorStyle: { rgbColor: { red: 0.2, green: 0.4, blue: 0.6 } },
                     textFormat: { foregroundColorStyle: { rgbColor: { red: 1.0, green: 1.0, blue: 1.0 } }, bold: true },
                     horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE"
                 }},
                 fields: "userEnteredFormat(backgroundColorStyle,textFormat,horizontalAlignment,verticalAlignment)"
             }
         });

        // Execute formatting batch update
        if (formatRequests.length > 0) {
             try {
                 await sheetsApi.spreadsheets.batchUpdate({
                     spreadsheetId: spreadsheetId,
                     requestBody: { requests: formatRequests },
                 });
                 console.log("Formatting applied successfully (Banding Disabled).");
             } catch (formatErr) {
                 console.warn('Formatting failed:', formatErr.errors ? formatErr.errors.map(e=>e.message).join('; ') : formatErr.message);
                 console.log("<<< END Applying formatting - FAILED (but continuing)");
             }
        } else {
             console.log("<<< END Applying formatting - SKIPPED (no requests)");
        }

        // Success
        console.log(">>> Handler finished successfully.");
        return res.status(200).json({ message: 'Uploaded and formatted successfully' });

    } catch (error) {
        console.error("Handler Error:", error);
         // Cleanup attempted error handling - files should be accessible now
         const tempFilePathOnError = files?.file?.[0]?.filepath;
         if (tempFilePathOnError) {
            // Check if file exists before attempting unlink
            try {
                await fs.access(tempFilePathOnError); // Check existence
                await fs.unlink(tempFilePathOnError);
                console.log("Cleaned up temp file on error.");
            } catch (unlinkError) {
                // Log if file doesn't exist or unlink fails, but don't crash
                if (unlinkError.code !== 'ENOENT') { // ENOENT = Error NO ENTity (file not found)
                     console.error("Error deleting temp file on handler error:", unlinkError);
                }
            }
         }
        return res.status(500).json({ message: `An server error occurred: ${error.message}` });
    }
}