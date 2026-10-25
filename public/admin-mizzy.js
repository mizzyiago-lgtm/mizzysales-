/* Mizzy Sales admin additions: Product logos + Buy Number 3 manager. */
const kEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kN = n => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
const kMsg = (id, t, bad) => { const el = document.getElementById(id); if (el) { el.textContent = t || ''; el.style.color = bad ? 'var(--red,#ef4444)' : 'var(--green,#18a0fb)'; } };

/* ───────── Product logos ───────── */
let kLogoData = '';
function kLogoPick(input) {
  const f = input.files && input.files[0]; kLogoData = '';
  const pv = document.getElementById('kLogoPreview'); pv.innerHTML = '';
  if (!f) return;
  if (!/^image\//.test(f.type)) { kMsg('kLogoMsg', 'Choose an image file.', true); return; }
  const rd = new FileReader();
  rd.onload = () => {
    if (f.type === 'image/svg+xml' || f.type === 'image/gif') { kLogoData = rd.result; pv.innerHTML = `<img src="${kLogoData}" style="height:64px;background:#fff;border-radius:10px;padding:4px">`; return; }
    const im = new Image();
    im.onload = () => {
      const max = 256, sc = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * sc)); c.height = Math.max(1, Math.round(im.height * sc));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      kLogoData = c.toDataURL('image/png'); pv.innerHTML = `<img src="${kLogoData}" style="height:64px;background:#fff;border-radius:10px;padding:4px">`;
    };
    im.onerror = () => kMsg('kLogoMsg', 'That image could not be read.', true);
    im.src = rd.result;
  };
  rd.readAsDataURL(f);
}
async function kLogoSave() {
  const label = document.getElementById('kLogoName').value.trim(), kw = document.getElementById('kLogoKw').value.trim();
  if (!label) return kMsg('kLogoMsg', 'Enter a name, for example Facebook.', true);
  if (!kLogoData) return kMsg('kLogoMsg', 'Choose an image first.', true);
  try {
    await aFetch('/api/admin/brand-logos', 'POST', { label, keywords: kw || label, image: kLogoData });
    document.getElementById('kLogoName').value = ''; document.getElementById('kLogoKw').value = ''; document.getElementById('kLogoFile').value = ''; document.getElementById('kLogoPreview').innerHTML = ''; kLogoData = '';
    kMsg('kLogoMsg', 'Logo saved. Every matching product now uses it.'); kLogosLoad();
  } catch (e) { kMsg('kLogoMsg', e.message, true); }
}
async function kLogosLoad() {
  const box = document.getElementById('kLogoList'); if (!box) return;
  try {
    const rows = await aFetch('/api/admin/brand-logos');
    box.innerHTML = rows.length ? rows.map(r => `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--border,#dbe6f6)">
      <img src="${kEsc(r.url)}" style="width:48px;height:48px;object-fit:contain;background:#fff;border-radius:10px;padding:3px">
      <div style="flex:1;min-width:180px"><b>${kEsc(r.label)}</b>${r.enabled ? '' : ' <span style="color:var(--red,#ef4444)">(off)</span>'}
        <input type="text" id="kLk_${r.id}" value="${kEsc(r.keywords.join(', '))}" style="width:100%;margin-top:4px" placeholder="keywords, comma separated"></div>
      <button class="btn-sm" type="button" onclick="kLogoUpdate('${r.id}')">Save</button>
      <button class="btn-sm" type="button" onclick="kLogoToggle('${r.id}',${!r.enabled})">${r.enabled ? 'Turn off' : 'Turn on'}</button>
      <label class="btn-sm" style="cursor:pointer;margin:0">Change image<input type="file" accept="image/*" style="display:none" onchange="kLogoReplace('${r.id}',this)"></label>
      <button class="btn-sm" type="button" style="color:var(--red,#ef4444)" onclick="kLogoDelete('${r.id}')">Delete</button></div>`).join('') : '<div class="info-box">No logos yet. Add one above.</div>';
  } catch (e) { box.textContent = e.message; }
}
async function kLogoUpdate(id) { try { await aFetch('/api/admin/brand-logos/' + id, 'PUT', { keywords: document.getElementById('kLk_' + id).value }); kMsg('kLogoMsg', 'Keywords saved.'); kLogosLoad(); } catch (e) { kMsg('kLogoMsg', e.message, true); } }
async function kLogoToggle(id, on) { try { await aFetch('/api/admin/brand-logos/' + id, 'PUT', { enabled: on }); kLogosLoad(); } catch (e) { kMsg('kLogoMsg', e.message, true); } }
async function kLogoDelete(id) { if (!confirm('Delete this logo? Products go back to their default picture.')) return; try { await aFetch('/api/admin/brand-logos/' + id, 'DELETE'); kLogosLoad(); } catch (e) { kMsg('kLogoMsg', e.message, true); } }
function kLogoReplace(id, input) {
  const f = input.files && input.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const send = data => aFetch('/api/admin/brand-logos/' + id, 'PUT', { image: data }).then(() => { kMsg('kLogoMsg', 'Image updated.'); kLogosLoad(); }).catch(e => kMsg('kLogoMsg', e.message, true));
    if (f.type === 'image/svg+xml' || f.type === 'image/gif') return send(rd.result);
    const im = new Image(); im.onload = () => { const sc = Math.min(1, 256 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * sc)); c.height = Math.max(1, Math.round(im.height * sc)); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); send(c.toDataURL('image/png')); }; im.src = rd.result;
  };
  rd.readAsDataURL(f);
}

