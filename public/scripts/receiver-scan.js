document.addEventListener("DOMContentLoaded", () => {
    // 1. Set the current year in the footer
    try {
        document.getElementById('year').textContent = new Date().getFullYear();
    } catch (e) {}

    // 2. Get DOM elements
    const readerElement = document.getElementById('reader');
    const statusMessage = document.getElementById('status-message');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    const retryBtn = document.getElementById('retryBtn');

    // Create a new scanner instance using the core Html5Qrcode class
    const html5QrCode = new Html5Qrcode("reader");

    const onScanSuccess = (decodedText, decodedResult) => {
        // Stop scanning after a successful scan.
        stopScanner();
        
        try {
            const url = new URL(decodedText);
            const key = url.searchParams.get('key');
            if (key) {
                // Redirect to the receiver link page
                statusMessage.innerText = "QR Code detected! Redirecting...";
                statusMessage.className = "mt-5 font-semibold text-green-600 dark:text-green-400 min-h-[1.25rem]";
                window.location.href = `/receiver-link?key=${key}`;
            } else {
                handleError("Invalid QR Code: No key found.");
            }
        } catch (e) {
            handleError("Invalid URL in QR Code.");
        }
    };

    const startScanner = () => {
        // Reset UI for scanning
        pageTitle.innerText = "Point your camera at the QR code";
        pageSubtitle.innerText = "Scanning will start automatically.";
        statusMessage.innerText = "";
        retryBtn.style.display = 'none';
        readerElement.style.display = 'block';

        const config = {
            fps: 10,
            qrbox: { width: 350, height: 350 }
        };

        // This is the key part: .start() will automatically ask for permission
        // and begin scanning in one step.
        html5QrCode.start(
            { facingMode: "environment" }, // Use the rear camera
            config,
            onScanSuccess
        ).catch(error => {
            // This will catch errors like "Permission denied"
            handleError(`Unable to start scanner: ${error}`);
        });
    };

    const stopScanner = () => {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().catch(err => {
                console.error("Failed to stop the scanner.", err);
            });
        }
    };
    
    const handleError = (message) => {
        stopScanner();
        readerElement.style.display = 'none';
        pageTitle.innerText = "Scanning Failed";
        pageSubtitle.innerText = "An error occurred. Please try again."
        statusMessage.innerText = message;
        statusMessage.className = "mt-5 font-semibold text-red-600 dark:text-red-400 min-h-[1.25rem]";
        retryBtn.style.display = 'inline-flex';
    };

    // --- Event Listeners ---
    retryBtn.addEventListener('click', startScanner);
    
    // Automatically start the scanner when the page loads
    startScanner();
});