// frontend/scripts/admin.js

// Helper function to prevent XSS attacks.
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

// --- Log Display Variables ---
const activityLogElement = document.getElementById('activityLog');
const MAX_LOG_LINES = 200; // Limit the number of lines to display

// --- Main login function ---
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

            // Initialize Socket.IO connection
            socket = io();

            // Handle connection event
            socket.on('connect', () => {
                console.log("Socket connected, initializing dashboard.");
                // Announce admin presence
                socket.emit('userUpdate', {
                    username: usernameInput.value, // Send the entered username
                    page: 'Admin Panel',
                    action: 'Monitoring'
                });
                // Initialize data loading *after* socket connection is established
                initializeDashboard();
            });

             // Handle potential connection errors
             socket.on('connect_error', (err) => {
                 console.error("Socket connection error:", err);
                 errorP.innerText = 'Could not establish real-time connection. Refresh may be needed.';
                 // Optionally disable dashboard features or show overlay
             });


            // Setup listeners for socket events (activeUsers, serverLog)
            setupSocketListeners();

        } else {
            // Handle specific HTTP errors from login attempt
            if (res.status === 401) {
                 errorP.innerText = 'Invalid credentials.';
            } else {
                 errorP.innerText = `Login failed (Status: ${res.status}).`;
            }
        }
    } catch (error) {
        errorP.innerText = 'Could not connect to the server for login.';
        console.error('Login network/fetch error:', error);
    }
}

// NEW function to load initial data and set up interval AFTER login and socket connect
async function initializeDashboard() {
    console.log("Initializing dashboard data...");
    try {
        // Perform the FIRST data load
        await loadAllAdminData(); // This loads sessions and stats
        console.log("Initial dashboard data loaded.");

        // Start the interval ONLY AFTER the first load is successful
        // Ensure only one interval is running
        if (window.adminDataInterval) {
            clearInterval(window.adminDataInterval);
        }
        window.adminDataInterval = setInterval(loadAllAdminData, 10000); // Poll every 10 seconds

    } catch (error) {
        // Handle potential errors during the initial load (e.g., if the first fetch fails)
        console.error("Error loading initial dashboard data:", error);
        // Show an error message to the admin user?
        const sessionTableDiv = document.getElementById('sessionTable');
        if(sessionTableDiv){
            sessionTableDiv.innerHTML = '<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:bg-red-900/50 dark:border-red-700 dark:text-red-300">Error loading initial dashboard data. Please refresh.</div>';
        }
         // Maybe try again after a delay? Or just show error.
    }
}


// Function to display server log entries in the UI
function displayServerLog(logEntry) {
    // Check if the log container element exists on the page
    if (!activityLogElement) {
        console.warn("Activity log element not found."); // Log a warning if missing
        return;
    }

    // Destructure the log entry object
    const { timestamp, type, message, data } = logEntry; // Keep data for potential future use

    // Create a new div element for this log line
    const logLine = document.createElement('div');
    // Add base class and type-specific class (e.g., "log-entry log-user_connect")
    logLine.classList.add('log-entry', `log-${type}`); // Use type for styling

    // Construct the main log text
    let logText = `[${timestamp}] ${message}`;

    // --- UPDATED: Conditionally add specific details into the message string ---
    if (type === 'user_disconnect' && data) {
        if (data.username && data.username !== 'Unknown' && data.username !== 'Anonymous') {
            logText += ` (User: ${escapeHTML(data.username)})`;
        }
        if (data.reason) {
            logText += ` (Reason: ${escapeHTML(data.reason)})`;
        }
    } else if (type === 'user_upload' && data?.filename) {
       logText += ` - File: ${escapeHTML(data.filename)}`;
    } else if (type === 'user_download' && data?.filename) {
       logText += ` - File: ${escapeHTML(data.filename)}`;
       if (data.receiver) {
           logText += ` by ${escapeHTML(data.receiver)}`;
       }
    } else if (type === 'user_approve' && data?.receiver) {
        logText += ` '${escapeHTML(data.receiver)}'`;
    } else if (type === 'user_pending' && data?.receiver) {
        logText += ` '${escapeHTML(data.receiver)}'`;
    } else if (type === 'user_login' && data?.username) {
        logText += ` (${escapeHTML(data.username)})`;
    }
    // Add more conditions here for other types as needed
    // --- END UPDATED SECTION ---

    // Set the final formatted text content of the log line element
    logLine.textContent = logText;

    // Append the new log line to the log container
    activityLogElement.appendChild(logLine);

    // Prune old log lines if the maximum limit is exceeded
    while (activityLogElement.childNodes.length > MAX_LOG_LINES) {
        activityLogElement.removeChild(activityLogElement.firstChild);
    }

    // Automatically scroll the log container to the bottom to show the latest log
    activityLogElement.scrollTop = activityLogElement.scrollHeight;
}


