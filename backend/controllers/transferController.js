// backend/controllers/transferController.js
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const Transfer = require('../models/transferModel'); // Using original filename
const Download = require('../models/downloadModel'); // Using original filename
const { generateUniqueKey, approveReceiverLogic, getTransferInfoLogic } = require('../services/transferService');
const { createDriveFolder, uploadToDrive, getDriveFileStream } = require('../services/driveService');
const cryptoService = require('../services/cryptoService'); // Correctly required
const { log, LOG_TYPES } = require('../utils/logger'); // Import logger

// Handles file uploads, encryption, and Drive storage
exports.uploadFiles = async (req, res, next) => {
    let key; // Define key early for logging context
    try {
        const { senderName, approveAll } = req.body;
        key = await generateUniqueKey(); // Assign key here

        if (!req.files || req.files.length === 0) {
            return next({ status: 400, message: "No files were uploaded." });
        }

        const senderFolderId = await createDriveFolder(key, req.oAuth2Client);

        const uploadedFilesInfo = [];
        const responseFilesInfo = [];

        for (const f of req.files) {
            let encryptedFilePath = null;
            // Use f.originalname directly here, sanitization happens in uploadToDrive if needed
            let originalName = f.originalname;
            try {
                // Assuming encryptFile uses the key directly as password/secret
                encryptedFilePath = await cryptoService.encryptFile(f.path, key);
                const gfileData = await uploadToDrive(encryptedFilePath, originalName, senderFolderId, req.oAuth2Client);

                uploadedFilesInfo.push({
                    id: gfileData.id,
                    originalName: gfileData.name, // Use the name returned by Drive (potentially sanitized)
                    size: f.size // ORIGINAL size
                });
                 responseFilesInfo.push({
                     originalName: gfileData.name, // Use the name returned by Drive
                     size: f.size
                 });

            } finally {
                // Cleanup local files
                if (f.path && fs.existsSync(f.path)) {
                    fs.unlink(f.path, (err) => {
                         if (err) log(LOG_TYPES.ERROR, `Error deleting original file ${f.path}`, { error: err.message });
                    });
                }
                if (encryptedFilePath && fs.existsSync(encryptedFilePath)) {
                    fs.unlink(encryptedFilePath, (err) => {
                        if (err) log(LOG_TYPES.ERROR, `Error deleting encrypted file ${encryptedFilePath}`, { error: err.message });
                    });
                }
            }
        }

        const newTransfer = new Transfer({
            key,
            senderName,
            files: uploadedFilesInfo,
            isPublic: approveAll === "true",
            driveFolderId: senderFolderId
        });
        await newTransfer.save();

        log(LOG_TYPES.USER_UPLOAD, `Upload complete`, { key: key, sender: senderName, fileCount: req.files.length, isPublic: approveAll === "true" });

        res.status(201).json({
            key,
            files: responseFilesInfo
        });

    } catch (err) {
        log(LOG_TYPES.ERROR, `Upload Error`, { key: key || 'N/A', sender: req.body?.senderName, error: err.message });
        next(err || { status: 500, message: "File upload failed due to an internal error." });
    }
};

// Gets file information for a receiver, handles approval logic via service
exports.getFileInfo = async (req, res, next) => {
    const { key } = req.params;
    const { receiverName } = req.body;
    try {
        const result = await getTransferInfoLogic(key, receiverName);
        res.status(result.status).json(result.data);
    } catch (err) {
        log(LOG_TYPES.ERROR, `Get File Info Error`, { key: key, receiver: receiverName, error: err.message });
        next(err || { status: 500, message: "Could not retrieve file information." });
    }
};

// Approves a receiver via the transfer service
exports.approveReceiver = async (req, res, next) => {
    const { key, receiverName } = req.body;
    try {
        const result = await approveReceiverLogic(key, receiverName);
        if (result.success && result.message === "Receiver approved") {
             log(LOG_TYPES.USER_APPROVE, `Approved receiver '${receiverName}'`, { key: key });
        }
        res.status(result.status).json({ success: result.success, message: result.message });
    } catch (err) {
        log(LOG_TYPES.ERROR, `Approve Receiver Error`, { key: key, receiver: receiverName, error: err.message });
        next(err || { status: 500, message: "Approval failed due to an internal error." });
    }
};

