const axios = require('axios');
const { google } = require("googleapis");
const fs = require("fs");
const crypto = require("crypto");
const Transfer = require('../models/transferModel');
const Download = require('../models/downloadModel');
const archiver = require('archiver');

// --- Helper Functions ---
async function generateUniqueKey() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let key;
    do {
        key = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    } while (await Transfer.findOne({ key: key }));
    return key;
}

async function createDriveFolder(folderName, oAuth2Client) {
    const drive = google.drive({ version: "v3", auth: oAuth2Client });
    const fileMetadata = { name: folderName, mimeType: "application/vnd.google-apps.folder", parents: [process.env.GDRIVE_FOLDER_ID] };
    const file = await drive.files.create({ resource: fileMetadata, fields: "id" });
    console.log(`📂 Folder created with ID: ${file.data.id}`);
    return file.data.id;
}

async function uploadToDrive(filePath, originalName, parentFolderId, oAuth2Client) {
    const drive = google.drive({ version: "v3", auth: oAuth2Client });
    const fileMetadata = { name: originalName, parents: [parentFolderId] };
    const media = { mimeType: "application/octet-stream", body: fs.createReadStream(filePath) };
    return await drive.files.create({ resource: fileMetadata, media, fields: "id, name, size" });
}


// --- Encryptio// --- Encryption/Decryption Helpeconst algorithm = 'aes-256-cbc';
const salt = Buffer.from(process.env.ENCRYPTION_SALT, 'hex');

function getKey(secretKey) {
    return crypto.pbkdf2Sync(secretKey, salt, 100000, 32, 'sha512');
}

async function encryptFile(filePath, secretKey) {
    const key = getKey(secretKey);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const input = fs.createReadStream(filePath);
    const encryptedFilePath = filePath + '.enc';
    const output = fs.createWriteStream(encryptedFilePath);

    // Prepend the IV to the output file
    output.write(iv);

    await new Promise((resolve, reject) => {
        input.pipe(cipher).pipe(output)
            .on('finish', resolve)
            .on('error', reject);
    });

    return encryptedFilePath;
}

// // --- Controller Functions ---

// exports.getApkUrl = async (req, res) => {
//     try {
//         // Fetch the latest release data from your GitHub repository
//         const response = await axios.get('https://api.github.com/repos/PatelPranshu/Blinkdrop-app/releases/latest');
        
//         // Find the asset that is the .apk file
//         const apkAsset = response.data.assets.find(asset => asset.name.endsWith('.apk'));

//         if (apkAsset) {
//             // Send the direct download URL for that asset to the frontend
//             res.json({ url: apkAsset.browser_download_url });
//         } else {
//             throw new Error('No APK file found in the latest release.');
//         }
//     } catch (error) {
//         console.error('Error fetching latest release from GitHub:', error.message);
//         res.status(500).json({ error: 'Could not retrieve the download link.' });
//     }
// };

exports.uploadFiles = async (req, res) => {
    try {
        const { senderName, approveAll } = req.body;
        const key = await generateUniqueKey();

        if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files were uploaded." });

        const senderFolderId = await createDriveFolder(key, req.oAuth2Client);

        const uploadedFiles = [];
        for (const f of req.files) {
            const encryptedFilePath = await encryptFile(f.path, key);

            const sanitizedOriginalName = f.originalname.replace(/[^A-Za-z0-9._-]/g, '_');
            const gfile = await uploadToDrive(encryptedFilePath, sanitizedOriginalName, senderFolderId, req.oAuth2Client);

            const stats = fs.statSync(encryptedFilePath);
            const fileSizeInBytes = stats.size;

            uploadedFiles.push({ id: gfile.data.id, originalName: gfile.data.name, size: f.size }); 

            fs.unlink(f.path, () => {});
            fs.unlink(encryptedFilePath, () => {});
        }

        const newTransfer = new Transfer({ key, senderName, files: uploadedFiles, isPublic: approveAll === "true", driveFolderId: senderFolderId });
        await newTransfer.save();

        res.json({ key, files: uploadedFiles.map(f => ({ originalName: f.originalName, size: f.size })) });
    } catch (err) {
        console.error("❌ Upload Error:", err);
        res.status(500).json({ error: "Upload failed" });
    }
};

exports.getFileInfo = async (req, res) => {
    try {
        const { receiverName } = req.body;
        const { key } = req.params;
        const transfer = await Transfer.findOne({ key });
        if (!transfer) return res.status(404).json({ message: "Key not found" });

        const isKnownReceiver = transfer.pendingReceivers.includes(receiverName) || transfer.approvedReceivers.includes(receiverName);

        if (receiverName !== "POLL" && !isKnownReceiver) {
            // If the transfer is public, auto-approve the new receiver
            if (transfer.isPublic) {
                transfer.approvedReceivers.push(receiverName);
            } else {
                // Otherwise, add them to the waiting list
                transfer.pendingReceivers.push(receiverName);
            }
            await transfer.save();
        }

        res.json({
            senderName: transfer.senderName,
            receiverName,
            files: transfer.files.map((file, i) => ({ name: file.originalName, index: i, size: file.size })),
            approved: transfer.isPublic || transfer.approvedReceivers.includes(receiverName),
        });
    } catch (err) {
        res.status(500).json({ error: "Could not retrieve file info" });
    }
};