// Sets up Socket.IO event listeners
function setupSocketListeners() {
    if (!socket) {
        console.error("Socket not initialized before setting up listeners.");
        return;
    }

    // Listener for active user updates
    socket.on('activeUsers', (data) => {
        // Add basic validation for received data
        if (data && data.users && data.counts){
            renderActiveUsers(data.users);
            renderUserStats(data.counts);
        } else {
             console.warn("Received incomplete 'activeUsers' data:", data);
        }
    });

    // Listener for server logs (user activity)
    socket.on('serverLog', (logEntry) => {
        // Basic validation of the received log entry structure
        if (logEntry && logEntry.timestamp && logEntry.type && logEntry.message) {
             displayServerLog(logEntry); // Call the function to display it
        } else {
             console.warn("Received invalid log entry format:", logEntry);
        }
    });
}


// Fetches and renders sessions and stats
async function loadAllAdminData() {
    // Use Promise.allSettled to fetch both concurrently and handle errors individually
    const results = await Promise.allSettled([
        loadSessions(),
        loadStats()
    ]);

    // Optional: Check results for errors if needed
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(`Error loading ${index === 0 ? 'sessions' : 'stats'}:`, result.reason);
             // Maybe show a specific error in the UI for the failed part
        }
    });
}

// Renders the user statistics boxes
function renderUserStats(counts) {
    const totalUsersStatDiv = document.getElementById('totalUsersStat');
    const senderUsersStatDiv = document.getElementById('senderUsersStat');
    const receiverUsersStatDiv = document.getElementById('receiverUsersStat');

    // Add null checks for elements
    if(totalUsersStatDiv) {
        totalUsersStatDiv.innerHTML = `
            <h3 class="text-sm font-medium text-neutral-500 dark:text-neutral-400">Active Users</h3>
            <p class="text-2xl font-semibold dark:text-neutral-200">${counts.total || 0}</p>
        `;
    }
    if(senderUsersStatDiv) {
        senderUsersStatDiv.innerHTML = `
            <h3 class="text-sm font-medium text-neutral-500 dark:text-neutral-400">Senders</h3>
            <p class="text-2xl font-semibold dark:text-neutral-200">${counts.senders || 0}</p>
        `;
    }
    if(receiverUsersStatDiv) {
        receiverUsersStatDiv.innerHTML = `
            <h3 class="text-sm font-medium text-neutral-500 dark:text-neutral-400">Receivers</h3>
            <p class="text-2xl font-semibold dark:text-neutral-200">${counts.receivers || 0}</p>
        `;
    }
}

// Renders the table of currently active users
function renderActiveUsers(users) {
    const activeUsersTableDiv = document.getElementById('activeUsersTable');
    if (!activeUsersTableDiv) return; // Exit if element not found

     const safeUsers = users || []; // Ensure users is an array

    const tableRows = safeUsers.map(u => `
        <tr class="border-b border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 last:border-b-0">
            <td class="px-4 py-3 dark:text-neutral-300">${escapeHTML(u.username)}</td>
            <td class="px-4 py-3 dark:text-neutral-300">${escapeHTML(u.ip)}</td>
            <td class="px-4 py-3 dark:text-neutral-300">${escapeHTML(u.deviceName)}</td>
            <td class="px-4 py-3 dark:text-neutral-300">${escapeHTML(u.deviceType)}</td>
            <td class="px-4 py-3 dark:text-neutral-300 text-xs">${escapeHTML(u.page)}</td> <td class="px-4 py-3 dark:text-neutral-300">${escapeHTML(u.action)}</td>
        </tr>
    `).join('');

    const fullHtml = `
        <table class="min-w-full text-sm text-left">
            <thead class="bg-neutral-50 text-neutral-700 dark:bg-neutral-700/50 dark:text-neutral-300">
                <tr>
                    <th class="px-4 py-2 font-medium">Username</th>
                    <th class="px-4 py-2 font-medium">IP</th>
                    <th class="px-4 py-2 font-medium">Device Name</th>
                    <th class="px-4 py-2 font-medium">Device Type</th>
                    <th class="px-4 py-2 font-medium">Page(s)</th>
                    <th class="px-4 py-2 font-medium">Last Action</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-neutral-200 dark:divide-neutral-700">
                ${safeUsers.length > 0 ? tableRows : `<tr><td colspan="6" class="text-center p-8 text-neutral-500 dark:text-neutral-400">No active users connected.</td></tr>`}
            </tbody>
        </table>`;
    activeUsersTableDiv.innerHTML = fullHtml;
}

