import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import {
  accounts,
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
import { accountOwner } from "./account-session.js";

export class WalletLinkError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export function authenticatedUserId(req: Request): string | null {
  if (req.probetAccountId) return req.probetAccountId;
  return process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY
    ? getAuth(req).userId : null;
}

function linkedOwner(linkedUserId: string | null | undefined): string | null {
  if (!linkedUserId) return null;
  return linkedUserId.startsWith("account:") || linkedUserId.startsWith("user:")
    ? linkedUserId
    : `user:${linkedUserId}`;
}

export async function identity(req: Request, res: Response) {
  const owner = accountOwner(req);
  let guest = req.signedCookies?.probet_demo;
  if (!owner && (typeof guest !== "string" || !/^[a-f0-9-]{36}$/.test(guest))) {
    guest = randomUUID();
    res.cookie("probet_demo", guest, { signed: true, httpOnly: true, sameSite: "lax", secure: req.secure || req.get("x-forwarded-proto") === "https", maxAge: 30 * 86400_000, path: "/" });
  }
  const guestOwner = `demo:${guest}`;
  const [guestWallet] = await db.select({ linkedUserId: wallets.linkedUserId })
    .from(wallets).where(eq(wallets.owner, guestOwner));
  const linkedAccountOwner = linkedOwner(guestWallet?.linkedUserId);
  const effectiveOwner = owner ?? linkedAccountOwner ?? guestOwner;
  const isDemo = !owner && !linkedAccountOwner;

  await db.insert(wallets).values({
    owner: effectiveOwner,
    balanceCents: 0,
    isDemo,
  }).onConflictDoNothing();
  if (!owner) {
    await db.insert(wallets).values({
      owner: guestOwner,
      balanceCents: 0,
      isDemo: true,
    }).onConflictDoNothing();
  }
  return { owner: effectiveOwner, isDemo };
}

async function mergeWalletOwners(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sourceOwner: string,
  targetOwner: string,
  linkedIdentity: string,
) {
  if (sourceOwner === targetOwner) {
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.owner, targetOwner));
    return { linked: false, balanceCents: wallet?.balanceCents ?? 0 };
  }
  await tx.insert(wallets).values({ owner: targetOwner, balanceCents: 0, isDemo: false }).onConflictDoNothing();

  // Deposit callbacks and reviews lock their request before locking wallets.
  await tx.execute(sql`SELECT id FROM probet_payhero_deposits WHERE owner = ${sourceOwner} FOR UPDATE`);
  await tx.execute(sql`SELECT id FROM probet_manual_deposits WHERE owner = ${sourceOwner} FOR UPDATE`);
  await tx.execute(sql`SELECT owner FROM probet_wallets WHERE owner IN (${sourceOwner}, ${targetOwner}) ORDER BY owner FOR UPDATE`);

  const [sourceWallet] = await tx.select().from(wallets).where(eq(wallets.owner, sourceOwner));
  const [targetWallet] = await tx.select().from(wallets).where(eq(wallets.owner, targetOwner));
  if (!sourceWallet) return { linked: false, balanceCents: targetWallet?.balanceCents ?? 0 };
  if (sourceWallet.linkedUserId) {
    if (linkedOwner(sourceWallet.linkedUserId) !== targetOwner) {
      throw new WalletLinkError("This wallet is already linked to another account.", 409);
    }
    return { linked: true, balanceCents: targetWallet?.balanceCents ?? 0 };
  }
  if (!targetWallet) throw new Error("The destination wallet was not created.");

  // Retain one ownership row if both accounts already purchased the same package.
  await tx.delete(purchases).where(and(
    eq(purchases.owner, sourceOwner),
    sql`${purchases.packageId} IN (
      SELECT package_id FROM probet_purchases WHERE owner = ${targetOwner}
    )`,
  ));

  await tx.update(wallets)
    .set({ balanceCents: targetWallet.balanceCents + sourceWallet.balanceCents })
    .where(eq(wallets.owner, targetOwner));

  await tx.update(transactions).set({ owner: targetOwner }).where(eq(transactions.owner, sourceOwner));
  await tx.update(purchases).set({ owner: targetOwner }).where(eq(purchases.owner, sourceOwner));
  await tx.update(communityMessages).set({ owner: targetOwner }).where(eq(communityMessages.owner, sourceOwner));
  await tx.update(cashiaDeposits).set({ owner: targetOwner }).where(eq(cashiaDeposits.owner, sourceOwner));
  await tx.update(manualDeposits).set({ owner: targetOwner }).where(eq(manualDeposits.owner, sourceOwner));
  await tx.update(depositCredits).set({ owner: targetOwner }).where(eq(depositCredits.owner, sourceOwner));
  await tx.update(payheroDeposits).set({ owner: targetOwner }).where(eq(payheroDeposits.owner, sourceOwner));
  await tx.update(payheroDepositCredits).set({ owner: targetOwner }).where(eq(payheroDepositCredits.owner, sourceOwner));

  await tx.update(wallets)
    .set({ balanceCents: 0, linkedUserId: linkedIdentity })
    .where(eq(wallets.owner, sourceOwner));
  return { linked: true, balanceCents: targetWallet.balanceCents + sourceWallet.balanceCents };
}

/**
 * Moves a browser wallet into an authenticated account exactly once. The old
 * raw Clerk ID format is retained for existing guest-wallet aliases.
 */
export async function linkGuestWallet(guestId: string, userId: string) {
  if (!/^[a-f0-9-]{36}$/.test(guestId)) {
    throw new WalletLinkError("This browser does not have a valid guest wallet.", 400);
  }
  const guestOwner = `demo:${guestId}`;
  const targetOwner = `user:${userId}`;
  return db.transaction((tx) => mergeWalletOwners(tx, guestOwner, targetOwner, userId));
}

export async function linkGuestWalletToAccount(guestId: string, owner: string) {
  if (!/^[a-f0-9-]{36}$/.test(guestId) || !/^account:[a-f0-9-]{36}$/.test(owner)) {
    throw new WalletLinkError("This browser does not have a valid account wallet.", 400);
  }
  return db.transaction((tx) => mergeWalletOwners(tx, `demo:${guestId}`, owner, owner));
}

export async function linkLegacyAccountData(clerkUserId: string, accountId: string) {
  const sourceOwner = `user:${clerkUserId}`;
  const targetOwner = `account:${accountId}`;
  return db.transaction(async (tx) => {
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account) throw new WalletLinkError("The new account was not found.", 404);
    if (account.legacyClerkId && account.legacyClerkId !== clerkUserId) {
      throw new WalletLinkError("This account is already linked to a different previous account.", 409);
    }
    const [otherAccount] = await tx.select({ id: accounts.id }).from(accounts)
      .where(eq(accounts.legacyClerkId, clerkUserId)).limit(1);
    if (otherAccount && otherAccount.id !== accountId) {
      throw new WalletLinkError("That previous account is already linked to another profile.", 409);
    }
    const result = await mergeWalletOwners(tx, sourceOwner, targetOwner, targetOwner);
    await tx.update(accounts)
      .set({ legacyClerkId: clerkUserId, updatedAt: new Date() })
      .where(eq(accounts.id, accountId));
    return result;
  });
}
