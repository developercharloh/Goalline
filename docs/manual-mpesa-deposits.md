# Manual Safaricom M-Pesa deposits

The deposit selector has two methods:

- **Safaricom M-Pesa Express** — Coming soon; no STK push request is sent.
- **Manual M-Pesa Deposit** — Recommended; disabled until the merchant provides the receiving Till and an authorised reviewer is configured.

## Activation

Do not invent a Till or use the synthetic Till from automated tests.

Set these non-secret settings in the target hosting environment only after the owner confirms them:

- `MPESA_TILL_NUMBER`: receiving Buy Goods and Services Till.
- `MPESA_TILL_NAME`: exact receiving business name.
- `MANUAL_DEPOSIT_REVIEWER_EMAILS`: comma-separated owner-approved reviewer emails.
- `MANUAL_DEPOSITS_ENABLED=true`: explicit final activation.

The target environment must also have working Clerk authentication. The reviewer must sign in, and the server checks their **verified** email against the configured allowlist for every list and review operation. No public signup or submitted email grants approval permissions. No reviewer is automatically granted access.

The owner has not yet supplied the Till or identified a reviewer. Leave submissions disabled and show no payment destination. Do not enable deposits by changing the UI alone.

Before deploying to the existing external Neon database, apply `scripts/manual-mpesa-schema.sql` against that database using the project's external migration process. The development migration does not update Vercel's database. Do not publish code against a database that lacks these tables.

## Submission and review

Customers enter amount (KES), first and last names, and the full M-Pesa payment SMS. The server checks the receipt format and amount consistency, normalises the receipt code, reserves it uniquely across wallets and persists a **pending** request.

Reviewers open `/deposit-reviews`. They must independently match receipt code, payer, amount and receiving Till with the actual Safaricom merchant transaction statement. An SMS, even when correctly formatted, is not proof of settlement.

Approvals require a verification checkbox and a review note. Rejections require a note. The server records reviewer identity, timestamp and note. Final decisions cannot be overwritten. Approval and its unique deposit credit commit in one database transaction; repeated or concurrent approval does not credit twice. Rejection never credits.

Real deposits use a separate ledger; they never modify or include the demo starting credit. The wallet shows deposited funds separately and refreshes every 15 seconds. Approved deposits appear as non-demo transactions. Real purchases and withdrawals remain unavailable.

Guest wallets remain browser-linked, not recoverable accounts. The UI warns users not to clear browser data or switch devices. Before enabling real funds, establish an agreed account/recovery approach; signing in does not automatically transfer a guest wallet to the signed-in account.

## Verification

Development-only database tests (synthetic requests are cleaned up):

```sh
pnpm --filter @workspace/api-server exec esbuild tests/manual-deposits.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/probet-manual-deposits.test.cjs
NODE_ENV=test MANUAL_DEPOSIT_DB_TEST=true node --test /tmp/probet-manual-deposits.test.cjs
```

These do not call Safaricom or Cashia and do not verify a real deposit.
