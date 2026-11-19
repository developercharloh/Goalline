import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Request } from "express";
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
  initiatePayheroStk,
  matchesPayheroStkIdentity,
  matchesPayheroStkTransaction,
  normalizeKenyanPhone,
  PayheroApiError,
  payheroEnabled,
  resolveChannelId,
} from "../lib/payhero.js";

const router: IRouter = Router();

function depositMessage(status: "pending" | "credited" | "failed"): string {
  if (status === "credited") return "Payment confirmed. Your deposit has been credited.";
  if (status === "failed") return "PayHero confirmed that this payment failed. No wallet credit was added.";
  return "Approve the M-Pesa prompt on your phone. Your balance updates only after PayHero confirms payment.";
}

function statusResponse(deposit: typeof payheroDeposits.$inferSelect, message?: string) {
  return GetPayheroDepositStatusResponse.parse({
    requestId: deposit.id,
    status: deposit.status,
    amount: deposit.amountCents / 100,
    currency: deposit.currency,
    message: message ?? depositMessage(deposit.status),
    balance: null,
  });
}

function matchesPayheroTransaction(
  status: Awaited<ReturnType<typeof getPayheroTransactionStatus>>,
  deposit: typeof payheroDeposits.$inferSelect,
): boolean {
  return Boolean(deposit.providerReference && deposit.checkoutRequestId)
    && matchesPayheroStkIdentity(status, {
      reference: deposit.providerReference ?? "",
      externalReference: deposit.id,
      checkoutRequestId: deposit.checkoutRequestId ?? "",
    });
}

function matchesPayheroPayment(
  status: Awaited<ReturnType<typeof getPayheroTransactionStatus>>,
  deposit: typeof payheroDeposits.$inferSelect,
): boolean {
  return status.status === "SUCCESS"
    && matchesPayheroTransaction(status, deposit)
    && matchesPayheroStkTransaction(status, {
      reference: deposit.providerReference ?? "",
      externalReference: deposit.id,
      checkoutRequestId: deposit.checkoutRequestId ?? "",
      amountCents: deposit.amountCents,
      providerReference: deposit.receiptNumber,
    });
}

function callbackUrlForRequest(req: Request): string {
  const forwardedHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.VERCEL_URL
    || req.get("x-forwarded-host")
    || req.get("host");
  const host = forwardedHost?.split(",")[0].trim();
  if (!host || !/^[a-zA-Z0-9.:[\]-]+$/.test(host)) {
    throw new PayheroApiError("Could not determine the public PayHero callback address.", 400);
  }
  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? "https"
    : forwardedProtocol === "https" || req.secure ? "https" : "http";
  return `${protocol}://${host}/api/webhooks/payhero`;
}

async function refreshDeposit(
  deposit: typeof payheroDeposits.$inferSelect,
): Promise<typeof payheroDeposits.$inferSelect> {
  if (deposit.status !== "pending" || !deposit.providerReference) return deposit;

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
  let message = "PayHero is not configured yet. Deposits are not available through this option.";
  if (enabled) {
    try {
      channelId = await resolveChannelId();
      message = "PayHero M-Pesa Express is ready.";
    } catch (error) {
      enabled = false;
      message = error instanceof PayheroApiError
        ? error.message
        : "PayHero M-Pesa Express could not be configured.";
    }
  }
  res.json(GetPayheroConfigResponse.parse({ enabled, message, channelId }));
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
  try {
    const payment = await initiatePayheroStk({
      amount: input.data.amount,
      phoneNumber,
      externalReference: requestId,
      customerName: "ProBet Tips User",
      callbackUrl: callbackUrlForRequest(req),
    });
    const [initiated] = await db.update(payheroDeposits)
      .set({
        providerReference: payment.reference,
        checkoutRequestId: payment.checkoutRequestId,
        updatedAt: new Date(),
      })
      .where(and(eq(payheroDeposits.id, requestId), eq(payheroDeposits.status, "pending")))
      .returning();
    res.status(201).json(CreatePayheroDepositResponse.parse(statusResponse(initiated ?? deposit)));
  } catch (error) {
    if (!(error instanceof PayheroApiError)) throw error;
    if (error.outcomeUnknown) {
      res.status(201).json(CreatePayheroDepositResponse.parse(statusResponse(
        deposit,
        "PayHero's response was interrupted. Check your phone before retrying; your balance updates after payment is verified.",
      )));
      return;
    }
    await db.update(payheroDeposits)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(payheroDeposits.id, requestId), eq(payheroDeposits.status, "pending")));
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
    res.json(statusResponse(
      current,
      current.status === "pending" && !current.providerReference
        ? "The request has no PayHero receipt yet. Check your phone before retrying."
        : undefined,
    ));
  } catch (error) {
    if (!(error instanceof PayheroApiError)) throw error;
    res.status(error.statusCode).json({ error: error.message });
  }
});

