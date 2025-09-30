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
let simulationInterval = null;

let uploadLimits = {
    maxFileCount: 100,
    maxFileSizeMB: 1024
};

// ===================================================================
// Helper & Rendering Functions
// ===================================================================

function escapeHTML(str) {
    if (!str) return '';
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

function isValidInput(name) {
    const nameRegex = /^[A-Za-z0-9 ]+$/;
    return nameRegex.test(name);
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderFileTable(files) {
    const totalSize = files.reduce((sum, f) => sum + Number(f.size), 0);
    return `
    <div class="mt-4 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
        <table class="w-full text-sm text-left">
            <thead class="bg-neutral-50 border-b border-neutral-200 dark:bg-neutral-700/50 dark:border-neutral-700">
                <tr>
                    <th scope="col" colspan="2" class="px-4 py-2 font-medium text-neutral-700 dark:text-neutral-300">
                        Total: ${files.length} files, ${formatSize(totalSize)}
                    </th>
                </tr>
            </thead>
            <tbody class="divide-y divide-neutral-200 dark:divide-neutral-700">
                ${files.map(f => `
                <tr class="bg-white dark:bg-neutral-800">
                    <td class="px-4 py-2.5 font-medium text-neutral-800 dark:text-neutral-200">${escapeHTML(f.originalName)}</td>
                    <td class="px-4 py-2.5 text-neutral-600 dark:text-neutral-400 text-right">${formatSize(f.size)}</td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

function renderPendingRequestsTable(allReceivers, approvedList) {
    if (allReceivers.length === 0) {
        return `<p class="text-sm text-center py-4 text-neutral-500 dark:text-neutral-400">No download requests yet.</p>`;
    }

    const tableRows = allReceivers.map(r => {
        const isApproved = approvedList.includes(r);
        return `
        <tr class="bg-white dark:bg-neutral-800">
            <td class="px-4 py-2.5 font-medium text-neutral-800 dark:text-neutral-200">${escapeHTML(r)}</td>
            <td class="px-4 py-2.5 text-right">
                ${isApproved
                    ? '<span class="inline-flex items-center justify-center rounded-md bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300 px-3 py-1 text-xs font-medium">Approved</span>'
                    : `<button class="approve-btn inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 px-3 py-1.5 text-xs font-medium shadow-sm active:scale-[0.99] transition" data-receiver="${escapeHTML(r)}">Approve</button>`
                }
            </td>
        </tr>`;
    }).join('');

    return `
        <div class="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
            <table class="w-full text-sm text-left">
                <thead class="bg-neutral-50 border-b border-neutral-200 dark:bg-neutral-700/50 dark:border-neutral-700">
                    <tr>
                        <th scope="col" class="px-4 py-2 font-medium text-neutral-700 dark:text-neutral-300">Receiver Name</th>
                        <th scope="col" class="px-4 py-2 font-medium text-neutral-700 dark:text-neutral-300 text-right">Action</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-neutral-200 dark:divide-neutral-700">${tableRows}</tbody>
            </table>
        </div>`;
}


// ===================================================================
// Core Application Logic
// ===================================================================
async function handleFileUpload(fileList) {
    if (fileList.length === 0) return;

    if (fileList.length > uploadLimits.maxFileCount) {
        alert(`Error: You can only upload a maximum of ${uploadLimits.maxFileCount} files at a time. You selected ${fileList.length}.`);
        return;
    }

    const maxSizeBytes = uploadLimits.maxFileSizeMB * 1024 * 1024;
    for (const file of fileList) {
        if (file.size > maxSizeBytes) {
            alert(`Error: The file "${file.name}" is too large.\n\nMaximum size: ${uploadLimits.maxFileSizeMB} MB.\nThis file is: ${formatSize(file.size)}.`);
            return;
        }
    }

    const senderName = senderInput.value.trim();
    if (!senderName || !isValidInput(senderName)) {
        alert("Please enter a valid name (letters, numbers, spaces).");
        return;
    }
    localStorage.setItem('userName', senderName);
    
    // **NEW**: Disable the name input field
    senderInput.readOnly = true;

    // UI updates
    dropZone.style.display = "none";
    document.getElementById('approveAllWrapper').style.display = 'none';
    shareInfoDiv.style.display = 'none';
    fileTableContainer.innerHTML = '';
    uploadingDiv.innerHTML = '';
    uploadingDiv.style.display = "block";

    // Create progress bars
    for (const file of fileList) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = `
            <div class="text-sm">
                <div class="flex justify-between items-center">
                    <span class="font-medium text-neutral-800 dark:text-neutral-200 truncate pr-4">${escapeHTML(file.name)}</span>
                    <span class="text-neutral-500 dark:text-neutral-400 text-xs">${formatSize(file.size)}</span>
                </div>
                <div class="mt-1">
                    <progress class="progress-bar w-full h-2 rounded-lg [&::-webkit-progress-bar]:rounded-lg [&::-webkit-progress-value]:rounded-lg [&::-moz-progress-bar]:rounded-lg [&::-webkit-progress-bar]:bg-neutral-200 dark:[&::-webkit-progress-bar]:bg-neutral-700 [&::-webkit-progress-value]:bg-neutral-900 dark:[&::-webkit-progress-value]:bg-neutral-300 [&::-moz-progress-bar]:bg-neutral-900 dark:[&::-moz-progress-bar]:bg-neutral-300" value="0" max="100"></progress>
                    <small class="upload-status text-neutral-600 dark:text-neutral-400 block mt-0.5">Uploading to server...</small>
                </div>
            </div>
        `;
        uploadingDiv.appendChild(wrapper);
    }

    // Prepare and send the upload request
    const formData = new FormData();
    formData.append('senderName', senderName);
    formData.append('approveAll', approveAllCheckbox.checked);
    for (const file of fileList) {
        formData.append('files', file);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/upload");

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            document.querySelectorAll(".progress-bar").forEach(p => p.value = percent);
            if (percent >= 100) {
                document.querySelectorAll(".progress-bar").forEach(p => p.value = 0);
                simulateServerProgress();
            }
        }
    };

    xhr.onload = function () {
        clearInterval(simulationInterval);
        document.querySelectorAll(".progress-bar").forEach(p => p.value = 100);

        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            latestKey = data.key;
            sessionStorage.setItem('activeTransferKey', data.key);
            
            const receiverUrl = `${window.location.origin}/receiver-link?key=${data.key}`;
            copyLinkBtn.dataset.link = receiverUrl;
            
            document.getElementById('keyInfo').innerHTML = `Share this key: <b>${data.key}</b>`;
            document.getElementById('qrcode').innerHTML = "";
            new QRCode(document.getElementById("qrcode"), { text: receiverUrl, width: 128, height: 128 });
            
            fileTableContainer.innerHTML = renderFileTable(data.files);
            
            uploadingDiv.style.display = "none";
            shareInfoDiv.style.display = 'flex';
            
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
            senderInput.readOnly = false; // Re-enable on failure
        }
    };

    xhr.onerror = function () {
        clearInterval(simulationInterval);
        alert("❌ A network error occurred.");
        uploadingDiv.style.display = "none";
        senderInput.readOnly = false; // Re-enable on failure
    };
    xhr.send(formData);
}

