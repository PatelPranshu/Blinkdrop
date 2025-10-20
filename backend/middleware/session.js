// backend/middleware/session.js

const session = require('express-session');
const cookieParser = require('cookie-parser');
const MongoStore = require('connect-mongo');
const dotenv = require('dotenv');

dotenv.config(); // Load environment variables like MONGODB_URI and SESSION_SECRET

// --- MongoDB Store Setup ---
// Check if MONGODB_URI is loaded correctly
if (!process.env.MONGODB_URI) {
  console.error("Error: MONGODB_URI environment variable is not set.");
  // Optional: throw an error or exit if MONGODB_URI is essential for startup
  // throw new Error("MONGODB_URI environment variable is required.");
} else {
  console.log('MONGODB_URI found, initializing MongoStore...');
}

const mongoStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI, // Use your MongoDB connection string from environment variables
  collectionName: 'sessions',      // Optional: Name for the sessions collection in MongoDB
  ttl: 60 * 60 * 24 * 7,           // Optional: Session time-to-live in seconds (e.g., 7 days)
  autoRemove: 'interval',          // Optional: How expired sessions are removed ('native', 'interval', 'disabled')
  autoRemoveInterval: 10,          // Optional: Interval in minutes for session removal (if autoRemove is 'interval')
  // Add mongoOptions if needed, e.g., for specific Write Concerns or Read Preferences, but often defaults are fine.
  // mongoOptions: { useUnifiedTopology: true } // Example, check connect-mongo docs if needed
});

mongoStore.on('create', () => {
  console.log('Session store connection created.');
});
mongoStore.on('error', (error) => {
  console.error('Session store error:', error);
});
console.log('MongoStore setup initiated.');

// --- Session Middleware Configuration ---
const oneDay = 24 * 60 * 60 * 1000;
const sessionMiddleware = session({
  store: mongoStore, // Use the MongoStore instance
  secret: process.env.SESSION_SECRET || 'fallback-very-secret-key-replace-me', // **Ensure SESSION_SECRET is set in Render**
  resave: false, // Don't save session if unmodified
  saveUninitialized: true, // Set based on your app's needs (true was in your original code)
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (requires HTTPS)
    httpOnly: true, // Prevent client-side JS access
    maxAge: oneDay, // Example: 1 day (matches your original code)
    sameSite: 'lax' // Good default for security
  }
});

console.log('Session middleware configured with MongoStore.');

// --- Setup Function ---
// This function applies the cookie parser and session middleware to the app
const setupSession = (app) => {
  // Trust the first proxy (like Render's load balancer) for secure cookies
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
    console.log('Setting "trust proxy" to 1 for production environment.');
  } else {
    console.log('Not setting "trust proxy" (NODE_ENV is not "production").');
  }

  app.use(cookieParser()); // Use cookie-parser before session middleware
  app.use(sessionMiddleware); // Use the configured session middleware
  console.log('CookieParser and Session Middleware applied to the app.');
};

// Export both the setup function and the middleware itself
module.exports = { setupSession, sessionMiddleware };