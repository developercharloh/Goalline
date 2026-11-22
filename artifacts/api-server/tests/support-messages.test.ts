import assert from "node:assert/strict";
import { test } from "node:test";
import { SendSupportMessageBody } from "@workspace/api-zod";

test("support messages accept text within the 2,000-character limit", () => {
  assert.equal(SendSupportMessageBody.safeParse({ content: "Please help with my account." }).success, true);
  assert.equal(SendSupportMessageBody.safeParse({ content: "x".repeat(2000) }).success, true);
});

test("support messages reject empty and oversized content", () => {
  assert.equal(SendSupportMessageBody.safeParse({ content: "" }).success, false);
  assert.equal(SendSupportMessageBody.safeParse({ content: "x".repeat(2001) }).success, false);
});
