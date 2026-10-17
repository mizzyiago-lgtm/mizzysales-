# Changes
1. Server 1 now lists every country from the API (USA & Canada pinned on top, USA pre-selected) and every service for that country, with live prices. No more manual price entry.
2. Server 1 price = live API cost + profit: ₦0–499 → +₦300, ₦500–999 → +₦400, ₦1,000–4,999 → +₦700, ₦5,000–10,000 → +₦1,200 (above ₦10,000 → highCostMarkupPercent, min ₦1,200). Price is re-checked right before charging, and if the API charges more than the customer pays, the number is cancelled automatically (no loss sales). Editable in server-config: `server1MarkupTiers`.
3. Developer API (/api/v1/numbers/countries, /api/v1/numbers/options?country=US, /api/v1/buy-number {country, serviceId}) uses the same live prices with a smaller profit (`apiProfitPercent`, default 75% of normal profit).
4. Boost page: new 4-step picker (Platform → Type → Service → Link & pay), large tap targets for iPhone/Android/PC. Manual search still available under "Advanced".
5. "Invalid token" fix: sessions now refresh automatically while users are active (30 days), real server hiccups no longer show as "Invalid token", and an ended session sends the user to login once instead of leaving the site broken (public/js/auth-keeper.js on every page).
6. Server 1 renamed "USA/Canada Numbers" with a notice that it is no longer USA WhatsApp only.
7. All WhatsApp Business instructions removed from Server 1 and Server 2.
8. Server 1 has country search and service search with icons, like Server 2.