/* ───────── Buy Number 3 ───────── */
let n3Poll = null, n3Enabled = false;
async function n3Load() {
  try {
    const o = await aFetch('/api/admin/n3/overview');
    n3Enabled = !!o.enabled; n3Btn();
    document.getElementById('n3Info').textContent = (o.keyConfigured ? 'Provider connected.' : 'Provider key missing: add NOVA_API_KEY in the Render environment.') + ' Custom prices/hidden services: ' + o.overrides + '.';
    document.getElementById('n3Hidden').value = (o.hiddenNames || []).join(', ');
    n3SyncStatus();
  } catch (e) { kMsg('n3Msg', e.message, true); }
  if (!document.getElementById('n3Country').options.length || document.getElementById('n3Country').options.length < 2) n3LoadCountries();
}
function n3Btn() { const b = document.getElementById('n3Toggle'); if (b) { b.textContent = n3Enabled ? 'Buy Number 3 is ON (visible to customers) — tap to turn off' : 'Buy Number 3 is OFF — tap to turn on'; b.style.background = n3Enabled ? '' : 'var(--red,#ef4444)'; } }
async function n3Toggle() { try { await aFetch('/api/admin/n3/enabled', 'PUT', { enabled: !n3Enabled }); n3Enabled = !n3Enabled; n3Btn(); kMsg('n3Msg', n3Enabled ? 'Buy Number 3 is now ON.' : 'Buy Number 3 is now OFF.'); } catch (e) { kMsg('n3Msg', e.message, true); } }
async function n3SyncStatus() {
  try {
    const s = await aFetch('/api/admin/numbers/sync-status');
    const el = document.getElementById('n3Sync');
    el.textContent = s.running ? `Syncing… ${s.done}/${s.total} ${s.current || ''}` : (s.message || (s.lastSyncedAt ? 'Last synced ' + new Date(s.lastSyncedAt).toLocaleString() : 'Not synced yet.'));
    if (s.running && !n3Poll) n3Poll = setInterval(n3SyncStatus, 2500);
    if (!s.running && n3Poll) { clearInterval(n3Poll); n3Poll = null; n3LoadCountries(); }
  } catch (e) { /* ignore */ }
}
async function n3Sync() { try { await aFetch('/api/admin/numbers/sync', 'POST', {}); kMsg('n3Msg', 'Sync started. This can take a few minutes.'); n3SyncStatus(); if (!n3Poll) n3Poll = setInterval(n3SyncStatus, 2500); } catch (e) { kMsg('n3Msg', e.message, true); } }
async function n3LoadCountries() {
  const sel = document.getElementById('n3Country'); if (!sel) return;
  try { const cs = await aFetch('/api/numbers/live-countries'); const cur = sel.value; sel.innerHTML = '<option value="">Choose country…</option>' + cs.map(c => `<option value="${kEsc(c.code || c.iso || c.country_code || c.name)}">${kEsc(c.name || c.country_name || c.code)}</option>`).join(''); if (cur) sel.value = cur; } catch (e) { /* ignore */ }
}
async function n3SaveHidden() { try { await aFetch('/api/admin/n3/hidden-names', 'PUT', { names: document.getElementById('n3Hidden').value }); kMsg('n3Msg', 'Hidden services saved.'); } catch (e) { kMsg('n3Msg', e.message, true); } }
let n3Rows = [];
async function n3LoadServices() {
  const c = document.getElementById('n3Country').value, q = document.getElementById('n3Q').value.trim(), box = document.getElementById('n3List');
  if (!c) return kMsg('n3Msg', 'Choose a country first.', true);
  box.textContent = 'Loading…';
  try { const d = await aFetch('/api/admin/n3/services?country=' + encodeURIComponent(c) + '&q=' + encodeURIComponent(q)); n3Rows = d.rows; n3Render(d.total); }
  catch (e) { box.textContent = e.message; }
}
function n3Render(total) {
  const box = document.getElementById('n3List');
  box.innerHTML = n3Rows.length ? `<div class="info-box">Showing ${n3Rows.length}${total > n3Rows.length ? ' of ' + total + ' (search to narrow down)' : ''}. Leave the price empty for the automatic price.</div>
  <table class="data-table" style="width:100%"><thead><tr><th>Service</th><th>Server</th><th>Cost</th><th>Auto price</th><th>Your price</th><th>Hide</th><th></th></tr></thead><tbody>` +
    n3Rows.map((r, i) => `<tr><td>${kEsc(r.name)}</td><td>${kEsc(r.serverName || r.serverId || '')}</td><td>${kN(r.cost)}</td><td>${kN(r.autoPrice)}</td>
    <td><input type="number" min="0" id="n3p_${i}" value="${r.price || ''}" placeholder="auto" style="width:100px"></td>
    <td><input type="checkbox" id="n3h_${i}" ${r.hidden ? 'checked' : ''}></td>
    <td><button class="btn-sm" type="button" onclick="n3SaveRow(${i})">Save</button></td></tr>`).join('') + '</tbody></table>' : '<div class="info-box">No services found. Run a sync first.</div>';
}
async function n3SaveRow(i) {
  const r = n3Rows[i]; if (!r) return;
  try { await aFetch('/api/admin/n3/services/' + encodeURIComponent(r.id), 'PUT', { price: Number(document.getElementById('n3p_' + i).value || 0), hidden: document.getElementById('n3h_' + i).checked }); kMsg('n3Msg', 'Saved ' + r.name + '.'); } catch (e) { kMsg('n3Msg', e.message, true); }
}

