// ── Marketplace 3 (Sujan Department reseller API) ──────────────────────────────
// Pulls every product from https://api.sujandepartment.com/reseller/v1 and resells it.
// A product is only shown to customers once the admin sets a selling price.
// Admin can switch Marketplace 3 on/off; when it is off, customers see a
// maintenance screen and cannot buy.
//
// .env:
//   SUJAN_API_KEY=rs_your_secret_key
//   SUJAN_BASE_URL=https://api.sujandepartment.com/reseller/v1   (optional, this is the default)
//   SUJAN_LOW_BALANCE_NGN=5000                           (optional, email alert level)
//   SUJAN_DEFAULT_MARKUP_NGN=300                         (optional, default markup)
//   ADMIN_ALERT_EMAIL=you@example.com                  (where alerts are emailed)
//
// ── DELIVERY GUARANTEE ──────────────────────────────────────────────────────
// The supplier returns the purchased credentials in the POST /orders response.
// This module is built so a customer can never be charged without receiving
// them:
//   1. An order record is written BEFORE the customer is charged, and carries a
//      client-supplied idempotency ref, so a double-tap or a retry after a
//      dropped connection returns the SAME order/keys instead of charging again.
//   2. The moment the supplier answers, the keys are saved to the order AND to
//      the customer's purchases (both with retries) before anything else runs.
//   3. If the supplier gives a definite error (out of stock, low supplier
//      balance, bad request…) the customer is refunded automatically.
//   4. If the outcome is UNKNOWN (timeout, network drop, supplier 5xx) the order
//      is held as "review" - the customer is NOT refunded blindly (the supplier
//      may have delivered) - and the admin is emailed. The admin panel can then
//      deliver the keys manually or refund.
//   5. A background reconciler re-syncs any delivered order whose keys did not
//      reach the customer's purchases, and flags orders stuck in "pending".
//   6. Keys are always returned in the buy response, and are also available to
//      the customer through GET /api/market3/orders.

const axios = require('axios');
// Optional: route supplier calls through a static-IP proxy (set SUPPLIER_PROXY_URL on Render)
// so the supplier only has to whitelist ONE fixed IP.
let supplierProxyAgent = null;
if (process.env.SUPPLIER_PROXY_URL) {
  try { const { HttpsProxyAgent } = require('https-proxy-agent'); supplierProxyAgent = new HttpsProxyAgent(process.env.SUPPLIER_PROXY_URL); }
  catch (e) { console.error('SUPPLIER_PROXY_URL set but https-proxy-agent failed to load:', e.message); }
}
const SUPPLIER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const crypto = require('crypto');
const { sealRef, openRef } = require('./opaque-ref');

let resolveLogPicture = () => '';
try { resolveLogPicture = require('./market2').resolveLogPicture || resolveLogPicture; } catch (e) { /* optional */ }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function withRetry(fn, tries = 3, delayMs = 250) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; if (i < tries - 1) await sleep(delayMs * (i + 1)); }
  }
  throw last;
}

