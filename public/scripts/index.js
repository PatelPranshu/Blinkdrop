document.addEventListener("DOMContentLoaded", () => {
    // This function runs once the entire HTML page is loaded.

    // 1. Clear any previous session key.
    sessionStorage.removeItem('activeTransferKey');

    // 2. Find the buttons on the page by their ID.
    const senderButton = document.getElementById('senderBtn');
    const receiverButton = document.getElementById('receiverBtn');

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
    window.location.href = `/${role}`;
}

