import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";
import {
  cashiaStagingCheckoutEnabled,
  createCashiaStagingSession,
  resolveCashiaKesCoin,
  selectCashiaKesCoin,
} from "../src/lib/cashia.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

function coin(overrides: Record<string, unknown> = {}) {
  return { serial: "test-kes-wallet", currency: { code: "KES" }, active: true, accounting: false, type: "client", ...overrides };
}

function configure() {
  process.env.NODE_ENV = "development";
  process.env.CASHIA_STAGING_KEY_ID = "test-key-id";
  process.env.CASHIA_STAGING_SECRET = "test-secret";
  process.env.CASHIA_STAGING_CHECKOUT_ENABLED = "true";
  delete process.env.CASHIA_STAGING_COIN_SERIAL;
}

const input = {
  requestId: "sandbox-request",
  amount: 100,
  successRedirectUrl: "https://example.com/success",
  errorRedirectUrl: "https://example.com/error",
  webhookUrl: "https://example.com/webhook",
};

test("finds the merchant KES wallet without a manual serial", () => {
  assert.equal(selectCashiaKesCoin({ coins: [coin()] }), "test-kes-wallet");
});

test("ignores inactive, accounting, technical, and non-KES wallets", () => {
  assert.equal(selectCashiaKesCoin({ coins: [
    coin({ serial: "inactive", active: false }),
    coin({ serial: "accounting", accounting: true }),
    coin({ serial: "technical", type: "technical" }),
    coin({ serial: "usd", currency: { code: "USD" } }),
    coin(),
  ] }), "test-kes-wallet");
});

test("uses only a unique main KES wallet when several exist", () => {
  assert.equal(selectCashiaKesCoin({ coins: [coin({ serial: "other" }), coin({ main: true })] }), "test-kes-wallet");
  assert.throws(() => selectCashiaKesCoin({ coins: [coin(), coin({ serial: "other" })] }), /multiple KES wallets/);
  assert.throws(() => selectCashiaKesCoin({ coins: [coin({ main: true }), coin({ serial: "other", main: true })] }), /multiple KES wallets/);
});

test("rejects an empty or malformed wallet list", () => {
  for (const data of [null, {}, { coins: [] }, { coins: [null, {}, coin({ serial: "" })] }]) {
    assert.throws(() => selectCashiaKesCoin(data));
  }
});

test("verifies that a manually configured serial belongs to the KES merchant", () => {
  assert.equal(selectCashiaKesCoin({ coins: [coin()] }, "test-kes-wallet"), "test-kes-wallet");
  assert.throws(() => selectCashiaKesCoin({ coins: [coin()] }, "unrelated-wallet"), /not an active KES merchant wallet/);
});

test("staging stays off by default and cannot be enabled in production", () => {
  configure();
  delete process.env.CASHIA_STAGING_CHECKOUT_ENABLED;
  assert.equal(cashiaStagingCheckoutEnabled(), false);
  process.env.CASHIA_STAGING_CHECKOUT_ENABLED = "true";
  assert.equal(cashiaStagingCheckoutEnabled(), true);
  process.env.NODE_ENV = "production";
  assert.equal(cashiaStagingCheckoutEnabled(), false);
});

test("discovers a wallet before checkout and signs the exact sent body", async () => {
  configure();
  const requests: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url, init) => {
    requests.push({ url: String(url), init: init! });
    if (requests.length === 1) return Response.json({ coins: [coin()] });
    return Response.json({ sessionId: "test-session", url: "https://staging.cashia.com/link/test/test-session", amount: 100, currency: "KES", requestId: input.requestId });
  }) as typeof fetch;
  const result = await createCashiaStagingSession(input);
  assert.equal(result.currency, "KES");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://merchant-api.staging.cashia.com/api/v1/coins");
  assert.equal(requests[0].init.method, "GET");
  assert.equal(requests[1].url, "https://merchant-api.staging.cashia.com/api/v1/hosted-checkout/new");
  const rawBody = String(requests[1].init.body);
  assert.equal(JSON.parse(rawBody).coinSerial, "test-kes-wallet");
  const headers = new Headers(requests[1].init.headers);
  const hash = (value: string) => createHmac("sha256", "test-secret").update(value).digest("hex");
  assert.equal(headers.get("X-Cashia-Hash"), hash(rawBody));
  assert.equal(headers.get("X-Cashia-Signature"), hash(`https://staging.cashia.comPOST${headers.get("X-Cashia-Timestamp")}${headers.get("X-Cashia-Nonce")}test-key-id`));
});

test("reports a security gateway block without creating checkout", async () => {
  configure();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("<html>Access denied</html>", { status: 403, headers: { "Content-Type": "text/html" } });
  }) as typeof fetch;
  await assert.rejects(createCashiaStagingSession(input), /security gateway blocked/);
  assert.equal(calls, 1);
});

test("does not claim credentials are invalid on a permission denial", async () => {
  configure();
  globalThis.fetch = (async () => Response.json({ message: "Denied" }, { status: 401 })) as typeof fetch;
  await assert.rejects(resolveCashiaKesCoin(), /API access or credential permissions need confirmation/);
});

test("rejects unsafe checkout URLs and mismatched amounts", async () => {
  configure();
  for (const overrides of [{ url: "https://malicious.example/checkout" }, { amount: 101 }]) {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return calls === 1 ? Response.json({ coins: [coin()] }) : Response.json({
        sessionId: "test-session", url: "https://staging.cashia.com/link/test/test-session", amount: 100, currency: "KES", requestId: input.requestId, ...overrides,
      });
    }) as typeof fetch;
    await assert.rejects(createCashiaStagingSession(input), /untrusted checkout URL|do not match/);
  }
});