// Fetches and renders file transfer statistics
async function loadStats() {
    try {
        const res = await fetch('/admin/stats');
         if (!res.ok) { // Check for non-2xx status codes
             throw new Error(`Failed to fetch stats: ${res.status} ${res.statusText}`);
         }
        const stats = await res.json();
        const statsSection = document.getElementById('statsSection');
        if (!statsSection) return;

        // Clear only file-specific stats before adding new ones
        const oldFileStats = statsSection.querySelectorAll('.file-stat-box');
        oldFileStats.forEach(box => box.remove());

        const uploads = stats.uploads || { totalUploadSize: 0, totalFilesUploaded: 0 };
        const downloads = stats.downloads || { totalDownloadSize: 0, totalFilesDownloaded: 0 };


        const fileStatsHtml = `
            <div class="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 p-4 shadow-sm file-stat-box">
                <h3 class="text-sm font-medium text-neutral-500 dark:text-neutral-400">Total Upload Size</h3>
                <p class="text-2xl font-semibold dark:text-neutral-200">${(uploads.totalUploadSize / (1024*1024)).toFixed(2)} MB</p>
            </div>
            <div class="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 p-4 shadow-sm file-stat-box">
                <h3 class="text-sm font-medium text-neutral-500 dark:text-neutral-400">Total Files Uploaded</h3>
                <p class="text-2xl font-semibold dark:text-neutral-200">${uploads.totalFilesUploaded}</p>
            </div>
            <div class="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 p-4 shadow-sm file-stat-box">
                <h3 class="text-sm font-medium text-neutral-500 dark:text-neutral-400">Total Download Size</h3>
                <p class="text-2xl font-semibold dark:text-neutral-200">${(downloads.totalDownloadSize / (1024*1024)).toFixed(2)} MB</p>
            </div>
            <div class="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 p-4 shadow-sm file-stat-box">
                <h3 class="text-sm font-medium text-neutral-500 dark:text-neutral-400">Total Files Downloaded</h3>
                <p class="text-2xl font-semibold dark:text-neutral-200">${downloads.totalFilesDownloaded}</p>
            </div>
        `;
        // Append new stats elements to the statsSection
        statsSection.insertAdjacentHTML('beforeend', fileStatsHtml);

    } catch (error) {
        console.error('Failed to load stats:', error);
         // Optionally display an error in the stats section
         const statsSection = document.getElementById('statsSection');
         if (statsSection) {
              const errorDiv = '<p class="text-red-500 dark:text-red-400 col-span-full text-center">Error loading file statistics.</p>';
              // Clear old stats before showing error
              statsSection.querySelectorAll('.file-stat-box').forEach(box => box.remove());
              if (!statsSection.querySelector('.text-red-500')) { // Avoid adding multiple errors
                   statsSection.insertAdjacentHTML('beforeend', errorDiv);
              }
         }
    }
}

