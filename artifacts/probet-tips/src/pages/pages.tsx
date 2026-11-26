import { useState, type ReactNode } from "react";
import { Link, Redirect, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWallet, useGetTransactions, useGetTips, usePurchaseTips,
} from "@workspace/api-client-react";
import { Check, Wallet, Gem, ShieldCheck, Crown } from "lucide-react";
import { AppShell, ErrorCard, PageHeader, Sk } from "@/components/app-shell";
import { Logo } from "@/components/brand";
import { TipCard } from "@/components/tip-card";
import { TopUpDialog } from "@/components/topup-dialog";
import { errMsg, fmtDate, invalidateMoney, money } from "@/lib/probet";

export function WalletPage({ accountLinkContent }: { accountLinkContent?: ReactNode } = {}) {
  const w = useGetWallet({ query: { refetchInterval: 15000 } });
  const history = useGetTransactions();
  const [open, setOpen] = useState(false);
  const guest = w.data?.isDemo === true;
  return (
    <AppShell>
      <PageHeader title="My Wallet" subtitle="Manage your wallet balance and M-Pesa deposits." />
      {w.isLoading ? <Sk className="h-56" /> : w.error || !w.data ? <ErrorCard message={errMsg(w.error)} onRetry={() => w.refetch()} /> : (
        <div className="glass rounded-3xl p-6 md:p-8 text-center relative overflow-hidden rise">
          <div className="absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full bg-[hsl(143_50%_35%/.24)] blur-3xl" />
          <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-primary/30 bg-gradient-to-br from-[hsl(143_42%_28%)] to-[hsl(218_34%_14%)]"><Wallet className="h-8 w-8 text-gold" /></div>
          <div className="relative font-display text-5xl font-extrabold mt-4" data-testid="text-wallet-balance">{money(w.data.balance, w.data.currency)}</div>
          <div className="relative text-muted-foreground mt-1">Wallet balance</div>
          <div className="relative text-xs text-muted-foreground mt-2" data-testid="text-total-deposited">Total deposited: {money(w.data.depositedBalance ?? 0, w.data.currency)}</div>
          <button type="button" onClick={() => setOpen(true)} className="btn-green relative mt-6 w-full max-w-sm rounded-xl py-3 font-bold" data-testid="button-topup-wallet">Deposit with M-Pesa</button>
          <p className="relative mt-2 text-xs text-muted-foreground">Premium packages can be purchased with your wallet balance.</p>
          <div className="relative mt-4 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><ShieldCheck className="h-4 w-4" />M-Pesa payments are confirmed automatically</span>
          </div>
        </div>
      )}
      {guest && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-[hsl(43_96%_56%/.4)] bg-[hsl(43_96%_56%/.07)] p-4 text-sm" role="note" data-testid="status-guest-wallet">
          <ShieldCheck className="h-5 w-5 shrink-0 text-gold" />
          <div>
            <p><b>This wallet is linked to this browser.</b> <span className="text-muted-foreground">Link an account to keep your balance, history, and purchases if you clear browser data or switch devices.</span></p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/sign-up?returnTo=%2Fwallet%3Flink%3D1" className="btn-blue rounded-lg px-4 py-2 text-xs font-bold" data-testid="link-wallet-signup">Create account and save wallet</Link>
              <Link href="/sign-in?returnTo=%2Fwallet%3Flink%3D1" className="rounded-lg border border-border px-4 py-2 text-xs font-bold hover:bg-secondary" data-testid="link-wallet-signin">Sign in to save wallet</Link>
            </div>
          </div>
        </div>
      )}
      {accountLinkContent}
      <section className="glass mt-6 rounded-3xl p-5 md:p-6" aria-labelledby="wallet-activity-title" data-testid="section-wallet-activity">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 id="wallet-activity-title" className="font-display text-xl font-extrabold">Wallet activity</h2>
            <p className="mt-1 text-sm text-muted-foreground">Deposits and purchases stay with your account.</p>
          </div>
        </div>
        {history.isLoading ? <Sk className="h-20" />
          : history.error ? <ErrorCard message={errMsg(history.error)} onRetry={() => history.refetch()} />
            : !history.data?.length ? <p className="rounded-xl bg-background/40 p-4 text-sm text-muted-foreground" data-testid="status-empty-wallet-activity">No wallet activity yet.</p>
              : <ul className="divide-y divide-border/70" data-testid="list-wallet-activity">
                {history.data.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(item.createdAt)}</p>
                    </div>
                    <span className={`shrink-0 text-sm font-bold ${item.type === "topup" ? "text-win" : "text-foreground"}`}>
                      {item.amount === 0 ? "" : item.amount > 0 ? "+" : "−"}{money(Math.abs(item.amount))}
                    </span>
                  </li>
                ))}
              </ul>}
      </section>
      <TopUpDialog open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}

