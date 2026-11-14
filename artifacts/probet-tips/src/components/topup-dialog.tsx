import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle, ArrowLeft, Lock, Wallet } from "lucide-react";

const PRESETS = [5, 10, 20, 50];

export function TopUpDialog({ open, onOpenChange, provider = "Cashia" }: { open: boolean; onOpenChange: (o: boolean) => void; provider?: string }) {
  const [amount, setAmount] = useState("10");
  const [step, setStep] = useState<"amount" | "unavailable">("amount");
  const [err, setErr] = useState("");

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) setTimeout(() => { setStep("amount"); setErr(""); }, 200);
  }

  function next() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 1) return setErr("Enter an amount of at least $1.");
    if (n > 1000) return setErr("Maximum single top up is $1,000.");
    setErr("");
    setStep("unavailable");
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="glass border-[hsl(217_80%_40%/.4)] sm:max-w-md" data-testid="dialog-topup">
        {step === "amount" ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl flex items-center gap-2"><Wallet className="h-5 w-5 text-gold" />Top Up Wallet</DialogTitle>
              <DialogDescription>Choose an amount. Funds can only be used for premium tips — withdrawals are not available.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => setAmount(String(p))} data-testid={`button-preset-${p}`}
                  className={`rounded-xl py-2.5 font-bold transition-all ${amount === String(p) ? "btn-blue" : "bg-secondary hover:bg-secondary/70"}`}>${p}</button>
              ))}
            </div>
            <label className="text-sm text-muted-foreground" htmlFor="topup-amount">Custom amount (USD)</label>
            <div className="flex items-center rounded-xl bg-[hsl(224_60%_9%)] border border-input px-3 focus-within:ring-2 ring-ring">
              <span className="text-muted-foreground font-bold">$</span>
              <input id="topup-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-full bg-transparent py-3 px-2 outline-none text-lg font-bold" data-testid="input-topup-amount" />
            </div>
            {err && <p className="text-sm text-loss" data-testid="text-topup-error">{err}</p>}
            <button type="button" onClick={next} className="btn-green w-full rounded-xl py-3 font-bold" data-testid="button-continue-topup">
              Continue to {provider}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" />Payments processed by {provider}</p>
          </>
        ) : (
          <div className="text-center py-2 rise" data-testid="status-checkout-unavailable">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[hsl(43_96%_56%/.15)] border border-[hsl(43_96%_56%/.5)]">
              <AlertTriangle className="h-7 w-7 text-gold" />
            </div>
            <DialogTitle className="font-display text-xl">{provider} checkout unavailable</DialogTitle>
            <DialogDescription className="mt-2">
              Top ups are awaiting {provider} secure settlement setup. Your request for <b className="text-foreground">${Number(amount).toFixed(2)} USD</b> was not processed — nothing was charged and no funds were added.
            </DialogDescription>
            <p className="mt-3 text-xs text-muted-foreground">{provider} staging settles in KES while this wallet is in USD. We never convert or send USD amounts as KES, so checkout stays off until settlement is verified.</p>
            <div className="mt-5 grid gap-2">
              <button type="button" onClick={() => setStep("amount")} className="rounded-xl bg-secondary py-2.5 font-semibold flex items-center justify-center gap-2 hover:bg-secondary/70" data-testid="button-back-topup"><ArrowLeft className="h-4 w-4" />Change amount</button>
              <button type="button" onClick={() => close(false)} className="btn-blue rounded-xl py-2.5 font-bold" data-testid="button-close-topup">Got it</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
