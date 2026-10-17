/* ═══════════════════════════════════════════════════════════════════════════
   Mizzy Social — app-style Profile screen.
   Builds a mobile-app profile header (identity, wallet, history list,
   preferences, API access) above the existing settings cards. Presentation
   only: every action reuses functions/links the site already exposes.
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  var I = {
    tx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13l-3-3M20 17H7l3 3"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15c-1 2-1 5-1 5s3 0 5-1"/><path d="M14 4c4 1 6 3 6 7 0 4-4 8-8 10l-3-3C11 14 10 8 14 4Z"/><circle cx="15" cy="9" r="1.5"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6-6M8 12L5.5 14.5a3.5 3.5 0 004.9 4.9L13 17"/><path d="M16 12l2.5-2.5a3.5 3.5 0 00-4.9-4.9L11 7"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0112 0v5l2 3H4l2-3z"/><path d="M10 20a2 2 0 004 0"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 7l9 6 9-6"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M17 5l2 2M14 8l2 2"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 01-11.9 7.8L4 21l1.2-5A8.5 8.5 0 1121 12z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6z"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
  };

  var HISTORY = [
    ['Transactions', 'tx', '/transactions'],
    ['My Purchases', 'box', '/purchases'],
    ['Number History', 'phone', '/number-history'],
    ['Boost History', 'rocket', '/boost-history'],
    ['Referrals', 'link', '/referrals'],
    ['Notifications', 'bell', '/notifications']
  ];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function money(n) { try { if (typeof P2 === 'function') return P2(n); } catch (e) {} return '\u20a6' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function user() { try { return JSON.parse(localStorage.getItem('ksl_user') || 'null'); } catch (e) { return null; } }

  function row(label, icon, href) {
    return '<a class="mzp-row" href="' + href + '"><span class="ic">' + I[icon] + '</span>' +
      '<span class="lbl">' + esc(label) + '</span><span class="chev">' + I.chev + '</span></a>';
  }

  function markup(u) {
    var name = (u && (u.name || u.username)) || 'Member';
    var email = (u && u.email) || '';
    var initial = esc(name.trim().charAt(0).toUpperCase() || 'M');
    var dark = document.documentElement.getAttribute('data-theme') !== 'light';
    return '' +
    '<div class="mzp" id="mzProfile">' +
      '<div class="mzp-card mzp-id">' +
        '<div class="mzp-av">' + (u && u.avatar ? '<img src="' + esc(u.avatar) + '" alt="Profile" onerror="this.remove()"/>' : '') + '<span>' + initial + '</span></div>' +
        '<div class="mzp-idtxt">' +
          '<div class="mzp-name">' + esc(name) + '</div>' +
          '<div class="mzp-mail">' + esc(email) + '</div>' +
          '<span class="mzp-badge">' + I.shield + ' Verified member</span>' +
        '</div>' +
      '</div>' +

      '<div class="mzp-wallet">' +
        '<div><div class="k">Wallet balance</div><div class="v mzpBal">' + money(u && u.balance) + '</div></div>' +
        '<div class="mzp-wbtns">' +
          '<a class="alt" href="/deposit">Add Money</a>' +
          '<a href="/transactions">History</a>' +
        '</div>' +
      '</div>' +

      '<div class="mzp-head"><h3>History &amp; Activity</h3></div>' +
      '<div class="mzp-list">' + HISTORY.map(function (h) { return row(h[0], h[1], h[2]); }).join('') + '</div>' +

      '<div class="mzp-head"><h3>Messages &amp; Support</h3></div>' +
      '<div class="mzp-list">' +
        row('Direct Messages', 'mail', '/messages') +
        row('Live Support', 'chat', '/support') +
      '</div>' +

      '<div class="mzp-head"><h3>Preferences</h3></div>' +
      '<div class="mzp-list">' +
        '<div class="mzp-row" id="mzpTheme" role="button" tabindex="0">' +
          '<span class="ic">' + I.moon + '</span><span class="lbl">Dark Mode</span>' +
          '<span class="mzp-switch' + (dark ? ' on' : '') + '" id="mzpSwitch"><i></i></span>' +
        '</div>' +
        row('API Key & Docs', 'key', '#apiKeySection') +
      '</div>' +

      '<div class="mzp-head"><h3>Account settings</h3></div>' +
      '<div class="mzp-note">Profile picture, name, password, country &amp; contact number, devices and API key are managed below.</div>' +
      '<button class="mzp-logout" id="mzpLogout">' + I.out + ' Log out</button>' +
    '</div>';
  }

  function mount() {
    var host = document.getElementById('page-settings');
    if (!host || document.getElementById('mzProfile')) return;
    document.body.classList.add('mz-app', 'mz-profile-page');
    host.insertAdjacentHTML('afterbegin', markup(user()));

    var t = document.getElementById('mzpTheme');
    if (t) t.onclick = function () {
      try { if (typeof toggleThemeSimple === 'function') toggleThemeSimple(); } catch (e) {}
      var on = document.documentElement.getAttribute('data-theme') !== 'light';
      document.getElementById('mzpSwitch').classList.toggle('on', on);
    };

    var out = document.getElementById('mzpLogout');
    if (out) out.onclick = function () {
      try { if (typeof logout === 'function') return logout(); } catch (e) {}
      localStorage.removeItem('ksl_token'); localStorage.removeItem('ksl_user');
      location.href = '/login';
    };

    setInterval(function () {
      var u = user(); if (!u) return;
      document.querySelectorAll('.mzpBal').forEach(function (el) { el.textContent = money(u.balance || 0); });
      var n = document.querySelector('.mzp-name'); if (n && (u.name || u.username)) n.textContent = u.name || u.username;
      var m = document.querySelector('.mzp-mail'); if (m && u.email) m.textContent = u.email;
    }, 4000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
