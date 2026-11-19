import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  getPayheroTransactionStatus,
  matchesPayheroLipwaTransaction,
  normalizeKenyanPhone,
  payheroEnabled,
  resolveChannelId,
} from "../src/lib/payhero.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

function configure() {
  process.env.PAYHERO_AUTH_TOKEN = "test-token";
  process.env.PAYHERO_CHANNEL_ID = "133";
}

test("PayHero stays unavailable until an API key and channel are configured", () => {
  delete process.env.PAYHERO_AUTH_TOKEN;
  delete process.env.PAYHERO_CHANNEL_ID;
  assert.equal(payheroEnabled(), false);
  configure();
  assert.equal(payheroEnabled(), true);
  process.env.PAYHERO_CHANNEL_ID = "not-a-number";
  assert.equal(payheroEnabled(), false);
});

test("normalizes Kenyan mobile numbers and rejects unsupported formats", () => {
  assert.equal(normalizeKenyanPhone("0712 345 678"), "0712345678");
  assert.equal(normalizeKenyanPhone("+254 112 345 678"), "0112345678");
  assert.throws(() => normalizeKenyanPhone("123456"), /valid Safaricom number/);
});

test("discovers the unique active M-Pesa channel when no ID is configured", async () => {
  process.env.PAYHERO_AUTH_TOKEN = "test-token";
  delete process.env.PAYHERO_CHANNEL_ID;
  const requests: string[] = [];
  globalThis.fetch = (async (url, init) => {
    requests.push(String(url));
    return Response.json({ payment_channels: [
      { id: 15456, is_active: true, channel_type: "bank", transaction_type: "CustomerPayBillOnline" },
      { id: 2, is_active: false, channel_type: "till", transaction_type: "CustomerBuyGoodsOnline" },
    ] });
  }) as typeof fetch;

  assert.equal(await resolveChannelId(), 15456);
  assert.deepEqual(requests, ["https://backend.payhero.co.ke/api/v2/payment_channels?is_active=true"]);
});

test("looks up PayHero status by the transaction reference", async () => {
  configure();
  let requested = "";
  globalThis.fetch = (async (url) => {
    requested = String(url);
    return Response.json({
      status: "SUCCESS",
      success: true,
      reference: "PH-REF-1",
      payment_reference: "our-request-id",
      provider: "m-pesa",
      CheckoutRequestID: "ws-123",
      provider_reference: "ABC123",
      amount: 250,
    });
  }) as typeof fetch;

  assert.deepEqual(await getPayheroTransactionStatus("PH-REF-1"), {
    status: "SUCCESS",
    reference: "PH-REF-1",
    paymentReference: "our-request-id",
    provider: "m-pesa",
    checkoutRequestId: "ws-123",
    providerReference: "ABC123",
    amount: 250,
  });
  assert.equal(requested, "https://backend.payhero.co.ke/api/v2/transaction-status?reference=PH-REF-1");
});

test("matches Lipwa confirmations to their server-created deposit and amount", () => {
  const status = {
    status: "SUCCESS" as const,
    reference: "PH-LIPWA-1",
    paymentReference: "deposit-uuid",
    provider: "m-pesa",
    checkoutRequestId: null,
    providerReference: "TCT3K99UFZ",
    amount: 25,
  };
  const expected = {
    reference: "PH-LIPWA-1",
    userReference: "deposit-uuid",
    providerReference: "TCT3K99UFZ",
    amountCents: 2500,
  };

  assert.equal(matchesPayheroLipwaTransaction(status, expected), true);
  assert.equal(matchesPayheroLipwaTransaction(status, { ...expected, userReference: "another-deposit" }), false);
  assert.equal(matchesPayheroLipwaTransaction(status, { ...expected, amountCents: 2600 }), false);
  assert.equal(matchesPayheroLipwaTransaction(status, { ...expected, providerReference: "OTHER-RECEIPT" }), false);
});

test("returns PayHero's safe validation message instead of hiding it", async () => {
  configure();
  globalThis.fetch = (async () => Response.json({ error_message: "Invalid phone_number" }, { status: 400 })) as typeof fetch;
  await assert.rejects(
    getPayheroTransactionStatus("PH-REF-1"),
    /PayHero rejected the request: Invalid phone_number/,
  );
});
