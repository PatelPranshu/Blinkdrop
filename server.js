const express = require("express");
const multer = require("multer");
const path = require("path");
const http = require("http");
const fs = require("fs");
require("dotenv").config();
const { google } = require("googleapis"); // Added Google APIs

// -------------------- OAuth Setup --------------------
// This entire section is restored from your old code.
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

// --- REMOVED: Local 'uploads' directory creation is no longer needed. ---

// -------------------- Express Setup --------------------
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.static("public", { extensions: ["html"] }));
app.use(express.json());

// -------------------- Multer (memory storage) --------------------
// --- MODIFIED: Switched back to memory storage for Google Drive upload ---
const upload = multer({ storage: multer.memoryStorage() });


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
// Restored from your old code.
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


// -------------------- Upload to Google Drive --------------------
// This helper function is restored from your old code.
async function uploadToDrive(buffer, originalName) {
  const drive = google.drive({ version: "v3", auth: oAuth2Client });
  const fileMetadata = {
    name: originalName,
    parents: [process.env.GDRIVE_FOLDER_ID], // Ensure GDRIVE_FOLDER_ID is in your .env file
  };

  const media = {
    mimeType: "application/octet-stream",
    body: require("stream").Readable.from(buffer),
  };

  const res = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: "id, name, size",
  });

  return res.data;
}


// -------------------- Upload Endpoint --------------------
// --- MODIFIED: Merged logic from both old and new code ---
app.post("/upload", upload.array("files", 10), async (req, res) => {
  try {
    const { senderName, approveAll } = req.body;
    const key = generateUniqueKey();

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files were uploaded." });
    }

    // Upload each file to Google Drive and collect its metadata.
    const uploadedFiles = [];
    for (let f of req.files) {
      const gfile = await uploadToDrive(f.buffer, f.originalname);
      uploadedFiles.push({
        id: gfile.id, // We store the Google Drive file ID
        originalName: gfile.name,
        size: gfile.size,
      });
    }

    activeTransfers[key] = {
      senderName,
      files: uploadedFiles, // Storing file info from Google Drive
      approvedReceivers: [],
      pendingReceivers: [],
      createdAt: new Date(),
      isPublic: approveAll === 'true', // Kept this feature from your new code
    };

    // Send back the key and file details to the frontend.
    res.json({ 
        key, 
        files: uploadedFiles.map(f => ({ originalName: f.originalName, size: f.size })) 
    });

  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// -------------------- Receiver Requests File Info --------------------
// --- NO CHANGES NEEDED ---
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
// --- NO CHANGES NEEDED ---
app.post("/approve", (req, res) => {
  const { key, receiverName } = req.body;
  const transfer = activeTransfers[key];
  if (!transfer) return res.status(404).json({ message: "Key not found" });
  if (!transfer.approvedReceivers.includes(receiverName)) { transfer.approvedReceivers.push(receiverName); transfer.pendingReceivers = transfer.pendingReceivers.filter((r) => r !== receiverName); }
  res.json({ success: true });
});

// -------------------- Receiver Downloads File --------------------
// --- MODIFIED: Now downloads from Google Drive ---
app.get("/download/:key/:index/:receiverName", async (req, res) => {
  try {
    const { key, index, receiverName } = req.params;
    const transfer = activeTransfers[key];
    if (!transfer) return res.status(404).send("Invalid key");

    // This check now includes the 'isPublic' flag
    if (!transfer.isPublic && !transfer.approvedReceivers.includes(receiverName)) {
      return res.status(403).send("Not authorized to download.");
    }

    const file = transfer.files[index];
    if (!file) {
      return res.status(404).send("File not found.");
    }
    
    // Using Google Drive API to get the file stream
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
// --- NO CHANGES NEEDED ---
app.post("/admin/login", (req, res) => { const { username, password } = req.body; if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) { return res.status(200).json({ success: true }); } res.status(401).json({ success: false }); });

// -------------------- Admin Sessions --------------------
// --- NO CHANGES NEEDED (but it now includes isPublic) ---
app.get("/admin/sessions", (req, res) => {
  const sessions = Object.entries(activeTransfers).map(([key, transfer]) => {
    const fileDetails = transfer.files.map((file) => ({ name: file.originalName, size: file.size }));
    const totalSize = fileDetails.reduce((sum, f) => sum + Number(f.size), 0);
    return { key, senderName: transfer.senderName, receiversWaiting: transfer.pendingReceivers, approvedReceivers: transfer.approvedReceivers, fileDetails, totalSize, createdAt: transfer.createdAt, isPublic: transfer.isPublic };
  });
  res.json(sessions);
});

// -------------------- Admin Delete All Uploads --------------------
// --- MODIFIED: This now deletes files from Google Drive ---
app.post("/admin/delete-all-uploads", async (req, res) => {
  try {
    const drive = google.drive({ version: "v3", auth: oAuth2Client });
    const folderId = process.env.GDRIVE_FOLDER_ID;

    const listRes = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: 'files(id, name)',
    });

    const files = listRes.data.files;
    if (files.length > 0) {
        for (const file of files) {
          try {
            await drive.files.delete({ fileId: file.id });
            console.log(`🗑️ Deleted from Drive: ${file.name}`);
          } catch (err) {
            console.error(`❌ Failed to delete ${file.name}:`, err.message);
          }
        }
    }

    activeTransfers = {}; // Clear the in-memory transfers object
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