// Handles single file download and decryption
exports.downloadFile = async (req, res, next) => {
    const { key, index, receiverName } = req.params;
    let downloadLogEntry;
    let file;
    try {
        const transfer = await Transfer.findOne({ key });

        if (!transfer) return next({ status: 404, message: "Invalid key." });
        if (!transfer.isPublic && !transfer.approvedReceivers.includes(receiverName)) {
            return next({ status: 403, message: "Not authorized to download." });
        }

        const fileIndex = parseInt(index, 10);
        if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= transfer.files.length) {
             return next({ status: 404, message: "File index out of bounds." });
        }

        file = transfer.files[fileIndex];
        if (!file || !file.id || !file.originalName) {
            return next({ status: 404, message: "File metadata not found or invalid." });
        }

        log(LOG_TYPES.USER_DOWNLOAD, `Download initiated for '${file.originalName}'`, { key: key, receiver: receiverName, index: fileIndex});

        downloadLogEntry = new Download({
             key: key,
             fileIndex: fileIndex,
             fileName: file.originalName,
             fileSize: file.size,
             downloaderName: receiverName,
             ip: req.ip || req.connection?.remoteAddress
        });

        // --- Updated Decryption Logic ---
        const driveStream = await getDriveFileStream(file.id, req.oAuth2Client);
        const decryptionTransform = cryptoService.createDecryptionTransform(key); // Use the correct function

        res.setHeader('Content-Length', file.size); // Set header based on original file size
        res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);

        // Pipe Drive stream -> Decryption -> Response
        const decryptedStream = driveStream.pipe(decryptionTransform);

        decryptedStream.pipe(res);

        // Error Handling for Drive Stream
        driveStream.on('error', (driveError) => {
            log(LOG_TYPES.ERROR, `Drive stream error for '${file.originalName}'`, { key: key, receiver: receiverName, error: driveError.message });
            if (!res.headersSent) {
                // Use next to pass error to error handler middleware
                next({ status: 500, message: `Storage download error: ${driveError.message}` });
            } else {
                log(LOG_TYPES.WARN, `Headers already sent for '${file.originalName}', cannot send drive stream error status.`);
                res.end(); // Ensure response ends if headers were sent
            }
        });

        // Error Handling for Decryption Stream
        decryptedStream.on('error', (decryptionError) => {
            log(LOG_TYPES.ERROR, `Decryption stream error for '${file.originalName}'`, { key: key, receiver: receiverName, error: decryptionError.message });
            if (!res.headersSent) {
                // Check for specific crypto errors like wrong key/tag
                const statusCode = decryptionError.code === 'ERR_CRYPTO_INVALID_AUTH_TAG' ? 400 : 500;
                const message = statusCode === 400 ? 'Decryption failed: Invalid key or corrupted file.' : `Decryption error: ${decryptionError.message}`;
                next({ status: statusCode, message: message });
            } else {
                log(LOG_TYPES.WARN, `Headers already sent for '${file.originalName}', cannot send decryption error status.`);
                res.end(); // Ensure response ends if headers were sent
            }
        });

        // Handle successful finish on the *response* stream
        res.on('finish', () => {
            log(LOG_TYPES.USER_DOWNLOAD, `Successfully streamed & decrypted '${file.originalName}'`, { key: key, receiver: receiverName });
            downloadLogEntry.save().catch(err => log(LOG_TYPES.ERROR, "Error saving download log", { error: err.message }));
        });

        // Handle client closing connection early
        res.on('close', () => {
            if (!res.writableEnded) { // Check if the stream finished successfully
                log(LOG_TYPES.WARN, `Response stream closed prematurely for '${file.originalName}'`, { key: key, receiver: receiverName });
                // Clean up the streams to prevent memory leaks
                driveStream.unpipe();
                decryptionTransform.unpipe();
                driveStream.destroy();
                decryptionTransform.destroy();
           }
        });
        // --- End Updated Decryption Logic ---

    } catch (err) {
        log(LOG_TYPES.ERROR, `Download file error`, { key: key, index: index, receiver: receiverName, filename: file?.originalName, error: err.message });
        if (!res.headersSent) {
             next(err || { status: 500, message: "Download failed due to an internal error." });
        } else {
             // If headers are sent, we can't send a status code, but should ensure the connection is closed.
             res.end();
        }
    }
};

