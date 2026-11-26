import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { accounts, db, supportMessages, tipEntries, tipPackages } from "@workspace/db";
import {
  ConfigureAdminFixturesBody,
  ConfigureAdminFixturesResponse,
  UpdateAdminTipEntryResultBody,
  UpdateAdminTipEntryResultParams,
  UpdateAdminTipEntryResultResponse,
  GetAdminTipPackagesResponse,
  GetAdminUsersQueryParams,
  GetAdminUsersResponse,
  UpdateAdminTipPackageBody,
  UpdateAdminTipPackageParams,
  UpdateAdminTipPackageResponse,
  UpdateAdminUserBody,
  UpdateAdminUserParams,
  UpdateAdminUserResponse,
  GetAdminSupportConversationsResponse,
  GetAdminSupportMessagesParams,
  GetAdminSupportMessagesResponse,
  SendAdminSupportMessageBody,
  SendAdminSupportMessageParams,
  SendAdminSupportMessageResponse,
} from "@workspace/api-zod";
import { randomUUID } from "node:crypto";
import { publicAccount } from "../lib/account-session.js";
import { ensureTipCatalogSeed, vipPackageMetadata, vipTipPackageIds } from "../lib/tip-catalog.js";
import { requireAdmin } from "../lib/admin-access.js";
import { configureUpcomingFixtures, FixtureProviderError } from "../lib/football-data.js";

const router: IRouter = Router();
const fixtureConfigureLimit = rateLimit({
  windowMs: 60_000,
  limit: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Please wait before configuring fixtures again." },
});

class MatchSetChangedError extends Error {}

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
    id: entry.id,
    matchDate: entry.matchDate,
    kickoff: entry.kickoff.slice(0, 5),
    homeTeam: entry.homeTeam,
    awayTeam: entry.awayTeam,
    selection: entry.selection,
    odds: entry.odds,
    result: entry.result,
  };
}

