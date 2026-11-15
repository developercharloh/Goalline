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

The user reports that their Cashia account does not display a coin serial. Do not repeatedly send them back to the dashboard to find one.

**Why:** The user explicitly checked and could not find this identifier.

**How to apply:** Retrieve the merchant's KES wallet identifier through the authenticated wallet-list API when accessible. Never substitute a documentation example or another currency's wallet.

Cashia's merchant staging API can return an HTML Cloudflare denial instead of a JSON API response.

**Why:** This external access restriction prevented wallet discovery and checkout testing; it did not establish whether the supplied credentials were valid.

**How to apply:** Distinguish gateway access failures from API authentication errors. Do not repeatedly request replacement credentials or bypass the provider's access controls.

The user wants two deposit choices: Safaricom M-Pesa Express marked “Coming soon”, and Manual M-Pesa Deposit marked “Recommended”. Manual payment goes to a Till; the payer submits the M-Pesa message, amount, first and last names for review, and credit is added only after approval.

**Why:** The user requested a manual payment alternative while Cashia access is unresolved.

**How to apply:** Never auto-approve from pasted SMS. Keep the merchant's actual Till configurable and require an authorised reviewer to verify the merchant statement before crediting.
