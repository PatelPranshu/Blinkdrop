// backend/sockets/userTracking.js
const useragent = require('useragent');
const Activity = require('../models/activityModel'); // Use correct filename
const { log, LOG_TYPES } = require('../utils/logger'); // Import log and LOG_TYPES

let activeUsers = {}; // In-memory store: Keyed by server-generated session.id

// Helper function to prepare and emit user data
function emitActiveUsers(io) { // Pass io instance
    // Map activeUsers object to an array format suitable for emission
    const usersForEmit = Object.values(activeUsers).map(user => {
        // Find the most recently active connection for display purposes
        let latestConnection = null;
        let latestSeen = 0;
        for (const sockId in user.connections) {
            if (user.connections[sockId].lastSeen > latestSeen) {
                latestSeen = user.connections[sockId].lastSeen;
                latestConnection = user.connections[sockId];
            }
        }

        // Aggregate unique pages from all active connections for this session
        const activePagesString = Object.values(user.connections)
            .map(conn => conn.page)
            .filter((page, index, self) => page && page !== 'Unknown' && self.indexOf(page) === index) // Unique, valid pages
            .sort()
            .join(', ');

        return {
            sessionId: user.sessionId,
            ip: user.ip,
            deviceName: user.deviceName,
            deviceType: user.deviceType,
            username: user.username,
            // Display details from the latest connection primarily
            action: latestConnection ? latestConnection.action : 'Connected',
            page: activePagesString || (latestConnection ? latestConnection.page : 'Unknown'), // Show aggregated pages
            connectedAt: user.connectedAt,
            tabCount: Object.keys(user.connections).length // Number of tabs/connections
        };
    });

    // Calculate counts based on the most recent primary page (can be adjusted)
    const counts = {
        total: Object.keys(activeUsers).length,
        senders: usersForEmit.filter(u => u.page && u.page.toLowerCase().includes('sender')).length,
        receivers: usersForEmit.filter(u => u.page && u.page.toLowerCase().includes('receiver')).length,
    };

    // Emit to all connected clients (specifically, the admin panel)
    io.emit('activeUsers', { users: usersForEmit, counts });
}

