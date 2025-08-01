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
    const files = e.dataTransfer.files;
    handleMultipleFiles(files);
  });

  fileInput.addEventListener('change', () => {
    const files = fileInput.files;
    handleMultipleFiles(files);
  });
}

async function handleMultipleFiles(fileList) {
  const formData = new FormData();
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
}
