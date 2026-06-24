# Gr4vy + Stripe Onelink — direct integration sample

A minimal, end-to-end example of rendering **Stripe Onelink** directly on your
own web page (no Gr4vy-hosted redirect). It demonstrates the **two client-side
patterns** you can build on top of the same Gr4vy session:

1. **Full Stripe Payment Element** — the whole Stripe web UI: the card form
   *plus* the inline Onelink/Link "use your saved information" prompt that lets
   returning buyers check out with saved details.
2. **Onelink button only** — just the Onelink/Link express button, no card
   form (Stripe's Express Checkout Element restricted to Link).

Both share the same server and the same first three steps; they differ only in
which Stripe element they mount client-side.

Based on the Gr4vy docs:
<https://docs.gr4vy.com/connections/payments/stripe-onelink>.

---

## What's in here

```
sample-stripe-onelink/
├── server.js              # Express server (create transaction + status)
├── public/
│   ├── index.html         # Landing page — pick a pattern
│   ├── onelink.js         # Shared bootstrap (steps 1–3)
│   ├── full.html          # Pattern 1: full Payment Element
│   └── button.html        # Pattern 2: Onelink button only
├── config.example.json    # Committed defaults (edit or override)
├── config.json            # Your overrides (gitignored)
├── private_key.pem        # Your Gr4vy API private key (gitignored)
└── package.json
```

> **No secrets are committed.** Your Gr4vy private key (`private_key.pem`) and
> any local `config.json` are gitignored. You supply them yourself (below).

---

## Prerequisites

- **Node 20+**
- A **Gr4vy account** with an **active Stripe Onelink connection**. In your
  Gr4vy dashboard, add the *Stripe Onelink* payment service and note its
  **payment service ID** (a UUID). See the
  [docs](https://docs.gr4vy.com/connections/payments/stripe-onelink) for the
  Stripe-side setup (enable card payments, enable Stripe Link, configure the
  webhooks).
- A **Gr4vy private key** with API access (scopes `transactions.read` /
  `transactions.write`). Create one in the dashboard under
  *Settings → API keys / Private keys*.

## Setup

1. **Install dependencies**

   ```sh
   npm install
   ```

2. **Add your Gr4vy private key**

   Save it as `private_key.pem` in the project root (it's gitignored):

   ```sh
   cp ~/Downloads/your-gr4vy-private-key.pem ./private_key.pem
   ```

3. **Configure**

   Copy the example config and fill in your values:

   ```sh
   cp config.example.json config.json
   ```

   ```jsonc
   {
     "gr4vyId": "your-gr4vy-id",        // e.g. the subdomain in your API URL
     "server": "sandbox",                // "sandbox" or "production"
     "merchantAccountId": "default",
     "paymentServiceId": "YOUR_ONELINK_PAYMENT_SERVICE_ID",
     "privateKeyPath": "./private_key.pem",
     "port": 3000
   }
   ```

   `config.json` (gitignored) takes precedence over `config.example.json`. The
   API base URL is derived from `gr4vyId` + `server`:
   `https://api.sandbox.<gr4vyId>.gr4vy.app` (or without `sandbox.` for
   production).

## Run

```sh
npm start
```

Open <http://localhost:3000> and pick a pattern:

- **Full Payment Element** → <http://localhost:3000/full.html>
- **Onelink button only** → <http://localhost:3000/button.html>

When your Onelink connection runs against Stripe **test mode**, pay with a test
card such as `4242 4242 4242 4242`, any future expiry, any CVC. The inline
"Use your saved information" panel is Stripe Link in test mode — enter `000000`
as the verification code (no real code is sent).

---

## How it works

The two patterns share one flow. Steps 1–3 live in
[`public/onelink.js`](public/onelink.js); step 4 is per-page.

```
   Your server                 Your browser                  Stripe
   ─────────────               ──────────────               ────────
        │                           │                          │
   1.   │  POST /transactions  ◀────│  (on page load)          │
        │  method=onelink,          │                          │
        │  integration_client=web   │                          │
        │   ──→ transactionId,      │                          │
        │       sessionToken        │                          │
        │                           │                          │
   2.   │  (browser calls Gr4vy directly with the token)       │
        │  POST /transactions/:id/session?token=:sessionToken  │
        │   ──→ publishableKey, clientSecret, stripeAccount,   │
        │       billingDetails, returnUrl                      │
        │                           │                          │
        │                      3.   │  Stripe(publishableKey,  │
        │                           │   { stripeAccount })     │
        │                           │  .elements({clientSecret})│
        │                           │                          │
        │                      4a.  │  Payment Element  ───────▶│  (full UI)
        │                       or  │     OR                   │
        │                      4b.  │  Express Checkout ───────▶│  (button only)
        │                           │  .confirmPayment(...)     │
```

### 1. Create the transaction (server side)

[`server.js`](server.js) creates a Gr4vy transaction with
`payment_method.method=onelink` and `integration_client=web`. This needs a
private-key-signed bearer token, so it must run server side. Gr4vy returns a
short-lived `session_token` instead of a hosted `approval_url`.

### 2. Exchange the token for Stripe session data (browser)

The browser calls Gr4vy directly — `POST /transactions/:id/session?token=…` —
auth'd by the token itself (no private key in the browser). The response's
`session_data` carries the Stripe `publishableKey`, the PaymentIntent
`clientSecret`, `stripeAccount` (set for Stripe Connect), optional
`billingDetails`, and a `returnUrl`.

### 3. Initialize Stripe.js

`Stripe(publishableKey, { stripeAccount })` then
`stripe.elements({ clientSecret })`.

### 4. Mount an element and confirm

- **[`full.html`](public/full.html)** mounts the **Payment Element**
  (`elements.create("payment")`), which renders card fields *and* the inline
  Onelink/Link prompt. `billingDetails` pre-fill it when present.
- **[`button.html`](public/button.html)** mounts the **Express Checkout
  Element** (`elements.create("expressCheckout", { paymentMethods: { link:
  "auto", … } })`), restricted to Link so only the Onelink button shows.

Both finish with `stripe.confirmPayment({ elements, confirmParams: { return_url },
redirect: "if_required" })`. If the buyer authenticates off-session (e.g. 3DS),
Stripe redirects to `return_url` and the page reads the result on return.

---

## Notes

- **Webhooks.** For a production setup, configure the Stripe webhooks (payment
  intent / charge events) on your Onelink connection so the Gr4vy transaction
  status stays in sync with Stripe. See the docs linked above.
- **Stripe Connect.** `stripeAccount` is returned when your Onelink connector
  is a Stripe connected account; the shared bootstrap passes it to Stripe.js
  when present and omits it otherwise.
- This is a teaching sample — it favours readability over production hardening
  (no retries, minimal error UX, in-memory only).
