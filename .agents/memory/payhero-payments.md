---
name: PayHero payments
description: PayHero's M-Pesa STK flow and settlement verification for ProBet Tips
---

The user asked to add PayHero for Safaricom M-Pesa Express while Cashia integration continues.

**Why:** PayHero is the requested parallel deposit route while Cashia access is being resolved.

**How to apply:** Keep Cashia available as its own integration. For PayHero, use its Basic-auth API, KES integer STK amount, active M-Pesa payment channel, and Kenyan phone number. Auto-select only a unique active M-Pesa channel; otherwise require a configured channel ID.

PayHero's public developer docs describe callbacks but do not document a signature. Its transaction-status response can leave `payment_reference` and `CheckoutRequestID` blank even for a successful STK payment.

**Why:** An unsigned callback can be forged, and requiring optional status fields caused confirmed live payments to remain pending.

**How to apply:** Re-query the authenticated transaction-status API by the exact saved PayHero reference; require `SUCCESS`, the M-Pesa provider, exact amount, and a receipt. Match `payment_reference` only when non-empty, and do not require the status response's checkout ID. Credit each deposit exactly once.
