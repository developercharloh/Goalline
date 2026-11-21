import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, sql } from "drizzle-orm";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { accounts, accountSessions, db } from "@workspace/db";
import {
  BootstrapAdminBody,
  BootstrapAdminResponse,
  GetAuthMeResponse,
  LinkLegacyAccountResponse,
  SignInBody,
  SignInResponse,
  SignOutResponse,
  SignUpBody,
  SignUpResponse,
  UpdateAccountProfileBody,
  UpdateAccountProfileResponse,
} from "@workspace/api-zod";
import { rateLimit } from "express-rate-limit";
import {
  clearSessionCookie,
  createSessionRecord,
  hashPassword,
  legacyClerkUserId,
  publicAccount,
  setSessionCookie,
  verifyPassword,
} from "../lib/account-session.js";
import { linkLegacyAccountData } from "../lib/wallet-identity.js";

const router: IRouter = Router();
const signUpLimit = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, validate: false });
const signInLimit = rateLimit({ windowMs: 15 * 60_000, limit: 12, standardHeaders: true, legacyHeaders: false, validate: false });
const bootstrapLimit = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, validate: false });

function requireAccount(req: Request, res: Response, next: NextFunction): void {
  if (!req.probetAccountId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  next();
}

function requireCustomSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.probetSessionHash || !req.probetAccountId) {
    res.status(401).json({ error: "Sign in with your email and password to continue." });
    return;
  }
  next();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeProfile(value: { username: string; fullName: string; phone: string; country: string }) {
  return {
    username: normalizeUsername(value.username),
    fullName: value.fullName.trim(),
    phone: value.phone.trim(),
    country: value.country.trim(),
  };
}

function emailValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

async function insertSession(accountId: string, req: Request, res: Response): Promise<void> {
  const { token, session } = createSessionRecord(accountId);
  await db.insert(accountSessions).values(session);
  setSessionCookie(req, res, token);
}

router.post("/auth/signup", signUpLimit, async (req, res): Promise<void> => {
  const parsed = SignUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the sign-up details and try again." });
    return;
  }
  const input = parsed.data;
  const email = normalizeEmail(input.email);
  if (!emailValid(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  if (input.password !== input.confirmPassword) {
    res.status(400).json({ error: "Passwords do not match." });
    return;
  }
  const profile = normalizeProfile(input);
  if (!profile.fullName || !profile.phone || !profile.country) {
    res.status(400).json({ error: "Complete each profile field." });
    return;
  }

  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();
  try {
    const { account, token } = await db.transaction(async (tx) => {
      const [created] = await tx.insert(accounts).values({
        id,
        email,
        passwordHash,
        ...profile,
      }).returning();
      const { token, session } = createSessionRecord(created.id);
      await tx.insert(accountSessions).values(session);
      return { account: created, token };
    });
    setSessionCookie(req, res, token);
    res.status(201).json(SignUpResponse.parse({ account: publicAccount(account) }));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "That email address or username is already in use." });
      return;
    }
    throw error;
  }
});

router.post("/auth/signin", signInLimit, async (req, res): Promise<void> => {
  const parsed = SignInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your email and password." });
    return;
  }
  const [account] = await db.select().from(accounts).where(eq(accounts.email, normalizeEmail(parsed.data.email))).limit(1);
  if (!account) {
    await hashPassword(parsed.data.password);
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  if (!(await verifyPassword(parsed.data.password, account.passwordHash))) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  await insertSession(account.id, req, res);
  res.json(SignInResponse.parse({ account: publicAccount(account) }));
});

router.post("/auth/signout", async (req, res): Promise<void> => {
  if (req.probetSessionHash) {
    await db.delete(accountSessions).where(eq(accountSessions.tokenHash, req.probetSessionHash));
  }
  clearSessionCookie(res);
  res.json(SignOutResponse.parse({ success: true }));
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const [account] = req.probetAccountId
    ? await db.select().from(accounts).where(eq(accounts.id, req.probetAccountId)).limit(1)
    : [];
  res.json(GetAuthMeResponse.parse({
    account: account ? publicAccount(account) : null,
    legacySession: Boolean(legacyClerkUserId(req)),
  }));
});

router.patch("/auth/profile", requireAccount, async (req, res): Promise<void> => {
  const parsed = UpdateAccountProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid username, full name, phone number and country." });
    return;
  }
  const profile = normalizeProfile(parsed.data);
  try {
    const [account] = await db.update(accounts)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(accounts.id, req.probetAccountId!))
      .returning();
    if (!account) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    res.json(UpdateAccountProfileResponse.parse({ account: publicAccount(account) }));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "That username is already in use." });
      return;
    }
    throw error;
  }
});

router.post("/auth/link-legacy", requireCustomSession, async (req, res): Promise<void> => {
  const clerkId = legacyClerkUserId(req);
  if (!clerkId) {
    res.status(401).json({ error: "Sign in to your previous account first, then link it here." });
    return;
  }
  const [account] = await db.select().from(accounts).where(eq(accounts.id, req.probetAccountId!)).limit(1);
  if (!account) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  if (account.legacyClerkId && account.legacyClerkId !== clerkId) {
    res.status(409).json({ error: "This account is already linked to a different previous account." });
    return;
  }
  try {
    await linkLegacyAccountData(clerkId, account.id);
    res.json(LinkLegacyAccountResponse.parse({
      linked: true,
      message: "Your previous wallet, purchases, deposits and community messages are now linked.",
    }));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "That previous account is already linked to another profile." });
      return;
    }
    throw error;
  }
});

function constantTimeTokenMatch(submitted: string, configured: string): boolean {
  const candidate = Buffer.from(submitted);
  const expected = Buffer.from(configured);
  return candidate.length === expected.length && candidate.length > 0 && timingSafeEqual(candidate, expected);
}

router.post("/auth/admin/bootstrap", bootstrapLimit, requireCustomSession, async (req, res): Promise<void> => {
  const input = BootstrapAdminBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter the one-time admin setup code." });
    return;
  }
  const configuredToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!configuredToken) {
    res.status(503).json({ error: "Admin setup is not enabled yet. Configure the private setup secret first." });
    return;
  }
  if (!constantTimeTokenMatch(input.data.token, configuredToken)) {
    res.status(403).json({ error: "The setup code is not valid." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('probet_admin_bootstrap'))`);
    const [existingAdmin] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.role, "admin")).limit(1);
    if (existingAdmin) return null;
    const [account] = await tx.update(accounts)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(accounts.id, req.probetAccountId!))
      .returning();
    return account ?? null;
  });
  if (!result) {
    res.status(409).json({ error: "An admin account has already been set up." });
    return;
  }
  res.json(BootstrapAdminResponse.parse({ account: publicAccount(result) }));
});

export default router;
