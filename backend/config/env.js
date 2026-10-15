const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  mongodbUri: process.env.MONGODB_URI,
  frontendUrl: process.env.FRONTEND_URL,
    trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 2),
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL,
    superAdminPassword: process.env.SUPER_ADMIN_PASSWORD,
  jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY,
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
  cookieName: 'ict_session',
};

function assertEnv() {
  const missing = [];
  if (!env.mongodbUri) missing.push('MONGODB_URI');
    if (!env.frontendUrl) missing.push('FRONTEND_URL');
  if (!env.jwtSecret) missing.push('JWT_SECRET');
  else if (env.jwtSecret.length < 32) missing.push('JWT_SECRET (must be at least 32 characters)');
  if (missing.length) {
    throw new Error('Missing environment variables: ' + missing.join(', '));
  }
}

module.exports = { env, assertEnv };