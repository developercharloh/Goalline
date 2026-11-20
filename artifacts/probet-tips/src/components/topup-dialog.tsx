import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreatePayheroDeposit, useGetPayheroConfig, useGetPayheroDepositStatus } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, LoaderCircle, ShieldCheck, Wallet } from "lucide-react";
import { useLocation } from "wouter";
import { errMsg, invalidateMoney, money } from "@/lib/probet";

type Step = "request" | "waiting" | "done";

export function TopUpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(() => window.sessionStorage.getItem("probet-payhero-pending"));
  const [step, setStep] = useState<Step>(() => window.sessionStorage.getItem("probet-payhero-pending") ? "waiting" : "request");
  const [form, setForm] = useState({ amount: "", phoneNumber: "" });
  const [err, setErr] = useState("");
  const [confirmedAmount, setConfirmedAmount] = useState<number | null>(null);
  const payheroConfig = useGetPayheroConfig({ query: { enabled: open, refetchOnWindowFocus: true } });
  const createPayhero = useCreatePayheroDeposit();
  const payheroStatus = useGetPayheroDepositStatus(pendingRequestId ?? "", {
    query: {
      enabled: open && step === "waiting" && Boolean(pendingRequestId),
      refetchInterval: (query) => query.state.data?.status === "pending" ? 3000 : false,
    },
  });
  const payheroEnabled = payheroConfig.data?.enabled === true;

  // Keep a pending M-Pesa request visible when the dialog is closed and reopened.
  useEffect(() => {
    if (open && !pendingRequestId) {
      setStep("request"); setForm({ amount: "", phoneNumber: "" }); setErr("");
      setConfirmedAmount(null); createPayhero.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingRequestId]);

  useEffect(() => {
    if (payheroStatus.data?.status === "credited") {
      setConfirmedAmount(payheroStatus.data.amount);
      setStep("done");
      setPendingRequestId(null);
      window.sessionStorage.removeItem("probet-payhero-pending");
      invalidateMoney(qc);
    } else if (payheroStatus.data?.status === "failed") {
      setStep("request");
      setPendingRequestId(null);
      window.sessionStorage.removeItem("probet-payhero-pending");
      setErr(payheroStatus.data.message);
    }
  }, [payheroStatus.data, qc]);

  useEffect(() => {
    if (step !== "done") return;
    const timeout = window.setTimeout(() => {
      onOpenChange(false);
      setLocation("/");
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [step, onOpenChange, setLocation]);

  function close(v: boolean) {
    if (createPayhero.isPending) return;
    onOpenChange(v);
  }

  function startPayment() {
    if (payheroEnabled !== true || createPayhero.isPending) return;
    const amount = Number(form.amount);
    const phoneNumber = form.phoneNumber.trim();
    if (!/^\d+$/.test(form.amount.trim()) || amount < 1 || amount > 100000) {
      setErr("Enter a whole amount from KSh 1 to KSh 100,000.");
      return;
    }
    if (!/^(?:\+?254[17]\d{8}|0[17]\d{8})$/.test(phoneNumber.replace(/[\s()-]/g, ""))) {
      setErr("Enter a valid Safaricom phone number.");
      return;
    }
    setErr("");
    createPayhero.mutate({ data: { amount, phoneNumber } }, {
      onSuccess: (result) => {
        setPendingRequestId(result.requestId);
        window.sessionStorage.setItem("probet-payhero-pending", result.requestId);
        setStep("waiting");
      },
    });
  }

  const field = "w-full rounded-xl bg-[hsl(224_60%_9%)] border border-input px-3 py-3 outline-none focus:ring-2 ring-ring disabled:opacity-60";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="glass border-[hsl(217_80%_40%/.4)] sm:max-w-md max-h-[92dvh] overflow-y-auto" data-testid="dialog-topup">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Wallet className="h-5 w-5 text-gold" />
            {step === "request" ? "M-Pesa Express" : step === "waiting" ? "Confirming Payment" : "Payment Successful"}
          </DialogTitle>
          <DialogDescription>Deposit funds to your wallet with M-Pesa.</DialogDescription>
        </DialogHeader>

        {step === "request" && (
          <form onSubmit={(e) => { e.preventDefault(); startPayment(); }} className="space-y-3">
            <label className="block text-xs text-muted-foreground">Safaricom phone number
              <input inputMode="tel" autoComplete="tel" value={form.phoneNumber} onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))} maxLength={16} disabled={createPayhero.isPending} placeholder="0712 345 678" className={`${field} mt-1 text-sm text-foreground`} data-testid="input-mpesa-phone" />
            </label>
            <label className="block text-xs text-muted-foreground">Amount to deposit
              <div className="mt-1 flex items-center rounded-xl bg-[hsl(224_60%_9%)] border border-input px-3 focus-within:ring-2 ring-ring">
                <span className="font-bold">KSh</span>
                <input inputMode="numeric" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} disabled={createPayhero.isPending} placeholder="0" className="w-full bg-transparent py-3 px-2 outline-none text-lg font-bold text-foreground" data-testid="input-mpesa-amount" />
              </div>
            </label>
            <p className="flex gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />An M-Pesa prompt will be sent to your phone. Your balance updates after payment is confirmed.</p>
            {payheroConfig.error && <p className="text-sm text-loss" role="alert">M-Pesa Express is temporarily unavailable. Please try again.</p>}
            {payheroConfig.data && !payheroEnabled && <p className="text-sm text-loss" role="alert">M-Pesa Express is temporarily unavailable. Please try again later.</p>}
            {(err || createPayhero.error) && <p className="text-sm text-loss" role="alert">{err || errMsg(createPayhero.error)}</p>}
            <button type="submit" disabled={!payheroEnabled || createPayhero.isPending} className="btn-blue w-full rounded-xl py-3 font-bold disabled:opacity-50" data-testid="button-start-mpesa">
              {createPayhero.isPending ? "Sending request..." : "Send M-Pesa Request"}
            </button>
          </form>
        )}

        {step === "waiting" && (
          <div className="text-center space-y-3" role="status" data-testid="status-mpesa-pending">
            {payheroStatus.isError ? (
              <>
                <p className="text-sm text-loss" role="alert">We couldn’t check your payment yet. Please try again.</p>
                <button type="button" onClick={() => payheroStatus.refetch()} className="btn-blue w-full rounded-xl py-3 font-bold">Check Payment Again</button>
              </>
            ) : (
              <>
                <LoaderCircle className="h-10 w-10 mx-auto text-primary animate-spin" />
                <p className="font-bold">Approve the M-Pesa prompt on your phone.</p>
                <p className="text-sm text-muted-foreground">{payheroStatus.data?.message || "Waiting for payment confirmation."}</p>
                {payheroStatus.data && <p className="font-display text-xl font-extrabold">{money(payheroStatus.data.amount)}</p>}
              </>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="text-center" role="status" data-testid="status-mpesa-success">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border-4 border-[hsl(142_72%_50%)] pop"><Check className="h-8 w-8 text-win" strokeWidth={3} /></div>
            <p className="font-display text-2xl font-extrabold mt-3">Payment Successful</p>
            <p className="text-sm text-muted-foreground mt-1">{confirmedAmount === null ? "Your balance has been updated." : `${money(confirmedAmount)} has been added to your wallet.`}</p>
            <p className="text-xs text-muted-foreground mt-3">Returning to Home…</p>
            <button type="button" onClick={() => { onOpenChange(false); setLocation("/"); }} className="btn-blue w-full mt-4 rounded-xl py-3 font-bold" data-testid="button-mpesa-home">Go to Home</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

