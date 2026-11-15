---
name: Cashia payments
description: Provider choice and constraints from the user's uploaded merchant checkout examples
---

The user stated: “I use cashia for payments checkouts.” Do not substitute Stripe or Whop without asking.

**Why:** The user already uses Cashia.

**How to apply:** Keep Cashia as the provider when completing wallet checkout.

The user chose KES for the wallet and Cashia deposits. The supplied Postman files describe hosted session creation, not settlement. Public Cashia docs expose transaction-status inquiry but do not explain how hosted-checkout session IDs map to transaction IDs or document signed webhook payloads. Do not assume USD conversion or credit a wallet from a browser redirect.

**Why:** A session request is not proof of payment; mixing KES and USD would credit incorrect amounts.

**How to apply:** Keep deposits and wallet balances in KES. Require a Cashia status response that matches the merchant request, amount, and currency before crediting funds; get the missing ID mapping and production endpoint before enabling live deposits.
