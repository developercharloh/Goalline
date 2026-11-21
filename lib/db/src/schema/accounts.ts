import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const accounts = pgTable("probet_accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  username: text("username").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  country: text("country").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<"user" | "admin">().notNull().default("user"),
  legacyClerkId: text("legacy_clerk_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("probet_accounts_email_unique").on(table.email),
  uniqueIndex("probet_accounts_username_unique").on(table.username),
  uniqueIndex("probet_accounts_legacy_clerk_unique").on(table.legacyClerkId),
]);

export const accountSessions = pgTable("probet_account_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AccountRow = typeof accounts.$inferSelect;
export type AccountSessionRow = typeof accountSessions.$inferSelect;
