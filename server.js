const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
require("dotenv").config();
const { google } = require("googleapis");
const { Server } = require("socket.io");
const useragent = require('useragent');
const Activity = require('./models/activityModel');
const cors = require('cors'); 

// --- Cleanup on Startup ---
function cleanupUploadsOnStartup() {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (fs.existsSync(uploadsDir)) {
        fs.readdir(uploadsDir, (err, files) => {
            if (err) return;
            for (const file of files) {
                fs.unlink(path.join(uploadsDir, file), () => {});
            }
        });
    }
}
cleanupUploadsOnStartup();

// --- Google OAuth Setup ---
const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ Successfully connected to MongoDB."))
    .catch(err => console.error("❌ MongoDB connection error:", err));

// --- Express App Setup ---
const app = express();
app.use(cors());


// Disable the 'X-Powered-By' header for security
app.disable('x-powered-by');

// Middleware to set security headers
app.use((req, res, next) => {
    // Tells browsers to only connect to your site via HTTPS
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // Prevents clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // Prevents MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Controls referrer information
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Controls browser features access
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');

    // FINAL Content Security Policy
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://cdn.socket.io https://cdn.jsdelivr.net https://unpkg.com https://pagead2.googlesyndication.com https://ep2.adtrafficquality.google; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https://ep1.adtrafficquality.google; " +
        // CORRECTED: Added Google's domain for network connections
        "connect-src 'self' https://ep1.adtrafficquality.google https://cdn.socket.io https://pagead2.googlesyndication.com; " + 
        "frame-src 'self' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://ep2.adtrafficquality.google https://www.google.com; " + 
        "form-action 'self';"
    );

    next();
});



const server = http.createServer(app);
const io = new Server(server); // Socket.IO is initialized here
app.set('trust proxy', 1); // <-- FIX #1: Trust the first proxy (like Render's)
const PORT = process.env.PORT || 3000;
console.log("APK URL from .env:", process.env.GOOGLE_DRIVE_APK_URL); 
// --- Middleware ---
app.use(express.static("public", { extensions: ["html"] }));
app.use(express.json());

// Middleware to attach the Google client to each request
app.use((req, res, next) => {
    req.oAuth2Client = oAuth2Client;
    next();
});





// --- Socket.IO for Real-time Tracking ---
let activeUsers = {};

// Helper function to calculate and emit user counts
function emitActiveUsers() {
    const users = Object.values(activeUsers);
    const counts = {
        total: users.length,
        senders: users.filter(u => u.page.includes('sender')).length,
        receivers: users.filter(u => u.page.includes('receiver')).length,
    };
    io.emit('activeUsers', { users, counts });
}


io.on('connection', (socket) => {
    const agent = useragent.parse(socket.handshake.headers['user-agent']);
    
    // Correctly get the IP address from behind Render's proxy
    const ip = socket.handshake.headers['true-client-ip'] || socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    activeUsers[socket.id] = {
        ip,
        deviceName: `${agent.os.toString()} on ${agent.toAgent()}`,
        deviceType: agent.device.toString(),
        page: 'Unknown',
        action: 'Connected',
        username: 'Unknown'
    };

    socket.on('userUpdate', (data) => {
        if (activeUsers[socket.id]) {
            activeUsers[socket.id] = { ...activeUsers[socket.id], ...data };
            
            const activityLog = new Activity({
                socketId: socket.id,
                ...activeUsers[socket.id]
            });
            activityLog.save();
        }
        emitActiveUsers();
    });

    socket.on('disconnect', () => {
        delete activeUsers[socket.id];
        emitActiveUsers();
    });
    
    emitActiveUsers();
});


// --- Routes ---
const transferRoutes = require('./routes/transferRoutes');
app.use('/', transferRoutes);
// You can keep your /auth and /oauth2callback routes here as they are setup-related
// app.get("/auth", ...);
// app.get("/oauth2callback", ...);


// --- Multer Error Handler ---
const multer = require('multer');
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: `You can only upload a maximum of ${process.env.MAX_FILE_COUNT || 100} files at a time.` });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: `One of your files is larger than the ${process.env.MAX_FILE_SIZE_MB || 1024} MB limit.` });
        }
    }
    // If it's not a Multer error, pass it on
    next(err);
});


// --- 404 Handler ---
app.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});
// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});