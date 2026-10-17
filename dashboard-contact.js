/* Live admin contact links on the dashboard.
   Reads /api/public/site-links (no-cache) on load, every 15s, when the tab
   regains focus, and instantly when admin saves in the same browser. */
(function () {
  var last = '';
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function set(key, href) {
    if (!href) return;
    document.querySelectorAll('[data-dl="' + key + '"]').forEach(function (a) { a.href = href; });
  }
  function sub(key, text) {
    document.querySelectorAll('[data-dl-sub="' + key + '"]').forEach(function (el) { el.textContent = text; });
  }
  function apply(l) {
    var sig = JSON.stringify(l);
    if (sig === last) return; last = sig;
    var phone = digits(l.adminPhone || l.whatsappNumber);
    if (phone) { set('contact', 'https://wa.me/' + phone); sub('contact', '+' + phone); }
    var tg = String(l.telegramUsername || '').replace(/^@/, '');
    set('telegram', l.telegramLink || (tg ? 'https://t.me/' + tg : ''));
    if (tg) sub('telegram', '@' + tg);
    set('channel', l.whatsappChannelLink);
    set('group', l.whatsappGroupLink);
    var h = document.getElementById('msContactHours');
    if (h) { h.hidden = !l.supportHours; h.textContent = l.supportHours ? '🕒 ' + l.supportHours : ''; }
    var sec = document.querySelector('.ms-contact');
    if (sec) { sec.classList.remove('is-updated'); void sec.offsetWidth; sec.classList.add('is-updated'); }
  }
  function load() {
    fetch('/api/public/site-links?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (l) { if (l) apply(l); })
      .catch(function () {});
  }
  load();
  setInterval(function () { if (!document.hidden) load(); }, 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  window.addEventListener('focus', load);
  window.addEventListener('storage', function (e) { if (e.key === 'ms_links_updated') load(); });
})();
