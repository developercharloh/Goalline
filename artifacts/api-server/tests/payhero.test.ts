import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  getPayheroTransactionStatus,
  initiatePayheroStk,
  normalizeKenyanPhone,
  payheroEnabled,
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
  assert.equal(normalizeKenyanPhone("0712 345 678"), "254712345678");
  assert.equal(normalizeKenyanPhone("+254 112 345 678"), "254112345678");
  assert.throws(() => normalizeKenyanPhone("123456"), /valid Safaricom number/);
});

test("initiates an M-Pesa STK request with the configured channel and callback", async () => {
  configure();
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    return Response.json({ success: true, status: "QUEUED", reference: "PH-REF-1", CheckoutRequestID: "ws-123" });
  }) as typeof fetch;

  const result = await initiatePayheroStk({
    amount: 250,
    phoneNumber: "0712345678",
    externalReference: "our-request-id",
    customerName: "ProBet Tips User",
    callbackUrl: "https://example.com/api/webhooks/payhero",
  });

  assert.deepEqual(result, { reference: "PH-REF-1", checkoutRequestId: "ws-123" });
  assert.equal(requestUrl, "https://backend.payhero.co.ke/api/v2/payments");
  const headers = new Headers(requestInit?.headers);
  assert.equal(headers.get("Authorization"), "Basic test-token");
  const body = JSON.parse(String(requestInit?.body));
  assert.equal(body.amount, 250);
  assert.equal(body.phone_number, "254712345678");
  assert.equal(body.channel_id, 133);
  assert.equal(body.provider, "m-pesa");
  assert.equal(body.external_reference, "our-request-id");
  assert.equal(body.callback_url, "https://example.com/api/webhooks/payhero");
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
      provider: "m-pesa",
      CheckoutRequestID: "ws-123",
      provider_reference: "ABC123",
      amount: 250,
    });
  }) as typeof fetch;

  assert.deepEqual(await getPayheroTransactionStatus("PH-REF-1"), {
    status: "SUCCESS",
    reference: "PH-REF-1",
    provider: "m-pesa",
    checkoutRequestId: "ws-123",
    providerReference: "ABC123",
    amount: 250,
  });
  assert.equal(requested, "https://backend.payhero.co.ke/api/v2/transaction-status?reference=PH-REF-1");
});
