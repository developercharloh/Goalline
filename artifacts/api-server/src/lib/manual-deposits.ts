import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, manualDeposits, depositCredits, wallets, type ManualDepositRow } from "@workspace/db";
import type { ManualDepositInput, ManualDepositReview } from "@workspace/api-zod";

export class ManualDepositError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function manualDepositConfig() {
  const till = process.env.MPESA_TILL_NUMBER?.trim() ?? "";
  const business = process.env.MPESA_TILL_NAME?.trim() ?? "";
  const enabled = process.env.MANUAL_DEPOSITS_ENABLED === "true" &&
    /^\d{4,10}$/.test(till) && business.length > 1 &&
    Boolean(process.env.MANUAL_DEPOSIT_REVIEWER_EMAILS?.trim()) &&
    Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);
  return {
    enabled,
    tillNumber: enabled ? till : null,
    businessName: enabled ? business : null,
    message: enabled
      ? "Pay using M-Pesa Buy Goods and Services, then submit your confirmation for manual review. Credit is added only after the payment is verified."
      : "The Till number and authorised reviewer are being configured. Do not send money yet. You can preview the form below.",
  };
}

export function reviewerEmailAllowed(emails: { emailAddress: string; verification: { status: string } | null }[]) {
  const allowed = (process.env.MANUAL_DEPOSIT_REVIEWER_EMAILS ?? "")
    .split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
  return emails.some(email => email.verification?.status === "verified" &&
    allowed.includes(email.emailAddress.toLowerCase()));
}

export function parseMpesaReceipt(message: string, amount: number) {
  const text = message.trim();
  const code = /^([A-Z0-9]{10})\s+Confirmed\b/i.exec(text)?.[1]?.toUpperCase();
  const payment = /\bKsh\.?\s*([\d,]+\.\d{2}|[\d,]+)\s+paid\s+to\b/i.exec(text);
  if (!code || !payment) {
    throw new ManualDepositError("Paste the complete M-Pesa payment confirmation, starting with its receipt code and including the amount paid.");
  }
  const cents = Math.round(amount * 100);
  const smsCents = Math.round(Number(payment[1].replaceAll(",", "")) * 100);
  if (!Number.isSafeInteger(cents) || cents < 100 || cents > 10000000 ||
      Math.abs(amount * 100 - cents) > 0.000001 || smsCents !== cents) {
    throw new ManualDepositError("The amount entered must match the amount paid in the M-Pesa confirmation (KSh 1 to 100,000).");
  }
  return { code, cents, text };
}

export function depositResponse(row: ManualDepositRow) {
  return {
    id: row.id, amount: row.amountCents / 100,
    firstName: row.firstName, lastName: row.lastName,
    mpesaMessage: row.mpesaMessage, receiptCode: row.receiptCode,
    tillNumber: row.tillNumber, businessName: row.businessName,
    status: row.status, note: row.note,
    createdAt: row.createdAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

export async function submitManualDeposit(owner: string, input: ManualDepositInput) {
  const config = manualDepositConfig();
  if (!config.enabled) throw new ManualDepositError(config.message, 503);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName || /[\r\n\t<>]/u.test(firstName + lastName)) {
    throw new ManualDepositError("Enter your first and last names as they appear on the payment.");
  }
  const receipt = parseMpesaReceipt(input.mpesaMessage, input.amount);
  // SMS is user-supplied evidence, never proof of settlement.
  // Global unique receipt prevents reuse across wallets and concurrent requests.
  const [row] = await db.insert(manualDeposits).values({
    id: randomUUID(), owner, firstName, lastName,
    amountCents: receipt.cents, receiptCode: receipt.code, mpesaMessage: receipt.text,
    tillNumber: config.tillNumber!, businessName: config.businessName!,
  }).onConflictDoNothing({ target: manualDeposits.receiptCode }).returning();
  if (!row) throw new ManualDepositError("This M-Pesa receipt has already been submitted. Check your deposit history or contact the reviewer.", 409);
  return row;
}

export async function listManualDeposits(owner?: string) {
  return db.select().from(manualDeposits)
    .where(owner ? eq(manualDeposits.owner, owner) : undefined)
    .orderBy(desc(manualDeposits.createdAt)).limit(200);
}

export async function decideManualDeposit(id: string, reviewerId: string, input: ManualDepositReview) {
  const note = input.note.trim();
  if (note.length < 3) throw new ManualDepositError("Add a review note of at least three characters.");
  if (input.decision === "approved" && !input.verified) {
    throw new ManualDepositError("Verify the receipt, payer, amount and receiving Till against your Safaricom merchant statement before approving.");
  }
  return db.transaction(async tx => {
    const [existing] = await tx.select().from(manualDeposits).where(eq(manualDeposits.id, id)).for("update");
    if (!existing) throw new ManualDepositError("Deposit not found.", 404);
    if (existing.owner === `user:${reviewerId}`) {
      throw new ManualDepositError("You cannot review your own deposit.", 403);
    }
    if (existing.status !== "pending") {
      if (existing.status === input.decision) return existing; // Safe repeated click/retry.
      throw new ManualDepositError("This deposit has already been reviewed. Decisions cannot be overwritten.", 409);
    }
    const [row] = await tx.update(manualDeposits).set({
      status: input.decision, note, reviewedBy: reviewerId, reviewedAt: new Date(),
    }).where(and(eq(manualDeposits.id, id), eq(manualDeposits.status, "pending"))).returning();
    if (input.decision === "approved") {
      const [credit] = await tx.insert(depositCredits).values({
        depositId: row.id, owner: row.owner, amountCents: row.amountCents,
      }).onConflictDoNothing().returning({ depositId: depositCredits.depositId });
      if (credit) {
        const [wallet] = await tx.update(wallets)
          .set({ balanceCents: sql`${wallets.balanceCents} + ${row.amountCents}` })
          .where(eq(wallets.owner, row.owner))
          .returning({ owner: wallets.owner });
        if (!wallet) throw new Error("Wallet not found for approved M-Pesa deposit.");
      }
    }
    return row;
  });
}
