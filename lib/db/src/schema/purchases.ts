import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { wallets } from "./wallets";

export const purchases = pgTable("probet_purchases", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull().references(() => wallets.owner),
  packageId: text("package_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("probet_owner_package").on(table.owner, table.packageId)]);
export const insertPurchaseSchema = createInsertSchema(purchases);
export type PurchaseRow = typeof purchases.$inferSelect;
