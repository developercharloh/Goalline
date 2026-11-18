import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { wallets } from "./wallets";

export const payheroDeposits = pgTable("probet_payhero_deposits", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull().references(() => wallets.owner),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("KES"),
  phoneNumber: text("phone_number").notNull(),
  status: text("status").$type<"pending" | "credited" | "failed">().notNull().default("pending"),
  providerReference: text("provider_reference"),
  checkoutRequestId: text("checkout_request_id"),
  receiptNumber: text("receipt_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const insertPayheroDepositSchema = createInsertSchema(payheroDeposits);
export type PayheroDepositRow = typeof payheroDeposits.$inferSelect;

export const payheroDepositCredits = pgTable("probet_payhero_deposit_credits", {
  depositId: text("deposit_id").primaryKey().references(() => payheroDeposits.id),
  owner: text("owner").notNull().references(() => wallets.owner),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertPayheroDepositCreditSchema = createInsertSchema(payheroDepositCredits);
export type PayheroDepositCreditRow = typeof payheroDepositCredits.$inferSelect;
