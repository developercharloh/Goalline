import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetManualDepositReviews, useReviewManualDeposit, getGetManualDepositReviewsQueryKey, getGetManualDepositsQueryKey,
} from "@workspace/api-client-react";
import type { ManualDeposit } from "@workspace/api-client-react";
import { AlertTriangle, Inbox, LogIn, ShieldAlert } from "lucide-react";
import { AppShell, ErrorCard, PageHeader, Sk } from "@/components/app-shell";
import { StatusPill } from "@/components/manual-deposits";
import { errMsg, fmtDate, invalidateMoney, money } from "@/lib/probet";

type Filter = "pending" | "all";

export default function DepositReviewsPage() {
  const q = useGetManualDepositReviews({ query: { queryKey: getGetManualDepositReviewsQueryKey(), refetchInterval: 15000, retry: false } });
  const [filter, setFilter] = useState<Filter>("pending");
  const status = (q.error as { status?: number } | null)?.status;
  const items = (q.data ?? []).filter((d) => filter === "all" || d.status === "pending");

  return (
    <AppShell>
      <PageHeader title="Deposit Reviews" subtitle="Approve only after matching the receipt on the Safaricom merchant statement." />
      {q.isLoading ? <div className="space-y-3"><Sk className="h-48" /><Sk className="h-48" /></div>
        : status === 401 || status === 403 ? (
          <div className="glass rounded-3xl p-8 max-w-lg text-center" data-testid="status-access-denied">
            <ShieldAlert className="h-10 w-10 mx-auto text-loss" />
            <h2 className="font-display text-2xl font-extrabold mt-3">Reviewers only</h2>
            <p className="text-sm text-muted-foreground mt-2">This page is restricted to authorised deposit reviewers. If you are one, sign in with your reviewer account.</p>
            <div className="flex flex-wrap justify-center gap-3 mt-5">
              <Link href="/sign-in" className="btn-blue rounded-xl px-5 py-2.5 font-bold flex items-center gap-1.5" data-testid="link-reviews-signin"><LogIn className="h-4 w-4" />Sign in</Link>
              <Link href="/wallet" className="rounded-xl px-5 py-2.5 font-bold border border-border" data-testid="link-reviews-wallet">Back to wallet</Link>
            </div>
          </div>
        ) : q.error ? <ErrorCard message={errMsg(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            <div className="mb-4 inline-flex rounded-xl bg-secondary p-1">
              {(["pending", "all"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-lg px-4 py-1.5 text-sm font-bold ${filter === f ? "btn-blue" : "text-muted-foreground"}`} data-testid={`button-filter-${f}`}>
                  {f === "pending" ? `Pending (${(q.data ?? []).filter((d) => d.status === "pending").length})` : "All"}
                </button>
              ))}
            </div>
            {!items.length ? (
              <div className="glass rounded-2xl p-8 text-center" data-testid="status-empty-reviews">
                <Inbox className="h-10 w-10 mx-auto text-primary" />
                <p className="font-bold mt-2">{filter === "pending" ? "Queue is clear" : "No deposits yet"}</p>
                <p className="text-sm text-muted-foreground">New manual M-Pesa submissions appear here automatically.</p>
              </div>
            ) : <div className="grid gap-4 lg:grid-cols-2">{items.map((d) => <ReviewCard key={d.id} d={d} />)}</div>}
          </>
        )}
    </AppShell>
  );
}

function ReviewCard({ d }: { d: ManualDeposit }) {
  const qc = useQueryClient();
  const review = useReviewManualDeposit();
  const [note, setNote] = useState("");
  const [verified, setVerified] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState("");
  const pending = d.status === "pending";

  function act(decision: "approved" | "rejected") {
    const n = note.trim();
    if (n.length < 3) return setErr("Add a note of at least 3 characters.");
    if (n.length > 500) return setErr("Note must be 500 characters or fewer.");
    if (decision === "approved" && !verified) return setErr("Tick the statement check before approving.");
    if (decision === "approved" && !confirming) { setErr(""); return setConfirming(true); }
    setErr("");
    review.mutate({ id: d.id, data: { decision, note: n, verified } }, {
      onSuccess: () => {
        setNote(""); setVerified(false); setConfirming(false);
        qc.invalidateQueries({ queryKey: getGetManualDepositReviewsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetManualDepositsQueryKey() });
        invalidateMoney(qc);
      },
      onError: () => setConfirming(false),
    });
  }

  return (
    <article className={`glass rounded-2xl p-5 ${confirming ? "ring-2 ring-[hsl(142_72%_50%/.6)]" : ""}`} data-testid={`card-review-${d.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl font-extrabold" data-testid={`text-review-amount-${d.id}`}>{money(d.amount)}</p>
          <p className="text-sm font-semibold">{d.firstName} {d.lastName}</p>
          <p className="text-xs text-muted-foreground">Submitted {fmtDate(d.createdAt)}{d.reviewedAt ? ` · Reviewed ${fmtDate(d.reviewedAt)}` : ""}</p>
        </div>
        <StatusPill status={d.status} />
      </div>
      <div className="mt-3 rounded-xl border border-border bg-[hsl(224_60%_9%)] p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Receipt code</p>
        <p className="font-mono text-lg font-bold text-gold" data-testid={`text-receipt-${d.id}`}>{d.receiptCode}</p>
        <p className="mt-1 text-xs text-muted-foreground">Receiving Till: <b>{d.tillNumber}</b> · {d.businessName}</p>
        <p className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground max-h-32 overflow-y-auto">{d.mpesaMessage}</p>
      </div>
      {d.note && <p className="mt-3 text-sm"><span className="text-muted-foreground">Note: </span>{d.note}</p>}
      {pending && (
        <div className="mt-4 space-y-3">
          <p className="flex gap-2 rounded-xl bg-[hsl(43_96%_56%/.08)] border border-[hsl(43_96%_56%/.35)] p-3 text-xs"><AlertTriangle className="h-4 w-4 shrink-0 text-gold" />SMS text can be forged. Find this receipt code, amount and name on the actual Safaricom merchant statement before approving.</p>
          <textarea value={note} onChange={(e) => { setNote(e.target.value); setConfirming(false); }} rows={2} maxLength={500} disabled={review.isPending} placeholder="Review note (required)"
            className="w-full rounded-xl bg-[hsl(224_60%_9%)] border border-input px-3 py-2 text-sm outline-none focus:ring-2 ring-ring resize-none" data-testid={`input-review-note-${d.id}`} />
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={verified} onChange={(e) => { setVerified(e.target.checked); setConfirming(false); }} disabled={review.isPending} className="mt-0.5 h-4 w-4 accent-[hsl(142_72%_45%)]" data-testid={`checkbox-verified-${d.id}`} />
            I matched this receipt on the Safaricom merchant statement.
          </label>
          {(err || review.error) && <p className="text-sm text-loss" role="alert" data-testid={`text-review-error-${d.id}`}>{err || errMsg(review.error)}</p>}
          {confirming && <p className="text-sm font-semibold text-win" data-testid={`text-confirm-approve-${d.id}`}>Credit {money(d.amount)} to this wallet? This cannot be undone here.</p>}
          <div className="flex gap-2">
            {confirming ? (
              <button type="button" onClick={() => setConfirming(false)} disabled={review.isPending} className="flex-1 rounded-xl border border-border py-2.5 font-bold" data-testid={`button-cancel-approve-${d.id}`}>Cancel</button>
            ) : (
              <button type="button" onClick={() => act("rejected")} disabled={review.isPending} className="flex-1 rounded-xl border border-[hsl(0_84%_60%/.5)] py-2.5 font-bold text-loss hover:bg-[hsl(0_84%_60%/.1)] disabled:opacity-50" data-testid={`button-reject-${d.id}`}>Reject</button>
            )}
            <button type="button" onClick={() => act("approved")} disabled={review.isPending || !verified} className="btn-green flex-1 rounded-xl py-2.5 font-bold disabled:opacity-50" data-testid={`button-approve-${d.id}`}>
              {review.isPending ? "Saving..." : confirming ? "Confirm approval" : "Approve"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
