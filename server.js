const express = require('express');
const multer = require('multer');
const path = require('path');
const http = require('http');
const fs = require('fs');
require('dotenv').config();

// -------------------- Server Setup --------------------
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 80;

// -------------------- Clean uploads folder at startup --------------------
const uploadDir = path.join(__dirname, 'uploads');
if (fs.existsSync(uploadDir)) {
  fs.readdirSync(uploadDir).forEach(file => {
    const filePath = path.join(uploadDir, file);
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error(`❌ Error deleting ${file}:`, err);
    }
  });
  console.log('🧹 Uploads folder cleaned.');
}

app.use(express.static('public'));
app.use(express.json());

// -------------------- Admin Credentials --------------------
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// -------------------- File Upload Setup --------------------
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// -------------------- Active Transfers --------------------
let activeTransfers = {};

// -------------------- Unique Key Generator --------------------
function generateUniqueKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key;
  do {
    key = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (activeTransfers[key]);
  return key;
}

// -------------------- Upload Endpoint --------------------
app.post('/upload', upload.array('files', 10), (req, res) => {
  const { senderName } = req.body;
  const key = generateUniqueKey();
  const files = req.files.map(file => ({
    filename: file.filename,
    originalName: file.originalname
  }));

  activeTransfers[key] = {
    senderName,
    files,
    approvedReceivers: [],
    pendingReceivers: [],
    createdAt: new Date()
  };

  res.json({ key, files });
});

// -------------------- Receiver Requests File Info --------------------
app.post('/file-info/:key', (req, res) => {
  const { receiverName } = req.body;
  const key = req.params.key;
  const transfer = activeTransfers[key];

  if (!transfer) return res.status(404).json({ message: 'Key not found' });

  if (receiverName !== 'POLL' && !transfer.pendingReceivers.includes(receiverName)) {
    transfer.pendingReceivers.push(receiverName);
  }

  res.json({
    senderName: transfer.senderName,
    receiverName,
    files: transfer.files.map((file, i) => ({
      name: file.originalName,
      index: i
    })),
    approved: transfer.approvedReceivers.includes(receiverName)
  });
});

// -------------------- Sender Approves Receiver --------------------
app.post('/approve', (req, res) => {
  const { key, receiverName } = req.body;
  const transfer = activeTransfers[key];
  if (!transfer) return res.status(404).json({ message: 'Key not found' });

  if (!transfer.approvedReceivers.includes(receiverName)) {
    transfer.approvedReceivers.push(receiverName);
    transfer.pendingReceivers = transfer.pendingReceivers.filter(r => r !== receiverName);
  }

  res.json({ success: true });
});

// -------------------- Receiver Downloads File --------------------
app.get('/download/:key/:index/:receiverName', (req, res) => {
  const { key, index, receiverName } = req.params;
  const transfer = activeTransfers[key];
  if (!transfer) return res.status(404).send('Invalid key');

  if (!transfer.approvedReceivers.includes(receiverName)) {
    return res.status(403).send('Not authorized to download.');
  }

  const file = transfer.files[index];
  if (!file.downloadedAt) {
    file.downloadedAt = new Date();
    setTimeout(() => {
      try {
        fs.unlinkSync(path.join(__dirname, 'uploads', file.filename));
      } catch (e) {}
    }, 10 * 60 * 1000); // 10 min
  }

  const filePath = path.join(__dirname, 'uploads', file.filename);
  res.download(filePath, file.originalName);
});

// -------------------- Admin Login --------------------
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.status(200).json({ success: true });
  }
  res.status(401).json({ success: false });
});

// -------------------- Admin Sessions --------------------
app.get('/admin/sessions', (req, res) => {
  const now = new Date();
  const sessions = Object.entries(activeTransfers).map(([key, transfer]) => {
    const fileDetails = transfer.files.map(file => {
      const filePath = path.join(__dirname, 'uploads', file.filename);
      let size = 0;
      try {
        size = fs.statSync(filePath).size;
      } catch (e) {}
      const downloadedAt = file.downloadedAt ? new Date(file.downloadedAt) : null;
      const remaining = downloadedAt ? Math.max(0, 1 * 60 * 1000 - (now - downloadedAt)) : null;
      return {
        name: file.originalName,
        size,
        downloadedAt,
        remainingSeconds: remaining ? Math.floor(remaining / 1000) : null
      };
    });

    const totalSize = fileDetails.reduce((sum, f) => sum + f.size, 0);

    return {
      key,
      senderName: transfer.senderName,
      receiversWaiting: transfer.pendingReceivers,
      approvedReceivers: transfer.approvedReceivers,
      fileDetails,
      totalSize,
      createdAt: transfer.createdAt
    };
  });

  res.json(sessions);
});

// -------------------- Start Server --------------------
// server.listen(PORT, () => {
//   console.log(`🚀 Server running at http://localhost:${PORT}`);
// });

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://blinkdrop.com`);
});