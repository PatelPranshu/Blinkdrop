// backend/middleware/session.js
const session = require('express-session');
const cookieParser = require('cookie-parser');
// const MongoStore = require('connect-mongo'); // Optional: For persistent store

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'fallback-very-secret-key-replace-me',
    resave: false,
    saveUninitialized: true, // Important for Socket.IO handshake
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    },
    // store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }) // Optional
});

const setupSession = (app) => {
    app.set('trust proxy', 1); // If behind a proxy like Render/Heroku
    app.use(cookieParser());
    app.use(sessionMiddleware);
};

module.exports = { setupSession, sessionMiddleware }; // Export both