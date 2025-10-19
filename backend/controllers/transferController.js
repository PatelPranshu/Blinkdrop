// backend/controllers/transferController.js
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const Transfer = require('../models/transferModel'); // Using original filename
const Download = require('../models/downloadModel'); // Using original filename
const { generateUniqueKey, approveReceiverLogic, getTransferInfoLogic } = require('../services/transferService');
const { createDriveFolder, uploadToDrive, getDriveFileStream } = require('../services/driveService');
const { encryptFile, createDecryptionTransform } = require('../services/cryptoService');
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
        // log(LOG_TYPES.DRIVE_ACTION, 'Folder created in Drive', { key: key, folderId: senderFolderId }); // Logged in service now

        const uploadedFilesInfo = [];
        const responseFilesInfo = [];

        for (const f of req.files) {
            let encryptedFilePath = null;
            let sanitizedOriginalName = f.originalname.replace(/[^A-Za-z0-9._-]/g, '_'); // Define here for logging
            try {
                encryptedFilePath = await encryptFile(f.path, key);
                const gfileData = await uploadToDrive(encryptedFilePath, sanitizedOriginalName, senderFolderId, req.oAuth2Client);
                // log(LOG_TYPES.DRIVE_ACTION, `Uploaded '${sanitizedOriginalName}' to Drive`, { key: key, fileId: gfileData.id }); // Logged in service now

                uploadedFilesInfo.push({
                    id: gfileData.id,
                    originalName: sanitizedOriginalName,
                    size: f.size // ORIGINAL size
                });
                 responseFilesInfo.push({
                     originalName: sanitizedOriginalName,
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

        // Log successful upload for the user
        log(LOG_TYPES.USER_UPLOAD, `Upload complete`, { key: key, sender: senderName, fileCount: req.files.length, isPublic: approveAll === "true" });

        res.status(201).json({
            key,
            files: responseFilesInfo
        });

    } catch (err) {
        // Log the upload error
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
        // Logging for pending/approved is now handled *within* getTransferInfoLogic
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
        // Log the successful approval *if* it happened (check result)
        if (result.success && result.message === "Receiver approved") { // Check specific message to avoid logging "already approved"
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
    const { key, index, receiverName } = req.params; // Keep for logging context
    let downloadLogEntry;
    let file; // Define here for logging in catch block
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
        if (!file || !file.id || !file.originalName) { // Check originalName too
            return next({ status: 404, message: "File metadata not found or invalid." });
        }

        // Log download attempt (USER_DOWNLOAD type)
        log(LOG_TYPES.USER_DOWNLOAD, `Download initiated for '${file.originalName}'`, { key: key, receiver: receiverName, index: fileIndex});

        downloadLogEntry = new Download({
             key: key,
             fileIndex: fileIndex,
             fileName: file.originalName,
             fileSize: file.size,
             downloaderName: receiverName,
             ip: req.ip || req.connection?.remoteAddress
        });

        const driveStream = await getDriveFileStream(file.id, req.oAuth2Client);
        const decryptionTransform = createDecryptionTransform(key);

        res.setHeader('Content-Length', file.size);
        res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);

        driveStream
            .pipe(decryptionTransform)
            .on('error', (decryptionError) => {
                log(LOG_TYPES.ERROR, `Decryption stream error for '${file.originalName}'`, { key: key, receiver: receiverName, error: decryptionError.message });
                if (!res.headersSent) {
                    next({ status: 500, message: `Decryption failed: ${decryptionError.message}` });
                } else {
                    log(LOG_TYPES.WARN, `Headers already sent for '${file.originalName}', cannot send decryption error status.`);
                    res.end();
                }
            })
            .pipe(res)
            .on('finish', () => {
                // Log successful completion
                log(LOG_TYPES.USER_DOWNLOAD, `Successfully streamed & decrypted '${file.originalName}'`, { key: key, receiver: receiverName });
                downloadLogEntry.save().catch(err => log(LOG_TYPES.ERROR, "Error saving download log", { error: err.message }));
            })
            .on('error', (responseError) => {
                 log(LOG_TYPES.WARN, `Response stream error for '${file.originalName}'`, { key: key, receiver: receiverName, error: responseError.message });
            });

    } catch (err) {
        log(LOG_TYPES.ERROR, `Download file error`, { key: key, index: index, receiver: receiverName, filename: file?.originalName, error: err.message });
        if (!res.headersSent) {
             next(err || { status: 500, message: "Download failed due to an internal error." });
        }
    }
};

// Handles download all files as a zip archive
exports.downloadAllFiles = async (req, res, next) => {
    const { key, receiverName } = req.params; // Keep for context
    try {
        const transfer = await Transfer.findOne({ key });

        if (!transfer) return next({ status: 404, message: "Invalid key." });
        if (!transfer.isPublic && !transfer.approvedReceivers.includes(receiverName)) {
            return next({ status: 403, message: "Not authorized to download." });
        }
        if (!transfer.files || transfer.files.length === 0) {
            return next({ status: 404, message: "No files found for this key." });
        }

         // Log zip download attempt
         log(LOG_TYPES.USER_DOWNLOAD, `Zip download initiated`, { key: key, receiver: receiverName, fileCount: transfer.files.length });

        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.on('warning', (err) => {
            log(LOG_TYPES.WARN, `Archiver warning`, { key: key, code: err.code, error: err.message });
        });
        archive.on('error', (err) => {
            log(LOG_TYPES.ERROR, `Archiver error`, { key: key, error: err.message });
            if (!res.headersSent) { next({ status: 500, message: `Failed to create archive: ${err.message}`}); }
        });

        res.attachment(`${key}-files.zip`);
        archive.pipe(res);

        for (const [index, file] of transfer.files.entries()) {
            if (!file || !file.id || !file.originalName) {
                 log(LOG_TYPES.WARN, `Skipping invalid file metadata in zip`, { key: key, index: index });
                 continue;
            }
            try {
                const driveStream = await getDriveFileStream(file.id, req.oAuth2Client);
                const decryptionTransform = createDecryptionTransform(key);

                const decryptedStream = driveStream.pipe(decryptionTransform)
                    .on('error', (decryptionError) => {
                        log(LOG_TYPES.ERROR, `Decryption error for '${file.originalName}' within zip`, { key: key, receiver: receiverName, error: decryptionError.message });
                        decryptedStream.emit('error', new Error(`Decryption failed for ${file.originalName}: ${decryptionError.message}`));
                    });

                archive.append(decryptedStream, { name: file.originalName });
                // Log adding file to zip (maybe INFO or a specific type if needed)
                // log(LOG_TYPES.INFO, `Adding '${file.originalName}' to zip`, { key: key, receiver: receiverName });

                // Save individual log entry for zip download
                const downloadLogEntry = new Download({
                     key: key, fileIndex: index, fileName: file.originalName, fileSize: file.size,
                     downloaderName: receiverName, ip: req.ip || req.connection?.remoteAddress, isZip: true
                });
                downloadLogEntry.save().catch(err => log(LOG_TYPES.ERROR, "Error saving zip download log entry", { error: err.message }));

            } catch (fileStreamError) {
                log(LOG_TYPES.WARN, `Error adding '${file.originalName}' to zip`, { key: key, error: fileStreamError.message });
                archive.emit('warning', new Error(`Could not add ${file.originalName} to archive: ${fileStreamError.message}`));
            }
        }

        await archive.finalize();
        // Log successful zip finalization (USER_DOWNLOAD)
        log(LOG_TYPES.USER_DOWNLOAD, `Zip archive finalized for download`, { key: key, receiver: receiverName });

    } catch (err) {
        log(LOG_TYPES.ERROR, `Download All Files Error`, { key: key, receiver: receiverName, error: err.message });
        if (!res.headersSent) { next(err || { status: 500, message: "Failed to create and download zip file." }); }
    }
};