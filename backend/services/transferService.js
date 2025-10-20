// backend/services/transferService.js
const Transfer = require('../models/transferModel'); // Correct path and case

async function generateUniqueKey() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let key;
    let attempts = 0;
    const maxAttempts = 10; // Prevent infinite loops

    do {
        if (attempts >= maxAttempts) {
            throw new Error("Failed to generate a unique key after multiple attempts.");
        }
        key = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        attempts++;
    } while (await Transfer.exists({ key: key })); // Use exists for efficiency
    return key;
}

 async function approveReceiverLogic(key, receiverName) {
     const transfer = await Transfer.findOne({ key });
     if (!transfer) {
         return { success: false, status: 404, message: "Key not found" };
     }

     if (!transfer.approvedReceivers.includes(receiverName)) {
         transfer.approvedReceivers.push(receiverName);
         // Remove from pending if they were there
         transfer.pendingReceivers = transfer.pendingReceivers.filter(r => r !== receiverName);
         await transfer.save();
          console.log(`✅ Approved receiver '${receiverName}' for key ${key}`);
         return { success: true, status: 200, message: "Receiver approved" };
     }
     // Already approved, still success
     return { success: true, status: 200, message: "Receiver already approved" };
 }

  async function getTransferInfoLogic(key, receiverName) {
      const transfer = await Transfer.findOne({ key });
      if (!transfer) {
          return { status: 404, data: { message: "Key not found" } };
      }

      const isKnownReceiver = transfer.pendingReceivers.includes(receiverName) || transfer.approvedReceivers.includes(receiverName);
      let needsSave = false;

      // Handle new receiver joining
      if (receiverName && receiverName !== "POLL" && !isKnownReceiver) {
          if (transfer.isPublic) {
               if (!transfer.approvedReceivers.includes(receiverName)) {
                    transfer.approvedReceivers.push(receiverName);
                    needsSave = true;
                    console.log(`✅ Auto-approved public access for '${receiverName}' on key ${key}`);
               }
          } else {
               if (!transfer.pendingReceivers.includes(receiverName)) {
                    transfer.pendingReceivers.push(receiverName);
                    needsSave = true;
                    console.log(`⏳ Added '${receiverName}' to pending for key ${key}`);
               }
          }
          if (needsSave) {
              await transfer.save();
          }
      }

      const isApproved = transfer.isPublic || transfer.approvedReceivers.includes(receiverName);

      // Return structured data
      return {
          status: 200,
          data: {
              senderName: transfer.senderName,
              receiverName: receiverName === "POLL" ? null : receiverName, // Don't return "POLL" as receiver name
              files: transfer.files.map((file, index) => ({
                  name: file.originalName,
                  index: index, // Ensure index is included
                  size: file.size // Original file size
              })),
              approved: isApproved,
              isPublic: transfer.isPublic, // Include public status
              // For admin or internal use, you might include pending/approved lists
              pendingReceivers: transfer.pendingReceivers,
              approvedReceivers: transfer.approvedReceivers
          }
      };
  }


module.exports = { generateUniqueKey, approveReceiverLogic, getTransferInfoLogic };