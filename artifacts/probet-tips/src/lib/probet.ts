import type { QueryClient } from "@tanstack/react-query";
import {
  getGetDashboardQueryKey,
  getGetWalletQueryKey,
  getGetTransactionsQueryKey,
  getGetTipsQueryKey,
} from "@workspace/api-client-react";

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function money(n: number | undefined | null, currency = "USD") {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(v);
}

export function errMsg(e: unknown): string {
  if (!e) return "Something went wrong.";
  const anyE = e as { data?: unknown; message?: string };
  const d = anyE.data as { error?: string; message?: string } | string | null | undefined;
  if (typeof d === "string" && d) return d;
  if (d && typeof d === "object") {
    if (d.error) return d.error;
    if (d.message) return d.message;
  }
  return anyE.message || "Something went wrong.";
}

export function invalidateMoney(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  qc.invalidateQueries({ queryKey: getGetWalletQueryKey() });
  qc.invalidateQueries({ queryKey: getGetTransactionsQueryKey() });
  qc.invalidateQueries({ queryKey: getGetTipsQueryKey() });
}

export function fmtDate(s: string) {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
