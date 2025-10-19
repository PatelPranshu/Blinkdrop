// backend/middleware/attachDriveClient.js
const oAuth2Client = require('../config/drive'); // Import the configured client

const attachDriveClient = (req, res, next) => {
    req.oAuth2Client = oAuth2Client;
    next();
};

module.exports = attachDriveClient;