router.post("/webhooks/payhero", async (req, res): Promise<void> => {
  const callback = req.body?.response && typeof req.body.response === "object"
    ? req.body.response
    : req.body;
  const externalReference = [
    callback?.external_reference,
    callback?.externalReference,
    callback?.ExternalReference,
    callback?.payment_reference,
  ]
    .find((value) => typeof value === "string" && value);
  const reference = typeof callback?.reference === "string"
    ? callback.reference
    : typeof callback?.Reference === "string" ? callback.Reference : null;
  const checkoutRequestId = typeof callback?.CheckoutRequestID === "string"
    ? callback.CheckoutRequestID
    : typeof callback?.checkoutRequestId === "string" ? callback.checkoutRequestId : null;
  if (
    (typeof externalReference !== "string" || !externalReference)
    && !reference
    && !checkoutRequestId
  ) {
    res.status(400).json({ error: "PayHero callback is missing a transaction reference." });
    return;
  }
  let deposit: typeof payheroDeposits.$inferSelect | undefined;
  if (typeof externalReference === "string") {
    [deposit] = await db.select().from(payheroDeposits).where(eq(payheroDeposits.id, externalReference));
  }
  if (!deposit && reference) {
    [deposit] = await db.select().from(payheroDeposits).where(eq(payheroDeposits.providerReference, reference));
  }
  if (!deposit && checkoutRequestId) {
    [deposit] = await db.select().from(payheroDeposits).where(eq(payheroDeposits.checkoutRequestId, checkoutRequestId));
  }
  if (!deposit) {
    res.status(404).json({ error: "Payment reference not found." });
    return;
  }
  if (typeof externalReference === "string" && externalReference !== deposit.id) {
    res.status(400).json({ error: "PayHero callback does not match the pending M-Pesa request." });
    return;
  }
  if (deposit.status !== "pending") {
    res.status(200).json({ received: true });
    return;
  }
  if (
    (typeof externalReference === "string" && externalReference !== deposit.id)
    || (reference && deposit.providerReference && reference !== deposit.providerReference)
    || (checkoutRequestId && deposit.checkoutRequestId && checkoutRequestId !== deposit.checkoutRequestId)
  ) {
    res.status(400).json({ error: "PayHero callback does not match the pending M-Pesa request." });
    return;
  }
  const callbackAmount = callback?.Amount ?? callback?.amount;
  if (callbackAmount !== undefined && callbackAmount !== null) {
    const amount = Number(callbackAmount);
    if (!Number.isFinite(amount) || Math.round(amount * 100) !== deposit.amountCents) {
      res.status(400).json({ error: "PayHero callback amount does not match the pending deposit." });
      return;
    }
  }
  try {
    let current = deposit;
    if (!current.providerReference || !current.checkoutRequestId) {
      if (!reference || !checkoutRequestId) {
        res.status(200).json({ received: true, pending: true });
        return;
      }
      const providerStatus = await getPayheroTransactionStatus(reference);
      if (
        providerStatus.paymentReference !== deposit.id
        || !matchesPayheroStkIdentity(providerStatus, {
          reference,
          externalReference: deposit.id,
          checkoutRequestId,
        })
        || (providerStatus.amount !== null && Math.round(providerStatus.amount * 100) !== deposit.amountCents)
      ) {
        res.status(400).json({ error: "PayHero status does not match the pending M-Pesa request." });
        return;
      }
      const [tagged] = await db.update(payheroDeposits)
        .set({
          providerReference: reference,
          checkoutRequestId,
          updatedAt: new Date(),
        })
        .where(and(
          eq(payheroDeposits.id, deposit.id),
          eq(payheroDeposits.status, "pending"),
        ))
        .returning();
      current = tagged ?? deposit;
    }
    await refreshDeposit(current);
    res.status(200).json({ received: true });
  } catch (error) {
    if (!(error instanceof PayheroApiError)) throw error;
    res.status(503).json({ error: "Payment status could not be verified with PayHero." });
  }
});

export default router;
