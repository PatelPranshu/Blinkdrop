let pollInterval = null;
let activeKey = null;
let activeReceiver = null;
let fileList = [];
let downloadedFileIndexes = new Set(); // To track clicked download links

// Helper function to prevent XSS attacks
function escapeHTML(str) {
    if (!str) return '';
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

// Helper function to validate input
function isValidInput(name) {
    const nameRegex = /^[A-Za-z0-9 ]+$/;
    return nameRegex.test(name);
}

// Helper function to format file size
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Main function to check the key and fetch file info
async function showFiles(socket) {
    const nameInput = document.getElementById('receiverName');
    const receiverName = nameInput.value.trim();

    if (!receiverName || !isValidInput(receiverName)) {
        alert("Please enter a valid name (letters, numbers, spaces).");
        return;
    }
    
    localStorage.setItem('userName', receiverName);
    activeReceiver = receiverName;

    // Update socket with the user's action now that we have the name and key
    socket.emit('userUpdate', {
        username: receiverName,
        page: 'Receiver Link',
        action: `Viewing files with key ${activeKey}`
    });

    // Hide the name entry form and show the file list section
    document.getElementById('nameSection').style.display = 'none';
    document.getElementById('fileSection').style.display = 'block';
    
    // Start fetching file info
    if (pollInterval) clearInterval(pollInterval);
    await fetchAndRenderFileInfo();
    pollInterval = setInterval(fetchAndRenderFileInfo, 3000);
}

// Fetches and renders the list of files from the server
async function fetchAndRenderFileInfo() {
    if (!activeKey || !activeReceiver) return;
    
    const container = document.getElementById('fileInfo');
    try {
        const res = await fetch(`/file-info/${activeKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receiverName: activeReceiver })
        });
        
        if (!res.ok) throw new Error('Invalid key or network error.');

        const data = await res.json();
        fileList = data.files;
        const totalSize = data.files.reduce((sum, f) => sum + Number(f.size), 0);

        const html = `
            <div class="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden bg-white dark:bg-neutral-800">
                <div class="bg-neutral-50 dark:bg-neutral-700/50 p-3 flex justify-between items-center border-b border-neutral-200 dark:border-neutral-700">
                    <div>
                        <p class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Total: ${data.files.length} files</p>
                        <p class="text-xs text-neutral-500 dark:text-neutral-400">${formatSize(totalSize)}</p>
                    </div>
                    <div>
                        ${data.approved ? `<button id="downloadAllBtn" class="download-all-btn inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 px-3 py-1.5 text-xs font-medium shadow-sm active:scale-[0.99] transition">Download All</button>` : ''}
                    </div>
                </div>
                <div class="divide-y divide-neutral-200 dark:divide-neutral-700">
                    ${data.files.map(f => `
                    <div class="p-3 flex justify-between items-center">
                        <div class="pr-2 overflow-hidden">
                            <p class="font-medium text-neutral-800 dark:text-neutral-200 text-sm truncate">${escapeHTML(f.name)}</p>
                            <p class="text-xs text-neutral-500 dark:text-neutral-400">${formatSize(f.size)}</p>
                        </div>
                        <div class="flex-shrink-0">
                            ${data.approved
                                ? `<a href="/download/${activeKey}/${f.index}/${activeReceiver}" class="download-link inline-flex items-center justify-center gap-2 rounded-lg bg-white text-neutral-800 hover:bg-neutral-100 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-600 dark:hover:bg-neutral-700 px-3 py-1.5 text-xs font-medium active:scale-[0.99] transition">${downloadedFileIndexes.has(f.index) ? 'Download Again' : 'Download'}</a>`
                                : `<span class="text-neutral-500 dark:text-neutral-400 text-xs px-2">Waiting for approval...</span>`
                            }
                        </div>
                    </div>
                    `).join('')}
                </div>
            </div>
            <div class="text-xs text-neutral-500 dark:text-neutral-400 mt-3 flex justify-between">
                <span><strong>Sender:</strong> ${escapeHTML(data.senderName)}</span>
                <span><strong>You:</strong> ${escapeHTML(data.receiverName)}</span>
            </div>
        `;
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = '<p class="text-sm text-center text-red-600 bg-red-50 border border-red-200 dark:text-red-300 dark:bg-red-900/50 dark:border-red-700 rounded-md p-3">Invalid key or an error occurred. Please check the key and try again.</p>';
        clearInterval(pollInterval);
    }
}

// Main entry point when the page loads
document.addEventListener("DOMContentLoaded", () => {
    // --- Connect to Socket.IO and send initial user status ---
    const socket = io();
    socket.on('connect', () => {
        const username = localStorage.getItem('userName') || 'Anonymous';
        socket.emit('userUpdate', {
            username,
            page: 'Receiver Link',
            action: 'On receiver link page'
        });
    });

    // --- Page Initialization ---
    try { 
        document.getElementById('year').textContent = new Date().getFullYear(); 
    } catch(e) {}

    const urlParams = new URLSearchParams(window.location.search);
    const keyFromUrl = urlParams.get('key');
    const keyDisplay = document.getElementById('keyDisplay');
    
    if (keyFromUrl && keyDisplay) {
        activeKey = keyFromUrl.toUpperCase();
        keyDisplay.textContent = activeKey;
    } else {
        document.getElementById('nameSection').innerHTML = '<p class="text-center text-red-600 dark:text-red-400">Error: No file key provided in the link.</p>';
        return;
    }

    const nameInput = document.getElementById('receiverName');
    const storedName = localStorage.getItem('userName');
    if (nameInput && storedName) {
        nameInput.value = storedName;
    }
    
    const getFilesButton = document.getElementById('getFilesBtn');
    if (getFilesButton) {
        getFilesButton.addEventListener('click', () => {
            // Pass the socket instance to showFiles so it can update the status
            showFiles(socket);
        });
    }

    const fileInfoContainer = document.getElementById('fileInfo');
    if (fileInfoContainer) {
        fileInfoContainer.addEventListener('click', (event) => {
            if (event.target && event.target.classList.contains('download-all-btn')) {
                window.location.href = `/download-all/${activeKey}/${activeReceiver}`;
            }

            if (event.target && event.target.classList.contains('download-link')) {
                const link = event.target;
                const fileIndex = parseInt(link.href.split('/')[5]);
                
                if (!isNaN(fileIndex)) {
                    downloadedFileIndexes.add(fileIndex);
                    link.textContent = 'Download Again';
                }
            }
        });
    }
});