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
        let html = `<p><strong>Sender:</strong> ${escapeHTML(data.senderName)}</p>`;
        html += `<p><strong>You:</strong> ${escapeHTML(data.receiverName)}</p>`;
        html += `
        <table>
            <thead><tr><th>File</th><th>
                ${data.approved ? `<button id="downloadAllBtn" class="download-all-btn">Download All</button>` : ''}
            </th></tr></thead>
            <tbody>
                ${data.files.map(f => `
                <tr>
                    <td>${escapeHTML(f.name)} <br><small>${formatSize(f.size)}</small></td>
                    <td>
                        ${data.approved
                            ? `<a href="/download/${activeKey}/${f.index}/${activeReceiver}" target="_blank"><button>Download</button></a>`
                            : `<span style="color:gray;">Waiting for approval...</span>`}
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>`;
        const totalSize = data.files.reduce((sum, f) => sum + Number(f.size), 0);
        html += `<p><strong>Total Size:</strong> ${formatSize(totalSize)}</p>`;
        container.innerHTML = html;
    } else {
        container.innerHTML = '<p style="color:red;">Invalid key or server error.</p>';
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