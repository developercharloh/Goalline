import { useEffect, useRef, useState } from "react";
import { Link, Redirect, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWallet, useGetTips, usePurchaseTips, useGetChat, useSendChat, getGetChatQueryKey,
} from "@workspace/api-client-react";
import type { ChatMessage } from "@workspace/api-client-react";
import { MessageCircle, Send, Check, Wallet, Gem, ShieldCheck, Ban, Crown, Users } from "lucide-react";
import { AppShell, ErrorCard, PageHeader, Sk } from "@/components/app-shell";
import { Logo } from "@/components/brand";
import { TipCard } from "@/components/tip-card";
import { TopUpDialog } from "@/components/topup-dialog";
import { errMsg, invalidateMoney, money } from "@/lib/probet";

export function WalletPage() {
  const w = useGetWallet({ query: { refetchInterval: 15000 } });
  const [open, setOpen] = useState(false);
  const guest = w.data?.isDemo === true;
  return (
    <AppShell>
      <PageHeader title="My Wallet" subtitle="Top up only. Wallet funds are used for premium tips and cannot be withdrawn." />
      {w.isLoading ? <Sk className="h-56" /> : w.error || !w.data ? <ErrorCard message={errMsg(w.error)} onRetry={() => w.refetch()} /> : (
        <div className="glass rounded-3xl p-6 md:p-8 text-center relative overflow-hidden rise">
          <div className="absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full bg-[hsl(217_100%_55%/.3)] blur-3xl" />
          <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(214_100%_60%)] to-[hsl(224_100%_40%)]"><Wallet className="h-8 w-8 text-[hsl(43_96%_70%)]" /></div>
          <div className="relative font-display text-5xl font-extrabold mt-4" data-testid="text-deposited-balance">{money(w.data.depositedBalance ?? 0, w.data.currency)}</div>
          <div className="relative text-muted-foreground mt-1">Deposited balance</div>
          <button type="button" onClick={() => setOpen(true)} className="btn-green relative mt-6 w-full max-w-sm rounded-xl py-3 font-bold" data-testid="button-topup-wallet">Deposit with M-Pesa</button>
          <p className="relative mt-2 text-xs text-muted-foreground">Real tip purchases are not available yet.</p>
          <div className="relative mt-4 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><ShieldCheck className="h-4 w-4" />Manually verified deposits</span>
            <span className="flex items-center gap-1"><Ban className="h-4 w-4" />No withdrawals</span>
          </div>
        </div>
      )}
      {guest && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-[hsl(43_96%_56%/.4)] bg-[hsl(43_96%_56%/.07)] p-4 text-sm" role="note" data-testid="status-guest-wallet">
          <ShieldCheck className="h-5 w-5 shrink-0 text-gold" />
          <p><b>This wallet is linked to this browser.</b> <span className="text-muted-foreground">Do not clear your browser data or switch devices until it is linked to an account, or you may lose access to your deposits.</span></p>
        </div>
      )}
      <TopUpDialog open={open} onOpenChange={setOpen} provider={w.data?.provider} />
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
                  <div className="flex justify-between"><dt>Your Balance</dt><dd className="font-bold">{money(bal)}</dd></div>
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

