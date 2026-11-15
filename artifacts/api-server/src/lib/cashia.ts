import { createHmac, randomBytes } from "node:crypto";

const STAGING_SIGNING_HOST = "https://staging.cashia.com";
const STAGING_API_BASE = "https://merchant-api.staging.cashia.com/api";

type CashiaCredentials = {
  keyId: string;
  secret: string;
};

export type CashiaCheckoutInput = {
  requestId: string;
  amount: number;
  successRedirectUrl: string;
  errorRedirectUrl: string;
  webhookUrl: string;
};

export type CashiaCheckoutSession = {
  sessionId: string;
  url: string;
  amount: number;
  currency: "KES";
  requestId: string;
};

export class CashiaApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "CashiaApiError";
  }
}

export function hasCashiaStagingCredentials(): boolean {
  return Boolean(process.env.CASHIA_STAGING_KEY_ID && process.env.CASHIA_STAGING_SECRET);
}

export function cashiaStagingCheckoutEnabled(): boolean {
  // Staging must never be silently presented as a live-money deposit service.
  return process.env.NODE_ENV !== "production"
    && hasCashiaStagingCredentials()
    && process.env.CASHIA_STAGING_CHECKOUT_ENABLED === "true";
}

function credentials(): CashiaCredentials {
  const keyId = process.env.CASHIA_STAGING_KEY_ID;
  const secret = process.env.CASHIA_STAGING_SECRET;
  if (!keyId || !secret) {
    throw new CashiaApiError("Cashia staging is not configured.", 503);
  }
  return { keyId, secret };
}