function simulateServerProgress() {
    let progress = 0;
    const allProgressBar = document.querySelectorAll(".progress-bar");
    const allStatusSpans = document.querySelectorAll(".upload-status");

    simulationInterval = setInterval(() => {
        progress += 5;
        if (progress >= 99) {
            progress = 99;
            clearInterval(simulationInterval);
        }
        allStatusSpans.forEach(span => span.textContent = `Processing on server: ${Math.round(progress)}%`);
        allProgressBar.forEach(bar => bar.value = progress);
    }, 500);
}

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

        pendingRequestsDiv.innerHTML = renderPendingRequestsTable(allReceivers, approvedList);
        
    } catch (error) {
        console.error("Error fetching pending receivers:", error);
    }
}

async function approve(key, receiverName) {
    try {
        await fetch('/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, receiverName })
        });
        fetchPendingReceivers(); // Refresh the list
    } catch (error) {
        console.error("Error approving receiver:", error);
    }
}

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

        // **NEW**: Disable the name input on session restore
        senderInput.readOnly = true;

        dropZone.style.display = "none";
        document.getElementById('approveAllWrapper').style.display = 'none';

        const receiverUrl = `${window.location.origin}/receiver-link?key=${session.key}`;
        copyLinkBtn.dataset.link = receiverUrl;
        
        document.getElementById('keyInfo').innerHTML = `Share this key: <b>${session.key}</b>`;

        document.getElementById('qrcode').innerHTML = "";
        new QRCode(document.getElementById("qrcode"), { text: receiverUrl, width: 128, height: 128 });
        
        fileTableContainer.innerHTML = renderFileTable(session.fileDetails);
        
        shareInfoDiv.style.display = 'flex';

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
// Event Listener Setup
// ===================================================================
async function fetchUploadLimits() {
    try {
        const response = await fetch('/config');
        if (!response.ok) {
            console.error('Could not fetch server config for upload limits.');
            return;
        }
        const limits = await response.json();
        uploadLimits = limits;
    } catch (error) {
        console.error('Error fetching upload limits:', error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // --- Connect to Socket.IO and send user status ---
    const socket = io();
    socket.on('connect', () => {
        const username = localStorage.getItem('userName') || 'Anonymous';
        socket.emit('userUpdate', {
            username,
            page: window.location.pathname,
            action: 'Preparing to send files'
        });
    });

    // --- Page Initialization ---
    fetchUploadLimits();

    const name = localStorage.getItem('userName');
    if (name) {
        senderInput.value = name;
    }

    const activeKey = sessionStorage.getItem('activeTransferKey');
    if (activeKey) {
        restoreSession(activeKey);
    }

    // --- Set up event listeners ---
    try { 
        document.getElementById('year').textContent = new Date().getFullYear(); 
    } catch(e) {}

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFileUpload(e.dataTransfer.files); });
    fileInput.addEventListener('change', () => handleFileUpload(fileInput.files));

    clearBtn.addEventListener('click', () => {
        sessionStorage.removeItem('activeTransferKey');
        window.location.reload(); // This will reset the page and make the input editable again
    });

    copyLinkBtn.addEventListener('click', async () => {
        const link = copyLinkBtn.dataset.link;
        if (!link) return;

        if (window.Android && typeof window.Android.copyToClipboard === 'function') {
            window.Android.copyToClipboard(link);
        } else {
            try {
                await navigator.clipboard.writeText(link);
                copyLinkBtn.textContent = 'Copied!';
                setTimeout(() => (copyLinkBtn.textContent = 'Copy Link'), 2000);
            } catch (err) {
                alert('❌ Failed to copy link.');
            }
        }
    });

    pendingRequestsDiv.addEventListener('click', (event) => {
        if (event.target && event.target.classList.contains('approve-btn')) {
            const receiverName = event.target.dataset.receiver;
            if (latestKey && receiverName) {
                approve(latestKey, receiverName);
            }
        }
    });
});