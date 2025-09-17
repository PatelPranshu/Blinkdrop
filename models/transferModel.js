const mongoose = require('mongoose');

// Define the structure (Schema) for our transfer data
const transferSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    senderName: String,
    files: [{
        id: String,
        originalName: String,
        size: Number
    }],
    approvedReceivers: [String],
    pendingReceivers: [String],
    createdAt: { type: Date, default: Date.now, expires: '24h' }, // Automatically delete doc after 24 hours
    isPublic: Boolean,
    driveFolderId: String
});

// Create and export the Model
const Transfer = mongoose.model('Transfer', transferSchema);
module.exports = Transfer;