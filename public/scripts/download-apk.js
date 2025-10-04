document.addEventListener('DOMContentLoaded', async () => {
    // --- Connect to Socket.IO and send user status ---
    const socket = io();
    socket.on('connect', () => {
    const username = localStorage.getItem('userName') || 'Anonymous';
    const path = window.location.pathname;
    let page = path;
    let action = 'Browsing';
    

    // Set more descriptive page names and actions
    switch (path) {
        case '/':
            page = 'Home Page';
            action = 'On main page';
            break;
        case '/sender':
            page = 'Sender';
            action = 'Preparing to send';
            break;
        case '/receiver':
            page = 'Receiver';
            action = 'Preparing to receive';
            break;
        case '/receiver-link':
            page = 'Receiver Link';
            action = 'Viewing files';
            break;
        case '/receiver-scan':
            page = 'QR Scanner';
            action = 'Scanning QR Code';
            break;
        case '/download-apk':
            page = 'APK Download';
            action = 'Downloading APK';
            break;
    }

    socket.emit('userUpdate', {
        username,
        page, // Send the new descriptive page name
        action
    });
});

    const downloadLink = document.getElementById('downloadLink');
    const downloadBtn = document.getElementById('downloadBtn');
    const buttonText = document.getElementById('buttonText');
    const spinner = document.getElementById('spinner');
    const downloadIcon = document.getElementById('downloadIcon');

    try {
        const response = await fetch('/api/apk-url');
        if (!response.ok) {
            throw new Error('Could not fetch the download link.');
        }

        const data = await response.json();
        const apkUrl = data.url;

        if (apkUrl) {
            downloadLink.href = apkUrl;
            downloadLink.download = 'Blinkdrop.apk'; 
            buttonText.textContent = 'Download Now';
            downloadBtn.disabled = false;
            spinner.style.display = 'none';
            downloadIcon.style.display = 'inline-block';
        } else {
            throw new Error('Download link not available.');
        }
    } catch (error) {
        console.error('Failed to get APK URL:', error);
        buttonText.textContent = 'Download Unavailable';
        errorMessage.textContent = 'Sorry, the download link could not be found. Please try again later.';
        spinner.style.display = 'none';
    }
});
