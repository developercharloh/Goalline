import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, wallets, transactions, purchases, communityMessages, cashiaDeposits, depositCredits, payheroDepositCredits } from "@workspace/db";
import { GetDashboardResponse, GetWalletResponse, GetTransactionsResponse, GetTipsResponse, PurchaseTipsBody, PurchaseTipsResponse, SendChatBody, SendChatResponse, GetChatResponse } from "@workspace/api-zod";
import { rateLimit } from "express-rate-limit";
import { tipCatalog } from "../lib/tip-catalog.js";
import { CashiaApiError, cashiaStagingCheckoutEnabled, createCashiaStagingSession } from "../lib/cashia.js";
import { CreateCashiaDepositBody, CreateCashiaDepositResponse, GetCashiaDepositStatusParams, GetCashiaDepositStatusResponse } from "@workspace/api-zod";
import { identity } from "../lib/wallet-identity.js";
import manualDepositRouter from "./manual-deposits.js";
import { payheroEnabled } from "../lib/payhero.js";

const router: IRouter = Router();
router.use("/probet", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.use("/probet", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, validate: false }));
router.use("/probet", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const host = req.get("x-forwarded-host") || req.get("host");
    if (origin && new URL(origin).host !== host) {
      res.status(403).json({ error: "Cross-site requests are not allowed." }); return;
    }
  }
  next();
});

router.use(manualDepositRouter);

