// Shared Onelink bootstrap used by both integration patterns.
//
// Both patterns need the same first three steps:
//   1. Ask our server to create a Gr4vy onelink transaction (needs the
//      private key) -> { transactionId, sessionToken }.
//   2. Exchange the sessionToken for the Stripe session data directly from
//      the browser (the token is the auth) -> { publishableKey, clientSecret,
//      stripeAccount, billingDetails, returnUrl }.
//   3. Initialize Stripe.js with the publishableKey (+ stripeAccount for
//      Stripe Connect) and create an Elements group bound to the clientSecret.
//
// They differ only in WHICH element they mount (step 4), so that part lives
// in each page.

export async function createOnelinkTransaction({ amount = 1299, currency = "USD", country = "US", email } = {}) {
  // Step 1 — server creates the transaction with integration_client=web.
  const txRes = await fetch("/transactions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount, currency, country, email }),
  });
  if (!txRes.ok) throw new Error(`POST /transactions ${txRes.status}`);
  const { transactionId, sessionToken } = await txRes.json();

  // Step 2 — exchange the session token for Stripe session data, straight
  // from the browser. POST /transactions/:id/session?token=:token
  const { apiUrl } = await (await fetch("/config")).json();
  const sessUrl =
    `${apiUrl}/transactions/${transactionId}/session` +
    `?token=${encodeURIComponent(sessionToken)}`;
  const sessRes = await fetch(sessUrl, { method: "POST" });
  if (!sessRes.ok) throw new Error(`session ${sessRes.status}`);
  const { session_data, default_completion_url } = await sessRes.json();

  return { transactionId, sessionData: session_data, defaultCompletionUrl: default_completion_url };
}

// Step 3 — initialize Stripe.js and create the Elements group. Returns both
// so the page can mount whichever element it wants and confirm later.
export async function initStripeElements(sessionData) {
  const { publishableKey, clientSecret, stripeAccount } = sessionData;
  // stripeAccount is set for Stripe Connect (the Onelink connector is a
  // connected account); pass it so Stripe.js targets the right account.
  const stripe = stripeAccount
    ? Stripe(publishableKey, { stripeAccount })
    : Stripe(publishableKey);

  const elements = stripe.elements({
    clientSecret,
    appearance: { theme: "stripe" },
  });

  return { stripe, elements };
}
