import { Router, type IRouter } from "express";
import { desc, eq, ilike, inArray, or } from "drizzle-orm";
import { accounts, db, tipEntries, tipPackages } from "@workspace/db";
import {
  GetAdminTipPackagesResponse,
  GetAdminUsersQueryParams,
  GetAdminUsersResponse,
  UpdateAdminTipPackageBody,
  UpdateAdminTipPackageParams,
  UpdateAdminTipPackageResponse,
  UpdateAdminUserBody,
  UpdateAdminUserParams,
  UpdateAdminUserResponse,
} from "@workspace/api-zod";
import { randomUUID } from "node:crypto";
import { publicAccount } from "../lib/account-session.js";
import { ensureTipCatalogSeed, weeklyTipPackageIds } from "../lib/tip-catalog.js";
import { requireAdmin } from "../lib/admin-access.js";

const router: IRouter = Router();

function normalizeMatch(match: { matchDate: string; kickoff: string; homeTeam: string; awayTeam: string; selection: string; odds: number }) {
  return {
    matchDate: match.matchDate,
    kickoff: match.kickoff.slice(0, 5),
    homeTeam: match.homeTeam.trim(),
    awayTeam: match.awayTeam.trim(),
    selection: match.selection.trim(),
    odds: match.odds,
  };
}

function isValidMatchDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function matchFromEntry(entry: typeof tipEntries.$inferSelect) {
  if (!entry.matchDate || !entry.kickoff || !entry.homeTeam || !entry.awayTeam || !entry.selection || entry.odds == null) return null;
  return {
    matchDate: entry.matchDate,
    kickoff: entry.kickoff.slice(0, 5),
    homeTeam: entry.homeTeam,
    awayTeam: entry.awayTeam,
    selection: entry.selection,
    odds: entry.odds,
  };
}

function adminPackageResponse(
  pkg: typeof tipPackages.$inferSelect,
  matches: Array<{ matchDate: string; kickoff: string; homeTeam: string; awayTeam: string; selection: string; odds: number }>,
) {
  return {
    id: pkg.id,
    title: pkg.title,
    description: pkg.description,
    price: pkg.priceCents / 100,
    status: pkg.status,
    isSample: pkg.isSample,
    matchCount: matches.length,
    totalOdds: pkg.totalOdds,
    stakeLevel: pkg.stakeLevel,
    matches,
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString(),
  };
}

async function packagesWithEntries() {
  const packages = await db.select().from(tipPackages).where(inArray(tipPackages.id, weeklyTipPackageIds));
  const entries = packages.length
    ? await db.select().from(tipEntries).where(inArray(tipEntries.packageId, weeklyTipPackageIds)).orderBy(tipEntries.position)
    : [];
  const byId = new Map(packages.map((pkg) => [pkg.id, pkg]));
  return weeklyTipPackageIds.flatMap((id) => {
    const pkg = byId.get(id);
    if (!pkg) return [];
    const matches = entries.filter((entry) => entry.packageId === pkg.id)
      .map(matchFromEntry)
      .filter((match): match is NonNullable<typeof match> => match !== null);
    return [adminPackageResponse(pkg, matches)];
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "23505";
}

router.use("/admin", requireAdmin);

router.get("/admin/users", async (req, res): Promise<void> => {
  const query = GetAdminUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Search must be 80 characters or fewer." });
    return;
  }
  const search = (query.data.q ?? "").trim().replace(/[\\%_]/g, "\\$&");
  const filter = search
    ? or(
      ilike(accounts.email, `%${search}%`),
      ilike(accounts.username, `%${search}%`),
      ilike(accounts.fullName, `%${search}%`),
      ilike(accounts.phone, `%${search}%`),
    )
    : undefined;
  const rows = await db.select().from(accounts)
    .where(filter)
    .orderBy(desc(accounts.createdAt))
    .limit(100);
  res.json(GetAdminUsersResponse.parse(rows.map((account) => ({
    ...publicAccount(account),
    createdAt: account.createdAt.toISOString(),
  }))));
});

router.patch("/admin/users/:id", async (req, res): Promise<void> => {
  const params = UpdateAdminUserParams.safeParse(req.params);
  const input = UpdateAdminUserBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Enter valid profile details." });
    return;
  }
  try {
    const [account] = await db.update(accounts).set({
      username: input.data.username.trim().toLowerCase(),
      fullName: input.data.fullName.trim(),
      phone: input.data.phone.trim(),
      country: input.data.country.trim(),
      updatedAt: new Date(),
    }).where(eq(accounts.id, params.data.id)).returning();
    if (!account) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    res.json(UpdateAdminUserResponse.parse({
      ...publicAccount(account),
      createdAt: account.createdAt.toISOString(),
    }));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "That username is already in use." });
      return;
    }
    throw error;
  }
});

router.get("/admin/tip-packages", async (_req, res): Promise<void> => {
  await ensureTipCatalogSeed();
  res.json(GetAdminTipPackagesResponse.parse(await packagesWithEntries()));
});

router.patch("/admin/tip-packages/:id", async (req, res): Promise<void> => {
  const params = UpdateAdminTipPackageParams.safeParse(req.params);
  const input = UpdateAdminTipPackageBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Enter total odds, a stake level, and at least one complete match." });
    return;
  }
  if (!weeklyTipPackageIds.includes(params.data.id)) {
    res.status(404).json({ error: "Only the three weekly VIP packages can be managed." });
    return;
  }
  if (input.data.matches.some((match) => !isValidMatchDate(match.matchDate))) {
    res.status(400).json({ error: "Enter a real calendar date for each match." });
    return;
  }
  if (input.data.matches.some((match) => !match.homeTeam.trim() || !match.awayTeam.trim() || !match.selection.trim())) {
    res.status(400).json({ error: "Each match needs two teams and a prediction selection." });
    return;
  }
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [pkg] = await tx.update(tipPackages).set({
      totalOdds: input.data.totalOdds,
      stakeLevel: input.data.stakeLevel,
      updatedAt: now,
    }).where(eq(tipPackages.id, params.data.id)).returning();
    if (!pkg) return null;
    await tx.delete(tipEntries).where(eq(tipEntries.packageId, pkg.id));
    await tx.insert(tipEntries).values(input.data.matches.map((match, position) => ({
      id: randomUUID(),
      packageId: pkg.id,
      position,
      ...normalizeMatch(match),
    })));
    return pkg;
  });
  if (!result) {
    res.status(404).json({ error: "Tip package not found." });
    return;
  }
  const response = adminPackageResponse(result, input.data.matches.map(normalizeMatch));
  res.json(UpdateAdminTipPackageResponse.parse(response));
});

export default router;
