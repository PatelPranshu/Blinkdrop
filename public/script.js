// const dropZone = document.getElementById('drop-zone');
// const fileInput = document.getElementById('fileInput');

// if (dropZone && fileInput) {
//   dropZone.addEventListener('click', () => fileInput.click());

//   dropZone.addEventListener('dragover', (e) => {
//     e.preventDefault();
//     dropZone.classList.add('dragover');
//   });

//   dropZone.addEventListener('dragleave', () => {
//     dropZone.classList.remove('dragover');
//   });

//   dropZone.addEventListener('drop', (e) => {
//     e.preventDefault();
//     dropZone.classList.remove('dragover');
//     handleMultipleFiles(e.dataTransfer.files);
//   });

//   fileInput.addEventListener('change', () => {
//     handleMultipleFiles(fileInput.files);
//   });
// }

// async function handleMultipleFiles(fileList) {
//   const senderName = document.getElementById('senderName').value.trim();
//   if (!senderName) {
//     alert("Please enter your name");
//     return;
//   }

//   // Clear previous UI
//   document.getElementById('keyInfo').innerHTML = '';
//   document.getElementById('fileTableContainer').innerHTML = '';

//   // Show uploading section
//   const uploadContainer = document.getElementById('uploading');
//   uploadContainer.innerHTML = '';
//   uploadContainer.style.display = 'block';

//   const formData = new FormData();
//   formData.append('senderName', senderName);

//   for (const file of fileList) {
//     formData.append('files', file);

//     // progress bar for each file
//     const wrapper = document.createElement("div");
//     wrapper.style.margin = "8px 0";
//     wrapper.innerHTML = `
//       <div><b>${file.name}</b> (${(file.size / 1024).toFixed(1)} KB)</div>
//       <progress id="prog-${file.name}" value="0" max="100" style="width:100%"></progress>
//     `;
//     uploadContainer.appendChild(wrapper);
//   }

//   // Use XMLHttpRequest instead of fetch (so we can track progress)
//   const xhr = new XMLHttpRequest();
//   xhr.open("POST", "/upload");

//   xhr.upload.onprogress = function (e) {
//     if (e.lengthComputable) {
//       const percent = (e.loaded / e.total) * 100;
//       document.querySelectorAll("progress").forEach(p => {
//         p.value = percent;
//       });
//     }
//   };

//   xhr.onload = function () {
//     if (xhr.status === 200) {
//       const data = JSON.parse(xhr.responseText);

//       document.getElementById('keyInfo').innerHTML =
//         `Share this key: <b>${data.key}</b>`;

//       const tableHtml = `
//         <table>
//           <thead>
//             <tr><th>File Name</th><th>Download Key</th></tr>
//           </thead>
//           <tbody>
//             ${data.files.map(f => `<tr><td>${f.originalName}</td><td>${data.key}</td></tr>`).join('')}
//           </tbody>
//         </table>
//       `;
//       document.getElementById('fileTableContainer').innerHTML = tableHtml;

//       window.latestKey = data.key;

//       setTimeout(() => {
//         uploadContainer.style.display = "none"; // hide after done
//       }, 1000);
//     } else {
//       alert("❌ Upload failed");
//       uploadContainer.style.display = "none";
//     }
//   };

//   xhr.onerror = function () {
//     alert("❌ Upload error");
//     uploadContainer.style.display = "none";
//   };

//   xhr.send(formData);
// }

// // Clear button
// const clearBtn = document.getElementById('clearBtn');
// if (clearBtn) {
//   clearBtn.addEventListener('click', () => {
//     document.getElementById('keyInfo').innerHTML = '';
//     document.getElementById('fileTableContainer').innerHTML = '';
//     fileInput.value = null;
//   });
// }

// // Poll for receiver request
// setInterval(async () => {
//   const key = window.latestKey;
//   if (!key) return;

//   const res = await fetch(`/file-info/${key}`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ receiverName: 'POLL' })
//   });

//   if (!res.ok) return;

//   const data = await res.json();
//   const receiver = data.receiverName;
//   const isApproved = data.approved;

//   const container = document.getElementById('pendingRequests');
//   if (receiver !== 'POLL' && !isApproved) {
//     container.innerHTML = `
//       <p><b>${receiver}</b> is requesting to download files.</p>
//       <button onclick="approve('${key}', '${receiver}')">Approve</button>
//     `;
//   }
// }, 3000);

// async function approve(key, receiverName) {
//   await fetch('/approve', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ key, receiverName })
//   });
//   alert(`Approved ${receiverName}`);
//   document.getElementById('pendingRequests').innerHTML = '';
// }
