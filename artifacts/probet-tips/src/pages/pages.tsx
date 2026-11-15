import { useEffect, useRef, useState } from "react";
import { Link, Redirect, useLocation, useParams } from "wouter";
import { useClerk, useUser, Show } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWallet, useGetTransactions, useGetTips, usePurchaseTips, useGetChat, useSendChat, getGetChatQueryKey,
} from "@workspace/api-client-react";
import type { ChatMessage } from "@workspace/api-client-react";
import { Bot, Send, Check, Wallet, Gem, LogOut, Mail, ShieldCheck, Ban, Info, Crown, LogIn } from "lucide-react";
import { AppShell, ErrorCard, PageHeader, Sk } from "@/components/app-shell";
import { DemoBadge, Logo } from "@/components/brand";
import { TipCard } from "@/components/tip-card";
import { TopUpDialog } from "@/components/topup-dialog";
import { TxList } from "@/pages/dashboard";
import { basePath, errMsg, invalidateMoney, money } from "@/lib/probet";

export function WalletPage() {
  const w = useGetWallet();
  const tx = useGetTransactions();
  const [open, setOpen] = useState(false);
  return (
    <AppShell>
      <PageHeader title="My Wallet" subtitle="Top up only. Wallet funds are used for premium tips and cannot be withdrawn." />
      {w.isLoading ? <Sk className="h-56" /> : w.error || !w.data ? <ErrorCard message={errMsg(w.error)} onRetry={() => w.refetch()} /> : (
        <div className="glass rounded-3xl p-8 text-center relative overflow-hidden rise">
          <div className="absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full bg-[hsl(217_100%_55%/.3)] blur-3xl" />
          <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(214_100%_60%)] to-[hsl(224_100%_40%)]"><Wallet className="h-8 w-8 text-[hsl(43_96%_70%)]" /></div>
          <div className="relative font-display text-5xl font-extrabold mt-4" data-testid="text-wallet-balance">{money(w.data.balance, w.data.currency)}</div>
          <div className="relative text-muted-foreground flex items-center justify-center gap-2 mt-1">{w.data.isDemo ? "Demo balance" : "Current Balance"}{w.data.isDemo && <DemoBadge />}</div>
          <button type="button" onClick={() => setOpen(true)} className="btn-green relative mt-6 w-full max-w-sm rounded-xl py-3 font-bold" data-testid="button-topup-wallet">Top Up Wallet</button>
          <div className="relative mt-4 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><ShieldCheck className="h-4 w-4" />Provider: {w.data.provider}</span>
            <span className="flex items-center gap-1"><Ban className="h-4 w-4" />No withdrawals</span>
            {!w.data.paymentsEnabled && <span className="flex items-center gap-1 text-gold"><Info className="h-4 w-4" />Checkout not connected yet</span>}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="font-display text-xl font-extrabold">Recent Transactions</h2>
        <Link href="/history" className="text-sm text-primary font-semibold" data-testid="link-wallet-history">View All</Link>
      </div>
      {tx.isLoading ? <Sk className="h-32" /> : tx.error ? <ErrorCard message={errMsg(tx.error)} onRetry={() => tx.refetch()} /> : <TxList items={(tx.data ?? []).slice(0, 4)} />}
      <TopUpDialog open={open} onOpenChange={setOpen} provider={w.data?.provider} />
    </AppShell>
  );
}

export function HistoryPage() {
  const tx = useGetTransactions();
  return (
    <AppShell>
      <PageHeader title="Transaction History" subtitle="Every top up and tip purchase on your account." />
      {tx.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Sk key={i} className="h-16" />)}</div>
        : tx.error ? <ErrorCard message={errMsg(tx.error)} onRetry={() => tx.refetch()} /> : <TxList items={tx.data ?? []} />}
    </AppShell>
  );
}

