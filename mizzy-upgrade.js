'use strict';
// Mizzy Sales upgrade module:
//   1. Product logo library (admin uploads a logo once -> every matching product from ANY provider uses it)
//   2. Neutral public URLs / API names (provider names never reach the customer)
//   3. Buy Number 3 admin controls (on/off, per-service price + hide)
// Call early(app,{mongoose}) before the routes and late(app,deps) before the 404 handler.

const MAX_IMG = 1.5 * 1024 * 1024;
const MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
let BrandLogo = null, N3Override = null, N3Config = null;
let logos = [];            // compiled logo list
let ovMap = new Map();     // serviceId -> { hidden, price }
let hiddenNames = [];      // lowercase service names hidden everywhere
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseKeywords(v, fallback) {
  const arr = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,\n]/);
  const out = [...new Set(arr.map(x => String(x).trim().toLowerCase()).filter(x => x && x.length <= 40))];
  return out.length ? out.slice(0, 30) : (fallback ? [String(fallback).trim().toLowerCase()].filter(Boolean) : []);
}
const nrm = v => String(v == null ? '' : v).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
let exactMap = new Map();  // normalized exact product name -> { url, id, label }
async function loadLogos() {
  if (!BrandLogo) return;
  const rows = await BrandLogo.find({ enabled: true }).select('label keywords scope updatedAt').sort({ updatedAt: 1 }).lean();
  const list = [], ex = new Map();
  for (const r of rows) {
    const url = `/api/brand-logo/${r._id}?v=${new Date(r.updatedAt || Date.now()).getTime()}`;
    if (r.scope === 'exact') {
      // "Only this exact product": the keywords are full product names, not fragments.
      for (const k of (r.keywords || [])) { const n = nrm(k); if (n) ex.set(n, { url, id: String(r._id), label: r.label || '' }); }
    } else {
      list.push({
        id: String(r._id), url, label: r.label || '',
        kws: (r.keywords || []).map(k => ({ s: k, re: k.length <= 3 ? new RegExp('(^|[^a-z0-9])' + esc(k) + '([^a-z0-9]|$)') : null }))
      });
    }
  }
  logos = list; exactMap = ex;
}
// Best keyword match inside one piece of text: longest keyword wins, then the one that appears first.
function matchIn(text) {
  if (!logos.length || !text) return null;
  let best = null, bl = 0, bp = 1e9;
  for (const l of logos) for (const k of l.kws) {
    if (k.s.length < bl) continue;
    let pos;
    if (k.re) { const m = k.re.exec(text); pos = m ? m.index : -1; } else pos = text.indexOf(k.s);
    if (pos < 0) continue;
    if (k.s.length > bl || pos < bp) { best = { url: l.url, id: l.id, label: l.label, keyword: k.s }; bl = k.s.length; bp = pos; }
  }
  return best;
}
// The product's OWN name decides first. Category / platform / provider are only a fallback,
// so a "TikTok" product listed under a "Facebook" category no longer picks up the Facebook logo.
const PRIMARY_KEYS = ['title', 'name', 'serviceName', 'service', 'rawName', 'label', 'customTitle', 'productName'];
const SECONDARY_KEYS = ['category', 'platform', 'provider'];
function matchObj(o) {
  const prim = [];
  for (const k of PRIMARY_KEYS) { const v = o[k]; if (typeof v === 'string' && v) prim.push(v); }
  if (exactMap.size) for (const v of prim) { const hit = exactMap.get(nrm(v)); if (hit) return { url: hit.url, id: hit.id, label: hit.label, how: 'exact product name', keyword: v }; }
  if (!logos.length) return null;
  const pt = prim.join(' | ').toLowerCase();
  let m = pt ? matchIn(pt) : null;
  if (m) return { ...m, how: 'product name' };
  const sec = [];
  for (const k of SECONDARY_KEYS) { const v = o[k]; if (typeof v === 'string' && v) sec.push(v); }
  const st = sec.join(' | ').toLowerCase();
  m = st ? matchIn(st) : null;
  return m ? { ...m, how: 'category / platform (the product name had no logo)' } : null;
}
const NAME_KEYS = ['title', 'name', 'serviceName', 'service', 'provider', 'rawName', 'category', 'platform', 'label', 'customTitle', 'productName'];
function objText(o) {
  let t = '';
  for (const k of NAME_KEYS) { const v = o[k]; if (typeof v === 'string' && v) t += v + ' | '; }
  return t.toLowerCase();
}
// Copy-on-change so cached provider data is never mutated.
function enrich(v, depth, st) {
  if (depth > 5 || st.n > 25000) return v;
  if (Array.isArray(v)) {
    let out = null;
    for (let i = 0; i < v.length; i++) { const r = enrich(v[i], depth + 1, st); if (r !== v[i]) { if (!out) out = v.slice(); out[i] = r; } }
    return out || v;
  }
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    st.n++;
    let out = null;
    for (const k of Object.keys(v)) { const x = v[k]; if (x && typeof x === 'object') { const r = enrich(x, depth + 1, st); if (r !== x) { if (!out) out = { ...v }; out[k] = r; } } }
    const hit = matchObj(v);
    const url = hit ? hit.url : '';
    if (url) {
      out = out || { ...v }; out.logo = url;
      if ('picture' in v) out.picture = url;
      if ('icon' in v && (typeof v.icon === 'string' || v.icon == null)) out.icon = url;
      if ('image' in v && (typeof v.image === 'string' || v.image == null)) out.image = url;
    }
    return out || v;
  }
  return v;
}

