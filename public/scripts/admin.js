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


// --- Socket.IO for real-time updates ---
let socket;

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
            
            socket = io();

            // Announce the admin's status upon connection
            socket.on('connect', () => {
                socket.emit('userUpdate', {
                    username: usernameInput.value, // Use the name from the login form
                    page: 'Admin Panel',
                    action: 'Monitoring'
                });
            });

            
            setupSocketListeners();
            
            await loadAllAdminData(); 
            setInterval(loadAllAdminData, 10000); 
        } else {
            errorP.innerText = 'Invalid credentials';
        }
    } catch (error) {
        errorP.innerText = 'Could not connect to the server.';
        console.error('Login error:', error);
    }
}

function setupSocketListeners() {
    socket.on('activeUsers', (data) => {
        renderActiveUsers(data.users);
        renderUserStats(data.counts);
    });
}

async function loadAllAdminData() {
    await loadSessions();
    await loadStats();
}

function renderUserStats(counts) {
    const totalUsersStatDiv = document.getElementById('totalUsersStat');
    const senderUsersStatDiv = document.getElementById('senderUsersStat');
    const receiverUsersStatDiv = document.getElementById('receiverUsersStat');

    if(totalUsersStatDiv) {
        totalUsersStatDiv.innerHTML = `
            <h3 class="text-sm font-medium text-neutral-500">Active Users</h3>
            <p class="text-2xl font-semibold">${counts.total}</p>
        `;
    }
    if(senderUsersStatDiv) {
        senderUsersStatDiv.innerHTML = `
            <h3 class="text-sm font-medium text-neutral-500">Senders</h3>
            <p class="text-2xl font-semibold">${counts.senders}</p>
        `;
    }
    if(receiverUsersStatDiv) {
        receiverUsersStatDiv.innerHTML = `
            <h3 class="text-sm font-medium text-neutral-500">Receivers</h3>
            <p class="text-2xl font-semibold">${counts.receivers}</p>
        `;
    }
}

function renderActiveUsers(users) {
    const activeUsersTableDiv = document.getElementById('activeUsersTable');
    if (!activeUsersTableDiv) return;

    const tableRows = users.map(u => `
        <tr class="border-b border-neutral-200 bg-white last:border-b-0">
            <td class="px-4 py-3">${escapeHTML(u.username)}</td>
            <td class="px-4 py-3">${escapeHTML(u.ip)}</td>
            <td class="px-4 py-3">${escapeHTML(u.deviceName)}</td>
            <td class="px-4 py-3">${escapeHTML(u.deviceType)}</td>
            <td class="px-4 py-3">${escapeHTML(u.page)}</td>
            <td class="px-4 py-3">${escapeHTML(u.action)}</td>
        </tr>
    `).join('');

    const fullHtml = `
        <table class="min-w-full text-sm text-left">
            <thead class="bg-neutral-50 text-neutral-700">
                <tr>
                    <th class="px-4 py-2 font-medium">Username</th>
                    <th class="px-4 py-2 font-medium">IP</th>
                    <th class="px-4 py-2 font-medium">Device Name</th>
                    <th class="px-4 py-2 font-medium">Device Type</th>
                    <th class="px-4 py-2 font-medium">Page</th>
                    <th class="px-4 py-2 font-medium">Action</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-neutral-200">
                ${users.length > 0 ? tableRows : `<tr><td colspan="6" class="text-center p-8 text-neutral-500">No active users.</td></tr>`}
            </tbody>
        </table>`;
    activeUsersTableDiv.innerHTML = fullHtml;
}

