/* public/js/boost-history.js — delivered / pending / failed boost tracking. */
(function () {
  const T = () => localStorage.getItem('ksl_token') || '';
  const api = async (u, opts = {}) => {
    const r = await fetch(u, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T(), ...(opts.headers || {}) },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Something went wrong');
    return d;
  };
  const post = (u, body) => api(u, { method: 'POST', body: JSON.stringify(body || {}) });
  /* Nigeria sees naira; every other country sees US dollars. Ledger stays in NGN. */
  const money = n => (window.MYSMoney && typeof window.MYSMoney.amount === 'function')
    ? window.MYSMoney.amount(n)
    : '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moneyNgn = n => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  let bucket = 'all';
  const boost2Bucket = status => {
    const value = String(status || '').toLowerCase();
    if (['success', 'complete', 'completed', 'delivered'].includes(value)) return 'delivered';
    if (['failed', 'error', 'rejected', 'refunded'].includes(value)) return 'failed';
    return 'pending';
  };

  async function load(silent) {
    if (!silent) $('bhList').innerHTML = '<div class="bst-empty">Loading your boosts…</div>';
    const [boost1Result, boost2Result] = await Promise.allSettled([
      api('/api/boost/orders?bucket=' + bucket),
      api('/api/boost2/orders'),
    ]);
    const boost1 = boost1Result.status === 'fulfilled' ? boost1Result.value : { orders: [], counts: {} };
    const boost2 = boost2Result.status === 'fulfilled' ? boost2Result.value : { orders: [], counts: {} };
    const c1 = boost1.counts || {}, c2 = boost2.counts || {};
    $('cAll').textContent = (Number(c1.all) || 0) + (Number(c2.all) || 0);
    $('cPending').textContent = (Number(c1.pending) || 0) + (Number(c2.pending) || 0);
    $('cDelivered').textContent = (Number(c1.delivered) || 0) + (Number(c2.delivered) || 0);
    $('cFailed').textContent = (Number(c1.failed) || 0) + (Number(c2.failed) || 0);
    const orders = (boost1.orders || []).map(o => ({ ...o, provider: 'boost1' }));
    for (const o of boost2.orders || []) {
      const status = String(o.status || 'processing');
      const order = {
        id: o.orderId, provider: 'boost2', service: o.itemName || 'Boost 2 order',
        platform: 'Boost 2', quantity: o.quantity, link: o.link, price: o.amountPaid,
        status: status === 'review' ? 'being checked' : status,
        bucket: boost2Bucket(status), createdAt: o.createdAt,
      };
      if (bucket === 'all' || bucket === order.bucket) orders.push(order);
    }
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const errors = [];
    if (boost1Result.status === 'rejected') errors.push('Boosting 1 history could not be loaded.');
    if (boost2Result.status === 'rejected') errors.push('Boosting 2 history could not be loaded.');
    if (!orders.length && errors.length) { $('bhList').innerHTML = `<div class="bst-empty">${esc(errors.join(' '))}</div>`; return; }
    if (!orders.length) { $('bhList').innerHTML = '<div class="bst-empty">No boosts here yet. <a href="/boost">Start one →</a></div>'; return; }
    $('bhList').innerHTML = orders.map(o => `
      <button class="bst-order" data-id="${esc(o.id)}" data-provider="${esc(o.provider)}">
        <div class="bst-order-main">
          <div class="bst-order-name">${esc(o.service)}</div>
          <div class="bst-order-meta">${esc(o.platform)} · ${Number(o.quantity).toLocaleString()} units · ${new Date(o.createdAt).toLocaleString()}</div>
          <div class="bst-order-link">${esc(o.link)}</div>
        </div>
        <div class="bst-order-side">
          <span class="bst-badge ${esc(o.bucket)}">${esc(o.status)}</span>
          <span class="bst-order-price">${o.provider === 'boost2' ? moneyNgn(o.price) : money(o.price)}</span>
        </div>
      </button>`).join('');
    if (errors.length) $('bhList').insertAdjacentHTML('afterbegin', `<div class="bst-empty">${esc(errors.join(' '))}</div>`);
    $('bhList').querySelectorAll('.bst-order').forEach(b => b.onclick = () => openDetail(b.dataset.id, b.dataset.provider));
  }

  async function openDetail(id, provider = 'boost1') {
    $('bhDetail').hidden = false;
    $('bhdBody').innerHTML = '<div class="bst-empty">Refreshing live status…</div>';
    let o;
    try { o = await api((provider === 'boost2' ? '/api/boost2/orders/' : '/api/boost/orders/') + encodeURIComponent(id)); }
    catch (e) { $('bhdBody').innerHTML = `<div class="bst-empty">${esc(e.message)}</div>`; return; }
    if (provider === 'boost2') {
      const status = String(o.status || 'processing');
      $('bhdTitle').textContent = o.itemName || 'Boost 2 order';
      $('bhdBody').innerHTML = `
        <div class="bst-badge ${boost2Bucket(status)}">${esc(status === 'review' ? 'being checked' : status)}</div>
        <div class="bst-kv"><span>Quantity</span><b>${Number(o.quantity).toLocaleString()} units</b></div>
        <div class="bst-kv"><span>Link</span><b>${esc(o.link)}</b></div>
        <div class="bst-kv"><span>Amount</span><b>${moneyNgn(o.amountPaid)}</b></div>
        <div class="bst-kv"><span>Placed</span><b>${new Date(o.createdAt).toLocaleString()}</b></div>
        ${['pending', 'review', 'refunding'].includes(status.toLowerCase()) ? '<div class="bst-hint">This order is still being processed or checked. Please review your order history before placing another order.</div>' : ''}`;
      return;
    }
    $('bhdTitle').textContent = o.service;
    const pct = o.quantity ? Math.min(100, Math.round((o.delivered / o.quantity) * 100)) : 0;
    $('bhdBody').innerHTML = `
      <div class="bst-badge ${esc(o.bucket)}">${esc(o.status)}</div>
      <div class="bst-progress"><span style="width:${pct}%"></span></div>
      <div class="bst-hint">${Number(o.delivered).toLocaleString()} of ${Number(o.quantity).toLocaleString()} delivered (${pct}%)</div>
      <div class="bst-kv"><span>Link</span><b>${esc(o.link)}</b></div>
      <div class="bst-kv"><span>Amount</span><b>${money(o.price)}</b></div>
      <div class="bst-kv"><span>Start count</span><b>${Number(o.startCount).toLocaleString()}</b></div>
      <div class="bst-kv"><span>Remaining</span><b>${Number(o.remains).toLocaleString()}</b></div>
      <div class="bst-kv"><span>Expected delivery</span><b>${esc(o.deliveryTime || '—')}</b></div>
      <div class="bst-kv"><span>Order ref</span><b>${esc(o.providerOrderId)}</b></div>
      <div class="bst-kv"><span>Placed</span><b>${new Date(o.createdAt).toLocaleString()}</b></div>
      ${o.refunded && o.refundAmount ? `<div class="bst-kv"><span>Refunded</span><b>${money(o.refundAmount)}</b></div>` : ''}
      ${o.note ? `<div class="bst-hint">${esc(o.note)}</div>` : ''}
      ${o.canCancel ? `
        <button type="button" class="bst-cancel-btn" id="bhCancel"
          style="margin-top:14px;width:100%;padding:12px;border-radius:12px;border:1px solid rgba(220,38,38,.45);background:rgba(220,38,38,.08);color:#dc2626;font-weight:700;cursor:pointer">
          Cancel this order
        </button>
        <div class="bst-hint" id="bhCancelHint">You are refunded for the units that have not been delivered yet — the delivered part is charged.</div>` : ''}`;
    const btn = $('bhCancel');
    if (btn) btn.onclick = () => cancelOrder(o.id, btn);
  }

  /**
   * Cancel a running order.
   * The server cancels it for real at the provider and refunds only the
   * undelivered part of the order, exactly like the provider panel does.
   */
  async function cancelOrder(id, btn) {
    const hint = $('bhCancelHint');
    btn.disabled = true; btn.textContent = 'Checking what you get back…';
    let q;
    try { q = await post('/api/boost/orders/' + id + '/cancel-quote'); }
    catch (e) { btn.disabled = false; btn.textContent = 'Cancel this order'; if (hint) hint.textContent = e.message; return; }

    const msg = q.delivered > 0
      ? `This order is already running.\n\n`
        + `Delivered so far: ${Number(q.delivered).toLocaleString()} of ${Number(q.quantity).toLocaleString()} units\n`
        + `Charged for delivered units: ${money(q.charged)}\n`
        + `Refund to your wallet: ${money(q.refund)}\n\nCancel it now?`
      : `Nothing has been delivered yet, so you get a full refund of ${money(q.refund)}.\n\nCancel this order?`;
    if (!(await (window.kslConfirm ? window.kslConfirm(msg, { title: 'Cancel boost order', okText: 'Yes, cancel order', cancelText: 'Keep order', danger: true }) : Promise.resolve(window.confirm(msg))))) { btn.disabled = false; btn.textContent = 'Cancel this order'; return; }

    btn.textContent = 'Cancelling at the provider…';
    try {
      const r = await post('/api/boost/orders/' + id + '/cancel');
      const done = r.delivered > 0
        ? `Cancelled. ${money(r.refund)} refunded — ${money(r.charged)} kept for the ${Number(r.delivered).toLocaleString()} units already delivered.`
        : `Cancelled. ${money(r.refund)} refunded to your wallet.`;
      if (window.showToast) window.showToast(done); else alert(done);
      await load(true);
      openDetail(id);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Cancel this order';
      if (hint) hint.textContent = e.message; else alert(e.message);
    }
  }
  window.closeBoostDetail = () => { $('bhDetail').hidden = true; };

  function init() {
    document.querySelectorAll('#bhTabs .bst-tab').forEach(t => t.onclick = () => {
      document.querySelectorAll('#bhTabs .bst-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active'); bucket = t.dataset.bucket; load();
    });
    load();
    startLivePolling();
  }
  /**
   * Live status. The provider webhook already updates the database the moment
   * an order moves, so this only has to notice the change: it asks the server
   * for a fast refresh every few seconds while anything is still pending, and
   * falls back to a slow beat once everything has landed.
   */
  let signature = '';
  function startLivePolling() {
    let seconds = 15;
    let timer = null;
    const tick = async () => {
      if (document.hidden) return schedule();
      try {
        const d = await api('/api/boost/orders-live');
        if (d.pollSeconds) seconds = Math.max(5, Number(d.pollSeconds) || 15);
        const orders = d.orders || [];
        const sig = orders.map(o => o.id + ':' + o.status + ':' + o.remains).join('|');
        const anyPending = orders.some(o => o.bucket === 'pending');
        if (sig !== signature) { signature = sig; await load(true); }
        seconds = anyPending ? seconds : 60;
      } catch { /* offline — try again on the next beat */ }
      schedule();
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(tick, seconds * 1000); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    schedule();
  }

  /** Nigeria sees naira, everyone else US dollars; the ledger stays in naira. */
  async function syncCurrency() {
    if (!window.MYSMoney) return;
    let code = '';
    try { code = localStorage.getItem('mys_country') || ''; } catch (e) {}
    if (!code) {
      try { const st = await api('/api/user/profile-status'); code = (st && st.country) || ''; if (code) localStorage.setItem('mys_country', code); } catch (e) {}
    }
    if (code) window.MYSMoney.setCountry(code);
    if (window.MYSMoney.isUsd()) await window.MYSMoney.refresh();
  }
  document.addEventListener('mys:currency', () => { try { load(true); } catch (e) {} });

  document.addEventListener('DOMContentLoaded', () => { syncCurrency(); });
  if (document.readyState !== 'loading') syncCurrency();
  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