// Fetches and renders the list of transfer sessions (or search results)
async function loadSessions() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value : ''; // Handle missing input gracefully
    const url = query ? `/admin/search?query=${encodeURIComponent(query)}` : '/admin/sessions';
    const sessionTableDiv = document.getElementById('sessionTable'); // Get reference outside try

    try {
        const res = await fetch(url);
        if (!res.ok) {
            // If unauthorized, attempt reload to trigger login redirect
            if (res.status === 401 || res.status === 403) {
                 showNotification("Session expired or unauthorized. Please log in again.", "error");
                 // Redirect to login or reload after a short delay
                 setTimeout(() => window.location.reload(), 2000);
            }
            // Throw error for other failed fetches
            throw new Error(`Failed to fetch sessions (${res.status})`);
        }

        const sessions = await res.json();

        // Ensure element exists before modifying
        if (!sessionTableDiv) {
             console.error("Session table element not found.");
             return;
        }

        const safeSessions = sessions || []; // Ensure sessions is an array

        const tableRows = safeSessions.map(s => {
             // Calculate total size safely, handling potential missing 'files' or 'fileDetails'
             const filesArray = s.fileDetails || s.files || [];
             const totalSizeBytes = filesArray.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
             const totalSizeKB = (totalSizeBytes / 1024).toFixed(1);
             const filesListHtml = filesArray.map(f =>
                 `<li>${escapeHTML(f.originalName)} (${((Number(f.size) || 0) / 1024).toFixed(1)} KB)</li>`
             ).join('');

             // Format receivers safely
             const waitingReceivers = (s.receiversWaiting && s.receiversWaiting.length > 0) ? escapeHTML(s.receiversWaiting.join(', ')) : '<span class="text-neutral-400">-</span>';
             const approvedReceivers = (s.approvedReceivers && s.approvedReceivers.length > 0) ? escapeHTML(s.approvedReceivers.join(', ')) : '<span class="text-neutral-400">-</span>';

             // Format date safely
             let createdAtDate = '-';
             try {
                  if (s.createdAt) {
                       createdAtDate = new Date(s.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
                  }
             } catch (e) { console.warn("Error formatting date:", s.createdAt); }


             return `
            <tr class="border-b border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 last:border-b-0">
                <td class="whitespace-nowrap px-4 py-3 font-mono text-xs dark:text-neutral-300">${escapeHTML(s.key)}</td>
                <td class="whitespace-nowrap px-4 py-3 dark:text-neutral-300">${escapeHTML(s.senderName)}</td>
                <td class="px-4 py-3 dark:text-neutral-300">
                    <ul class="list-decimal list-inside text-xs max-h-20 overflow-y-auto"> ${filesListHtml || '<li>-</li>'}
                    </ul>
                </td>
                <td class="px-4 py-3 dark:text-neutral-300 text-xs">${waitingReceivers}</td> <td class="px-4 py-3 dark:text-neutral-300 text-xs">${approvedReceivers}</td> <td class="whitespace-nowrap px-4 py-3 dark:text-neutral-300">${totalSizeKB} KB</td>
                <td class="whitespace-nowrap px-4 py-3 dark:text-neutral-300">${createdAtDate}</td>
            </tr>
        `;
        }).join('');

        // Include Delete All button only if not searching (or decide based on your preference)
        const deleteAllButtonHtml = !query ? `
            <div class="flex justify-end mb-4">
                <button id="deleteAllBtn" class="inline-flex items-center justify-center rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-red-700 active:scale-[0.99] transition">
                    Delete All Uploads
                </button>
            </div>` : '';


        const fullHtml = `
            ${deleteAllButtonHtml}
            <div class="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-x-auto">
                <table class="min-w-full text-sm text-left">
                    <thead class="bg-neutral-50 text-neutral-700 dark:bg-neutral-700/50 dark:text-neutral-300">
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
                    <tbody class="divide-y divide-neutral-200 dark:divide-neutral-700">
                        ${safeSessions.length > 0 ? tableRows : `<tr><td colspan="7" class="text-center p-8 text-neutral-500 dark:text-neutral-400">${query ? 'No transfers found matching your search.' : 'No active transfers found.'}</td></tr>`}
                    </tbody>
                </table>
            </div>
        `;
        sessionTableDiv.innerHTML = fullHtml;
    } catch (error) {
        console.error('Failed to load sessions:', error);
         if (sessionTableDiv) { // Check element exists before showing error
              sessionTableDiv.innerHTML = '<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:bg-red-900/50 dark:border-red-700 dark:text-red-300">Error loading session data. Please try refreshing the page.</div>';
         }
    }
}

