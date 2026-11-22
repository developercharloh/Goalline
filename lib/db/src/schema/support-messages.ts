import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const supportMessages = pgTable("probet_support_messages", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  senderRole: text("sender_role").$type<"user" | "admin">().notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("probet_support_messages_account_created_idx").on(table.accountId, table.createdAt),
]);
