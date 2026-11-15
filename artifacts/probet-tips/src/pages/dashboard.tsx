import { useState } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { useGetDashboard } from "@workspace/api-client-react";
import { Bot, Gem, Wallet, ShieldCheck, ArrowUpRight, ArrowDownLeft, Info } from "lucide-react";
import { AppShell, ErrorCard, Sk } from "@/components/app-shell";
import { DemoBadge, Logo, Wordmark } from "@/components/brand";
import { TipCard } from "@/components/tip-card";
import { TopUpDialog } from "@/components/topup-dialog";
import { errMsg, money, fmtDate } from "@/lib/probet";

export function DashboardView({ guest = false, name }: { guest?: boolean; name?: string }) {
  const { data, isLoading, error, refetch } = useGetDashboard();
  const [topup, setTopup] = useState(false);
  const displayName = guest ? "Guest" : name || "Champion";
  const authAvailable = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

  return (
    <>
      {guest && (
        <section className="relative overflow-hidden glass rounded-3xl p-6 md:p-10 mb-6 rise">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[hsl(217_100%_50%/.25)] blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center gap-6">
            <Logo className="h-24 w-24 md:h-32 md:w-32" />
            <div className="flex-1">
              <Wordmark size="lg" tagline />
              <p className="mt-4 max-w-lg text-muted-foreground">Quick premium football picks, a top-up-only wallet and a ChatBase assistant. You are viewing a guest preview with a demo balance and sample matches.</p>
              {authAvailable ? (
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/sign-up" className="btn-blue rounded-xl px-6 py-3 font-bold" data-testid="link-hero-signup">Sign Up</Link>
                  <Link href="/sign-in" className="rounded-xl px-6 py-3 font-bold border border-[hsl(217_80%_50%/.5)] hover:bg-secondary transition-colors" data-testid="link-hero-signin">Login</Link>
                </div>
              ) : (
                <p className="mt-5 text-sm text-muted-foreground">Guest demo is available; account sign-in is not enabled on this preview.</p>
              )}
            </div>
            <div className="hidden lg:grid grid-cols-2 gap-2 text-sm">
              {[[Bot, "ChatBase", "AI Assistant"], [Gem, "Premium", "Tips Only"], [Wallet, "Secure", "Wallet"], [ShieldCheck, "Top Up Only", "No Withdrawal"]].map(([I, a, b], i) => {
                const Icon = I as typeof Bot;
                return (
                  <div key={i} className="glass rounded-xl px-3 py-2.5 flex items-center gap-2">
                    <Icon className="h-6 w-6 text-primary" /><div><div className="font-bold leading-tight">{a as string}</div><div className="text-xs text-muted-foreground">{b as string}</div></div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <div className="rise">
        <h2 className="font-display text-3xl font-extrabold" data-testid="text-greeting">Hello, {displayName}</h2>
        <p className="text-muted-foreground">Bet Smarter with ProBet Tips</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 mt-6"><Sk className="h-28" /><Sk className="h-56" /><Sk className="h-32" /></div>
      ) : error || !data ? (
        <div className="mt-6"><ErrorCard message={errMsg(error)} onRetry={() => refetch()} /></div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-6 mt-6">
          <div className="lg:col-span-3 space-y-6">
            <div className="glass rounded-2xl p-5 flex items-center gap-4 rise" style={{ animationDelay: "60ms" }}>
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(214_100%_60%)] to-[hsl(224_100%_40%)]"><Wallet className="h-7 w-7 text-[hsl(43_96%_70%)]" /></div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground flex items-center gap-2">{data.wallet.isDemo ? "Demo balance" : "Wallet Balance"}{data.wallet.isDemo && <DemoBadge />}</div>
                <div className="font-display text-3xl font-extrabold" data-testid="text-balance">{money(data.wallet.balance, data.wallet.currency)}</div>
              </div>
              <button type="button" onClick={() => setTopup(true)} className="btn-blue rounded-xl px-5 py-2.5 font-bold" data-testid="button-topup">Top Up</button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-xl font-extrabold">Premium Tips</h3>
                <Link href="/tips" className="text-sm text-primary font-semibold" data-testid="link-all-tips">View all</Link>
              </div>
              <div className="space-y-4">
                {data.packages.length === 0 ? <p className="glass rounded-2xl p-6 text-muted-foreground">No tip packages available right now.</p>
                  : data.packages.slice(0, 2).map((p) => <TipCard key={p.id} pkg={p} compact />)}
              </div>
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="h-4 w-4 shrink-0" />Sample matches are illustrative. ProBet Tips does not provide live stats or guaranteed outcomes.</p>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div>
              <h3 className="font-display text-xl font-extrabold mb-3">Today's Features</h3>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/chat" className="glass rounded-2xl p-4 text-center hover:-translate-y-0.5 transition-transform" data-testid="link-feature-chat">
                  <Bot className="h-8 w-8 mx-auto text-primary" /><div className="font-bold mt-2">ChatBase</div>
                  <div className="text-xs text-muted-foreground">{data.aiEnabled ? "Ask anything about betting tips" : "Assistant not configured"}</div>
                </Link>
                <Link href="/tips" className="glass rounded-2xl p-4 text-center hover:-translate-y-0.5 transition-transform" data-testid="link-feature-tips">
                  <Gem className="h-8 w-8 mx-auto text-primary" /><div className="font-bold mt-2">Premium Tips</div>
                  <div className="text-xs text-muted-foreground">{data.purchasedCount} unlocked</div>
                </Link>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-xl font-extrabold">Recent Transactions</h3>
                <Link href="/history" className="text-sm text-primary font-semibold" data-testid="link-view-history">View All</Link>
              </div>
              <TxList items={data.recentTransactions} />
            </div>
          </div>
        </div>
      )}
      <TopUpDialog open={topup} onOpenChange={setTopup} provider={data?.wallet.provider} />
    </>
  );
}

export function TxList({ items }: { items: { id: string; title: string; amount: number; type: string; createdAt: string; isDemo: boolean }[] }) {
  if (!items.length)
    return (
      <div className="glass rounded-2xl p-6 text-center" data-testid="status-empty-transactions">
        <Wallet className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-semibold mt-2">No transactions yet</p>
        <p className="text-sm text-muted-foreground">Purchases and top ups will appear here.</p>
      </div>
    );
  return (
    <ul className="space-y-2">
      {items.map((t, i) => {
        const purchase = t.type === "purchase";
        return (
          <li key={t.id} className="glass rounded-xl p-3 flex items-center gap-3 rise" style={{ animationDelay: `${i * 50}ms` }} data-testid={`row-transaction-${t.id}`}>
            <div className={`grid h-10 w-10 place-items-center rounded-full ${purchase ? "bg-[hsl(217_100%_55%/.18)]" : "bg-[hsl(142_72%_45%/.2)]"}`}>
              {purchase ? <ArrowUpRight className="h-5 w-5 text-primary" /> : <ArrowDownLeft className="h-5 w-5 text-win" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate flex items-center gap-2">{t.title}{t.isDemo && <DemoBadge />}</div>
              <div className="text-xs text-muted-foreground">{fmtDate(t.createdAt)}</div>
            </div>
            <div className={`font-extrabold ${purchase ? "text-loss" : "text-win"}`}>{purchase ? "-" : "+"}{money(Math.abs(t.amount))}</div>
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardPage() {
  const { user } = useUser();
  return <AppShell title="Dashboard"><DashboardView name={user?.firstName || "Champion"} /></AppShell>;
}
