const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('fileInput');

if (dropZone && fileInput) {
  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleMultipleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    handleMultipleFiles(fileInput.files);
  });
}

async function handleMultipleFiles(fileList) {
  const senderName = document.getElementById('senderName').value.trim();
  if (!senderName) {
    alert("Please enter your name");
    return;
  }

  const formData = new FormData();
  formData.append('senderName', senderName);
  for (const file of fileList) {
    formData.append('files', file);
  }

  const res = await fetch('/upload', {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  document.getElementById('keyInfo').innerHTML = `Share this key: <b>${data.key}</b>`;

  const tableHtml = `
    <table>
      <thead>
        <tr><th>File Name</th><th>Download Key</th></tr>
      </thead>
      <tbody>
        ${data.files.map(f => `<tr><td>${f.originalName}</td><td>${data.key}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
  document.getElementById('fileTableContainer').innerHTML = tableHtml;

  // Save key for approval polling
  window.latestKey = data.key;
}

// Clear button
const clearBtn = document.getElementById('clearBtn');
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    document.getElementById('keyInfo').innerHTML = '';
    document.getElementById('fileTableContainer').innerHTML = '';
    fileInput.value = null;
  });
}

// Poll for receiver request
setInterval(async () => {
  const key = window.latestKey;
  if (!key) return;

  const res = await fetch(`/file-info/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiverName: 'POLL' })
  });

  if (!res.ok) return;

  const data = await res.json();
  const receiver = data.receiverName;
  const isApproved = data.approved;

  const container = document.getElementById('pendingRequests');
  if (receiver !== 'POLL' && !isApproved) {
    container.innerHTML = `
      <p><b>${receiver}</b> is requesting to download files.</p>
      <button onclick="approve('${key}', '${receiver}')">Approve</button>
    `;
  }
}, 3000);

async function approve(key, receiverName) {
  await fetch('/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, receiverName })
  });
  alert(`Approved ${receiverName}`);
  document.getElementById('pendingRequests').innerHTML = '';
}
