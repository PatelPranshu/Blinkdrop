const { google } = require("googleapis");
const fs = require("fs");
const crypto = require("crypto");
const Transfer = require('../models/transferModel');

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


// --- Encryption/Decryption Helper Functions ---
const algorithm = 'aes-256-cbc';
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

// --- Controller Functions ---

exports.getAppConfig = (req, res) => {
    res.json({
        maxFileCount: parseInt(process.env.MAX_FILE_COUNT) || 100,
        maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB) || 1024,
    });
};

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

        if (receiverName !== "POLL" && !transfer.pendingReceivers.includes(receiverName) && !transfer.approvedReceivers.includes(receiverName)) {
            transfer.pendingReceivers.push(receiverName);
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
        await Transfer.deleteMany({});
        console.log("🔥 All transfer records deleted from MongoDB.");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete uploads" });
    }
};


exports.getApkUrl = (req, res) => {
    const googleDriveUrl = process.env.GOOGLE_DRIVE_APK_URL;

    if (!googleDriveUrl) {
        return res.status(404).json({ error: 'APK URL not configured on the server.' });
    }

    try {
        const fileIdMatch = googleDriveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        
        if (fileIdMatch && fileIdMatch[1]) {
            const fileId = fileIdMatch[1];
            const directDownloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            
            res.json({ url: directDownloadUrl });
        } else {
            throw new Error('Invalid Google Drive URL format.');
        }
    } catch (error) {
        console.error('Error processing APK URL:', error);
        res.status(500).json({ error: 'Could not process the APK URL.' });
    }
};