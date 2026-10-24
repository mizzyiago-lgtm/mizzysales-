'use strict';
// MySQL layer — runs NEXT TO MongoDB. Nothing here touches Mongo.
// Safe by default: if no MySQL settings are present the site starts normally
// and MySQL features stay switched off.
//
// Env vars (use either MYSQL_URL, or the separate pieces):
//   MYSQL_URL=mysql://user:password@host:3306/dbname
//   MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
//   MYSQL_SSL=true      (most hosted providers require this)

let mysql;
try { mysql = require('mysql2/promise'); } catch (e) { mysql = null; }

let pool = null;
let ready = false;

function configured() {
  return !!(String(process.env.MYSQL_URL || '').trim() || String(process.env.MYSQL_HOST || '').trim());
}

function buildConfig() {
  const ssl = String(process.env.MYSQL_SSL || '').toLowerCase() === 'true'
    ? { rejectUnauthorized: String(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' }
    : undefined;
  const common = {
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 5),
    connectTimeout: 10000,
    decimalNumbers: true, // return DECIMAL columns as JS numbers
    timezone: 'Z',
    ssl,
  };
  if (String(process.env.MYSQL_URL || '').trim()) return { uri: process.env.MYSQL_URL.trim(), ...common };
  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ...common,
  };
}

// Tables are created automatically on first start (CREATE TABLE IF NOT EXISTS).
// user_id holds the existing Mongo user _id as text, so MySQL wallets can point at
// your current users without moving them first.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS wallets (
     user_id    VARCHAR(24)   NOT NULL PRIMARY KEY,
     balance    DECIMAL(16,2) NOT NULL DEFAULT 0,
     updated_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     CONSTRAINT wallets_balance_nonneg CHECK (balance >= 0)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS wallet_transactions (
     id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
     user_id       VARCHAR(24)   NOT NULL,
     type          VARCHAR(32)   NOT NULL,
     amount        DECIMAL(16,2) NOT NULL,
     balance_after DECIMAL(16,2) NOT NULL,
     description   VARCHAR(500)  NULL,
     status        VARCHAR(16)   NOT NULL DEFAULT 'success',
     tx_ref        VARCHAR(120)  NULL,
     created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uq_wallet_tx_ref (tx_ref),
     KEY idx_wallet_tx_user (user_id, created_at)
   ) ENGINE=InnoDB`,
];

async function init() {
  if (!configured()) {
    console.log('[mysql] not configured (no MYSQL_URL / MYSQL_HOST) — skipping, MongoDB only');
    return false;
  }
  if (!mysql) {
    console.error('[mysql] mysql2 package is missing — run: npm install');
    return false;
  }
  try {
    pool = mysql.createPool(buildConfig());
    await pool.query('SELECT 1');
    for (const sql of SCHEMA) await pool.query(sql);
    ready = true;
    console.log('MySQL connected, tables ready');
    return true;
  } catch (e) {
    ready = false;
    console.error('[mysql] connection failed:', e.message);
    return false;
  }
}

function isReady() { return ready && !!pool; }
function getPool() { return pool; }

async function ping() {
  if (!isReady()) return false;
  try { await pool.query('SELECT 1'); return true; } catch (e) { return false; }
}

// Move money safely. Everything below happens as ONE all-or-nothing transaction:
// lock the wallet row, check funds, update the balance, write the ledger row.
//   type:   'deposit' | 'refund' | 'admin_credit' | 'referral_commission'  -> adds
//           'purchase' | 'debit'  | 'admin_debit'                          -> subtracts
//   txRef:  optional unique reference (e.g. payment reference). Sending the same
//           txRef twice will NOT credit twice — you get { duplicate: true }.
const CREDIT_TYPES = new Set(['deposit', 'refund', 'admin_credit', 'referral_commission']);

async function applyTransaction({ userId, type, amount, description = '', txRef = null }) {
  if (!isReady()) throw new Error('MySQL is not ready');
  userId = String(userId || '');
  amount = Math.round(Number(amount) * 100) / 100;
  if (!userId) throw new Error('userId required');
  if (!(amount > 0)) throw new Error('amount must be a positive number');
  const sign = CREDIT_TYPES.has(type) ? 1 : -1;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, 0)', [userId]);
    const [rows] = await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [userId]);
    const current = Number(rows[0].balance);
    const next = Math.round((current + sign * amount) * 100) / 100;
    if (next < 0) {
      await conn.rollback();
      return { ok: false, error: 'insufficient_funds', balance: current };
    }
    await conn.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [next, userId]);
    try {
      await conn.query(
        'INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, status, tx_ref) VALUES (?,?,?,?,?,?,?)',
        [userId, type, amount, next, String(description).slice(0, 500), 'success', txRef]
      );
    } catch (e) {
      if (e && e.code === 'ER_DUP_ENTRY') {
        await conn.rollback();
        return { ok: true, duplicate: true, balance: current };
      }
      throw e;
    }
    await conn.commit();
    return { ok: true, duplicate: false, balance: next };
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    throw e;
  } finally {
    conn.release();
  }
}

async function getBalance(userId) {
  if (!isReady()) throw new Error('MySQL is not ready');
  const [rows] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [String(userId)]);
  return rows.length ? Number(rows[0].balance) : 0;
}

async function listTransactions(userId, limit = 50) {
  if (!isReady()) throw new Error('MySQL is not ready');
  const [rows] = await pool.query(
    'SELECT id, type, amount, balance_after, description, status, tx_ref, created_at FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    [String(userId), Math.min(Number(limit) || 50, 200)]
  );
  return rows;
}

module.exports = { init, isReady, getPool, ping, configured, applyTransaction, getBalance, listTransactions };
