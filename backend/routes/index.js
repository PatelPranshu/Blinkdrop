// backend/routes/index.js
const express = require('express');
const transferRoutes = require('./transferRoutes');
const adminRoutes = require('./adminRoutes');
const miscRoutes = require('./miscRoutes');

const router = express.Router();

router.use('/', miscRoutes); // Mount misc routes first
router.use('/', transferRoutes); // Mount transfer routes
router.use('/admin', adminRoutes); // Mount admin routes under /admin path

module.exports = router;