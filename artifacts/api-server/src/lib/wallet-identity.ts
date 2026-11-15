import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { db, wallets } from "@workspace/db";

export async function identity(req: Request, res: Response) {
  const userId = process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY
    ? getAuth(req).userId : null;
  let guest = req.signedCookies?.probet_demo;
  if (!userId && (typeof guest !== "string" || !/^[a-f0-9-]{36}$/.test(guest))) {
    guest = randomUUID();
    res.cookie("probet_demo", guest, { signed: true, httpOnly: true, sameSite: "lax", secure: req.secure || req.get("x-forwarded-proto") === "https", maxAge: 30 * 86400_000, path: "/" });
  }
  const owner = userId ? `user:${userId}` : `demo:${guest}`;
  const isDemo = !userId;
  await db.insert(wallets).values({ owner, balanceCents: 0, isDemo }).onConflictDoNothing();
  return { owner, isDemo };
}
