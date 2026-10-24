/* Full-screen three-dot loader for the Boost pages. */
(function () {
  if (window.MysBoostLoader) return;
  var css = '#mys-boost-loader{position:fixed;inset:0;z-index:2147483000;background:#ffffff;display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;color:#0562d6;font:800 15px system-ui,sans-serif}' +
    '#mys-boost-loader.on{display:flex}' +
    '#mys-boost-loader .bl-dots{display:inline-flex;gap:8px}' +
    '#mys-boost-loader .bl-dots i{display:block;width:12px;height:12px;border-radius:50%;background:#18a0fb;animation:mysBl 1.1s infinite ease-in-out both}' +
    '#mys-boost-loader .bl-dots i:nth-child(2){animation-delay:.16s}#mys-boost-loader .bl-dots i:nth-child(3){animation-delay:.32s}' +
    '@keyframes mysBl{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-9px);opacity:1}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var el = document.createElement('div');
  el.id = 'mys-boost-loader'; el.className = 'on'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<span class="bl-dots"><i></i><i></i><i></i></span>';
  document.documentElement.appendChild(el);
  var timer = null;
  function show() {
    el.classList.add('on'); document.documentElement.style.overflow = 'hidden';
    clearTimeout(timer); timer = setTimeout(hide, 45000); // safety: never block the page forever
  }
  function hide() {
    clearTimeout(timer); el.classList.remove('on'); document.documentElement.style.overflow = '';
  }
  window.MysBoostLoader = { show: show, hide: hide };
  show();
})();
