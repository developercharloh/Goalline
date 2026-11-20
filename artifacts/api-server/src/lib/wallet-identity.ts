import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import {
  cashiaDeposits,
  communityMessages,
  db,
  depositCredits,
  manualDeposits,
  payheroDepositCredits,
  payheroDeposits,
  purchases,
  transactions,
  wallets,
} from "@workspace/db";

export class WalletLinkError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export function authenticatedUserId(req: Request): string | null {
  return process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY
    ? getAuth(req).userId : null;
}

export async function identity(req: Request, res: Response) {
  const userId = authenticatedUserId(req);
  let guest = req.signedCookies?.probet_demo;
  if (!userId && (typeof guest !== "string" || !/^[a-f0-9-]{36}$/.test(guest))) {
    guest = randomUUID();
    res.cookie("probet_demo", guest, { signed: true, httpOnly: true, sameSite: "lax", secure: req.secure || req.get("x-forwarded-proto") === "https", maxAge: 30 * 86400_000, path: "/" });
  }
  const guestOwner = `demo:${guest}`;
  const owner = userId ? `user:${userId}` : guestOwner;
  const isDemo = !userId;
  if (userId) {
    await db.insert(wallets).values({ owner, balanceCents: 0, isDemo: false }).onConflictDoNothing();
  } else {
    await db.insert(wallets).values({ owner: guestOwner, balanceCents: 0, isDemo: true }).onConflictDoNothing();
  }
  const [guestWallet] = await db.select({ linkedUserId: wallets.linkedUserId })
    .from(wallets).where(eq(wallets.owner, guestOwner));
  const linkedOwner = guestWallet?.linkedUserId ? `user:${guestWallet.linkedUserId}` : null;
  if (!userId && linkedOwner) {
    await db.insert(wallets).values({ owner: linkedOwner, balanceCents: 0, isDemo: false }).onConflictDoNothing();
  }
  return { owner: userId ? owner : linkedOwner ?? owner, isDemo: userId ? false : !linkedOwner };
}

/**
 * Moves a browser guest wallet into the signed-in account exactly once.
 * The guest row is retained as an alias so the same browser keeps access
 * after sign-out; all financial records move with the balance atomically.
 */
export async function linkGuestWallet(guestId: string, userId: string) {
  if (!/^[a-f0-9-]{36}$/.test(guestId)) {
    throw new WalletLinkError("This browser does not have a valid guest wallet.", 400);
  }
  const guestOwner = `demo:${guestId}`;
  const accountOwner = `user:${userId}`;

  return db.transaction(async (tx) => {
    await tx.insert(wallets).values({ owner: accountOwner, balanceCents: 0, isDemo: false }).onConflictDoNothing();

    // Deposit review/confirmation paths lock their deposit row before a wallet.
    // Locking those rows first keeps the transfer in the same order.
    await tx.execute(sql`SELECT id FROM probet_payhero_deposits WHERE owner = ${guestOwner} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM probet_manual_deposits WHERE owner = ${guestOwner} FOR UPDATE`);
    await tx.execute(sql`SELECT owner FROM probet_wallets WHERE owner IN (${guestOwner}, ${accountOwner}) ORDER BY owner FOR UPDATE`);

    const [guestWallet] = await tx.select().from(wallets).where(eq(wallets.owner, guestOwner));
    const [accountWallet] = await tx.select().from(wallets).where(eq(wallets.owner, accountOwner));
    if (!guestWallet) return { linked: false, balanceCents: accountWallet?.balanceCents ?? 0 };
    if (guestWallet.linkedUserId) {
      if (guestWallet.linkedUserId !== userId) {
        throw new WalletLinkError("This browser wallet is already linked to another account.", 409);
      }
      return { linked: true, balanceCents: accountWallet?.balanceCents ?? 0 };
    }
    if (!accountWallet) throw new Error("Account wallet was not created.");

    // Keep already-owned packages and remove only duplicate ownership rows.
    await tx.delete(purchases).where(and(
      eq(purchases.owner, guestOwner),
      sql`${purchases.packageId} IN (
        SELECT package_id FROM probet_purchases WHERE owner = ${accountOwner}
      )`,
    ));

    await tx.update(wallets)
      .set({ balanceCents: accountWallet.balanceCents + guestWallet.balanceCents })
      .where(eq(wallets.owner, accountOwner));

    await tx.update(transactions).set({ owner: accountOwner }).where(eq(transactions.owner, guestOwner));
    await tx.update(purchases).set({ owner: accountOwner }).where(eq(purchases.owner, guestOwner));
    await tx.update(communityMessages).set({ owner: accountOwner }).where(eq(communityMessages.owner, guestOwner));
    await tx.update(cashiaDeposits).set({ owner: accountOwner }).where(eq(cashiaDeposits.owner, guestOwner));
    await tx.update(manualDeposits).set({ owner: accountOwner }).where(eq(manualDeposits.owner, guestOwner));
    await tx.update(depositCredits).set({ owner: accountOwner }).where(eq(depositCredits.owner, guestOwner));
    await tx.update(payheroDeposits).set({ owner: accountOwner }).where(eq(payheroDeposits.owner, guestOwner));
    await tx.update(payheroDepositCredits).set({ owner: accountOwner }).where(eq(payheroDepositCredits.owner, guestOwner));

    await tx.update(wallets)
      .set({ balanceCents: 0, linkedUserId: userId })
      .where(eq(wallets.owner, guestOwner));
    return { linked: true, balanceCents: accountWallet.balanceCents + guestWallet.balanceCents };
  });
}
