# Paystack Setup — What To Put In Your `.env`

Paystack is now the **default** payment gateway for this site. Flutterwave still
works, and you can switch between them at any time from the admin panel
(**Admin ➜ Finance ➜ Payment Gateway**): *Paystack only*, *Flutterwave only*, or
*keep both* (the customer then picks at checkout, with Paystack pre-selected).

---

## 1. The `.env` variables you need

Add these to your `.env` file (or to the Environment Variables section of
Render / Railway / your host) and restart the app:

```env
# ── PAYSTACK (required for Paystack payments) ────────────────────────────────
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Which bank issues the permanent virtual accounts (dedicated virtual accounts).
# Leave as wema-bank unless Paystack tells you otherwise.
PAYSTACK_DVA_PREFERRED_BANK=wema-bank

# Optional hardening: only accept webhook calls from Paystack's own IPs.
PAYSTACK_WEBHOOK_IPS_ONLY=false

# Your public site address — used to build the "return to site" link after payment.
SITE_URL=https://your-site.com
```

Where to find the keys: **Paystack Dashboard ➜ Settings ➜ API Keys & Webhooks**.
Use the `sk_test_…` / `pk_test_…` pair while testing and swap in the
`sk_live_…` / `pk_live_…` pair when you go live. Nothing else changes — the app
detects test vs live from the key itself.

### Flutterwave variables (unchanged, keep them if you still want Flutterwave)

```env
FLW_V3_SECRET_KEY=FLWSECK-xxxxxxxxxxxxxxxxxxxxxxxx
FLW_WEBHOOK_HASH=your-own-secret-string
FLW_PLATFORM_BVN=your-bvn
```

**Never commit `.env` to GitHub.** Keep it out of the repo.

---

## 2. Add the webhook in your Paystack dashboard

Paystack must be able to tell the site when money arrives, otherwise transfers
into virtual accounts will not credit wallets.

1. Go to **Paystack Dashboard ➜ Settings ➜ API Keys & Webhooks**.
2. Set the **Webhook URL** to:

   ```
   https://YOUR-SITE.com/api/webhooks/paystack
   ```

3. Save. Paystack signs every call with `x-paystack-signature`
   (HMAC-SHA512 of the raw body using your secret key) and the site rejects
   anything that does not match — so your secret key must be the same one used
   to create the payment.

The site handles these events: `charge.success`, `charge.failed`,
`dedicated_account.assign.success`, `dedicated_account.assign.failed`.

---

## 3. Turn on virtual accounts (dedicated virtual accounts)

Paystack's permanent account numbers are only available to businesses that:

* are registered in **Nigeria** (or Ghana), and
* have completed **go-live / compliance** on their Paystack account, and
* have asked Paystack to enable **Dedicated Virtual Accounts** (Dashboard ➜
  the *Dedicated Virtual Accounts* / *Dedicated NUBAN* section, or via support).

Until Paystack enables it on your account, the "Test Paystack keys" button in
**Admin ➜ Finance ➜ Payment Gateway** will report virtual accounts as *not
enabled*, and customers will only be offered hosted checkout. Hosted checkout
(card, bank transfer, USSD, mobile money) works immediately with just the keys.

Virtual accounts stay **Nigeria-only**, exactly as before.

---

## 4. Switching gateways

**Admin ➜ Finance ➜ Payment Gateway**:

| Choice | What happens |
| --- | --- |
| **Paystack only** (default) | All checkouts and all new virtual accounts come from Paystack. |
| **Flutterwave only** | Everything goes back to Flutterwave. |
| **Keep both** | The customer sees a small "Pay with" chooser on the confirm screen; Paystack is pre-selected. New virtual accounts come from the pre-selected gateway. |

Notes:

* A gateway with **no keys configured is never offered** to customers, even if
  it is selected — the panel warns you instead.
* Virtual account numbers that already exist keep working no matter which
  gateway you switch to; a customer never loses a number they have saved.
* Payments in flight are always verified against the gateway that created them.

---

## 5. Testing checklist

1. Set `PAYSTACK_SECRET_KEY` to your **test** key and restart.
2. **Admin ➜ Finance ➜ Payment Gateway ➜ Test Paystack keys** — should say the
   keys work and show your webhook URL.
3. On the site, open **Deposit ➜ Payment Link**, enter ₦100 and confirm — you
   should land on Paystack's checkout page.
4. Pay with a Paystack test card (e.g. `4084 0840 8408 4081`, any future expiry,
   CVV `408`, OTP `123456`).
5. You are redirected back to the deposit page and the wallet is credited.
   The deposit also shows in **Admin ➜ Finance ➜ Deposit Search**.
6. Swap in the live keys when you are happy, and re-check the webhook URL.

Every credit path is idempotent and independently verified with Paystack before
a wallet is touched, so a repeated webhook or a double redirect can never credit
the same payment twice.
