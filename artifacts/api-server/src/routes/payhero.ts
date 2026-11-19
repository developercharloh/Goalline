import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import {
  GetPayheroConfigResponse,
  CreatePayheroDepositBody,
  CreatePayheroDepositResponse,
  GetPayheroDepositStatusParams,
  GetPayheroDepositStatusResponse,
} from "@workspace/api-zod";
import { db, payheroDepositCredits, payheroDeposits } from "@workspace/db";
import { identity } from "../lib/wallet-identity.js";
import {
  getPayheroTransactionStatus,
  matchesPayheroLipwaTransaction,
  normalizeKenyanPhone,
  PAYHERO_LIPWA_URL,
  PayheroApiError,
  payheroEnabled,
  resolveChannelId,
} from "../lib/payhero.js";

const router: IRouter = Router();

function depositMessage(status: "pending" | "credited" | "failed"): string {
  if (status === "credited") return "Payment confirmed. Your deposit has been credited.";
  if (status === "failed") return "PayHero confirmed that this payment failed. No wallet credit was added.";
  return "Complete the PayHero checkout. Your balance updates only after PayHero confirms payment.";
}

function statusResponse(deposit: typeof payheroDeposits.$inferSelect) {
  return GetPayheroDepositStatusResponse.parse({
    requestId: deposit.id,
    status: deposit.status,
    amount: deposit.amountCents / 100,
    currency: deposit.currency,
    message: depositMessage(deposit.status),
    balance: null,
  });
}

function matchesPayheroTransaction(
  status: Awaited<ReturnType<typeof getPayheroTransactionStatus>>,
  deposit: typeof payheroDeposits.$inferSelect,
): boolean {
  if (!deposit.checkoutRequestId) {
    return Boolean(deposit.providerReference && deposit.receiptNumber)
      && matchesPayheroLipwaTransaction(status, {
        reference: deposit.providerReference ?? "",
        userReference: deposit.id,
        providerReference: deposit.receiptNumber ?? "",
        amountCents: deposit.amountCents,
      });
  }
  return (status.reference === deposit.providerReference || status.reference === deposit.id)
    && (!status.provider || status.provider === "m-pesa")
    && (!status.paymentReference || status.paymentReference === deposit.id)
    && (!status.checkoutRequestId || status.checkoutRequestId === deposit.checkoutRequestId)
    && (!deposit.receiptNumber || !status.providerReference || status.providerReference === deposit.receiptNumber)
    && (status.amount === null || Math.round(status.amount * 100) === deposit.amountCents);
}

function matchesPayheroPayment(
  status: Awaited<ReturnType<typeof getPayheroTransactionStatus>>,
  deposit: typeof payheroDeposits.$inferSelect,
): boolean {
  return status.status === "SUCCESS" && matchesPayheroTransaction(status, deposit);
}

async function refreshDeposit(
  deposit: typeof payheroDeposits.$inferSelect,
  callbackAmount?: unknown,
  callbackCheckoutId?: unknown,
): Promise<typeof payheroDeposits.$inferSelect> {
  if (deposit.status !== "pending" || !deposit.providerReference) return deposit;
  if (callbackAmount !== undefined && (
    typeof callbackAmount !== "number"
    || !Number.isFinite(callbackAmount)
    || Math.round(callbackAmount * 100) !== deposit.amountCents
  )) return deposit;
  if (callbackCheckoutId !== undefined && (
    typeof callbackCheckoutId !== "string"
    || callbackCheckoutId !== deposit.checkoutRequestId
  )) return deposit;

  const providerStatus = await getPayheroTransactionStatus(deposit.providerReference);
  const matchingTransaction = matchesPayheroTransaction(providerStatus, deposit);
  if (providerStatus.status === "FAILED" && matchingTransaction) {
    const [failed] = await db.update(payheroDeposits)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(payheroDeposits.id, deposit.id), eq(payheroDeposits.status, "pending")))
      .returning();
    return failed ?? deposit;
  }
  if (!matchingTransaction || !matchesPayheroPayment(providerStatus, deposit)) return deposit;

  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(payheroDeposits)
      .where(eq(payheroDeposits.id, deposit.id)).for("update");
    if (!locked || locked.status !== "pending") return locked ?? deposit;
    await tx.insert(payheroDepositCredits).values({
      depositId: locked.id,
      owner: locked.owner,
      amountCents: locked.amountCents,
    }).onConflictDoNothing();
    const [credited] = await tx.update(payheroDeposits)
      .set({
        status: "credited",
        receiptNumber: providerStatus.providerReference,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(payheroDeposits.id, locked.id), eq(payheroDeposits.status, "pending")))
      .returning();
    return credited ?? locked;
  });
}

