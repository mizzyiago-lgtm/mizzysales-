/* Adds a slim "Back" bar at the top of every inner page. */
(function () {
  if (window.__kslBackBar) return; window.__kslBackBar = true;
  var path = location.pathname.replace(/\/+$/, '') || '/';
  var skip = ['/', '/dashboard', '/login', '/register', '/welcome', '/terms'];
  if (skip.indexOf(path) !== -1 || /admin/i.test(path)) return;
  function mount() {
    if (document.getElementById('kslBackBar') || !document.body) return;
    var st = document.createElement('style');
    st.textContent = '#kslBackBar{position:sticky;top:0;z-index:9990;display:flex;align-items:center;padding:8px 12px;background:var(--card,#fff);border-bottom:1px solid var(--border,#dbe6f6)}' +
      '#kslBackBar button{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px solid #0b7cf5;background:transparent;color:#0b7cf5;border-radius:999px;font-weight:700;font-size:14px;cursor:pointer}' +
      '[data-theme="dark"] #kslBackBar{background:#ffffff}';
    document.head.appendChild(st);
    var bar = document.createElement('div');
    bar.id = 'kslBackBar';
    bar.innerHTML = '<button type="button" aria-label="Go back">\u2190 Back</button>';
    bar.querySelector('button').onclick = function () {
      /* deposit sub-screens (Bank Transfer / Payment Link): go back to the method list first */
      var depOpen = ['depScreen1', 'depScreen2'].some(function (id) {
        var e = document.getElementById(id);
        return e && e.style.display !== 'none' && e.offsetParent !== null;
      });
      if (depOpen && typeof window.depGoHome === 'function') { window.depGoHome(); return; }
      if (path === '/boost1' || path === '/boost2') { location.href = '/boost'; return; }
      if (path === '/boost') { location.href = '/dashboard'; return; }
      var sameSite = document.referrer && document.referrer.indexOf(location.origin) === 0;
      if (sameSite && history.length > 1) history.back(); else location.href = '/dashboard';
    };
    /* mys-after-navbar */ var nav = document.querySelector('.navbar');
    if (nav && nav.parentNode) nav.parentNode.insertBefore(bar, nav.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
