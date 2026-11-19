const PAYHERO_API_BASE = "https://backend.payhero.co.ke/api/v2";

export class PayheroApiError extends Error {
  public readonly statusCode: number;
  public readonly outcomeUnknown: boolean;

  constructor(message: string, statusCode: number, outcomeUnknown = false) {
    super(message);
    this.name = "PayheroApiError";
    this.statusCode = statusCode;
    this.outcomeUnknown = outcomeUnknown;
  }
}

export function payheroEnabled(): boolean {
  const configuredChannel = process.env.PAYHERO_CHANNEL_ID;
  return Boolean(process.env.PAYHERO_AUTH_TOKEN)
    && (!configuredChannel || (/^\d+$/.test(configuredChannel) && Number(configuredChannel) > 0));
}

export function normalizeKenyanPhone(value: string): string {
  const digits = value.replace(/[\s()+-]/g, "");
  // PayHero's STK documentation uses the local 07/01 form in phone_number examples.
  if (/^0[17]\d{8}$/.test(digits)) return digits;
  if (/^254[17]\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  throw new PayheroApiError("Enter a valid Safaricom number, such as 0712345678.", 400);
}

function providerErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const value = [record.error_message, record.message, record.error]
    .find((candidate) => typeof candidate === "string" && candidate.trim());
  if (typeof value !== "string") return null;
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 180);
}

function authorizationHeader(): string {
  const token = process.env.PAYHERO_AUTH_TOKEN?.trim();
  if (!token) throw new PayheroApiError("PayHero is not configured yet.", 503);
  return /^Basic\s/i.test(token) ? token : `Basic ${token}`;
}

async function payheroFetch(url: URL, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: authorizationHeader(),
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PayheroApiError(
      "PayHero could not be reached. Check your phone before retrying.",
      502,
      init.method === "POST",
    );
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new PayheroApiError("PayHero denied the API request. Check the API key and payment-channel access.", 502);
    }
    const detail = providerErrorMessage(data);
    throw new PayheroApiError(
      detail ? `PayHero rejected the request: ${detail}` : "PayHero could not process the payment request.",
      502,
    );
  }
  return data;
}

export async function resolveChannelId(): Promise<number> {
  const configured = process.env.PAYHERO_CHANNEL_ID;
  if (configured) {
    const value = Number(configured);
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new PayheroApiError("PayHero's M-Pesa channel configuration is invalid.", 503);
    }
    return value;
  }

  const url = new URL(`${PAYHERO_API_BASE}/payment_channels`);
  url.searchParams.set("is_active", "true");
  const data = await payheroFetch(url, { method: "GET" }) as {
    payment_channels?: Array<{
      id?: unknown;
      is_active?: unknown;
      channel_type?: unknown;
      transaction_type?: unknown;
    }>;
  } | null;
  const channels = (data?.payment_channels ?? []).filter((channel) => {
    if (channel.is_active !== true || typeof channel.id !== "number" || !Number.isSafeInteger(channel.id)) return false;
    const type = String(channel.channel_type ?? "").toLowerCase();
    const transaction = String(channel.transaction_type ?? "").toLowerCase();
    const mpesaTransaction = transaction.includes("customerbuygoodsonline")
      || transaction.includes("customerpaybillonline");
    return mpesaTransaction || (type !== "bank" && ["paybill", "till", "mpesa"].includes(type));
  });
  if (channels.length === 1) return channels[0].id as number;
  if (channels.length > 1) {
    throw new PayheroApiError("PayHero has more than one active M-Pesa channel. Set PAYHERO_CHANNEL_ID to the one that receives deposits.", 503);
  }
  throw new PayheroApiError("PayHero has no active M-Pesa payment channel. Activate one in PayHero or set PAYHERO_CHANNEL_ID.", 503);
}

export type PayheroStkResult = {
  reference: string;
  checkoutRequestId: string;
};

