import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const communityMessages = pgTable(
  "probet_community_messages",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    displayName: text("display_name").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdAtIdx: index("probet_community_messages_created_at_idx").on(table.createdAt),
  }),
);

export const insertCommunityMessageSchema = createInsertSchema(communityMessages);
export type CommunityMessage = typeof communityMessages.$inferSelect;
