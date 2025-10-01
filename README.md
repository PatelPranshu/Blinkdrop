# Blinkdrop: Fast & Secure File Sharing

<img src="public/favicon.png" alt="Blinkdrop Logo" width="200"/>

Blinkdrop is a secure, private, and free file transfer platform that allows you to instantly share files of any size without needing to sign up. Built with privacy at its core, Blinkdrop uses end-to-end encryption to ensure your files are for your eyes only.

## Table of Contents

- [Blinkdrop: Fast & Secure File Sharing](#blinkdrop-fast--secure-file-sharing)
  - [Table of Contents](#table-of-contents)
  - [About The Project](#about-the-project)
    - [Key Features](#key-features)
  - [Tech Stack](#tech-stack)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
  - [Usage](#usage)
  - [Contributing](#contributing)
  - [License](#license)
  - [Contact](#contact)

## About The Project

Blinkdrop was born out of a simple idea: to create a file sharing tool that respects your privacy, requires no personal information, and just works. Our mission is to provide a frictionless experience for transferring files of any size, without the friction of sign-ups, intrusive ads, or complicated interfaces.

### Key Features

* **End-to-End Encryption**: Your files are encrypted in your browser using a 6-digit key before being uploaded. They can only be decrypted by a recipient who has the correct key.
* **No Sign-ups, No Hassle**: Just enter your name, select your files, and share.
* **Large File Support**: Blinkdrop is designed to handle large files with ease, making it perfect for videos, design projects, and more.
* **Sender-Controlled Access**: Choose to allow downloads for anyone with the key, or approve each recipient manually for an extra layer of control.
* **Automatic Deletion**: All uploaded files and their associated transfer keys are automatically and permanently deleted from our servers after 24 hours to protect your privacy.
* **Cross-Platform**: Works on any device with a web browser.

## Tech Stack

* **Backend**: Node.js, Express.js
* **Database**: MongoDB with Mongoose
* **Real-time Communication**: Socket.IO
* **File Storage**: Google Drive API
* **Frontend**: HTML, CSS, JavaScript, Tailwind CSS

## Getting Started

To get a local copy up and running follow these simple steps.

### Prerequisites

* Node.js and npm
* MongoDB instance
* Google Cloud Platform project with Google Drive API enabled and OAuth 2.0 credentials.

### Installation

1.  **Clone the repo**
    ```sh
    git clone [https://github.com/your_username/Blinkdrop.git](https://github.com/your_username/Blinkdrop.git)
    ```
2.  **Install NPM packages**
    ```sh
    npm install
    ```
3.  **Set up environment variables**
    Create a `.env` file in the root directory and add the following:
    ```
    GOOGLE_CLIENT_ID=YOUR_CLIENT_ID
    GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET
    GOOGLE_REDIRECT_URI=YOUR_REDIRECT_URI
    GOOGLE_REFRESH_TOKEN=YOUR_REFRESH_TOKEN
    MONGODB_URI=YOUR_MONGODB_URI
    GDRIVE_FOLDER_ID=YOUR_GOOGLE_DRIVE_FOLDER_ID
    ENCRYPTION_SALT=YOUR_ENCRYPTION_SALT
    ADMIN_USERNAME=YOUR_ADMIN_USERNAME
    ADMIN_PASSWORD=YOUR_ADMIN_PASSWORD
    MAX_FILE_COUNT=100
    MAX_FILE_SIZE_MB=1024
    ```
4.  **Run the app**
    ```sh
    npm start
    ```

## Usage

1.  Navigate to the homepage.
2.  Enter your name.
3.  Click "Send files" and select the files you want to share.
4.  Share the generated key or QR code with the recipient.
5.  The recipient enters the key and their name to download the files.

## Contributing

We are not actively seeking contributions to this project at this time. However, 
if you have any suggestions or ideas that you believe would make this project better, 
please feel free to contact us. We appreciate your interest in Blinkdrop.

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Contact
Pranshu Patel  - pranshuvramani@gmail.com


Project Link: [https://github.com/PatelPranshu/Blinkdrop](https://github.com/PatelPranshu/Blinkdrop)
