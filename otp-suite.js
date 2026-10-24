// OTP Suite integration for Buy Number 2.
// API credentials are server-side only: OTP_SUITE_API_KEY in the deployment environment.
const axios = require('axios');
const crypto = require('crypto');
module.exports = function registerOtpSuite(app, deps) {
  const { mongoose, User, Transaction, auth, anyAdminAuth } = deps;
  let runtimeApiKey = ''; let runtimeBaseUrl = '';
  const encryptionKey = () => crypto.createHash('sha256').update(String(process.env.JWT_SECRET || 'provider-config-key')).digest();
  function encryptSecret(value){const iv=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',encryptionKey(),iv);const out=Buffer.concat([c.update(String(value),'utf8'),c.final()]);return 'v1:'+iv.toString('hex')+':'+c.getAuthTag().toString('hex')+':'+out.toString('hex');}
  function decryptSecret(value){try{const p=String(value||'').split(':');if(p.length!==4||p[0]!=='v1')return '';const d=crypto.createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(p[1],'hex'));d.setAuthTag(Buffer.from(p[2],'hex'));return Buffer.concat([d.update(Buffer.from(p[3],'hex')),d.final()]).toString('utf8')}catch(e){return ''}}
  const base = () => String(runtimeBaseUrl || process.env.OTP_SUITE_BASE_URL || 'https://otpsuite.com/api/v1').replace(/\/+$/, '');
  const key = () => String(runtimeApiKey || process.env.OTP_SUITE_API_KEY || '').trim();
  const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ref: { type: String, unique: true, required: true }, supplierOrderId: { type: String, default: '' },
    countryCode: String, countryName: String, serviceId: String, serviceName: String,
    phoneNumber: String, price: Number, providerCost: Number, sms: String, status: { type: String, default: 'pending', index: true },
    debited: { type: Boolean, default: false }, refunded: { type: Boolean, default: false },
    providerRefund: Number, lastError: String, createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now }
  });
  const Order = mongoose.models.OtpSuiteOrder || mongoose.model('OtpSuiteOrder', orderSchema);
  const configSchema = new mongoose.Schema({ key:{type:String,default:'main',unique:true}, enabled:{type:Boolean,default:true}, markupNgn:{type:Number,default:Number(process.env.OTP_SUITE_MARKUP_NGN||300)}, apiKeyCipher:{type:String,default:''}, customBaseUrl:{type:String,default:''} });
  const Config = mongoose.models.OtpSuiteConfig || mongoose.model('OtpSuiteConfig', configSchema);
  async function getCfg(){ let c=await Config.findOne({key:'main'}); if(!c)c=await Config.create({key:'main',markupNgn:Number(process.env.OTP_SUITE_MARKUP_NGN||300)}); runtimeApiKey=c.apiKeyCipher?decryptSecret(c.apiKeyCipher):'';runtimeBaseUrl=c.customBaseUrl||'';return c; }
  async function call(method, path, { params, data, timeout=20000 }={}) {
    await getCfg();
    if (!key()) { const e = new Error('Number service is not available right now.'); e.status=503; throw e; }
    try {
      const r = await axios({ method, url: base()+path, params, data, timeout, headers: { 'X-API-KEY': key(), 'Content-Type':'application/json', Accept:'application/json' } });
      const body = r.data;
      if (body && body.success === false) { const e=new Error(body.error || 'Number service request failed'); e.status=r.status; throw e; }
      return body && body.success === true ? body.data : body;
    } catch (err) {
      if (err.status) throw err;
      const status = err.response?.status || 0;
      const msg = err.response?.data?.error || ({401:'Number service authentication failed.',403:'Number service is temporarily unavailable.',402:'Number service is temporarily unavailable.',404:'That country, service or order is no longer available.',409:'No numbers are currently available for that selection.'}[status]) || err.message || 'Number service request failed';
      const e = new Error(msg); e.status=status || 502; e.ambiguous=!status || status>=500 || err.code==='ECONNABORTED'; throw e;
    }
  }
  function safeOrder(o) { return { id:String(o._id), orderId:o.supplierOrderId, country:o.countryName, countryCode:o.countryCode, service:o.serviceName, number:o.phoneNumber, price:o.price, status:o.status, sms:o.sms || null, createdAt:o.createdAt, canCancel:['waiting','pending'].includes(o.status) && !o.sms }; }
  app.get('/api/numbers/otp-suite/countries', auth, async (req,res)=>{ try { const cfg=await getCfg(); if(!cfg.enabled)return res.status(503).json({error:'Buy Number 2 is temporarily unavailable.'}); const d=await call('get','/countries'); res.json(d.countries||[]); } catch(e){ res.status(e.status||502).json({error:e.message}); } });
  app.get('/api/numbers/otp-suite/services', auth, async (req,res)=>{ const country=String(req.query.country||'').trim().slice(0,8); if(!country) return res.status(400).json({error:'Choose a country first.'}); try { const cfg=await getCfg(); if(!cfg.enabled)return res.status(503).json({error:'Buy Number 2 is temporarily unavailable.'}); const d=await call('get','/services',{params:{country}}); res.json((d.services||[]).map(x=>{const cost=Number(x.your_price ?? x.base_price)||0;return {id:x.service_id,name:x.service_name,cost,sellPrice:Math.ceil(cost+Math.max(0,Number(cfg.markupNgn)||0)),basePrice:Number(x.base_price)||0};})); } catch(e){ res.status(e.status||502).json({error:e.message}); } });
  app.get('/api/numbers/otp-suite/orders', auth, async (req,res)=>{ try { const rows=await Order.find({userId:req.user._id}).sort({createdAt:-1}).limit(50).lean(); res.json(rows.map(safeOrder)); } catch(e){res.status(500).json({error:'Could not load number history.'});} });
  app.post('/api/numbers/otp-suite/buy', auth, async (req,res)=>{
    const country=String(req.body?.country||'').trim().slice(0,8), service=String(req.body?.service||'').trim().slice(0,100);
    if(!country||!service) return res.status(400).json({error:'Choose a country and service.'});
    const ref=String(req.body?.clientRef||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64)||crypto.randomUUID();
    let order;
    try {
      const cfg=await getCfg(); if(!cfg.enabled)return res.status(503).json({error:'Buy Number 2 is temporarily unavailable.'});
      const existing=await Order.findOne({ref}); if(existing){ if(String(existing.userId)!==String(req.user._id)) return res.status(409).json({error:'Invalid purchase reference.'}); return res.json({ok:true,repeated:true,order:safeOrder(existing)}); }
      const recentUnclear=await Order.findOne({userId:req.user._id,countryCode:country,serviceId:service,status:'review',createdAt:{$gte:new Date(Date.now()-10*60*1000)}}).sort({createdAt:-1});
      if(recentUnclear) return res.status(202).json({ok:true,pending:true,orderId:String(recentUnclear._id),message:'A recent purchase is still being verified. Please check Number History before trying again.'});
      const catalog=await call('get','/services',{params:{country}}); const svc=(catalog.services||[]).find(x=>String(x.service_id)===service); if(!svc) return res.status(404).json({error:'That service is no longer available.'});
      const providerCost=Number(svc.your_price ?? svc.base_price); const price=Math.ceil(providerCost+Math.max(0,Number(cfg.markupNgn)||0)); if(!Number.isFinite(providerCost)||providerCost<=0||!Number.isFinite(price)||price<=0) return res.status(400).json({error:'Invalid provider price.'});
      order=await Order.create({userId:req.user._id,ref,countryCode:country,countryName:catalog.country||country,serviceId:service,serviceName:svc.service_name,price,providerCost,status:'pending'});
      const user=await User.findOneAndUpdate({_id:req.user._id,balance:{$gte:price}},{$inc:{balance:-price}},{new:true});
      if(!user){ await Order.updateOne({_id:order._id},{$set:{status:'failed',lastError:'Insufficient wallet balance'}}); return res.status(400).json({error:'Insufficient wallet balance.'}); }
      await Order.updateOne({_id:order._id},{$set:{debited:true}});
      let bought;
      try { bought=await call('post','/buy-number',{data:{country,service},timeout:30000}); }
      catch(e){
        if(e.ambiguous){ await Order.updateOne({_id:order._id},{$set:{status:'review',lastError:e.message,updatedAt:new Date()}}); return res.status(202).json({ok:true,pending:true,orderId:String(order._id),message:'The provider response is unclear. Your order is being checked; please do not purchase again.'}); }
        const claimed=await Order.findOneAndUpdate({_id:order._id,refunded:false},{$set:{refunded:true,status:'failed',lastError:e.message,updatedAt:new Date()}},{new:true});
        if(claimed){ try { await User.updateOne({_id:req.user._id},{$inc:{balance:price}}); await Transaction.create({userId:req.user._id,type:'refund',amount:price,description:'Number purchase refund',status:'success'}).catch(()=>{}); } catch(refundErr) { await Order.updateOne({_id:order._id},{$set:{refunded:false,status:'review',lastError:'Automatic refund needs admin review: '+refundErr.message}}).catch(()=>{}); return res.status(202).json({ok:true,pending:true,orderId:String(order._id),message:'The purchase could not be completed and the refund needs review. Please contact support.'}); } }
        return res.status(e.status===409?409:400).json({error:(e.status===409?'No numbers are available for that selection.':'We could not complete this purchase. Nothing was charged.')});
      }
      const d=bought||{};
      await Order.updateOne({_id:order._id},{$set:{supplierOrderId:String(d.order_id||''),phoneNumber:String(d.number||''),serviceName:String(d.service||svc.service_name),countryName:String(d.country||catalog.country||country),status:String(d.status||'waiting'),updatedAt:new Date()}});
      await Transaction.create({userId:req.user._id,type:'purchase',amount:price,description:`Buy Number 2 — ${svc.service_name}`,status:'success'}).catch(()=>{});
      const saved=await Order.findById(order._id).lean(); res.json({ok:true,order:safeOrder(saved),balance:user.balance});
    } catch(e){ console.error('[OTP Suite] buy failed:',e.message); res.status(e.status||500).json({error:e.message||'Could not purchase a number.'}); }
  });
  app.get('/api/numbers/otp-suite/sms/:id', auth, async (req,res)=>{
    try { const o=await Order.findOne({_id:req.params.id,userId:req.user._id}); if(!o) return res.status(404).json({error:'Order not found.'}); if(!o.supplierOrderId) return res.json({order:safeOrder(o)}); if(o.status==='cancelled'||o.status==='received'||o.sms) return res.json({order:safeOrder(o)}); const d=await call('get','/get-sms',{params:{order_id:o.supplierOrderId}}); const status=String(d.status||o.status); const sms=d.sms?String(d.sms):''; await Order.updateOne({_id:o._id},{$set:{status,sms:sms||o.sms,updatedAt:new Date()}}); const fresh=await Order.findById(o._id).lean(); res.json({order:safeOrder(fresh)}); } catch(e){res.status(e.status||502).json({error:e.message});}
  });
  app.post('/api/numbers/otp-suite/cancel/:id', auth, async (req,res)=>{
    try { const o=await Order.findOne({_id:req.params.id,userId:req.user._id}); if(!o) return res.status(404).json({error:'Order not found.'}); if(o.refunded||o.status==='cancelled') return res.json({ok:true,order:safeOrder(o)}); if(!o.supplierOrderId||o.sms||o.status==='received') return res.status(400).json({error:'This order can no longer be cancelled.'}); const d=await call('post','/cancel-number',{data:{order_id:o.supplierOrderId}}); if(String(d.status)!=='cancelled') return res.status(400).json({error:'Provider has not confirmed cancellation.'}); const providerRefund=Number(d.refunded)||o.providerCost||o.price; const refund=o.price; const claimed=await Order.findOneAndUpdate({_id:o._id,refunded:false},{$set:{refunded:true,status:'cancelled',providerRefund:providerRefund,updatedAt:new Date()}},{new:true}); if(claimed){await User.updateOne({_id:o.userId},{$inc:{balance:refund}}); await Transaction.create({userId:o.userId,type:'refund',amount:refund,description:'OTP Suite number cancellation refund',status:'success'}).catch(()=>{});} const fresh=await Order.findById(o._id).lean(); res.json({ok:true,order:safeOrder(fresh)}); } catch(e){res.status(e.status||502).json({error:e.message});}
  });
  app.get('/api/admin/otp-suite/status', anyAdminAuth, async(req,res)=>{const c=await getCfg();res.json({configured:!!key(),baseUrl:base(),enabled:c.enabled,markupNgn:c.markupNgn});});
  app.get('/api/admin/otp-suite/orders', anyAdminAuth, async(req,res)=>{try{const rows=await Order.find({}).sort({createdAt:-1}).limit(100).lean();res.json(rows.map(o=>({...safeOrder(o),userId:String(o.userId),lastError:o.lastError||'',refunded:!!o.refunded,providerCost:o.providerCost||0})));}catch(e){res.status(500).json({error:'Could not load OTP Suite orders.'});}})
  app.put('/api/admin/otp-suite/config', anyAdminAuth, async(req,res)=>{const c=await getCfg();if(typeof req.body?.enabled==='boolean')c.enabled=req.body.enabled;if(req.body?.markupNgn!==undefined){const n=Number(req.body.markupNgn);if(!Number.isFinite(n)||n<0||n>100000)return res.status(400).json({error:'Markup must be between ₦0 and ₦100,000.'});c.markupNgn=n;}if(typeof req.body?.apiKey==='string'&&req.body.apiKey.trim())c.apiKeyCipher=encryptSecret(req.body.apiKey.trim());if(typeof req.body?.baseUrl==='string'&&req.body.baseUrl.trim()){try{const u=new URL(req.body.baseUrl.trim());if(u.protocol!=='https:'||u.hostname!=='otpsuite.com')return res.status(400).json({error:'Use the official HTTPS number-service API URL.'});c.customBaseUrl=req.body.baseUrl.trim().replace(/\/+$/,'')}catch(e){return res.status(400).json({error:'Enter a valid HTTPS API URL.'})}}await c.save();await getCfg();res.json({ok:true,enabled:c.enabled,markupNgn:c.markupNgn,configured:!!key(),baseUrl:base()});});
  app.post('/api/admin/otp-suite/orders/:id/refund', anyAdminAuth, async(req,res)=>{try{const o=await Order.findById(req.params.id);if(!o)return res.status(404).json({error:'Order not found.'});if(!o.debited)return res.status(400).json({error:'This order was not charged.'});if(o.refunded)return res.status(400).json({error:'This order has already been refunded.'});if(o.sms||o.status==='received')return res.status(400).json({error:'This order has an SMS code and cannot be refunded here.'});const claimed=await Order.findOneAndUpdate({_id:o._id,refunded:false},{$set:{refunded:true,status:'refunded',lastError:'Refunded manually by admin after provider review.',updatedAt:new Date()}},{new:true});if(!claimed)return res.status(409).json({error:'This order was already processed.'});try{await User.updateOne({_id:o.userId},{$inc:{balance:o.price||0}});await Transaction.create({userId:o.userId,type:'refund',amount:o.price||0,description:'Buy Number 2 manual refund',status:'success'}).catch(()=>{});}catch(e){await Order.updateOne({_id:o._id},{$set:{refunded:false,status:'review',lastError:'Manual refund failed and needs retry: '+e.message}}).catch(()=>{});return res.status(500).json({error:'Wallet refund failed; order was returned to review.'});}res.json({ok:true,refunded:o.price||0});}catch(e){res.status(500).json({error:'Could not refund this order.'});}});
  app.get('/api/admin/otp-suite/balance', anyAdminAuth, async(req,res)=>{try{res.json(await call('get','/balance'));}catch(e){res.status(e.status||502).json({error:e.message});}});
};