// Customer-facing API names that used to contain a provider name.
const API_ALIASES = [
  ['/api/numbers/n2/', '/api/numbers/otp-suite/'],
  ['/api/numbers/n3-servers', '/api/numbers/nova-servers']
];

exports.early = function early(app, { mongoose }) {
  const S = mongoose.Schema;
  BrandLogo = mongoose.models.BrandLogo || mongoose.model('BrandLogo', new S({
    label: { type: String, default: '' }, keywords: { type: [String], default: [] }, scope: { type: String, default: 'all' }, enabled: { type: Boolean, default: true },
    mime: String, data: Buffer, createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now }
  }));
  loadLogos().catch(() => {}); setInterval(() => loadLogos().catch(() => {}), 45000);

  // Neutral API names
  app.use((req, res, next) => {
    for (const [from, to] of API_ALIASES) if (req.url.startsWith(from)) { req.url = to + req.url.slice(from.length); break; }
    next();
  });
  // Logo enrichment for every public GET API response
  app.use((req, res, next) => {
    const p = req.path || '';
    if (req.method !== 'GET' || !p.startsWith('/api/') || p.startsWith('/api/admin') || p.startsWith('/api/brand-logo')) return next();
    const orig = res.json.bind(res);
    res.json = function (body) {
      try { if (logos.length && body && typeof body === 'object') body = enrich(body, 0, { n: 0 }); } catch (e) { /* never block a response */ }
      return orig(body);
    };
    next();
  });
  app.get('/api/brand-logos', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(logos.map(l => ({ url: l.url, keywords: l.kws.map(k => k.s) })));
  });
  app.get('/api/brand-logo/:id', async (req, res) => {
    try {
      if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(404).end();
      const d = await BrandLogo.findById(req.params.id).select('mime data');
      if (!d || !d.data) return res.status(404).end();
      res.set({ 'Content-Type': d.mime || 'image/png', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
      res.send(Buffer.from(d.data));
    } catch (e) { res.status(404).end(); }
  });
};

function decodeImage(dataUrl) {
  const m = /^data:([a-z0-9.+\/-]+);base64,([A-Za-z0-9+\/=\s]+)$/i.exec(String(dataUrl || ''));
  if (!m) throw new Error('Choose an image file (PNG, JPG, WebP, GIF or SVG).');
  const mime = m[1].toLowerCase();
  if (!MIMES.includes(mime)) throw new Error('Unsupported image type. Use PNG, JPG, WebP, GIF or SVG.');
  const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  if (!buf.length || buf.length > MAX_IMG) throw new Error('Image is too large (max 1.5 MB).');
  return { mime, buf };
}

exports.late = function late(app, deps) {
  const { mongoose, anyAdminAuth, getNumberServerConfig, novaCatalogForCountry, novaServiceDisplayName, novaServicePriceNgn, novaSyncState } = deps;
  const S = mongoose.Schema;
  N3Override = mongoose.models.N3Override || mongoose.model('N3Override', new S({ serviceId: { type: String, unique: true, index: true }, hidden: { type: Boolean, default: false }, price: { type: Number, default: 0 }, updatedAt: { type: Date, default: Date.now } }));
  N3Config = mongoose.models.N3Config || mongoose.model('N3Config', new S({ key: { type: String, unique: true, default: 'main' }, hiddenNames: { type: [String], default: [] } }));
  async function loadOv() {
    const rows = await N3Override.find({}).lean(); ovMap = new Map(rows.map(r => [String(r.serviceId), { hidden: !!r.hidden, price: Number(r.price) || 0 }]));
    const c = await N3Config.findOne({ key: 'main' }).lean(); hiddenNames = (c && c.hiddenNames || []).map(x => String(x).toLowerCase());
  }
  loadOv().catch(() => {}); setInterval(() => loadOv().catch(() => {}), 15000);
  // Used by novaServicePriceNgn: undefined = no override, null = hidden, number = fixed price
  global.__mizzyN3 = {
    override(service) {
      const id = String(service && (service.id ?? service.service_id));
      const o = ovMap.get(id);
      if (o && o.hidden) return null;
      if (hiddenNames.length) { const n = String(novaServiceDisplayName(service) || '').toLowerCase(); if (hiddenNames.includes(n)) return null; }
      if (o && o.price > 0) return o.price;
      return undefined;
    }
  };

  const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(e.status || 500).json({ error: e.message || 'Request failed' }); } };

  // ── Logo library (admin) ──
  const logoRow = d => ({ id: String(d._id), label: d.label, keywords: d.keywords, scope: d.scope === 'exact' ? 'exact' : 'all', enabled: d.enabled, url: `/api/brand-logo/${d._id}?v=${new Date(d.updatedAt).getTime()}` });
  // Admin "which logo would this product get, and why?" checker
  app.get('/api/admin/brand-logos/test', anyAdminAuth, wrap(async (req, res) => {
    const name = String(req.query.name || '').slice(0, 200), category = String(req.query.category || '').slice(0, 200);
    if (!name.trim() && !category.trim()) return res.status(400).json({ error: 'Type a product name to test.' });
    const hit = matchObj({ title: name, category });
    res.json(hit ? { found: true, label: hit.label, how: hit.how, keyword: hit.keyword, url: hit.url } : { found: false });
  }));
  app.get('/api/admin/brand-logos', anyAdminAuth, wrap(async (req, res) => {
    const rows = await BrandLogo.find({}).select('label keywords scope enabled updatedAt').sort({ label: 1 }).lean();
    res.json(rows.map(logoRow));
  }));
  app.post('/api/admin/brand-logos', anyAdminAuth, wrap(async (req, res) => {
    const b = req.body || {}; const label = String(b.label || '').trim().slice(0, 60);
    const kws = parseKeywords(b.keywords, label);
    if (!label || !kws.length) return res.status(400).json({ error: 'Enter a name (for example Facebook).' });
    let img; try { img = decodeImage(b.image); } catch (e) { return res.status(400).json({ error: e.message }); }
    const scope = b.scope === 'exact' ? 'exact' : 'all';
    const d = await BrandLogo.create({ label, keywords: kws, scope, mime: img.mime, data: img.buf });
    await loadLogos(); res.json({ ok: true, logo: logoRow(d) });
  }));
  app.put('/api/admin/brand-logos/:id', anyAdminAuth, wrap(async (req, res) => {
    const d = await BrandLogo.findById(req.params.id); if (!d) return res.status(404).json({ error: 'Logo not found.' });
    const b = req.body || {};
    if (typeof b.label === 'string' && b.label.trim()) d.label = b.label.trim().slice(0, 60);
    if (b.keywords !== undefined) { const k = parseKeywords(b.keywords); if (!k.length) return res.status(400).json({ error: 'Add at least one keyword.' }); d.keywords = k; }
    if (b.scope === 'exact' || b.scope === 'all') d.scope = b.scope;
    if (typeof b.enabled === 'boolean') d.enabled = b.enabled;
    if (b.image) { try { const img = decodeImage(b.image); d.mime = img.mime; d.data = img.buf; } catch (e) { return res.status(400).json({ error: e.message }); } }
    d.updatedAt = new Date(); await d.save(); await loadLogos(); res.json({ ok: true, logo: logoRow(d) });
  }));
  app.delete('/api/admin/brand-logos/:id', anyAdminAuth, wrap(async (req, res) => {
    await BrandLogo.deleteOne({ _id: req.params.id }); await loadLogos(); res.json({ ok: true });
  }));

  // ── Buy Number 3 ──
  app.get('/api/n3/status', async (req, res) => {
    try { const cfg = await getNumberServerConfig(); res.set('Cache-Control', 'no-store'); res.json({ enabled: !!cfg.server1Enabled }); }
    catch (e) { res.json({ enabled: true }); }
  });
  app.get('/api/admin/n3/overview', anyAdminAuth, wrap(async (req, res) => {
    const cfg = await getNumberServerConfig();
    res.json({ enabled: !!cfg.server1Enabled, keyConfigured: !!String(process.env.NOVA_API_KEY || '').trim(), hiddenNames: hiddenNames, overrides: ovMap.size, sync: novaSyncState ? novaSyncState() : null });
  }));
  app.put('/api/admin/n3/enabled', anyAdminAuth, wrap(async (req, res) => {
    const cfg = await getNumberServerConfig(); cfg.server1Enabled = !!(req.body && req.body.enabled); await cfg.save(); res.json({ ok: true, enabled: cfg.server1Enabled });
  }));
  app.put('/api/admin/n3/hidden-names', anyAdminAuth, wrap(async (req, res) => {
    const names = parseKeywords(req.body && req.body.names);
    await N3Config.updateOne({ key: 'main' }, { $set: { key: 'main', hiddenNames: names } }, { upsert: true }); await loadOv(); res.json({ ok: true, hiddenNames: names });
  }));
  app.get('/api/admin/n3/services', anyAdminAuth, wrap(async (req, res) => {
    const country = String(req.query.country || '').trim(); if (!country) return res.status(400).json({ error: 'Choose a country.' });
    const q = String(req.query.q || '').trim().toLowerCase(); const serverId = Number(req.query.serverId || 0);
    const cfg = await getNumberServerConfig(); const cat = await novaCatalogForCountry(country);
    const sidOf = s => Number(s.server_id ?? s.serverId ?? s.server?.id);
    let rows = (cat.services || []).filter(s => !serverId || sidOf(s) === serverId).map(s => {
      const id = String(s.id ?? s.service_id); const o = ovMap.get(id) || {};
      const minor = Number(s.price_minor ?? (Number(s.price ?? s.cost) * 100));
      const auto = novaServicePriceNgn({ ...s, price_minor: minor }, cfg, { raw: true });
      return { id, name: novaServiceDisplayName(s), serverId: sidOf(s) || null, serverName: String(s.server_name || s.server?.name || ''), cost: Number.isFinite(minor) ? minor / 100 : 0, autoPrice: auto, price: o.price || 0, hidden: !!o.hidden };
    }).filter(r => r.autoPrice != null);
    if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q));
    rows.sort((a, b) => a.name.localeCompare(b.name) || a.cost - b.cost);
    res.json({ total: rows.length, syncedAt: cat.syncedAt || null, stale: !!cat.stale, rows: rows.slice(0, 400) });
  }));
  app.put('/api/admin/n3/services/:id', anyAdminAuth, wrap(async (req, res) => {
    const id = String(req.params.id).slice(0, 40); const b = req.body || {}; const set = { updatedAt: new Date() };
    if (b.price !== undefined) { const n = Number(b.price); if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Price must be 0 or more (0 = automatic).' }); set.price = n; }
    if (typeof b.hidden === 'boolean') set.hidden = b.hidden;
    await N3Override.updateOne({ serviceId: id }, { $set: { serviceId: id, ...set } }, { upsert: true }); await loadOv(); res.json({ ok: true });
  }));
};
exports._test = { enrich, parseKeywords, setLogos(l) { logos = l; }, compile(list) { return list.map(x => ({ id: x.id, url: x.url, kws: x.kws.map(k => ({ s: k, re: k.length <= 3 ? new RegExp('(^|[^a-z0-9])' + esc(k) + '([^a-z0-9]|$)') : null })) })); } };