// **UPDATED FUNCTION**
async function loadStats() {
    try {
        const res = await fetch('/admin/stats');
        const stats = await res.json();
        const statsSection = document.getElementById('statsSection');
        if (!statsSection) return;

        // ---- FIX STARTS HERE ----

        // 1. Remove any previously added file stat boxes to prevent duplication
        const oldFileStats = statsSection.querySelectorAll('.file-stat-box');
        oldFileStats.forEach(box => box.remove());

        // 2. Create the HTML for the new file stat boxes
        const fileStatsHtml = `
            <div class="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm file-stat-box">
                <h3 class="text-sm font-medium text-neutral-500">Total Upload Size</h3>
                <p class="text-2xl font-semibold">${(stats.uploads.totalUploadSize / (1024*1024)).toFixed(2)} MB</p>
            </div>
            <div class="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm file-stat-box">
                <h3 class="text-sm font-medium text-neutral-500">Total Files Uploaded</h3>
                <p class="text-2xl font-semibold">${stats.uploads.totalFilesUploaded}</p>
            </div>
            <div class="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm file-stat-box">
                <h3 class="text-sm font-medium text-neutral-500">Total Download Size</h3>
                <p class="text-2xl font-semibold">${(stats.downloads.totalDownloadSize / (1024*1024)).toFixed(2)} MB</p>
            </div>
            <div class="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm file-stat-box">
                <h3 class="text-sm font-medium text-neutral-500">Total Files Downloaded</h3>
                <p class="text-2xl font-semibold">${stats.downloads.totalFilesDownloaded}</p>
            </div>
        `;

        // 3. Append the new boxes directly into the grid container
        statsSection.insertAdjacentHTML('beforeend', fileStatsHtml);

        // ---- FIX ENDS HERE ----
        
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}


// Loads and displays the active sessions table
async function loadSessions() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value;
    const url = query ? `/admin/search?query=${encodeURIComponent(query)}` : '/admin/sessions';
    
    try {
        const res = await fetch(url);
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                window.location.reload();
            }
            throw new Error('Failed to fetch sessions');
        }

        const sessions = await res.json();
        const sessionTableDiv = document.getElementById('sessionTable');

        const tableRows = sessions.map(s => `
            <tr class="border-b border-neutral-200 bg-white last:border-b-0">
                <td class="whitespace-nowrap px-4 py-3 font-mono text-xs">${escapeHTML(s.key)}</td>
                <td class="whitespace-nowrap px-4 py-3">${escapeHTML(s.senderName)}</td>
                <td class="px-4 py-3">
                    <ul class="list-decimal list-inside text-xs">
                        ${(s.files || s.fileDetails || []).map(f => `<li>${escapeHTML(f.originalName)} (${((f.size || 0) / 1024).toFixed(1)} KB)</li>`).join('')}
                    </ul>
                </td>
                <td class="px-4 py-3">${(s.receiversWaiting && s.receiversWaiting.length > 0) ? escapeHTML(s.receiversWaiting.join(', ')) : '<span class="text-neutral-400">-</span>'}</td>
                <td class="px-4 py-3">${(s.approvedReceivers && s.approvedReceivers.length > 0) ? escapeHTML(s.approvedReceivers.join(', ')) : '<span class="text-neutral-400">-</span>'}</td>
                <td class="whitespace-nowrap px-4 py-3">${(((s.files || s.fileDetails || []).reduce((sum, f) => sum + (f.size || 0), 0)) / 1024).toFixed(1)} KB</td>
                <td class="whitespace-nowrap px-4 py-3">${new Date(s.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
            </tr>
        `).join('');

        const fullHtml = `
            <div class="flex justify-end mb-4">
                <button id="deleteAllBtn" class="inline-flex items-center justify-center rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-red-700 active:scale-[0.99] transition">
                    Delete All Uploads
                </button>
            </div>
            <div class="border border-neutral-200 rounded-lg overflow-x-auto">
                <table class="min-w-full text-sm text-left">
                    <thead class="bg-neutral-50 text-neutral-700">
                        <tr>
                            <th class="px-4 py-2 font-medium">Key</th>
                            <th class="px-4 py-2 font-medium">Sender</th>
                            <th class="px-4 py-2 font-medium">Files</th>
                            <th class="px-4 py-2 font-medium">Waiting</th>
                            <th class="px-4 py-2 font-medium">Approved</th>
                            <th class="px-4 py-2 font-medium">Size</th>
                            <th class="px-4 py-2 font-medium">Created</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-neutral-200">
                        ${sessions.length > 0 ? tableRows : `<tr><td colspan="7" class="text-center p-8 text-neutral-500">No active transfers found.</td></tr>`}
                    </tbody>
                </table>
            </div>
        `;
        sessionTableDiv.innerHTML = fullHtml;
    } catch (error) {
        console.error('Failed to load sessions:', error);
        document.getElementById('sessionTable').innerHTML = '<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Error loading session data. Please try refreshing the page.</div>';
    }
}

// Deletes all uploads
async function deleteAllUploads() {
    if (!confirm("Are you sure you want to delete ALL uploaded files? This action cannot be undone.")) return;

    try {
        const res = await fetch('/admin/delete-all-uploads', { method: 'POST' });
        if (res.ok) {
            showNotification("All uploads have been deleted.");
            await loadSessions(); // Refresh the table to show it's empty
        } else {
            const errorData = await res.json();
            showNotification(`Error deleting uploads: ${errorData.error || 'Unknown error'}`);
        }
    } catch (error) {
        showNotification('A network error occurred while trying to delete uploads.');
        console.error('Delete error:', error);
    }
}

// Main entry point for the script.
document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('loginBtn');
    if (loginButton) {
        loginButton.addEventListener('click', login);
    }

    const searchInput = document.getElementById('searchInput');
    if(searchInput){
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            // Debounce search to avoid too many requests
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(loadSessions, 500);
        });
    }

    // Attach a general click listener to the whole document for dynamic buttons
    document.addEventListener('click', (event) => {
        if (event.target && event.target.id === 'deleteAllBtn') {
            deleteAllUploads();
        }
    });
});