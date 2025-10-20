// backend/server.js
require('dotenv').config({ path: '.env' }); // Load .env from root
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const { setupSession } = require('./middleware/session');
const setupSecurityHeaders = require('./middleware/securityHeaders');
const attachDriveClient = require('./middleware/attachDriveClient');
const { handleMulterError, handleGenericError, handleNotFound } = require('./middleware/errorHandler');
const mainRouter = require('./routes'); // Main router from routes/index.js
const initSocketIO = require('./sockets'); // Socket.IO setup function
const cleanupUploadsOnStartup = require('./utils/cleanup'); // Assuming you move cleanup logic here
const { log } = require('./utils/logger')

// --- Initial Setup ---
cleanupUploadsOnStartup();
connectDB(); // Connect to MongoDB

const app = express();
const server = http.createServer(app);

// --- Core Middleware ---
app.use(cors()); // Enable CORS (adjust origin in production if needed)
setupSecurityHeaders(app); // Apply security headers
setupSession(app); // Setup cookies and sessions
app.use(express.json()); // Parse JSON bodies
app.use(express.static(path.join(__dirname, '../frontend'), { extensions: ["html"] })); // Serve frontend
app.use(attachDriveClient); // Make Drive client available in requests


// --- 🛡️ RATE LIMITING ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT, // Limit each IP to 100 requests per `windowMs`
    message: 'Too many requests from this IP, please try again after some time',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
// --- Routes ---
app.use('/', apiLimiter, mainRouter); // Use the main router

// --- Socket.IO ---
initSocketIO(server); // Initialize and attach Socket.IO

// --- Error Handling Middleware (Must be LAST) ---
app.use(handleMulterError); // Specific handler for Multer errors
app.use(handleNotFound);    // Handle 404s for API routes not matched
app.use(handleGenericError); // Generic error handler

// --- Start Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { // Listen on all interfaces
    console.log(`🚀 Backend server running at http://localhost:${PORT}`);
});