function adminPackageResponse(
  pkg: typeof tipPackages.$inferSelect,
  matches: Array<{ id: string; matchDate: string; kickoff: string; homeTeam: string; awayTeam: string; selection: string; odds: number; result: "pending" | "won" | "lost" }>,
) {
  return {
    id: pkg.id,
    title: pkg.title,
    description: pkg.description,
    price: pkg.priceCents / 100,
    priceDiamonds: Math.round(pkg.priceCents / 100),
    durationDays: vipPackageMetadata(pkg.id)?.durationDays ?? 7,
    bestValue: vipPackageMetadata(pkg.id)?.bestValue ?? false,
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
  const packages = await db.select().from(tipPackages).where(inArray(tipPackages.id, vipTipPackageIds));
  const entries = packages.length
    ? await db.select().from(tipEntries).where(inArray(tipEntries.packageId, vipTipPackageIds)).orderBy(tipEntries.position)
    : [];
  const byId = new Map(packages.map((pkg) => [pkg.id, pkg]));
  return vipTipPackageIds.flatMap((id) => {
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

router.get("/admin/support/conversations", async (_req, res): Promise<void> => {
  const rows = await db.selectDistinctOn([supportMessages.accountId], {
    accountId: supportMessages.accountId,
    username: accounts.username,
    fullName: accounts.fullName,
    email: accounts.email,
    lastMessage: supportMessages.content,
    lastMessageRole: supportMessages.senderRole,
    lastMessageAt: supportMessages.createdAt,
  })
    .from(supportMessages)
    .innerJoin(accounts, eq(supportMessages.accountId, accounts.id))
    .orderBy(supportMessages.accountId, desc(supportMessages.createdAt));
  const conversations = rows
    .map((row) => ({ ...row, lastMessageAt: row.lastMessageAt.toISOString() }))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  res.json(GetAdminSupportConversationsResponse.parse(conversations));
});

router.get("/admin/support/conversations/:accountId/messages", async (req, res): Promise<void> => {
  const params = GetAdminSupportMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Choose a valid support conversation." });
    return;
  }
  const rows = await db.select().from(supportMessages)
    .where(eq(supportMessages.accountId, params.data.accountId))
    .orderBy(desc(supportMessages.createdAt))
    .limit(300);
  res.json(GetAdminSupportMessagesResponse.parse(rows.reverse().map((message) => ({
    id: message.id,
    accountId: message.accountId,
    senderRole: message.senderRole,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  }))));
});

router.post("/admin/support/conversations/:accountId/messages", async (req, res): Promise<void> => {
  const params = SendAdminSupportMessageParams.safeParse(req.params);
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  const input = SendAdminSupportMessageBody.safeParse({ content });
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Write a support reply of up to 2,000 characters." });
    return;
  }
  const [account] = await db.select({ id: accounts.id }).from(accounts)
    .where(eq(accounts.id, params.data.accountId))
    .limit(1);
  if (!account) {
    res.status(404).json({ error: "Support conversation not found." });
    return;
  }
  const adminId = req.probetAccountId;
  if (!adminId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const [message] = await db.insert(supportMessages).values({
    id: randomUUID(),
    accountId: account.id,
    senderRole: "admin",
    content: input.data.content,
  }).returning();
  res.status(201).json(SendAdminSupportMessageResponse.parse({
    id: message.id,
    accountId: message.accountId,
    senderRole: message.senderRole,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  }));
});

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

router.post("/admin/fixtures/configure", fixtureConfigureLimit, async (req, res): Promise<void> => {
  const input = ConfigureAdminFixturesBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Choose a fixture look-ahead between 1 and 14 days." });
    return;
  }
  const token = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) {
    res.status(503).json({ error: "Fixture configuration needs a free Football-Data.org API token in FOOTBALL_DATA_API_TOKEN." });
    return;
  }
  try {
    res.json(ConfigureAdminFixturesResponse.parse(
      await configureUpcomingFixtures(token, input.data.lookaheadDays),
    ));
  } catch (error) {
    if (error instanceof FixtureProviderError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.patch("/admin/tip-packages/:id", async (req, res): Promise<void> => {
  const params = UpdateAdminTipPackageParams.safeParse(req.params);
  const input = UpdateAdminTipPackageBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Enter total odds, a stake level, and at least one complete match." });
    return;
  }
  if (!vipTipPackageIds.includes(params.data.id)) {
    res.status(404).json({ error: "Only the three VIP packages can be managed." });
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
  const requestedIds = input.data.matches.flatMap((match) => match.id ? [match.id] : []);
  if (new Set(requestedIds).size !== requestedIds.length) {
    res.status(400).json({ error: "A match cannot appear more than once in a package." });
    return;
  }
  const now = new Date();
  let updated: { pkg: typeof tipPackages.$inferSelect; matches: Array<NonNullable<ReturnType<typeof matchFromEntry>>> } | null;
  try {
    updated = await db.transaction(async (tx) => {
      const [pkg] = await tx.update(tipPackages).set({
        totalOdds: input.data.totalOdds,
        stakeLevel: input.data.stakeLevel,
        updatedAt: now,
      }).where(eq(tipPackages.id, params.data.id)).returning();
      if (!pkg) return null;

      const existing = await tx.select().from(tipEntries).where(eq(tipEntries.packageId, pkg.id));
      const existingById = new Map(existing.map((entry) => [entry.id, entry]));
      if (requestedIds.some((id) => !existingById.has(id))) {
        throw new MatchSetChangedError("The package contains a match that no longer exists. Reload and try again.");
      }

      // Move positions out of the active range first so reordered matches never
      // collide with the package-position unique index.
      for (const [index, entry] of existing.entries()) {
        await tx.update(tipEntries).set({ position: -index - 1 }).where(eq(tipEntries.id, entry.id));
      }

      const retainedIds = new Set(requestedIds);
      const removedIds = existing.filter((entry) => !retainedIds.has(entry.id)).map((entry) => entry.id);
      if (removedIds.length) {
        await tx.delete(tipEntries).where(inArray(tipEntries.id, removedIds));
      }

      for (const [position, match] of input.data.matches.entries()) {
        const fields = { position, ...normalizeMatch(match) };
        if (match.id) {
          await tx.update(tipEntries).set(fields).where(eq(tipEntries.id, match.id));
        } else {
          await tx.insert(tipEntries).values({
            id: randomUUID(),
            packageId: pkg.id,
            ...fields,
          });
        }
      }

      const rows = await tx.select().from(tipEntries).where(eq(tipEntries.packageId, pkg.id)).orderBy(tipEntries.position);
      return {
        pkg,
        matches: rows.map(matchFromEntry).filter((match): match is NonNullable<typeof match> => match !== null),
      };
    });
  } catch (error) {
    if (error instanceof MatchSetChangedError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
  if (!updated) {
    res.status(404).json({ error: "Tip package not found." });
    return;
  }
  const response = adminPackageResponse(updated.pkg, updated.matches);
  res.json(UpdateAdminTipPackageResponse.parse(response));
});

router.patch("/admin/tip-entries/:id/result", async (req, res): Promise<void> => {
  const params = UpdateAdminTipEntryResultParams.safeParse(req.params);
  const input = UpdateAdminTipEntryResultBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Choose a valid match result." });
    return;
  }
  const [entry] = await db.update(tipEntries).set({ result: input.data.result })
    .where(and(
      eq(tipEntries.id, params.data.id),
      inArray(tipEntries.packageId, vipTipPackageIds),
    ))
    .returning({ id: tipEntries.id, result: tipEntries.result });
  if (!entry) {
    res.status(404).json({ error: "Match not found." });
    return;
  }
  res.json(UpdateAdminTipEntryResultResponse.parse(entry));
});

export default router;
