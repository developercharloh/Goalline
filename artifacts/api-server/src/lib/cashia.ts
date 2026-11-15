import { createHmac, randomBytes } from "node:crypto";

const STAGING_SIGNING_HOST = "https://staging.cashia.com";
const STAGING_API_BASE = `${STAGING_SIGNING_HOST}/api`;

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

export type CashiaTransaction = {
  id?: string;
  status?: string;
  requestIdentifier?: string;
  requestStatus?: string;
  externalSourceAmount?: number;
  internalSourceAmount?: number;
  sourceCurrency?: { code?: string; sn?: string };
  destinationCurrency?: { code?: string; sn?: string };
  underInvestigation?: boolean;
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
  if (!Number.isFinite(input.amount) || input.amount < 1 || Math.round(input.amount * 100) !== input.amount * 100) {
    throw new CashiaApiError("Enter a valid KES deposit amount.", 400);
  }
  const body = JSON.stringify({
    requestId: input.requestId,
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
    response = await fetch(`${STAGING_API_BASE}/v1/hosted-checkout`, {
      method: "POST",
      headers: signedHeaders("POST", body),
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new CashiaApiError("Cashia staging could not be reached. Try again shortly.", 502);
  }

  const data = await response.json().catch(() => null) as Partial<CashiaCheckoutSession> | null;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new CashiaApiError("Cashia rejected the staging credentials. Check the API key ID and secret.", 502);
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
  if (checkoutUrl.protocol !== "https:" || !checkoutUrl.hostname.endsWith(".cashia.com")) {
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

export async function getCashiaStagingTransaction(transactionId: string): Promise<CashiaTransaction> {
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(transactionId)) {
    throw new CashiaApiError("Invalid Cashia transaction identifier.", 400);
  }

  let response: Response;
  try {
    response = await fetch(`${STAGING_API_BASE}/v1/transactions/${encodeURIComponent(transactionId)}`, {
      method: "GET",
      headers: signedHeaders("GET", ""),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new CashiaApiError("Cashia status could not be checked. Try again shortly.", 502);
  }

  const data = await response.json().catch(() => null) as { process?: CashiaTransaction } | null;
  if (!response.ok || !data?.process) {
    if (response.status === 401 || response.status === 403) {
      throw new CashiaApiError("Cashia rejected the staging credentials. Check the API key ID and secret.", 502);
    }
    throw new CashiaApiError("Cashia has not returned a verifiable transaction yet.", 502);
  }
  return data.process;
}

export function isCashiaStagingPaymentVerified(
  process: CashiaTransaction,
  expected: { requestId: string; sessionId: string; amount: number },
): boolean {
  const successfulStatuses = new Set(["success", "successful", "complete", "completed", "paid", "settled"]);
  const status = String(process.requestStatus ?? "").toLowerCase();
  const sourceCurrency = String(process.sourceCurrency?.code ?? process.sourceCurrency?.sn ?? "").toUpperCase();
  const sourceAmount = process.externalSourceAmount ?? process.internalSourceAmount;

  return (
    process.id === expected.sessionId &&
    process.requestIdentifier === expected.requestId &&
    successfulStatuses.has(status) &&
    process.underInvestigation === false &&
    sourceCurrency === "KES" &&
    typeof sourceAmount === "number" &&
    Math.round(sourceAmount * 100) === Math.round(expected.amount * 100)
  );
}
