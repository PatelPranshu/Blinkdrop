// backend/utils/logger.js
let ioInstance = null; // We'll store the io instance here

// Define specific log types
const LOG_TYPES = {
    // User Actions (Emitted to Admin UI)
    USER_CONNECT: 'user_connect',       // User session/socket connected
    USER_DISCONNECT: 'user_disconnect', // User session/socket disconnected
    USER_LOGIN: 'user_login',         // Admin login
    USER_UPLOAD: 'user_upload',       // File upload initiated/completed
    USER_DOWNLOAD: 'user_download',     // File download initiated/completed
    USER_APPROVE: 'user_approve',     // Receiver approved
    USER_PENDING: 'user_pending',     // Receiver added to pending
    // Server/System Actions (Console only)
    SERVER_START: 'server_start',
    DB_CONNECT: 'db_connect',
    DRIVE_ACTION: 'drive_action',     // e.g., folder created, file uploaded to drive
    CLEANUP: 'cleanup',
    SOCKET_INIT: 'socket_init',
    // General Status/Errors (Console only, unless critical for admin UI)
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    SUCCESS: 'success',           // General success message
};

// Function to initialize the logger with the Socket.IO instance
function initLogger(io) {
    if (!io) {
        console.warn("[Logger] Initialized without Socket.IO instance. Logs will only go to console.");
    }
    ioInstance = io;
    // Use the log function itself for this message (type SOCKET_INIT won't be emitted to UI)
    log(LOG_TYPES.SOCKET_INIT, "Logger initialized with Socket.IO.");
}

// Function to log messages
function log(type, message, data = null) {
    // Validate type
    if (!Object.values(LOG_TYPES).includes(type)) {
        console.warn(`[Logger] Invalid log type used: '${type}'. Defaulting to 'INFO'. Message: ${message}`);
        type = LOG_TYPES.INFO;
    }

    const timestamp = new Date();
    // Format timestamp for readability
    const formattedTimestamp = timestamp.toLocaleTimeString('en-IN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const logEntry = {
        timestamp: formattedTimestamp,
        type,
        message,
        data // Keep original data for console logging
    };

    // Log detailed info to server console
    let consoleMessage = `${type.toUpperCase()}: ${message}`;
    // Stringify data carefully for console, avoid excessive length
    if (data) {
        try {
            let dataString = JSON.stringify(data);
            if (dataString.length > 200) { // Limit length in console
                dataString = dataString.substring(0, 200) + '... }';
            }
            consoleMessage += ` (${dataString})`;
        } catch (e) {
            consoleMessage += ` (Unserializable data)`;
        }
    }
    console.log(`[${formattedTimestamp}] ${consoleMessage}`);

    // Emit only USER-related logs via Socket.IO
    if (ioInstance && type.startsWith('user_')) {
        // Prepare data specifically for the frontend log viewer
        let frontendData = {};
        if (data) { // Selectively include relevant data for UI
            if (data.key) frontendData.key = data.key;
            if (data.filename) frontendData.filename = data.filename;
            if (data.originalName) frontendData.filename = data.originalName; // Prefer originalName
            if (data.username) frontendData.username = data.username;
            if (data.receiver) frontendData.receiver = data.receiver;
            if (data.receiverName) frontendData.receiver = data.receiverName; // Prefer receiverName
            if (data.senderName) frontendData.sender = data.senderName;
            if (data.ip) frontendData.ip = data.ip; // Consider privacy implications of showing IP
            if (data.sessionId) frontendData.sessionId = data.sessionId.substring(0, 6)+'...'; // Shorten session ID for UI

            // --- ADDED: Include username and reason specifically for disconnect ---
            if (type === LOG_TYPES.USER_DISCONNECT) {
                 if (data.username) frontendData.username = data.username;
                 if (data.reason) frontendData.reason = data.reason;
            }
            // --- END ADDED ---

            // Avoid sending full error objects over socket if sensitive
            if (data.error && typeof data.error === 'string') frontendData.error = data.error;
            else if (data.error) frontendData.error = "Error occurred"; // Generic message for non-string errors
        }

        const frontendLogEntry = {
            timestamp: formattedTimestamp,
            type, // Send the specific type (e.g., 'user_upload')
            message,
            data: Object.keys(frontendData).length > 0 ? frontendData : null // Send null if no relevant data selected
        };
        // Emit only to admins if you implement rooms, otherwise global
        ioInstance.emit('serverLog', frontendLogEntry);
    }
}

// Export log types along with functions
module.exports = { initLogger, log, LOG_TYPES };