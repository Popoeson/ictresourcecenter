const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const { env } = require('./config/env');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const structureRoutes = require('./routes/structureRoutes');
const lookupRoutes = require('./routes/lookupRoutes');
const priceRoutes = require('./routes/priceRoutes');
const studentRoutes = require('./routes/studentRoutes');
const importRoutes = require('./routes/importRoutes');
const adminRoutes = require('./routes/adminRoutes');
const studentSearchRoutes = require('./routes/studentSearchRoutes');
const pricingRoutes = require('./routes/pricingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const receiptRoutes = require('./routes/receiptRoutes');
const paymentAdminRoutes = require('./routes/paymentAdminRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const tokenAdminRoutes = require('./routes/tokenAdminRoutes');
const handoutAdminRoutes = require('./routes/handoutAdminRoutes');
const handoutRoutes = require('./routes/handoutRoutes');
const handoutOrderAdminRoutes = require('./routes/handoutOrderAdminRoutes');
const submissionAdminRoutes = require('./routes/submissionAdminRoutes');
const exportRoutes = require('./routes/exportRoutes');
const reportRoutes = require('./routes/reportRoutes');

app.set('trust proxy', env.trustProxyHops);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.frontendUrl, credentials: true }));
// The Paystack webhook needs the raw body, so it is mounted before the JSON parser
app.use('/api/paystack/webhook', webhookRoutes);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  const db = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ success: true, data: { status: 'ok', db, time: new Date().toISOString() } });
});

// TEMPORARY: checks that rate limiting sees the real visitor IP. Remove in Phase 8.
app.get('/api/_ip', (req, res) => {
  res.json({ success: true, data: { ip: req.ip, forwardedFor: req.headers['x-forwarded-for'] || null } });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin/prices', priceRoutes);
app.use('/api/admin/students', studentRoutes);
app.use('/api/admin/import', importRoutes);
app.use('/api/admin/admins', adminRoutes);
app.use('/api/admin/payments', paymentAdminRoutes);
app.use('/api/admin/tokens', tokenAdminRoutes);
app.use('/api/admin/handouts', handoutAdminRoutes);
app.use('/api/admin/handout-orders', handoutOrderAdminRoutes);
app.use('/api/admin/submissions', submissionAdminRoutes);
app.use('/api/admin/export', exportRoutes);
app.use('/api/admin/reports', reportRoutes);

// Keep this one after the other /api/admin routers: it applies login protection to everything under /api/admin
app.use('/api/admin', structureRoutes);
app.use('/api/lookups', lookupRoutes);
app.use('/api/students', studentSearchRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/handouts', handoutRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;