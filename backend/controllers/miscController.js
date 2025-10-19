const axios = require('axios');

// Gets application configuration limits
exports.getAppConfig = (req, res, next) => {
    try {
        // Read values from environment variables with defaults
        const maxFileCount = parseInt(process.env.MAX_FILE_COUNT, 10) || 100;
        const maxFileSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 1024;

        // Basic validation
        if (isNaN(maxFileCount) || maxFileCount <= 0) {
             console.warn("Invalid or missing MAX_FILE_COUNT env variable, using default 100.");
             maxFileCount = 100;
        }
         if (isNaN(maxFileSizeMB) || maxFileSizeMB <= 0) {
              console.warn("Invalid or missing MAX_FILE_SIZE_MB env variable, using default 1024.");
              maxFileSizeMB = 1024;
         }


        res.status(200).json({
            maxFileCount: maxFileCount,
            maxFileSizeMB: maxFileSizeMB,
        });
    } catch (err) {
        console.error("❌ Get App Config Error:", err);
        next(err || { status: 500, message: "Could not retrieve app configuration." });
    }
};

// Gets the latest Android APK download URL from GitHub releases
exports.getApkUrl = async (req, res, next) => {
    try {
        const githubUrl = process.env.GITHUB_APP_URL; // e.g., https://api.github.com/repos/YourUser/YourRepo/releases/latest

        if (!githubUrl) {
             console.error("GITHUB_APP_URL environment variable is not set.");
             return next({ status: 500, message: 'App download source is not configured.' });
        }


        // Fetch the latest release data from GitHub API
        const response = await axios.get(githubUrl, {
             headers: { 'Accept': 'application/vnd.github.v3+json' } // Recommended header
        });

        // Ensure assets array exists
        if (!response.data || !Array.isArray(response.data.assets)) {
             throw new Error('Invalid response structure from GitHub API.');
        }


        // Find the first asset ending with '.apk'
        const apkAsset = response.data.assets.find(asset =>
            asset && typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.apk')
        );

        if (apkAsset && apkAsset.browser_download_url) {
            // Send the direct download URL
            res.status(200).json({ url: apkAsset.browser_download_url });
        } else {
             console.warn("No .apk asset found in the latest GitHub release assets.");
            // Send a specific error or status if no APK is found
             // Using 404 might be appropriate here
            next({ status: 404, message: 'No APK file found in the latest release.' });
        }
    } catch (error) {
        console.error('❌ Error fetching latest release from GitHub:', error.message);
         // Handle potential Axios errors (e.g., rate limiting, network issues)
         let status = 500;
         let message = 'Could not retrieve the download link.';
         if (error.response) {
              // The request was made and the server responded with a status code
              // that falls out of the range of 2xx
              status = error.response.status || 500;
              message = `GitHub API error (${status}): ${error.response.data?.message || error.message}`;
              console.error('GitHub API Response Error Data:', error.response.data);
         } else if (error.request) {
              // The request was made but no response was received
              message = 'No response received from GitHub API.';
         }
        next({ status, message });
    }
};