// ─────────────────────────────────────────────────────────────────────────────
//  SITE CONFIG — Mizzy Sales Rebrand
// ─────────────────────────────────────────────────────────────────────────────

const env = process.env;

const BRAND = {
  // Names shown across the site, emails, and browser tab
  name:      env.BRAND_NAME      || 'Mizzy Sales',
  fullName:  env.BRAND_FULL_NAME || 'Mizzy Sales — Verified Accounts & Digital Services',
  tagline:   env.BRAND_TAGLINE   ||
    "Your trusted marketplace for verified social accounts, phone numbers, and digital tools — instant delivery and 24/7 wallet funding.",

  // Domain for link previews and sitemaps
  domain:    (env.BRAND_DOMAIN || env.SITE_URL || 'mizzysales.com').replace(/^https?:\/\//, '').replace(/\/.*$/, ''),

  // Prefix stamped on bank transfer refs and payment narrations
  txPrefix:  (env.BRAND_TX_PREFIX || 'MSL').toUpperCase(),

  // Support and social channels
  whatsapp:  env.ADMIN_WHATSAPP   || '',
  telegram:  env.BRAND_TELEGRAM   || 'mizzysales',
  supportEmail: env.SUPPORT_EMAIL || 'support@mizzysales.com',

  // Electric cyan and sky-blue palette derived directly from the Mizzy Sales logo
  theme: {
    accent:      env.BRAND_ACCENT      || '#00b4f8', // Vibrant primary cyan-blue
    accentDark:  env.BRAND_ACCENT_DARK || '#0084d6', // Deep blue hover
    accentSoft:  env.BRAND_ACCENT_SOFT || '#d0f2fe', // Soft cyan glow / badge background
    headingFont: env.BRAND_HEADING_FONT || "'Sora', 'Plus Jakarta Sans', sans-serif",
    bodyFont:    env.BRAND_BODY_FONT    || "'Plus Jakarta Sans', system-ui, sans-serif"
  },

  currency: env.BRAND_CURRENCY || 'NGN',
  currencySymbol: env.BRAND_CURRENCY_SYMBOL || '₦'
};

const PAGE_SEO_TEMPLATE = {
  '/':             { title: '{full} | Premium Social Media Accounts & Tools', description: '{tagline}' },
  '/marketplace':  { title: 'Marketplace — Browse Verified Accounts | {brand}', description: 'Shop verified Gmail, Instagram, Facebook, and WhatsApp accounts with instant delivery.' },
  '/tools':        { title: 'Digital Tools & Software — {brand}', description: 'Premium utilities and verified tools delivered instantly to your {brand} account.' },
  '/wallet':       { title: 'My Wallet — {brand}', description: 'Check your balance and fund your wallet instantly with local and card transfers.' },
  '/deposit':      { title: 'Deposit Funds — {brand}', description: 'Instant automated wallet funding via card and bank transfer.' },
  '/purchases':    { title: 'My Orders & Purchases — {brand}', description: 'View and access all your delivered accounts and digital tools.' },
  '/transactions': { title: 'Transaction Records — {brand}', description: 'Complete record of deposits, purchases, and orders on {brand}.' },
  '/support':      { title: 'Help & Customer Support — {brand}', description: 'Live support and fast assistance for orders, payments, and accounts.' },
  '/settings':     { title: 'Profile & Security Settings — {brand}', description: 'Configure your profile, API keys, and security preferences.' },
  '/login':        { title: 'Sign In — {brand}', description: 'Log in to your {brand} account.' },
  '/register':     { title: 'Create Account — {brand}', description: 'Sign up to start purchasing verified accounts and digital services on {brand}.' },
  '/terms':        { title: 'Terms of Service — {brand}', description: '{brand} user policies, rules, and service agreements.' },
  '/api-docs':     { title: 'Developer API — {brand}', description: 'Automate balance checks and purchases via our REST API.' },
  '/groups':       { title: 'Community Hub — {brand}', description: 'Connect with community members and get live updates.' },
  '/messages':     { title: 'Direct Messages — {brand}', description: 'Your private messages and updates on {brand}.' },
  '/referrals':    { title: 'Partner Program — {brand}', description: 'Earn commission for referring buyers to {brand}.' },
  '/notifications':{ title: 'Activity Alerts — {brand}', description: 'Real-time updates regarding deposits, deliveries, and account events.' }
};

function fill(s) {
  return String(s)
    .replace(/\{brand\}/g, BRAND.name)
    .replace(/\{full\}/g, BRAND.fullName)
    .replace(/\{tagline\}/g, BRAND.tagline);
}

const PAGE_SEO = Object.fromEntries(
  Object.entries(PAGE_SEO_TEMPLATE).map(([p, m]) => [p, { title: fill(m.title), description: fill(m.description) }])
);

function brandCss() {
  const t = BRAND.theme;
  return `:root{--gold:${t.accent};--gold2:${t.accentDark};--gold3:${t.accentSoft};` +
         `--accent:${t.accent};--brand-heading-font:${t.headingFont};--brand-body-font:${t.bodyFont}}\n` +
         `body{font-family:var(--brand-body-font)}\n` +
         `h1,h2,h3,.brand-ksl,.brand-title{font-family:var(--brand-heading-font)}\n`;
}

function publicBrand() {
  return {
    name: BRAND.name, fullName: BRAND.fullName, tagline: BRAND.tagline,
    domain: BRAND.domain, whatsapp: BRAND.whatsapp, telegram: BRAND.telegram,
    supportEmail: BRAND.supportEmail, theme: BRAND.theme,
    currency: BRAND.currency, currencySymbol: BRAND.currencySymbol
  };
}

module.exports = { BRAND, PAGE_SEO, brandCss, publicBrand };
