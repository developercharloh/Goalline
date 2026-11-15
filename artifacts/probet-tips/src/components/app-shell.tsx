import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Show, useUser } from "@clerk/react";
import { Home, MessageSquare, Wallet, Gem, LogIn } from "lucide-react";
import { Logo, Wordmark } from "@/components/brand";

const NAV = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/tips", label: "Tips", icon: Gem },
  { href: "/wallet", label: "Wallet", icon: Wallet },
];

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
}: {
  children: ReactNode;
  title?: string;
  displayName?: string;
  email?: string;
  guestPreview?: boolean;
}) {
  const isActive = useActive();
  return (
    <div className="min-h-[100dvh] md:flex">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur sticky top-0 h-[100dvh] p-5">
        <Link href="/dashboard" className="flex items-center gap-2 mb-8" data-testid="link-logo">
          <Logo className="h-11 w-11" />
          <Wordmark size="sm" />
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => {
            const a = isActive(n.href);
            return (
              <Link key={n.href} href={n.href} data-testid={`link-nav-${n.label.toLowerCase()}`}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold transition-all ${a ? "btn-blue" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"}`}>
                <n.icon className="h-[18px] w-[18px] transition-transform group-hover:scale-110" />{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto glass rounded-2xl p-4 text-sm">
          {guestPreview ? (
            <>
              <div className="font-bold">Guest preview</div>
              <p className="text-xs text-muted-foreground mt-1">Sample matches. Account access is not enabled on this deployment.</p>
            </>
          ) : (
            <>
              <Show when="signed-in">
                <div className="font-bold truncate">{displayName || email || "Member"}</div>
                <div className="text-xs text-muted-foreground">Member account</div>
              </Show>
              <Show when="signed-out">
            <div className="font-bold">Guest preview</div>
            <p className="text-xs text-muted-foreground mb-3">Sample matches</p>
            <Link href="/sign-up" className="btn-gold block text-center rounded-lg py-2 font-bold" data-testid="link-sidebar-signup">Create account</Link>
              </Show>
            </>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 pb-24 md:pb-10">
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur border-b border-border/50">
          <Link href="/dashboard" className="flex items-center gap-2"><Logo className="h-8 w-8" /><Wordmark size="sm" /></Link>
          {!guestPreview && <Show when="signed-out"><Link href="/sign-in" className="text-sm font-bold text-primary flex items-center gap-1" data-testid="link-header-signin"><LogIn className="h-4 w-4" />Sign in</Link></Show>}
        </header>
        {title && <h1 className="sr-only">{title}</h1>}
        <main className="mx-auto max-w-5xl px-4 md:px-8 pt-5 md:pt-10">{children}</main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t border-border bg-[hsl(225_70%_8%/.95)] backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {NAV.map((n) => {
          const a = isActive(n.href);
          return (
            <Link key={n.href} href={n.href} data-testid={`link-tab-${n.label.toLowerCase()}`}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${a ? "text-primary" : "text-muted-foreground"}`}>
              <n.icon className={`h-5 w-5 transition-transform ${a ? "scale-110" : ""}`} />{n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function ClerkAppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { user } = useUser();
  return (
    <AppShellFrame
      title={title}
      displayName={user?.firstName || undefined}
      email={user?.primaryEmailAddress?.emailAddress}
    >
      {children}
    </AppShellFrame>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
    return <AppShellFrame title={title} guestPreview>{children}</AppShellFrame>;
  }
  return <ClerkAppShell title={title}>{children}</ClerkAppShell>;
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
  return <div className={`animate-pulse rounded-2xl bg-[hsl(222_50%_16%)] ${className}`} />;
}
