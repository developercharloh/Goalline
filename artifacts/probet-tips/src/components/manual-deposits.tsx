import { useGetManualDeposits, getGetManualDepositsQueryKey } from "@workspace/api-client-react";
import type { ManualDeposit } from "@workspace/api-client-react";
import { CheckCircle2, Clock, Inbox, XCircle } from "lucide-react";
import { ErrorCard, Sk } from "@/components/app-shell";
import { errMsg, fmtDate, money } from "@/lib/probet";

export function StatusPill({ status }: { status: ManualDeposit["status"] }) {
  const map = {
    pending: { c: "bg-[hsl(43_96%_56%/.14)] text-gold", I: Clock, t: "Pending" },
    approved: { c: "bg-[hsl(142_72%_50%/.14)] text-win", I: CheckCircle2, t: "Approved" },
    rejected: { c: "bg-[hsl(0_84%_60%/.14)] text-loss", I: XCircle, t: "Rejected" },
  }[status];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${map.c}`} data-testid={`status-${status}`}><map.I className="h-3.5 w-3.5" />{map.t}</span>;
}

export function ManualDepositHistory() {
  const q = useGetManualDeposits({ query: { queryKey: getGetManualDepositsQueryKey(), refetchInterval: 15000 } });
  if (q.isLoading) return <div className="space-y-2"><Sk className="h-20" /><Sk className="h-20" /></div>;
  if (q.error) return <ErrorCard message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const items = q.data ?? [];
  if (!items.length) return (
    <div className="glass rounded-2xl p-6 text-center" data-testid="status-empty-deposits">
      <Inbox className="h-9 w-9 mx-auto text-primary" />
      <p className="font-bold mt-2">No deposit requests yet</p>
      <p className="text-sm text-muted-foreground">Manual M-Pesa deposits you submit will be tracked here.</p>
    </div>
  );
  return (
    <ul className="space-y-2" data-testid="list-manual-deposits">
      {items.map((d) => (
        <li key={d.id} className="glass rounded-2xl p-4 rise" data-testid={`row-deposit-${d.id}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-lg font-extrabold">{money(d.amount)}</p>
              <p className="text-xs text-muted-foreground"><span className="font-mono text-foreground">{d.receiptCode}</span> · {fmtDate(d.createdAt)}</p>
            </div>
            <StatusPill status={d.status} />
          </div>
          {d.status === "pending" && <p className="mt-2 text-xs text-muted-foreground">Waiting for a check against the Safaricom merchant statement.</p>}
          {d.note && <p className="mt-2 rounded-lg bg-[hsl(224_60%_9%)] px-3 py-2 text-sm" data-testid={`text-deposit-note-${d.id}`}><span className="text-muted-foreground">Reviewer note: </span>{d.note}</p>}
        </li>
      ))}
    </ul>
  );
}
