// ===================================================================
// DOM Element Constants & State Variables
// ===================================================================
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('fileInput');
const senderInput = document.getElementById('senderName');
const uploadingDiv = document.getElementById('uploading');
const approveAllCheckbox = document.getElementById('approveAll');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const clearBtn = document.getElementById('clearBtn');
const fileTableContainer = document.getElementById('fileTableContainer');
const shareInfoDiv = document.getElementById('share-info');
const approveSection = document.getElementById('approveSection');
const pendingRequestsDiv = document.getElementById('pendingRequests');

let latestKey = null;
let pollInterval = null;
let simulationInterval = null; // Variable to hold our simulation timer

// NEW: A variable to store the upload limits fetched from the server.
let uploadLimits = {
    maxFileCount: 100, // Default value
    maxFileSizeMB: 1024 // Default value
};
// ===================================================================
// Helper Functions
// ===================================================================

/**
 * Sanitizes a string to prevent XSS attacks by converting HTML special characters to text.
 * @param {string} str The string to escape.
 * @returns {string} The sanitized string.
 */
function escapeHTML(str) {
    if (!str) return '';
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

/**
 * Validates that a name contains only letters, numbers, and spaces.
 * @param {string} name The name to validate.
 * @returns {boolean} True if the name is valid.
 */
function isValidInput(name) {
    const nameRegex = /^[A-Za-z0-9 ]+$/;
    return nameRegex.test(name);
}

/**
 * Formats a file size in bytes into a human-readable string (B, KB, MB).
 * @param {number} bytes The file size in bytes.
 * @returns {string} The formatted size string.
 */
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ===================================================================
// Core Application Logic
// ===================================================================

/**
 * Handles the file upload process with a two-stage progress bar (real then simulated).
 * @param {FileList} fileList The list of files to upload.
 */
async function handleMultipleFiles(fileList) {
    // 1. Check file count
    if (fileList.length > uploadLimits.maxFileCount) {
        alert(`Error: You can only upload a maximum of ${uploadLimits.maxFileCount} files at a time. You selected ${fileList.length}.`);
        return; // Stop the upload
    }

    // 2. Check individual file sizes
    const maxSizeBytes = uploadLimits.maxFileSizeMB * 1024 * 1024;
    for (const file of fileList) {
        if (file.size > maxSizeBytes) {
            alert(`Error: The file "${file.name}" is too large.\n\nMaximum size: ${uploadLimits.maxFileSizeMB} MB.\nThis file is: ${formatSize(file.size)}.`);
            return; // Stop the upload
        }
    }

    const senderName = senderInput.value.trim();
    if (!senderName || !isValidInput(senderName)) {
        alert("Please enter a valid name (letters, numbers, spaces).");
        return;
    }

    // Reset UI
    dropZone.style.display = "none";
    document.getElementById('approveAllWrapper').style.display = 'none';
    shareInfoDiv.style.display = 'none';
    fileTableContainer.innerHTML = '';
    uploadingDiv.innerHTML = '';
    uploadingDiv.style.display = "block";

    // Create a progress bar for each file
    for (const file of fileList) {
       // UPDATED: Progress bar HTML with Tailwind classes
        const wrapper = document.createElement("div");
        wrapper.innerHTML = `
            <div class="text-sm">
                <div class="flex justify-between items-center">
                    <span class="font-medium text-neutral-800 truncate pr-4">${escapeHTML(file.name)}</span>
                    <span class="text-neutral-500 text-xs">${formatSize(file.size)}</span>
                </div>
                <div class="mt-1">
                    <progress class="progress-bar w-full [&::-webkit-progress-bar]:rounded-lg [&::-webkit-progress-value]:rounded-lg [&::-webkit-progress-bar]:bg-neutral-200 [&::-webkit-progress-value]:bg-neutral-900 [&::-moz-progress-bar]:bg-neutral-900" value="0" max="100"></progress>
                    <small class="upload-status text-neutral-600 block mt-0.5">Uploading to server...</small>
                </div>
            </div>
        `;
        uploadingDiv.appendChild(wrapper);
    }

    const formData = new FormData();
    formData.append('senderName', senderName);
    formData.append('approveAll', approveAllCheckbox.checked);
    for (const file of fileList) {
        formData.append('files', file);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/upload");

    // --- STAGE 1: REAL PROGRESS (Client to Server) ---
    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            document.querySelectorAll(".progress-bar").forEach(p => p.value = percent);

            if (percent >= 100) {
                // --- STAGE 2: START SIMULATION (Server to Google Drive) ---
                document.querySelectorAll(".progress-bar").forEach(p => p.value = 0); // Reset for simulation
                simulateServerProgress();
            }
        }
    };

    xhr.onload = function () {
        clearInterval(simulationInterval); // Stop the simulation
        document.querySelectorAll(".progress-bar").forEach(p => p.value = 100); // Final jump to 100%

        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            latestKey = data.key;
            sessionStorage.setItem('activeTransferKey', data.key);
            
            const receiverUrl = `${window.location.origin}/receiver-link?key=${data.key}`;
            copyLinkBtn.dataset.link = receiverUrl;
            
            document.getElementById('keyInfo').innerHTML = `Share this key: <b>${data.key}</b>`;
            document.getElementById('qrcode').innerHTML = "";
            new QRCode(document.getElementById("qrcode"), { text: receiverUrl, width: 128, height: 128 });
            shareInfoDiv.style.display = 'flex';
            
            const totalSize = data.files.reduce((sum, f) => sum + Number(f.size), 0);
            const tableHtml = `
            <div class="mt-4 border border-neutral-200 rounded-lg overflow-hidden">
                <table class="w-full text-sm text-left">
                    <thead class="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                            <th scope="col" colspan="2" class="px-4 py-2 font-medium text-neutral-700">
                                Total: ${data.files.length} files, ${formatSize(totalSize)}
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-neutral-200">
                        ${data.files.map(f => `
                        <tr class="bg-white">
                            <td class="px-4 py-2.5 font-medium text-neutral-800">${escapeHTML(f.originalName)}</td>
                            <td class="px-4 py-2.5 text-neutral-600 text-right">${formatSize(f.size)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
            fileTableContainer.innerHTML = tableHtml;
            uploadingDiv.style.display = "none";
            
            if (approveAllCheckbox.checked) {
                approveSection.style.display = 'none';
            } else {
                approveSection.style.display = 'block';
                fetchPendingReceivers();
                if (pollInterval) clearInterval(pollInterval);
                pollInterval = setInterval(fetchPendingReceivers, 3000);
            }
        } else {
            alert("❌ Upload failed.");
            uploadingDiv.style.display = "none";
        }
    };

    xhr.onerror = function () {
        clearInterval(simulationInterval); // Stop simulation on error
        alert("❌ A network error occurred.");
        uploadingDiv.style.display = "none";
    };
    xhr.send(formData);
}

