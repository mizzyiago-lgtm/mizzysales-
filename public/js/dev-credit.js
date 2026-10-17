/* ── Developer credit bar ────────────────────────────────────────────────────
   One small strip at the bottom of every public page: who built the site, how
   to reach the developer on WhatsApp, and a line for anyone who wants to buy a
   website like this one.

   Pure presentation — it injects itself once, after the page's own footer, and
   never interferes with any existing script. */
(function () {
  'use strict';
  if (window.__klsDevCredit) return;
  window.__klsDevCredit = true;

  var DEV_NAME = 'Marvel';
  var DEV_PHONE_DISPLAY = '+234 812 835 8120';
  var DEV_WHATSAPP = 'https://wa.me/2348128358120';

  function mount() {
    if (document.querySelector('.kls-devbar')) return;
    var bar = document.createElement('div');
    bar.className = 'kls-devbar';
    bar.innerHTML =
      '<div class="kls-devbar-inner">' +
        '<div class="kls-devbar-main">' +
          '<span class="kls-devbar-dot" aria-hidden="true"></span>' +
          '<span class="kls-devbar-txt">Designed &amp; engineered by ' +
            '<a href="' + DEV_WHATSAPP + '" target="_blank" rel="noopener" class="kls-devbar-link">' + DEV_NAME + '</a>' +
          '</span>' +
        '</div>' +
        '<div class="kls-devbar-buy">' +
          'Want a website like this? <a href="' + DEV_WHATSAPP + '" target="_blank" rel="noopener" class="kls-devbar-cta">Contact ' + DEV_NAME + ' ' + DEV_PHONE_DISPLAY + '</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
