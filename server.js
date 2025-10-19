const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
require("dotenv").config(); // Ensure dotenv is loaded early
const { google } = require("googleapis");
const { Server } = require("socket.io");
const useragent = require('useragent');
const Activity = require('./models/activityModel'); //
const cors = require('cors');
const session = require('express-session'); // Added
const cookieParser = require('cookie-parser'); // Added

// --- Cleanup on Startup ---
function cleanupUploadsOnStartup() { //
    const uploadsDir = path.join(__dirname, 'uploads'); //
    if (fs.existsSync(uploadsDir)) { //
        fs.readdir(uploadsDir, (err, files) => { //
            if (err) return; //
            for (const file of files) { //
                fs.unlink(path.join(uploadsDir, file), () => {}); //
            }
        });
    }
}
cleanupUploadsOnStartup(); //

// --- Google OAuth Setup ---
const oAuth2Client = new google.auth.OAuth2( //
    process.env.GOOGLE_CLIENT_ID, //
    process.env.GOOGLE_CLIENT_SECRET, //
    process.env.GOOGLE_REDIRECT_URI //
);
oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN }); //

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI) //
    .then(() => console.log("✅ Successfully connected to MongoDB.")) //
    .catch(err => console.error("❌ MongoDB connection error:", err)); //

// --- Express App Setup ---
const app = express(); //
app.use(cors()); //


// Disable the 'X-Powered-By' header for security
app.disable('x-powered-by'); //

// Middleware to set security headers
app.use((req, res, next) => { //
    // Tells browsers to only connect to your site via HTTPS
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); //

    // Prevents clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); //

    // Prevents MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff'); //

    // Controls referrer information
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); //

    // Controls browser features access
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()'); //

    // FINAL Content Security Policy
    res.setHeader('Content-Security-Policy', //
        "default-src 'self'; " + //
        "script-src 'self' 'unsafe-inline' https://cdn.socket.io https://cdn.jsdelivr.net https://unpkg.com https://pagead2.googlesyndication.com https://ep2.adtrafficquality.google; " + //
        "style-src 'self' 'unsafe-inline'; " + //
        "img-src 'self' data: https://ep1.adtrafficquality.google; " + //
        // CORRECTED: Added Google's domain for network connections
        "connect-src 'self' https://ep1.adtrafficquality.google https://cdn.socket.io https://pagead2.googlesyndication.com; " + //
        "frame-src 'self' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://ep2.adtrafficquality.google https://www.google.com; " + //
        "form-action 'self';" //
    );

    next(); //
});

const server = http.createServer(app); //
const io = new Server(server); // Socket.IO is initialized here
app.set('trust proxy', 1); // <-- Trust the first proxy (like Render's)
const PORT = process.env.PORT || 3000; //

// --- Session Configuration ---
const sessionMiddleware = session({ //
    // Use a strong, randomly generated secret from your .env file
    secret: process.env.SESSION_SECRET || 'fallback-very-secret-key-replace-me', //
    resave: false, // Don't save session if unmodified
    saveUninitialized: true, // Save new sessions (needed for Socket.IO handshake)
    cookie: { //
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS)
        httpOnly: true, // Prevent client-side JS access
        maxAge: 24 * 60 * 60 * 1000 // e.g., 1 day validity
    }
    // Consider using a persistent store like connect-mongo for production
    // e.g., const MongoStore = require('connect-mongo');
    // store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI })
});

// --- Middleware ---
app.use(cookieParser()); // Use cookie-parser
app.use(sessionMiddleware); // Use express-session

app.use(express.static("public", { extensions: ["html"] })); // Serve static files
app.use(express.json()); // Parse JSON bodies

// Middleware to attach the Google client to each request
app.use((req, res, next) => { //
    req.oAuth2Client = oAuth2Client; //
    next(); //
});

// --- Socket.IO Integration ---
// Make Express session accessible to Socket.IO
io.use((socket, next) => { //
  sessionMiddleware(socket.request, {}, next); //
});

// --- Socket.IO for Real-time Tracking ---
let activeUsers = {}; // Keyed by server-generated session.id

