import { useEffect, useState } from "react";
import { Link } from "wouter";
import type { TipPackage } from "@workspace/api-client-react";
import { CircleCheck, CircleX, Clock3 } from "lucide-react";
import { formatMatchSelection } from "@/lib/match-selections";

function formatMatchDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export function TipCard({ pkg, compact = false }: { pkg: TipPackage; compact?: boolean }) {
  const expiry = pkg.accessExpiresAt ? Date.parse(pkg.accessExpiresAt) : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pkg.purchased || expiry === null || expiry <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiry, pkg.purchased]);

  const hasAccess = pkg.purchased && (expiry === null || expiry > now);
  const accessExpired = expiry !== null && expiry <= now;

  return (
    <div className="gold-card rounded-2xl p-5 transition-transform hover:-translate-y-0.5" data-testid={`card-package-${pkg.id}`}>
      <h3 className="font-display text-xl font-extrabold" data-testid={`text-package-title-${pkg.id}`}>{pkg.title}</h3>
      {pkg.bestValue && <span className="mt-2 inline-flex rounded-full bg-[hsl(43_96%_56%/.16)] px-3 py-1 text-xs font-extrabold text-gold">Best value</span>}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground" data-testid={`text-package-duration-${pkg.id}`}>
        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />{pkg.durationDays} days of access</span>
      </div>
      {hasAccess && expiry !== null && (
        <p className="mt-2 text-xs font-semibold text-primary" data-testid={`text-access-countdown-${pkg.id}`}>
          Premium access ends in <span className="tabular-nums">{formatRemaining(expiry - now)}</span>
        </p>
      )}
      {accessExpired && (
        <p className="mt-3 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs font-semibold text-loss" role="status" data-testid={`status-access-expired-${pkg.id}`}>
          Your {pkg.durationDays}-day access has expired. Purchase again to continue viewing these tips.
        </p>
      )}

      {hasAccess && !compact && (
        <div className="mt-4 space-y-3">
          {pkg.matches.length === 0 && (
            <p className="rounded-xl border border-border bg-background/40 p-4 text-sm text-muted-foreground" data-testid={`status-no-tips-yet-${pkg.id}`}>
              No tips have been posted yet.
            </p>
          )}
          {pkg.matches.map((match, index) => (
            <article key={`${match.matchDate}-${match.kickoff}-${index}`} className="rounded-xl border border-border bg-[hsl(224_60%_9%)] p-4" data-testid={`card-match-${pkg.id}-${index}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <time dateTime={`${match.matchDate}T${match.kickoff}`}>{formatMatchDate(match.matchDate)}</time>
                <time dateTime={`${match.matchDate}T${match.kickoff}`}>{match.kickoff}</time>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="min-w-0 font-bold" data-testid={`text-match-teams-${pkg.id}-${index}`}>{match.homeTeam} <span className="text-muted-foreground">vs</span> {match.awayTeam}</p>
                <p className="shrink-0 text-sm font-extrabold text-gold" data-testid={`text-match-odds-${pkg.id}-${index}`}>{match.odds.toFixed(2)}</p>
              </div>
              <p className="mt-3 rounded-lg bg-secondary/50 px-3 py-2 text-sm font-semibold" data-testid={`text-match-selection-${pkg.id}-${index}`}>
                <span className="text-muted-foreground">Selection: </span>
                {formatMatchSelection(match.selection, match.homeTeam, match.awayTeam)}
              </p>
              <p
                className={`mt-2 inline-flex items-center gap-1.5 text-xs font-bold ${
                  match.result === "won" ? "text-win" : match.result === "lost" ? "text-loss" : "text-muted-foreground"
                }`}
                aria-label={`Match result: ${match.result}`}
                data-testid={`text-match-result-${pkg.id}-${index}`}
              >
                {match.result === "won" ? <><CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />Won</>
                  : match.result === "lost" ? <><CircleX className="h-3.5 w-3.5" aria-hidden="true" />Lost</>
                    : <><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Pending</>}
              </p>
            </article>
          ))}
          {pkg.matches.length > 0 && <div className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Total odds</span>
              <span className="font-display text-xl font-extrabold text-gold" data-testid={`text-total-odds-${pkg.id}`}>{pkg.totalOdds.toFixed(2)}</span>
            </div>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" data-testid={`text-stake-disclaimer-${pkg.id}`}>Disclaimer: Stake {pkg.stakeLevel}</p>
          </div>}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Access price</span>
            <span className="font-display text-xl font-extrabold" data-testid={`text-price-${pkg.id}`}>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden="true">💎</span>{pkg.priceDiamonds} Diamonds</span>
            </span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Cash price</span>
            <span className="font-mono text-sm font-bold tabular-nums text-foreground" data-testid={`text-cash-price-${pkg.id}`}>
              KES {new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(pkg.price)}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end">
        {hasAccess ? (
          compact ? <Link href="/tips" className="btn-blue rounded-lg px-4 py-2 text-sm font-bold" data-testid={`link-view-tips-${pkg.id}`}>View Tips</Link>
          : <span className="text-sm font-bold text-win">Unlocked</span>
        ) : !pkg.availableForPurchase ? (
          <span className="text-xs font-semibold text-muted-foreground" data-testid={`status-package-archived-${pkg.id}`}>No longer available</span>
        ) : (
          <Link href={`/purchase/${pkg.id}`} className="btn-gold rounded-lg px-4 py-2 text-sm font-extrabold" data-testid={`link-purchase-${pkg.id}`}>{accessExpired ? "Renew access" : "Purchase"}</Link>
        )}
        </div>
      </div>
    </div>
  );
}
