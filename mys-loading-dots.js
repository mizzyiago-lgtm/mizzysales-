/* Mizzy Sales — three moving dots while a list is loading */
(function () {
  'use strict';
  if (window.__mysDots) return;
  window.__mysDots = true;

  var RX = /^\s*(loading|checking|fetching|searching|getting)\b/i;
  var DOTS = '<span class="kd-dots" aria-hidden="true"><i></i><i></i><i></i></span>';

  var css = document.createElement('style');
  css.id = 'mys-loading-dots-css';
  css.textContent =
    '.kd-load{display:inline-flex;align-items:center;gap:2px;font-weight:700;color:var(--t2,#9ca3af)}' +
    '.kd-dots{display:inline-flex;align-items:center;gap:4px;margin-left:6px}' +
    '.kd-dots i{display:block;width:7px;height:7px;border-radius:50%;background:#18a0fb;animation:kdBounce 1.1s infinite ease-in-out both}' +
    '.kd-dots i:nth-child(2){animation-delay:.16s}.kd-dots i:nth-child(3){animation-delay:.32s}' +
    '@keyframes kdBounce{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-6px);opacity:1}}' +
    '.kd-row{display:flex;align-items:center;gap:2px;margin:8px 2px 2px;font-size:13px;font-weight:700;color:#18a0fb}' +
    '@media (prefers-reduced-motion:reduce){.kd-dots i{animation:none;opacity:.8}}';
  (document.head || document.documentElement).appendChild(css);

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function label(t) {
    return String(t || '').replace(/[\s.\u2026]+$/, '').trim() || 'Loading';
  }
  function loadingHtml(t) {
    return '<span class="kd-load">' + esc(label(t)) + DOTS + '</span>';
  }
  function selectIsLoading(sel) {
    var o = sel.options && sel.options[sel.selectedIndex >= 0 ? sel.selectedIndex : 0];
    return !!(o && RX.test(o.textContent || ''));
  }

  function run() {
    /* A. Tile value text that the page itself set to "Loading..." */
    document.querySelectorAll('.st-value').forEach(function (el) {
      if (el.querySelector('.kd-load')) return;
      if (el.children.length === 0 && RX.test(el.textContent || '')) {
        el.removeAttribute('data-kd-orig');
        el.innerHTML = loadingHtml(el.textContent);
      }
    });

    /* B. Tiles whose hidden <select> is still loading (e.g. "Loading servers...") */
    document.querySelectorAll('.select-tile').forEach(function (tile) {
      var sel = tile.querySelector('select');
      var val = tile.querySelector('.st-value');
      if (!sel || !val) return;
      var loading = selectIsLoading(sel);
      var has = !!val.querySelector('.kd-load');
      if (loading && !has) {
        val.setAttribute('data-kd-orig', val.innerHTML);
        var o = sel.options[sel.selectedIndex >= 0 ? sel.selectedIndex : 0];
        val.innerHTML = loadingHtml(o ? o.textContent : 'Loading');
      } else if (!loading && has && val.hasAttribute('data-kd-orig')) {
        val.innerHTML = val.getAttribute('data-kd-orig');
        val.removeAttribute('data-kd-orig');
      }
    });

    /* C. Plain dropdowns (Server 3 / OTP pages): show a dots row under them */
    document.querySelectorAll('select').forEach(function (sel) {
      if (sel.closest('.select-tile')) return;
      var next = sel.nextElementSibling;
      var row = next && next.classList && next.classList.contains('kd-row') ? next : null;
      if (selectIsLoading(sel)) {
        var o = sel.options[sel.selectedIndex >= 0 ? sel.selectedIndex : 0];
        var html = loadingHtml(o ? o.textContent : 'Loading');
        if (!row) {
          row = document.createElement('div');
          row.className = 'kd-row';
          sel.parentNode.insertBefore(row, sel.nextSibling);
        }
        if (row.innerHTML !== html) row.innerHTML = html;
      } else if (row) {
        row.remove();
      }
    });
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; try { run(); } catch (e) {} });
  }

  function start() {
    run();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(schedule, 800); // safety net
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
