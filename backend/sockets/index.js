// backend/sockets/index.js
const { Server } = require('socket.io');
const { sessionMiddleware } = require('../middleware/session'); // Import only the middleware
const setupUserTracking = require('./userTracking');
const { initLogger } = require('../utils/logger');

const initSocketIO = (server) => {
    const io = new Server(server, {
        // Optional: Add CORS configuration if frontend and backend are on different origins during development
        // cors: {
        //   origin: "http://localhost:8080", // Your frontend dev server
        //   methods: ["GET", "POST"],
        //   credentials: true
        // }
    });

    // Make Express session accessible to Socket.IO
    io.use((socket, next) => {
        sessionMiddleware(socket.request, {}, next);
    });


    // Initialize the logger WITH the io instance
    initLogger(io);

    // Setup the user tracking logic
    setupUserTracking(io);

    // console.log("🔌 Socket.IO initialized and listening.");
    return io; // Return the instance if needed elsewhere
};

module.exports = initSocketIO;