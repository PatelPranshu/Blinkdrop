const express = require('express');
const multer = require('multer');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());

// File Storage Setup
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Generate random 4-digit key
function generateKey() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Store active keys
let activeTransfers = {};

// Multiple file upload support
app.post('/upload', upload.array('files', 10), (req, res) => {
  const key = generateKey();
  const files = req.files.map(file => ({
    filename: file.filename,
    originalName: file.originalname
  }));
  activeTransfers[key] = { files };
  res.json({ key, files });
});


// Get info for a key
app.get('/file-info/:key', (req, res) => {
  const key = req.params.key;
  if (activeTransfers[key]) {
    const files = activeTransfers[key].files.map((file, index) => ({
      name: file.originalName,
      downloadUrl: `/download/${key}/${index}`
    }));
    res.json({ sender: 'Local Sender', files });
  } else {
    res.status(404).json({ message: 'Key not found' });
  }
});

// Download specific file by index
app.get('/download/:key/:index', (req, res) => {
  const { key, index } = req.params;
  const transfer = activeTransfers[key];
  if (transfer && transfer.files[index]) {
    const file = transfer.files[index];
    const filePath = path.join(__dirname, 'uploads', file.filename);
    res.download(filePath, file.originalName);
  } else {
    res.status(404).send('File not found');
  }
});


server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
