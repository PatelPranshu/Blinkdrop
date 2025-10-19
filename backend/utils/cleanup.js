// backend/utils/cleanup.js
const fs = require('fs');
const path = require('path');
const { log, LOG_TYPES } = require('./logger');

// Cleans up any leftover files in the uploads directory on server start
function cleanupUploadsOnStartup() {
    // Path relative to this file (utils/cleanup.js -> backend -> uploads)
    const uploadsDir = path.join(__dirname, '../../uploads');
    console.log(`🧹 Checking for leftover files in: ${uploadsDir}`);
    log(LOG_TYPES.CLEANUP, `Checking for leftover files in: ${uploadsDir}`);

    if (fs.existsSync(uploadsDir)) {
        fs.readdir(uploadsDir, (err, files) => {
            if (err) {
                console.error("❌ Error reading uploads directory for cleanup:", err);
                log(LOG_TYPES.ERROR, "Error reading uploads directory for cleanup", { error: err.message });
                return;
            }
            if (files.length === 0) {
                console.log("✨ Uploads directory is already clean.");
                log(LOG_TYPES.INFO, "Uploads directory is already clean.");
                return;
            }
            console.log(`🧹 Found ${files.length} leftover file(s). Cleaning up...`);
            log(LOG_TYPES.CLEANUP, `Found ${files.length} leftover file(s). Cleaning up...`);
            let cleanedCount = 0;
            let errorCount = 0;
            files.forEach((file, index) => {
                fs.unlink(path.join(uploadsDir, file), (unlinkErr) => {
                    if (unlinkErr) {
                        console.error(`❌ Error deleting leftover file ${file}:`, unlinkErr);
                        log(LOG_TYPES.ERROR, `Error deleting leftover file '${file}'`, { error: unlinkErr.message });
                        errorCount++;
                    } else {
                        cleanedCount++;
                    }
                    // Log summary after attempting all deletions
                    if (index === files.length - 1) {
                        console.log(`🧹 Cleanup complete: ${cleanedCount} file(s) deleted, ${errorCount} error(s).`);
                        log(LOG_TYPES.CLEANUP, `Cleanup complete`, { deleted: cleanedCount, errors: errorCount });
                    }
                });
            });
        });
    } else {
        console.log("✨ Uploads directory not found, skipping cleanup.");
        log(LOG_TYPES.INFO, "Uploads directory not found, skipping cleanup.");
    }
}

module.exports = cleanupUploadsOnStartup; // Export the function