const express = require('express');
const multer = require('multer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.static('public'));
app.use(express.json());

// -------------------- File Upload Setup --------------------
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// -------------------- Key Generator --------------------
function generateKey() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit
}

// -------------------- Store Transfers --------------------
let activeTransfers = {
  // [key]: {
  //   senderName: '',
  //   files: [],
  //   approvedReceivers: [],
  //   pendingReceiver: 'John'
  // }
};

// -------------------- Upload Endpoint --------------------
app.post('/upload', upload.array('files', 10), (req, res) => {
  const { senderName } = req.body;
  const key = generateKey();
  const files = req.files.map(file => ({
    filename: file.filename,
    originalName: file.originalname
  }));

  activeTransfers[key] = {
    senderName,
    files,
    approvedReceivers: [],
    pendingReceiver: null
  };

  res.json({ key, files });
});

// -------------------- Receiver Requests File Info --------------------
app.post('/file-info/:key', (req, res) => {
  const { receiverName } = req.body;
  const key = req.params.key;
  const transfer = activeTransfers[key];

  if (!transfer) return res.status(404).json({ message: 'Key not found' });

  // 🛠 Fix: Only set pendingReceiver if not a polling request
  if (receiverName !== 'POLL') {
    transfer.pendingReceiver = receiverName;
  }

  res.json({
    senderName: transfer.senderName,
    receiverName: transfer.pendingReceiver,
    files: transfer.files.map((file, i) => ({
      name: file.originalName,
      index: i
    })),
    approved: transfer.approvedReceivers.includes(transfer.pendingReceiver)
  });
});

// -------------------- Sender Approves Receiver --------------------
app.post('/approve', (req, res) => {
  const { key, receiverName } = req.body;
  const transfer = activeTransfers[key];
  if (!transfer) return res.status(404).json({ message: 'Key not found' });

  if (!transfer.approvedReceivers.includes(receiverName)) {
    transfer.approvedReceivers.push(receiverName);
  }

  res.json({ success: true });
});

// -------------------- Receiver Downloads File --------------------
app.get('/download/:key/:index/:receiverName', (req, res) => {
  const { key, index, receiverName } = req.params;
  const transfer = activeTransfers[key];

  if (!transfer) {
    return res.status(404).send('Invalid key');
  }

  if (!transfer.approvedReceivers.includes(receiverName)) {
    return res.status(403).send('Not authorized to download.');
  }

  const file = transfer.files[index];
  const filePath = path.join(__dirname, 'uploads', file.filename);
  res.download(filePath, file.originalName);
});

// -------------------- Server Startup --------------------
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