exports.approveReceiver = async (req, res) => {
    try {
        const { key, receiverName } = req.body;
        const transfer = await Transfer.findOne({ key });
        if (!transfer) return res.status(404).json({ message: "Key not found" });

        if (!transfer.approvedReceivers.includes(receiverName)) {
            transfer.approvedReceivers.push(receiverName);
            transfer.pendingReceivers = transfer.pendingReceivers.filter(r => r !== receiverName);
            await transfer.save();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Approval failed" });
    }
};

exports.downloadFile = async (req, res) => {
    try {
        const { key, index, receiverName } = req.params;
        const transfer = await Transfer.findOne({ key });
        if (!transfer) return res.status(404).send("Invalid key");

        if (!transfer.isPublic && !transfer.approvedReceivers.includes(receiverName)) {
            return res.status(403).send("Not authorized to download.");
        }

        const file = transfer.files[index];
        if (!file) return res.status(404).send("File not found.");

        const drive = google.drive({ version: "v3", auth: req.oAuth2Client });
        const driveRes = await drive.files.get({ fileId: file.id, alt: "media" }, { responseType: "stream" });

        const encryptionKey = getKey(key);
        let iv;
        let decipher;
        let dataBuffer = Buffer.alloc(0);

        const transform = new (require('stream').Transform)({
            transform(chunk, encoding, callback) {
                if (!iv) {
                    dataBuffer = Buffer.concat([dataBuffer, chunk]);
                    if (dataBuffer.length >= 16) {
                        iv = dataBuffer.slice(0, 16);
                        const remainingData = dataBuffer.slice(16);
                        dataBuffer = null;
                        try {
                            decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);
                            this.push(decipher.update(remainingData));
                        } catch (e) {
                            return callback(e);
                        }
                    }
                } else {
                    this.push(decipher.update(chunk));
                }
                callback();
            },
            flush(callback) {
                if (decipher) {
                    try {
                        this.push(decipher.final());
                    } catch (e) {
                        return callback(new Error("Decryption failed. File may be corrupt or key is incorrect."));
                    }
                } else if (dataBuffer && dataBuffer.length > 0) {
                     return callback(new Error("Invalid encrypted file format."));
                }
                callback();
            }
        });
        
        res.setHeader('Content-Length', file.size); 
        res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
        
        driveRes.data.pipe(transform).on('error', (err) => {
            console.error('❌ Decryption stream error:', err.message);
            if (!res.headersSent) {
                res.status(500).send('Decryption failed. The key might be incorrect or the file is corrupted.');
            }
        }).pipe(res);

    } catch (err) {
        console.error("❌ Download error:", err);
        if (!res.headersSent) res.status(500).send("Download failed");
    }
};


exports.adminLogin = (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        return res.status(200).json({ success: true });
    }
    res.status(401).json({ success: false });
};

exports.getAdminSessions = async (req, res) => {
    try {
        const allTransfers = await Transfer.find({}).sort({ createdAt: -1 });
        const sessions = allTransfers.map(t => ({
            key: t.key, senderName: t.senderName, receiversWaiting: t.pendingReceivers,
            approvedReceivers: t.approvedReceivers, fileDetails: t.files,
            totalSize: t.files.reduce((sum, f) => sum + (f.size || 0), 0),
            createdAt: t.createdAt, isPublic: t.isPublic
        }));
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: "Could not retrieve sessions" });
    }
};

exports.deleteAllUploads = async (req, res) => {
    try {
        const allTransfers = await Transfer.find({});
        const drive = google.drive({ version: "v3", auth: req.oAuth2Client });

        for (const transfer of allTransfers) {
            try {
                await drive.files.delete({ fileId: transfer.driveFolderId });
                console.log(`🗑️ Deleted from Drive: Folder ${transfer.key}`);
            } catch (err) {
                console.error(`❌ Failed to delete folder ${transfer.key}:`, err.message);
            }
        }

        const deletionResult = await Transfer.deleteMany({}); // Delete all documents in the Transfer collection
        console.log(`🔥 ${deletionResult.deletedCount} transfer records deleted from MongoDB.`);

        console.log("🔥 All transfer records deleted from MongoDB.");
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Error during deleteAllUploads:", err); 
        res.status(500).json({ error: "Failed to delete uploads" });
    }
};


    exports.getAppConfig = (req, res) => {
        res.json({
            maxFileCount: parseInt(process.env.MAX_FILE_COUNT) || 100,
            maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB) || 1024,
        });
    };

