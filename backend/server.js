const app = require('./app');
const { env, assertEnv } = require('./config/env');
const { connectDb } = require('./config/db');
const logger = require('./config/logger');
require('./models');
const { bootstrap } = require('./scripts/bootstrap');

async function start() {
  assertEnv();
    await connectDb(env.mongodbUri);
  await bootstrap();
  app.listen(env.port, () => {
    logger.info(`ICT API listening on port ${env.port}`);
  });
}

start().catch((err) => {
  logger.error({ err: err.message }, 'Startup failed');
  process.exit(1);
});