// Handles download all files as a zip archive
exports.downloadAllFiles = async (req, res, next) => {
    const { key, receiverName } = req.params;
    try {
        const transfer = await Transfer.findOne({ key });

        if (!transfer) return next({ status: 404, message: "Invalid key." });
        if (!transfer.isPublic && !transfer.approvedReceivers.includes(receiverName)) {
            return next({ status: 403, message: "Not authorized to download." });
        }
        if (!transfer.files || transfer.files.length === 0) {
            return next({ status: 404, message: "No files found for this key." });
        }

         log(LOG_TYPES.USER_DOWNLOAD, `Zip download initiated`, { key: key, receiver: receiverName, fileCount: transfer.files.length });

        const archive = archiver('zip', { zlib: { level: 9 } }); // Use compression

        // Handle warnings and errors from the archiver itself
        archive.on('warning', (err) => {
            log(LOG_TYPES.WARN, `Archiver warning`, { key: key, code: err.code, error: err.message });
        });
        archive.on('error', (err) => {
            log(LOG_TYPES.ERROR, `Archiver error`, { key: key, error: err.message });
            // Don't try to set headers/status if they've already been sent (e.g., by pipe)
            if (!res.headersSent) {
                // Let the main error handler deal with sending the response
                next({ status: 500, message: `Failed to create archive: ${err.message}`});
            } else {
                res.end(); // Ensure stream closes if headers already sent
            }
        });

        // Set headers for zip download
        res.attachment(`${key}-files.zip`);
        // Pipe the archive output to the response
        archive.pipe(res);

        // Process each file
        for (const [index, file] of transfer.files.entries()) {
            if (!file || !file.id || !file.originalName) {
                 log(LOG_TYPES.WARN, `Skipping invalid file metadata in zip`, { key: key, index: index });
                 continue; // Skip this file
            }

            // Using a self-invoking async function to handle promises within the loop correctly
            await (async () => {
                let driveStream;
                let decryptionTransform;
                let decryptedStream;
                try {
                    driveStream = await getDriveFileStream(file.id, req.oAuth2Client);
                    decryptionTransform = cryptoService.createDecryptionTransform(key);

                    // Pipe Drive stream -> Decryption
                    decryptedStream = driveStream.pipe(decryptionTransform);

                    // --- Updated Error Handling within Loop ---
                    // Handle Drive Stream Errors
                    driveStream.on('error', (driveError) => {
                       log(LOG_TYPES.ERROR, `Drive stream error for '${file.originalName}' within zip`, { key: key, receiver: receiverName, error: driveError.message });
                       // Emit error on the archive stream to notify archiver and stop processing
                       archive.emit('error', new Error(`Storage download error for ${file.originalName}: ${driveError.message}`));
                       if(decryptedStream) decryptedStream.destroy(); // Stop this stream if source fails
                    });

                    // Handle Decryption Stream Errors
                    decryptedStream.on('error', (decryptionError) => {
                        log(LOG_TYPES.ERROR, `Decryption error for '${file.originalName}' within zip`, { key: key, receiver: receiverName, error: decryptionError.message });
                        // Emit error on the archive stream
                        const message = decryptionError.code === 'ERR_CRYPTO_INVALID_AUTH_TAG'
                            ? `Decryption failed for ${file.originalName}: Invalid key or corrupted file.`
                            : `Decryption error for ${file.originalName}: ${decryptionError.message}`;
                        archive.emit('error', new Error(message));
                    });
                    // --- End Updated Error Handling ---

                    // Append the *decrypted* stream to the archive
                    // Use a promise wrapper for the append operation if needed, or handle stream end/error events
                    archive.append(decryptedStream, { name: file.originalName });

                    // Save individual log entry for zip download file
                    const downloadLogEntry = new Download({
                         key: key, fileIndex: index, fileName: file.originalName, fileSize: file.size,
                         downloaderName: receiverName, ip: req.ip || req.connection?.remoteAddress, isZip: true
                    });
                    // Save log entry without waiting, catch potential errors
                    downloadLogEntry.save().catch(err => log(LOG_TYPES.ERROR, "Error saving zip download log entry", { key:key, filename: file.originalName, error: err.message }));

                } catch (fileStreamError) {
                    // This catch block handles errors from getDriveFileStream or createDecryptionTransform
                    log(LOG_TYPES.WARN, `Error preparing '${file.originalName}' for zip`, { key: key, error: fileStreamError.message });
                    // Notify the archiver of the issue, but allow it to continue with other files if possible
                    archive.emit('warning', new Error(`Could not add ${file.originalName} to archive: ${fileStreamError.message}`));
                    // Ensure streams are destroyed if they exist
                    if (driveStream) driveStream.destroy();
                    if (decryptedStream) decryptedStream.destroy();
                }
            })(); // End of self-invoking async function
        } // End for loop

        // Finalize the archive after processing all files
        await archive.finalize();
        log(LOG_TYPES.USER_DOWNLOAD, `Zip archive finalized for download`, { key: key, receiver: receiverName });

    } catch (err) {
        // Catch errors from Transfer.findOne, archiver setup, or archive.finalize()
        log(LOG_TYPES.ERROR, `Download All Files Error`, { key: key, receiver: receiverName, error: err.message });
        if (!res.headersSent) {
            next(err || { status: 500, message: "Failed to create and download zip file." });
        } else {
            res.end(); // Ensure stream closes
        }
    }
};