import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const chatMessages = pgTable("probet_chat_messages", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertChatMessageSchema = createInsertSchema(chatMessages);
export type ChatRow = typeof chatMessages.$inferSelect;
