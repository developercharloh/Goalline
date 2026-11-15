import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetManualDepositConfig, getGetManualDepositConfigQueryKey, useSubmitManualDeposit, getGetManualDepositsQueryKey, getGetManualDepositReviewsQueryKey,
} from "@workspace/api-client-react";
import type { ManualDeposit } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, ChevronLeft, Clock, Lock, ShieldCheck, Smartphone, Wallet, Zap } from "lucide-react";
import { errMsg, invalidateMoney, money } from "@/lib/probet";

type Step = "choose" | "manual" | "done";
const EMPTY = { firstName: "", lastName: "", amount: "", message: "" };

export function TopUpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void; provider?: string }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("choose");
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<ManualDeposit | null>(null);
  const config = useGetManualDepositConfig({ query: { enabled: open, queryKey: getGetManualDepositConfigQueryKey() } });
  const submit = useSubmitManualDeposit();
  const cfg = config.data;
  const enabled = cfg?.enabled === true;

  // Reset everything each time the dialog is (re)opened.
  useEffect(() => {
    if (open) { setStep("choose"); setForm(EMPTY); setErr(""); setDone(null); submit.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close(v: boolean) { if (submit.isPending) return; onOpenChange(v); }
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function send() {
    if (!enabled || submit.isPending) return;
    const firstName = form.firstName.trim(), lastName = form.lastName.trim(), mpesaMessage = form.message.trim();
    const amount = Number(form.amount);
    if (!firstName || !lastName) return setErr("Enter your first and last name as they appear on M-Pesa.");
    if (firstName.length > 80 || lastName.length > 80) return setErr("Names must be 80 characters or fewer.");
    if (!/^\d+(?:\.\d{1,2})?$/.test(form.amount.trim()) || amount < 1 || amount > 100000) return setErr("Enter an amount between KSh 1 and KSh 100,000.");
    if (mpesaMessage.length < 20) return setErr("Paste the full M-Pesa confirmation message.");
    if (mpesaMessage.length > 3000) return setErr("The message is too long. Paste only the M-Pesa confirmation.");
    setErr("");
    submit.mutate({ data: { firstName, lastName, amount, mpesaMessage } }, {
      onSuccess: (d) => {
        setDone(d); setStep("done"); setForm(EMPTY);
        qc.invalidateQueries({ queryKey: getGetManualDepositsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetManualDepositReviewsQueryKey() });
        invalidateMoney(qc);
      },
    });
  }

  const field = "w-full rounded-xl bg-[hsl(224_60%_9%)] border border-input px-3 py-3 outline-none focus:ring-2 ring-ring disabled:opacity-60";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="glass border-[hsl(217_80%_40%/.4)] sm:max-w-md max-h-[92dvh] overflow-y-auto" data-testid="dialog-topup">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            {step === "manual" && <button type="button" onClick={() => setStep("choose")} disabled={submit.isPending} aria-label="Back" className="rounded-lg p-1 hover:bg-secondary" data-testid="button-deposit-back"><ChevronLeft className="h-5 w-5" /></button>}
            <Wallet className="h-5 w-5 text-gold" />{step === "choose" ? "Deposit Funds" : step === "manual" ? "Manual M-Pesa Deposit" : "Deposit Submitted"}
          </DialogTitle>
          <DialogDescription>Kenyan shillings (KES) only. Withdrawals are not available.</DialogDescription>
        </DialogHeader>

        {step === "choose" && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-[hsl(224_60%_9%)] p-4 opacity-60" aria-disabled="true" data-testid="option-mpesa-express">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary"><Zap className="h-5 w-5 text-muted-foreground" /></div>
                <div className="flex-1"><p className="font-bold">Safaricom M-Pesa Express</p><p className="text-xs text-muted-foreground">STK push to your phone</p></div>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-muted-foreground">Coming soon</span>
              </div>
            </div>
            <button type="button" onClick={() => setStep("manual")} className="w-full text-left rounded-2xl border-[1.5px] border-[hsl(142_72%_50%/.6)] bg-[hsl(142_72%_50%/.07)] p-4 hover:bg-[hsl(142_72%_50%/.12)] transition-colors" data-testid="option-manual-mpesa">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl btn-green"><Smartphone className="h-5 w-5" /></div>
                <div className="flex-1"><p className="font-bold">Manual M-Pesa Deposit</p><p className="text-xs text-muted-foreground">Pay, then paste your confirmation SMS</p></div>
                <span className="rounded-full bg-[hsl(142_72%_50%/.18)] px-2.5 py-1 text-[11px] font-bold text-win">Recommended</span>
              </div>
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" />Every deposit is checked by a person before credit</p>
          </div>
        )}

        {step === "manual" && (
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-3">
            {config.isLoading ? <div className="h-20 rounded-xl bg-secondary animate-pulse" /> : config.error ? (
              <div className="rounded-xl border border-[hsl(0_84%_60%/.5)] bg-[hsl(0_84%_60%/.1)] p-3 text-sm" role="alert">
                <p className="text-loss">{errMsg(config.error)}</p>
                <button type="button" onClick={() => config.refetch()} className="mt-2 font-bold text-primary" data-testid="button-config-retry">Try again</button>
              </div>
            ) : enabled && cfg?.tillNumber ? (
              <div className="rounded-2xl gold-card p-4" data-testid="card-till-instructions">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Lipa na M-Pesa</p>
                <ol className="mt-2 space-y-1 text-sm list-decimal pl-5">
                  <li>Open M-Pesa, choose <b>Lipa na M-Pesa</b> then <b>Buy Goods and Services</b>.</li>
                  <li>Till number <span className="font-display text-lg font-extrabold text-gold" data-testid="text-till-number">{cfg.tillNumber}</span></li>
                  {cfg.businessName && <li>Confirm the name shows <b data-testid="text-business-name">{cfg.businessName}</b>.</li>}
                  <li>Pay, then paste the full confirmation SMS below.</li>
                </ol>
                {cfg.message && <p className="mt-2 text-xs text-muted-foreground">{cfg.message}</p>}
              </div>
            ) : (
              <div className="rounded-xl border border-[hsl(43_96%_56%/.5)] bg-[hsl(43_96%_56%/.08)] p-3 text-sm" role="status" data-testid="status-manual-disabled">
                <p className="font-bold text-gold">Manual deposits are not open yet</p>
                <p className="text-muted-foreground mt-1">{cfg?.message || "Payment details will appear here once available. Do not send money yet."}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">First name<input value={form.firstName} onChange={set("firstName")} maxLength={80} autoComplete="given-name" disabled={submit.isPending} className={`${field} mt-1 text-sm text-foreground`} data-testid="input-first-name" /></label>
              <label className="text-xs text-muted-foreground">Last name<input value={form.lastName} onChange={set("lastName")} maxLength={80} autoComplete="family-name" disabled={submit.isPending} className={`${field} mt-1 text-sm text-foreground`} data-testid="input-last-name" /></label>
            </div>
            <label className="block text-xs text-muted-foreground">Amount paid
              <div className="mt-1 flex items-center rounded-xl bg-[hsl(224_60%_9%)] border border-input px-3 focus-within:ring-2 ring-ring">
                <span className="font-bold">KSh</span>
                <input inputMode="decimal" value={form.amount} onChange={set("amount")} disabled={submit.isPending} placeholder="0" className="w-full bg-transparent py-3 px-2 outline-none text-lg font-bold text-foreground" data-testid="input-deposit-amount" />
              </div>
            </label>
            <label className="block text-xs text-muted-foreground">Full M-Pesa confirmation message
              <textarea value={form.message} onChange={set("message")} rows={4} maxLength={3000} disabled={submit.isPending} placeholder="Paste the whole SMS, starting with the transaction code" className={`${field} mt-1 text-sm text-foreground resize-none font-mono`} data-testid="input-mpesa-message" />
            </label>
            <p className="flex gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />An SMS is not proof on its own. Your deposit stays pending until we match it on our Safaricom merchant statement.</p>
            {(err || submit.error) && <p className="text-sm text-loss" role="alert" data-testid="text-deposit-error">{err || errMsg(submit.error)}</p>}
            <button type="submit" disabled={!enabled || submit.isPending || config.isLoading} className="btn-green w-full rounded-xl py-3 font-bold disabled:opacity-50" data-testid="button-submit-deposit">
              {submit.isPending ? "Submitting..." : enabled ? "Submit for Review" : "Deposits Not Open"}
            </button>
          </form>
        )}

        {step === "done" && done && (
          <div className="text-center" role="status" data-testid="status-deposit-submitted">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border-4 border-[hsl(142_72%_50%)] pop"><Check className="h-8 w-8 text-win" strokeWidth={3} /></div>
            <p className="font-display text-2xl font-extrabold mt-3">{money(done.amount)}</p>
            <p className="text-sm text-muted-foreground">Receipt <span className="font-mono font-bold text-foreground">{done.receiptCode}</span></p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[hsl(43_96%_56%/.12)] px-3 py-1 text-xs font-bold text-gold"><Clock className="h-3.5 w-3.5" />Pending review</p>
            <p className="mt-3 text-sm text-muted-foreground">We will check this against our merchant statement. Track it under Deposit requests on your wallet.</p>
            <button type="button" onClick={() => onOpenChange(false)} className="btn-blue w-full mt-5 rounded-xl py-3 font-bold" data-testid="button-deposit-done">Done</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