async function walletFor(owner: string) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.owner, owner));
  const [[credits], [payheroCredits]] = await Promise.all([
    db.select({ total: sql<string>`coalesce(sum(${depositCredits.amountCents}), 0)` }).from(depositCredits).where(eq(depositCredits.owner, owner)),
    db.select({ total: sql<string>`coalesce(sum(${payheroDepositCredits.amountCents}), 0)` }).from(payheroDepositCredits).where(eq(payheroDepositCredits.owner, owner)),
  ]);
  return {
    balance: wallet.balanceCents / 100,
    depositedBalance: (Number(credits.total) + Number(payheroCredits.total)) / 100,
    currency: "KES",
    isDemo: wallet.isDemo,
    paymentsEnabled: payheroEnabled(),
    provider: "Safaricom M-Pesa",
    stagingCheckoutEnabled: cashiaStagingCheckoutEnabled(),
  };
}
async function transactionsFor(owner: string, isDemo: boolean) {
  const rows = await db.select().from(transactions).where(eq(transactions.owner, owner)).orderBy(desc(transactions.createdAt));
  const [credits, payheroCredits] = await Promise.all([
    db.select().from(depositCredits).where(eq(depositCredits.owner, owner)),
    db.select().from(payheroDepositCredits).where(eq(payheroDepositCredits.owner, owner)),
  ]);
  return [
    ...rows.map(row => ({ id: row.id, title: row.title, amount: row.amountCents / 100, type: row.type, createdAt: row.createdAt.toISOString(), isDemo })),
    ...credits.map(row => ({ id: row.depositId, title: "M-Pesa deposit approved", amount: row.amountCents / 100, type: "topup" as const, createdAt: row.createdAt.toISOString(), isDemo: false })),
    ...payheroCredits.map(row => ({ id: row.depositId, title: "PayHero M-Pesa deposit", amount: row.amountCents / 100, type: "topup" as const, createdAt: row.createdAt.toISOString(), isDemo: false })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function tipsFor(owner: string) {
  const owned = await db.select().from(purchases).where(eq(purchases.owner, owner));
  return tipCatalog.map(pack => ({ ...pack, purchased: owned.some(row => row.packageId === pack.id), tips: owned.some(row => row.packageId === pack.id) ? pack.tips : [] }));
}
router.get("/probet/wallet", async (req, res): Promise<void> => {
  const { owner } = await identity(req, res);
  res.json(GetWalletResponse.parse(await walletFor(owner)));
});
router.get("/probet/transactions", async (req, res): Promise<void> => {
  const { owner, isDemo } = await identity(req, res);
  res.json(GetTransactionsResponse.parse(await transactionsFor(owner, isDemo)));
});
router.get("/probet/tips", async (req, res): Promise<void> => {
  const { owner } = await identity(req, res);
  res.json(GetTipsResponse.parse(await tipsFor(owner)));
});
router.get("/probet/dashboard", async (req, res): Promise<void> => {
  const { owner, isDemo } = await identity(req, res);
  const [wallet, packages] = await Promise.all([walletFor(owner), tipsFor(owner)]);
  res.json(GetDashboardResponse.parse({ wallet, packages, recentTransactions: [], purchasedCount: packages.filter(p => p.purchased).length }));
});
router.post("/probet/deposits", rateLimit({ windowMs: 60_000, limit: 3, validate: false }), async (req, res): Promise<void> => {
  const input = CreateCashiaDepositBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter a KES amount from 1 to 100,000 with at most two decimal places." });
    return;
  }
  if (!cashiaStagingCheckoutEnabled()) {
    res.status(503).json({ error: "Cashia deposits are not enabled. Test checkout needs working merchant API access and explicit test-mode activation; live settlement verification is still pending." });
    return;
  }
  const { owner } = await identity(req, res);
  const requestId = randomUUID();
  const host = req.get("host");
  if (!host || !/^[a-zA-Z0-9.:[\]-]+$/.test(host)) {
    res.status(400).json({ error: "Invalid callback host." });
    return;
  }
  const origin = `${req.get("x-forwarded-proto") === "https" || req.secure ? "https" : "http"}://${host}`;
  const callback = `${origin}/wallet?deposit=${requestId}`;
  await db.insert(cashiaDeposits).values({ id: requestId, owner, amountCents: Math.round(input.data.amount * 100) });
  try {
    const session = await createCashiaStagingSession({
      requestId,
      amount: input.data.amount,
      successRedirectUrl: callback,
      errorRedirectUrl: callback,
      webhookUrl: `${origin}/api/webhooks/cashia`,
    });
    await db.update(cashiaDeposits).set({ sessionId: session.sessionId, checkoutUrl: session.url, updatedAt: new Date() }).where(eq(cashiaDeposits.id, requestId));
    res.status(201).json(CreateCashiaDepositResponse.parse({ requestId, checkoutUrl: session.url, amount: session.amount, currency: "KES", isTest: true }));
  } catch (error) {
    await db.update(cashiaDeposits).set({ status: "failed", updatedAt: new Date() }).where(eq(cashiaDeposits.id, requestId));
    if (!(error instanceof CashiaApiError)) throw error;
    res.status(error.statusCode).json({ error: error.message });
  }
});
router.get("/probet/deposits/:requestId", async (req, res): Promise<void> => {
  const params = GetCashiaDepositStatusParams.safeParse(req.params);
  if (!params.success || !/^[a-f0-9-]{36}$/.test(params.data.requestId)) {
    res.status(400).json({ error: "Invalid deposit reference." });
    return;
  }
  const { owner } = await identity(req, res);
  const [deposit] = await db.select().from(cashiaDeposits).where(and(eq(cashiaDeposits.id, params.data.requestId), eq(cashiaDeposits.owner, owner)));
  if (!deposit) { res.status(404).json({ error: "Deposit not found for this wallet." }); return; }
  // A redirect or unsigned callback is never proof of settlement. Until Cashia
  // supplies its authenticated settlement contract, requests stay uncredited.
  res.json(GetCashiaDepositStatusResponse.parse({
    requestId: deposit.id,
    status: deposit.status,
    amount: deposit.amountCents / 100,
    currency: "KES",
    message: deposit.status === "failed"
      ? "Cashia checkout could not be created. No wallet credit was added."
      : "Test checkout is awaiting verified settlement. No funds have been added.",
    balance: null,
  }));
});
router.post("/webhooks/cashia", (_req, res): void => {
  // Fail explicitly: acknowledging an unverified notification would suppress
  // provider retries and could make an unpaid deposit appear settled.
  res.status(503).json({ error: "Cashia settlement verification is not configured. No funds were credited." });
});
router.post("/probet/purchases", async (req, res): Promise<void> => {
  const input = PurchaseTipsBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Select a valid tip package." }); return; }
  const pack = tipCatalog.find(p => p.id === input.data.packageId);
  if (!pack) { res.status(404).json({ error: "Tip package not found." }); return; }
  const { owner, isDemo } = await identity(req, res);
  if (!isDemo) { res.status(503).json({ error: "Real-money purchases are unavailable until Cashia and verified premium content are connected. Sample packages can only be purchased in guest demo mode." }); return; }
  const result = await db.transaction(async tx => {
    // Serializes simultaneous attempts against the same wallet.
    await tx.execute(sql`SELECT owner FROM probet_wallets WHERE owner = ${owner} FOR UPDATE`);
    const prior = await tx.select().from(purchases).where(and(eq(purchases.owner, owner), eq(purchases.packageId, pack.id)));
    if (!prior.length) {
      const updated = await tx.update(wallets).set({ balanceCents: sql`${wallets.balanceCents} - ${pack.price * 100}` }).where(and(eq(wallets.owner, owner), sql`${wallets.balanceCents} >= ${pack.price * 100}`)).returning();
      if (!updated.length) return null;
      await tx.insert(purchases).values({ id: randomUUID(), owner, packageId: pack.id });
      await tx.insert(transactions).values({ id: randomUUID(), owner, title: "Premium Tips Purchase", type: "purchase", amountCents: -pack.price * 100 });
    }
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.owner, owner));
    return wallet.balanceCents / 100;
  });
  if (result === null) { res.status(409).json({ error: "Insufficient wallet balance." }); return; }
  res.json(PurchaseTipsResponse.parse({ success: true, balance: result, packageId: pack.id, isDemo }));
});
router.get("/probet/chat", async (req, res): Promise<void> => {
  const { owner } = await identity(req, res);
  const rows = await db.select().from(communityMessages).orderBy(desc(communityMessages.createdAt)).limit(100);
  res.json(GetChatResponse.parse(rows.reverse().map(row => ({
    id: row.id,
    displayName: row.displayName,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    isMine: row.owner === owner,
  }))));
});
router.post("/probet/chat", rateLimit({ windowMs: 60_000, limit: 10, validate: false }), async (req, res): Promise<void> => {
  const input = SendChatBody.safeParse(req.body);
  if (!input.success || !input.data.content.trim() || !input.data.displayName.trim()) {
    res.status(400).json({ error: "Enter a display name and a message." });
    return;
  }
  const { owner } = await identity(req, res);
  const [message] = await db.insert(communityMessages).values({
    id: randomUUID(),
    owner,
    displayName: input.data.displayName.trim(),
    content: input.data.content.trim(),
  }).returning();
  res.status(201).json(SendChatResponse.parse({
    id: message.id,
    displayName: message.displayName,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    isMine: true,
  }));
});
export default router;
