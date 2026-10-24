/* MYS loader failsafe: no loading screen may stay on screen forever. */
(function () {
  var MAX_MS = 4500;      // longest any overlay may stay visible
  var seen = {};          // overlay id -> time it first became visible

  function visible(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    if (id === 'dbfl-overlay') return el.classList.contains('show') ? el : null;
    if (id === 'mys-page-transition') return el.classList.contains('is-active') ? el : null;
    if (id === 'kb-loader') return el.classList.contains('kb-hide') ? null : el;
    return null;
  }

  function release(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (id === 'dbfl-overlay') {
      el.classList.remove('show');
      try { dbflBusy = false; } catch (e) {}
    } else if (id === 'mys-page-transition') {
      el.classList.remove('is-active');
      document.documentElement.classList.remove('mys-transition-leaving');
    } else if (id === 'kb-loader') {
      el.classList.add('kb-hide');
    }
  }

  var ids = ['dbfl-overlay', 'mys-page-transition', 'kb-loader'];

  function tick() {
    var now = Date.now();
    ids.forEach(function (id) {
      if (visible(id)) {
        if (!seen[id]) seen[id] = now;
        if (now - seen[id] > MAX_MS) { release(id); seen[id] = 0; }
      } else {
        seen[id] = 0;
      }
    });
  }

  setInterval(tick, 500);
  window.addEventListener('pageshow', function () { ids.forEach(release); });
  window.addEventListener('load', function () { setTimeout(tick, 100); });
})();
