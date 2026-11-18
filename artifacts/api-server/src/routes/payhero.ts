import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import {
  CreatePayheroDepositBody,
  CreatePayheroDepositResponse,
  GetPayheroDepositStatusParams,
  GetPayheroDepositStatusResponse,
} from "@workspace/api-zod";
import { db, payheroDepositCredits, payheroDeposits } from "@workspace/db";
import { identity } from "../lib/wallet-identity.js";
import {
  getPayheroTransactionStatus,
  initiatePayheroStk,
  normalizeKenyanPhone,
  PayheroApiError,
  payheroEnabled,
} from "../lib/payhero.js";

const router: IRouter = Router();

function depositMessage(status: "pending" | "credited" | "failed"): string {
  if (status === "credited") return "Payment confirmed. Your deposit has been credited.";
  if (status === "failed") return "PayHero confirmed that this payment failed. No wallet credit was added.";
  return "Approve the M-Pesa request on your phone. Your balance updates after PayHero confirms payment.";
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

function matchesPayheroPayment(
  status: Awaited<ReturnType<typeof getPayheroTransactionStatus>>,
  deposit: typeof payheroDeposits.$inferSelect,
): boolean {
  return status.status === "SUCCESS"
    && (status.reference === deposit.providerReference || status.reference === deposit.id)
    && (!status.provider || status.provider === "m-pesa")
    && (!status.checkoutRequestId || status.checkoutRequestId === deposit.checkoutRequestId)
    && (status.amount === null || Math.round(status.amount * 100) === deposit.amountCents);
}

async function refreshDeposit(
  deposit: typeof payheroDeposits.$inferSelect,
  callbackAmount?: unknown,
  callbackCheckoutId?: unknown,
): Promise<typeof payheroDeposits.$inferSelect> {
  if (deposit.status !== "pending" || !deposit.providerReference || !deposit.checkoutRequestId) return deposit;
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
  const matchingTransaction = (providerStatus.reference === deposit.providerReference || providerStatus.reference === deposit.id)
    && (!providerStatus.provider || providerStatus.provider === "m-pesa")
    && (!providerStatus.checkoutRequestId || providerStatus.checkoutRequestId === deposit.checkoutRequestId);
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

router.get("/probet/payhero/config", (_req, res) => {
  res.json({
    enabled: payheroEnabled(),
    message: payheroEnabled()
      ? "PayHero M-Pesa Express is available."
      : "PayHero is not configured yet. Deposits are not available through this option.",
  });
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
  const host = req.get("x-forwarded-host") || req.get("host");
  if (!host || !/^[a-zA-Z0-9.:[\]-]+$/.test(host)) {
    res.status(400).json({ error: "Invalid callback host." });
    return;
  }
  const origin = `${req.get("x-forwarded-proto") === "https" || req.secure ? "https" : "http"}://${host}`;
  await db.insert(payheroDeposits).values({
    id: requestId,
    owner,
    amountCents: input.data.amount * 100,
    phoneNumber,
  });
  try {
    const payment = await initiatePayheroStk({
      amount: input.data.amount,
      phoneNumber,
      externalReference: requestId,
      customerName: "ProBet Tips User",
      callbackUrl: `${origin}/api/webhooks/payhero`,
    });
    const [deposit] = await db.update(payheroDeposits)
      .set({
        providerReference: payment.reference,
        checkoutRequestId: payment.checkoutRequestId,
        updatedAt: new Date(),
      })
      .where(eq(payheroDeposits.id, requestId))
      .returning();
    res.status(201).json(CreatePayheroDepositResponse.parse(statusResponse(deposit)));
  } catch (error) {
    await db.update(payheroDeposits)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(payheroDeposits.id, requestId), eq(payheroDeposits.status, "pending")));
    if (!(error instanceof PayheroApiError)) throw error;
    res.status(error.statusCode).json({ error: error.message });
  }
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
  const callback = req.body?.response;
  const externalReference = callback?.ExternalReference;
  const amount = callback?.Amount;
  const checkoutRequestId = callback?.CheckoutRequestID;
  if (
    typeof externalReference !== "string"
    || typeof amount !== "number"
    || typeof checkoutRequestId !== "string"
  ) {
    res.status(400).json({ error: "Invalid PayHero callback." });
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
  try {
    const updated = await refreshDeposit(deposit, amount, checkoutRequestId);
    if (updated.status === "pending") {
      res.status(503).json({ error: "Payment is not yet confirmed by PayHero. Callback may be retried." });
      return;
    }
    res.status(200).json({ received: true });
  } catch (error) {
    if (!(error instanceof PayheroApiError)) throw error;
    res.status(503).json({ error: "Payment status could not be verified with PayHero. Callback may be retried." });
  }
});

export default router;
