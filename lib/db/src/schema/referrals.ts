import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const referrals = pgTable("probet_referrals", {
  id: text("id").primaryKey(),
  referrerAccountId: text("referrer_account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  referredAccountId: text("referred_account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
}, (table) => [
  check("probet_referrals_not_self", sql`${table.referrerAccountId} <> ${table.referredAccountId}`),
  uniqueIndex("probet_referrals_referred_unique").on(table.referredAccountId),
  index("probet_referrals_referrer_created_idx").on(table.referrerAccountId, table.createdAt),
]);
