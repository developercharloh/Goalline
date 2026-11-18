---
name: PayHero payments
description: PayHero's M-Pesa STK flow and settlement verification for ProBet Tips
---

The user asked to add PayHero for Safaricom M-Pesa Express while Cashia integration continues.

**Why:** PayHero is the requested parallel deposit route while Cashia access is being resolved.

**How to apply:** Keep Cashia available as its own integration. For PayHero, use its Basic-auth API, KES integer STK amount, active M-Pesa payment channel, and Kenyan phone number. Auto-select only a unique active M-Pesa channel; otherwise require a configured channel ID.

PayHero's public developer docs describe callbacks but do not document a signature. A callback or browser redirect alone is not settlement proof.

**Why:** An unsigned callback can be forged.

**How to apply:** Confirm the exact PayHero reference and M-Pesa checkout ID through the authenticated transaction-status API, match the amount to the saved request, and credit the deposit exactly once.