function hmac(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function signedHeaders(method: "GET" | "POST", body: string): Record<string, string> {
  const { keyId, secret } = credentials();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const signingString = `${STAGING_SIGNING_HOST}${method}${timestamp}${nonce}${keyId}`;
  return {
    Accept: "application/json",
    "X-Cashia-Key-ID": keyId,
    "X-Cashia-Nonce": nonce,
    "X-Cashia-Timestamp": timestamp,
    "X-Cashia-Hash": hmac(body, secret),
    "X-Cashia-Signature": hmac(signingString, secret),
    ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
  };
}

type CashiaCoin = {
  serial: string;
  currency: { code?: string; sn?: string };
  active: boolean;
  accounting: boolean;
  type: string;
  main?: boolean;
};

function isMerchantKesCoin(value: unknown): value is CashiaCoin {
  if (!value || typeof value !== "object") return false;
  const coin = value as Partial<CashiaCoin>;
  if (!coin.currency || typeof coin.currency !== "object") return false;
  return typeof coin.serial === "string"
    && /^[A-Za-z0-9._-]{1,180}$/.test(coin.serial)
    && coin.active === true
    && coin.accounting === false
    && coin.type === "client"
    && String(coin.currency.code ?? coin.currency.sn ?? "").toUpperCase() === "KES";
}

/** Select only wallets returned by the authenticated merchant wallet API.
 * Never invent a serial or substitute a wallet from another currency. */
export function selectCashiaKesCoin(data: unknown, preferredSerial?: string): string {
  if (!data || typeof data !== "object" || !Array.isArray((data as { coins?: unknown }).coins)) {
    throw new CashiaApiError("Cashia returned an invalid merchant wallet list.", 502);
  }
  const coins = ((data as { coins: unknown[] }).coins).filter(isMerchantKesCoin);
  if (preferredSerial) {
    if (coins.some(coin => coin.serial === preferredSerial)) return preferredSerial;
    throw new CashiaApiError("The configured Cashia wallet is not an active KES merchant wallet for these credentials.", 502);
  }
  if (coins.length === 1) return coins[0].serial;
  if (!coins.length) {
    throw new CashiaApiError("Cashia did not return an active KES merchant wallet. Deposits remain unavailable.", 502);
  }
  const mainCoins = coins.filter(coin => coin.main === true);
  if (mainCoins.length === 1) return mainCoins[0].serial;
  throw new CashiaApiError("Cashia returned multiple KES wallets without a unique main wallet. Merchant wallet selection needs configuration.", 502);
}

export async function resolveCashiaKesCoin(): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${STAGING_API_BASE}/v1/coins`, {
      method: "GET",
      headers: signedHeaders("GET", ""),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof CashiaApiError) throw error;
    throw new CashiaApiError("Cashia merchant wallets could not be reached. No checkout was created.", 502);
  }
  if (response.status === 403 && !(response.headers.get("content-type") ?? "").includes("application/json")) {
    throw new CashiaApiError("Cashia's security gateway blocked the merchant wallet API. API access must be restored before deposits can start.", 502);
  }
  if (response.status === 401 || response.status === 403) {
    throw new CashiaApiError("Cashia denied the merchant wallet lookup. API access or credential permissions need confirmation.", 502);
  }
  if (!response.ok) {
    throw new CashiaApiError("Cashia could not list the merchant wallets. No checkout was created.", 502);
  }
  const data: unknown = await response.json().catch(() => null);
  return selectCashiaKesCoin(data, process.env.CASHIA_STAGING_COIN_SERIAL);
}

export async function createCashiaStagingSession(input: CashiaCheckoutInput): Promise<CashiaCheckoutSession> {
  if (!cashiaStagingCheckoutEnabled()) {
    throw new CashiaApiError("Cashia test checkout has not been enabled. Live deposits remain disabled.", 503);
  }
  if (!Number.isFinite(input.amount) || input.amount < 1 || input.amount > 100000 || Math.abs(Math.round(input.amount * 100) - input.amount * 100) > 1e-7) {
    throw new CashiaApiError("Enter a valid KES deposit amount.", 400);
  }
  const coinSerial = await resolveCashiaKesCoin();
  const body = JSON.stringify({
    requestId: input.requestId,
    coinSerial,
    currency: "KES",
    amount: input.amount,
    successRedirectUrl: input.successRedirectUrl,
    errorRedirectUrl: input.errorRedirectUrl,
    webhookUrl: input.webhookUrl,
    orderDetails: [{
      name: "ProBet Tips Wallet Top Up",
      currency: "KES",
      quantity: 1,
      description: "KES wallet deposit. No withdrawals.",
      price: input.amount,
    }],
    deliveryDetails: { currency: "KES", fee: 0 },
  });

  let response: Response;
  try {
    response = await fetch(`${STAGING_API_BASE}/v1/hosted-checkout/new`, {
      method: "POST",
      headers: signedHeaders("POST", body),
      body,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new CashiaApiError("Cashia staging could not be reached. Try again shortly.", 502);
  }

  const data = await response.json().catch(() => null) as Partial<CashiaCheckoutSession> | null;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new CashiaApiError("Cashia denied access to its staging API. The merchant credentials or API access need confirmation.", 502);
    }
    throw new CashiaApiError("Cashia could not create a checkout session.", 502);
  }
  if (
    !data ||
    typeof data.sessionId !== "string" ||
    typeof data.url !== "string" ||
    typeof data.amount !== "number" ||
    data.currency !== "KES" ||
    data.requestId !== input.requestId ||
    Math.round(data.amount * 100) !== Math.round(input.amount * 100)
  ) {
    throw new CashiaApiError("Cashia returned checkout details that do not match this deposit.", 502);
  }

  let checkoutUrl: URL;
  try {
    checkoutUrl = new URL(data.url);
  } catch {
    throw new CashiaApiError("Cashia returned an invalid checkout URL.", 502);
  }
  if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "staging.cashia.com" || checkoutUrl.username || checkoutUrl.password) {
    throw new CashiaApiError("Cashia returned an untrusted checkout URL.", 502);
  }

  return {
    sessionId: data.sessionId,
    url: checkoutUrl.toString(),
    amount: data.amount,
    currency: "KES",
    requestId: input.requestId,
  };
}
