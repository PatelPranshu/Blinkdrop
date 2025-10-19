const mongoose = require('mongoose');

const downloadSchema = new mongoose.Schema({
    key: String,
    fileIndex: Number,
    fileName: String,
    fileSize: Number,
    downloaderName: String,
    ip: String,
    timestamp: { type: Date, default: Date.now }
});

const Download = mongoose.model('Download', downloadSchema);
module.exports = Download;