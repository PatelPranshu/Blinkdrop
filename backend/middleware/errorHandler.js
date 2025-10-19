// backend/middleware/errorHandler.js
const multer = require('multer');
const path = require('path');

const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        let message = `File upload error: ${err.message}`;
        if (err.code === 'LIMIT_FILE_COUNT') {
            message = `You can only upload a maximum of ${process.env.MAX_FILE_COUNT || 100} files.`;
        } else if (err.code === 'LIMIT_FILE_SIZE') {
            message = `One file exceeds the ${process.env.MAX_FILE_SIZE_MB || 1024} MB limit.`;
        }
        console.error("Multer Error:", err.code, err.field);
        return res.status(400).json({ error: message });
    }
    next(err); // Pass on to the next error handler if not a Multer error
};

const handleGenericError = (err, req, res, next) => {
    console.error("Server Error:", err.stack || err); // Log the full error stack
    const status = err.status || 500;
    const message = process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message;
    res.status(status).json({ error: message });
};

const handleNotFound = (req, res, next) => {
    // Correct path to frontend 404 page
    res.status(404).sendFile(path.join(__dirname, '../../frontend', '404.html'));
};

module.exports = { handleMulterError, handleGenericError, handleNotFound };