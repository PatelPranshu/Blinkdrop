// backend/services/driveService.js
const { google } = require('googleapis');
const fs = require('fs');
const { log, LOG_TYPES } = require('../utils/logger');

async function createDriveFolder(folderName, oAuth2Client) {
    const drive = google.drive({ version: "v3", auth: oAuth2Client });
    const fileMetadata = {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [process.env.GDRIVE_FOLDER_ID] // Ensure this is in .env
    };
    try {
        log(LOG_TYPES.DRIVE_ACTION, `Attempting to create Drive folder '${folderName}'...`);
        const file = await drive.files.create({
            resource: fileMetadata,
            fields: "id"
        });
        console.log(`✅ Folder created with ID: ${file.data.id}`);
        log(LOG_TYPES.DRIVE_ACTION, `Folder created successfully`, { folderName: folderName, folderId: file.data.id });
        return file.data.id;
    } catch (error) {
        console.error(`❌ Failed to create Drive folder '${folderName}':`, error.message);
        log(LOG_TYPES.ERROR, `Failed to create Drive folder '${folderName}'`, { error: error.message });
        throw new Error('Could not create storage folder.'); // User-friendly error
    }
}

async function uploadToDrive(filePath, originalName, parentFolderId, oAuth2Client) {
    const drive = google.drive({ version: "v3", auth: oAuth2Client });
    const fileMetadata = {
        name: originalName, // Already sanitized in controller
        parents: [parentFolderId]
    };
    const media = {
         // You might want to detect mime type dynamically if possible,
         // but octet-stream is a safe default for encrypted data.
        mimeType: "application/octet-stream",
        body: fs.createReadStream(filePath)
    };
    try {
        log(LOG_TYPES.DRIVE_ACTION, `Attempting to upload '${originalName}' to Drive folder ${parentFolderId}...`);
        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: "id, name, size" // Size here will be encrypted size
        });
        console.log(`☁️ Uploaded '${originalName}' to Drive, ID: ${file.data.id}`);
        log(LOG_TYPES.DRIVE_ACTION, `Uploaded '${originalName}' successfully`, { fileId: file.data.id, driveSize: file.data.size });
        return file.data; // Return the full file data object
    } catch (error) {
        console.error(`❌ Failed to upload '${originalName}' to Drive:`, error.message);
        log(LOG_TYPES.ERROR, `Failed to upload '${originalName}' to Drive`, { error: error.message, parentFolderId: parentFolderId });
        // Attempt to clean up the partially created file if possible? Maybe not feasible easily.
        throw new Error(`Failed to upload file ${originalName}.`); // More specific error
    }
}

 async function deleteDriveFolder(folderId, oAuth2Client) {
     const drive = google.drive({ version: "v3", auth: oAuth2Client });
     try {
         log(LOG_TYPES.DRIVE_ACTION, `Attempting to delete Drive folder ${folderId}...`);
         await drive.files.delete({ fileId: folderId });
         console.log(`🗑️ Deleted folder from Drive: ${folderId}`);
         log(LOG_TYPES.DRIVE_ACTION, `Deleted folder from Drive`, { folderId: folderId });
         return true;
     } catch (err) {
          // Handle common errors like 'notFound' gracefully
          if (err.code === 404) {
               console.warn(`Folder ${folderId} not found in Drive, maybe already deleted.`);
               log(LOG_TYPES.WARN, `Folder not found in Drive, skipping delete`, { folderId: folderId });
               return false; // Indicate not found
          }
         console.error(`❌ Failed to delete folder ${folderId}:`, err.message);
         log(LOG_TYPES.ERROR, `Failed to delete folder ${folderId}`, { error: err.message });
         // Don't throw here, allow the DB cleanup to proceed if possible
         return false; // Indicate failure
     }
 }

 async function getDriveFileStream(fileId, oAuth2Client) {
     const drive = google.drive({ version: "v3", auth: oAuth2Client });
     try {
        // Log attempt without sensitive data if needed, or rely on success/error logs
         log(LOG_TYPES.DRIVE_ACTION, `Attempting to get file stream for ID ${fileId}...`);
         const response = await drive.files.get(
             { fileId: fileId, alt: 'media' },
             { responseType: 'stream' }
         );
         log(LOG_TYPES.DRIVE_ACTION, `Successfully obtained file stream`, { fileId: fileId }); // Maybe too verbose
         return response.data; // This is the readable stream
     } catch (error) {
         console.error(`❌ Failed to get file stream for ID ${fileId}:`, error.message);
          if (error.code === 404) {
               throw new Error('File not found in storage.');
          }
         throw new Error('Could not retrieve file from storage.');
     }
 }


module.exports = { createDriveFolder, uploadToDrive, deleteDriveFolder, getDriveFileStream };