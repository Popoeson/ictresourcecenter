const mongoose = require('mongoose');
const logger = require('./logger');

async function connectDb(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  logger.info({ database: mongoose.connection.name }, 'MongoDB connected');
}

module.exports = { connectDb };