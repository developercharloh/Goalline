import { useState } from "react";
import { useCreateCashiaDeposit, useGetWallet } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Lock, Wallet } from "lucide-react";
import { errMsg, money } from "@/lib/probet";

const PRESETS = [100, 500, 1000, 2000];

export function TopUpDialog({ open, onOpenChange, provider = "Cashia" }: { open: boolean; onOpenChange: (o: boolean) => void; provider?: string }) {
  const [amount, setAmount] = useState("100");
  const [err, setErr] = useState("");
  const wallet = useGetWallet({ query: { enabled: open } });
  const checkout = useCreateCashiaDeposit();
  const testReady = wallet.data?.stagingCheckoutEnabled === true;

  function close(value: boolean) {
    if (checkout.isPending) return;
    setErr("");
    checkout.reset();
    onOpenChange(value);
  }

  function next() {
    const value = Number(amount);
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !Number.isFinite(value) || value < 1 || value > 100000) {
      setErr("Enter KSh 1 to KSh 100,000 with at most two decimal places.");
      return;
    }
    setErr("");
    checkout.mutate({ data: { amount: value } }, {
      onSuccess: (session) => {
        // The server has validated the Cashia hostname; keep the browser check
        // too so an unexpected API response cannot become an open redirect.
        const url = new URL(session.checkoutUrl);
        if (url.protocol !== "https:" || url.hostname !== "staging.cashia.com") {
          setErr("The checkout URL could not be verified.");
          return;
        }
        window.location.assign(url.href);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="glass border-[hsl(217_80%_40%/.4)] sm:max-w-md" data-testid="dialog-topup">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2"><Wallet className="h-5 w-5 text-gold" />Top Up Wallet</DialogTitle>
          <DialogDescription>Deposits use Kenyan shillings (KES). Withdrawals are not available.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((value) => (
            <button key={value} type="button" disabled={checkout.isPending} onClick={() => setAmount(String(value))} data-testid={`button-preset-${value}`}
              className={`rounded-xl py-2.5 font-bold text-sm ${amount === String(value) ? "btn-blue" : "bg-secondary hover:bg-secondary/70"}`}>{value.toLocaleString("en-KE")}</button>
          ))}
        </div>
        <label className="text-sm text-muted-foreground" htmlFor="topup-amount">Amount in KSh</label>
        <div className="flex items-center rounded-xl bg-[hsl(224_60%_9%)] border border-input px-3 focus-within:ring-2 ring-ring">
          <span className="text-muted-foreground font-bold">KSh</span>
          <input id="topup-amount" inputMode="decimal" disabled={checkout.isPending} value={amount} onChange={(event) => setAmount(event.target.value)}
            className="w-full bg-transparent py-3 px-2 outline-none text-lg font-bold" data-testid="input-topup-amount" />
        </div>
        <p className="text-sm text-muted-foreground">{testReady
          ? `Test checkout only: ${money(Number(amount) || 0)}. Do not use real payment details. No real funds will be credited.`
          : "Deposits are not available yet. Cashia merchant setup and payment verification must be confirmed before funds can be accepted."}</p>
        {(err || checkout.error || wallet.error) && <p className="text-sm text-loss" role="alert" data-testid="text-topup-error">{err || errMsg(checkout.error || wallet.error)}</p>}
        <button type="button" disabled={!testReady || checkout.isPending || wallet.isLoading} onClick={next}
          className="btn-green w-full rounded-xl py-3 font-bold disabled:opacity-50" data-testid="button-continue-topup">
          {checkout.isPending ? "Opening test checkout..." : wallet.isLoading ? "Checking availability..." : testReady ? `Test ${provider} Checkout` : "Deposits Not Enabled"}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" />Wallet credit requires verified payment</p>
      </DialogContent>
    </Dialog>
  );
}
