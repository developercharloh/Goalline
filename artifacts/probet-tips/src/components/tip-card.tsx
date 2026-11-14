import { Link } from "wouter";
import { Crown, Lock, CheckSquare, Unlock } from "lucide-react";
import type { TipPackage } from "@workspace/api-client-react";
import { money } from "@/lib/probet";

export function TipCard({ pkg, compact = false }: { pkg: TipPackage; compact?: boolean }) {
  return (
    <div className="gold-card rounded-2xl p-5 transition-transform hover:-translate-y-0.5" data-testid={`card-package-${pkg.id}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1 rounded-md btn-gold px-2 py-0.5 text-xs font-extrabold"><Crown className="h-3.5 w-3.5" />Premium</span>
        <div className="flex items-center gap-2">
          {pkg.isSample && <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground border border-border rounded-full px-2 py-0.5">Sample matches</span>}
          {pkg.purchased ? <Unlock className="h-5 w-5 text-win" aria-label="Unlocked" /> : <Lock className="h-5 w-5 text-foreground/80" aria-label="Locked" />}
        </div>
      </div>
      <h3 className="font-display text-xl font-extrabold mt-3" data-testid={`text-package-title-${pkg.id}`}>{pkg.title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>
      <p className="text-xs text-muted-foreground mt-1">{pkg.matchCount} matches</p>

      {pkg.purchased && !compact && (
        <ul className="mt-4 space-y-2">
          {pkg.tips.map((t, i) => (
            <li key={i} className="flex gap-3 rounded-xl bg-[hsl(224_60%_9%)] border border-border p-3 rise" style={{ animationDelay: `${i * 70}ms` }} data-testid={`row-tip-${pkg.id}-${i}`}>
              <CheckSquare className="h-5 w-5 text-win shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">{t.match}</div>
                <div className="text-sm">Tip: <span className="text-gold font-semibold">{t.prediction}</span></div>
                <div className="text-xs text-muted-foreground">{t.league}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="font-display text-2xl font-extrabold" data-testid={`text-price-${pkg.id}`}>{money(pkg.price)}</span>
        {pkg.purchased ? (
          compact ? <Link href="/tips" className="btn-blue rounded-lg px-4 py-2 text-sm font-bold" data-testid={`link-view-tips-${pkg.id}`}>View Tips</Link>
          : <span className="text-sm font-bold text-win">Unlocked</span>
        ) : (
          <Link href={`/purchase/${pkg.id}`} className="btn-gold rounded-lg px-4 py-2 text-sm font-extrabold" data-testid={`link-purchase-${pkg.id}`}>Purchase Ticket</Link>
        )}
      </div>
    </div>
  );
}
