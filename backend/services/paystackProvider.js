const crypto = require('crypto');
const axios = require('axios');
const { env } = require('../config/env');
const logger = require('../config/logger');
const { AppError } = require('../middleware/errorHandler');

// All Paystack-specific calls live in this file (initialize, verify, parseWebhook).
const BASE_URL = 'https://api.paystack.co';

function client() {
  if (!env.paystackSecretKey) {
    throw new AppError('Payments are not available right now. Please try again later.', 503, 'PAYMENTS_UNAVAILABLE');
  }
  return axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    headers: { Authorization: 'Bearer ' + env.paystackSecretKey },
  });
}

// Builds the Paystack request. If a split code is set, Paystack applies the split and shows it in its own
// dashboard. The amount charged and recorded on this site stays the full amount.

function buildInitializeBody({ email, amountKobo, reference, callbackUrl, metadata, split }) {
  const body = {
    email,
    amount: amountKobo,
    currency: 'NGN',
    reference,
    callback_url: callbackUrl,
    metadata: metadata || {},
  };
    const splitCode = (split && split.code) || (env.paystackSplitCode || '').trim();
  if (splitCode) body.split_code = splitCode;
  return body;
}

async function initialize(params) {
  try {
    const res = await client().post('/transaction/initialize', buildInitializeBody(params));
    const d = res.data && res.data.data;
    if (!res.data || !res.data.status || !d || !d.authorization_url) {
      throw new Error('Unexpected response from Paystack');
    }
    return { authorizationUrl: d.authorization_url, accessCode: d.access_code, reference: d.reference };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error(
      { reference: params.reference, status: err.response && err.response.status, msg: err.response && err.response.data && err.response.data.message, err: err.message },
      'Paystack initialize failed'
    );
    throw new AppError('Could not start the payment. Please try again.', 502, 'PAYSTACK_ERROR');
  }
}

// Returns { status, amount, currency, transactionId, channel, gatewayResponse, paidAt, reference }.
// status is Paystack's status ("success", "failed", "abandoned", "pending"...) or "not_found".
async function verify(reference) {
  try {
    const res = await client().get('/transaction/verify/' + encodeURIComponent(reference));
    const d = res.data && res.data.data;
    if (!d) throw new Error('Unexpected response from Paystack');
    return {
      status: d.status,
      amount: d.amount,
      currency: d.currency,
      transactionId: d.id !== undefined ? String(d.id) : undefined,
      channel: d.channel,
      gatewayResponse: d.gateway_response,
      paidAt: d.paid_at ? new Date(d.paid_at) : undefined,
      reference: d.reference,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err.response && err.response.status === 404) return { status: 'not_found', reference };
    logger.error(
      { reference, status: err.response && err.response.status, err: err.message },
      'Paystack verify failed'
    );
    throw new AppError('We could not confirm the payment yet. Please try again shortly.', 502, 'PAYSTACK_ERROR');
  }
}

// rawBody must be the raw request Buffer (not the parsed JSON).
function verifySignature(rawBody, signature) {
  if (!env.paystackSecretKey || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac('sha512', env.paystackSecretKey).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Returns { event, reference, data } for a genuine webhook, or null when the signature is wrong.
function parseWebhook(rawBody, signature) {
  if (!verifySignature(rawBody, signature)) return null;
  try {
    const body = JSON.parse(rawBody.toString('utf8'));
    return { event: body.event, reference: body.data && body.data.reference, data: body.data || {} };
  } catch (e) {
    return null;
  }
}

module.exports = { initialize, verify, parseWebhook, verifySignature };