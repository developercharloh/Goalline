import { Router, type IRouter } from "express";
import { desc, eq, ilike, or } from "drizzle-orm";
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
  CreateAdminTipPackageBody,
  CreateAdminTipPackageResponse,
} from "@workspace/api-zod";
import { randomUUID } from "node:crypto";
import { publicAccount } from "../lib/account-session.js";
import { ensureTipCatalogSeed } from "../lib/tip-catalog.js";
import { requireAdmin } from "../lib/admin-access.js";

const router: IRouter = Router();

function normalizePick(pick: { match: string; prediction: string; league: string }) {
  return {
    match: pick.match.trim(),
    prediction: pick.prediction.trim(),
    league: pick.league.trim(),
  };
}

function adminPackageResponse(
  pkg: typeof tipPackages.$inferSelect,
  tips: Array<{ match: string; prediction: string; league: string }>,
) {
  return {
    id: pkg.id,
    title: pkg.title,
    description: pkg.description,
    price: pkg.priceCents / 100,
    status: pkg.status,
    isSample: pkg.isSample,
    matchCount: tips.length,
    tips,
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString(),
  };
}

async function packagesWithEntries() {
  const packages = await db.select().from(tipPackages).orderBy(desc(tipPackages.updatedAt));
  const entries = packages.length
    ? await db.select().from(tipEntries).orderBy(tipEntries.position)
    : [];
  return packages.map((pkg) => adminPackageResponse(
    pkg,
    entries.filter((entry) => entry.packageId === pkg.id),
  ));
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

router.post("/admin/tip-packages", async (req, res): Promise<void> => {
  const input = CreateAdminTipPackageBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Check the package details and at least one match pick." });
    return;
  }
  const now = new Date();
  const [pkg] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(tipPackages).values({
      id: randomUUID(),
      title: input.data.title.trim(),
      description: input.data.description.trim(),
      priceCents: Math.round(input.data.price * 100),
      status: input.data.status,
      isSample: input.data.isSample,
      createdAt: now,
      updatedAt: now,
    }).returning();
    await tx.insert(tipEntries).values(input.data.tips.map((tip, position) => ({
      id: randomUUID(),
      packageId: created.id,
      position,
      ...normalizePick(tip),
    })));
    return [created];
  });
  const response = adminPackageResponse(pkg, input.data.tips.map(normalizePick));
  res.status(201).json(CreateAdminTipPackageResponse.parse(response));
});

router.patch("/admin/tip-packages/:id", async (req, res): Promise<void> => {
  const params = UpdateAdminTipPackageParams.safeParse(req.params);
  const input = UpdateAdminTipPackageBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Check the package details and at least one match pick." });
    return;
  }
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [pkg] = await tx.update(tipPackages).set({
      title: input.data.title.trim(),
      description: input.data.description.trim(),
      priceCents: Math.round(input.data.price * 100),
      status: input.data.status,
      isSample: input.data.isSample,
      updatedAt: now,
    }).where(eq(tipPackages.id, params.data.id)).returning();
    if (!pkg) return null;
    await tx.delete(tipEntries).where(eq(tipEntries.packageId, pkg.id));
    await tx.insert(tipEntries).values(input.data.tips.map((tip, position) => ({
      id: randomUUID(),
      packageId: pkg.id,
      position,
      ...normalizePick(tip),
    })));
    return pkg;
  });
  if (!result) {
    res.status(404).json({ error: "Tip package not found." });
    return;
  }
  const response = adminPackageResponse(result, input.data.tips.map(normalizePick));
  res.json(UpdateAdminTipPackageResponse.parse(response));
});

export default router;
