import { randomBytes } from "node:crypto";

export const REFERRAL_BONUS_DIAMONDS = 10;
export const REFERRAL_BONUS_CENTS = REFERRAL_BONUS_DIAMONDS * 100;

export function createReferralCode(): string {
  return randomBytes(8).toString("hex").toUpperCase();
}
