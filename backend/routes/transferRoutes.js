const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transferController');
const validateInput = require('../middleware/validation'); // Assuming validation middleware exists
const upload = require('../middleware/multer'); // Assuming multer middleware exists

// --- Constants ---
// Read from env with fallback, ensure it's a number
const maxFileCount = parseInt(process.env.MAX_FILE_COUNT, 10) || 100;
if (isNaN(maxFileCount) || maxFileCount <= 0) {
     console.warn("Invalid MAX_FILE_COUNT, defaulting to 100.");
     maxFileCount = 100;
}


// --- File Transfer Routes ---

// POST /upload - Handles file uploads
// - `upload.array`: Middleware for handling multipart/form-data, expects 'files' field, limits count.
// - `validateInput`: Custom middleware to sanitize/validate other form fields like names.
router.post(
    "/upload",
    upload.array("files", maxFileCount), // Apply multer middleware first
    validateInput,                       // Then validate text inputs
    transferController.uploadFiles
);

// POST /file-info/:key - Retrieves file details for a given key, identifies receiver
// - `validateInput`: Validates 'key' in params and 'receiverName' in body.
router.post(
    "/file-info/:key",
    validateInput,
    transferController.getFileInfo
);

// POST /approve - Allows sender to approve a receiver's download request
// - `validateInput`: Validates 'key' and 'receiverName' in the body.
router.post(
    "/approve",
    validateInput,
    transferController.approveReceiver
);

// GET /download/:key/:index/:receiverName - Handles download of a single file
// - `validateInput`: Validates 'key', 'index', and 'receiverName' from URL params.
router.get(
    "/download/:key/:index/:receiverName",
    validateInput,
    transferController.downloadFile
);

// GET /download-all/:key/:receiverName - Handles download of all files as a zip archive
// - `validateInput`: Validates 'key' and 'receiverName' from URL params.
router.get(
    "/download-all/:key/:receiverName",
    validateInput,
    transferController.downloadAllFiles
);

module.exports = router;