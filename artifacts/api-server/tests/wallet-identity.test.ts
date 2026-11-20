import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  cashiaDeposits,
  communityMessages,
  db,
  depositCredits,
  manualDeposits,
  payheroDepositCredits,
  payheroDeposits,
  pool,
  purchases,
  transactions,
  wallets,
} from "@workspace/db";
import { linkGuestWallet, WalletLinkError } from "../src/lib/wallet-identity.js";
import { decideManualDeposit } from "../src/lib/manual-deposits.js";

if (process.env.NODE_ENV !== "test" || process.env.WALLET_LINK_DB_TEST !== "true") {
  throw new Error("Set NODE_ENV=test WALLET_LINK_DB_TEST=true to run these development-only tests.");
}

const guestId = randomUUID();
const accountId = randomUUID();
const guestOwner = `demo:${guestId}`;
const accountOwner = `user:${accountId}`;
const ids = Array.from({ length: 8 }, () => randomUUID());

after(async () => {
  await db.delete(depositCredits).where(inArray(depositCredits.depositId, [ids[3]]));
  await db.delete(payheroDepositCredits).where(inArray(payheroDepositCredits.depositId, [ids[5]]));
  await db.delete(manualDeposits).where(inArray(manualDeposits.id, [ids[3]]));
  await db.delete(payheroDeposits).where(inArray(payheroDeposits.id, [ids[5]]));
  await db.delete(cashiaDeposits).where(inArray(cashiaDeposits.id, [ids[4]]));
  await db.delete(transactions).where(inArray(transactions.id, [ids[0]]));
  await db.delete(purchases).where(eq(purchases.packageId, "wallet-link-guest-only"));
  await db.delete(purchases).where(eq(purchases.packageId, "wallet-link-shared"));
  await db.delete(communityMessages).where(inArray(communityMessages.id, [ids[1]]));
  await db.delete(wallets).where(inArray(wallets.owner, [guestOwner, accountOwner]));
  await pool.end();
});

test("wallet link merges funds and moves history and purchases once", async () => {
  await db.insert(wallets).values([
    { owner: guestOwner, balanceCents: 2400, isDemo: true },
    { owner: accountOwner, balanceCents: 1300, isDemo: false },
  ]);
  await db.insert(transactions).values({
    id: ids[0], owner: guestOwner, title: "Guest purchase", type: "purchase", amountCents: -500,
  });
  await db.insert(communityMessages).values({
    id: ids[1], owner: guestOwner, displayName: "Guest", content: "Hello",
  });
  await db.insert(purchases).values([
    { id: ids[6], owner: guestOwner, packageId: "wallet-link-shared" },
    { id: ids[7], owner: guestOwner, packageId: "wallet-link-guest-only" },
  ]);
  await db.insert(purchases).values({ id: randomUUID(), owner: accountOwner, packageId: "wallet-link-shared" });
  await db.insert(manualDeposits).values({
    id: ids[3], owner: guestOwner, amountCents: 1000,
    firstName: "Test", lastName: "Guest", mpesaMessage: "Test receipt",
    receiptCode: randomUUID().replaceAll("-", "").slice(0, 10),
    tillNumber: "000000", businessName: "Test Merchant",
  });
  await db.insert(cashiaDeposits).values({ id: ids[4], owner: guestOwner, amountCents: 500 });
  await db.insert(payheroDeposits).values({
    id: ids[5], owner: guestOwner, amountCents: 700, phoneNumber: "254700000000",
  });
  await db.insert(payheroDepositCredits).values({
    depositId: ids[5], owner: guestOwner, amountCents: 700,
  });

  const [first] = await Promise.all([
    linkGuestWallet(guestId, accountId),
    decideManualDeposit(ids[3], randomUUID(), {
      decision: "approved",
      note: "Verified against the merchant statement.",
      verified: true,
    }),
  ]);
  assert.equal(first.linked, true);
  const retries = await Promise.all([
    linkGuestWallet(guestId, accountId),
    linkGuestWallet(guestId, accountId),
  ]);
  assert.ok(retries.every((result) => result.linked && result.balanceCents === 4700));

  const [guest] = await db.select().from(wallets).where(eq(wallets.owner, guestOwner));
  const [account] = await db.select().from(wallets).where(eq(wallets.owner, accountOwner));
  assert.equal(guest.balanceCents, 0);
  assert.equal(guest.linkedUserId, accountId);
  assert.equal(account.balanceCents, 4700);

  assert.equal((await db.select().from(transactions).where(eq(transactions.owner, accountOwner))).length, 1);
  assert.equal((await db.select().from(communityMessages).where(eq(communityMessages.owner, accountOwner))).length, 1);
  const ownedPackages = await db.select().from(purchases).where(eq(purchases.owner, accountOwner));
  assert.deepEqual(ownedPackages.map((purchase) => purchase.packageId).sort(), [
    "wallet-link-guest-only", "wallet-link-shared",
  ]);
  assert.equal((await db.select().from(manualDeposits).where(eq(manualDeposits.owner, accountOwner))).length, 1);
  assert.equal((await db.select().from(depositCredits).where(eq(depositCredits.owner, accountOwner))).length, 1);
  assert.equal((await db.select().from(cashiaDeposits).where(eq(cashiaDeposits.owner, accountOwner))).length, 1);
  assert.equal((await db.select().from(payheroDeposits).where(eq(payheroDeposits.owner, accountOwner))).length, 1);
  assert.equal((await db.select().from(payheroDepositCredits).where(eq(payheroDepositCredits.owner, accountOwner))).length, 1);
});

test("a browser wallet linked to another account cannot be transferred again", async () => {
  await assert.rejects(
    linkGuestWallet(guestId, randomUUID()),
    (error: unknown) => error instanceof WalletLinkError && error.statusCode === 409,
  );
});