function register(app, deps) {
  const { mongoose, User, Transaction, auth, anyAdminAuth, sendAdminEmail } = deps;
  const brandLogoFor = deps.brandLogoFor || (async () => '');

  let runtimeApiKey = '';
  let runtimeBaseUrl = '';
  const encryptionKey = () => crypto.createHash('sha256').update(String(process.env.JWT_SECRET || 'provider-config-key')).digest();
  function encryptSecret(value) { const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey(),iv); const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]); return 'v1:'+iv.toString('hex')+':'+cipher.getAuthTag().toString('hex')+':'+encrypted.toString('hex'); }
  function decryptSecret(value) { try { const p=String(value||'').split(':'); if(p.length!==4||p[0]!=='v1')return ''; const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(p[1],'hex')); decipher.setAuthTag(Buffer.from(p[2],'hex')); return Buffer.concat([decipher.update(Buffer.from(p[3],'hex')),decipher.final()]).toString('utf8'); } catch(e) { return ''; } }
  const DEFAULT_BASE = 'https://api.sujandepartment.com/reseller/v1';
  const baseUrl = () => String(runtimeBaseUrl || process.env.SUJAN_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const apiKey = () => String(runtimeApiKey || process.env.SUJAN_API_KEY || '').trim();

  // ── Models ────────────────────────────────────────────────────────────────
  const cfgSchema = new mongoose.Schema({
    key: { type: String, default: 'main', unique: true },
    market3Enabled: { type: Boolean, default: true },
    maintenanceMessage: { type: String, default: 'This marketplace is under maintenance. Please check back shortly.' },
    apiKeyCipher: { type: String, default: '' },          // legacy (previous provider) - never used
    sujanKeyCipher: { type: String, default: '' },
    customBaseUrl: { type: String, default: '' },
    lowBalanceNgn: { type: Number, default: Number(process.env.SUJAN_LOW_BALANCE_NGN || 5000) },
    alertEmail: { type: String, default: '' },
    defaultMarkupNgn: { type: Number, default: null },   // MYS-MARKUP-CONTROLS: null = use the built-in default
    lastBalance: { type: Number, default: 0 },
    lastBalanceAt: { type: Date, default: null },
    lastBalanceError: { type: String, default: '' },
    lastAlertAt: { type: Date, default: null }
  });
  const Market3Config = mongoose.models.Market3Config || mongoose.model('Market3Config', cfgSchema);

  const priceSchema = new mongoose.Schema({
    productId: { type: Number, unique: true, required: true },
    sellPrice: { type: Number, default: 0 },   // 0 = hidden from users
    enabled: { type: Boolean, default: true },
    customTitle: { type: String, default: '' },
    description: { type: String, default: '' },
    picture: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now }
  });
  const Market3Price = mongoose.models.Market3Price || mongoose.model('Market3Price', priceSchema);

  const orderSchema = new mongoose.Schema({
    ref: { type: String, unique: true, required: true },            // idempotency key
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    userEmail: String,
    productId: Number,
    productName: String,
    title: String,
    quantity: Number,
    unitSell: Number,
    sellTotal: Number,
    costTotal: Number,
    profit: Number,
    status: { type: String, default: 'pending', index: true },     // pending | delivered | partial | review | failed | refunded
    debited: { type: Boolean, default: false },
    refunded: { type: Boolean, default: false },
    refundedAmount: { type: Number, default: 0 },
    supplierOrderId: String,
    keys: [String],
    deliverySynced: { type: Boolean, default: false },              // keys are in the customer's purchases
    txRecorded: { type: Boolean, default: false },
    note: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now }
  });
  const Market3Order = mongoose.models.Market3Order || mongoose.model('Market3Order', orderSchema);

  async function getCfg() {
    let c = await Market3Config.findOne({ key: 'main' });
    if (!c) c = await Market3Config.create({ key: 'main' });
    runtimeApiKey = c.sujanKeyCipher ? decryptSecret(c.sujanKeyCipher) : '';
    // Ignore any base URL saved for the previous provider.
    runtimeBaseUrl = /^https:\/\/api\.sujandepartment\.com(\/|$)/i.test(c.customBaseUrl || '') ? c.customBaseUrl : '';
    return c;
  }

  // ── Supplier API client ───────────────────────────────────────────────────
  // err.status    HTTP status (0 when no response was received)
  // err.ambiguous true when we cannot tell whether the supplier processed the
  //               request (timeout / network error / 5xx). Never auto-refund these.
  async function supplier(method, path, { params, data, timeout } = {}) {
    if (!apiKey()) {
      const e = new Error('Marketplace 3 is not connected yet (SUJAN_API_KEY missing).');
      e.status = 503; e.ambiguous = false; throw e;
    }
    try {
      const r = await axios({
        method, url: baseUrl() + path, params, data, timeout: timeout || 30000,
        headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': SUPPLIER_UA },
        ...(supplierProxyAgent ? { httpsAgent: supplierProxyAgent, proxy: false } : {})
      });
      return r.data;
    } catch (err) {
      const status = err.response?.status || 0;
      const body = err.response?.data || {};
      const map = {
        401: 'Provider API key is invalid.', 402: 'Supplier wallet balance is too low.',
        404: 'Product not found.', 409: 'This product is out of stock.', 422: 'The supplier rejected this request.', 429: 'Too many requests - try again shortly.'
      };
      const rawTxt = typeof body === 'string' ? body : JSON.stringify(body || {});
      const fw = /imunify360|bot-protection|cloudflare|access denied/i.test(rawTxt) ? 'The supplier firewall blocked this server\'s IP. Ask the supplier to whitelist your Render outbound IPs (or set SUPPLIER_PROXY_URL).' : '';
      const bodyMsg = fw || body && (body.detail || body.message || (typeof body.error === 'string' ? body.error : '') || body.error?.message);
      const e = new Error(bodyMsg || map[status] || err.message || 'Supplier request failed');
      e.status = status || 502;
      e.code = (body && (body.code || (typeof body.error === 'string' ? body.error : ''))) || '';
      e.ambiguous = !status || status >= 500;
      throw e;
    }
  }

  // The supplier wraps lists/objects in different envelopes; unwrap them all.
  const unwrapList = (d) => {
    if (Array.isArray(d)) return d;
    for (const k of ['results', 'data', 'products', 'items']) {
      if (Array.isArray(d?.[k])) return d[k];
      if (Array.isArray(d?.[k]?.products)) return d[k].products;
      if (Array.isArray(d?.[k]?.items)) return d[k].items;
    }
    return [];
  };
  const unwrapObj = (d) => (d && typeof d === 'object' && d.data && typeof d.data === 'object' && !Array.isArray(d.data)) ? { ...d, ...d.data } : (d || {});

  // Work out the supplier's price (your cost) from whatever field they use.
  // Accepts numbers, "1,500", "₦1500.00", or a nested { amount } / { value } object.
  function readCost(p) {
    if (!p || typeof p !== 'object') return 0;
    const parse = (v) => {
      if (v && typeof v === 'object') v = v.amount ?? v.value ?? v.price ?? v.ngn ?? v.NGN;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v === 'string') { const n = parseFloat(v.replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; }
      return null;
    };
    // Minor units (kobo): price_minor 140000 = ₦1,400.00
    for (const k of ['price_minor', 'unit_price_minor', 'cost_minor', 'amount_minor']) {
      const n = parse(p[k]);
      if (n !== null && n > 0) return n / 100;
    }
    for (const k of ['price', 'cost', 'unit_price', 'reseller_price', 'wholesale_price', 'price_ngn', 'price_per_unit', 'unit_cost', 'rate', 'amount', 'base_price', 'selling_price']) {
      const n = parse(p[k]);
      if (n !== null && n > 0) return n;
    }
    return 0;
  }

  // Work out stock from whatever fields the supplier uses.
  // Returns { count: number|null, out: boolean }. Unknown stock is NOT treated as zero.
  const num = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  function readStock(p) {
    if (!p || typeof p !== 'object') return { count: null, out: false };
    let out = false;
    for (const k of ['in_stock', 'is_in_stock', 'available', 'is_available', 'inStock']) if (p[k] === false || p[k] === 0 || p[k] === 'false') out = true;
    if (p.out_of_stock === true || p.sold_out === true) out = true;
    if (/out.?of.?stock|sold.?out|unavailable/i.test(String(p.status || p.stock_status || ''))) out = true;
    let count = null;
    for (const k of ['stock', 'stock_count', 'stock_quantity', 'available_stock', 'available_quantity', 'available', 'quantity', 'qty', 'inventory', 'remaining', 'count']) {
      let v = p[k];
      if (v && typeof v === 'object') v = v.count ?? v.available ?? v.quantity ?? v.stock;
      const n = num(v);
      if (n !== null) { count = Math.max(0, n); break; }
    }
    if (count !== null && count === 0) out = true;
    if (count !== null && count > 0 && !out) return { count, out: false };
    return { count, out };
  }

  // ── Catalogue (categories + every product page), cached 60s ───────────────
  let cache = { at: 0, categories: [], products: [] };
  async function loadCatalogue(force) {
    await getCfg();
    if (!force && Date.now() - cache.at < 60 * 1000 && cache.products.length) return cache;

    const categories = [];
    const all = [];
    const seen = new Set();
    let total = Infinity;
    for (let page = 1; page <= 100 && all.length < total; page++) {
      const d = await supplier('get', '/products', { params: page > 1 ? { page } : undefined });
      const rows = unwrapList(d);
      const cnt = Number(d?.count ?? d?.total ?? d?.meta?.total);
      if (Number.isFinite(cnt)) total = cnt;
      let added = 0;
      for (const p of rows) { if (p && p.id != null && !seen.has(p.id)) { seen.add(p.id); all.push(p); added++; } }
      // No pagination info → a single page is the whole catalogue.
      if (!rows.length || !added || !Number.isFinite(cnt)) break;
    }
    cache = { at: Date.now(), categories, products: all };
    return cache;
  }

  async function mergedProducts(force) {
    const { categories, products } = await loadCatalogue(force);
    const prices = await Market3Price.find({}).lean();
    const mkCfg = await getCfg();   // MYS-MARKUP-CONTROLS
    const byId = new Map(prices.map(p => [Number(p.productId), p]));
    return products.map(p => {
      const o = byId.get(Number(p.id)) || {};
      const cost = readCost(p);
      const defaultMarkup = (mkCfg.defaultMarkupNgn !== null && mkCfg.defaultMarkupNgn !== undefined && Number(mkCfg.defaultMarkupNgn) >= 0) ? Number(mkCfg.defaultMarkupNgn) : Math.max(0, Number(process.env.SUJAN_DEFAULT_MARKUP_NGN || 300) || 0);
      const sell = Number(o.sellPrice) > 0 ? Number(o.sellPrice) : (cost > 0 ? cost + defaultMarkup : 0);
      const rawCat = p.category_name ?? p.category?.name ?? (typeof p.category === 'string' ? p.category : '') ?? '';
      const category = String(rawCat || '').trim() || 'Other';
      const name = p.name || p.title || 'Account';
      const st = readStock(p);
      const stock = st.out ? 0 : (st.count !== null ? st.count : 100); // unknown stock: let the supplier decide at purchase
      const apiPic = String(p.picture || p.image || p.image_url || p.logo || '').trim();
      return {
        id: Number(p.id),
        name,
        customTitle: o.customTitle || '',
        description: (o.description || '').trim(),
        picture: resolveLogPicture(category, name, apiPic, o.picture),
        category,
        categoryId: Number(p.category_id ?? p.category?.id) || 0,
        cost,
        sellPrice: sell,
        profit: sell ? sell - cost : 0,
        stock,
        inStock: !st.out && stock > 0,
        enabled: o.enabled !== false,
        priced: sell > 0
      };
    });
  }

  // ── Balance monitor + email ───────────────────────────────────────────────
  async function alertAdmin(subject, text) {
    try {
      const cfg = await getCfg();
      await sendAdminEmail(cfg.alertEmail || process.env.ADMIN_ALERT_EMAIL, subject, text);
    } catch (e) { console.error('[Market3] admin alert failed:', e.message); }
  }

  async function checkBalance() {
    const cfg = await getCfg();
    try {
      const d = await supplier('get', '/balance');
      const bd = unwrapObj(d);
      const bal = Number(bd.balance ?? bd.wallet_balance ?? bd.available_balance) || 0;
      cfg.lastBalance = bal; cfg.lastBalanceAt = new Date(); cfg.lastBalanceError = '';
      const low = Number(cfg.lowBalanceNgn) || 0;
      const cooledDown = !cfg.lastAlertAt || Date.now() - cfg.lastAlertAt.getTime() > 6 * 3600 * 1000;
      if (low > 0 && bal < low && cooledDown) {
        const r = await sendAdminEmail(cfg.alertEmail || process.env.ADMIN_ALERT_EMAIL,
          'Marketplace 3 supplier balance is low',
          `Your supplier wallet balance is ₦${bal.toLocaleString('en-NG')}, below your ₦${low.toLocaleString('en-NG')} warning level.\n\nTop up now or Marketplace 3 purchases will start failing.`);
        if (r?.sent) cfg.lastAlertAt = new Date();
      }
      await cfg.save();
      return { balance: bal, currency: bd.currency || 'NGN', threshold: low };
    } catch (e) {
      cfg.lastBalanceError = String(e.message).slice(0, 300); cfg.lastBalanceAt = new Date();
      await cfg.save().catch(() => {});
      throw e;
    }
  }
  setTimeout(() => {
    checkBalance().catch(() => {});
    setInterval(() => checkBalance().catch(() => {}), 15 * 60 * 1000);
  }, 25000);

  // ── Delivery helpers ──────────────────────────────────────────────────────
  // Normalise a supplier key entry to readable text (never "[object Object]").
  const toKeyText = (k) => {
    if (k == null) return '';
    if (typeof k === 'string') return k.trim();
    if (typeof k !== 'object') return String(k);
    const v = k.key ?? k.credential ?? k.details ?? k.detail ?? k.value ?? k.data ?? k.login ?? k.log ?? k.text ?? k.account ?? k.content;
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v)) return v.map(toKeyText).filter(Boolean).join('\n');
    const clean = Object.fromEntries(Object.entries(k).filter(([, x]) => x !== null && x !== undefined && x !== ''));
    try { return JSON.stringify(clean); } catch { return ''; }
  };

  // Put the keys into the customer's purchases + ledger. Idempotent: safe to
  // call any number of times for the same order (never duplicates).
  async function deliverToUser(orderId) {
    const o = await Market3Order.findById(orderId);
    if (!o || !o.keys || !o.keys.length || !['delivered', 'partial'].includes(o.status)) return false;
    if (!o.deliverySynced) {
      const paid = o.sellTotal;
      await User.updateOne(
        { _id: o.userId, 'purchaseDetails.logId': { $ne: o._id } },
        { $push: { purchaseDetails: {
          logId: o._id, logTitle: `[Marketplace 3] ${o.title}`, logType: 'log', source: 'market3',
          logDetails: o.keys.join('\n'), pricePaid: paid, purchasedAt: o.createdAt || new Date()
        } } });
      await Market3Order.updateOne({ _id: o._id }, { $set: { deliverySynced: true, updatedAt: new Date() } });
    }
    if (!o.txRecorded) {
      const claimed = await Market3Order.findOneAndUpdate({ _id: o._id, txRecorded: false }, { $set: { txRecorded: true } });
      if (claimed) {
        try {
          await Transaction.create({ userId: o.userId, type: 'purchase', amount: o.sellTotal, description: `Bought ${o.title} - Marketplace 3`, status: 'success' });
        } catch (e) {
          await Market3Order.updateOne({ _id: o._id }, { $set: { txRecorded: false } }).catch(() => {});
          console.error('[Market3] ledger entry failed (will retry):', e.message);
        }
      }
    }
    return true;
  }

  // Refund once and only once per order.
  async function refundOrder(orderId, amount, note, finalStatus) {
    const claimed = await Market3Order.findOneAndUpdate(
      { _id: orderId, refunded: false }, { $set: { refunded: true, updatedAt: new Date() } }, { new: true });
    if (!claimed) return false;
    try {
      await withRetry(() => User.updateOne({ _id: claimed.userId }, { $inc: { balance: amount } }), 4, 300);
    } catch (e) {
      await Market3Order.updateOne({ _id: orderId }, { $set: { refunded: false } }).catch(() => {});
      throw e;
    }
    const set = { refundedAmount: amount, updatedAt: new Date(), note: note || '' };
    if (finalStatus) set.status = finalStatus;
    await Market3Order.updateOne({ _id: orderId }, { $set: set });
    try { await Transaction.create({ userId: claimed.userId, type: 'refund', amount, description: `Refund - ${claimed.title} (Marketplace 3)`, status: 'success' }); } catch (e) { /* ledger is best-effort */ }
    return true;
  }

  const customerView = (o) => ({
    orderId: String(o._id), ref: o.ref, status: o.status, title: o.title, quantity: o.quantity,
    amountPaid: Math.max(0, (o.sellTotal || 0)), keys: o.keys || [], createdAt: o.createdAt
  });

  // ── Public ────────────────────────────────────────────────────────────────
  app.get('/api/market3/status', async (req, res) => {
    try { const c = await getCfg(); res.json({ market3Enabled: c.market3Enabled, maintenanceMessage: c.maintenanceMessage }); }
    catch (e) { res.json({ market3Enabled: true, maintenanceMessage: '' }); }
  });

  app.get('/api/market3/products', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const c = await getCfg();
      if (!c.market3Enabled) return res.status(503).json({ error: c.maintenanceMessage, maintenance: true });
      const products = (await mergedProducts(false))
        .filter(p => p.priced && p.enabled)
      const list = await Promise.all(products.map(async (p, index) => {
        const title = p.customTitle || p.name;
        const brandLogo = await brandLogoFor(title, p.category);
        return {
          id: index, productKey: sealRef('market3:product', { id: Number(p.id) }, process.env.JWT_SECRET),
          title, description: p.description, picture: brandLogo || p.picture,
          category: p.category, price: p.sellPrice, stock: p.stock, inStock: p.inStock
        };
      }));
      res.json(list);
    } catch (e) { res.status(e.status === 503 ? 503 : 502).json({ error: 'Could not load Marketplace 3 right now. Please try again.' }); }
  });

  // The customer's own Marketplace 3 orders (keys included) - a second place,
  // besides My Purchases, where credentials can always be recovered.
  app.get('/api/market3/orders', auth, async (req, res) => {
    try {
      const q = { userId: req.user._id };
      if (req.query.ref) q.ref = String(req.query.ref).slice(0, 80);
      const orders = await Market3Order.find(q).sort({ createdAt: -1 }).limit(req.query.ref ? 1 : 50).lean();
      res.json(orders.map(customerView));
    } catch (e) { res.status(500).json({ error: 'Could not load your orders.' }); }
  });

  app.post('/api/market3/buy', auth, async (req, res) => {
    let order = null;
    try {
      const c = await getCfg();
      if (!c.market3Enabled) return res.status(503).json({ error: c.maintenanceMessage, maintenance: true });
      let productId = 0;
      try { productId = Number(openRef('market3:product', String(req.body?.productId || ''), process.env.JWT_SECRET).id); } catch (_) {}
      const quantity = Math.max(1, Math.min(100, parseInt(req.body?.quantity, 10) || 1));
      if (!Number.isSafeInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Pick a product first.' });
      if (!apiKey()) return res.status(503).json({ error: 'Marketplace 3 is not available right now. Nothing was charged.' });
      const ref = String(req.body?.clientRef || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || crypto.randomUUID();

      // Idempotency: the same click/retry must never charge twice.
      const existing = await Market3Order.findOne({ ref });
      if (existing) {
        if (String(existing.userId) !== String(req.user._id)) return res.status(409).json({ error: 'Invalid request. Please refresh and try again.' });
        if (['delivered', 'partial'].includes(existing.status)) {
          deliverToUser(existing._id).catch(() => {});
          return res.json({ ok: true, repeated: true, ...customerView(existing), title: existing.title, balance: (await User.findById(req.user._id).select('balance'))?.balance });
        }
        if (existing.status === 'failed' || existing.status === 'refunded') return res.status(400).json({ error: existing.note || 'This order did not go through. Nothing was charged.' });
        return res.status(202).json({ ok: true, pending: true, orderId: String(existing._id), ref, message: 'Your order is still being processed. Your credentials will appear in My Purchases as soon as it completes.' });
      }

      const product = (await mergedProducts(true)).find(p => p.id === productId);
      if (!product || !product.priced || !product.enabled) return res.status(404).json({ error: 'This product is not available.' });
      try { // live stock check (best effort - falls back to catalogue stock)
        const sd = unwrapObj(await supplier('get', `/products/${productId}/stock`, { timeout: 10000 }));
        const ls = readStock(sd);
        if (ls.out) { product.stock = 0; product.inStock = false; }
        else if (ls.count !== null) { product.stock = ls.count; product.inStock = ls.count > 0; }
      } catch (e) { if (e.status === 401 || e.status === 402) { /* surfaced at purchase time */ } }
      if (!product.inStock || product.stock < quantity) return res.status(409).json({ error: `Only ${product.stock} left in stock.` });
      if (product.sellPrice <= product.cost) return res.status(400).json({ error: 'This product is temporarily unavailable.' });

      const title = `${product.customTitle || product.name}${quantity > 1 ? ` ×${quantity}` : ''}`;
      const total = product.sellPrice * quantity;

      // 1) Record the order BEFORE touching the customer's money.
      order = await Market3Order.create({
        ref, userId: req.user._id, userEmail: req.user.email, productId, productName: product.name, title,
        quantity, unitSell: product.sellPrice, sellTotal: total, costTotal: product.cost * quantity,
        profit: total - product.cost * quantity, status: 'pending'
      });

      // 2) Atomic debit so two taps can never double-spend.
      const user = await User.findOneAndUpdate(
        { _id: req.user._id, balance: { $gte: total } }, { $inc: { balance: -total } }, { new: true });
      if (!user) {
        await Market3Order.updateOne({ _id: order._id }, { $set: { status: 'failed', note: 'Insufficient balance', updatedAt: new Date() } });
        return res.status(400).json({ error: 'Insufficient balance. Please deposit funds.' });
      }
      await Market3Order.updateOne({ _id: order._id }, { $set: { debited: true } }).catch(() => {});

      // 3) Buy from the supplier.
      let bought;
      try {
        bought = unwrapObj(await supplier('post', '/orders', { data: { product_id: productId, quantity }, timeout: 45000 }));
      } catch (e) {
        if (!e.ambiguous) {
          // Definite failure: the supplier did not sell anything → full automatic refund.
          const msg = e.status === 402 ? 'This product is temporarily unavailable. Nothing was charged.' : 'We could not complete this purchase. Nothing was charged.';
          try { await refundOrder(order._id, total, msg, 'failed'); }
          catch (re) {
            await Market3Order.updateOne({ _id: order._id }, { $set: { status: 'review', note: 'Supplier rejected the order but the automatic refund failed - refund manually. ' + re.message, updatedAt: new Date() } }).catch(() => {});
            alertAdmin('Marketplace 3: refund failed - action needed', `Order ${order._id} for ${req.user.email} (${title}, ₦${total}) was rejected by the supplier but the automatic refund failed. Please refund it from Admin → Logs 3.`);
            return res.status(202).json({ ok: true, pending: true, orderId: String(order._id), ref, message: 'We could not complete your order. Your payment is safe and is being returned - contact support if your balance is not restored shortly.' });
          }
          if (e.status === 402 || e.status === 401) checkBalance().catch(() => {});
          cache.at = 0;
          return res.status(400).json({ error: msg });
        }
        // Unknown outcome: keep the money held, flag for review. Never refund blindly.
        await Market3Order.updateOne({ _id: order._id }, { $set: { status: 'review', note: 'Supplier did not answer clearly (' + e.message + '). Check the supplier order history, then deliver the keys or refund.', updatedAt: new Date() } }).catch(() => {});
        alertAdmin('Marketplace 3: order needs review', `Order ${order._id} for ${req.user.email} (${title}, ₦${total}) got no clear answer from the supplier (${e.message}).\n\nThe customer has been charged. Open Admin → Logs 3 → "Needs attention" and either deliver the keys (from your supplier order history) or refund the customer.`);
        return res.status(202).json({ ok: true, pending: true, orderId: String(order._id), ref, message: 'Your payment was received and your order is being verified. Your credentials will appear in My Purchases shortly - please do not buy again. Contact support if you have not received them in 15 minutes.' });
      }

      // 4) The supplier sold it. Persist the keys IMMEDIATELY, before anything else.
      const rawKeys = ['keys', 'credentials', 'accounts', 'items', 'delivered'].map(k => bought?.[k]).find(v => Array.isArray(v) && v.length) || [];
      const keys = rawKeys.map(toKeyText).filter(Boolean);
      const minor = Number(bought?.total_minor ?? bought?.charge_minor ?? bought?.amount_minor ?? bought?.price_minor);
      const supplierCost = Number.isFinite(minor) && minor > 0 ? minor / 100 : Number(bought?.charge ?? bought?.total ?? bought?.total_price ?? bought?.cost ?? bought?.amount);
      const costTotal = Number.isFinite(supplierCost) && supplierCost > 0 ? supplierCost : product.cost * quantity;

      if (!keys.length) {
        await Market3Order.updateOne({ _id: order._id }, { $set: { status: 'review', supplierOrderId: String((bought?.order_id ?? bought?.id) || ''), costTotal, note: 'Supplier accepted the order but returned no keys. Retrieve them from your supplier order history and deliver them from the admin panel.', updatedAt: new Date() } }).catch(() => {});
        alertAdmin('Marketplace 3: supplier returned NO keys', `Order ${order._id} (supplier order ${(bought?.order_id ?? bought?.id) || 'unknown'}) for ${req.user.email} was accepted by the supplier but no keys came back. Open Admin → Logs 3 → "Needs attention" to deliver them manually.`);
        return res.status(202).json({ ok: true, pending: true, orderId: String(order._id), ref, message: 'Your payment was received and your order is being finalised. Your credentials will appear in My Purchases shortly - please do not buy again.' });
      }

      const delivered = keys.length;
      const missing = Math.max(0, quantity - delivered);
      const sellTotal = order.unitSell * delivered;
      const patch = {
        status: missing ? 'partial' : 'delivered', keys, supplierOrderId: String((bought?.order_id ?? bought?.id) || ''),
        sellTotal, costTotal, profit: sellTotal - costTotal, updatedAt: new Date(),
        note: missing ? `Supplier delivered ${delivered} of ${quantity} keys; the difference was refunded.` : ''
      };
      let savedToOrder = true;
      try { await withRetry(() => Market3Order.updateOne({ _id: order._id }, { $set: patch }), 4, 300); }
      catch (e) {
        savedToOrder = false;
        // Absolute last resort: the keys exist only in memory right now.
        console.error('[Market3] CRITICAL could not save keys to order', String(order._id), 'user', req.user.email, 'keys:', JSON.stringify(keys));
      }

      // 5) Deliver to the customer's purchases (retried; the reconciler covers any remaining failure).
      let synced = false;
      try {
        if (savedToOrder) { await withRetry(() => deliverToUser(order._id), 3, 300); synced = true; }
        else {
          await withRetry(() => User.updateOne({ _id: user._id }, { $push: { purchaseDetails: {
            logId: order._id, logTitle: `[Marketplace 3] ${title}`, logType: 'log', source: 'market3',
            logDetails: keys.join('\n'), pricePaid: sellTotal, purchasedAt: new Date() } } }), 3, 300);
          synced = true;
        }
      } catch (e) { console.error('[Market3] delivery sync pending - reconciler will retry:', e.message); }

      // Partial delivery: give back the money for the keys that were not delivered.
      if (missing) {
        try { await refundOrder(order._id, order.unitSell * missing, patch.note, 'partial'); } catch (e) { console.error('[Market3] partial refund failed:', e.message); }
        alertAdmin('Marketplace 3: partial delivery', `Order ${order._id} for ${req.user.email}: ordered ${quantity}, supplier delivered ${delivered}. The missing ${missing} were refunded automatically.`);
      }

      cache.at = 0;
      checkBalance().catch(() => {});
      const fresh = await User.findById(user._id).select('balance').lean().catch(() => null);
      res.json({ ok: true, title, quantity: delivered, amountPaid: sellTotal, keys, balance: fresh ? fresh.balance : user.balance, orderId: String(order._id), ref, partial: !!missing, saved: synced });
    } catch (e) {
      // Something unexpected. If the order exists and the money moved, it must not be lost.
      console.error('[Market3] buy error:', e);
      if (order && order._id) {
        try {
          const o = await Market3Order.findById(order._id);
          if (o && o.status === 'pending' && o.debited) {
            await Market3Order.updateOne({ _id: o._id }, { $set: { status: 'review', note: 'Unexpected server error during purchase: ' + e.message, updatedAt: new Date() } });
            alertAdmin('Marketplace 3: order needs review', `Order ${o._id} for ${o.userEmail} hit a server error after payment (${e.message}). Check Admin → Logs 3.`);
            return res.status(202).json({ ok: true, pending: true, orderId: String(o._id), ref: o.ref, message: 'Your order is being verified. Please do not buy again - your credentials will appear in My Purchases shortly.' });
          }
          if (o && o.status === 'delivered') {
            return res.json({ ok: true, ...customerView(o), title: o.title, quantity: o.quantity });
          }
        } catch (e2) { /* fall through */ }
      }
      res.status(500).json({ error: 'Purchase failed. If you were charged, your credentials will appear in My Purchases - otherwise nothing was taken.' });
    }
  });

  // ── Reconciler: never leave a paid order undelivered ──────────────────────
  async function reconcile() {
    try {
      const unsynced = await Market3Order.find({
        status: { $in: ['delivered', 'partial'] }, 'keys.0': { $exists: true },
        $or: [{ deliverySynced: false }, { txRecorded: false }]
      }).limit(50);
      for (const o of unsynced) { await deliverToUser(o._id).catch(e => console.error('[Market3] reconcile deliver failed:', e.message)); }

      const stale = await Market3Order.find({ status: 'pending', createdAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } }).limit(50);
      for (const o of stale) {
        const r = await Market3Order.updateOne({ _id: o._id, status: 'pending' }, { $set: { status: 'review', note: 'Order was interrupted (server restart or crash) - verify against supplier order history.', updatedAt: new Date() } });
        if (r.modifiedCount) alertAdmin('Marketplace 3: interrupted order', `Order ${o._id} for ${o.userEmail} (${o.title}) was interrupted. Open Admin → Logs 3 → "Needs attention".`);
      }
    } catch (e) { console.error('[Market3] reconcile error:', e.message); }
  }
  setTimeout(() => { reconcile(); setInterval(reconcile, 2 * 60 * 1000); }, 15000);

  // ── Admin ─────────────────────────────────────────────────────────────────
  app.get('/api/admin/market3/config', anyAdminAuth, async (req, res) => {
    const c = await getCfg();
    res.json({ ...c.toObject(), apiConnected: !!apiKey(), apiKeyConfigured: !!apiKey(), baseUrl: baseUrl(), apiKeyCipher: undefined, sujanKeyCipher: undefined });
  });
  app.put('/api/admin/market3/config', anyAdminAuth, async (req, res) => {
    const c = await getCfg(); const b = req.body || {};
    if (typeof b.market3Enabled === 'boolean') c.market3Enabled = b.market3Enabled;
    if (typeof b.maintenanceMessage === 'string') c.maintenanceMessage = b.maintenanceMessage.slice(0, 300);
    if (b.lowBalanceNgn !== undefined && Number(b.lowBalanceNgn) >= 0) c.lowBalanceNgn = Number(b.lowBalanceNgn);
    if (typeof b.alertEmail === 'string') c.alertEmail = b.alertEmail.trim().slice(0, 200);
    if (b.defaultMarkupNgn !== undefined) {
      if (b.defaultMarkupNgn === null || b.defaultMarkupNgn === '') c.defaultMarkupNgn = null;
      else {
        const n = Number(b.defaultMarkupNgn);
        if (!Number.isFinite(n) || n < 0 || n > 1000000) return res.status(400).json({ error: 'Default markup must be ₦0 or more.' });
        c.defaultMarkupNgn = Math.round(n);
      }
    }
    if (typeof b.apiKey === 'string' && b.apiKey.trim()) c.sujanKeyCipher = encryptSecret(b.apiKey.trim());
    if (typeof b.baseUrl === 'string' && b.baseUrl.trim()) {
      try { const u = new URL(b.baseUrl.trim()); if (u.protocol !== 'https:' || u.hostname !== 'api.sujandepartment.com') return res.status(400).json({ error: 'Use the official HTTPS provider API URL.' }); c.customBaseUrl = b.baseUrl.trim().replace(/\/+$/, ''); }
      catch(e) { return res.status(400).json({ error: 'Enter a valid HTTPS provider API URL.' }); }
    }
    await c.save();
    await getCfg();
    res.json({ ok: true, apiKeyConfigured: !!apiKey(), baseUrl: baseUrl() });
  });
  app.get('/api/admin/market3/products', anyAdminAuth, async (req, res) => {
    try { res.json(await mergedProducts(req.query.refresh === '1')); }
    catch (e) { res.status(e.status || 502).json({ error: e.message }); }
  });
  app.put('/api/admin/market3/products/:id', anyAdminAuth, async (req, res) => {
    const productId = parseInt(req.params.id, 10);
    if (!productId) return res.status(400).json({ error: 'Bad product id' });
    const b = req.body || {}; const set = { updatedAt: new Date() };
    if (b.sellPrice !== undefined) {
      const n = Number(b.sellPrice);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Price must be ₦0 or more (0 hides it).' });
      set.sellPrice = n;
    }
    if (typeof b.enabled === 'boolean') set.enabled = b.enabled;
    if (typeof b.customTitle === 'string') set.customTitle = b.customTitle.slice(0, 150);
    if (typeof b.description === 'string') set.description = b.description.slice(0, 1000);
    if (typeof b.picture === 'string') set.picture = b.picture.trim().slice(0, 1000);
    await Market3Price.updateOne({ productId }, { $set: set }, { upsert: true });
    res.json({ ok: true });
  });
  // Shows the raw supplier answer for one product so field names can be verified.
  app.get('/api/admin/market3/debug', anyAdminAuth, async (req, res) => {
    try {
      const d = await supplier('get', '/products');
      const rows = unwrapList(d);
      const first = rows[0] || null;
      const id = Number(req.query.id) || first?.id;
      let stockRaw = null; try { stockRaw = id ? await supplier('get', `/products/${id}/stock`) : null; } catch (e) { stockRaw = { error: e.message, status: e.status }; }
      res.json({ productCount: rows.length, firstProductRaw: first, parsedStock: first ? readStock(first) : null, parsedCost: first ? readCost(first) : null, stockEndpointRaw: stockRaw, parsedStockEndpoint: stockRaw ? readStock(unwrapObj(stockRaw)) : null });
    } catch (e) { res.status(e.status || 502).json({ error: e.message }); }
  });
  app.get('/api/admin/market3/balance', anyAdminAuth, async (req, res) => {
    try { res.json(await checkBalance()); } catch (e) { res.status(502).json({ error: e.message }); }
  });
  app.get('/api/admin/market3/orders', anyAdminAuth, async (req, res) => {
    const orders = await Market3Order.find({}).sort({ createdAt: -1 }).limit(200).select('-keys').lean();
    const attention = await Market3Order.find({ $or: [{ status: 'review' }, { status: 'pending', createdAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) } }, { status: { $in: ['delivered', 'partial'] }, deliverySynced: false }] })
      .sort({ createdAt: -1 }).limit(100).select('-keys').lean();
    const agg = await Market3Order.aggregate([
      { $match: { status: { $in: ['delivered', 'partial'] } } },
      { $group: { _id: null, sales: { $sum: '$sellTotal' }, cost: { $sum: '$costTotal' }, profit: { $sum: '$profit' }, count: { $sum: 1 } } }]);
    res.json({ orders, attention, totals: agg[0] || { sales: 0, cost: 0, profit: 0, count: 0 } });
  });
  app.get('/api/admin/market3/orders/:id/keys', anyAdminAuth, async (req, res) => {
    const o = await Market3Order.findById(req.params.id).lean().catch(() => null);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    res.json({ keys: o.keys || [], status: o.status, userEmail: o.userEmail });
  });
  // Deliver keys by hand (e.g. copied from the supplier order history).
  app.post('/api/admin/market3/orders/:id/deliver', anyAdminAuth, async (req, res) => {
    try {
      const raw = Array.isArray(req.body?.keys) ? req.body.keys : String(req.body?.keys || '').split(/\r?\n/);
      const keys = raw.map(toKeyText).filter(Boolean);
      if (!keys.length) return res.status(400).json({ error: 'Paste at least one key (one per line).' });
      const o = await Market3Order.findById(req.params.id);
      if (!o) return res.status(404).json({ error: 'Order not found' });
      if (o.refunded) return res.status(400).json({ error: 'This order was already refunded.' });
      if (o.status === 'delivered' && o.deliverySynced) return res.status(400).json({ error: 'This order was already delivered.' });
      const costTotal = Number(req.body?.costTotal) > 0 ? Number(req.body.costTotal) : (o.costTotal || 0);
      await Market3Order.updateOne({ _id: o._id }, { $set: { status: 'delivered', keys, costTotal, profit: o.sellTotal - costTotal, note: 'Delivered manually by admin.', updatedAt: new Date() } });
      await deliverToUser(o._id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/admin/market3/orders/:id/refund', anyAdminAuth, async (req, res) => {
    try {
      const o = await Market3Order.findById(req.params.id);
      if (!o) return res.status(404).json({ error: 'Order not found' });
      if (o.status === 'delivered' && o.deliverySynced) return res.status(400).json({ error: 'The customer already received this order.' });
      if (!o.debited) return res.status(400).json({ error: 'This customer was never charged for this order.' });
      const ok = await refundOrder(o._id, o.sellTotal, 'Refunded by admin.', 'refunded');
      if (!ok) return res.status(400).json({ error: 'Already refunded.' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/admin/market3/orders/:id/resync', anyAdminAuth, async (req, res) => {
    try { res.json({ ok: await deliverToUser(req.params.id) }); } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
