// pages/index.js
import React, { useState, useRef, useEffect } from 'react'; // Ensure React is imported
import { v4 as uuidv4 } from 'uuid'; // For unique IDs, install: npm install uuid

// --- Helper Components (Icons) ---
// (You can replace these SVGs with actual icon library components if preferred)
const IconGear = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="1em" height="1em" style={{ marginRight: '8px', verticalAlign: 'middle' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.004.827c-.29.24-.438.613-.438 1.001s.148.76.438 1.001l1.004.827c.424.35.534.954.26 1.431l-1.296 2.247a1.125 1.125 0 0 1-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.075.124a6.57 6.57 0 0 1-.22.127c-.331.183-.581.495-.645.87l-.213 1.281c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 0 1-.22-.127c-.324-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 0 1-1.37-.49l-1.296-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.29-.24.438.613.438-1.001s-.148-.76-.438-1.001l-1.004-.827a1.125 1.125 0 0 1-.26-1.431l1.296-2.247a1.125 1.125 0 0 1 1.37-.49l1.217.456c.355.133.75.072 1.075-.124.073-.044.146-.087.22-.127.332-.183.582-.495.645-.87l.213-1.281Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>;
const IconPlus = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="1em" height="1em" style={{ marginRight: '8px', verticalAlign: 'middle' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>;
const IconAlert = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="1em" height="1em" style={{ marginRight: '8px', verticalAlign: 'middle' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>;
const IconUpload = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="1.5em" height="1.5em" style={{ marginBottom: '5px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v12.75" /></svg>;


// --- Initial State ---
const INITIAL_STORES = [
    { id: uuidv4(), storeName: 'Rockwell', sheetTab: 'Rockwell', file: null, status: 'No file selected', isLoading: false, fileInputId: `file-${uuidv4()}` },
    { id: uuidv4(), storeName: 'Greenhills', sheetTab: 'Greenhills', file: null, status: 'No file selected', isLoading: false, fileInputId: `file-${uuidv4()}` },
    { id: uuidv4(), storeName: 'Magnolia', sheetTab: 'Magnolia', file: null, status: 'No file selected', isLoading: false, fileInputId: `file-${uuidv4()}` },
    { id: uuidv4(), storeName: 'North Edsa', sheetTab: 'North Edsa', file: null, status: 'No file selected', isLoading: false, fileInputId: `file-${uuidv4()}` },
    { id: uuidv4(), storeName: 'Fairview', sheetTab: 'Fairview', file: null, status: 'No file selected', isLoading: false, fileInputId: `file-${uuidv4()}` },
];

export default function SalesProcessorPage() {
    const [stores, setStores] = useState(INITIAL_STORES);
    const [updateSheets, setUpdateSheets] = useState(true); // Checkbox state
    const [isProcessingAll, setIsProcessingAll] = useState(false);
    const [globalMessage, setGlobalMessage] = useState({ type: '', text: '' }); // For success/error feedback
    const [addingStore, setAddingStore] = useState(false); // Loading state for adding store

    // Refs for file inputs (used for click trigger and reset)
    const fileInputRefs = useRef({});
    useEffect(() => {
        fileInputRefs.current = stores.reduce((acc, store) => {
            acc[store.id] = acc[store.id] || React.createRef();
            return acc;
        }, {});
    }, [stores]);

    // --- State Update Function ---
    const updateStoreState = (id, updates) => {
        setStores(prevStores =>
            prevStores.map(store =>
                store.id === id ? { ...store, ...updates } : store
            )
        );
    };

    // --- File Handling (Common logic for select/drop) ---
    const handleFileSelect = (file, id) => {
        setGlobalMessage({ type: '', text: '' }); // Clear global message
        if (!file) {
             updateStoreState(id, { file: null, status: 'No file selected', isLoading: false });
             // Also clear the hidden input value if selection is cancelled/cleared
             if(fileInputRefs.current[id]?.current) {
                fileInputRefs.current[id].current.value = '';
            }
             return;
        }

        const allowedTypes = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
        if (!allowedTypes.includes(file.type)) {
            updateStoreState(id, { file: null, status: 'Error: Invalid file type (CSV/XLSX only)', isLoading: false });
            // Clear the hidden input value
            if(fileInputRefs.current[id]?.current) {
                fileInputRefs.current[id].current.value = '';
            }
            return;
        }
        // Don't update status here, let the display logic handle it based on store.file
        updateStoreState(id, { file: file, status: 'File ready', isLoading: false });
    }

    // Handler for the hidden file input's change event
    const handleFileInputChange = (event, id) => {
        handleFileSelect(event.target.files[0], id);
    };

     // --- Drag and Drop Handlers ---
     const handleDragOver = (event) => {
         event.preventDefault(); // Necessary to allow dropping
         event.stopPropagation();
         event.currentTarget.style.borderColor = '#6a11cb'; // Highlight border
         event.currentTarget.style.backgroundColor = '#2a2a4e'; // Highlight background
     };

     const handleDragLeave = (event) => {
         event.preventDefault();
         event.stopPropagation();
         event.currentTarget.style.borderColor = '#4a4a6a'; // Back to normal border
         event.currentTarget.style.backgroundColor = '#1a1a2e'; // Back to normal background
     };

     const handleDrop = (event, id) => {
         event.preventDefault();
         event.stopPropagation();
         event.currentTarget.style.borderColor = '#4a4a6a'; // Back to normal border
         event.currentTarget.style.backgroundColor = '#1a1a2e'; // Back to normal background

         if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
             const droppedFile = event.dataTransfer.files[0];
             handleFileSelect(droppedFile, id); // Use the common handler
             event.dataTransfer.clearData(); // Clean up
         }
     };

    // --- Tab Change ---
    const handleTabChange = (event, id) => {
        updateStoreState(id, { sheetTab: event.target.value });
    };

    // --- Remove Store ---
    const handleRemoveStore = (id) => {
        setStores(prevStores => prevStores.filter(store => store.id !== id));
        // Clean up ref
        delete fileInputRefs.current[id];
    };

    // --- Add Store (Calls API to ensure sheet) ---
    const handleAddStore = async () => {
        setGlobalMessage({ type: '', text: '' });
        const newStoreName = prompt("Enter new store name (this will also be the default Sheet Tab name):");

        if (!newStoreName || newStoreName.trim() === "") {
            return; // User cancelled or entered empty name
        }

        const trimmedName = newStoreName.trim();
        // Prevent adding if store/tab name already exists in the UI list
        if (stores.some(store => store.storeName === trimmedName || store.sheetTab === trimmedName)) {
             setGlobalMessage({ type: 'error', text: `Store or Sheet Tab named '${trimmedName}' already exists in the list.` });
             return;
        }

        setAddingStore(true); // Show loading state for add button

        try {
            // Call the new API endpoint to ensure the sheet exists/is created
            const response = await fetch('/api/ensureSheetTab', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sheetTab: trimmedName }),
            });

            const result = await response.json();

            if (!response.ok) {
                // Throw error to be caught below
                throw new Error(result.message || `Failed to prepare sheet tab (status: ${response.status})`);
            }

            // If API call is successful, add the store to the UI state
            const newId = uuidv4();
            setStores(prevStores => [
                ...prevStores,
                {
                    id: newId,
                    storeName: trimmedName,
                    sheetTab: trimmedName, // Default tab name to store name
                    file: null,
                    status: 'No file selected',
                    isLoading: false,
                    fileInputId: `file-${newId}`
                }
            ]);
             setGlobalMessage({ type: 'success', text: `Store '${trimmedName}' added and sheet tab ready.` });

        } catch (error) {
            console.error("Error adding store:", error);
            setGlobalMessage({ type: 'error', text: `Failed to add store: ${error.message}` });
        } finally {
            setAddingStore(false); // Hide loading state
        }
    };

    // --- Process All Files ---
    const processAllFiles = async () => {
        if (!updateSheets) {
             setGlobalMessage({ type: 'error', text: "Enable 'Update Google Sheets after processing' to upload." });
            return;
        }
        setGlobalMessage({ type: '', text: '' }); // Clear previous global messages
        setIsProcessingAll(true);

        const storesToProcess = stores.filter(store => store.file);

        if (storesToProcess.length === 0) {
             setGlobalMessage({ type: 'error', text: "No files selected for processing." });
            setIsProcessingAll(false);
            return;
        }

        // Process sequentially
        let successCount = 0;
        let errorCount = 0;
        for (const store of storesToProcess) {
            // Double check file exists client-side before attempting upload
            if (!store.file) {
                 updateStoreState(store.id, { status: 'Error: File missing before upload', isLoading: false });
                 errorCount++;
                 continue;
            }
             if (!store.sheetTab || store.sheetTab.trim() === '') {
                 updateStoreState(store.id, { status: 'Error: Sheet Tab name required', isLoading: false });
                 errorCount++;
                 continue; // Skip this store
             }

            updateStoreState(store.id, { status: 'Processing...', isLoading: true });

            const formData = new FormData();
            formData.append('file', store.file);
            formData.append('sheetTab', store.sheetTab.trim());

            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData,
                });
                const result = await response.json();

                if (response.ok) {
                    updateStoreState(store.id, { status: 'Success!', isLoading: false, file: null }); // Clear file on success
                    successCount++;
                    // Reset the file input visually via ref
                    if (fileInputRefs.current[store.id]?.current) {
                         fileInputRefs.current[store.id].current.value = '';
                    }
                } else {
                     errorCount++;
                    updateStoreState(store.id, { status: `Error: ${result.message || response.statusText}`, isLoading: false });
                }
            } catch (error) {
                 errorCount++;
                console.error(`Error uploading for ${store.storeName}:`, error);
                updateStoreState(store.id, { status: `Error: Network or server issue.`, isLoading: false }); // Simplified error
            }
        } // End of loop

        setIsProcessingAll(false);

        // Set final global message based on outcomes
        if (errorCount > 0 && successCount > 0) {
             setGlobalMessage({ type: 'error', text: `Processing complete. ${successCount} succeeded, ${errorCount} failed. Check statuses.`});
        } else if (errorCount > 0) {
             setGlobalMessage({ type: 'error', text: `Processing failed. ${errorCount} error(s). Check statuses.`});
        } else if (successCount > 0) {
            setGlobalMessage({ type: 'success', text: `Processing complete. ${successCount} file(s) successfully uploaded.`});
        }
         // No message if nothing was processed (already handled at the start)
    };

    // --- Styles ---
    const styles = {
        body: { backgroundColor: '#1a1a2e', color: '#e0e0e0', fontFamily: 'Arial, sans-serif', padding: '20px', minHeight: '100vh' },
        container: { maxWidth: '1100px', margin: '0 auto', backgroundColor: '#16213e', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.4)' },
        header: { display: 'flex', alignItems: 'center', marginBottom: '20px', color: '#ffffff' },
        logo: { marginRight: '15px', fontSize: '2rem' }, // Replace with actual logo if needed
        title: { fontSize: '1.8rem', margin: '0' },
        infoBox: { backgroundColor: 'rgba(255, 193, 7, 0.2)', borderLeft: '4px solid #ffc107', padding: '10px 15px', marginBottom: '20px', borderRadius: '4px', display: 'flex', alignItems: 'center', color: '#ffc107' },
        checkboxContainer: { marginBottom: '20px', display: 'flex', alignItems: 'center' },
        checkbox: { marginRight: '10px', accentColor: '#6a11cb', width: '16px', height: '16px' }, // Style checkbox color
        table: { width: '100%', borderCollapse: 'separate', borderSpacing: '0 1px', marginBottom: '20px' }, // Use separate for spacing effect if desired
        th: { backgroundColor: '#0f3460', color: '#ffffff', padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid #1a1a2e' },
        td: { padding: '10px 15px', borderBottom: '1px solid #1a1a2e', verticalAlign: 'middle', backgroundColor: '#1f2a40' }, // Cell background slightly different
        input: { backgroundColor: '#1a1a2e', color: '#e0e0e0', border: '1px solid #4a4a6a', padding: '8px', borderRadius: '4px', width: 'calc(100% - 18px)', fontSize: '0.9em' },
        // Drop Zone styles
        dropZone: {
            border: '2px dashed #4a4a6a',
            borderRadius: '5px',
            padding: '10px', // Reduced padding
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: '#1a1a2e',
            color: '#aaa',
            transition: 'border-color 0.3s ease, background-color 0.3s ease',
            minHeight: '50px', // Reduced min height
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85em', // Smaller text
        },
        dropZoneActive: { // Style when dragging over
            borderColor: '#6a11cb',
            backgroundColor: '#2a2a4e',
        },
         dropZoneDisabled: {
             cursor: 'not-allowed',
             opacity: 0.6,
             borderColor: '#3a3a5a',
             backgroundColor: '#252535', // Slightly different disabled background
         },
        fileInput: { display: 'none' }, // Keep input hidden
        // Status Text styles
        statusText: {
            fontSize: '0.9em',
            whiteSpace: 'normal', // Allow wrapping for long names/messages
            wordBreak: 'break-word', // Break long words if needed
            maxWidth: '200px', // Max width before wrapping
            display: 'inline-block',
            verticalAlign: 'middle',
        },
        // Global Message area styles
        globalMessage: {
            padding: '10px 15px',
            margin: '15px 0',
            borderRadius: '4px',
            textAlign: 'center',
            fontWeight: 'bold',
        },
        globalMessageSuccess: {
            backgroundColor: '#d4edda',
            color: '#155724',
            border: '1px solid #c3e6cb',
        },
        globalMessageError: {
            backgroundColor: '#f8d7da',
            color: '#721c24',
            border: '1px solid #f5c6cb',
        },
        // Button Styles
        button: { padding: '10px 20px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.2s ease, opacity 0.2s ease' },
        buttonPrimary: { backgroundColor: '#6a11cb', color: 'white', marginRight: '10px' },
        buttonPrimaryHover: { backgroundColor: '#5a0fb3' },
        buttonSuccess: { backgroundColor: '#28a745', color: 'white' },
        buttonSuccessHover: { backgroundColor: '#218838' },
        buttonDanger: { backgroundColor: '#dc3545', color: 'white' },
        buttonDangerHover: { backgroundColor: '#c82333' },
        buttonDisabled: { backgroundColor: '#555', color: '#aaa', cursor: 'not-allowed', opacity: 0.7 },
        actionsContainer: { display: 'flex', gap: '15px', marginTop: '20px', flexWrap: 'wrap' },
        footer: { textAlign: 'center', marginTop: '40px', fontSize: '0.9em', color: '#aaa' }
    };

    // Hover states (for visual feedback on buttons)
    const [hoverStates, setHoverStates] = useState({});
    const handleMouseEnter = (key) => setHoverStates(prev => ({ ...prev, [key]: true }));
    const handleMouseLeave = (key) => setHoverStates(prev => ({ ...prev, [key]: false }));


    return (
        // Add style to the main div to apply body background etc.
        <div style={styles.body}>
            <div style={styles.container}>
                <header style={styles.header}>
                    <span style={styles.logo}>📊</span> {/* Placeholder Logo */}
                    <h1 style={styles.title}>Sales Data Processor</h1>
                </header>

                <div style={styles.infoBox}>
                    <IconAlert /> Upload sales data files (CSV/XLSX) for each store. Data will be updated in the corresponding Google Sheet tab.
                </div>

                <div style={styles.checkboxContainer}>
                    <input
                        type="checkbox"
                        id="updateSheets"
                        checked={updateSheets}
                        onChange={(e) => setUpdateSheets(e.target.checked)}
                        style={styles.checkbox}
                        disabled={isProcessingAll}
                    />
                    <label htmlFor="updateSheets">Update Google Sheets after processing</label>
                </div>

                {/* Global Message Area */}
                {globalMessage.text && (
                    <div style={{
                        ...styles.globalMessage,
                        ...(globalMessage.type === 'success' ? styles.globalMessageSuccess : styles.globalMessageError)
                     }}>
                        {globalMessage.text}
                    </div>
                )}

                <table style={styles.table}>
                    <thead>
                         <tr>
                            <th style={styles.th}>Store</th>
                            <th style={styles.th}>Sheet Tab</th>
                            <th style={styles.th}>Upload File</th>
                            <th style={styles.th}>Status</th>
                            <th style={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stores.map((store) => {
                             // Determine if the current row/overall process is disabling interaction
                             const isDisabled = isProcessingAll || store.isLoading || addingStore;
                             const isDropZoneDisabled = isProcessingAll || store.isLoading; // Dropzone only disabled by its own processing or global processing

                             return (
                                <tr key={store.id}>
                                    {/* Store Name */}
                                    <td style={styles.td}>{store.storeName}</td>

                                    {/* Sheet Tab Input */}
                                    <td style={styles.td}>
                                        <input
                                            type="text"
                                            value={store.sheetTab}
                                            onChange={(e) => handleTabChange(e, store.id)}
                                            style={styles.input}
                                            placeholder="Enter sheet tab name"
                                            disabled={isDisabled} // Disable if anything is loading
                                        />
                                    </td>

                                    {/* Upload File Cell (Drop Zone) */}
                                    <td style={styles.td}>
                                        <div
                                            style={{
                                                 ...styles.dropZone,
                                                 ...(isDropZoneDisabled ? styles.dropZoneDisabled : {}) // Apply disabled style
                                             }}
                                            // Add event handlers only if not disabled
                                            onDragOver={!isDropZoneDisabled ? handleDragOver : undefined}
                                            onDragLeave={!isDropZoneDisabled ? handleDragLeave : undefined}
                                            onDrop={!isDropZoneDisabled ? (e) => handleDrop(e, store.id) : undefined}
                                            // Trigger hidden input click when drop zone is clicked
                                            onClick={!isDropZoneDisabled ? () => fileInputRefs.current[store.id]?.current?.click() : undefined}
                                        >
                                            <IconUpload /> {/* Visual cue */}
                                             {/* Change text based on whether a file is selected */}
                                             <span>
                                                 {store.file ? `Selected: ${store.file.name}` : 'Drag & drop or click'}
                                             </span>
                                             {/* Hidden file input, linked by ref */}
                                             <input
                                                id={store.fileInputId}
                                                type="file"
                                                ref={fileInputRefs.current[store.id]} // Assign ref
                                                style={styles.fileInput} // Hide it
                                                onChange={(e) => handleFileInputChange(e, store.id)}
                                                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                                disabled={isDropZoneDisabled} // Disable the actual input too
                                            />
                                        </div>
                                    </td>

                                     {/* Status Cell */}
                                     <td style={styles.td}>
                                         <span style={{...styles.statusText, color: store.status.startsWith('Error:') ? '#f8d7da' : (store.status === 'Success!' ? '#d4edda' : '#e0e0e0')}}>
                                             {store.isLoading ? 'Processing...' : store.status}
                                         </span>
                                     </td>

                                     {/* Actions Cell (Remove button) */}
                                    <td style={styles.td}>
                                        <button
                                            onClick={() => handleRemoveStore(store.id)}
                                            style={{
                                                ...styles.button,
                                                 ...(isDisabled ? styles.buttonDisabled : styles.buttonDanger), // Apply disabled style directly
                                                 ...(hoverStates[`remove-${store.id}`] && !isDisabled ? styles.buttonDangerHover : {}) // Apply hover only if not disabled
                                             }}
                                            onMouseEnter={() => handleMouseEnter(`remove-${store.id}`)}
                                            onMouseLeave={() => handleMouseLeave(`remove-${store.id}`)}
                                            disabled={isDisabled} // Functional disable
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                             );
                        })}
                    </tbody>
                </table>

                 {/* Action Buttons Container */}
                <div style={styles.actionsContainer}>
                     {/* Process All Button */}
                     <button
                         onClick={processAllFiles}
                         style={{
                             ...styles.button,
                              ...(isProcessingAll || !stores.some(s => s.file) || !updateSheets ? styles.buttonDisabled : styles.buttonPrimary), // Logic for disabling
                              ...(hoverStates['processAll'] && !(isProcessingAll || !stores.some(s => s.file) || !updateSheets) ? styles.buttonPrimaryHover : {}) // Hover only if not disabled
                          }}
                          onMouseEnter={() => handleMouseEnter('processAll')}
                          onMouseLeave={() => handleMouseLeave('processAll')}
                          disabled={isProcessingAll || !stores.some(s => s.file) || !updateSheets} // Functional disable
                     >
                         <IconGear /> {isProcessingAll ? 'Processing...' : 'Process All Files'}
                     </button>

                     {/* Add Store Button */}
                     <button
                        onClick={handleAddStore}
                        style={{
                            ...styles.button,
                            ...(addingStore || isProcessingAll ? styles.buttonDisabled : styles.buttonSuccess), // Apply disabled style
                             ...(hoverStates['addStore'] && !(addingStore || isProcessingAll) ? styles.buttonSuccessHover : {}) // Hover only if not disabled
                         }}
                         onMouseEnter={() => handleMouseEnter('addStore')}
                         onMouseLeave={() => handleMouseLeave('addStore')}
                         disabled={addingStore || isProcessingAll} // Functional disable
                     >
                         <IconPlus /> {addingStore ? 'Adding...' : 'Add Store'}
                     </button>
                </div>

                {/* Footer */}
                <footer style={styles.footer}>
                    Sales Data Processor © {new Date().getFullYear()}
                </footer>
            </div>

            {/* Global Styles (for body background and scrollbar) */}
            <style jsx global>{`
                body {
                    background-color: #1a1a2e; /* Ensure body matches theme */
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                *, *:before, *:after {
                    box-sizing: inherit;
                }
                /* Basic scrollbar styling for webkit browsers */
                 ::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                 }
                 ::-webkit-scrollbar-track {
                    background: #1a1a2e;
                 }
                 ::-webkit-scrollbar-thumb {
                    background-color: #4a4a6a;
                    border-radius: 4px;
                 }
                 ::-webkit-scrollbar-thumb:hover {
                    background-color: #6a11cb;
                 }
            `}</style>
        </div>
    );
}