export function TipsPage() {
  const t = useGetTips();
  const owned = (t.data ?? []).filter((p) => p.purchased);
  const avail = (t.data ?? []).filter((p) => !p.purchased);
  return (
    <AppShell>
      <PageHeader title="Premium Tips" subtitle="Packages and the picks you've unlocked. Sample matches only — no live stats." />
      {t.isLoading ? <div className="grid md:grid-cols-2 gap-4"><Sk className="h-56" /><Sk className="h-56" /></div>
        : t.error ? <ErrorCard message={errMsg(t.error)} onRetry={() => t.refetch()} /> : (
          <div className="space-y-8">
            <section>
              <h2 className="font-display text-xl font-extrabold mb-3">My Picks</h2>
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
                <h2 className="font-display text-xl font-extrabold mb-3">Available Packages</h2>
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
  const tips = useGetTips();
  const w = useGetWallet();
  const purchase = usePurchaseTips();
  const pkg = tips.data?.find((p) => p.id === id);
  const bal = w.data?.balance ?? 0;
  const after = pkg ? bal - pkg.price : bal;
  const short = !!pkg && after < 0;
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
        : !pkg ? <ErrorCard message="This tip package could not be found." /> : (
          <div className="glass rounded-3xl p-6 max-w-lg rise">
            <div className="flex items-center gap-4">
              <Logo className="h-16 w-16" />
              <div><h2 className="font-display text-xl font-extrabold" data-testid="text-purchase-title">{pkg.title}</h2><p className="text-sm text-muted-foreground">{pkg.description}</p></div>
            </div>
            {pkg.purchased ? (
              <div className="mt-6 text-center"><p className="font-bold text-win">You already own this package.</p><Link href="/tips" className="btn-blue inline-block mt-4 rounded-xl px-6 py-2.5 font-bold">View My Tips</Link></div>
            ) : (
              <>
                <dl className="mt-6 rounded-2xl bg-[hsl(224_60%_9%)] border border-border p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><dt>Ticket Price</dt><dd className="font-bold" data-testid="text-ticket-price">{money(pkg.price)}</dd></div>
                  <div className="flex justify-between"><dt className="flex items-center gap-2">Your Balance{w.data?.isDemo && <DemoBadge />}</dt><dd className="font-bold">{money(bal)}</dd></div>
                  <div className="flex justify-between border-t border-border pt-2"><dt>After Purchase</dt><dd className={`font-extrabold ${short ? "text-loss" : "text-win"}`} data-testid="text-after-balance">{money(after)}</dd></div>
                </dl>
                {pkg.isSample && <p className="text-xs text-muted-foreground mt-3">This package contains sample matches for demonstration.</p>}
                {purchase.error && <p className="mt-3 text-sm text-loss" data-testid="text-purchase-error">{errMsg(purchase.error)}</p>}
                {short ? (
                  <button type="button" onClick={() => setTopup(true)} className="btn-green w-full mt-5 rounded-xl py-3 font-bold" data-testid="button-insufficient-topup">Insufficient balance — Top Up</button>
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
      <TopUpDialog open={topup} onOpenChange={setTopup} provider={w.data?.provider} />
    </AppShell>
  );
}

export function SuccessPage() {
  const tips = useGetTips();
  const packageId = new URLSearchParams(window.location.search).get("pkg");
  if (tips.isLoading) return <AppShell><Sk className="h-72 max-w-lg" /></AppShell>;
  if (tips.error) return <AppShell><ErrorCard message={errMsg(tips.error)} onRetry={() => tips.refetch()} /></AppShell>;
  if (!packageId || !tips.data?.some(pkg => pkg.id === packageId && pkg.purchased)) return <Redirect to="/tips" />;
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
          <p className="relative text-muted-foreground mt-1">Your premium tips are now available.</p>
          <Link href="/tips" className="relative btn-blue block mt-6 rounded-xl py-3 font-bold" data-testid="link-view-my-tips">View My Tips</Link>
          <Link href="/dashboard" className="relative block mt-3 text-sm text-primary font-semibold" data-testid="link-back-home">Back to Home</Link>
        </div>
      </div>
    </AppShell>
  );
}

const PROMPTS = ["Give me today's best tips", "How does the wallet work?", "What's in the Champions League pack?"];

export function ChatPage() {
  const qc = useQueryClient();
  const chat = useGetChat();
  const send = useSendChat();
  const tips = useGetTips();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const msgs: ChatMessage[] = chat.data ?? [];
  const firstLocked = tips.data?.find((p) => !p.purchased);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, pending, send.error]);

  function submit(content: string) {
    const c = content.trim();
    if (!c || send.isPending) return;
    setText(""); setPending(c);
    send.mutate({ data: { content: c } }, {
      onSettled: () => { setPending(null); qc.invalidateQueries({ queryKey: getGetChatQueryKey() }); },
    });
  }

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100dvh-10rem)] md:h-[calc(100dvh-5rem)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="grid h-11 w-11 place-items-center rounded-xl btn-blue"><Bot className="h-6 w-6" /></div>
          <div><h1 className="font-display text-2xl font-extrabold">ChatBase</h1><p className="text-xs text-muted-foreground">Betting tips assistant</p></div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1" data-testid="list-chat">
          {chat.isLoading ? <><Sk className="h-14 w-2/3" /><Sk className="h-10 w-1/2 ml-auto" /></> : chat.error ? <ErrorCard message={errMsg(chat.error)} onRetry={() => chat.refetch()} /> : (
            <>
              <Bubble role="assistant" content="Hello! Ask me anything about betting tips." />
              {msgs.map((m) => <Bubble key={m.id} role={m.role} content={m.content} />)}
              {pending && <Bubble role="user" content={pending} />}
              {send.isPending && <div className="flex gap-2 items-center text-muted-foreground text-sm"><Bot className="h-5 w-5" /><span className="animate-pulse">ChatBase is typing...</span></div>}
              {send.error && <div className="rounded-xl border border-[hsl(0_84%_60%/.5)] bg-[hsl(0_84%_60%/.1)] p-3 text-sm text-loss" data-testid="text-chat-error">{errMsg(send.error)}</div>}
              {firstLocked && msgs.length > 0 && (
                <div className="glass rounded-2xl p-4 max-w-md rise">
                  <p className="text-sm">Would you like to purchase these premium tips?</p>
                  <div className="flex gap-2 mt-3">
                    <Link href={`/purchase/${firstLocked.id}`} className="btn-blue rounded-lg px-4 py-2 text-sm font-bold" data-testid="link-chat-buy">Yes, Buy Now</Link>
                    <button type="button" onClick={() => submit("Tell me more about the premium package")} className="rounded-lg px-4 py-2 text-sm font-bold border border-border hover:bg-secondary" data-testid="button-chat-ask-more">Ask More</button>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={endRef} />
        </div>
        <div className="flex gap-2 overflow-x-auto py-3">
          {PROMPTS.map((p, i) => (
            <button key={p} type="button" onClick={() => submit(p)} disabled={send.isPending} className="shrink-0 btn-blue rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-60" data-testid={`button-prompt-${i}`}>{p}</button>
          ))}
          {firstLocked && <Link href={`/purchase/${firstLocked.id}`} className="shrink-0 btn-gold rounded-full px-4 py-1.5 text-sm font-bold flex items-center gap-1" data-testid="link-prompt-buy"><Crown className="h-4 w-4" />Buy {money(firstLocked.price)} pack</Link>}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); submit(text); }} className="flex gap-2 glass rounded-2xl p-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Type your question..." className="flex-1 bg-transparent px-3 outline-none" data-testid="input-chat" />
          <button type="submit" disabled={!text.trim() || send.isPending} aria-label="Send" className="btn-blue grid h-11 w-11 place-items-center rounded-xl disabled:opacity-50" data-testid="button-send-chat"><Send className="h-5 w-5" /></button>
        </form>
      </div>
    </AppShell>
  );
}

function Bubble({ role, content }: { role: string; content: string }) {
  const me = role === "user";
  return (
    <div className={`flex gap-2 rise ${me ? "justify-end" : ""}`}>
      {!me && <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary"><Bot className="h-5 w-5 text-primary" /></div>}
      <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${me ? "btn-blue rounded-br-sm" : "glass rounded-tl-sm"}`}>{content}</div>
    </div>
  );
}

export function ProfilePage() {
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
    return <GuestProfilePage />;
  }
  return <AuthenticatedProfilePage />;
}

function GuestProfilePage() {
  return (
    <AppShell>
      <PageHeader title="Profile" />
      <div className="glass rounded-3xl p-8 max-w-lg text-center">
        <Logo className="h-16 w-16 mx-auto" />
        <p className="font-bold mt-3">Guest demo</p>
        <p className="text-sm text-muted-foreground mt-1">Account sign-in is not enabled on this deployment. Your demo wallet and sample activity are still available.</p>
        <div className="grid gap-2 mt-5 text-left">
          <Link href="/wallet" className="rounded-xl bg-secondary px-4 py-3 font-semibold flex items-center gap-2 hover:bg-secondary/70"><Wallet className="h-4 w-4" />Wallet</Link>
          <Link href="/history" className="rounded-xl bg-secondary px-4 py-3 font-semibold flex items-center gap-2 hover:bg-secondary/70"><Gem className="h-4 w-4" />Transaction history</Link>
        </div>
      </div>
    </AppShell>
  );
}

function AuthenticatedProfilePage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const initials = (user?.firstName?.[0] ?? user?.primaryEmailAddress?.emailAddress?.[0] ?? "P").toUpperCase();
  return (
    <AppShell>
      <PageHeader title="Profile" />
      <Show when="signed-in">
        <div className="glass rounded-3xl p-6 max-w-lg rise">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-full btn-gold font-display text-2xl font-black">{initials}</div>
            <div className="min-w-0">
              <div className="font-display text-xl font-extrabold truncate" data-testid="text-profile-name">{user?.fullName || "Member"}</div>
              <div className="text-sm text-muted-foreground flex items-center gap-1 truncate"><Mail className="h-4 w-4" />{user?.primaryEmailAddress?.emailAddress}</div>
            </div>
          </div>
          <div className="mt-6 grid gap-2">
            <Link href="/wallet" className="rounded-xl bg-secondary px-4 py-3 font-semibold flex items-center gap-2 hover:bg-secondary/70"><Wallet className="h-4 w-4" />Wallet</Link>
            <Link href="/history" className="rounded-xl bg-secondary px-4 py-3 font-semibold flex items-center gap-2 hover:bg-secondary/70"><Gem className="h-4 w-4" />Transaction history</Link>
          </div>
          <button type="button" onClick={() => signOut({ redirectUrl: basePath || "/" })} className="mt-6 w-full rounded-xl border border-[hsl(0_84%_60%/.5)] py-3 font-bold text-loss flex items-center justify-center gap-2 hover:bg-[hsl(0_84%_60%/.1)]" data-testid="button-logout"><LogOut className="h-4 w-4" />Log out</button>
        </div>
      </Show>
      <Show when="signed-out">
        <div className="glass rounded-3xl p-8 max-w-lg text-center">
          <Logo className="h-16 w-16 mx-auto" />
          <p className="font-bold mt-3">You're browsing as a guest</p>
          <p className="text-sm text-muted-foreground">Create an account to keep your own wallet and picks.</p>
          <div className="flex gap-3 justify-center mt-5">
            <Link href="/sign-up" className="btn-blue rounded-xl px-5 py-2.5 font-bold" data-testid="link-profile-signup">Sign Up</Link>
            <Link href="/sign-in" className="rounded-xl px-5 py-2.5 font-bold border border-border flex items-center gap-1" data-testid="link-profile-signin"><LogIn className="h-4 w-4" />Login</Link>
          </div>
        </div>
      </Show>
    </AppShell>
  );
}
