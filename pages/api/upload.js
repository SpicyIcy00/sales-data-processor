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

    try {
        const [fields, files] = await form.parse(req);

        // File Validation
        if (!files.file?.[0]) return res.status(400).json({ message: "No file uploaded." });
        const file = files.file[0];

        // Tab Name Validation (checks 'sheetTab' then 'store')
        let tabName = fields.sheetTab?.[0]?.trim();
        if (!tabName) tabName = fields.store?.[0]?.trim();
        if (!tabName) return res.status(400).json({ message: "Sheet tab name ('sheetTab' or 'store' field) not specified." });

        // Spreadsheet ID Validation
        const spreadsheetId = process.env.SPREADSHEET_ID;
        if (!spreadsheetId) return res.status(500).json({ message: "Server configuration error: SPREADSHEET_ID not set." });

        // --- 1. Parse File Data ---
        let rawData = []; // Expect array of objects
        const tempFilePath = file.filepath; // Keep path for cleanup
        try {
            console.log(`Parsing file: ${file.originalFilename}`);
            if (file.originalFilename.toLowerCase().endsWith('.csv')) {
                const content = await fs.readFile(tempFilePath);
                rawData = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true }); // Add bom: true
            } else if (file.originalFilename.toLowerCase().endsWith('.xlsx')) {
                const workbook = xlsx.readFile(tempFilePath);
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                rawData = xlsx.utils.sheet_to_json(sheet, { defval: null });
            } else {
                throw new Error("Unsupported file type (CSV/XLSX only).");
            }
        } catch (parseError) {
             console.error("File parsing error:", parseError);
             throw new Error(`Error parsing file: ${parseError.message}`); // Throw to be caught by outer catch
        } finally {
             await fs.unlink(tempFilePath).catch(e => console.error("Error deleting temp file:", e)); // Cleanup temp file
        }

        if (!rawData || rawData.length === 0) return res.status(400).json({ message: "File contains no data rows." });
        console.log(`Parsed ${rawData.length} raw data rows.`);

        // --- 2. Process Data: Find Headers, Filter, Group, Sort ---

        // Find the *actual* header names used in the file (case-insensitive)
        const firstRowKeys = Object.keys(rawData[0] || {});
        const findActualHeader = (targetHeader) => {
            return firstRowKeys.find(key => key.toLowerCase() === targetHeader.toLowerCase()) || null;
        };

        const actualProductNameHeader = findActualHeader(PRODUCT_NAME_COLUMN);
        const actualCategoryHeader = findActualHeader(CATEGORY_COLUMN_NAME);
        const actualSalesHeader = findActualHeader(SALES_COLUMN_NAME);

        // **Strictly validate that ALL required columns were found**
        if (!actualProductNameHeader) return res.status(400).json({ message: `Required header similar to "${PRODUCT_NAME_COLUMN}" not found.` });
        if (!actualCategoryHeader) return res.status(400).json({ message: `Required header similar to "${CATEGORY_COLUMN_NAME}" not found.` });
        if (!actualSalesHeader) return res.status(400).json({ message: `Required header similar to "${SALES_COLUMN_NAME}" not found.` });

        console.log(`Using Headers - Name: ${actualProductNameHeader}, Category: ${actualCategoryHeader}, Sales: ${actualSalesHeader}`);

        // ** Filter, Group, and Sort **
        const groupedData = {};
        let processedRowCount = 0;
        for (const item of rawData) {
             if (typeof item !== 'object' || item === null) continue;

             const name = item[actualProductNameHeader] ? String(item[actualProductNameHeader]).trim() : '';
             const cat = item[actualCategoryHeader] ? String(item[actualCategoryHeader]).trim() : 'Uncategorized';
             const sold = parseSales(item[actualSalesHeader]);

             if (!name) continue; // Skip rows without a product name

             if (!groupedData[cat]) groupedData[cat] = [];
             groupedData[cat].push({ name, cat, sold });
             processedRowCount++;
        }
        console.log(`Processed ${processedRowCount} valid rows into groups.`);
        // console.log("Grouped Data Structure:", JSON.stringify(groupedData, null, 2)); // Deep log if needed


        // ** Sort Categories Alphabetically **
        const sortedCategories = Object.keys(groupedData).sort((a, b) => a.localeCompare(b));

        // ** Reconstruct Final Data Array (Headers + Sorted Data + Blank Rows) **
        const finalRows = [OUTPUT_HEADERS]; // Start with our standard output headers
        const emptyRow = ['', '', ''];

        sortedCategories.forEach((category, index) => {
            console.log(`Adding category: ${category}`);
            // Sort items within category by sales (desc), then name (asc)
            const sortedItems = groupedData[category].sort((a, b) => {
                if (b.sold !== a.sold) return b.sold - a.sold;
                return a.name.localeCompare(b.name);
            });

            // Add sorted items for this category
            for (const item of sortedItems) {
                // Don't display -Infinity, show as blank or 0
                const displaySold = item.sold === -Infinity ? '' : item.sold;
                finalRows.push([item.name, item.cat, displaySold]);
                // console.log(`  -> Adding item: ${item.name}, ${item.cat}, ${displaySold}`); // Detail log if needed
            }

            // **Add blank row separator IF it's NOT the last category**
            if (index < sortedCategories.length - 1) {
                console.log(`   --- Adding blank row after ${category} ---`);
                finalRows.push(emptyRow);
            }
        });
        console.log(`Final data array has ${finalRows.length} rows.`);

        // --- 3. Interact with Google Sheets ---
        const targetSheetId = await getSheetId(sheetsApi, spreadsheetId, tabName);

        // --- 4. Clear Existing Values AND Formatting ---
        console.log(`Clearing sheet: ${tabName} (Sheet ID: ${targetSheetId})`);
        const clearGridRange = { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: 1500, startColumnIndex: 0, endColumnIndex: 26 }; // Clear more rows/cols
        const clearRequest = { repeatCell: { range: clearGridRange, cell: { userEnteredFormat: {}, userEnteredValue: null }, fields: "userEnteredFormat,userEnteredValue" } };
        await sheetsApi.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [clearRequest] } });
        console.log(`Sheet ${tabName} cleared.`);

        // --- 5. Write the new data ---
        console.log(`Writing ${finalRows.length} rows to sheet: ${tabName}`);
        await sheetsApi.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: `${tabName}!A1`, // Write starts at A1
            valueInputOption: 'USER_ENTERED', // Interprets values like typing
            requestBody: { values: finalRows }, // Contains only 3 columns
        });

        // --- 6. Apply Formatting ---
        console.log(`Applying formatting...`);
        const rowCount = finalRows.length;
        const colCount = OUTPUT_HEADERS.length; // Always 3
        const LIGHT_GRAY_BORDER = { red: 0.85, green: 0.85, blue: 0.85 };
        const LIGHT_GRAY_BAND = { red: 0.95, green: 0.95, blue: 0.95 }; // VERY light gray

        const formatRequests = [];

        // a) Borders (Light Gray, Solid, Thin) - Applied to A1:C<rowCount>
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

        // b) Banding (White / VERY Light Gray) - Applied to A2:C<rowCount>
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

         // c) Header Formatting (Bold, White Text, Blue BG, Centered) - Applied to A1:C1
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
                 console.log("Formatting applied successfully.");
             } catch (formatErr) {
                 console.warn('Formatting failed:', formatErr.errors ? formatErr.errors.map(e=>e.message).join('; ') : formatErr.message);
             }
        }

        // Success
        return res.status(200).json({ message: 'Uploaded and formatted successfully' });

    } catch (error) {
        console.error("Handler Error:", error);
         // Cleanup attempted error handling
         const tempFilePathOnError = files?.file?.[0]?.filepath;
         if (tempFilePathOnError) {
            await fs.unlink(tempFilePathOnError).catch(e => console.error("Error deleting temp file on handler error:", e));
         }
        return res.status(500).json({ message: `An server error occurred: ${error.message}` });
    }
}