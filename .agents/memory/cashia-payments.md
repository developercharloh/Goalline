---
name: Cashia payments
description: Provider choice and constraints from the user's uploaded merchant checkout examples
---

The user stated: “I use cashia for payments checkouts.” Do not substitute Stripe or Whop without asking.

**Why:** The user already uses Cashia.

**How to apply:** Keep Cashia as the provider when completing wallet checkout.

The supplied Postman files describe hosted session creation, not authenticated settlement or response schemas. Their environment uses KES, while the design reference uses USD. Do not assume a currency conversion or credit a wallet from a browser success redirect.

**Why:** A session request is not proof of payment; mixing KES and USD would credit incorrect amounts.

**How to apply:** Obtain Cashia's response and authenticated webhook/status documentation and settle currency/amount units before enabling funded wallets.
