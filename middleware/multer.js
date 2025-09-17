const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadFolder = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder);

const storage = multer.diskStorage({
    destination: uploadFolder,
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const maxFileSize = (process.env.MAX_FILE_SIZE_MB || 1024) * 1024 * 1024;

const upload = multer({
    storage,
    limits: { fileSize: maxFileSize },
});

module.exports = upload;