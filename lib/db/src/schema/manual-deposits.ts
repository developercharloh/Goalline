import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { wallets } from "./wallets";

export const manualDeposits = pgTable("probet_manual_deposits", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull().references(() => wallets.owner),
  amountCents: integer("amount_cents").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  mpesaMessage: text("mpesa_message").notNull(),
  receiptCode: text("receipt_code").notNull().unique(),
  tillNumber: text("till_number").notNull(),
  businessName: text("business_name").notNull(),
  status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
  note: text("note"),
  reviewedBy: text("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});
export const insertManualDepositSchema = createInsertSchema(manualDeposits);
export type ManualDepositRow = typeof manualDeposits.$inferSelect;

// Real deposit ledger, separate from the existing preview wallet.
// One credit per request, committed atomically with the approval.
export const depositCredits = pgTable("probet_deposit_credits", {
  depositId: text("deposit_id").primaryKey().references(() => manualDeposits.id),
  owner: text("owner").notNull().references(() => wallets.owner),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertDepositCreditSchema = createInsertSchema(depositCredits);
export type DepositCreditRow = typeof depositCredits.$inferSelect;
