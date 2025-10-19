// backend/middleware/securityHeaders.js
const setupSecurityHeaders = (app) => {
    app.disable('x-powered-by');
    app.use((req, res, next) => {
         res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
         res.setHeader('X-Frame-Options', 'SAMEORIGIN');
         res.setHeader('X-Content-Type-Options', 'nosniff');
         res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
         res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
         // Adjust CSP as needed, especially script-src if using inline scripts/eval
         res.setHeader('Content-Security-Policy',
             "default-src 'self'; " +
             "script-src 'self' 'unsafe-inline' https://cdn.socket.io https://cdn.jsdelivr.net https://unpkg.com https://pagead2.googlesyndication.com https://ep2.adtrafficquality.google; " +
             "style-src 'self' 'unsafe-inline'; " +
             "img-src 'self' data: https://ep1.adtrafficquality.google; " +
             "connect-src 'self' https://ep1.adtrafficquality.google https://cdn.socket.io https://pagead2.googlesyndication.com; " +
             "frame-src 'self' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://ep2.adtrafficquality.google https://www.google.com; " +
             "form-action 'self';"
         );
        next();
    });
};
module.exports = setupSecurityHeaders;