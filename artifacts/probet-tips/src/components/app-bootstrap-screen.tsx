import { AlertCircle, Check, Circle, LoaderCircle } from "lucide-react";
import { Logo } from "@/components/brand";

type BootstrapState = "loading" | "error";

const loadingSteps = [
  { label: "Starting ProBet Tips", state: "complete" },
  { label: "Loading your wallet and available tips", state: "active" },
  { label: "Collecting verified match data", state: "pending" },
  { label: "Calculating win rate", state: "pending" },
  { label: "Preparing premium tips", state: "pending" },
] as const;

export function AppBootstrapScreen({
  state,
  onRetry,
}: {
  state: BootstrapState;
  onRetry: () => void;
}) {
  const isLoading = state === "loading";

  return (
    <main className="relative isolate flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[hsl(224_70%_7%)] px-4 py-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_8%,hsl(217_100%_35%/.34),transparent_48%),radial-gradient(ellipse_at_95%_90%,hsl(222_100%_35%/.18),transparent_40%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />

      <section className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-[hsl(217_80%_45%/.35)] bg-gradient-to-b from-[hsl(224_62%_14%/.96)] to-[hsl(225_70%_8%/.98)] p-6 shadow-[0_24px_90px_hsl(222_100%_3%/.6)] sm:p-9">
        <div aria-hidden="true" className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(43_96%_56%/.8)] to-transparent" />

        <header className="text-center">
          <div className="relative mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl border border-[hsl(43_96%_56%/.42)] bg-[hsl(222_70%_12%)] shadow-[0_0_34px_hsl(217_100%_55%/.22)]">
            <Logo className="h-16 w-16" />
            <span className="absolute -right-2 -top-2 text-2xl" aria-hidden="true">⚽</span>
          </div>
          <p className="text-xs font-extrabold uppercase tracking-[.25em] text-[hsl(43_96%_63%)]">Welcome to</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight sm:text-4xl">
            <span className="brand-grad">ProBet </span>
            <span className="brand-grad-blue">Tips</span>
          </h1>
          <p className="mt-2 text-sm font-semibold text-foreground/90 sm:text-base">
            Analysing the game. Predicting the possibilities.
          </p>
        </header>

        <p className="mx-auto mt-6 max-w-md text-center text-sm leading-6 text-muted-foreground">
          Please wait while we analyse today&apos;s football fixtures, team performance, recent form, head-to-head statistics and match trends.
        </p>

        <div className="mt-6 rounded-2xl border border-border/70 bg-[hsl(224_70%_6%/.55)] p-4 sm:p-5" aria-live="polite" role={isLoading ? "status" : "alert"} data-testid="status-bootstrap">
          <div className="flex items-center justify-center gap-2 text-sm font-bold">
            {isLoading
              ? <LoaderCircle className="h-5 w-5 animate-spin text-primary motion-reduce:animate-none" />
              : <AlertCircle className="h-5 w-5 text-loss" />}
            <span>{isLoading ? "Loading your match insights..." : "We couldn’t connect to ProBet Tips."}</span>
          </div>

          {isLoading ? (
            <>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-2/5 animate-pulse rounded-full bg-gradient-to-r from-primary via-[hsl(43_96%_56%)] to-primary motion-reduce:animate-none" />
              </div>
              <ul className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                {loadingSteps.map((step) => (
                  <li key={step.label} className="flex items-center gap-2 text-foreground/85">
                    {step.state === "complete"
                      ? <Check className="h-4 w-4 shrink-0 text-win" aria-hidden="true" />
                      : step.state === "active"
                        ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
                        : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <span>{step.label}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">Your wallet hasn&apos;t been changed. Check your connection and try again.</p>
              <button
                type="button"
                onClick={onRetry}
                className="btn-blue mt-4 rounded-xl px-6 py-2.5 font-bold"
                data-testid="button-bootstrap-retry"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <>
            <p className="mt-5 text-center font-display text-lg font-extrabold text-[hsl(43_96%_63%)]">Almost ready!</p>
            <p className="mt-1 text-center text-sm font-semibold text-foreground/90">
              Smart analysis. Better insights. Informed decisions.
            </p>
          </>
        ) : (
          <p className="mt-5 text-center text-sm text-muted-foreground">We&apos;ll keep your place while you reconnect.</p>
        )}

        <p className="mt-5 rounded-xl border border-[hsl(43_96%_56%/.22)] bg-[hsl(43_96%_56%/.06)] p-3 text-center text-xs leading-5 text-muted-foreground">
          Live fixture data and verified win-rate calculations are not connected yet; current match examples are illustrative.
        </p>

        <p className="mt-4 text-center text-[10px] leading-4 text-muted-foreground/80">
          <strong className="text-foreground/90">DISCLAIMER:</strong> ProBet Tips is strictly for individuals aged 18 and above. Not intended for persons under 18.
        </p>
      </section>
    </main>
  );
}
