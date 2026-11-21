import { Link } from "wouter";
import type { TipPackage } from "@workspace/api-client-react";
import { money } from "@/lib/probet";
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

export function TipCard({ pkg, compact = false }: { pkg: TipPackage; compact?: boolean }) {
  return (
    <div className="gold-card rounded-2xl p-5 transition-transform hover:-translate-y-0.5" data-testid={`card-package-${pkg.id}`}>
      <h3 className="font-display text-xl font-extrabold" data-testid={`text-package-title-${pkg.id}`}>{pkg.title}</h3>

      {pkg.purchased && !compact && (
        <div className="mt-4 space-y-3">
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
            </article>
          ))}
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Total odds</span>
              <span className="font-display text-xl font-extrabold text-gold" data-testid={`text-total-odds-${pkg.id}`}>{pkg.totalOdds.toFixed(2)}</span>
            </div>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" data-testid={`text-stake-disclaimer-${pkg.id}`}>Disclaimer: Stake {pkg.stakeLevel}</p>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="font-display text-2xl font-extrabold" data-testid={`text-price-${pkg.id}`}>{pkg.price === 0 ? "Free" : money(pkg.price)}</span>
        {pkg.purchased ? (
          compact ? <Link href="/tips" className="btn-blue rounded-lg px-4 py-2 text-sm font-bold" data-testid={`link-view-tips-${pkg.id}`}>View Tips</Link>
          : <span className="text-sm font-bold text-win">Unlocked</span>
        ) : pkg.matchCount === 0 ? (
          <span className="text-xs font-semibold text-muted-foreground" data-testid={`status-no-matches-${pkg.id}`}>Fixtures pending</span>
        ) : (
          <Link href={`/purchase/${pkg.id}`} className="btn-gold rounded-lg px-4 py-2 text-sm font-extrabold" data-testid={`link-purchase-${pkg.id}`}>{pkg.price === 0 ? "Get Free VIP" : "Purchase"}</Link>
        )}
      </div>
    </div>
  );
}
