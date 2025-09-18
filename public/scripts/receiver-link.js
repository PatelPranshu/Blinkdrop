let pollInterval = null;
let activeKey = null;
let activeReceiver = null;
let fileList = [];

function escapeHTML(str) {
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
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function startReceiving() {
    const receiverNameInput = document.getElementById('receiverName');
    const receiverName = receiverNameInput.value.trim();

    if (!receiverName) {
        alert("Please enter your name.");
        return;
    }
    if (!isValidInput(receiverName)) {
        alert("Invalid name. Please use only letters, numbers, and spaces.");
        return;
    }

    localStorage.setItem('userName', receiverName);
    activeReceiver = receiverName;

    document.getElementById('nameSection').style.display = 'none';
    document.getElementById('fileSection').style.display = 'block';

    fetchAndRenderFileInfo();
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(fetchAndRenderFileInfo, 3000);
}

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
                                : `<span class="text-neutral-500 text-xs px-2">Waiting for approval...</span>`
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
        container.innerHTML = '<p class="text-sm text-center text-red-600 bg-red-50 border border-red-200 rounded-md p-3">Invalid key or an error occurred. This key may have expired or is incorrect.</p>';
        clearInterval(pollInterval);
    }
}

// Main entry point
document.addEventListener("DOMContentLoaded", () => {
    // Setup initial state from URL and localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const keyFromUrl = urlParams.get('key');
    if (keyFromUrl) {
        activeKey = keyFromUrl.toUpperCase();
        document.getElementById('keyDisplay').innerText = activeKey;
    } else {
        document.getElementById('nameSection').innerHTML = '<p style="color:red;">No file key provided.</p>';
    }
    const name = localStorage.getItem('userName');
    if (name) document.getElementById('receiverName').value = name;

    // UPDATED: Attach click events securely
    const getFilesButton = document.getElementById('getFilesBtn');
    if (getFilesButton) {
        getFilesButton.addEventListener('click', startReceiving);
    }

    // Use event delegation for the dynamically created "Download All" button
    const fileInfoContainer = document.getElementById('fileInfo');
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