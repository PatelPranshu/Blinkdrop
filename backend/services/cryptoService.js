// backend/services/cryptoService.js
const crypto = require('crypto');
const fs = require('fs');
const stream = require('stream');

const algorithm = 'aes-256-cbc';
// Ensure salt is defined in .env and is a valid hex string
const salt = Buffer.from(process.env.ENCRYPTION_SALT || crypto.randomBytes(16).toString('hex'), 'hex');

function getKey(secretKey) {
    if (!secretKey || typeof secretKey !== 'string') {
         throw new Error('Invalid secret key provided for encryption/decryption.');
    }
    return crypto.pbkdf2Sync(secretKey, salt, 100000, 32, 'sha512');
}

async function encryptFile(filePath, secretKey) {
    const key = getKey(secretKey);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const input = fs.createReadStream(filePath);
    const encryptedFilePath = filePath + '.enc';
    const output = fs.createWriteStream(encryptedFilePath);

    // Prepend the IV to the output file
    output.write(iv);

    await new Promise((resolve, reject) => {
        input.pipe(cipher)
             .on('error', reject) // Handle cipher errors
             .pipe(output)
             .on('finish', resolve)
             .on('error', reject); // Handle write stream errors
    });

    return encryptedFilePath;
}

function createDecryptionTransform(secretKey) {
    const encryptionKey = getKey(secretKey);
    let iv;
    let decipher;
    let dataBuffer = Buffer.alloc(0);

    return new stream.Transform({
        transform(chunk, encoding, callback) {
            if (!iv) {
                dataBuffer = Buffer.concat([dataBuffer, chunk]);
                if (dataBuffer.length >= 16) {
                    iv = dataBuffer.slice(0, 16);
                    const remainingData = dataBuffer.slice(16);
                    dataBuffer = null; // Clear buffer once IV is read
                    try {
                        decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);
                        this.push(decipher.update(remainingData));
                    } catch (e) {
                        console.error("Decipher creation failed:", e.message);
                        return callback(new Error("Decryption failed: Could not initialize decipher. Key might be incorrect or IV corrupt."));
                    }
                }
            } else if (decipher) { // Check if decipher exists
                 try {
                      this.push(decipher.update(chunk));
                 } catch (e) {
                      console.error("Decipher update failed:", e.message);
                      return callback(new Error("Decryption failed during update. File might be corrupt."));
                 }
            } else {
                 // This case means we expected a decipher but didn't get one (e.g., file too short for IV)
                 console.error("Decryption error: IV read but decipher not initialized.");
                 return callback(new Error("Decryption failed: Invalid file format or missing data."));
            }
            callback();
        },
        flush(callback) {
             if (decipher) {
                 try {
                     this.push(decipher.final());
                 } catch (e) {
                     console.error("Decipher finalization failed:", e.message);
                     return callback(new Error("Decryption failed: File may be corrupt or key is incorrect (final block error)."));
                 }
             } else if (dataBuffer && dataBuffer.length > 0) {
                  // File ended before even 16 bytes (IV) could be read
                  console.error("Decryption error: File ended before IV could be fully read.");
                  return callback(new Error("Decryption failed: Incomplete or invalid encrypted file format."));
             } else if (!iv) {
                  // Handle case where stream was empty or ended immediately
                  console.error("Decryption error: No data received for decryption.");
                  // Don't necessarily error here, could be an empty file being processed
             }
            callback();
        }
    });
}

module.exports = { encryptFile, createDecryptionTransform };