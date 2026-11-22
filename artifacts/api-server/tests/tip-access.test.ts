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

test("free access does not expire, and missing purchases grant no access", () => {
  const oldPurchase = { createdAt: new Date("2020-01-01T00:00:00.000Z") };
  const now = new Date("2026-11-01T12:00:00.000Z");
  assert.equal(hasActiveTipAccess(oldPurchase, 0, now), true);
  assert.equal(hasActiveTipAccess(null, 5000, now), false);
});
