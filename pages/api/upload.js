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
        console.log(`Found sheet "${sheetTitle}" with ID: ${sheet.properties.sheetId}`);
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
        await getSheetsService();
    } catch (initError) {
        return res.status(500).json({ message: initError.message });
    }

    const form = formidable();
    let fields = null;
    let files = null;

    try {
        ({ fields, files } = await new Promise((resolve, reject) => {
            form.parse(req, (err, parsedFields, parsedFiles) => {
                if (err) return reject(err);
                resolve({ fields: parsedFields, files: parsedFiles });
            });
        }));

        // --- Validation ---
        if (!files?.file?.[0]) return res.status(400).json({ message: "No file uploaded." });
        const file = files.file[0];
        const tempFilePath = file.filepath;

        let tabName = fields?.sheetTab?.[0]?.trim() || fields?.store?.[0]?.trim();
        if (!tabName) return res.status(400).json({ message: "Sheet tab name ('sheetTab' or 'store' field) not specified." });

        const spreadsheetId = process.env.SPREADSHEET_ID;
        if (!spreadsheetId) return res.status(500).json({ message: "Server configuration error: SPREADSHEET_ID not set." });

        // --- 1. Parse File Data ---
        let rawData = [];
        try {
            console.log(`Parsing file: ${file.originalFilename}`);
            const fileContent = await fs.readFile(tempFilePath);
            if (file.originalFilename.toLowerCase().endsWith('.csv')) {
                rawData = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true, bom: true });
            } else if (file.originalFilename.toLowerCase().endsWith('.xlsx')) {
                const workbook = xlsx.read(fileContent, {type: 'buffer'});
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                rawData = xlsx.utils.sheet_to_json(sheet, { defval: null });
            } else {
                throw new Error("Unsupported file type (CSV/XLSX only).");
            }
        } catch (parseError) {
             console.error("File parsing error:", parseError);
             throw new Error(`Error parsing file: ${parseError.message}`);
        } finally {
             await fs.unlink(tempFilePath).catch(e => console.error("Error deleting temp file:", e));
        }

        if (!rawData || rawData.length === 0) return res.status(400).json({ message: "File contains no data rows." });
        console.log(`Parsed ${rawData.length} raw data rows.`);

        // --- 2. Process Data: Find Headers, Filter, Group, Sort ---
        const firstRowKeys = Object.keys(rawData[0] || {});
        const findActualHeader = (targetHeader) => firstRowKeys.find(key => key.toLowerCase() === targetHeader.toLowerCase()) || null;

        const actualProductNameHeader = findActualHeader(PRODUCT_NAME_COLUMN);
        const actualCategoryHeader = findActualHeader(CATEGORY_COLUMN_NAME);
        const actualSalesHeader = findActualHeader(SALES_COLUMN_NAME);

        if (!actualProductNameHeader || !actualCategoryHeader || !actualSalesHeader) {
            return res.status(400).json({ message: `One or more required headers (${PRODUCT_NAME_COLUMN}, ${CATEGORY_COLUMN_NAME}, ${SALES_COLUMN_NAME}) not found in file.` });
        }
        console.log(`Using Headers - Name: ${actualProductNameHeader}, Category: ${actualCategoryHeader}, Sales: ${actualSalesHeader}`);

        const groupedData = {};
        let processedRowCount = 0;
        for (const item of rawData) {
             if (typeof item !== 'object' || item === null) continue;
             const name = item[actualProductNameHeader] ? String(item[actualProductNameHeader]).trim() : '';
             const cat = item[actualCategoryHeader] ? String(item[actualCategoryHeader]).trim() : 'Uncategorized';
             const sold = parseSales(item[actualSalesHeader]);
             if (!name && cat === 'Uncategorized' && sold === -Infinity) continue;
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
            if (sortedItems.length > 0) {
                 console.log(`   --- Adding blank row after ${category} ---`);
                 finalRows.push(emptyRow);
            } else {
                 console.log(`   --- Skipping blank row after empty category: ${category} ---`);
            }
        });

        if (finalRows.length > 1 && finalRows[finalRows.length - 1].every(cell => cell === '')) {
             console.log("   --- Removing trailing blank row ---");
             finalRows.pop();
        }
        console.log(`Final data array has ${finalRows.length} rows.`);

        // --- 3. Interact with Google Sheets ---
        const targetSheetId = await getSheetId(sheetsApi, spreadsheetId, tabName);

        // --- 4. Clear Existing Values AND Formatting ---
        console.log(`Clearing sheet: ${tabName} (Sheet ID: ${targetSheetId})`);
        const clearGridRange = { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: 2000, startColumnIndex: 0, endColumnIndex: 26 };
        const clearRequest = { repeatCell: { range: clearGridRange, cell: { userEnteredFormat: {}, userEnteredValue: null }, fields: "userEnteredFormat,userEnteredValue" } };
        await sheetsApi.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [clearRequest] } });
        console.log(`Sheet ${tabName} cleared.`);

        // --- 5. Write the new data ---
        console.log(`Writing ${finalRows.length} rows to sheet: ${tabName}`);
        await sheetsApi.spreadsheets.values.update({ spreadsheetId: spreadsheetId, range: `${tabName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: finalRows } });

        // --- 6. Apply Formatting (MINIMAL - Header + Inner Borders ONLY) ---
        console.log(`Applying formatting (Minimal - Header/Inner Borders)...`);
        const rowCount = finalRows.length;
        const colCount = OUTPUT_HEADERS.length; // Always 3
        const LIGHT_GRAY_BORDER = { red: 0.85, green: 0.85, blue: 0.85 };

        const formatRequests = [];

        // a) Borders (Light Gray, Solid, Thin - INNER ONLY)
        if (rowCount > 1 && colCount > 1) {
             formatRequests.push({
                 updateBorders: {
                     range: { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: colCount },
                     // NO outer borders specified
                     innerHorizontal: { style: "SOLID", width: 1, colorStyle: { rgbColor: LIGHT_GRAY_BORDER } },
                     innerVertical:   { style: "SOLID", width: 1, colorStyle: { rgbColor: LIGHT_GRAY_BORDER } }
                     // Fields default to what's specified if not explicitly listed here
                 }
             });
        }

        // b) Banding (Keep Commented Out for this test)
        /*
        if (rowCount > 1) {
             formatRequests.push({
                 addBanding: {
                     bandedRange: { // ... banding request content ... },
                 }
             });
        }
        */

         // c) Header Formatting (Keep Active)
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

        // Log the requests being sent (for debugging)
        console.log("Minimal Formatting Requests:", JSON.stringify(formatRequests, null, 2));

        // Execute formatting batch update
        if (formatRequests.length > 0) {
             try {
                 await sheetsApi.spreadsheets.batchUpdate({
                     spreadsheetId: spreadsheetId,
                     requestBody: { requests: formatRequests },
                 });
                 console.log("Minimal formatting applied successfully.");
             } catch (formatErr) {
                 const errorDetails = formatErr.errors ? JSON.stringify(formatErr.errors) : formatErr.message;
                 console.warn(`Minimal formatting failed: ${errorDetails}`);
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
        const tempFilePathOnError = files?.file?.[0]?.filepath;
        if (tempFilePathOnError) {
            await fs.unlink(tempFilePathOnError).catch(e => console.error("Error deleting temp file on handler error:", e));
        }
        return res.status(500).json({ message: `An server error occurred: ${error.message}` });
    }
}