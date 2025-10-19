const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const validateInput = require('../middleware/validation'); // For login validation if needed

// --- Admin Routes ---
// These routes should ideally be protected further (e.g., IP restriction, dedicated admin path)

// POST /admin/login - Authenticates the admin user
router.post(
    "/login",
    validateInput, // Validate username/password format if desired
    adminController.adminLogin
);

// --- Protected Admin Routes ---
// Apply authentication middleware to all subsequent routes in this file
router.use(adminController.isAdminAuthenticated); // Middleware check for admin session

// GET /admin/sessions - Retrieves all active transfer sessions
router.get(
    "/sessions",
    adminController.getAdminSessions
);

// POST /admin/delete-all-uploads - Deletes all transfers and associated files
router.post(
    "/delete-all-uploads",
    adminController.deleteAllUploads
);

// GET /admin/search - Searches transfers based on query parameters
router.get(
    "/search", // Query param 'query' expected, e.g., /admin/search?query=ABC
    adminController.searchTransfers
);

// GET /admin/stats - Retrieves usage statistics
router.get(
    "/stats",
    adminController.getStats
);


module.exports = router;