// Helper function to format and emit user data
function emitActiveUsers() { //
    const usersForEmit = Object.values(activeUsers).map(user => { //
        // Find the most recently active connection for display purposes
        let latestConnection = null; //
        let latestSeen = 0; //
        for (const sockId in user.connections) { //
            if (user.connections[sockId].lastSeen > latestSeen) { //
                latestSeen = user.connections[sockId].lastSeen; //
                latestConnection = user.connections[sockId]; //
            }
        }

        // --- Aggregate ALL unique pages from active connections ---
        const activePagesString = Object.values(user.connections) //
                                .map(conn => conn.page) // Get all page names
                                .filter((page, index, self) => page && page !== 'Unknown' && self.indexOf(page) === index) // Filter unique, valid pages
                                .sort() // Optional: sort alphabetically for consistency
                                .join(', '); // Join with comma and space
        // --- End aggregation ---

        // Return user info merged with the latest connection details & aggregated pages
        return { //
            sessionId: user.sessionId, //
            ip: user.ip, //
            deviceName: user.deviceName, //
            deviceType: user.deviceType, //
            username: user.username, //
            // Use details from the latest connection for primary action display
            action: latestConnection ? latestConnection.action : 'Connected', // Show latest action
            // --- Assign the aggregated pages string to the 'page' field ---
            page: activePagesString || (latestConnection ? latestConnection.page : 'Unknown'), // Display all active pages in the 'page' field
            // --- End Change ---
            connectedAt: user.connectedAt, //
            tabCount: Object.keys(user.connections).length // Number of open tabs/connections
        };
    });

    const counts = { // Counts remain based on unique sessions
        total: Object.keys(activeUsers).length, //
        // This logic counts the session based on its *most recently active* tab's primary page.
        // If you need counts based on *any* tab being on a page, the logic would need adjustment.
        senders: usersForEmit.filter(u => u.page && u.page.toLowerCase().includes('sender')).length, //
        receivers: usersForEmit.filter(u => u.page && u.page.toLowerCase().includes('receiver')).length, //
    };
    io.emit('activeUsers', { users: usersForEmit, counts }); //
}

