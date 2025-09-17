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