export function ChatPage() {
  const qc = useQueryClient();
  const chat = useGetChat({ query: { refetchInterval: 5000, refetchIntervalInBackground: false } });
  const send = useSendChat();
  const [text, setText] = useState("");
  const [displayName, setDisplayName] = useState(() => window.localStorage.getItem("probet-community-name") ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const msgs: ChatMessage[] = chat.data ?? [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, pending]);

  function submit() {
    const content = text.trim();
    const name = displayName.trim();
    if (!content || !name || send.isPending) return;
    setPending(content);
    send.mutate({ data: { displayName: name, content } }, {
      onSuccess: () => {
        setText("");
        qc.invalidateQueries({ queryKey: getGetChatQueryKey() });
      },
      onSettled: () => setPending(null),
    });
  }

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100dvh-10rem)] md:h-[calc(100dvh-5rem)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl btn-blue"><MessageCircle className="h-6 w-6" /></div>
            <div><h1 className="font-display text-2xl font-extrabold">ChatBase</h1><p className="text-xs text-muted-foreground">ProBet Tips community</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-[hsl(142_72%_50%/.25)] bg-[hsl(142_72%_50%/.08)] px-3 py-1.5 text-xs font-semibold text-win">
            <span className="h-2 w-2 rounded-full bg-win" /> Public room
          </div>
        </div>
        <div className="glass mb-3 flex flex-wrap items-center gap-3 rounded-2xl p-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Users className="h-5 w-5" /></div>
          <div className="min-w-[9rem] flex-1">
            <p className="text-sm font-semibold">One room for everyone</p>
            <p className="text-xs text-muted-foreground">Messages are public and shared with the community.</p>
          </div>
          <label className="flex min-w-40 items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Your name</span>
            <input
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                window.localStorage.setItem("probet-community-name", e.target.value);
              }}
              maxLength={24}
              minLength={2}
              placeholder="Choose a name"
              className="w-full rounded-lg border border-border bg-background/70 px-2.5 py-2 text-sm text-foreground outline-none focus:border-primary"
              aria-label="Your display name"
              data-testid="input-chat-name"
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 rounded-2xl border border-border/60 bg-[hsl(225_65%_6%/.45)] p-3 md:p-4" data-testid="list-chat">
          {chat.isLoading ? <><Sk className="h-16 w-2/3" /><Sk className="h-14 w-1/2 ml-auto" /></> : chat.error ? <ErrorCard message={errMsg(chat.error)} onRetry={() => chat.refetch()} /> : (
            <>
              {msgs.length === 0 && !pending && (
                <div className="grid h-full min-h-40 place-items-center text-center">
                  <div>
                    <MessageCircle className="mx-auto h-9 w-9 text-primary" />
                    <p className="mt-2 font-semibold">Start the conversation</p>
                    <p className="mt-1 text-sm text-muted-foreground">Say hello or talk football with the community.</p>
                  </div>
                </div>
              )}
              {msgs.map((m) => <CommunityBubble key={m.id} message={m} />)}
              {pending && <PendingBubble displayName={displayName.trim()} content={pending} />}
            </>
          )}
          <div ref={endRef} />
        </div>
        {send.error && <div className="mt-2 rounded-xl border border-[hsl(0_84%_60%/.5)] bg-[hsl(0_84%_60%/.1)] p-3 text-sm text-loss" data-testid="text-chat-error">{errMsg(send.error)}</div>}
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mt-3 flex gap-2 rounded-2xl border border-border glass p-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={displayName.trim() ? "Message the community..." : "Choose your name to join the chat"} className="min-w-0 flex-1 bg-transparent px-3 outline-none" data-testid="input-chat" />
          <button type="submit" disabled={!text.trim() || !displayName.trim() || send.isPending} aria-label="Send message" className="btn-blue grid h-11 w-11 shrink-0 place-items-center rounded-xl disabled:opacity-50" data-testid="button-send-chat">
            {send.isPending ? <span className="animate-pulse">…</span> : <Send className="h-5 w-5" />}
          </button>
        </form>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Keep it respectful. Public messages are visible to everyone in this room.</p>
      </div>
    </AppShell>
  );
}

function CommunityBubble({ message }: { message: ChatMessage }) {
  const me = message.isMine;
  const time = new Date(message.createdAt);
  return (
    <div className={`flex items-end gap-2 rise ${me ? "justify-end" : ""}`}>
      {!me && <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-primary">{message.displayName.slice(0, 1).toUpperCase()}</div>}
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${me ? "btn-blue rounded-br-sm" : "glass rounded-bl-sm"}`}>
        <div className={`mb-1 flex items-center gap-2 text-[11px] ${me ? "text-white/75" : "text-muted-foreground"}`}>
          <span className="font-bold">{me ? "You" : message.displayName}</span>
          <time dateTime={message.createdAt}>{Number.isNaN(time.getTime()) ? "" : time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
      </div>
    </div>
  );
}

function PendingBubble({ displayName, content }: { displayName: string; content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm btn-blue px-4 py-2.5 opacity-70">
        <div className="mb-1 text-[11px] font-bold text-white/75">{displayName} · Sending</div>
        <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
      </div>
    </div>
  );
}

