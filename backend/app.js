const express = require('express');

const app = express();

app.disable('x-powered-by');
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
});

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
});

module.exports = app;