/* ───────── Marketplace 4 (same engine as Marketplace 3) ───────── */
// ── Logs 4 / Marketplace 4 ──
let m4Cfg={}, m4List=[];
function m4Btn(){
  const b=document.getElementById('m4Btn'); if(!b) return;
  b.textContent = m4Cfg.market4Enabled ? 'Marketplace 4 is ON — tap to disable' : 'Marketplace 4 is OFF (maintenance) — tap to enable';
  b.style.background = m4Cfg.market4Enabled ? '' : 'var(--red)';
}
async function m4LoadConfig(){
  try { m4Cfg = await aFetch('/api/admin/market4/config'); m4Btn();
    document.getElementById('m4Msg').value=m4Cfg.maintenanceMessage||'';
    document.getElementById('m4Low').value=m4Cfg.lowBalanceNgn||0;
    document.getElementById('m4Email').value=m4Cfg.alertEmail||'';
    document.getElementById('m4Markup').value=(m4Cfg.defaultMarkupNgn===null||m4Cfg.defaultMarkupNgn===undefined)?'':m4Cfg.defaultMarkupNgn;
    document.getElementById('m4BaseUrl').value=m4Cfg.baseUrl||'https://provider.example.com/api/v1';
  } catch(e){ document.getElementById('m4Balance').textContent='Could not load Marketplace 4 settings: '+e.message; }
}
async function m4Toggle(){
  try { await aFetch('/api/admin/market4/config','PUT',{market4Enabled: !m4Cfg.market4Enabled}); m4Cfg.market4Enabled=!m4Cfg.market4Enabled; m4Btn(); } catch(e){ alert(e.message); }
}
async function m4SaveConfig(){
  try { const body={ maintenanceMessage: document.getElementById('m4Msg').value, lowBalanceNgn: Number(document.getElementById('m4Low').value||0), alertEmail: document.getElementById('m4Email').value, defaultMarkupNgn: document.getElementById('m4Markup').value.trim()===''?null:Number(document.getElementById('m4Markup').value), baseUrl:document.getElementById('m4BaseUrl').value }; const key=document.getElementById('m4ApiKey').value.trim(); if(key)body.apiKey=key; await aFetch('/api/admin/market4/config','PUT',body); document.getElementById('m4ApiKey').value=''; alert('Marketplace 4 settings saved.'); await m4LoadConfig(); } catch(e){ alert(e.message); }
}
async function m4LoadBalance(){
  const el=document.getElementById('m4Balance');
  try { const b=await aFetch('/api/admin/market4/balance'); el.innerHTML=`Supplier (the provider) balance: <b>${m2N(b.balance)}</b> · alert below ${m2N(b.threshold)}`; el.style.color = b.balance < b.threshold ? 'var(--red)' : ''; }
  catch(e){ el.textContent='Balance check failed: '+e.message+' — check the Marketplace 4 API key in settings'; el.style.color='var(--red)'; }
}
async function m4LoadProducts(refresh){
  const el=document.getElementById('m4Products'); el.textContent='Loading…';
  try { try { m4List = await aFetch('/api/admin/market4/products'+(refresh?'?refresh=1':'')); } catch(e1){ if(!refresh) throw e1; m4List = await aFetch('/api/admin/market4/products'); setTimeout(function(){ alert('Could not refresh from the provider: '+e1.message+'\nShowing the last saved list.'); },50); } m4Render(); }
  catch(e){ el.innerHTML=`<span style="color:var(--red)">${esc(e.message)}</span>`; }
}
function m4Render(){
  const q=(document.getElementById('m4Search').value||'').toLowerCase(), f=document.getElementById('m4Filter').value;
  let rows=m4List.filter(p=>!q||`${p.name} ${p.category} ${p.customTitle}`.toLowerCase().includes(q));
  if(f==='priced') rows=rows.filter(p=>p.priced); if(f==='unpriced') rows=rows.filter(p=>!p.priced); if(f==='instock') rows=rows.filter(p=>p.inStock);
  document.getElementById('m4Products').innerHTML = rows.length ? `<table class="data-table" style="width:100%"><thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>API cost</th><th>Your price</th><th>Profit</th><th>Show</th><th></th></tr></thead><tbody>`+
    rows.map(p=>`<tr><td><b>${esc(p.name)}</b><br/><input type="text" id="m4t_${p.id}" value="${esc(p.customTitle)}" placeholder="Custom title (optional)" style="margin-top:4px;width:100%"/><input type="text" id="m4d_${p.id}" value="${esc(p.description)}" placeholder="Description (optional)" style="margin-top:4px;width:100%"/><input type="text" id="m4i_${p.id}" value="${esc(p.picture&&!String(p.picture).startsWith('data:')?p.picture:'')}" placeholder="Picture URL (optional)" style="margin-top:4px;width:100%"/></td>
      <td>${esc(p.category)}</td><td style="color:${p.inStock?'var(--green,#18a0fb)':'var(--red)'}">${p.inStock?p.stock+' available':'Out of stock'}</td>
      <td>${m2N(p.cost)}</td><td><input type="number" min="0" id="m4p_${p.id}" value="${p.sellPrice||''}" placeholder="0 = hidden" style="width:110px" oninput="m4Profit(${p.id},${p.cost})"/></td>
      <td id="m4pr_${p.id}" style="color:${p.profit>0?'var(--green,#18a0fb)':'var(--red)'}">${p.priced?m2N(p.profit):'—'}</td>
      <td><input type="checkbox" id="m4e_${p.id}" ${p.enabled?'checked':''}/></td>
      <td><button class="btn-sm" type="button" onclick="m4Save(${p.id},${p.cost})">Save</button></td></tr>`).join('')+'</tbody></table>'
    : '<div class="no-items">No products</div>';
}
function m4Profit(id,cost){ const v=Number(document.getElementById('m4p_'+id).value||0), el=document.getElementById('m4pr_'+id); el.textContent=v?m2N(v-cost):'—'; el.style.color=v>cost?'var(--green,#18a0fb)':'var(--red)'; }
async function m4Save(id,cost){
  const price=Number(document.getElementById('m4p_'+id).value||0);
  if(price>0 && price<=cost && !confirm('Your price is not above the API cost — you would lose money. Save anyway? (customers cannot buy it until the price is above cost)')) return;
  try { await aFetch('/api/admin/market4/products/'+id,'PUT',{ sellPrice: price, enabled: document.getElementById('m4e_'+id).checked, customTitle: document.getElementById('m4t_'+id).value, description: document.getElementById('m4d_'+id).value, picture: document.getElementById('m4i_'+id).value });
    const p=m4List.find(x=>x.id===id); if(p){ p.sellPrice=price; p.priced=price>0; p.profit=price?price-cost:0; p.enabled=document.getElementById('m4e_'+id).checked; }
    alert(price>0 && document.getElementById('m4e_'+id).checked ? 'Saved — visible to customers when in stock' : 'Saved — hidden from customers');
  } catch(e){ alert(e.message); }
}
async function m4LoadOrders(){
  const el=document.getElementById('m4Orders');
  try { const d=await aFetch('/api/admin/market4/orders'); const t=d.totals;
    m4RenderAttention(d.attention||[]);
    const badge=s=>`<span style="color:${s==='delivered'?'var(--green,#18a0fb)':(s==='failed'||s==='refunded')?'var(--red)':'var(--gold)'};font-weight:700">${esc(s)}</span>`;
    el.innerHTML=`<div class="info-box">Orders: <b>${t.count}</b> · Sales: <b>${m2N(t.sales)}</b> · API cost: <b>${m2N(t.cost)}</b> · Profit: <b style="color:var(--green,#18a0fb)">${m2N(t.profit)}</b></div>`+
      (d.orders.length?`<table class="data-table" style="width:100%"><thead><tr><th>Date</th><th>User</th><th>Product</th><th>Qty</th><th>Paid</th><th>Cost</th><th>Profit</th><th>Status</th><th></th></tr></thead><tbody>`+d.orders.map(o=>`<tr><td>${new Date(o.createdAt).toLocaleString()}</td><td>${esc(o.userEmail)}</td><td>${esc(o.productName)}</td><td>${o.quantity}</td><td>${m2N(o.sellTotal)}</td><td>${m2N(o.costTotal)}</td><td>${m2N(o.profit)}</td><td>${badge(o.status)}</td><td>${(o.status==='delivered'||o.status==='partial')?`<button class="btn-sm" type="button" onclick="m4ShowKeys('${o._id}')">Keys</button>`:''}</td></tr>`).join('')+'</tbody></table>':'<div class="no-items">No sales yet</div>');
  } catch(e){ el.textContent=e.message; }
}
function m4RenderAttention(list){
  const sec=document.getElementById('m4AttentionSec'), el=document.getElementById('m4Attention');
  if(!list.length){ sec.style.display='none'; el.innerHTML=''; return; }
  sec.style.display='';
  el.innerHTML=`<table class="data-table" style="width:100%"><thead><tr><th>Date</th><th>Customer</th><th>Product</th><th>Paid</th><th>Status</th><th>What happened</th><th>Fix</th></tr></thead><tbody>`+
    list.map(o=>`<tr><td>${new Date(o.createdAt).toLocaleString()}</td><td>${esc(o.userEmail)}</td><td>${esc(o.title)}</td><td>${m2N(o.sellTotal)}</td><td><b>${esc(o.status)}</b></td><td style="max-width:260px">${esc(o.note||'Waiting to finish…')}</td>
      <td style="min-width:240px">${o.status==='review'||o.status==='pending'?`<textarea id="m4k_${o._id}" rows="3" placeholder="Paste the keys from the provider, one per line" style="width:100%"></textarea>
        <button class="btn-sm" type="button" onclick="m4Deliver('${o._id}')">Deliver keys</button>
        <button class="btn-sm" type="button" style="background:var(--red)" onclick="m4Refund('${o._id}')">Refund customer</button>`
        :`<button class="btn-sm" type="button" onclick="m4Resync('${o._id}')">Re-send to customer</button>`}</td></tr>`).join('')+'</tbody></table>';
}
async function m4Deliver(id){
  const keys=(document.getElementById('m4k_'+id).value||'').trim();
  if(!keys){ alert('Paste the keys first (one per line).'); return; }
  if(!confirm('Deliver these keys to the customer now?')) return;
  try { await aFetch('/api/admin/market4/orders/'+id+'/deliver','POST',{keys}); alert('Delivered to the customer'); m4LoadOrders(); } catch(e){ alert(e.message); }
}
async function m4Refund(id){
  if(!confirm('Refund this customer the full amount? Only do this if the order was NOT delivered by the provider.')) return;
  try { await aFetch('/api/admin/market4/orders/'+id+'/refund','POST',{}); alert('Customer refunded'); m4LoadOrders(); } catch(e){ alert(e.message); }
}
async function m4Resync(id){
  try { const r=await aFetch('/api/admin/market4/orders/'+id+'/resync','POST',{}); alert(r.ok?'Sent to the customer’s purchases':'Nothing to send'); m4LoadOrders(); } catch(e){ alert(e.message); }
}
async function m4ShowKeys(id){
  try { const r=await aFetch('/api/admin/market4/orders/'+id+'/keys'); alert((r.userEmail||'')+'\n\n'+((r.keys||[]).join('\n')||'(no keys stored)')); } catch(e){ alert(e.message); }
}

