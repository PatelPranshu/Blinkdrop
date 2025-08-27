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

// If tokens already exist, load them
if (fs.existsSync(TOKEN_PATH)) {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(tokens);
}

// -------------------- Express Setup --------------------
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.json());

// -------------------- Multer (memory only) --------------------
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
async function uploadToDrive(buffer, originalName) {
  const drive = google.drive({ version: "v3", auth: oAuth2Client });
  const fileMetadata = {
    name: originalName,
    parents: [process.env.GDRIVE_FOLDER_ID], // folder in Drive
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
app.post("/upload", upload.array("files", 10), async (req, res) => {
  try {
    const { senderName } = req.body;
    const key = generateUniqueKey();

    const uploadedFiles = [];
    for (let f of req.files) {
      const gfile = await uploadToDrive(f.buffer, f.originalname);
      uploadedFiles.push({
        id: gfile.id,
        originalName: gfile.name,
        size: gfile.size,
      });
    }

    activeTransfers[key] = {
      senderName,
      files: uploadedFiles,
      approvedReceivers: [],
      pendingReceivers: [],
      createdAt: new Date(),
    };

    res.json({ key, files: uploadedFiles });
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

  if (
    receiverName !== "POLL" &&
    !transfer.pendingReceivers.includes(receiverName)
  ) {
    transfer.pendingReceivers.push(receiverName);
  }

  res.json({
    senderName: transfer.senderName,
    receiverName,
    files: transfer.files.map((file, i) => ({
      name: file.originalName,
      index: i,
      size: file.size,
    })),
    approved: transfer.approvedReceivers.includes(receiverName),
  });
});

// -------------------- Sender Approves Receiver --------------------
app.post("/approve", (req, res) => {
  const { key, receiverName } = req.body;
  const transfer = activeTransfers[key];
  if (!transfer) return res.status(404).json({ message: "Key not found" });

  if (!transfer.approvedReceivers.includes(receiverName)) {
    transfer.approvedReceivers.push(receiverName);
    transfer.pendingReceivers = transfer.pendingReceivers.filter(
      (r) => r !== receiverName
    );
  }

  res.json({ success: true });
});

// -------------------- Receiver Downloads File --------------------
app.get("/download/:key/:index/:receiverName", async (req, res) => {
  try {
    const { key, index, receiverName } = req.params;
    const transfer = activeTransfers[key];
    if (!transfer) return res.status(404).send("Invalid key");

    if (!transfer.approvedReceivers.includes(receiverName)) {
      return res.status(403).send("Not authorized to download.");
    }

    const file = transfer.files[index];

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
    res.status(500).send("Download failed");
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
    const fileDetails = transfer.files.map((file) => ({
      name: file.originalName,
      size: file.size,
    }));

    const totalSize = fileDetails.reduce((sum, f) => sum + Number(f.size), 0);

    return {
      key,
      senderName: transfer.senderName,
      receiversWaiting: transfer.pendingReceivers,
      approvedReceivers: transfer.approvedReceivers,
      fileDetails,
      totalSize,
      createdAt: transfer.createdAt,
    };
  });

  res.json(sessions);
});
// -------------------- Admin Delete All Uploads --------------------
app.post("/admin/delete-all-uploads", async (req, res) => {
  try {
    const drive = google.drive({ version: "v3", auth: oAuth2Client });

    // Loop through all active transfers
    for (const key in activeTransfers) {
      for (const file of activeTransfers[key].files) {
        try {
          await drive.files.delete({ fileId: file.id });
          console.log(`🗑️ Deleted from Drive: ${file.originalName}`);
        } catch (err) {
          console.error(`❌ Failed to delete ${file.originalName}:`, err.message);
        }
      }
    }

    // Clear in-memory transfers
    activeTransfers = {};
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Delete All Uploads error:", err);
    res.status(500).json({ error: "Failed to delete uploads" });
  }
});

// -------------------- Start Server --------------------
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
