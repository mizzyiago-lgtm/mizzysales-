/* Mizzy Sales — floating banner, confirm banner, loading screen and product-logo helper.
   Loaded on every customer page (via app-shell.js) and directly by the Boost 2 / Buy Number 3 pages. */
(function () {
  'use strict';
  if (window.MizzyUI) return;
  // Stylesheet
  if (!document.getElementById('mizzy-ui-css')) {
    var l = document.createElement('link'); l.id = 'mizzy-ui-css'; l.rel = 'stylesheet'; l.href = '/css/mizzy-ui.css?v=1';
    (document.head || document.documentElement).appendChild(l);
  }
  var host = null, loadEl = null, loadTimer = null, loadCount = 0;
  function ensureHost() {
    if (host && document.body && document.body.contains(host)) return host;
    host = document.createElement('div'); host.className = 'kui-host'; host.setAttribute('aria-live', 'polite');
    (document.body || document.documentElement).appendChild(host); return host;
  }
  var ICON = { ok: '✓', success: '✓', err: '!', error: '!', warn: '!', info: 'i' };
  function banner(msg, type, opts) {
    opts = opts || {}; type = type || 'info';
    var h = ensureHost(), el = document.createElement('div');
    el.className = 'kui-banner kui-' + (type === 'success' ? 'ok' : type === 'error' ? 'err' : type);
    el.setAttribute('role', type === 'err' || type === 'error' ? 'alert' : 'status');
    var i = document.createElement('span'); i.className = 'kui-ico'; i.textContent = ICON[type] || 'i';
    var t = document.createElement('span'); t.className = 'kui-txt'; t.textContent = String(msg == null ? '' : msg);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'kui-x'; x.setAttribute('aria-label', 'Close'); x.textContent = '×';
    el.appendChild(i); el.appendChild(t); el.appendChild(x); h.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('kui-in'); });
    function close() { el.classList.remove('kui-in'); setTimeout(function () { el.remove(); }, 250); }
    x.onclick = close;
    var ms = opts.duration != null ? opts.duration : (type === 'err' || type === 'error' ? 6500 : 4200);
    if (ms > 0) setTimeout(close, ms);
    return { close: close };
  }
  function confirmBanner(msg, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var back = document.createElement('div'); back.className = 'kui-back';
      var card = document.createElement('div'); card.className = 'kui-confirm'; card.setAttribute('role', 'alertdialog');
      var h = document.createElement('div'); h.className = 'kui-ct'; h.textContent = opts.title || 'Please confirm';
      var p = document.createElement('div'); p.className = 'kui-cm'; p.textContent = String(msg || '');
      var row = document.createElement('div'); row.className = 'kui-cb';
      var no = document.createElement('button'); no.type = 'button'; no.className = 'kui-btn kui-no'; no.textContent = opts.cancelText || 'Cancel';
      var yes = document.createElement('button'); yes.type = 'button'; yes.className = 'kui-btn kui-yes'; yes.textContent = opts.okText || 'Confirm';
      row.appendChild(no); row.appendChild(yes); card.appendChild(h); card.appendChild(p); card.appendChild(row); back.appendChild(card);
      (document.body || document.documentElement).appendChild(back);
      requestAnimationFrame(function () { back.classList.add('kui-in'); });
      function done(v) { back.classList.remove('kui-in'); document.removeEventListener('keydown', key); setTimeout(function () { back.remove(); }, 200); resolve(v); }
      function key(e) { if (e.key === 'Escape') done(false); }
      document.addEventListener('keydown', key);
      no.onclick = function () { done(false); }; yes.onclick = function () { done(true); };
      back.addEventListener('click', function (e) { if (e.target === back) done(false); });
      setTimeout(function () { try { yes.focus(); } catch (e) {} }, 60);
    });
  }
  function loading(on, text) {
    if (on) {
      loadCount++;
      if (!loadEl) {
        loadEl = document.createElement('div'); loadEl.className = 'kui-load';
        loadEl.innerHTML = '<div class="kui-spin"></div><div class="kui-lt"></div><div class="kui-ls">Please don\'t close or refresh this page</div>';
        (document.body || document.documentElement).appendChild(loadEl);
      }
      loadEl.querySelector('.kui-lt').textContent = text || 'Please wait…';
      requestAnimationFrame(function () { loadEl && loadEl.classList.add('kui-in'); });
      clearTimeout(loadTimer); loadTimer = setTimeout(function () { loadCount = 0; loading(false); }, 120000); // failsafe
    } else {
      loadCount = Math.max(0, loadCount - 1);
      if (loadCount > 0 && arguments.length < 3) return;
      clearTimeout(loadTimer);
      if (loadEl) { var e = loadEl; loadEl = null; e.classList.remove('kui-in'); setTimeout(function () { e.remove(); }, 250); }
      loadCount = 0;
    }
  }
  // Product logos uploaded by the admin: { keywords:[...], url }
  var logoList = null, logoPromise = null;
  function loadLogos() {
    if (logoPromise) return logoPromise;
    logoPromise = fetch('/api/brand-logos', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (d) { logoList = (Array.isArray(d) ? d : []).map(function (x) { return { url: x.url, kws: (x.keywords || []).map(function (k) { return String(k).toLowerCase(); }) }; }); return logoList; })
      .catch(function () { logoList = []; return logoList; });
    return logoPromise;
  }
  function logoFor(text) {
    if (!logoList) return '';
    var t = String(text || '').toLowerCase(), best = '', bl = 0;
    logoList.forEach(function (l) { l.kws.forEach(function (k) {
      if (!k || k.length <= bl) return;
      var hit = k.length <= 3 ? new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(t) : t.indexOf(k) !== -1;
      if (hit) { best = l.url; bl = k.length; }
    }); });
    return best;
  }
  // A message that survives a page change: shown as a floating banner on the next page.
  function flash(msg, type) { try { sessionStorage.setItem('kui_flash', JSON.stringify({ m: msg, t: type || 'info' })); } catch (e) {} }
  function showFlash() {
    try { var f = sessionStorage.getItem('kui_flash'); if (!f) return; sessionStorage.removeItem('kui_flash'); f = JSON.parse(f); banner(f.m, f.t, { duration: 6500 }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showFlash); else showFlash();
  window.MizzyUI = { flash: flash, banner: banner, toast: banner, confirm: confirmBanner, loading: loading, logos: loadLogos, logoFor: logoFor };
  // Plain alert() messages become floating banners on customer pages.
  try {
    window.alert = function (m) { var s = String(m == null ? '' : m); banner(s, /fail|error|invalid|insufficient|could not|cannot|unable|not available|denied|wrong/i.test(s) ? 'err' : 'info'); };
  } catch (e) {}
})();
