import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAuthMeQueryKey,
  useGetAuthMe,
  useGetReferralSummary,
  useLinkLegacyAccount,
  useUpdateAccountProfile,
} from "@workspace/api-client-react";
import { ShieldCheck, UserRound, Link2, Copy } from "lucide-react";
import { AppShell, ErrorCard, PageHeader, Sk } from "@/components/app-shell";
import { errMsg } from "@/lib/probet";

export default function AccountPage() {
  const session = useGetAuthMe();
  const update = useUpdateAccountProfile();
  const linkLegacy = useLinkLegacyAccount();
  const referral = useGetReferralSummary({
    query: {
      enabled: Boolean(session.data?.account),
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
    },
  });
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  if (session.isLoading) return <AppShell><Sk className="h-72" /></AppShell>;
  if (session.error) return <AppShell><ErrorCard message={errMsg(session.error)} onRetry={() => session.refetch()} /></AppShell>;
  if (!session.data?.account) return <Redirect to="/sign-in?returnTo=%2Fprofile" />;

  const account = session.data.account;
  const inviteLink = referral.data
    ? `${window.location.origin}/sign-up?ref=${encodeURIComponent(referral.data.code)}`
    : "";

  async function copyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    update.mutate({
      data: {
        username: String(values.username ?? "").trim(),
        fullName: String(values.fullName ?? "").trim(),
        phone: String(values.phone ?? "").trim(),
        country: String(values.country ?? "").trim(),
      },
    }, {
      onSuccess: (result) => {
        setSaved(true);
        queryClient.setQueryData(getGetAuthMeQueryKey(), { ...session.data, account: result.account });
        queryClient.invalidateQueries({ queryKey: getGetAuthMeQueryKey() });
      },
    });
  }

  return (
    <AppShell title="My profile">
      <PageHeader title="My Profile" subtitle="Manage your account details and linked account data." />
      <section className="glass max-w-2xl rounded-3xl p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary"><UserRound className="h-6 w-6" /></div>
          <div className="min-w-0"><h2 className="font-display text-xl font-extrabold truncate">{account.fullName}</h2><p className="text-sm text-muted-foreground">{account.email}</p></div>
        </div>
        <form onSubmit={submit} className="grid gap-4" data-testid="form-profile">
          <label className="grid gap-1.5 text-sm font-semibold">Email address
            <input value={account.email} readOnly className="w-full rounded-xl border border-border bg-background/40 px-3 py-3 text-muted-foreground" data-testid="input-profile-email" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">Username
            <input name="username" defaultValue={account.username} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" className="w-full rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid="input-profile-username" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">Full name
            <input name="fullName" defaultValue={account.fullName} required minLength={2} maxLength={100} className="w-full rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid="input-profile-full-name" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">Phone number
            <input name="phone" type="tel" defaultValue={account.phone} required minLength={7} maxLength={24} className="w-full rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid="input-profile-phone" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">Country
            <input name="country" defaultValue={account.country} required minLength={2} maxLength={80} className="w-full rounded-xl border border-border bg-background/70 px-3 py-3 outline-none focus:border-primary" data-testid="input-profile-country" />
          </label>
          {update.error && <p className="rounded-xl border border-loss/40 bg-loss/10 p-3 text-sm text-loss" role="alert" data-testid="profile-error">{errMsg(update.error)}</p>}
          {saved && <p className="rounded-xl border border-win/30 bg-win/10 p-3 text-sm text-win" role="status" data-testid="profile-saved">Profile updated.</p>}
          <button disabled={update.isPending} className="btn-blue rounded-xl py-3 font-bold disabled:opacity-60" data-testid="button-save-profile">
            {update.isPending ? "Saving…" : "Save profile"}
          </button>
        </form>
      </section>

      <section className="glass relative max-w-2xl overflow-hidden rounded-3xl p-5 sm:p-6 mt-5" data-testid="section-referrals">
        <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full border border-gold/10" />
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-gold/20 bg-gold/10 text-gold"><span className="text-xl" aria-hidden="true">💎</span></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">Share the game plan</p><h2 className="font-display text-lg font-extrabold">Invite friends</h2></div>
               <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/10 px-2.5 py-1 text-xs font-extrabold text-gold"><span aria-hidden="true">💎</span>10 Diamonds</span>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Your friend must create an account through your invite link and complete their <strong className="text-foreground">first VIP purchase</strong>. Then you earn 10 Diamonds. One reward per friend; sign-up alone does not qualify.
            </p>
            {referral.isLoading ? <Sk className="mt-4 h-12" />
              : referral.error ? <div className="mt-3 rounded-xl border border-loss/25 bg-loss/5 p-3" role="alert">
                  <p className="text-sm text-loss">{errMsg(referral.error)}</p>
                  <button type="button" onClick={() => void referral.refetch()} className="mt-2 text-xs font-bold text-foreground underline underline-offset-4" data-testid="button-retry-referral">Try again</button>
                </div>
                : referral.data && (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center" aria-label="Referral progress">
                      <div className="rounded-xl border border-border/70 bg-background/45 p-3" data-testid="text-referral-invited"><b className="block font-mono text-lg tabular-nums">{referral.data.invitedCount}</b><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Invited</span></div>
                      <div className="rounded-xl border border-border/70 bg-background/45 p-3" data-testid="text-referral-converted"><b className="block font-mono text-lg tabular-nums">{referral.data.convertedCount}</b><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Purchased</span></div>
                      <div className="rounded-xl border border-gold/15 bg-gold/5 p-3" data-testid="text-referral-earned"><b className="flex items-center justify-center gap-1 font-mono text-lg tabular-nums text-gold"><span aria-hidden="true">💎</span>{referral.data.diamondsEarned}</b><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Diamonds earned</span></div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Your referral code</span>
                      <code className="rounded-md border border-border bg-background/50 px-2 py-1 font-mono font-bold tracking-[0.12em] text-foreground" data-testid="text-referral-code">{referral.data.code}</code>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <input value={inviteLink} readOnly aria-label="Your invite link" className="min-w-0 flex-1 rounded-xl border border-border bg-background/50 px-3 py-2.5 text-xs" data-testid="input-referral-link" />
                      <button type="button" onClick={() => void copyInviteLink()} disabled={!inviteLink} aria-label={copied ? "Invite link copied" : "Copy invite link"} className="btn-blue inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-60" data-testid="button-copy-referral-link">
                        <Copy className="h-4 w-4" aria-hidden="true" />{copied ? "Copied" : "Copy link"}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground" role="status" aria-live="polite">{copied ? "Invite link copied. Share it with a friend to get started." : "Share the link directly. Your friend needs to use it when creating their account."}</p>
                  </>
                )}
          </div>
        </div>
      </section>

      {!account.legacyLinked && (
        <section className="glass max-w-2xl rounded-3xl p-6 mt-5">
          <div className="flex items-start gap-3">
            <Link2 className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <h2 className="font-display text-lg font-extrabold">Link an older account</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in to your previous account, then link its wallet, deposits, purchases and community messages here. Accounts are never matched by email alone.
              </p>
              {session.data.legacySession ? (
                <button
                  type="button"
                  onClick={() => linkLegacy.mutate(undefined, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetAuthMeQueryKey() }) })}
                  disabled={linkLegacy.isPending}
                  className="btn-blue mt-4 rounded-xl px-5 py-2.5 font-bold disabled:opacity-60"
                  data-testid="button-link-legacy"
                >
                  {linkLegacy.isPending ? "Linking…" : "Link previous account"}
                </button>
              ) : (
                <Link href="/legacy-sign-in" className="btn-blue mt-4 inline-block rounded-xl px-5 py-2.5 font-bold" data-testid="link-legacy-signin">
                  Sign in to previous account
                </Link>
              )}
              {linkLegacy.error && <p className="mt-3 text-sm text-loss" role="alert" data-testid="legacy-link-error">{errMsg(linkLegacy.error)}</p>}
              {linkLegacy.data?.linked && <p className="mt-3 flex items-center gap-2 text-sm text-win" role="status"><ShieldCheck className="h-4 w-4" />{linkLegacy.data.message}</p>}
            </div>
          </div>
        </section>
      )}

    </AppShell>
  );
}
