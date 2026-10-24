const crypto = require('node:crypto');
const path = require('node:path');
const { Readable } = require('node:stream');
const multer = require('multer');

const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = {
  'image/png': { extensions: ['.png'], signature: buffer => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/jpeg': { extensions: ['.jpg', '.jpeg'], signature: buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/webp': { extensions: ['.webp'], signature: buffer => buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' }
};

function normalize(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function parseBrand(value) {
  if (typeof value !== 'string') return null;
  const brand = String(value || '').trim().replace(/\s+/g, ' ');
  if (!brand || brand.length > 80 || /[\u0000-\u001f\u007f]/.test(brand)) return null;
  const brandKey = normalize(brand).replace(/ /g, '-');
  return brandKey && brandKey.length <= 80 ? { brand, brandKey } : null;
}

function parseAliases(value) {
  if (value === undefined) return undefined;
  let entries;
  if (Array.isArray(value)) entries = value;
  else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      entries = Array.isArray(parsed) ? parsed : value.split(',');
    } catch {
      entries = value.split(',');
    }
  } else return null;

  if (entries.length > 30) return null;
  const unique = new Map();
  for (const item of entries) {
    const alias = String(item || '').trim().replace(/\s+/g, ' ');
    if (!alias) continue;
    const key = normalize(alias);
    if (!key || alias.length > 80 || /[\u0000-\u001f\u007f]/.test(alias)) return null;
    unique.set(key, alias);
  }
  return [...unique.values()];
}

function matchesBrand(productName, category, brand, aliases) {
  const text = normalize(`${productName || ''} ${category || ''}`);
  if (!text) return false;
  const paddedText = ` ${text} `;
  return [brand, ...(aliases || [])].some(alias => {
    const key = normalize(alias);
    return key && paddedText.includes(` ${key} `);
  });
}

module.exports.register = function registerBrandLogos({ app, mongoose, adminAuth, cloudinary, cloudinaryConfigured }) {
  // MYS-LOGO-CLASH-FIX: logos are now handled by lib/mizzy-upgrade.js. Registering the old
  // routes here made them clash with the new Product logos screen, so they are off.
  if (process.env.USE_LEGACY_BRAND_LOGOS !== 'true') return { brandLogoFor: async () => '' };
  const schema = new mongoose.Schema({
    brandKey: { type: String, required: true, unique: true, index: true },
    brand: { type: String, required: true, trim: true, maxlength: 80 },
    aliases: { type: [String], default: [] },
    logoUrl: { type: String, required: true },
    cloudinaryPublicId: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    updatedAt: { type: Date, default: Date.now }
  });
  const BrandLogo = mongoose.models.BrandLogo || mongoose.model('BrandLogo', schema);
  let cachedRows = [];
  let cachedAt = 0;

  async function rows(force = false) {
    if (!force && Date.now() - cachedAt < 30_000) return cachedRows;
    cachedRows = await BrandLogo.find({ enabled: true }).select('brand aliases logoUrl').lean();
    cachedAt = Date.now();
    return cachedRows;
  }

  async function brandLogoFor(productName, category) {
    const matches = (await rows()).filter(row => matchesBrand(productName, category, row.brand, row.aliases));
    matches.sort((a, b) => {
      const longest = row => Math.max(...[row.brand, ...(row.aliases || [])].map(value => normalize(value).length));
      return longest(b) - longest(a) || a.brand.localeCompare(b.brand);
    });
    return matches[0]?.logoUrl || '';
  }

  function publicRow(row) {
    return { brand: row.brand, aliases: row.aliases || [], logoUrl: row.logoUrl, enabled: row.enabled !== false, updatedAt: row.updatedAt };
  }
  function adminRow(row) {
    return { ...publicRow(row), brandKey: row.brandKey };
  }

  app.get('/api/brand-logos', async (req, res) => {
    try {
      res.set('Cache-Control', 'public, max-age=60');
      res.json((await rows()).map(publicRow));
    } catch (error) {
      console.error('[brand-logos] public mapping read failed:', error.name);
      res.status(503).json({ error: 'Brand logos are temporarily unavailable.' });
    }
  });

  app.get('/api/admin/brand-logos', adminAuth, async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const all = await BrandLogo.find({}).sort({ brand: 1 }).lean();
      res.json(all.map(adminRow));
    } catch (error) {
      console.error('[brand-logos] admin mapping read failed:', error.name);
      res.status(500).json({ error: 'Could not load brand logo mappings.' });
    }
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
    fileFilter(req, file, callback) {
      const rule = IMAGE_TYPES[file.mimetype];
      if (!rule || !rule.extensions.includes(path.extname(file.originalname).toLowerCase())) {
        return callback(new Error('Use a PNG, JPEG, or WebP image.'));
      }
      callback(null, true);
    }
  });

  function parseEnabled(value) {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return null;
  }

  async function uploadLogo(file, brandKey) {
    if (!cloudinaryConfigured || !cloudinary) {
      const error = new Error('Configure Cloudinary before uploading brand logos.');
      error.status = 503;
      throw error;
    }
    const rule = IMAGE_TYPES[file.mimetype];
    if (!rule || !rule.extensions.includes(path.extname(file.originalname).toLowerCase()) || !rule.signature(file.buffer)) {
      const error = new Error('The uploaded file is not a valid PNG, JPEG, or WebP image.');
      error.status = 400;
      throw error;
    }
    const publicId = `ksl/brand-logos/${brandKey}-${crypto.randomBytes(8).toString('hex')}`;
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        public_id: publicId,
        resource_type: 'image',
        overwrite: false,
        use_filename: false
      }, (error, response) => error ? reject(error) : resolve(response));
      Readable.from([file.buffer]).pipe(stream);
    });
    if (!result?.secure_url || !String(result.secure_url).startsWith('https://') || !result.public_id) {
      const error = new Error('Cloudinary did not return a secure logo URL.');
      error.status = 502;
      throw error;
    }
    return { logoUrl: result.secure_url, publicId: result.public_id };
  }

  async function destroyLogo(publicId) {
    if (!publicId || !cloudinaryConfigured || !cloudinary) return;
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    if (result?.result !== 'ok' && result?.result !== 'not found') {
      throw new Error('Cloudinary did not confirm logo removal.');
    }
  }

  function parseUpload(req, res, next) {
    upload.single('image')(req, res, error => {
      if (error) return res.status(400).json({ error: error.message || 'Could not upload the brand logo.' });
      next();
    });
  }

  app.post('/api/admin/brand-logos', adminAuth, parseUpload, async (req, res) => {
    const parsed = parseBrand(req.body?.brand);
    const aliases = parseAliases(req.body?.aliases);
    const enabled = req.body?.enabled === undefined ? true : parseEnabled(req.body.enabled);
    if (!parsed || aliases === null || enabled === null) return res.status(400).json({ error: 'Enter a valid brand, aliases, and enabled setting.' });
    if (!req.file) return res.status(400).json({ error: 'Choose a PNG, JPEG, or WebP logo image.' });
    let uploaded;
    try {
      if (await BrandLogo.exists({ brandKey: parsed.brandKey })) {
        return res.status(409).json({ error: 'A mapping for this brand already exists. Edit the existing mapping instead.' });
      }
      uploaded = await uploadLogo(req.file, parsed.brandKey);
      const created = await BrandLogo.create({
        ...parsed, aliases: aliases || [], logoUrl: uploaded.logoUrl,
        cloudinaryPublicId: uploaded.publicId, enabled, updatedAt: new Date()
      });
      cachedAt = 0;
      res.json({ ok: true, brand: publicRow(created) });
    } catch (error) {
      if (uploaded?.publicId) await destroyLogo(uploaded.publicId).catch(cleanupError => console.error('[brand-logos] failed upload cleanup:', cleanupError.name));
      if (error.code === 11000) return res.status(409).json({ error: 'A mapping for this brand already exists. Refresh and try again.' });
      console.error('[brand-logos] mapping save failed:', error.name);
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not save the brand logo.' });
    }
  });

  app.put('/api/admin/brand-logos/:brandKey', adminAuth, parseUpload, async (req, res) => {
    const brandKey = String(req.params.brandKey || '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(brandKey)) return res.status(400).json({ error: 'Invalid brand mapping.' });
    const set = { updatedAt: new Date() };
    if (req.body?.brand !== undefined) {
      const parsed = parseBrand(req.body.brand);
      if (!parsed || parsed.brandKey !== brandKey) return res.status(400).json({ error: 'Brand name cannot be blank or changed to a different mapping.' });
      set.brand = parsed.brand;
    }
    if (req.body?.aliases !== undefined) {
      const aliases = parseAliases(req.body.aliases);
      if (aliases === null) return res.status(400).json({ error: 'Enter up to 30 valid brand aliases.' });
      set.aliases = aliases;
    }
    if (req.body?.enabled !== undefined) {
      const enabled = parseEnabled(req.body.enabled);
      if (enabled === null) return res.status(400).json({ error: 'Enabled must be true or false.' });
      set.enabled = enabled;
    }
    let uploaded;
    try {
      const existing = await BrandLogo.findOne({ brandKey }).lean();
      if (!existing) return res.status(404).json({ error: 'Brand logo mapping not found.' });
      if (req.file) {
        uploaded = await uploadLogo(req.file, brandKey);
        set.logoUrl = uploaded.logoUrl;
        set.cloudinaryPublicId = uploaded.publicId;
      }
      const updated = await BrandLogo.findOneAndUpdate({ brandKey }, { $set: set }, { new: true, runValidators: true }).lean();
      cachedAt = 0;
      if (uploaded?.publicId && existing.cloudinaryPublicId) {
        await destroyLogo(existing.cloudinaryPublicId).catch(error => console.error('[brand-logos] replaced logo cleanup failed:', error.name));
      }
      res.json({ ok: true, brand: publicRow(updated) });
    } catch (error) {
      if (uploaded?.publicId) await destroyLogo(uploaded.publicId).catch(cleanupError => console.error('[brand-logos] failed upload cleanup:', cleanupError.name));
      console.error('[brand-logos] mapping update failed:', error.name);
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not update the brand logo.' });
    }
  });

  app.delete('/api/admin/brand-logos/:brandKey', adminAuth, async (req, res) => {
    const brandKey = String(req.params.brandKey || '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(brandKey)) return res.status(400).json({ error: 'Invalid brand mapping.' });
    try {
      const existing = await BrandLogo.findOne({ brandKey }).lean();
      if (!existing) return res.status(404).json({ error: 'Brand logo mapping not found.' });
      await destroyLogo(existing.cloudinaryPublicId);
      await BrandLogo.deleteOne({ brandKey });
      cachedAt = 0;
      res.json({ ok: true });
    } catch (error) {
      console.error('[brand-logos] mapping deletion failed:', error.name);
      res.status(502).json({ error: 'Could not remove this brand logo. The existing mapping was kept.' });
    }
  });

  return { brandLogoFor };
};
