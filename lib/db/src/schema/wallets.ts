import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const wallets = pgTable("probet_wallets", {
  owner: text("owner").primaryKey(),
  balanceCents: integer("balance_cents").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  linkedUserId: text("linked_user_id"),
});
export const insertWalletSchema = createInsertSchema(wallets);
export type WalletRow = typeof wallets.$inferSelect;
