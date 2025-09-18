let pollInterval = null;
let activeKey = null;
let activeReceiver = null;
let fileList = [];

// Helper function to prevent XSS attacks
function escapeHTML(str) {
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
async function checkKey() {
    // BUG FIX: Clear any previous polling loop before starting a new one.
    if (pollInterval) clearInterval(pollInterval);

    const keyInput = document.getElementById('keyInput');
    const nameInput = document.getElementById('receiverName');
    const key = keyInput.value.trim().toUpperCase();
    const receiverName = nameInput.value.trim();

    if (!key || !receiverName) {
        alert("Enter both your name and the file key.");
        return;
    }
    if (!isValidInput(receiverName, 'name') || !isValidInput(key, 'key')) {
        alert("Invalid format for name or key. Please use only letters and numbers.");
        return;
    }
    
    // Save name to local storage so it can be remembered
    localStorage.setItem('userName', receiverName);

    activeKey = key;
    activeReceiver = receiverName;
    await fetchAndRenderFileInfo();
    pollInterval = setInterval(fetchAndRenderFileInfo, 3000);
}

// Fetches and renders the list of files from the server
async function fetchAndRenderFileInfo() {
    if (!activeKey || !activeReceiver) return;
    const res = await fetch(`/file-info/${activeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverName: activeReceiver })
    });
    const container = document.getElementById('fileInfo');
    if (res.ok) {
        const data = await res.json();
        fileList = data.files;
        const totalSize = data.files.reduce((sum, f) => sum + Number(f.size), 0);

        // UPDATED: Replaced table with a responsive card-based list
        let html = `
            <div class="border border-neutral-200 rounded-lg overflow-hidden">
                <div class="bg-neutral-50 p-3 flex justify-between items-center border-b border-neutral-200">
                    <div>
                        <p class="text-sm font-medium text-neutral-700">Total: ${data.files.length} files</p>
                        <p class="text-xs text-neutral-500">${formatSize(totalSize)}</p>
                    </div>
                    <div>
                        ${data.approved ? `<button id="downloadAllBtn" class="download-all-btn inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 text-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-neutral-800 active:scale-[0.99] transition">Download All</button>` : ''}
                    </div>
                </div>

                <div class="divide-y divide-neutral-200">
                    ${data.files.map(f => `
                    <div class="p-3 flex justify-between items-center">
                        <div class="pr-2 overflow-hidden">
                            <p class="font-medium text-neutral-800 text-sm truncate">${escapeHTML(f.name)}</p>
                            <p class="text-xs text-neutral-500">${formatSize(f.size)}</p>
                        </div>
                        <div class="flex-shrink-0">
                             ${data.approved
                                ? `<a href="/download/${activeKey}/${f.index}/${activeReceiver}" target="_blank" class="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-neutral-900 px-3 py-1.5 text-xs font-medium border border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50 active:scale-[0.99] transition">
                                     Download
                                   </a>`
                                : `<span class="text-neutral-500 text-xs px-2">Waiting...</span>`
                            }
                        </div>
                    </div>
                    `).join('')}
                </div>
            </div>
            <div class="text-xs text-neutral-500 mt-3 flex justify-between">
                <span><strong>Sender:</strong> ${escapeHTML(data.senderName)}</span>
                <span><strong>You:</strong> ${escapeHTML(data.receiverName)}</span>
            </div>
        `;
        container.innerHTML = html;
    } else {
        container.innerHTML = '<p class="text-sm text-center text-red-600 bg-red-50 border border-red-200 rounded-md p-3">Invalid key or an error occurred. Please check the key and try again.</p>';
        clearInterval(pollInterval);
    }
}

// Main entry point when the page loads
document.addEventListener("DOMContentLoaded", () => {
    const nameInput = document.getElementById('receiverName');
    const keyInput = document.getElementById('keyInput');
    const getFilesButton = document.getElementById('getFilesBtn');
    const fileInfoContainer = document.getElementById('fileInfo');
    const storedName = localStorage.getItem('userName');

    // **THIS IS THE NEW LOGIC YOU REQUESTED**
    if (storedName) {
        // If a name was entered on the index page, pre-fill it and make it read-only.
        nameInput.value = storedName;
        nameInput.readOnly = true;
    } else {
        // If the user came directly to this page, make sure the input is editable.
        nameInput.readOnly = false;
    }

    // Pre-fill key from URL if it exists
    const urlParams = new URLSearchParams(window.location.search);
    const keyFromUrl = urlParams.get('key');
    if (keyFromUrl) {
        keyInput.value = keyFromUrl.toUpperCase();
    }
    
    // SECURE EVENT HANDLING: Attach click events using JavaScript
    if (getFilesButton) {
        getFilesButton.addEventListener('click', checkKey);
    }

    // Use event delegation for the "Download All" button since it's created dynamically
    if (fileInfoContainer) {
        fileInfoContainer.addEventListener('click', (event) => {
            if (event.target && event.target.classList.contains('download-all-btn')) {
                fileList.forEach(file => {
                    const link = document.createElement('a');
                    link.href = `/download/${activeKey}/${file.index}/${activeReceiver}`;
                    link.download = file.name;
                    link.target = '_blank';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                });
            }
        });
    }
});

// Sets the current year in the footer
document.addEventListener('DOMContentLoaded', () => {
  try { 
    document.getElementById('year').textContent = new Date().getFullYear(); 
  } catch(e) {}
});