// backend/utils/logger.js
let ioInstance = null;

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
    const formattedTimestamp = timestamp.toLocaleTimeString('en-IN', { hour12: false });
    const logEntry = {
        timestamp: formattedTimestamp,
        type,
        message,
        data // Keep original data for console logging
    };

    // Log detailed info to server console
    let consoleMessage = `${type.toUpperCase()}: ${message}`;
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
    // Emit only USER-related logs via Socket.IO
    if (ioInstance && type.startsWith('user_')) {
        
        // --- REMOVED all the 'frontendData' filtering logic ---

        const frontendLogEntry = {
            timestamp: formattedTimestamp,
            type,
            message,
            data: data // <-- FIX: Send the original, raw 'data' object
        };
        ioInstance.emit('serverLog', frontendLogEntry);
    }
}

// Export log types along with functions
module.exports = { initLogger, log, LOG_TYPES };