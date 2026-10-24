/* Site credits and owner contact strip */
(function () {
  'use strict';
  if (window.__mysDevCredit) return;
  window.__mysDevCredit = true;
  var OWNER_WHATSAPP = '#';
  function mount() {
    if (document.querySelector('.mys-devbar')) return;
    var bar = document.createElement('div');
    bar.className = 'mys-devbar';
    bar.innerHTML =
      '<div class="mys-devbar-inner">' +
        '<div class="mys-devbar-main">' +
          '<span class="mys-devbar-dot" aria-hidden="true"></span>' +
          '<span class="mys-devbar-txt">Designed and engineered by developer <strong>Marvel</strong></span>' +
        '</div>' +
        '<div class="mys-devbar-buy">' +
          'Want to buy this website? <a href="' + OWNER_WHATSAPP + '" target="_blank" rel="noopener noreferrer" class="mys-devbar-cta">Contact the admin / owner on WhatsApp: +234 812 835 8120</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