export function TipsPage() {
  const t = useGetTips({
    query: {
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
    },
  });
  const owned = (t.data ?? []).filter((p) => p.purchased);
  const avail = (t.data ?? []).filter((p) => p.availableForPurchase && !p.purchased);
  return (
    <AppShell>
      <PageHeader title="VIP Packages" subtitle="Three clear plans. Match picks stay locked until you choose your access." />
      {t.isLoading ? <div className="grid md:grid-cols-2 gap-4"><Sk className="h-56" /><Sk className="h-56" /></div>
        : t.error ? <ErrorCard message={errMsg(t.error)} onRetry={() => t.refetch()} /> : (
          <div className="space-y-8">
            <div className="flex items-start gap-3 rounded-2xl border border-gold/25 bg-gold/5 px-4 py-3.5" role="note" data-testid="text-tips-disclaimer">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">A considered pick, never a guarantee.</strong> Football outcomes are uncertain. Use predictions as information, choose a stake you can afford, and never treat odds as promised returns.</p>
            </div>
            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Your access</p><h2 className="font-display text-xl font-extrabold">My Picks</h2></div>
                <span className="text-xs text-muted-foreground">{owned.length} unlocked</span>
              </div>
              {owned.length ? <div className="grid md:grid-cols-2 gap-4">{owned.map((p) => <TipCard key={p.id} pkg={p} />)}</div> : (
                <div className="glass rounded-2xl p-8 text-center" data-testid="status-empty-picks">
                  <Gem className="h-10 w-10 mx-auto text-primary" />
                  <p className="font-bold mt-2">No picks unlocked yet</p>
                  <p className="text-sm text-muted-foreground">Purchase a package below to reveal its tips.</p>
                </div>
              )}
            </section>
            {avail.length > 0 && (
              <section>
                <div className="mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">Choose your window</p>
                  <h2 className="font-display text-xl font-extrabold">Available VIP access</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Prices and access periods are shown up front in Diamonds and Kenyan shillings.</p>
                </div>
                <div className="grid md:grid-cols-2 gap-4">{avail.map((p) => <TipCard key={p.id} pkg={p} />)}</div>
              </section>
            )}
          </div>
        )}
    </AppShell>
  );
}

