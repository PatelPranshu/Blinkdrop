const express = require("express");
const multer = require("multer");
const path = require("path");
const http = require("http");
const fs = require("fs");
require("dotenv").config();
const { google } = require("googleapis");

// -------------------- OAuth Setup --------------------
const TOKEN_PATH = path.join(__dirname, "tokens.json");

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oAuth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

// If tokens already exist, load them
if (fs.existsSync(TOKEN_PATH)) {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(tokens);
}

// -------------------- Express Setup --------------------
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.static("public", { extensions: ["html"] }));
app.use(express.json());

// -------------------- Multer (disk storage) --------------------
const uploadFolder = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder);

const storage = multer.diskStorage({
  destination: uploadFolder,
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // optional: 1 GB per file
});

// -------------------- Admin Credentials --------------------
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// -------------------- Active Transfers --------------------
let activeTransfers = {};

// -------------------- Generate Unique Key --------------------
function generateUniqueKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let key;
  do {
    key = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  } while (activeTransfers[key]);
  return key;
}

// -------------------- Auth Routes --------------------
app.get("/auth", (req, res) => {
  const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  res.redirect(url);
});

app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No code received");

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.send("✅ Authentication successful! You can now upload files.");
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("Auth failed");
  }
});

// -------------------- Google Drive Helper Functions --------------------
async function createDriveFolder(folderName) {
  const drive = google.drive({ version: "v3", auth: oAuth2Client });
  const fileMetadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
    parents: [process.env.GDRIVE_FOLDER_ID],
  };

  try {
    const file = await drive.files.create({
      resource: fileMetadata,
      fields: "id",
    });
    console.log(`📂 Folder created with ID: ${file.data.id}`);
    return file.data.id;
  } catch (err) {
    console.error("❌ Error creating Drive folder:", err);
    throw err;
  }
}

async function uploadToDrive(filePath, originalName, parentFolderId) {
  const drive = google.drive({ version: "v3", auth: oAuth2Client });
  const fileMetadata = {
    name: originalName,
    parents: [parentFolderId],
  };

  const media = {
    mimeType: "application/octet-stream",
    body: fs.createReadStream(filePath),
  };

  const res = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: "id, name, size",
  });

  return res.data;
}

// -------------------- Upload Endpoint --------------------
app.post("/upload", upload.array("files", 100), async (req, res) => {
  try {
    const { senderName, approveAll } = req.body;
    const key = generateUniqueKey();

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files were uploaded." });
    }

    const senderFolderId = await createDriveFolder(key);

    const uploadedFiles = [];
    for (let f of req.files) {
      const gfile = await uploadToDrive(f.path, f.originalname, senderFolderId);
      uploadedFiles.push({
        id: gfile.id,
        originalName: gfile.name,
        size: gfile.size,
      });
      fs.unlink(f.path, () => {}); // delete local temp file after upload
    }

    activeTransfers[key] = {
      senderName,
      files: uploadedFiles,
      approvedReceivers: [],
      pendingReceivers: [],
      createdAt: new Date(),
      isPublic: approveAll === "true",
      driveFolderId: senderFolderId,
    };

    res.json({
      key,
      files: uploadedFiles.map(f => ({ originalName: f.originalName, size: f.size })),
    });

  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// -------------------- Receiver Requests File Info --------------------
app.post("/file-info/:key", (req, res) => {
  const { receiverName } = req.body;
  const key = req.params.key;
  const transfer = activeTransfers[key];
  if (!transfer) return res.status(404).json({ message: "Key not found" });

  if (receiverName !== "POLL" && !transfer.pendingReceivers.includes(receiverName)) {
    transfer.pendingReceivers.push(receiverName);
  }

  res.json({
    senderName: transfer.senderName,
    receiverName,
    files: transfer.files.map((file, i) => ({ name: file.originalName, index: i, size: file.size })),
    approved: transfer.isPublic || transfer.approvedReceivers.includes(receiverName),
  });
});

// -------------------- Sender Approves Receiver --------------------
app.post("/approve", (req, res) => {
  const { key, receiverName } = req.body;
  const transfer = activeTransfers[key];
  if (!transfer) return res.status(404).json({ message: "Key not found" });
  if (!transfer.approvedReceivers.includes(receiverName)) {
    transfer.approvedReceivers.push(receiverName);
    transfer.pendingReceivers = transfer.pendingReceivers.filter((r) => r !== receiverName);
  }
  res.json({ success: true });
});

// -------------------- Receiver Downloads File --------------------
app.get("/download/:key/:index/:receiverName", async (req, res) => {
  try {
    const { key, index, receiverName } = req.params;
    const transfer = activeTransfers[key];
    if (!transfer) return res.status(404).send("Invalid key");

    if (!transfer.isPublic && !transfer.approvedReceivers.includes(receiverName)) {
      return res.status(403).send("Not authorized to download.");
    }

    const file = transfer.files[index];
    if (!file) {
      return res.status(404).send("File not found.");
    }
    
    const drive = google.drive({ version: "v3", auth: oAuth2Client });
    const driveRes = await drive.files.get(
      { fileId: file.id, alt: "media" },
      { responseType: "stream" }
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.originalName}"`
    );
    driveRes.data.pipe(res);

  } catch (err) {
    console.error("❌ Download error:", err);
    if (!res.headersSent) {
      res.status(500).send("Download failed");
    }
  }
});

// -------------------- Admin Login --------------------
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.status(200).json({ success: true });
  }
  res.status(401).json({ success: false });
});

// -------------------- Admin Sessions --------------------
app.get("/admin/sessions", (req, res) => {
  const sessions = Object.entries(activeTransfers).map(([key, transfer]) => {
    const fileDetails = transfer.files.map((file) => ({ name: file.originalName, size: file.size }));
    const totalSize = fileDetails.reduce((sum, f) => sum + Number(f.size), 0);
    return {
      key,
      senderName: transfer.senderName,
      receiversWaiting: transfer.pendingReceivers,
      approvedReceivers: transfer.approvedReceivers,
      fileDetails,
      totalSize,
      createdAt: transfer.createdAt,
      isPublic: transfer.isPublic
    };
  });
  res.json(sessions);
});

// -------------------- Admin Delete All Uploads --------------------
app.post("/admin/delete-all-uploads", async (req, res) => {
  try {
    const drive = google.drive({ version: "v3", auth: oAuth2Client });
    const folderId = process.env.GDRIVE_FOLDER_ID;

    const listRes = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: 'files(id, name)',
    });

    const items = listRes.data.files;
    if (items.length > 0) {
        for (const item of items) {
          try {
            await drive.files.delete({ fileId: item.id });
            console.log(`🗑️ Deleted from Drive: ${item.name}`);
          } catch (err) {
            console.error(`❌ Failed to delete ${item.name}:`, err.message);
          }
        }
    }

    activeTransfers = {};
    res.json({ success: true });

  } catch (err) {
    console.error("❌ Delete All Uploads error:", err);
    res.status(500).json({ error: "Failed to delete uploads" });
  }
});

// -------------------- Start Server --------------------
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
