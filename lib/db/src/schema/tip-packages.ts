import { pgTable, text, integer, boolean, timestamp, uniqueIndex, date, time, numeric } from "drizzle-orm/pg-core";

export const tipPackages = pgTable("probet_tip_packages", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priceCents: integer("price_cents").notNull(),
  status: text("status").$type<"draft" | "published" | "archived">().notNull().default("draft"),
  isSample: boolean("is_sample").notNull().default(false),
  totalOdds: numeric("total_odds", { precision: 12, scale: 2, mode: "number" }).notNull().default(1),
  stakeLevel: text("stake_level").$type<"medium" | "high">().notNull().default("medium"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tipEntries = pgTable("probet_tip_entries", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => tipPackages.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  match: text("match"),
  prediction: text("prediction"),
  league: text("league"),
  matchDate: date("match_date", { mode: "string" }),
  kickoff: time("kickoff"),
  homeTeam: text("home_team"),
  awayTeam: text("away_team"),
  selection: text("selection"),
  odds: numeric("odds", { precision: 8, scale: 2, mode: "number" }),
}, (table) => [
  uniqueIndex("probet_tip_entries_package_position_unique").on(table.packageId, table.position),
]);

export type TipPackageRow = typeof tipPackages.$inferSelect;
export type TipEntryRow = typeof tipEntries.$inferSelect;
