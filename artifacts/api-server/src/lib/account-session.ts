import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { accountSessions, accounts, db } from "@workspace/db";
import { getAuth } from "@clerk/express";

const SESSION_COOKIE = "probet_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

declare global {
  namespace Express {
    interface Request {
      probetAccountId?: string;
      probetAccountRole?: "user" | "admin";
      probetSessionHash?: string;
    }
  }
}

export interface SessionRecord {
  accountId: string;
  tokenHash: string;
  expiresAt: Date;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionRecord(accountId: string): { token: string; session: SessionRecord } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  return {
    token,
    session: { accountId, tokenHash: hashSessionToken(token), expiresAt },
  };
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure || req.get("x-forwarded-proto") === "https",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY,
  }) as Buffer;
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltHex, hashHex, extra] = encoded.split("$");
  if (
    algorithm !== "scrypt" || extra !== undefined ||
    !/^\d+$/.test(n ?? "") || !/^\d+$/.test(r ?? "") ||
    !/^\d+$/.test(p ?? "") || !/^[a-f0-9]{32}$/.test(saltHex ?? "") ||
    !/^[a-f0-9]{128}$/.test(hashHex ?? "")
  ) return false;

  const N = Number(n), R = Number(r), P = Number(p);
  if (N < 16384 || N > 65536 || R !== 8 || P !== 1) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await deriveKey(password, Buffer.from(saltHex, "hex"), expected.length, {
    N,
    r: R,
    p: P,
    maxmem: SCRYPT_MAX_MEMORY,
  }) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function publicAccount(account: typeof accounts.$inferSelect) {
  return {
    id: account.id,
    email: account.email,
    username: account.username,
    fullName: account.fullName,
    phone: account.phone,
    country: account.country,
    role: account.role,
    legacyLinked: Boolean(account.legacyClerkId),
  };
}

export function legacyClerkUserId(req: Request): string | null {
  if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) return null;
  try {
    return getAuth(req).userId ?? null;
  } catch {
    return null;
  }
}

export function accountOwner(req: Request): string | null {
  if (req.probetAccountId) return `account:${req.probetAccountId}`;
  const clerkId = legacyClerkUserId(req);
  return clerkId ? `user:${clerkId}` : null;
}

export async function accountSessionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = req.signedCookies?.[SESSION_COOKIE];
    if (typeof token === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(token)) {
      const tokenHash = hashSessionToken(token);
      const [session] = await db.select({
        accountId: accountSessions.accountId,
        tokenHash: accountSessions.tokenHash,
        role: accounts.role,
      })
        .from(accountSessions)
        .innerJoin(accounts, eq(accountSessions.accountId, accounts.id))
        .where(and(
          eq(accountSessions.tokenHash, tokenHash),
          gt(accountSessions.expiresAt, new Date()),
        ))
        .limit(1);
      if (session) {
        req.probetAccountId = session.accountId;
        req.probetAccountRole = session.role;
        req.probetSessionHash = session.tokenHash;
      }
    }

    if (!req.probetAccountId) {
      const clerkId = legacyClerkUserId(req);
      if (clerkId) {
        const [linkedAccount] = await db.select({
          id: accounts.id,
          role: accounts.role,
        }).from(accounts).where(eq(accounts.legacyClerkId, clerkId)).limit(1);
        if (linkedAccount) {
          req.probetAccountId = linkedAccount.id;
          req.probetAccountRole = linkedAccount.role;
        }
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

export const accountSessionCookieName = SESSION_COOKIE;
