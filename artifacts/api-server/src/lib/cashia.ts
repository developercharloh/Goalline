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
    && Boolean(process.env.CASHIA_STAGING_COIN_SERIAL);
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
    "X-Cashia-Key-ID": keyId,
    "X-Cashia-Nonce": nonce,
    "X-Cashia-Timestamp": timestamp,
    "X-Cashia-Hash": hmac(body, secret),
    "X-Cashia-Signature": hmac(signingString, secret),
    ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
  };
}

export async function createCashiaStagingSession(input: CashiaCheckoutInput): Promise<CashiaCheckoutSession> {
  const coinSerial = process.env.CASHIA_STAGING_COIN_SERIAL;
  if (!cashiaStagingCheckoutEnabled() || !coinSerial) {
    throw new CashiaApiError("Cashia test checkout is not ready. The merchant KES wallet coin serial is required; live deposits remain disabled.", 503);
  }
  if (!Number.isFinite(input.amount) || input.amount < 1 || input.amount > 100000 || Math.abs(Math.round(input.amount * 100) - input.amount * 100) > 1e-7) {
    throw new CashiaApiError("Enter a valid KES deposit amount.", 400);
  }
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
