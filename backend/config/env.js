const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  mongodbUri: process.env.MONGODB_URI,
  frontendUrl: process.env.FRONTEND_URL,
    trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 2),
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL,
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD,
};

function assertEnv() {
  const missing = [];
  if (!env.mongodbUri) missing.push('MONGODB_URI');
  if (!env.frontendUrl) missing.push('FRONTEND_URL');
  if (missing.length) {
    throw new Error('Missing environment variables: ' + missing.join(', '));
  }
}

module.exports = { env, assertEnv };