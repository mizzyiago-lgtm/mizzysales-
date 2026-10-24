'use strict';
// Tutorial library — the admin adds tutorials (title, description, category, video,
// pictures, optional link) and customers watch them on the public /tutorials page.
// Free for everyone: no purchase and no login needed to view.
//
// Routes:
//   GET    /api/tutorials             public — published tutorials
//   GET    /api/admin/tutorials       admin  — all tutorials (incl. hidden)
//   POST   /api/admin/tutorials       admin  — create (multipart: video, images)
//   PUT    /api/admin/tutorials/:id   admin  — edit  (multipart: video, images)
//   DELETE /api/admin/tutorials/:id   admin  — delete

module.exports.register = function register(app, deps) {
  const { mongoose, anyAdminAuth, uploadMw, fileUrl } = deps;

  const schema = new mongoose.Schema({
    title:       { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: '', maxlength: 4000 },
    category:    { type: String, default: 'General', trim: true, maxlength: 60 },
    videoUrl:    { type: String, default: '' },
    imageUrls:   [{ type: String }],
    linkUrl:     { type: String, default: '' },
    sortOrder:   { type: Number, default: 0 },
    published:   { type: Boolean, default: true },
    createdAt:   { type: Date, default: Date.now },
    updatedAt:   { type: Date, default: Date.now },
  });
  const Tutorial = mongoose.models.LibraryTutorial || mongoose.model('LibraryTutorial', schema);

  const shape = (t) => ({
    id: String(t._id), title: t.title, description: t.description, category: t.category,
    videoUrl: t.videoUrl, imageUrls: t.imageUrls || [], linkUrl: t.linkUrl,
    sortOrder: t.sortOrder, published: t.published, createdAt: t.createdAt, updatedAt: t.updatedAt,
  });
  const safeLink = (u) => { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; };
  const safeMedia = (u) => { u = String(u || '').trim(); return /^https:\/\//i.test(u) || /^\/(uploads|files)\//.test(u) ? u : ''; };

  // Public list (anyone, even without an account)
  app.get('/api/tutorials', async (req, res) => {
    try {
      const docs = await Tutorial.find({ published: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
      res.set('Cache-Control', 'no-store');
      res.json(docs.map(shape));
    } catch (e) { res.status(500).json({ error: 'Failed to load tutorials' }); }
  });

  app.get('/api/admin/tutorials', anyAdminAuth, async (req, res) => {
    try {
      const docs = await Tutorial.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
      res.json(docs.map(shape));
    } catch (e) { res.status(500).json({ error: 'Failed to load tutorials' }); }
  });

  function readBody(req, existing) {
    const b = req.body || {};
    const out = {};
    if (b.title !== undefined) out.title = String(b.title).trim();
    if (b.description !== undefined) out.description = String(b.description);
    if (b.category !== undefined) out.category = String(b.category).trim() || 'General';
    if (b.linkUrl !== undefined) out.linkUrl = safeLink(b.linkUrl);
    if (b.sortOrder !== undefined && b.sortOrder !== '') out.sortOrder = Number(b.sortOrder) || 0;
    if (b.published !== undefined) out.published = b.published === true || b.published === 'true' || b.published === '1' || b.published === 'on';
    // video: direct-from-browser Cloudinary URL, or a file relayed through the server
    if (b.videoUrl) out.videoUrl = safeMedia(b.videoUrl);
    else if (req.files && req.files.video && req.files.video[0]) out.videoUrl = fileUrl(req.files.video[0]);
    if (b.clearVideo === 'true') out.videoUrl = '';
    // pictures: new uploads are added to the existing ones (unless the admin removes them)
    let imgs = existing ? (existing.imageUrls || []).slice() : [];
    if (b.clearImages === 'true') imgs = [];
    if (req.files && req.files.images && req.files.images.length) imgs = imgs.concat(req.files.images.map(fileUrl));
    if (existing || imgs.length) out.imageUrls = imgs.slice(0, 20);
    return out;
  }

  app.post('/api/admin/tutorials', anyAdminAuth, uploadMw, async (req, res) => {
    try {
      const data = readBody(req, null);
      if (!data.title) return res.status(400).json({ error: 'Please enter a title' });
      if (!data.videoUrl && !(data.imageUrls && data.imageUrls.length) && !data.description && !data.linkUrl)
        return res.status(400).json({ error: 'Add a video, pictures, a description or a link' });
      const doc = await Tutorial.create(data);
      res.json(shape(doc));
    } catch (e) { res.status(500).json({ error: 'Failed to save tutorial: ' + e.message }); }
  });

  app.put('/api/admin/tutorials/:id', anyAdminAuth, uploadMw, async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
      const existing = await Tutorial.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Tutorial not found' });
      const data = readBody(req, existing);
      if (data.title === '') return res.status(400).json({ error: 'Title cannot be empty' });
      data.updatedAt = new Date();
      const doc = await Tutorial.findByIdAndUpdate(req.params.id, data, { new: true });
      res.json(shape(doc));
    } catch (e) { res.status(500).json({ error: 'Failed to update tutorial: ' + e.message }); }
  });

  app.delete('/api/admin/tutorials/:id', anyAdminAuth, async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
      await Tutorial.findByIdAndDelete(req.params.id);
      res.json({ message: 'Tutorial deleted' });
    } catch (e) { res.status(500).json({ error: 'Failed to delete tutorial' }); }
  });
};
