import { createHmac, randomBytes, randomUUID } from "node:crypto";

/** Exact raw-body signing from the merchant's uploaded Postman collection.
 * This prepares staging sessions only. Do not enable live wallet funding until
 * Cashia documents session responses, amount units and authenticated settlement.
 */
export function buildCashiaStagingRequest(input: {
  keyId: string;
  secret: string;
  coinSerial: string;
  amount: number;
  currency: "KES";
  successRedirectUrl: string;
  errorRedirectUrl: string;
  webhookUrl: string;
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Invalid Cashia amount.");
  const requestId = randomUUID();
  const rawBody = JSON.stringify({
    requestId,
    coinSerial: input.coinSerial,
    amount: input.amount,
    successRedirectUrl: input.successRedirectUrl,
    errorRedirectUrl: input.errorRedirectUrl,
    webhookUrl: input.webhookUrl,
    orderDetails: [{
      name: "ProBet Tips Wallet Top Up",
      currency: input.currency,
      quantity: 1,
      description: "Top-up-only wallet credit. No withdrawals.",
      price: input.amount,
    }],
    deliveryDetails: { currency: input.currency, fee: 0 },
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const hmac = (value: string) => createHmac("sha256", input.secret).update(value).digest("hex");
  return {
    requestId,
    url: "https://merchant-api.staging.cashia.com/api/v1/hosted-checkout/new",
    method: "POST" as const,
    body: rawBody,
    headers: {
      "Content-Type": "application/json",
      "X-Cashia-Key-ID": input.keyId,
      "X-Cashia-Nonce": nonce,
      "X-Cashia-Timestamp": timestamp,
      "X-Cashia-Hash": hmac(rawBody),
      // Signing host intentionally differs from the merchant API host.
      "X-Cashia-Signature": hmac(`https://staging.cashia.comPOST${timestamp}${nonce}${input.keyId}`),
    },
  };
}
