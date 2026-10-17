/**
 * lib/paystack.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Everything this app needs from Paystack, in one small module. Built against
 * the official API reference:
 *
 *   Initialize transaction   POST   https://api.paystack.co/transaction/initialize
 *   Verify transaction       GET    https://api.paystack.co/transaction/verify/:reference
 *   Create customer          POST   https://api.paystack.co/customer
 *   Create DVA               POST   https://api.paystack.co/dedicated_account
 *   Fetch DVA providers      GET    https://api.paystack.co/dedicated_account/available_providers
 *   Deactivate DVA           DELETE https://api.paystack.co/dedicated_account/:id
 *   Webhooks                 x-paystack-signature = HMAC-SHA512(rawBody, SECRET_KEY)
 *
 * IMPORTANT MONEY RULE
 * ────────────────────
 * Paystack works in the SUBUNIT of the currency: kobo for NGN, pesewas for GHS,
 * cents for USD. Everything that crosses the wire therefore goes through
 * toSubunit()/fromSubunit() so a ₦1,000 deposit is never sent as 1000 kobo.
 *
 * Environment variables (see PAYSTACK_SETUP.md):
 *   PAYSTACK_SECRET_KEY          sk_test_xxx / sk_live_xxx   (required)
 *   PAYSTACK_PUBLIC_KEY          pk_test_xxx / pk_live_xxx   (optional, front-end only)
 *   PAYSTACK_DVA_PREFERRED_BANK  wema-bank (default) | titan-paystack | paystack-titan
 *   PAYSTACK_WEBHOOK_IPS_ONLY    "true" to reject webhook calls from unknown IPs
 */
const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = 'https://api.paystack.co';

/** Paystack's documented webhook source IPs. */
const PAYSTACK_WEBHOOK_IPS = ['52.31.139.75', '52.49.173.169', '52.214.14.220'];

function secretKey() { return process.env.PAYSTACK_SECRET_KEY || ''; }
function isConfigured() { return Boolean(secretKey()); }
function isLive() { return secretKey().startsWith('sk_live'); }

const client = axios.create({ baseURL: BASE_URL, timeout: 20000 });
client.interceptors.request.use(config => {
  config.headers = {
    ...config.headers,
    Authorization: `Bearer ${secretKey()}`,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  };
  return config;
});

/** Turn a Paystack error into one clean Error with a readable message. */
function wrap(e, what) {
  const body = e.response?.data;
  const msg = body?.message || body?.data?.message || e.message || 'Paystack request failed';
  const err = new Error(`${what}: ${msg}`);
  err.status = e.response?.status || 502;
  err.paystack = body || null;
  return err;
}

function toSubunit(amount) { return Math.round(Number(amount) * 100); }
function fromSubunit(subunit) { return Number(subunit) / 100; }

/** Start a hosted checkout and get the URL to send the customer to. */
async function initializeTransaction({
  email, amount, currency = 'NGN', reference, callback_url,
  metadata = {}, channels, customerName,
}) {
  if (!isConfigured()) throw new Error('PAYSTACK_SECRET_KEY is not set');
  const payload = {
    email,
    amount: toSubunit(amount),
    currency,
    reference,
    callback_url,
    metadata: {
      ...metadata,
      custom_fields: metadata.custom_fields || (customerName
        ? [{ display_name: 'Customer', variable_name: 'customer', value: customerName }]
        : []),
    },
  };
  if (Array.isArray(channels) && channels.length) payload.channels = channels;
  try {
    const r = await client.post('/transaction/initialize', payload);
    const d = r.data?.data;
    if (!d?.authorization_url) throw new Error(r.data?.message || 'no authorization_url returned');
    return d;
  } catch (e) { throw wrap(e, 'Paystack initialize'); }
}

async function verifyTransaction(reference) {
  if (!isConfigured()) throw new Error('PAYSTACK_SECRET_KEY is not set');
  try {
    const r = await client.get(`/transaction/verify/${encodeURIComponent(reference)}`);
    return r.data?.data || null;
  } catch (e) {
    if (e.response?.status === 404) return null;
    throw wrap(e, 'Paystack verify');
  }
}

async function createCustomer({ email, first_name, last_name, phone }) {
  if (!isConfigured()) throw new Error('PAYSTACK_SECRET_KEY is not set');
  try {
    const r = await client.post('/customer', { email, first_name, last_name, phone });
    return r.data?.data || null;
  } catch (e) {
    const msg = String(e.response?.data?.message || '');
    if (e.response?.status === 400 && /already exist/i.test(msg)) return await fetchCustomer(email);
    throw wrap(e, 'Paystack create customer');
  }
}

async function fetchCustomer(emailOrCode) {
  try {
    const r = await client.get(`/customer/${encodeURIComponent(emailOrCode)}`);
    return r.data?.data || null;
  } catch (e) { throw wrap(e, 'Paystack fetch customer'); }
}

function preferredBank() { return process.env.PAYSTACK_DVA_PREFERRED_BANK || 'wema-bank'; }

async function availableProviders() {
  try {
    const r = await client.get('/dedicated_account/available_providers');
    return r.data?.data || [];
  } catch (e) { throw wrap(e, 'Paystack DVA providers'); }
}

async function createDedicatedAccount({ customerCode, bank }) {
  if (!isConfigured()) throw new Error('PAYSTACK_SECRET_KEY is not set');
  try {
    const r = await client.post('/dedicated_account', {
      customer: customerCode,
      preferred_bank: bank || preferredBank(),
    });
    const d = r.data?.data;
    if (!d?.account_number) throw new Error(r.data?.message || 'no account_number returned');
    return d;
  } catch (e) { throw wrap(e, 'Paystack create dedicated account'); }
}

async function assignDedicatedAccount({ email, first_name, last_name, phone, bank, country = 'NG' }) {
  if (!isConfigured()) throw new Error('PAYSTACK_SECRET_KEY is not set');
  try {
    const r = await client.post('/dedicated_account/assign', {
      email, first_name, last_name, phone,
      preferred_bank: bank || preferredBank(),
      country,
    });
    return r.data?.data || null;
  } catch (e) { throw wrap(e, 'Paystack assign dedicated account'); }
}

async function deactivateDedicatedAccount(dedicatedAccountId) {
  try {
    const r = await client.delete(`/dedicated_account/${encodeURIComponent(dedicatedAccountId)}`);
    return r.data?.data || null;
  } catch (e) { throw wrap(e, 'Paystack deactivate dedicated account'); }
}

async function resolveBankAccount({ account_number, bank_code }) {
  try {
    const r = await client.get('/bank/resolve', { params: { account_number, bank_code } });
    return r.data?.data || null;
  } catch (e) { throw wrap(e, 'Paystack resolve account'); }
}

function verifyWebhookSignature(rawBody, signature) {
  if (!signature || !rawBody || !isConfigured()) return false;
  const expected = crypto.createHmac('sha512', secretKey()).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isPaystackIp(ip) {
  const clean = String(ip || '').replace('::ffff:', '');
  return PAYSTACK_WEBHOOK_IPS.includes(clean);
}

module.exports = {
  BASE_URL, PAYSTACK_WEBHOOK_IPS,
  isConfigured, isLive, toSubunit, fromSubunit,
  initializeTransaction, verifyTransaction,
  createCustomer, fetchCustomer,
  preferredBank, availableProviders, createDedicatedAccount,
  assignDedicatedAccount, deactivateDedicatedAccount, resolveBankAccount,
  verifyWebhookSignature, isPaystackIp, client,
};
