const Transfer = require('../models/transferModel');
const Download = require('../models/downloadModel');
const { deleteDriveFolder } = require('../services/driveService');
const { log, LOG_TYPES } = require('../utils/logger'); // Import LOG_TYPES

// Handles admin login
exports.adminLogin = (req, res, next) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return next({ status: 400, message: "Username and password are required." });
    }

    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        req.session.username = username;

        req.session.save(err => {
            if (err) {
                log(LOG_TYPES.ERROR, "Session save error during login", { error: err.message });
                return next({ status: 500, message: "Login failed due to session error." });
            }
            log(LOG_TYPES.USER_LOGIN, `Admin '${username}' logged in.`, { sessionId: req.session.id });
            return res.status(200).json({ success: true, message: "Login successful" });
        });
    } else {
        log(LOG_TYPES.WARN, `Failed admin login attempt`, { username: username });
        next({ status: 401, message: "Invalid credentials." });
    }
};

// Middleware to check if the user is an admin
exports.isAdminAuthenticated = (req, res, next) => {
    if (req.session && req.session.isAdmin) {
        next(); // User is authenticated as admin
    } else {
        // This log is useful for security auditing but will be of type 'warn' (console only)
        log(LOG_TYPES.WARN, "Unauthorized admin access attempt", { path: req.originalUrl, ip: req.ip });
        next({ status: 401, message: "Unauthorized: Admin access required." });
    }
};

// Gets all transfer sessions for the admin dashboard
exports.getAdminSessions = async (req, res, next) => {
    try {
        const allTransfers = await Transfer.find({})
            .sort({ createdAt: -1 })
            .lean();

        const sessions = allTransfers.map(t => ({
            key: t.key,
            senderName: t.senderName,
            receiversWaiting: t.pendingReceivers || [],
            approvedReceivers: t.approvedReceivers || [],
            fileDetails: t.files || [],
            totalSize: (t.files || []).reduce((sum, f) => sum + (f.size || 0), 0),
            createdAt: t.createdAt,
            isPublic: t.isPublic || false
        }));

        res.status(200).json(sessions);
    } catch (err) {
        log(LOG_TYPES.ERROR, "Get Admin Sessions Error", { error: err.message });
        next(err || { status: 500, message: "Could not retrieve sessions." });
    }
};

// Deletes all transfers and associated Drive folders
exports.deleteAllUploads = async (req, res, next) => {
    try {
        const allTransfers = await Transfer.find({}).select('key driveFolderId').lean();
        let driveDeletionErrors = 0;
        let driveDeletionSuccess = 0;

        for (const transfer of allTransfers) {
            if (transfer.driveFolderId) {
                const deleted = await deleteDriveFolder(transfer.driveFolderId, req.oAuth2Client);
                if (!deleted) {
                    driveDeletionErrors++;
                } else {
                    driveDeletionSuccess++;
                }
            } else {
                log(LOG_TYPES.WARN, `Transfer ${transfer.key} has no driveFolderId, skipping Drive deletion.`);
            }
        }

        log(LOG_TYPES.DRIVE_ACTION, `Admin bulk delete: Drive cleanup complete.`, { success: driveDeletionSuccess, errors: driveDeletionErrors });

        const deletionResult = await Transfer.deleteMany({});
        log(LOG_TYPES.SUCCESS, `Admin bulk delete: ${deletionResult.deletedCount} transfer records deleted from MongoDB.`);

        res.status(200).json({
            success: true,
            message: `Deleted ${deletionResult.deletedCount} DB records. Drive: ${driveDeletionSuccess} deleted, ${driveDeletionErrors} errors.`,
            deletedCount: deletionResult.deletedCount,
            driveDeletions: driveDeletionSuccess,
            driveErrors: driveDeletionErrors
        });

    } catch (err) {
        log(LOG_TYPES.ERROR, "Delete All Uploads Error", { error: err.message });
        next(err || { status: 500, message: "Failed to delete uploads." });
    }
};

// Searches transfers based on a query string
exports.searchTransfers = async (req, res, next) => {
    try {
        const { query } = req.query;
        if (!query) {
            return exports.getAdminSessions(req, res, next);
        }

        const searchRegex = new RegExp(query.trim(), 'i');

        const transfers = await Transfer.find({
            $or: [
                { key: searchRegex },
                { senderName: searchRegex },
                { 'files.originalName': searchRegex },
                { approvedReceivers: searchRegex },
                { pendingReceivers: searchRegex }
            ]
        }).sort({ createdAt: -1 }).lean();

        const sessions = transfers.map(t => ({
            key: t.key,
            senderName: t.senderName,
            receiversWaiting: t.pendingReceivers || [],
            approvedReceivers: t.approvedReceivers || [],
            fileDetails: t.files || [],
            totalSize: (t.files || []).reduce((sum, f) => sum + (f.size || 0), 0),
            createdAt: t.createdAt,
            isPublic: t.isPublic || false
        }));

        res.status(200).json(sessions);

    } catch (err) {
        log(LOG_TYPES.ERROR, "Search Transfers Error", { error: err.message, query: req.query.query });
        next(err || { status: 500, message: "Could not perform search." });
    }
};

// Retrieves aggregated upload and download statistics
exports.getStats = async (req, res, next) => {
    try {
        const uploadStats = await Transfer.aggregate([
            { $unwind: '$files' },
            { $group: {
                _id: null,
                totalUploadSize: { $sum: '$files.size' },
                totalFilesUploaded: { $sum: 1 }
            }},
            { $project: { _id: 0 } }
        ]);

        const downloadStats = await Download.aggregate([
            { $group: {
                _id: null,
                totalDownloadSize: { $sum: '$fileSize' },
                totalFilesDownloaded: { $sum: 1 }
            }},
            { $project: { _id: 0 } }
        ]);

        res.status(200).json({
            uploads: uploadStats[0] || { totalUploadSize: 0, totalFilesUploaded: 0 },
            downloads: downloadStats[0] || { totalDownloadSize: 0, totalFilesDownloaded: 0 }
        });

    } catch (err) {
        log(LOG_TYPES.ERROR, "Get Stats Error", { error: err.message });
        next(err || { status: 500, message: "Could not retrieve statistics." });
    }
};
