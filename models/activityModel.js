const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    socketId: String,
    ip: String,
    deviceName: String,
    deviceType: String,
    page: String,
    action: String,
    username: String,
    timestamp: { type: Date, default: Date.now }
});

const Activity = mongoose.model('Activity', activitySchema);
module.exports = Activity;