io.on('connection', (socket) => { //
    const session = socket.request.session; // Access the session object
    // Ensure session and session ID exist before proceeding
    if (!session || !session.id) { //
         console.error('Socket connected without a valid session. Disconnecting.'); //
         // Log headers for debugging if needed: console.log(socket.handshake.headers);
         return socket.disconnect(true); // Force disconnect
    }
    const sessionId = session.id;          // Use the server-generated session ID
    const socketId = socket.id;          // Current connection's unique ID

    const agent = useragent.parse(socket.handshake.headers['user-agent']); //
    const ip = socket.handshake.headers['true-client-ip'] || socket.handshake.headers['x-forwarded-for'] || socket.handshake.address; //
    const now = Date.now(); //

    // --- Initialize or find user session entry ---
    if (!activeUsers[sessionId]) { //
        activeUsers[sessionId] = { //
            sessionId: sessionId, //
            ip, //
            deviceName: `${agent.os.toString()} on ${agent.toAgent()}`, //
            deviceType: agent.device.toString(), //
            username: session.username || 'Unknown', // Use username from session if available
            connectedAt: now, //
            connections: {} // Object to store connections by socket.id
        };
        // console.log(`New session connected: ${sessionId}`);
    } else {
        // console.log(`Existing session reconnected: ${sessionId}`);
    }

    // Add this specific connection - initially with unknown page/action
    activeUsers[sessionId].connections[socketId] = { //
         page: 'Unknown', //
         action: 'Connected', //
         lastSeen: now //
    };
    // Update main user's last seen time as well
    activeUsers[sessionId].lastSeen = now; //


    socket.on('userUpdate', (data) => { //
        const { username, page, action } = data; // Destructure directly

        if (activeUsers[sessionId]) { //
            const currentUserData = activeUsers[sessionId]; //
            const currentConnectionData = currentUserData.connections[socketId]; //
            const updateTime = Date.now(); //

            // Update the main username if provided and different
            if (username && currentUserData.username !== username) { //
                 currentUserData.username = username; //
                 // Optionally: Store username in session for persistence across server restarts
                 // socket.request.session.username = username;
                 // socket.request.session.save((err) => { if (err) console.error("Session save error:", err); });
            }

            // --- Update the specific connection's details ---
            if (currentConnectionData) { //
                currentConnectionData.page = page || 'Unknown'; //
                currentConnectionData.action = action || 'Browsing'; //
                currentConnectionData.lastSeen = updateTime; //
                currentUserData.lastSeen = updateTime; // Update session's last seen too
            } else {
                 // Should not happen if connection logic is correct, but handle defensively
                 currentUserData.connections[socketId] = { page, action, lastSeen: updateTime }; //
                 currentUserData.lastSeen = updateTime; //
                 console.warn(`Received userUpdate for unknown socketId ${socketId} within session ${sessionId}. Added connection.`); //
            }

            // Log activity for this specific update/connection
            const activityLog = new Activity({ //
                socketId: socketId, //
                sessionId: sessionId, //
                ip: currentUserData.ip, //
                deviceName: currentUserData.deviceName, //
                deviceType: currentUserData.deviceType, //
                username: currentUserData.username, // Use the session's username
                page: page, // Log the current page from this update
                action: action, // Log the current action from this update
                timestamp: new Date(updateTime) //
            });
            // Don't await save to avoid blocking event loop
            activityLog.save().catch(err => console.error("Error saving activity log:", err)); //

        } else {
             console.warn(`Received userUpdate for unknown session: ${sessionId}`); //
        }
        emitActiveUsers(); // Emit updated state
    });

    socket.on('disconnect', (reason) => { //
         // console.log(`Socket disconnected: ${socketId}, Reason: ${reason}`);
         // --- Remove the specific connection ---
         if (sessionId && activeUsers[sessionId]) { //
             delete activeUsers[sessionId].connections[socketId]; // Remove this socket entry

             // --- If no connections left, remove the user session ---
             if (Object.keys(activeUsers[sessionId].connections).length === 0) { //
                 // console.log(`Session disconnected: ${sessionId}`);
                 delete activeUsers[sessionId]; //
             } else {
                 // Optional: Update session lastSeen based on remaining connections?
                 // Not strictly necessary as new connections/updates will refresh it.
             }
         } else {
             console.warn(`Disconnect event for unknown session or socket: ${sessionId} / ${socketId}`); //
         }
        emitActiveUsers(); // Emit updated state
    });

    // Emit state after initial connection established
    // console.log(`Socket connected: ${socketId} for session: ${sessionId}`);
    emitActiveUsers(); //
});

// --- Routes ---
const transferRoutes = require('./routes/transferRoutes'); //
app.use('/', transferRoutes); //

// --- Multer Error Handler ---
const multer = require('multer'); //
app.use((err, req, res, next) => { //
    if (err instanceof multer.MulterError) { //
        if (err.code === 'LIMIT_FILE_COUNT') { //
            return res.status(400).json({ error: `You can only upload a maximum of ${process.env.MAX_FILE_COUNT || 100} files at a time.` }); //
        }
        if (err.code === 'LIMIT_FILE_SIZE') { //
            return res.status(400).json({ error: `One of your files is larger than the ${process.env.MAX_FILE_SIZE_MB || 1024} MB limit.` }); //
        }
        // Handle other potential Multer errors if necessary
        console.error("Multer Error:", err); //
        return res.status(400).json({ error: `File upload error: ${err.message}`}); //
    } else if (err) { //
        // Handle other non-Multer errors
        console.error("Server Error:", err); //
        // Avoid sending detailed internal errors to the client in production
        const message = process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message; //
        const status = err.status || 500; //
        return res.status(status).json({ error: message }); //
    }
    // If no error, continue to the next middleware/handler
    next(); //
});

// --- 404 Handler ---
app.use((req, res, next) => { //
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html')); //
});

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => { //
    console.log(`🚀 Server running at http://localhost:${PORT}`); //
});