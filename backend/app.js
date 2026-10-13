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

const app = express();

app.set('trust proxy', env.trustProxyHops);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.frontendUrl, credentials: true }));
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
app.use('/api/admin', structureRoutes);
app.use('/api/lookups', lookupRoutes);
app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;