const scannerContainer = document.getElementById('reader');
        const statusMessage = document.getElementById('status-message');
        const pageTitle = document.getElementById('page-title');
        const startScanBtn = document.getElementById('startScanBtn');
        
        let scannerTimeout = null;
        let html5QrcodeScanner = null;

        // NEW: Function to start the scanner
        function startScanner() {
            // Reset the UI
            scannerContainer.style.display = 'block';
            startScanBtn.style.display = 'none';
            statusMessage.innerText = '';
            pageTitle.innerText = "Point your camera at the sender's QR code.";

            // Initialize scanner if it doesn't exist
            if (!html5QrcodeScanner) {
                // Inside the startScanner function
                html5QrcodeScanner = new Html5QrcodeScanner(
                    "reader", 
                    { 
                        fps: 10, 
                        qrbox: { width: 250, height: 250 },
                        facingMode: "environment" // This line selects the back camera by default
                    },
                    false
                );
            }
            html5QrcodeScanner.render(onScanSuccess, onScanFailure);
            
            // Start the 30-second timeout
            scannerTimeout = setTimeout(() => {
                stopScanner("Scanning timed out after 30 seconds.");
            }, 30000);
        }

        // UPDATED: Function to stop the scanner
        function stopScanner(message) {
            if (html5QrcodeScanner && html5QrcodeScanner.getState() === 2) { // 2 = SCANNING
                html5QrcodeScanner.clear().catch(error => console.error("Failed to clear scanner.", error));
            }
            clearTimeout(scannerTimeout);
            scannerContainer.style.display = 'none';
            pageTitle.innerText = "Scanning Stopped";
            statusMessage.innerText = message || "Scanning stopped.";
            startScanBtn.style.display = 'block'; // <-- Show the "Start Scan" button
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
            // Ignore failure
        }
        
        // --- Event Listeners ---
        
        // Start the scanner automatically when the page loads
        startScanner();
        
        // Add a click listener to the new button to restart the scanner
        startScanBtn.addEventListener('click', startScanner);
        
        // Listen for when the user changes tabs
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopScanner("Scanning stopped because you switched tabs.");
            }
        });