// Function to set up Socket.IO connection handling
const setupUserTracking = (io) => { // Accept io instance
    io.on('connection', (socket) => {
        const session = socket.request.session;

        // Disconnect if session is invalid
        if (!session || !session.id) {
            log(LOG_TYPES.WARN, 'Socket connected without a valid session ID. Disconnecting.'); // Use WARN
            return socket.disconnect(true);
        }

        const sessionId = session.id;
        const socketId = socket.id;
        const now = Date.now();

        // --- User Agent and IP ---
        const agent = useragent.parse(socket.handshake.headers['user-agent'] || '');
        // Prioritize specific headers if behind proxy, fall back to default address
        const ip = socket.handshake.headers['true-client-ip']
                   || socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() // Get first IP if multiple
                   || socket.handshake.address;

        // --- Initialize or find user session entry ---
        if (!activeUsers[sessionId]) {
            const newUsername = session.username || 'Anonymous'; // Get the username first
            activeUsers[sessionId] = {
                sessionId: sessionId,
                ip,
                deviceName: `${agent.os.toString()} on ${agent.toAgent()}`,
                deviceType: agent.device.toString(),
                username: newUsername, // Use the variable here
                connectedAt: now,
                connections: {} // Store individual socket connections
            };
            // Log user connection
            log(LOG_TYPES.USER_CONNECT, `New session connected: ${sessionId.substring(0, 6)}...`, { 
                ip: ip, 
                sessionId: sessionId, 
                username: newUsername // <-- Add the username to the data object
            });
        } else {
             // Update IP/device info if it changed
             activeUsers[sessionId].ip = ip;
             activeUsers[sessionId].deviceName = `${agent.os.toString()} on ${agent.toAgent()}`;
             activeUsers[sessionId].deviceType = agent.device.toString();
             // Log reconnection if needed, maybe as INFO
             // log(LOG_TYPES.INFO, `Existing session reconnected: ${sessionId.substring(0, 6)}...`);
        }

        // --- Add this specific connection ---
        activeUsers[sessionId].connections[socketId] = {
            page: 'Unknown',
            action: 'Connected',
            lastSeen: now
        };
        activeUsers[sessionId].lastSeen = now; // Update session's last seen time

        // --- Event Listener: 'userUpdate' ---
        socket.on('userUpdate', (data) => {
            const { username, page, action } = data || {}; // Default to empty object

            if (activeUsers[sessionId]) {
                const currentUserData = activeUsers[sessionId];
                const currentConnectionData = currentUserData.connections[socketId];
                const updateTime = Date.now();

                // Update username for the session if provided and different
                if (username && currentUserData.username !== username) {
                    currentUserData.username = username;
                    // Persist username in session if desired
                    socket.request.session.username = username;
                    socket.request.session.save(); // Requires async handling or callback
                }

                // Update details for this specific socket connection
                if (currentConnectionData) {
                    currentConnectionData.page = page || 'Unknown';
                    currentConnectionData.action = action || 'Browsing';
                    currentConnectionData.lastSeen = updateTime;
                    currentUserData.lastSeen = updateTime; // Also update overall session last seen
                } else {
                     log(LOG_TYPES.WARN, `Received userUpdate for unknown socket in session`, { socketId: socketId, sessionId: sessionId });
                     // Re-add defensively
                     currentUserData.connections[socketId] = { page, action, lastSeen: updateTime };
                     currentUserData.lastSeen = updateTime;
                }

                // --- Log Activity to Database ---
                const activityLog = new Activity({
                    socketId: socketId,
                    sessionId: sessionId,
                    ip: currentUserData.ip,
                    deviceName: currentUserData.deviceName,
                    deviceType: currentUserData.deviceType,
                    username: currentUserData.username, // Use the potentially updated username
                    page: page,
                    action: action,
                    timestamp: new Date(updateTime)
                });
                // Log DB errors using the logger
                activityLog.save().catch(err => log(LOG_TYPES.ERROR, "Error saving activity log", { error: err.message, sessionId: sessionId }));
                // --- End Logging ---

            } else {
                // This shouldn't happen if session check on connection works
                log(LOG_TYPES.WARN, `Received userUpdate for unknown session`, { sessionId: sessionId });
            }
            emitActiveUsers(io); // Emit updated list after handling update
        });

        // --- Event Listener: 'disconnect' ---
        socket.on('disconnect', (reason) => {
            if (activeUsers[sessionId]) {
                 // --- FIX: Capture username *before* deleting the session ---
                 const username = activeUsers[sessionId].username || 'Unknown';

                delete activeUsers[sessionId].connections[socketId]; // Remove this specific connection

                if (Object.keys(activeUsers[sessionId].connections).length === 0) {
                    log(LOG_TYPES.USER_DISCONNECT, `Session disconnected: ${sessionId.substring(0, 6)}...`, {
                        reason: reason,
                        username: username, // Pass the captured username
                        sessionId: sessionId
                    });
                    delete activeUsers[sessionId]; // Now delete the session
                }
            } else {
                 log(LOG_TYPES.WARN, `Disconnect for unknown session/socket`, { sessionId: sessionId, socketId: socketId });
            }
            emitActiveUsers(io);
        });

        // Initial emit for the newly connected client and others
        emitActiveUsers(io);
    });

    // --- Optional: Periodic Cleanup for Stale Sessions ---
    setInterval(() => {
        const now = Date.now();
        const staleTimeout = 5 * 60 * 1000; // 5 minutes inactivity
        let cleanedCount = 0;
        for (const sessionId in activeUsers) {
            // Check overall session lastSeen
            if (now - (activeUsers[sessionId].lastSeen || 0) > staleTimeout) {
                log(LOG_TYPES.CLEANUP, `Cleaning stale session: ${sessionId.substring(0, 6)}...`, { sessionId: sessionId }); // Use CLEANUP type
                delete activeUsers[sessionId];
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            emitActiveUsers(io); // Update list if any sessions were cleaned
        }
    }, 60 * 1000); // Run cleanup check every minute

}; // End setupUserTracking function

module.exports = setupUserTracking; // Export the setup function