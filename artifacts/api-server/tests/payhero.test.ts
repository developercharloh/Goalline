import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  getPayheroTransactionStatus,
  initiatePayheroStk,
  matchesPayheroStkIdentity,
  matchesPayheroStkTransaction,
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

test("initiates an STK request with the active channel and callback URL", async () => {
  configure();
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    return Response.json({
      success: true,
      status: "QUEUED",
      reference: "PH-REF-1",
      CheckoutRequestID: "ws-123",
    });
  }) as typeof fetch;

  assert.deepEqual(await initiatePayheroStk({
    amount: 250,
    phoneNumber: "+254 712 345 678",
    externalReference: "deposit-uuid",
    customerName: "ProBet Tips User",
    callbackUrl: "https://probet-tips.vercel.app/api/webhooks/payhero",
  }), { reference: "PH-REF-1", checkoutRequestId: "ws-123" });

  assert.equal(requestUrl, "https://backend.payhero.co.ke/api/v2/payments");
  assert.equal(new Headers(requestInit?.headers).get("Authorization"), "Basic test-token");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    amount: 250,
    phone_number: "0712345678",
    channel_id: 133,
    provider: "m-pesa",
    external_reference: "deposit-uuid",
    customer_name: "ProBet Tips User",
    callback_url: "https://probet-tips.vercel.app/api/webhooks/payhero",
  });
});

test("treats a lost STK response as uncertain instead of a confirmed failure", async () => {
  configure();
  globalThis.fetch = (async () => {
    throw new Error("network interruption");
  }) as typeof fetch;
  await assert.rejects(
    initiatePayheroStk({
      amount: 100,
      phoneNumber: "0712345678",
      externalReference: "deposit-uuid",
      customerName: "ProBet Tips User",
      callbackUrl: "https://probet-tips.vercel.app/api/webhooks/payhero",
    }),
    (error: unknown) => error instanceof Error && "outcomeUnknown" in error && error.outcomeUnknown === true,
  );
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

test("matches STK confirmations to the server-created deposit, checkout, and amount", () => {
  const status = {
    status: "SUCCESS" as const,
    reference: "PH-REF-1",
    paymentReference: "deposit-uuid",
    provider: "m-pesa",
    checkoutRequestId: "ws-123",
    providerReference: "TCT3K99UFZ",
    amount: 25,
  };
  const expected = {
    reference: "PH-REF-1",
    externalReference: "deposit-uuid",
    checkoutRequestId: "ws-123",
    amountCents: 2500,
    providerReference: "TCT3K99UFZ",
  };

  assert.equal(matchesPayheroStkTransaction(status, expected), true);
  assert.equal(matchesPayheroStkTransaction(status, { ...expected, externalReference: "another-deposit" }), false);
  assert.equal(matchesPayheroStkTransaction(status, { ...expected, checkoutRequestId: "another-checkout" }), false);
  assert.equal(matchesPayheroStkTransaction(status, { ...expected, amountCents: 2600 }), false);
  assert.equal(matchesPayheroStkTransaction(status, { ...expected, providerReference: "OTHER-RECEIPT" }), false);
  assert.equal(matchesPayheroStkIdentity({ ...status, amount: null }, expected), true);
});

test("returns PayHero's safe validation message instead of hiding it", async () => {
  configure();
  globalThis.fetch = (async () => Response.json({ error_message: "Invalid phone_number" }, { status: 400 })) as typeof fetch;
  await assert.rejects(
    getPayheroTransactionStatus("PH-REF-1"),
    /PayHero rejected the request: Invalid phone_number/,
  );
});
