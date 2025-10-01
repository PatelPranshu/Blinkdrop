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
const server = http.createServer(app);
const io = new Server(server); // Socket.IO is initialized here
app.set('trust proxy', 1); // <-- FIX #1: Trust the first proxy (like Render's)
const PORT = process.env.PORT || 3000;

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

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});