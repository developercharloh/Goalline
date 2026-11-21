import assert from "node:assert/strict";
import { test } from "node:test";
import { requireAdmin } from "../src/lib/admin-access.ts";

function runGuard(context: { probetAccountId?: string; probetAccountRole?: "user" | "admin" }) {
  let statusCode = 200;
  let body: unknown;
  let nextCalled = false;
  const response = {
    status(code: number) {
      statusCode = code;
      return {
        json(value: unknown) {
          body = value;
        },
      };
    },
  };
  requireAdmin(context, response, () => { nextCalled = true; });
  return { statusCode, body, nextCalled };
}

test("admin middleware allows an authenticated administrator", () => {
  const result = runGuard({ probetAccountId: "account-id", probetAccountRole: "admin" });
  assert.equal(result.statusCode, 200);
  assert.equal(result.nextCalled, true);
});

test("admin middleware denies a regular signed-in account", () => {
  const result = runGuard({ probetAccountId: "account-id", probetAccountRole: "user" });
  assert.equal(result.statusCode, 403);
  assert.equal(result.nextCalled, false);
});

test("admin middleware rejects unsigned requests", () => {
  const result = runGuard({});
  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
});