/**
 * Simulates the server-side upload progress for a better user experience.
 */
function simulateServerProgress() {
    let progress = 0;
    const allProgressBar = document.querySelectorAll(".progress-bar");
    const allStatusSpans = document.querySelectorAll(".upload-status");

    allStatusSpans.forEach(statusEl => {
        statusEl.style.color = '#5cb85c'; // Green color for processing
    });

    simulationInterval = setInterval(() => {
        progress += 5; // Increment progress
        if (progress >= 99) {
            progress = 99; // Stop at 99% to wait for the final server response
            clearInterval(simulationInterval);
        }

        // Update text and progress bar value
        allStatusSpans.forEach(span => span.textContent = `Processing: ${Math.round(progress)}%`);
        allProgressBar.forEach(bar => bar.value = progress);

    }, 500); // Update every 0.5 seconds
}

/**
 * Fetches and displays the list of receivers waiting for approval.
 */
async function fetchPendingReceivers() {
    if (!latestKey) return;
    try {
        const res = await fetch('/admin/sessions');
        const sessions = await res.json();
        const session = sessions.find(s => s.key === latestKey);
        if (!session) return;

        const pendingList = session.receiversWaiting || [];
        const approvedList = session.approvedReceivers || [];
        const allReceivers = [...new Set([...pendingList, ...approvedList])];

        const tableRows = allReceivers.map((r, i) => {
            const isApproved = approvedList.includes(r);
            // UPDATED: Button classes and styles
            return `
            <tr class="bg-white">
                <td class="px-4 py-2.5 font-medium text-neutral-800">${escapeHTML(r)}</td>
                <td class="px-4 py-2.5 text-right">
                    ${isApproved
                        ? '<span class="inline-flex items-center justify-center rounded-md bg-green-100 text-green-800 px-3 py-1 text-xs font-medium">Approved</span>'
                        : `<button class="approve-btn inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 text-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-neutral-800 active:scale-[0.99] transition" data-receiver="${escapeHTML(r)}">Approve</button>`
                    }
                </td>
            </tr>`;
        }).join('');

        // UPDATED: Pending requests table with Tailwind classes
        pendingRequestsDiv.innerHTML = `
            <div class="border border-neutral-200 rounded-lg overflow-hidden">
                <table class="w-full text-sm text-left">
                    <thead class="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                            <th scope="col" class="px-4 py-2 font-medium text-neutral-700">Receiver Name</th>
                            <th scope="col" class="px-4 py-2 font-medium text-neutral-700 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-neutral-200">${tableRows}</tbody>
                </table>
            </div>`;
    } catch (error) {
        console.error("Error fetching pending receivers:", error);
    }
}

/**
 * Sends a request to the server to approve a specific receiver.
 * @param {string} key The session key.
 * @param {string} receiverName The name of the receiver to approve.
 */
async function approve(key, receiverName) {
    try {
        await fetch('/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, receiverName })
        });
        fetchPendingReceivers(); // Refresh the list after approval
    } catch (error) {
        console.error("Error approving receiver:", error);
    }
}

/**
 * Restores the sender's UI to a previously active session.
 * @param {string} key The session key to restore.
 */