export async function initiatePayheroStk(input: {
  amount: number;
  phoneNumber: string;
  externalReference: string;
  customerName: string;
  callbackUrl: string;
}): Promise<PayheroStkResult> {
  if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > 100_000) {
    throw new PayheroApiError("Enter a whole KES amount from 1 to 100,000.", 400);
  }
  const phoneNumber = normalizeKenyanPhone(input.phoneNumber);
  const data = await payheroFetch(new URL(`${PAYHERO_API_BASE}/payments`), {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      phone_number: phoneNumber,
      channel_id: await resolveChannelId(),
      provider: "m-pesa",
      external_reference: input.externalReference,
      customer_name: input.customerName,
      callback_url: input.callbackUrl,
    }),
  }) as {
    success?: unknown;
    status?: unknown;
    reference?: unknown;
    CheckoutRequestID?: unknown;
  } | null;
  const accepted = data?.success === true
    || (typeof data?.status === "string" && ["QUEUED", "PENDING", "SUCCESS"].includes(data.status.toUpperCase()));
  if (
    !accepted
    || typeof data?.reference !== "string"
    || !data.reference
    || typeof data.CheckoutRequestID !== "string"
    || !data.CheckoutRequestID
  ) {
    throw new PayheroApiError(
      "PayHero did not return a trackable M-Pesa request. Check your phone before retrying.",
      502,
      true,
    );
  }
  return { reference: data.reference, checkoutRequestId: data.CheckoutRequestID };
}

export type PayheroTransactionStatus = {
  status: "QUEUED" | "SUCCESS" | "FAILED" | "UNKNOWN";
  reference: string | null;
  paymentReference: string | null;
  provider: string | null;
  checkoutRequestId: string | null;
  providerReference: string | null;
  amount: number | null;
};

export function matchesPayheroStkIdentity(
  status: PayheroTransactionStatus,
  expected: {
    reference: string;
    externalReference: string;
    checkoutRequestId: string;
  },
): boolean {
  return status.reference === expected.reference
    && (!status.paymentReference || status.paymentReference === expected.externalReference)
    && status.provider === "m-pesa"
    && status.checkoutRequestId === expected.checkoutRequestId;
}

export function matchesPayheroStkTransaction(
  status: PayheroTransactionStatus,
  expected: {
    reference: string;
    externalReference: string;
    checkoutRequestId: string;
    amountCents: number;
    providerReference?: string | null;
  },
): boolean {
  return matchesPayheroStkIdentity(status, expected)
    && status.amount !== null
    && Math.round(status.amount * 100) === expected.amountCents
    && (!expected.providerReference || status.providerReference === expected.providerReference);
}

export async function getPayheroTransactionStatus(reference: string): Promise<PayheroTransactionStatus> {
  const url = new URL(`${PAYHERO_API_BASE}/transaction-status`);
  url.searchParams.set("reference", reference);
  const data = await payheroFetch(url, { method: "GET" }) as {
    status?: unknown;
    reference?: unknown;
    payment_reference?: unknown;
    provider?: unknown;
    CheckoutRequestID?: unknown;
    provider_reference?: unknown;
    third_party_reference?: unknown;
    amount?: unknown;
    success?: unknown;
  } | null;
  if (!data || typeof data.status !== "string") {
    throw new PayheroApiError("PayHero returned an invalid transaction status.", 502);
  }
  const normalized = data.status.toUpperCase();
  return {
    status: data.success === false ? "UNKNOWN" : normalized === "SUCCESS" || normalized === "FAILED" || normalized === "QUEUED"
      ? normalized
      : "UNKNOWN",
    reference: typeof data.reference === "string" ? data.reference : null,
    paymentReference: typeof data.payment_reference === "string" && data.payment_reference
      ? data.payment_reference
      : null,
    provider: typeof data.provider === "string" ? data.provider.toLowerCase() : null,
    checkoutRequestId: typeof data.CheckoutRequestID === "string" ? data.CheckoutRequestID : null,
    providerReference: typeof data.provider_reference === "string"
      ? data.provider_reference
      : typeof data.third_party_reference === "string" ? data.third_party_reference : null,
    amount: typeof data.amount === "number" && Number.isFinite(data.amount) ? data.amount : null,
  };
}
