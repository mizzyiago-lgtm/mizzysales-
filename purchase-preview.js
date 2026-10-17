/* Displays only the current signed-in customer's recent purchase titles, dates and totals. */
(function () {
  var target = document.getElementById('msPurchasePreview');
  if (!target) return;
  var token = localStorage.getItem('ksl_token');
  if (!token) { target.textContent = 'Sign in to see your purchases.'; return; }
  fetch('/api/user/purchases', { headers: { Authorization: 'Bearer ' + token } })
    .then(function (response) { if (!response.ok) throw new Error('Unavailable'); return response.json(); })
    .then(function (purchases) {
      if (!Array.isArray(purchases) || !purchases.length) { target.textContent = 'No purchases yet. Your orders will appear here.'; return; }
      var recent = purchases.slice().sort(function (a,b) { return new Date(b.purchasedAt || 0) - new Date(a.purchasedAt || 0); }).slice(0, 3);
      target.replaceChildren();
      recent.forEach(function (purchase) {
        var row = document.createElement('a'); row.className = 'ms-purchases__row'; row.href = '/purchases';
        var detail = document.createElement('span');
        var name = document.createElement('span'); name.className = 'ms-purchases__name'; name.textContent = purchase.logTitle || 'Purchase';
        var date = document.createElement('span'); date.className = 'ms-purchases__date';
        var parsed = new Date(purchase.purchasedAt); date.textContent = isNaN(parsed.getTime()) ? 'Purchase' : parsed.toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' });
        var price = document.createElement('span'); price.className = 'ms-purchases__price';
        price.textContent = '₦' + Number(purchase.pricePaid || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
        detail.append(name, date); row.append(detail, price); target.append(row);
      });
    })
    .catch(function () { target.textContent = 'Purchase history is unavailable right now. View all purchases to try again.'; });
})();
