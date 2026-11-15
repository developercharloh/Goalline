import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { wallets } from "./wallets";

export const cashiaDeposits = pgTable("probet_cashia_deposits", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull().references(() => wallets.owner),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("KES"),
  status: text("status").notNull().default("pending"),
  sessionId: text("session_id"),
  checkoutUrl: text("checkout_url"),
  providerTransactionId: text("provider_transaction_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const insertCashiaDepositSchema = createInsertSchema(cashiaDeposits);
export type CashiaDepositRow = typeof cashiaDeposits.$inferSelect;
