const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transferController');
const validateInput = require('../middleware/validation');
const upload = require('../middleware/multer');

const maxFileCount = parseInt(process.env.MAX_FILE_COUNT) || 100;

// --- Main Routes ---
router.get("/config", transferController.getAppConfig);
router.get("/api/apk-url", transferController.getApkUrl);
router.post("/upload", upload.array("files", maxFileCount), validateInput, transferController.uploadFiles);
router.post("/file-info/:key", validateInput, transferController.getFileInfo);
router.post("/approve", validateInput, transferController.approveReceiver);
router.get("/download/:key/:index/:receiverName", validateInput, transferController.downloadFile);

// --- Admin Routes ---
router.post("/admin/login", validateInput, transferController.adminLogin);
router.get("/admin/sessions", transferController.getAdminSessions);
router.post("/admin/delete-all-uploads", transferController.deleteAllUploads);

module.exports = router;