router.get("/probet/payhero/config", async (_req, res): Promise<void> => {
  let enabled = payheroEnabled();
  let channelId: number | null = null;
  let lipwaUrl: string | null = null;
  let message = "PayHero is not configured yet. Deposits are not available through this option.";
  if (enabled) {
    try {
      channelId = await resolveChannelId();
      lipwaUrl = PAYHERO_LIPWA_URL;
      message = "PayHero Lipwa checkout is available.";
    } catch (error) {
      enabled = false;
      message = error instanceof PayheroApiError
        ? error.message
        : "PayHero checkout could not be configured.";
    }
  }
  res.json(GetPayheroConfigResponse.parse({ enabled, message, lipwaUrl, channelId }));
});

router.post("/probet/payhero/deposits", rateLimit({ windowMs: 60_000, limit: 3, validate: false }), async (req, res): Promise<void> => {
  const input = CreatePayheroDepositBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter a whole KES amount from 1 to 100,000 and a valid Safaricom phone number." });
    return;
  }
  if (!payheroEnabled()) {
    res.status(503).json({ error: "PayHero is not configured yet. No payment request was sent." });
    return;
  }
  let phoneNumber: string;
  try {
    phoneNumber = normalizeKenyanPhone(input.data.phoneNumber);
  } catch (error) {
    if (error instanceof PayheroApiError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    throw error;
  }

  const { owner } = await identity(req, res);
  const requestId = randomUUID();
  const [deposit] = await db.insert(payheroDeposits).values({
    id: requestId,
    owner,
    amountCents: input.data.amount * 100,
    phoneNumber,
  }).returning();
  res.status(201).json(CreatePayheroDepositResponse.parse(statusResponse(deposit)));
});

router.get("/probet/payhero/deposits/:requestId", async (req, res): Promise<void> => {
  const params = GetPayheroDepositStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid deposit reference." });
    return;
  }
  const { owner } = await identity(req, res);
  const [deposit] = await db.select().from(payheroDeposits).where(and(
    eq(payheroDeposits.id, params.data.requestId),
    eq(payheroDeposits.owner, owner),
  ));
  if (!deposit) {
    res.status(404).json({ error: "Deposit not found for this wallet." });
    return;
  }
  try {
    const current = await refreshDeposit(deposit);
    res.json(statusResponse(current));
  } catch (error) {
    if (!(error instanceof PayheroApiError)) throw error;
    res.status(error.statusCode).json({ error: error.message });
  }
});

router.post("/webhooks/payhero", async (req, res): Promise<void> => {
  const callback = req.body;
  const externalReference = callback?.user_reference;
  const paymentReference = callback?.reference;
  const providerReference = callback?.providerReference;
  const amount = callback?.amount;
  const channel = callback?.channel;
  if (
    callback?.paymentSuccess !== true
    || typeof externalReference !== "string"
    || !externalReference
    || typeof paymentReference !== "string"
    || !paymentReference
    || typeof providerReference !== "string"
    || !providerReference
    || typeof amount !== "number"
    || !Number.isFinite(amount)
    || typeof callback?.provider !== "string"
    || callback.provider.toLowerCase() !== "m-pesa"
    || typeof channel !== "string"
  ) {
    res.status(400).json({ error: "Invalid PayHero Lipwa callback." });
    return;
  }
  const [deposit] = await db.select().from(payheroDeposits).where(eq(payheroDeposits.id, externalReference));
  if (!deposit) {
    res.status(404).json({ error: "Payment reference not found." });
    return;
  }
  if (deposit.status !== "pending") {
    res.status(200).json({ received: true });
    return;
  }
  if (Math.round(amount * 100) !== deposit.amountCents) {
    res.status(400).json({ error: "PayHero callback amount does not match the pending deposit." });
    return;
  }
  try {
    const channelId = await resolveChannelId();
    if (channel !== String(channelId)) {
      res.status(400).json({ error: "PayHero callback channel does not match the configured deposit channel." });
      return;
    }
    const [tagged] = await db.update(payheroDeposits)
      .set({
        providerReference: paymentReference,
        receiptNumber: providerReference,
        updatedAt: new Date(),
      })
      .where(and(
        eq(payheroDeposits.id, deposit.id),
        eq(payheroDeposits.status, "pending"),
      ))
      .returning();
    if (!tagged) {
      res.status(200).json({ received: true });
      return;
    }
    await refreshDeposit(tagged, amount);
    res.status(200).json({ received: true });
  } catch (error) {
    if (!(error instanceof PayheroApiError)) throw error;
    res.status(503).json({ error: "Payment status could not be verified with PayHero." });
  }
});

export default router;
