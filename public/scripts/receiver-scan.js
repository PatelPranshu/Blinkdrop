document.addEventListener("DOMContentLoaded", () => {
    // --- Connect to Socket.IO and send user status ---
    const socket = io();
    socket.on('connect', () => {
        const username = localStorage.getItem('userName') || 'Anonymous';
        socket.emit('userUpdate', {
            username,
            page: window.location.pathname,
            action: 'Scanning QR Code'
        });
    });

    // --- Page Initialization ---
    try {
        document.getElementById('year').textContent = new Date().getFullYear();
    } catch (e) {}

    // --- Get DOM elements ---
    const readerElement = document.getElementById('reader');
    const statusMessage = document.getElementById('status-message');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    const retryBtn = document.getElementById('retryBtn');

    // Create a new scanner instance
    const html5QrCode = new Html5Qrcode("reader");

    const onScanSuccess = (decodedText, decodedResult) => {
        // Stop listening for visibility changes
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        stopScanner();
        
        try {
            const url = new URL(decodedText);
            const key = url.searchParams.get('key');
            if (key) {
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

        // Start the scanner
        html5QrCode.start(
            { facingMode: "environment" }, // Use the rear camera
            config,
            onScanSuccess
        ).catch(error => {
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
        retryBtn.innerText = 'Try Again';
        retryBtn.style.display = 'inline-flex';
    };

    // --- NEW: Function to handle tab/window visibility change ---
    const handleVisibilityChange = () => {
        if (html5QrCode && html5QrCode.isScanning) {
            if (document.hidden) {
                // Page is hidden, so stop the scanner
                stopScanner();
                readerElement.style.display = 'none';
                pageTitle.innerText = "Scanning Paused";
                pageSubtitle.innerText = "Click the button below to resume.";
                statusMessage.innerText = "Scanner paused because you switched away.";
                statusMessage.className = "mt-5 font-semibold text-neutral-500 dark:text-neutral-400 min-h-[1.25rem]";
                retryBtn.innerText = 'Scan Again';
                retryBtn.style.display = 'inline-flex';
            }
        }
    };

    // --- Event Listeners ---
    retryBtn.addEventListener('click', startScanner);
    
    // --- NEW: Listen for visibility changes ---
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    // Automatically start the scanner when the page loads
    startScanner();
});