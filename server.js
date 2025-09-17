const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
require("dotenv").config();
const { google } = require("googleapis");

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
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.static("public", { extensions: ["html"] }));
app.use(express.json());

// Middleware to attach the Google client to each request
app.use((req, res, next) => {
    req.oAuth2Client = oAuth2Client;
    next();
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