exports.getApkUrl = async (req, res) => {
    try {
        // Fetch the latest release data from your GitHub repository
        const response = await axios.get(process.env.GITHUB_APP_URL);
        
        // Find the asset that is the .apk file
        const apkAsset = response.data.assets.find(asset => asset.name.endsWith('.apk'));

        if (apkAsset) {
            // Send the direct download URL for that asset to the frontend
            res.json({ url: apkAsset.browser_download_url });
        } else {
            throw new Error('No APK file found in the latest release.');
        }
    } catch (error) {
        console.error('Error fetching latest release from GitHub:', error.message);
        res.status(500).json({ error: 'Could not retrieve the download link.' });
    }
};


// --- New Controller Functions for Admin Panel ---

exports.searchTransfers = async (req, res) => {
    try {
        const { query } = req.query;
        const searchRegex = new RegExp(query, 'i');

        const transfers = await Transfer.find({
            $or: [
                { key: searchRegex },
                { senderName: searchRegex },
                { 'files.originalName': searchRegex },
                { approvedReceivers: searchRegex },
                { pendingReceivers: searchRegex }
            ]
        }).sort({ createdAt: -1 });

        res.json(transfers);
    } catch (err) {
        res.status(500).json({ error: "Could not perform search" });
    }
};

exports.getStats = async (req, res) => {
    try {
        const uploadStats = await Transfer.aggregate([
            { $unwind: '$files' },
            { $group: {
                _id: null,
                totalUploadSize: { $sum: '$files.size' },
                totalFilesUploaded: { $sum: 1 }
            }}
        ]);

        const downloadStats = await Download.aggregate([
            { $group: {
                _id: null,
                totalDownloadSize: { $sum: '$fileSize' },
                totalFilesDownloaded: { $sum: 1 }
            }}
        ]);

        res.json({
            uploads: uploadStats[0] || { totalUploadSize: 0, totalFilesUploaded: 0 },
            downloads: downloadStats[0] || { totalDownloadSize: 0, totalFilesDownloaded: 0 }
        });
    } catch (err) {
        res.status(500).json({ error: "Could not retrieve stats" });
    }
};

// Add this new function at the end of controllers/transferController.js
exports.downloadAllFiles = async (req, res) => {
    try {
        const { key, receiverName } = req.params;
        const transfer = await Transfer.findOne({ key });

        if (!transfer) return res.status(404).send("Invalid key");

        if (!transfer.isPublic && !transfer.approvedReceivers.includes(receiverName)) {
            return res.status(403).send("Not authorized to download.");
        }

        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });

        // Good practice to catch warnings (e.g. stat failures and other non-blocking errors)
        archive.on('warning', function(err) {
            if (err.code === 'ENOENT') {
                console.warn('Archiver warning: ', err);
            } else {
                throw err;
            }
        });

        archive.on('error', function(err) {
            throw err;
        });

        // Set the archive name
        res.attachment(`${key}-files.zip`);

        // Pipe archive data to the response
        archive.pipe(res);

        const drive = google.drive({ version: "v3", auth: req.oAuth2Client });
        const encryptionKey = getKey(key);

        // Loop through each file and append it to the archive
        for (const file of transfer.files) {
            const driveRes = await drive.files.get({ fileId: file.id, alt: "media" }, { responseType: "stream" });
            
            let iv;
            let decipher;
            let dataBuffer = Buffer.alloc(0);

            const transform = new (require('stream').Transform)({
                transform(chunk, encoding, callback) {
                    if (!iv) {
                        dataBuffer = Buffer.concat([dataBuffer, chunk]);
                        if (dataBuffer.length >= 16) {
                            iv = dataBuffer.slice(0, 16);
                            const remainingData = dataBuffer.slice(16);
                            dataBuffer = null;
                            try {
                                decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);
                                this.push(decipher.update(remainingData));
                            } catch (e) { return callback(e); }
                        }
                    } else {
                        this.push(decipher.update(chunk));
                    }
                    callback();
                },
                flush(callback) {
                    if (decipher) {
                        try {
                            this.push(decipher.final());
                        } catch (e) { return callback(new Error("Decryption failed.")); }
                    }
                    callback();
                }
            });

            const decryptedStream = driveRes.data.pipe(transform);

            // Append the decrypted stream to the archive with the original file name
            archive.append(decryptedStream, { name: file.originalName });
        }

        // Finalize the archive (this sends the response)
        await archive.finalize();

    } catch (err) {
        console.error("❌ Zip and Download error:", err);
        if (!res.headersSent) {
            res.status(500).send("Failed to create and download zip file.");
        }
    }
};