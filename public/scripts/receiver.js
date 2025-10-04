let pollInterval = null;
let activeKey = null;
let activeReceiver = null;
let fileList = [];
let downloadedFileIndexes = new Set(); 

// Helper function to prevent XSS attacks
function escapeHTML(str) {
    if (!str) return '';
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

// Helper function to validate input
function isValidInput(name, type) {
    const nameRegex = /^[A-Za-z0-9 ]+$/;
    const keyRegex = /^[A-Z0-9]{6}$/;
    if (type === 'name') return nameRegex.test(name);
    if (type === 'key') return keyRegex.test(name);
    return false;
}

// Helper function to format file size
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Main function to check the key and fetch file info
async function checkKey(socket) {
    if (pollInterval) clearInterval(pollInterval);

    const keyInput = document.getElementById('keyInput');
    const nameInput = document.getElementById('receiverName');
    const key = keyInput.value.trim().toUpperCase();
    const receiverName = nameInput.value.trim();

    if (!key || !receiverName) {
        showNotification("Enter both your name and the file key.");
        return;
    }
    if (!isValidInput(receiverName, 'name') || !isValidInput(key, 'key')) {
        showNotification("Invalid format for name or key. Please use only letters and numbers.");
        return;
    }
    
    localStorage.setItem('userName', receiverName);

    // Update socket with the user's action now that we have the key
    socket.emit('userUpdate', {
        username: receiverName,
        page: 'Receiver',
        action: `Receiving files with key ${key}`
    });

    activeKey = key;
    activeReceiver = receiverName;
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
        
        if (!res.ok) {
            throw new Error('Invalid key or network error.');
        }

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
            page: 'Receiver',
            action: 'On receiver page'
        });
    });

    // --- Page Initialization ---
    try { 
        document.getElementById('year').textContent = new Date().getFullYear(); 
    } catch(e) {}

    const nameInput = document.getElementById('receiverName');
    const keyInput = document.getElementById('keyInput');
    const getFilesButton = document.getElementById('getFilesBtn');
    const fileInfoContainer = document.getElementById('fileInfo');
    
    // Pre-fill name from localStorage
    const storedName = localStorage.getItem('userName');
    if (storedName) {
        nameInput.value = storedName;
        nameInput.readOnly = true;
    } else {
        nameInput.readOnly = false;
    }

    // Pre-fill key from URL parameter if it exists
    const urlParams = new URLSearchParams(window.location.search);
    const keyFromUrl = urlParams.get('key');
    if (keyFromUrl) {
        keyInput.value = keyFromUrl.toUpperCase();
    }
    
    // Attach button click listeners
    if (getFilesButton) {
        getFilesButton.addEventListener('click', () => {
            // Pass the socket instance to checkKey so it can update the status
            checkKey(socket); 
        });
    }

    // Use event delegation for the dynamic "Download All" and individual links
    if (fileInfoContainer) {
        fileInfoContainer.addEventListener('click', (event) => {
            if (event.target && event.target.classList.contains('download-all-btn')) {
                window.location.href = `/download-all/${activeKey}/${activeReceiver}`;
            }

            if (event.target && event.target.classList.contains('download-link')) {
                const link = event.target;
                // Extract the file index from the download URL
                const fileIndex = parseInt(link.href.split('/')[5]);
                
                // Add the index to our set and change the text
                if (!isNaN(fileIndex)) {
                    downloadedFileIndexes.add(fileIndex);
                    link.textContent = 'Download Again';
                }
            }
        });
    }
});