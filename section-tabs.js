/* Mizzy Sales service shortcuts: active service + the matching history pages. */
(function () {
  'use strict';
  var path = location.pathname.replace(/\/$/, '') || '/';
  var groups = {
    numbers: {
      pages: ['/buy-number-1', '/buy-number-2', '/buy-number-3', '/buy-number', '/number-history'],
      tabs: [
        ['📱 Buy Number 1', '/buy-number-1', ['/buy-number-1']],
        ['🔐 Buy Number 2', '/buy-number-2', ['/buy-number-2']],
        ['🌐 Buy Number 3', '/buy-number-3', ['/buy-number-3']],
        ['⚡ Active Numbers', '#activeNumbersCard', ['/buy-number-1', '/buy-number-2', '/buy-number-3']],
        ['💬 SMS History', '/number-history', ['/number-history']]
      ]
    },
    boost: {
      pages: ['/boost1', '/boost2', '/boost', '/boost-services', '/boost-history', '/boost-all-services'],
      tabs: [
        ['🚀 Boost 1', '/boost1', ['/boost1', '/boost', '/boost-services', '/boost-all-services']],
        ['📈 Boost 2', '/boost2', ['/boost2']],
        ['🟢 New Order', '/boost1', ['/boost1', '/boost2', '/boost']],
        ['📋 Active / Past Orders', '/boost-history', ['/boost-history']],
        ['🧾 My Purchases', '/purchases', []]
      ]
    },
    logs: {
      pages: ['/marketplace', '/marketplace2', '/marketplace3', '/marketplace4', '/purchases'],
      tabs: [
        ['🛍️ Marketplace 1', '/marketplace', ['/marketplace']],
        ['🛍️ Marketplace 2', '/marketplace2', ['/marketplace2']],
        ['🛍️ Marketplace 3', '/marketplace3', ['/marketplace3']],
        ['🛍️ Marketplace 4', '/marketplace4', ['/marketplace4']],
        ['📦 Marketplace History', '/purchases', ['/purchases']]
      ]
    }
  };
  var group = Object.keys(groups).map(function (key) {
    return groups[key].pages.indexOf(path) !== -1 ? groups[key] : null;
  }).filter(Boolean)[0];
  if (!group) return;

  function render() {
    if (document.querySelector('.mys-service-tabs')) return;
    var heading = document.querySelector('h1');
    var host = heading && heading.parentElement;
    if (!heading || !host) return;
    var nav = document.createElement('nav');
    nav.className = 'mys-service-tabs';
    nav.setAttribute('aria-label', 'Service pages and history');
    nav.innerHTML = group.tabs.map(function (tab) {
      var href = tab[1];
      var isActive = tab[2].indexOf(path) !== -1;
      if (href.charAt(0) === '#') {
        if (path === '/buy-number') href = '/buy-number-1#activeNumbersCard';
        else if (path === '/buy-number-2' || path === '/buy-number-3') href = '#orders';
        else href = path + href;
      }
      return '<a class="mys-service-tab' + (isActive ? ' is-active' : '') + '" href="' + href + '">' + tab[0] + '</a>';
    }).join('');
    heading.parentNode.insertBefore(nav, heading);
    // Make the active order/number panel reachable by the shortcut on each provider page.
    if (path === '/buy-number-1') {
      var active = document.getElementById('activeNumbersCard');
      if (active) active.id = 'activeNumbersCard';
    }
    if (path === '/buy-number-2' || path === '/buy-number-3') {
      var orders = document.getElementById('orders');
      if (orders && !orders.id) orders.id = 'orders';
    }
  }
  var style = document.createElement('style');
  style.textContent = '.mys-service-tabs{display:flex;gap:8px;overflow-x:auto;overscroll-behavior-x:contain;padding:10px 0 14px;margin:0 0 12px;border-bottom:1px solid var(--border2,#dbe6f6);scrollbar-width:thin;-webkit-overflow-scrolling:touch}.mys-service-tab{display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;text-decoration:none!important;border:1px solid var(--border2,#dbe6f6);border-radius:999px;padding:10px 14px;font-size:12px;font-weight:800;color:var(--text,#0b1b3a)!important;background:var(--card,#ffffff);transition:transform .15s,border-color .15s,background .15s}.mys-service-tab:hover{transform:translateY(-1px);border-color:#166cc6}.mys-service-tab.is-active{background:#0b7cf5;color:#fff!important;border-color:#0b7cf5;box-shadow:0 5px 18px rgba(11,124,245,.2)}@media(max-width:600px){.mys-service-tabs{margin-left:-2px;margin-right:-2px;padding-bottom:12px}.mys-service-tab{padding:9px 12px;font-size:11px}}';
  document.head.appendChild(style);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
