document.addEventListener("DOMContentLoaded", () => {
    // 1. Set the current year in the footer
    try {
        document.getElementById('year').textContent = new Date().getFullYear();
    } catch (e) {}

    // 2. Get DOM elements
    const scannerContainer = document.getElementById('reader');
    const statusMessage = document.getElementById('status-message');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    const startScanBtn = document.getElementById('startScanBtn');
    
    let scannerTimeout = null;
    let html5QrcodeScanner = null;

    function startScanner() {
        // Reset the UI for scanning
        scannerContainer.style.display = 'block';
        startScanBtn.style.display = 'none'; // Hide the button while scanning
        statusMessage.innerText = '';
        pageTitle.innerText = "Point your camera at the QR code";
        pageSubtitle.innerText = "Scanning will stop automatically after 30 seconds.";

        // Initialize scanner if it doesn't exist
        if (!html5QrcodeScanner) {
            html5QrcodeScanner = new Html5QrcodeScanner(
                "reader", 
                { 
                    fps: 10, 
                    qrbox: { width: 250, height: 250 },
                },
                false
            );
        }
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);
        
        scannerTimeout = setTimeout(() => {
            stopScanner("Scanning timed out after 30 seconds.");
        }, 30000);
    }

    function stopScanner(message) {
        if (html5QrcodeScanner && html5QrcodeScanner.getState() === 2) { // 2 = SCANNING
            html5QrcodeScanner.clear().catch(error => console.error("Failed to clear scanner.", error));
        }
        clearTimeout(scannerTimeout);
        scannerContainer.style.display = 'none';
        pageTitle.innerText = "Scanning Stopped";
        pageSubtitle.innerText = "Click the button to try again."
        statusMessage.innerText = message || "Scanning stopped.";
        startScanBtn.innerText = "Start Scan Again"; // Change button text
        startScanBtn.style.display = 'inline-flex'; // Show the button again
    }
    
    function onScanSuccess(decodedText, decodedResult) {
        clearTimeout(scannerTimeout);
        try {
            const url = new URL(decodedText);
            const key = url.searchParams.get('key');
            if (key) {
                html5QrcodeScanner.clear().then(() => {
                    window.location.href = `/receiver-link?key=${key}`;
                });
            } else {
                stopScanner("Invalid QR Code: No key found.");
            }
        } catch (e) {
            stopScanner("Invalid URL in QR Code.");
        }
    }

    function onScanFailure(error) {
        // This function is called frequently, so we ignore failures to avoid console spam.
    }
    
    // --- Event Listeners ---
    
    // UPDATED: Do not start automatically. Wait for the user to click the button.
    startScanBtn.addEventListener('click', startScanner);
    
    // Listen for when the user changes tabs to conserve resources
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopScanner("Scanning paused because you switched tabs.");
        }
    });
});