export function PurchasePage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const tips = useGetTips({ query: { refetchOnMount: "always" } });
  const w = useGetWallet();
  const purchase = usePurchaseTips();
  const pkg = tips.data?.find((p) => p.id === id);
  const previousAccessExpired = Boolean(pkg?.accessExpiresAt && Date.parse(pkg.accessExpiresAt) <= Date.now());
  const bal = w.data?.balance ?? 0;
  const after = pkg ? bal - pkg.price : bal;
  const short = !!pkg && after < 0;
  const noMatches = !!pkg && pkg.matchCount === 0;
  const [topup, setTopup] = useState(false);

  function confirm() {
    if (!pkg) return;
    purchase.mutate({ data: { packageId: pkg.id } }, {
      onSuccess: (r) => { invalidateMoney(qc); setLocation(`/success?pkg=${encodeURIComponent(r.packageId)}`); },
    });
  }

  return (
    <AppShell>
      <PageHeader title="Confirm Purchase" back="/tips" />
      {tips.isLoading || w.isLoading ? <Sk className="h-72 max-w-lg" /> : tips.error || w.error ? <ErrorCard message={errMsg(tips.error || w.error)} onRetry={() => { tips.refetch(); w.refetch(); }} />
        : !pkg ? <ErrorCard message="This tip package could not be found." /> : !pkg.availableForPurchase && !pkg.purchased ? <ErrorCard message="This package is no longer available. Choose one of the current VIP plans." /> : (
          <div className="glass rounded-3xl p-6 max-w-lg rise">
            <div className="flex items-center gap-4">
              <Logo className="h-16 w-16" />
              <div><h2 className="font-display text-xl font-extrabold" data-testid="text-purchase-title">{pkg.title}</h2><p className="text-sm text-muted-foreground">{pkg.durationDays} days of access</p></div>
            </div>
            {pkg.purchased ? (
              <div className="mt-6 text-center"><p className="font-bold text-win">You already own this package.</p><Link href="/tips" className="btn-blue inline-block mt-4 rounded-xl px-6 py-2.5 font-bold">View My Tips</Link></div>
            ) : (
              <>
                {previousAccessExpired && <p className="mt-4 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm font-semibold text-loss" role="status" data-testid="status-renewal-required">Your {pkg.durationDays}-day access expired. Purchase again to continue viewing these tips.</p>}
                <dl className="mt-6 rounded-2xl bg-background/55 border border-border p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><dt>Package price</dt><dd className="inline-flex items-center gap-1 font-bold text-gold" data-testid="text-ticket-price"><Gem className="h-4 w-4" aria-hidden="true" />{pkg.priceDiamonds} Diamonds</dd></div>
                  <div className="flex justify-between"><dt>Price in Kenyan shillings</dt><dd className="font-semibold">{money(pkg.price)}</dd></div>
                  <div className="flex justify-between"><dt>Your Balance</dt><dd className="font-bold">{money(bal)}</dd></div>
                  <div className="flex justify-between border-t border-border pt-2"><dt>After Purchase</dt><dd className={`font-extrabold ${short ? "text-loss" : "text-win"}`} data-testid="text-after-balance">{money(after)}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">Your access remains active for {pkg.durationDays} days from purchase. Your account stays signed in after it expires.</p>
                {purchase.error && <p className="mt-3 text-sm text-loss" data-testid="text-purchase-error">{errMsg(purchase.error)}</p>}
                {short ? (
                  <button type="button" onClick={() => setTopup(true)} className="btn-green w-full mt-5 rounded-xl py-3 font-bold" data-testid="button-insufficient-topup">Insufficient balance — Top Up</button>
                ) : noMatches ? (
                  <button type="button" disabled className="w-full mt-5 rounded-xl border border-border py-3 font-bold text-muted-foreground" data-testid="button-no-match-details">Match details coming soon</button>
                ) : (
                  <button type="button" disabled={purchase.isPending} onClick={confirm} className="btn-blue w-full mt-5 rounded-xl py-3 font-bold disabled:opacity-60" data-testid="button-confirm-purchase">
                    {purchase.isPending ? "Processing..." : "Confirm Purchase"}
                  </button>
                )}
                <Link href="/tips" className="block text-center mt-3 text-sm text-primary font-semibold" data-testid="link-cancel-purchase">Cancel</Link>
              </>
            )}
          </div>
        )}
      <TopUpDialog open={topup} onOpenChange={setTopup} />
    </AppShell>
  );
}

export function SuccessPage() {
  const tips = useGetTips({ query: { refetchOnMount: "always" } });
  const packageId = new URLSearchParams(window.location.search).get("pkg");
  const purchasedPackage = tips.data?.find(pkg => pkg.id === packageId);
  if (tips.isLoading) return <AppShell><Sk className="h-72 max-w-lg" /></AppShell>;
  if (tips.error) return <AppShell><ErrorCard message={errMsg(tips.error)} onRetry={() => tips.refetch()} /></AppShell>;
  if (!packageId || !purchasedPackage?.purchased) return <Redirect to="/tips" />;
  return (
    <AppShell>
      <div className="min-h-[70dvh] grid place-items-center">
        <div className="glass rounded-3xl p-10 text-center max-w-md w-full relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 18 }).map((_, i) => (
              <span key={i} className="absolute h-1.5 w-1.5 rounded-full pop" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, background: i % 2 ? "hsl(43 96% 56%)" : "hsl(217 100% 60%)", animationDelay: `${200 + i * 40}ms` }} />
            ))}
          </div>
          <div className="relative mx-auto grid h-20 w-20 place-items-center rounded-full border-4 border-[hsl(142_72%_50%)] pop"><Check className="h-10 w-10 text-win" strokeWidth={3} /></div>
          <h1 className="relative font-display text-3xl font-extrabold mt-5" data-testid="text-success">Purchase Successful!</h1>
          <p className="relative text-muted-foreground mt-1">
            {purchasedPackage.accessExpiresAt
              ? `Your ${purchasedPackage.title} access is available for ${purchasedPackage.durationDays} days, until ${new Date(purchasedPackage.accessExpiresAt).toLocaleString()}.`
              : "Your package is now available in My Picks."}
          </p>
          <Link href="/tips" className="relative btn-blue block mt-6 rounded-xl py-3 font-bold" data-testid="link-view-my-tips">View My Tips</Link>
          <Link href="/dashboard" className="relative block mt-3 text-sm text-primary font-semibold" data-testid="link-back-home">Back to Home</Link>
        </div>
      </div>
    </AppShell>
  );
}