async function restoreSession(key) {
    latestKey = key;
    try {
        const res = await fetch('/admin/sessions');
        if (!res.ok) throw new Error('Failed to fetch sessions');
        
        const sessions = await res.json();
        const session = sessions.find(s => s.key === key);
        if (!session) { 
            sessionStorage.removeItem('activeTransferKey'); 
            return; 
        }

        // --- Start of UI updates ---
        dropZone.style.display = "none";
        document.getElementById('approveAllWrapper').style.display = 'none';

        const receiverUrl = `${window.location.origin}/receiver-link?key=${session.key}`;
        copyLinkBtn.dataset.link = receiverUrl;
        
        // Use consistent styling for the key info
        document.getElementById('keyInfo').innerHTML = `Your key is: <strong class="font-semibold text-neutral-900">${session.key}</strong>`;

        document.getElementById('qrcode').innerHTML = "";
        new QRCode(document.getElementById("qrcode"), { text: receiverUrl, width: 96, height: 96 });
        shareInfoDiv.style.display = 'flex';

        const totalSize = session.fileDetails.reduce((sum, f) => sum + Number(f.size), 0);

        // --- THIS IS THE CORRECTED PART ---
        // Replaced the old unstyled table with the new styled version
        const tableHtml = `
        <div class="mt-4 border border-neutral-200 rounded-lg overflow-hidden">
            <table class="w-full text-sm text-left">
                <thead class="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                        <th scope="col" colspan="2" class="px-4 py-2 font-medium text-neutral-700">
                            Total: ${session.fileDetails.length} files, ${formatSize(totalSize)}
                        </th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-neutral-200">
                    ${session.fileDetails.map(f => `
                    <tr class="bg-white">
                        <td class="px-4 py-2.5 font-medium text-neutral-800">${escapeHTML(f.originalName)}</td>
                        <td class="px-4 py-2.5 text-neutral-600 text-right">${formatSize(f.size)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
        fileTableContainer.innerHTML = tableHtml;
        // --- END OF CORRECTION ---

        if (!session.isPublic) {
            approveSection.style.display = 'block';
            fetchPendingReceivers();
            if (pollInterval) clearInterval(pollInterval);
            pollInterval = setInterval(fetchPendingReceivers, 3000);
        } else {
            approveSection.style.display = 'none';
        }
    } catch (error) {
        console.error("Failed to restore session:", error);
        sessionStorage.removeItem('activeTransferKey');
    }
}

// ===================================================================
// Event Listener Setup (Main Entry Point)
// ===================================================================
/**
 * NEW: Fetches the upload limits from the server when the page loads.
 */
async function fetchUploadLimits() {
    try {
        const response = await fetch('/config');
        if (!response.ok) {
            console.error('Could not fetch server config for upload limits.');
            return;
        }
        const limits = await response.json();
        uploadLimits = limits;
        console.log('Upload limits configured:', uploadLimits);
    } catch (error) {
        console.error('Error fetching upload limits:', error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    fetchUploadLimits();
    // Restore name from previous session
    const name = localStorage.getItem('userName');
    if (name) senderInput.value = name;

    // Restore active transfer if tab was reloaded
    const activeKey = sessionStorage.getItem('activeTransferKey');
    if (activeKey) {
        restoreSession(activeKey);
    }

    // Drag and Drop listeners
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleMultipleFiles(e.dataTransfer.files); });
    fileInput.addEventListener('change', () => handleMultipleFiles(fileInput.files));

    // Button click listeners
    clearBtn.addEventListener('click', () => {
        sessionStorage.removeItem('activeTransferKey');
        window.location.reload(); // Easiest way to reset the page
    });

    // In public/scripts/sender.js

copyLinkBtn.addEventListener('click', async () => {
    console.log("Copy button clicked."); // BREADCRUMB #1
    const link = copyLinkBtn.dataset.link;

    if (!link) {
        console.log("Error: No link found in dataset.");
        return;
    }

    if (window.Android && typeof window.Android.copyToClipboard === 'function') {
        console.log("Android bridge FOUND. Calling native copyToClipboard..."); // BREADCRUMB #2
        window.Android.copyToClipboard(link);
    } else {
        console.log("Android bridge NOT FOUND. Falling back to web API."); // BREADCRUMB #3
        try {
            await navigator.clipboard.writeText(link);
            copyLinkBtn.textContent = 'Copied!';
            setTimeout(() => (copyLinkBtn.textContent = 'Copy Link'), 2000);
        } catch (err) {
            console.log("Web API navigator.clipboard failed.", err); // BREADCRUMB #4
            alert('❌ Failed to copy link.');
        }
    }
});

    // Event Delegation for "Approve" buttons
    pendingRequestsDiv.addEventListener('click', (event) => {
        if (event.target && event.target.classList.contains('approve-btn')) {
            const receiverName = event.target.dataset.receiver;
            if (latestKey && receiverName) {
                approve(latestKey, receiverName);
            }
        }
    });
});


// Sets the current year in the footer
document.addEventListener('DOMContentLoaded', () => {
  try { 
    document.getElementById('year').textContent = new Date().getFullYear(); 
  } catch(e) {}
});