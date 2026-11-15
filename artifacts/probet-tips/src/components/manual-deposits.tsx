import type { ManualDeposit } from "@workspace/api-client-react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

export function StatusPill({ status }: { status: ManualDeposit["status"] }) {
  const map = {
    pending: { c: "bg-[hsl(43_96%_56%/.14)] text-gold", I: Clock, t: "Pending" },
    approved: { c: "bg-[hsl(142_72%_50%/.14)] text-win", I: CheckCircle2, t: "Approved" },
    rejected: { c: "bg-[hsl(0_84%_60%/.14)] text-loss", I: XCircle, t: "Rejected" },
  }[status];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${map.c}`} data-testid={`status-${status}`}><map.I className="h-3.5 w-3.5" />{map.t}</span>;
}

