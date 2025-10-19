const express = require('express');
const router = express.Router();
const miscController = require('../controllers/miscController');

// --- Miscellaneous Routes ---

// GET /config - Provides frontend with application configuration (e.g., file limits)
router.get("/config", miscController.getAppConfig);

// GET /api/apk-url - Retrieves the download URL for the latest Android APK
router.get("/api/apk-url", miscController.getApkUrl);

// You could add other general utility routes here if needed

module.exports = router;