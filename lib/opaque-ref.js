const crypto = require('crypto');

function deriveKey(secret) {
  const value = String(secret || '');
  if (value.length < 32) throw new Error('A secure reference key is unavailable.');
  return crypto.createHash('sha256').update(`mizzy-sales:opaque-ref:${value}`).digest();
}

function sealRef(purpose, value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(String(purpose)));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `mys1.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')}`;
}

function openRef(purpose, token, secret) {
  if (typeof token !== 'string' || !/^mys1\.[A-Za-z0-9_-]{40,500}$/.test(token)) {
    throw new Error('Invalid reference.');
  }
  const bytes = Buffer.from(token.slice(5), 'base64url');
  if (bytes.length < 29) throw new Error('Invalid reference.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(String(purpose)));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid reference.');
  return value;
}

module.exports = { sealRef, openRef };
