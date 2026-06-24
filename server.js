// Minimal Express server for the Gr4vy + Stripe Onelink *direct* integration
// sample (web).
//
// Onelink renders Stripe's Payment Element on YOUR page (not a Gr4vy-hosted
// redirect). The flow:
//
//   1. Server creates a Gr4vy transaction with payment_method.method=onelink
//      and integration_client=web. Gr4vy returns a short-lived session_token.
//   2. Client exchanges that token for the Stripe session data
//      (publishableKey, clientSecret, stripeAccount, billingDetails) by
//      calling the Gr4vy session endpoint directly from the browser.
//   3. Client initializes Stripe.js and either:
//        a) mounts the full Payment Element (card form + inline Onelink/Link
//           "use your saved info"), or
//        b) mounts only the Express Checkout Element (the Onelink button).
//      then confirms the payment client-side.
//
// Creating the transaction needs a private-key-signed bearer token, so it
// must happen server-side. Exchanging the session_token does not (the token
// itself is the auth), so the browser calls Gr4vy directly for that.

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Gr4vy, withToken } from "@gr4vy/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Config ---------------------------------------------------------------
// config.json (gitignored) wins; config.example.json is the committed
// template you copy and fill in with your own Gr4vy values.
const cfgPath = fs.existsSync(path.join(__dirname, "config.json"))
  ? path.join(__dirname, "config.json")
  : path.join(__dirname, "config.example.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

const apiUrl =
  cfg.server === "production"
    ? `https://api.${cfg.gr4vyId}.gr4vy.app`
    : `https://api.sandbox.${cfg.gr4vyId}.gr4vy.app`;

// --- Gr4vy SDK client -----------------------------------------------------
// `withToken` signs a JWT from the private key on each request.
const gr4vy = new Gr4vy({
  id: cfg.gr4vyId,
  server: cfg.server,
  merchantAccountId: cfg.merchantAccountId,
  bearerAuth: withToken({
    privateKey: fs.readFileSync(cfg.privateKeyPath, "utf8"),
  }),
});

// --- HTTP server ----------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Hands the browser the Gr4vy API base URL so it can exchange the session
// token for Stripe session data directly.
app.get("/config", (_req, res) => {
  res.json({ apiUrl });
});

// Create a Stripe Onelink transaction in direct/web integration mode. Returns
// the transaction id and the session_token the browser needs to fetch the
// Stripe session data (publishableKey, clientSecret, ...).
app.post("/transactions", async (req, res) => {
  const {
    amount = 1299,
    currency = "USD",
    country = "US",
    email,
  } = req.body ?? {};
  try {
    const tx = await gr4vy.transactions.create({
      amount,
      currency,
      country,
      // web | ios | android — tells Gr4vy to return a session_token instead of
      // a Gr4vy-hosted approval_url, so we render Stripe ourselves.
      integrationClient: "web",
      // Optional: pre-fills Onelink/Link with the buyer's email so returning
      // buyers are recognised by their saved details.
      buyer: email ? { billingDetails: { email } } : undefined,
      paymentMethod: {
        method: "onelink",
        country,
        currency,
        // Where Stripe sends the buyer after off-session auth (e.g. 3DS).
        redirectUrl: `http://localhost:${cfg.port}/?return=1`,
      },
    });
    res.json({ transactionId: tx.id, sessionToken: tx.sessionToken });
  } catch (err) {
    console.error("transactions.create failed:", err);
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Look up a transaction's latest status, used by the pages to display the
// result after the buyer confirms payment.
app.get("/transactions/:id", async (req, res) => {
  try {
    const tx = await gr4vy.transactions.get(req.params.id);
    res.json({ id: tx.id, status: tx.status, method: tx.method });
  } catch (err) {
    console.error("transactions.get failed:", err);
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.listen(cfg.port, () => {
  console.log(`Sample listening on http://localhost:${cfg.port}`);
  console.log(`Using Gr4vy API at ${apiUrl} (merchant=${cfg.merchantAccountId})`);
});
