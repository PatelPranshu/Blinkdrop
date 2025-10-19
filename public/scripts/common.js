// public/scripts/common.js

// Initialize Socket.IO globally
const socket = io();

// Handle the connection event - This runs on every page load where this script is included
socket.on('connect', () => {
    // Get username from browser's local storage
    const username = localStorage.getItem('userName') || 'Anonymous';

    // Determine the current page and intended action based on the URL path
    const path = window.location.pathname;
    let page = path; // Default page name is the path
    let action = 'Browsing'; // Default action

    // Set more descriptive page names and actions for clarity in admin panel
    switch (path) {
        case '/':
            page = 'Home Page';
            action = 'On main page';
            break;
        case '/sender':
            page = 'Sender';
            action = 'Preparing to send';
            break;
        case '/receiver':
            page = 'Receiver';
            action = 'Preparing to receive'; // Key added later if applicable
            break;
        case '/receiver-link':
            page = 'Receiver Link';
            action = 'Viewing files'; // Key info implicit in page
            break;
        case '/receiver-scan':
            page = 'QR Scanner';
            action = 'Scanning QR Code';
            break;
        case '/download-apk':
            page = 'APK Download';
            action = 'Downloading APK';
            break;
        case '/admin': // Assuming you might add tracking here too eventually
             page = 'Admin Panel';
             action = 'Monitoring';
             break;
        // Add other cases if new pages are created
    }

    // Send the user's status update to the server
    // NO sessionId is needed here anymore - the server knows via the cookie
    socket.emit('userUpdate', {
        username,
        page,
        action
    });
});

// You can also add other globally used functions here, like showNotification
function showNotification(message, type = 'error') {
    const container = document.getElementById('notification-container');
    if (!container) return; // Add check in case container isn't on every page

    const notification = document.createElement('div');
    notification.className = `notification ${type}`; // Ensure these classes are defined in your CSS
    notification.textContent = message;

    container.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // Animate out and remove after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        // Use 'transitionend' for smoother removal after animation completes
        notification.addEventListener('transitionend', () => {
             if (notification.parentNode === container) { // Check if still attached
                notification.remove();
            }
        }, { once: true }); // Ensure listener runs only once
    }, 5000);
}

// Global theme handling logic could also live here if desired,
// but it's often kept separate (like your theme.js).

// If isValidInput or formatSize are used on multiple pages, move them here too.
/**
 * Checks if the user's name is valid (letters, numbers, spaces).
 * @param {string} name The name to validate.
 * @returns {boolean}
 */
function isValidInput(name) {
    // Basic regex for names (adjust if different rules needed, e.g., hyphens)
    const regex = /^[A-Za-z0-9 ]+$/;
    // Check if name exists and passes the regex test
    return name && regex.test(name);
}

/**
 * Formats file size in bytes to KB or MB.
 * @param {number} bytes The size in bytes.
 * @returns {string} Formatted size string.
 */
function formatSize(bytes) {
    if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B'; // Handle invalid input
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}