// Handles the request to delete all uploads
async function deleteAllUploads() {
    // Confirmation dialog
    if (!confirm("🚨 Are you absolutely sure you want to delete ALL uploaded files and transfer records? This action cannot be undone.")) {
        return; // Abort if user cancels
    }

    try {
        // Disable button? Show loading state?
        const deleteBtn = document.getElementById('deleteAllBtn');
        if (deleteBtn) deleteBtn.disabled = true;

        const res = await fetch('/admin/delete-all-uploads', { method: 'POST' });

        if (res.ok) {
             const result = await res.json(); // Get detailed result from backend
            showNotification(`✅ Success: ${result.message || 'All uploads have been deleted.'}`, 'success'); // Use success type
            await loadSessions(); // Refresh the table to show it's empty
            await loadStats(); // Refresh stats as well
        } else {
             // Try to parse error message from backend
             let errorMsg = 'Unknown error deleting uploads.';
             try {
                  const errorData = await res.json();
                  errorMsg = errorData.error || errorMsg;
             } catch (e) { /* Ignore parsing error */ }
            showNotification(`❌ Error deleting uploads: ${errorMsg}`);
        }
    } catch (error) {
        showNotification('❌ A network error occurred while trying to delete uploads.');
        console.error('Delete all error:', error);
    } finally {
         // Re-enable button
         const deleteBtn = document.getElementById('deleteAllBtn');
         if (deleteBtn) deleteBtn.disabled = false;
    }
}

// --- Common Notification Function (ensure it's available) ---
// If 'common.js' is loaded AFTER 'admin.js', move this function definition
// above its first call site (e.g., top level or inside DOMContentLoaded).
function showNotification(message, type = 'error') {
    const container = document.getElementById('notification-container');
    if (!container) {
        console.error("Notification container not found!");
        return;
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`; // Ensure CSS classes 'error' and 'success' exist
    notification.textContent = message;

    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10); // Slight delay for animation

    setTimeout(() => {
        notification.classList.remove('show');
        notification.addEventListener('transitionend', () => notification.remove(), { once: true });
    }, 5000); // Remove after 5 seconds
}


// --- Main entry point for the script ---
document.addEventListener('DOMContentLoaded', () => {
    // Clear log area on initial load
    if (activityLogElement) {
        activityLogElement.innerHTML = ''; // Start with an empty log display
    }

    // Attach login button listener
    const loginButton = document.getElementById('loginBtn');
    if (loginButton) {
        loginButton.addEventListener('click', login);
    }

    // Attach search input listener with debounce
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                // Only load sessions on search input change, stats are less critical to update instantly
                loadSessions().catch(err => console.error("Error during search input triggered loadSessions:", err));
            }, 500); // Debounce time: 500ms
        });
    }

    // Use event delegation for the delete all button (added dynamically)
    document.addEventListener('click', (event) => {
        if (event.target && event.target.id === 'deleteAllBtn') {
            deleteAllUploads();
        }
    });

     // Check session on load via socket connection
     const initialSocket = io({ autoConnect: false }); // Don't connect immediately

     initialSocket.on('connect', async () => {
         console.log("Initial socket connected, checking session...");
         try {
             // Use the established socket connection to verify session via fetch
             const res = await fetch('/admin/sessions');
             if (res.ok) {
                 console.log("Admin session confirmed via fetch after socket connect.");
                 document.getElementById('loginForm').style.display = 'none';
                 document.getElementById('dashboard').style.display = 'block';
                 socket = initialSocket; // Assign to global socket variable used by other functions
                 socket.emit('userUpdate', {
                      username: 'Admin (reconnect)', // Might need a better way to get username
                      page: 'Admin Panel',
                      action: 'Monitoring (reconnect)'
                 });
                 setupSocketListeners(); // Setup listeners for the now confirmed socket
                 initializeDashboard(); // Load dashboard data
             } else {
                  console.log("No active admin session detected via fetch after socket connect.");
                  // Ensure login form is visible if not already
                  document.getElementById('loginForm').style.display = 'block';
                  document.getElementById('dashboard').style.display = 'none';
                  initialSocket.disconnect(); // Disconnect if no valid session
             }
         } catch (err) {
             console.error("Error checking admin session after socket connect:", err);
              document.getElementById('loginForm').style.display = 'block';
              document.getElementById('dashboard').style.display = 'none';
              initialSocket.disconnect();
         }
     });

     initialSocket.on('connect_error', (err) => {
          console.error("Initial socket connection failed:", err);
          // Show login form as fallback if initial connection fails
          document.getElementById('loginForm').style.display = 'block';
          document.getElementById('dashboard').style.display = 'none';
     });

     // Manually connect the socket to start the session check process
     initialSocket.connect();

}); // End DOMContentLoaded