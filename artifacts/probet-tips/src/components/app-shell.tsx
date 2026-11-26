import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, Wallet, Gem, LogIn, LogOut, UserRound, Shield, RefreshCw } from "lucide-react";
import { useGetAuthMe, useSignOut } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Logo, Wordmark } from "@/components/brand";
import { SupportWidget } from "@/components/support-widget";
import { ADMIN_PORTAL_URL } from "@/lib/portal-host";

const NAV = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/tips", label: "Tips", icon: Gem },
  { href: "/wallet", label: "Wallet", icon: Wallet },
];

const MOBILE_NAV = NAV.filter((item) => item.href !== "/wallet");

function useActive() {
  const [loc] = useLocation();
  return (href: string) => (href === "/dashboard" ? loc === "/dashboard" || loc === "/" : loc.startsWith(href));
}

function AppShellFrame({
  children,
  title,
  displayName,
  email,
  guestPreview = false,
  account,
  adminPortal = false,
}: {
  children: ReactNode;
  title?: string;
  displayName?: string;
  email?: string;
  guestPreview?: boolean;
  account?: { username: string; fullName: string; role: "user" | "admin" } | null;
  adminPortal?: boolean;
}) {
  const isActive = useActive();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const signOut = useSignOut();
  const name = account?.fullName || displayName || email || "Member";
  const authenticated = Boolean(account || displayName || email);

  function handleSignOut() {
    signOut.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/");
      },
    });
  }

  function handleRefreshApp() {
    window.location.reload();
  }

  return (
    <div className="min-h-[100dvh] md:flex">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur sticky top-0 h-[100dvh] p-5">
        <Link href={adminPortal ? "/" : "/dashboard"} className="flex items-center gap-2 mb-8" data-testid="link-logo">
          <Logo className="h-11 w-11" />
          <Wordmark size="sm" />
        </Link>
        <nav className="flex flex-col gap-1">
          {adminPortal ? (
            <Link href="/" className="btn-blue flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold" data-testid="link-nav-admin">
              <Shield className="h-[18px] w-[18px]" />Admin portal
            </Link>
          ) : NAV.map((n) => {
            const a = isActive(n.href);
            return (
              <Link key={n.href} href={n.href} data-testid={`link-nav-${n.label.toLowerCase()}`}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold transition-all ${a ? "btn-blue" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"}`}>
                <n.icon className="h-[18px] w-[18px] transition-transform group-hover:scale-110" />{n.label}
              </Link>
            );
          })}
        </nav>
        <button type="button" onClick={handleRefreshApp} className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" aria-label="Refresh app" title="Refresh app" data-testid="button-refresh-app-desktop">
          <RefreshCw className="h-[18px] w-[18px]" />Refresh app
        </button>
        <div className="mt-auto glass rounded-2xl p-4 text-sm">
          {authenticated ? (
            <>
              <div className="font-bold truncate">{name}</div>
              {account && <div className="text-xs text-muted-foreground">@{account.username}</div>}
              <div className="mt-3 grid gap-2">
                {!adminPortal && <Link href="/profile" className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" data-testid="link-profile">
                  <UserRound className="h-4 w-4" />My profile
                </Link>}
                {account?.role === "admin" && !adminPortal && <a href={ADMIN_PORTAL_URL} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-gold hover:bg-sidebar-accent" data-testid="link-admin">
                  <Shield className="h-4 w-4" />Admin portal
                </a>}
                <button type="button" onClick={handleSignOut} disabled={signOut.isPending} className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:opacity-50" data-testid="button-signout">
                  <LogOut className="h-4 w-4" />{signOut.isPending ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="font-bold">{guestPreview ? "Welcome to ProBet Tips" : "Welcome"}</div>
              <p className="text-xs text-muted-foreground mt-1">Explore football tips and manage your wallet.</p>
              <Link href="/sign-up" className="btn-gold block text-center rounded-lg py-2 mt-3 font-bold" data-testid="link-sidebar-signup">Create account</Link>
            </>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 pb-10">
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur border-b border-border/50">
          <Link href={adminPortal ? "/" : "/dashboard"} className="flex items-center gap-2"><Logo className="h-8 w-8" /><Wordmark size="sm" /></Link>
          {!authenticated ? (
            <div className="flex items-center gap-1">
              <button type="button" onClick={handleRefreshApp} aria-label="Refresh app" title="Refresh app" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" data-testid="button-refresh-app-mobile"><RefreshCw className="h-5 w-5" /></button>
              <Link href="/sign-in" className="text-sm font-bold text-primary flex items-center gap-1" data-testid="link-header-signin"><LogIn className="h-4 w-4" />Sign in</Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleRefreshApp} aria-label="Refresh app" title="Refresh app" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" data-testid="button-refresh-app-mobile"><RefreshCw className="h-5 w-5" /></button>
              {!adminPortal && <Link href="/profile" aria-label="My profile" className="rounded-lg p-2 text-primary hover:bg-secondary" data-testid="link-header-profile"><UserRound className="h-5 w-5" /></Link>}
              <button type="button" onClick={handleSignOut} disabled={signOut.isPending} aria-label="Sign out" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary disabled:opacity-50" data-testid="button-header-signout"><LogOut className="h-5 w-5" /></button>
            </div>
          )}
        </header>
        {!adminPortal && <nav aria-label="Primary navigation" data-testid="nav-mobile-primary"
          className="md:hidden sticky top-14 z-30 flex items-center gap-1 border-b border-border bg-sidebar/95 px-2 py-1.5 backdrop-blur">
          {MOBILE_NAV.map((n) => {
            const a = isActive(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={a ? "page" : undefined}
                data-testid={`link-tab-${n.label.toLowerCase()}`}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${a ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"}`}>
                <n.icon className="h-4 w-4" />{n.label}
              </Link>
            );
          })}
        </nav>}
        {title && <h1 className="sr-only">{title}</h1>}
        <main className="mx-auto max-w-5xl px-4 md:px-8 pt-5 md:pt-10">{children}</main>
      </div>
      {!adminPortal && authenticated && <SupportWidget />}
    </div>
  );
}

export function AppShell({ children, title, adminPortal = false }: { children: ReactNode; title?: string; adminPortal?: boolean }) {
  const { data } = useGetAuthMe();
  return <AppShellFrame title={title} account={data?.account} adminPortal={adminPortal}>{children}</AppShellFrame>;
}

export function PageHeader({ title, subtitle, back }: { title: string; subtitle?: string; back?: string }) {
  return (
    <div className="mb-6 rise">
      {back && <Link href={back} className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-block" data-testid="link-back">Back</Link>}
      <h1 className="font-display text-3xl md:text-4xl font-extrabold">{title}</h1>
      {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="glass rounded-2xl p-6 text-center" data-testid="status-error">
      <p className="font-semibold text-loss">{message}</p>
      {onRetry && <button type="button" onClick={onRetry} className="btn-blue mt-4 rounded-lg px-5 py-2 font-bold" data-testid="button-retry">Try again</button>}
    </div>
  );
}

export function Sk({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-secondary/80 ${className}`} />;
}
