import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool, wallets, manualDeposits, depositCredits } from "@workspace/db";
import {
  manualDepositConfig, reviewerEmailAllowed, parseMpesaReceipt,
  submitManualDeposit, decideManualDeposit,
} from "../src/lib/manual-deposits.js";

// Run only against the development DB. No provider requests or real payments.
if (process.env.NODE_ENV !== "test" || process.env.MANUAL_DEPOSIT_DB_TEST !== "true") {
  throw new Error("Set NODE_ENV=test MANUAL_DEPOSIT_DB_TEST=true to run these development-only tests.");
}
const owners: string[] = [];
const oldConfig = {
  enabled: process.env.MANUAL_DEPOSITS_ENABLED,
  till: process.env.MPESA_TILL_NUMBER,
  name: process.env.MPESA_TILL_NAME,
  reviewers: process.env.MANUAL_DEPOSIT_REVIEWER_EMAILS,
};
const code = () => randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
const input = (receipt = code(), amount = 125.5) => ({
  firstName: " Test ", lastName: " Payer ", amount,
  mpesaMessage: `${receipt} Confirmed. Ksh${amount.toFixed(2)} paid to TEST MERCHANT. on 15/11/26. New M-PESA balance is Ksh0.00.`,
});
async function wallet() {
  const owner = `test:manual:${randomUUID()}`;
  owners.push(owner);
  await db.insert(wallets).values({ owner, balanceCents: 2500, isDemo: true });
  return owner;
}
function configure() {
  process.env.MANUAL_DEPOSITS_ENABLED = "true";
  process.env.MPESA_TILL_NUMBER = "000000";
  process.env.MPESA_TILL_NAME = "TEST MERCHANT";
  process.env.MANUAL_DEPOSIT_REVIEWER_EMAILS = "reviewer@example.invalid";
}
after(async () => {
  if (owners.length) {
    await db.delete(depositCredits).where(inArray(depositCredits.owner, owners));
    await db.delete(manualDeposits).where(inArray(manualDeposits.owner, owners));
    await db.delete(wallets).where(inArray(wallets.owner, owners));
  }
  for (const [key, value] of Object.entries({
    MANUAL_DEPOSITS_ENABLED: oldConfig.enabled, MPESA_TILL_NUMBER: oldConfig.till,
    MPESA_TILL_NAME: oldConfig.name, MANUAL_DEPOSIT_REVIEWER_EMAILS: oldConfig.reviewers,
  })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await pool.end();
});

test("Till and reviewer are required; configuration hides payment details until enabled", () => {
  delete process.env.MPESA_TILL_NUMBER;
  delete process.env.MANUAL_DEPOSITS_ENABLED;
  assert.equal(manualDepositConfig().enabled, false);
  assert.equal(manualDepositConfig().tillNumber, null);
  configure();
  delete process.env.MANUAL_DEPOSIT_REVIEWER_EMAILS;
  assert.equal(manualDepositConfig().enabled, false);
  configure();
  assert.equal(manualDepositConfig().enabled, true);
});
test("reviewer must have an allowlisted verified email", () => {
  configure();
  assert.equal(reviewerEmailAllowed([{ emailAddress: "Reviewer@Example.invalid", verification: { status: "verified" } }]), true);
  assert.equal(reviewerEmailAllowed([{ emailAddress: "reviewer@example.invalid", verification: { status: "unverified" } }]), false);
  assert.equal(reviewerEmailAllowed([{ emailAddress: "stranger@example.invalid", verification: { status: "verified" } }]), false);
  assert.equal(reviewerEmailAllowed([]), false);
});
test("parses and normalises receipt, checks amount; malformed/forged formats rejected", () => {
  assert.deepEqual(parseMpesaReceipt("abc123def4 Confirmed. Ksh1,250.50 paid to TEST.", 1250.5),
    { code: "ABC123DEF4", cents: 125050, text: "abc123def4 Confirmed. Ksh1,250.50 paid to TEST." });
  assert.throws(() => parseMpesaReceipt("ABC123DEF4 Confirmed. Ksh100.00 paid to TEST.", 500), /match/);
  assert.throws(() => parseMpesaReceipt("random text", 100), /complete/);
  assert.throws(() => parseMpesaReceipt("ABC123DEF4 Confirmed. Ksh100.00 received from TEST.", 100), /complete/);
  assert.throws(() => parseMpesaReceipt("ABC123DEF4 Confirmed. Ksh100.00 paid to TEST.", -100), /match/);
});
test("submission is pending, persists names, cannot credit or reuse receipt across wallets", async () => {
  configure();
  const owner = await wallet(), other = await wallet(), data = input();
  const row = await submitManualDeposit(owner, data);
  assert.equal(row.status, "pending");
  assert.equal(row.firstName, "Test");
  assert.equal(row.lastName, "Payer");
  assert.equal(row.reviewedAt, null);
  assert.deepEqual(await db.select().from(depositCredits).where(eq(depositCredits.owner, owner)), []);
  await assert.rejects(submitManualDeposit(other, data), /already been submitted/);
  await assert.rejects(submitManualDeposit(owner, { ...input(), firstName: " " }), /first and last/);
});
test("disabled configuration rejects submissions", async () => {
  const owner = await wallet();
  delete process.env.MANUAL_DEPOSITS_ENABLED;
  await assert.rejects(submitManualDeposit(owner, input()), /being configured/);
  configure();
});
test("approval needs verification, cannot be self-approved; rejection never credits", async () => {
  configure();
  const owner = await wallet();
  const row = await submitManualDeposit(owner, input());
  await assert.rejects(decideManualDeposit(row.id, "reviewer", { decision: "approved", note: "Checked", verified: false }), /Verify/);
  await assert.rejects(decideManualDeposit(row.id, "reviewer", { decision: "rejected", note: " ", verified: false }), /note/);
  await db.update(manualDeposits).set({ owner: owner }).where(eq(manualDeposits.id, row.id));
  const rejected = await decideManualDeposit(row.id, "reviewer", { decision: "rejected", note: "Receipt absent from merchant statement.", verified: false });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reviewedBy, "reviewer");
  assert.equal(rejected.note, "Receipt absent from merchant statement.");
  assert.deepEqual(await db.select().from(depositCredits).where(eq(depositCredits.owner, owner)), []);
  await assert.rejects(decideManualDeposit(row.id, "reviewer", { decision: "approved", note: "Checked", verified: true }), /already been reviewed/);
  const user = randomUUID();
  const selfOwner = `user:${user}`;
  owners.push(selfOwner);
  await db.insert(wallets).values({ owner: selfOwner, balanceCents: 0, isDemo: false });
  const self = await submitManualDeposit(selfOwner, input());
  await assert.rejects(decideManualDeposit(self.id, user, { decision: "approved", note: "Checked", verified: true }), /own deposit/);
});
test("concurrent approval retries credit exactly once; preview money is untouched", async () => {
  configure();
  const owner = await wallet(), row = await submitManualDeposit(owner, input());
  const approvals = await Promise.all(Array.from({ length: 5 }, () =>
    decideManualDeposit(row.id, "reviewer", { decision: "approved", note: "Verified in merchant statement.", verified: true })));
  assert.ok(approvals.every(result => result.status === "approved"));
  const credits = await db.select().from(depositCredits).where(eq(depositCredits.owner, owner));
  assert.equal(credits.length, 1);
  assert.equal(credits[0].amountCents, 12550);
  const [preview] = await db.select().from(wallets).where(eq(wallets.owner, owner));
  assert.equal(preview.balanceCents, 2500);
  assert.equal(preview.isDemo, true);
});
test("approval versus rejection race makes only one final decision", async () => {
  configure();
  const owner = await wallet(), row = await submitManualDeposit(owner, input());
  await Promise.allSettled([
    decideManualDeposit(row.id, "a", { decision: "approved", note: "Verified.", verified: true }),
    decideManualDeposit(row.id, "b", { decision: "rejected", note: "Not received.", verified: false }),
  ]);
  const [final] = await db.select().from(manualDeposits).where(eq(manualDeposits.id, row.id));
  const [credits] = await db.select({ count: sql<number>`count(*)::int` }).from(depositCredits).where(eq(depositCredits.owner, owner));
  assert.equal(credits.count, final.status === "approved" ? 1 : 0);
});
