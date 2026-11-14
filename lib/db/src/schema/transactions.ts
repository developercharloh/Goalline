import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { wallets } from "./wallets";

export const transactions = pgTable("probet_transactions", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull().references(() => wallets.owner),
  title: text("title").notNull(),
  amountCents: integer("amount_cents").notNull(),
  type: text("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertTransactionSchema = createInsertSchema(transactions);
export type TransactionRow = typeof transactions.$inferSelect;
