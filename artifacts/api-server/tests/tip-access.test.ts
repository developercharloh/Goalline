import assert from "node:assert/strict";
import test from "node:test";
import { hasActiveTipAccess, PAID_TIP_ACCESS_DURATION_MS, tipAccessExpiresAt } from "../src/lib/tip-access.ts";

test("paid tip access expires exactly seven days after purchase", () => {
  const purchasedAt = new Date("2026-11-01T12:00:00.000Z");
  const expiresAt = tipAccessExpiresAt(purchasedAt);
  assert.equal(expiresAt.getTime() - purchasedAt.getTime(), PAID_TIP_ACCESS_DURATION_MS);
});

test("paid tip access is active until the expiry instant, then expires", () => {
  const purchasedAt = new Date("2026-11-01T12:00:00.000Z");
  const expiresAt = tipAccessExpiresAt(purchasedAt);
  assert.equal(hasActiveTipAccess({ createdAt: purchasedAt }, 5000, new Date(expiresAt.getTime() - 1)), true);
  assert.equal(hasActiveTipAccess({ createdAt: purchasedAt }, 5000, expiresAt), false);
});

test("daily and monthly VIP access use their own expiry periods", () => {
  const purchasedAt = new Date("2026-11-01T12:00:00.000Z");
  const dailyExpiry = tipAccessExpiresAt(purchasedAt, "daily-vip");
  const monthlyExpiry = tipAccessExpiresAt(purchasedAt, "monthly-vip");
  assert.equal(dailyExpiry.getTime() - purchasedAt.getTime(), 24 * 60 * 60 * 1000);
  assert.equal(monthlyExpiry.getTime() - purchasedAt.getTime(), 30 * 24 * 60 * 60 * 1000);
  assert.equal(
    hasActiveTipAccess({ createdAt: purchasedAt, packageId: "daily-vip" }, 4000, dailyExpiry),
    false,
  );
});

test("free access does not expire, and missing purchases grant no access", () => {
  const oldPurchase = { createdAt: new Date("2020-01-01T00:00:00.000Z") };
  const now = new Date("2026-11-01T12:00:00.000Z");
  assert.equal(hasActiveTipAccess(oldPurchase, 0, now), true);
  assert.equal(hasActiveTipAccess(null, 5000, now), false);
});
