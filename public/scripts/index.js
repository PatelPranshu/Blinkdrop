document.addEventListener("DOMContentLoaded", () => {
    // This function runs once the entire HTML page is loaded.

    // 1. Clear any previous session key.
    sessionStorage.removeItem('activeTransferKey');

    // 2. Find the buttons on the page by their ID.
    const senderButton = document.getElementById('senderBtn');
    const receiverButton = document.getElementById('receiverBtn');
    const scanButton = document.getElementById('scanBtn');

    // 3. Attach the click event to the "Send Files" button.
    if (senderButton) {
        senderButton.addEventListener('click', () => {
            goToRole('sender');
        });
    }

    // 4. Attach the click event to the "Receive Files" button.
    if (receiverButton) {
        receiverButton.addEventListener('click', () => {
            goToRole('receiver');
        });
    }

     // Attach the click event to the "Scan QR" button
    if (scanButton) {
        scanButton.addEventListener('click', () => {
            // Check if the native "startQrScanner" function exists
            if (window.Android && typeof window.Android.startQrScanner === 'function') {
                // If we are in the app, call the new native scanner directly
                window.Android.startQrScanner();
            } else {
                // If we are in a regular web browser, go to the web scanner page
                window.location.href = '/receiver-scan';
            }
        });
    }
});

/**
 * Checks if the user's name is valid (letters, numbers, spaces).
 * @param {string} name The name to validate.
 * @returns {boolean}
 */
function isValidInput(name) {
    const regex = /^[A-Za-z0-9 ]+$/;
    return regex.test(name);
}

/**
 * Validates the name and redirects the user to the sender or receiver page.
 * @param {string} role The role ('sender' or 'receiver').
 */
function goToRole(role) {
    const nameInput = document.getElementById('userName');
    const name = nameInput.value.trim();

    if (!name) {
        alert("Please enter your name before selecting a role.");
        return;
    }
    if (!isValidInput(name)) {
        alert("Invalid name. Please use only letters, numbers, and spaces.");
        return;
    }

    localStorage.setItem('userName', name);

    // **THIS IS THE NEW NAVIGATION LOGIC**
    // Check if the "Android" bridge object exists in the JavaScript world
    if (window.Android && typeof window.Android.navigate === 'function') {
        // If it exists, we are inside the app. Use the bridge to navigate.
        window.Android.navigate('/' + role);
    } else {
        // If not, we are in a normal browser. Use standard web navigation.
        window.location.href = window.location.origin + '/' + role;
    }
}

