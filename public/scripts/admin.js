// This helper function is crucial for preventing XSS attacks.
function escapeHTML(str) {
    if (!str) return '';
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

// Validates that input contains only allowed characters.
function isValidInput(name) {
    const nameRegex = /^[A-Za-z0-9 ]+$/;
    return nameRegex.test(name);
}

// Main login function
async function login() {
    const usernameInput = document.getElementById('adminUser');
    const passwordInput = document.getElementById('adminPass');
    const errorP = document.getElementById('loginError');

    const username = usernameInput.value;
    const password = passwordInput.value;

    if (!isValidInput(username)) {
        errorP.innerText = 'Invalid username format.';
        return;
    }

    try {
        const res = await fetch('/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (res.ok) {
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            errorP.innerText = '';
            
            await loadSessions(); 
            setInterval(loadSessions, 5000);
        } else {
            errorP.innerText = 'Invalid credentials';
        }
    } catch (error) {
        errorP.innerText = 'Could not connect to the server.';
        console.error('Login error:', error);
    }
}

// Loads and displays the active sessions table
async function loadSessions() {
    try {
        const res = await fetch('/admin/sessions');
        const sessions = await res.json();
        const sessionTableDiv = document.getElementById('sessionTable');

        const tableRows = sessions.map(s => `
            <tr>
                <td>${escapeHTML(s.key)}</td>
                <td>${escapeHTML(s.senderName)}</td>
                <td>
                    <ul>
                        ${s.fileDetails.map(f => `<li>${escapeHTML(f.originalName)} (${(f.size / 1024).toFixed(2)} KB)</li>`).join('')}
                    </ul>
                </td>
                <td>${escapeHTML((s.receiversWaiting || []).join(', ')) || '-'}</td>
                <td>${escapeHTML((s.approvedReceivers || []).join(', ')) || '-'}</td>
                <td>${(s.totalSize / 1024).toFixed(2)} KB</td>
                <td>${new Date(s.createdAt).toLocaleString('en-IN')}</td>
            </tr>
        `).join('');

        const fullHtml = `
            <div style="text-align: right; margin-bottom: 10px;">
                <button id="deleteAllBtn" style="background-color: #d9534f;">Delete All Uploads</button>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Key</th><th>Sender</th><th>Files</th><th>Waiting</th><th>Approved</th><th>Size</th><th>Created</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        `;
        sessionTableDiv.innerHTML = fullHtml;
    } catch (error) {
        console.error('Failed to load sessions:', error);
        document.getElementById('sessionTable').innerHTML = '<p style="color:red;">Error loading session data.</p>';
    }
}

// Deletes all uploads
async function deleteAllUploads() {
    if (!confirm("Are you sure you want to delete ALL uploaded files? This action cannot be undone.")) return;

    try {
        const res = await fetch('/admin/delete-all-uploads', { method: 'POST' });
        if (res.ok) {
            alert("All uploads have been deleted.");
            await loadSessions(); // Refresh the table to show it's empty
        } else {
            const errorData = await res.json();
            alert(`Error deleting uploads: ${errorData.error || 'Unknown error'}`);
        }
    } catch (error) {
        alert('A network error occurred while trying to delete uploads.');
        console.error('Delete error:', error);
    }
}

// ===================================================================
// MOVED TO THE BOTTOM: This is the main entry point for the script.
// It should be the last thing in the file.
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('loginBtn');
    const sessionTable = document.getElementById('sessionTable');

    // This now works because the 'login' function has been defined above.
    if (loginButton) {
        loginButton.addEventListener('click', login);
    }

    // This works because the 'deleteAllUploads' function has been defined above.
    if (sessionTable) {
        sessionTable.addEventListener('click', (event) => {
            if (event.target && event.target.id === 'deleteAllBtn') {
                deleteAllUploads();
            }
        });
    }
});