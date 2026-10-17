/* ═══════════════════════════════════════════════════════════════════════════
   Mizzy Social — home dashboard.
   Builds the app-style header (balance, actions, quick services, activity)
   above the existing homepage. Read-only: it calls the same public APIs the
   rest of the site already uses and changes no backend behaviour.
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  var ICON = {
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M17 14.5h.01"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
    rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15c-1 2-1 5-1 5s3 0 5-1"/><path d="M14 4c4 1 6 3 6 7 0 4-4 8-8 10l-3-3C11 14 10 8 14 4Z"/><circle cx="15" cy="9" r="1.5"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 015.7 5l-5 5-2.4-2.4-5 5a2 2 0 01-2.8-2.8l5-5L7.8 8.7a4 4 0 015-5.7L10 6l1 1z"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 9h18M12 9v12M12 9c-2-4-6-4-6-1s3 1 6 1M12 9c2-4 6-4 6-1s-3 1-6 1"/></svg>',
    game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="4"/><path d="M7 10v4M5 12h4M15 11h.01M18 13h.01"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0112 0M16 8a3 3 0 010 6M21 20a6 6 0 00-6-6.5"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6-6M8 12L5.5 14.5a3.5 3.5 0 004.9 4.9L13 17"/><path d="M16 12l2.5-2.5a3.5 3.5 0 00-4.9-4.9L11 7"/></svg>',
    plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 01-12 0z"/><path d="M12 17v5"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 01-11.9 7.8L4 21l1.2-5A8.5 8.5 0 1121 12z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0112 0v5l2 3H4l2-3z"/><path d="M10 20a2 2 0 004 0"/></svg>'
  };

  var SERVICES = [
    ['Logs', 'box', '/marketplace'],
    ['Buy Number', 'phone', '/buy-number'],
    ['Boost', 'rocket', '/boost'],
    ['Tools', 'tool', '/tools'],
    ['Recharge', 'wallet', '/deposit'],
    ['Giveaways', 'gift', '/giveaways'],
    ['Games', 'game', '/games'],
    ['Groups', 'users', '/groups'],
    ['Referrals', 'link', '/referrals'],
    ['API', 'plug', '/api-docs'],
    ['Support', 'chat', '/support'],
    ['Messages', 'chat', '/messages']
  ];

  function money(n) {
    try { if (typeof P2 === 'function') return P2(n); } catch (e) {}
    return '\u20a6' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function ago(d) {
    var t = new Date(d).getTime(); if (!t) return '';
    var s = Math.max(1, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function user() { try { return JSON.parse(localStorage.getItem('ksl_user') || 'null'); } catch (e) { return null; } }
  function tok() { return localStorage.getItem('ksl_token'); }

  function tile(cls, label, icon, href) {
    return '<div class="' + cls + '" role="button" tabindex="0" onclick="location.href=\'' + href + '\'">' +
      '<div class="ic">' + ICON[icon] + '</div>' + esc(label) + '</div>';
  }

  function markup() {
    var u = user();
    var hidden = localStorage.getItem('mz_bal_hidden') === '1';
    return '' +
      '<div class="mz-shell" id="mzShell">' +
        '<div class="mz-greet">' +
          '<div class="mz-greet-av"></div>' +
          '<div class="mz-greet-txt">' +
            '<div class="mz-greet-hi">Welcome back</div>' +
            '<div class="mz-greet-name mzName">' + esc(u ? (u.name || 'Member') : 'Guest') + '</div>' +
          '</div>' +
          '<div class="mz-greet-spacer"></div>' +
          '<button class="mz-icon-btn" title="Notifications" onclick="location.href=\'/notifications\'">' + ICON.bell + '</button>' +
        '</div>' +

        '<div class="mz-balance">' +
          '<button class="mz-eye mzEye">' + (hidden ? 'Show' : 'Hide') + '</button>' +
          '<div class="mz-balance-lbl">Main Balance</div>' +
          '<div class="mz-balance-amt mzBal">' + (u ? (hidden ? '••••••' : money(u.balance || 0)) : '\u20a60.00') + '</div>' +
          '<div class="mz-balance-sub">' + (u ? 'Mizzy Social Wallet · instant delivery' : 'Sign in to see your wallet') + '</div>' +
          '<div class="mz-balance-row">' +
            '<button class="alt" onclick="location.href=\'/deposit\'">Add Money</button>' +
            '<button onclick="location.href=\'/transactions\'">History</button>' +
          '</div>' +
        '</div>' +

        '<div class="mz-actions">' +
          tile('mz-action', 'Add Wallet', 'wallet', '/deposit') +
          tile('mz-action', 'Buy Number', 'phone', '/buy-number') +
          tile('mz-action', 'Buy Logs', 'box', '/marketplace') +
          tile('mz-action', 'Boost', 'rocket', '/boost') +
        '</div>' +

        '<div class="mz-promo">' +
          '<div><h4>Boosts &amp; Premium Tools</h4><p>Social boosts, logs, numbers and premium tools — one wallet.</p></div>' +
          '<button onclick="location.href=\'/boost-services\'">Open</button>' +
        '</div>' +

        '<div class="mz-head"><h3>Quick Services</h3><a href="/marketplace">See all</a></div>' +
        '<div class="mz-services">' + SERVICES.map(function (s) { return tile('mz-serv', s[0], s[1], s[2]); }).join('') + '</div>' +

        '<div class="mz-head"><h3>Recent Activity</h3><a href="/transactions">View all</a></div>' +
        '<div class="mz-feed mzFeed"><div class="mz-empty">Loading activity…</div></div>' +
      '</div>';
  }

  function renderFeed(list) {
    var boxes = document.querySelectorAll('.mzFeed');
    if (!boxes.length) return;
    if (!list || !list.length) {
      var msg = '<div class="mz-empty">' + (tok() ? 'No activity yet — your deposits and purchases will show here.' : 'Sign in to see your recent deposits and purchases.') + '</div>';
      boxes.forEach(function (b) { b.innerHTML = msg; });
      return;
    }
    var html = list.slice(0, 6).map(function (t) {
      var type = String(t.type || 'transaction');
      var credit = /deposit|refund|credit|bonus/i.test(type);
      var status = String(t.status || 'success').toLowerCase();
      var cls = /success|completed|confirmed|approved/.test(status) ? 'mz-ok' : /pend|process/.test(status) ? 'mz-warn' : 'mz-bad';
      var icon = credit ? 'wallet' : /number|otp|sms/i.test(type + ' ' + (t.description || '')) ? 'phone' : /boost/i.test(type) ? 'rocket' : 'box';
      return '<div class="mz-act"><div class="ic">' + ICON[icon] + '</div>' +
        '<div class="mz-act-main"><div class="mz-act-t">' + esc(t.description || type.replace(/_/g, ' ')) + '</div>' +
        '<div class="mz-act-s">' + esc(ago(t.createdAt)) + '</div></div>' +
        '<div class="mz-act-amt">' + (credit ? '+' : '-') + money(Math.abs(t.amount || 0)) +
        '<small class="' + cls + '">' + esc(status) + '</small></div></div>';
    }).join('');
    boxes.forEach(function (b) { b.innerHTML = html; });
  }

  async function loadFeed() {
    if (!tok()) return renderFeed([]);
    try {
      var res = await fetch('/api/user/transactions', { headers: { Authorization: 'Bearer ' + tok() }, cache: 'no-store' });
      var data = await res.json();
      renderFeed(Array.isArray(data) ? data : (data.transactions || []));
    } catch (e) { renderFeed([]); }
  }

  function mount() {
    if (document.getElementById('mzShell')) return;
    // Signed-in visitors get the app dashboard only (short, no marketing scroll);
    // guests keep the marketing welcome page.
    var signedIn = !!tok();
    document.body.classList.add('mz-app');
    if (!signedIn) return;
    document.body.classList.add('mz-signed');
    var hosts = ['page-home', 'page-welcome'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!hosts.length) return;
    hosts.sort(function (a, b) { return (b.classList.contains('active') ? 1 : 0) - (a.classList.contains('active') ? 1 : 0); });
    hosts.forEach(function (h, i) {
      var html = markup();
      if (i > 0) html = html.replace(/ id="mzShell"/g, '');
      h.insertAdjacentHTML('afterbegin', html);
    });


    document.querySelectorAll('.mzEye').forEach(function (eye) {
      eye.onclick = function () {
        var hid = localStorage.getItem('mz_bal_hidden') === '1';
        localStorage.setItem('mz_bal_hidden', hid ? '0' : '1');
        var u = user();
        document.querySelectorAll('.mzBal').forEach(function (el) { el.textContent = hid ? money(u ? u.balance || 0 : 0) : '••••••'; });
        document.querySelectorAll('.mzEye').forEach(function (e2) { e2.textContent = hid ? 'Hide' : 'Show'; });
      };
    });
    loadFeed();
    // Keep the balance in sync with whatever the rest of the app refreshes.
    setInterval(function () {
      var u = user();
      if (!u) return;
      if (localStorage.getItem('mz_bal_hidden') !== '1')
        document.querySelectorAll('.mzBal').forEach(function (el) { el.textContent = money(u.balance || 0); });
      document.querySelectorAll('.mzName').forEach(function (n) { n.textContent = u.name || 'Member'; });
    }, 4000);
  }

  // The signed-in dashboard IS the home page. It appears the moment a session exists
  // (login) and is torn down the moment the session goes away (logout), so a logged-out
  // visitor never sees another user's home screen.
  function unmount() {
    document.querySelectorAll('.mz-shell').forEach(function (el) { el.remove(); });
    document.body.classList.remove('mz-signed');
  }

  function sync() {
    if (tok()) { if (!document.getElementById('mzShell')) mount(); }
    else if (document.getElementById('mzShell') || document.body.classList.contains('mz-signed')) unmount();
  }

  function start() {
    sync();
    setInterval(sync, 700);
    window.addEventListener('storage', function (e) { if (e.key === 'ksl_token') sync(); });
  }

  window.MizzyHome = { mount: mount, unmount: unmount, sync: sync };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
