# Mizzy Sales — security audit and fixes (16 Oct 2026)

Scope: `server.js`, `lib/*`, `site.config.js`, every file in `public/`, `package.json` and `package-lock.json`.
Method: read the code and searched it for hidden access, hardcoded keys and numbers, outbound calls, unauthenticated routes and unsafe uploads. The app was not run against a live database, so test it after deploying.

## Hidden access and takeover paths found and removed

| # | Finding | Fix |
|---|---|---|
| 1 | The original builder's WhatsApp number was the built-in default for the site contact number and admin phone. On startup the server wrote it back into the database and **overwrote `ADMIN_WHATSAPP`**. On a fresh database, deposit-review alerts went to that number. | Numbers come only from your `.env` or the admin panel. Any builder number found in the database is replaced with yours at startup. |
| 2 | Deposit-review WhatsApp messages contained a link with the **master admin passcode in the URL**. Whoever received the message, or any log that stored the URL, held full admin access. | Links are now signed for one receipt and one action, and expire after 48 hours. The passcode is never placed in a link. Approval is atomic, so a link cannot credit twice. |
| 3 | A hardcoded fallback Grizzly SMS API key belonging to someone else was in `server.js`. If your key was ever missing, purchases would run through that account. | Removed. The key must come from `GRIZZLY_API_KEY`. |
| 4 | A developer credit bar on every page said "Want to buy this website?" and sent visitors to the builder's WhatsApp. | Kept the bar but replaced the details: it now shows Marvel and +234 812 835 8120. |
| 5 | Three empty `badboi.js` files sat in `public/upload`, `public/receipts` and `public/files`. | Deleted, plus the stray `upload` folder. |
| 6 | The static fallback contact links on the pages, and `script.js`, used the builder's number. | Now use the `ADMIN_WHATSAPP` number from your `.env`. |

## Weaknesses fixed

- **Payment webhook accepted unsigned requests** when `FLW_SECRET_HASH` was missing, and logged the secret hash on a mismatch. It now rejects when the secret is missing or wrong, compares in constant time and never logs it.
- **Admin passcode** was an 8-digit value compared with `===` and was not protected against guessing. It is now a 20-character random value, compared in constant time, with rate limits on failed admin attempts (10 per 15 minutes on login and verify).
- **Default secret admin URL** (`ksl-admin-secret`) was used when `ADMIN_SECRET_PATH` was unset. The secret URL is now disabled unless you set it.
- **Uploads**: files were saved with the visitor's own extension and a type check the visitor controls, so an `.html` upload could run on your domain and steal sessions. Extensions are now allow-listed, and `/uploads`, `/receipts` and `/files` refuse html, svg, js and similar files and are served sandboxed with `nosniff`.
- **Reflected HTML** in the quick-approve page (user names) is now escaped.
- **package-lock.json** pointed at a private build-sandbox registry that Render cannot reach. It now points at `registry.npmjs.org` (integrity hashes unchanged).

## Checked and found clean

- Login, signup, Google sign-in and sub-admin login logic: no master password or bypass.
- Outbound calls go only to the payment, SMS, boost, email, exchange-rate and storage providers the site uses.
- No payment splits, hidden fee routing or payout code.
- No email BCC or forwarding, no eval or dynamic code, no code that sends tokens or data to other sites.
- Dependencies match `package.json`; the only install scripts are in `fsevents` and `tesseract.js`.

## Rotated in `.env`

New random values for `JWT_SECRET` (everyone is signed out once), `ADMIN_PASSCODE`, `ADMIN_SECRET_PATH` and `BOOST_WEBHOOK_SECRET`. `PORT` was removed because Render sets it.
If your boost provider calls the webhook with `?secret=`, update that URL with the new `BOOST_WEBHOOK_SECRET`.

## Still to do on your side (cannot be done in code)

Treat every key in the original `.env` as seen by the builder and rotate it at the provider:
MongoDB password, Flutterwave (client secret, V3 key, secret hash — also update the hash in the Flutterwave dashboard), Cloudinary, Google client secret, Resend, OTPSuite, Rakib, Grizzly, Boost, UltraMsg.
Then update the values in Render's Environment tab. In MongoDB Atlas, check Database Access for users you do not recognise.
