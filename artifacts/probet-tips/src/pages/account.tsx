import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAuthMeQueryKey,
  useGetAuthMe,
  useLinkLegacyAccount,
  useUpdateAccountProfile,
} from "@workspace/api-client-react";
import { ShieldCheck, UserRound, Link2 } from "lucide-react";
import { AppShell, ErrorCard, PageHeader, Sk } from "@/components/app-shell";
import { errMsg } from "@/lib/probet";

export default function AccountPage() {
  const session = useGetAuthMe();
  const update = useUpdateAccountProfile();
  const linkLegacy = useLinkLegacyAccount();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  if (session.isLoading) return <AppShell><Sk className="h-72" /></AppShell>;
  if (session.error) return <AppShell><ErrorCard message={errMsg(session.error)} onRetry={() => session.refetch()} /></AppShell>;
  if (!session.data?.account) return <Redirect to="/sign-in?returnTo=%2Fprofile" />;

  const account = session.data.account;

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

      {account.role !== "admin" && (
        <Link href="/admin/setup" className="mt-5 inline-block text-sm text-primary underline" data-testid="link-initial-admin-setup">
          Set up the first administrator
        </Link>
      )}
    </AppShell>
  );
}
