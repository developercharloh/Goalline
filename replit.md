# ProBet Tips

Football-tip packages, a top-up-only wallet, a private support inbox, and transaction history, based on the user's supplied reference.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`
- `ADMIN_BOOTSTRAP_TOKEN` enables private one-time setup of the initial administrator; configure it in each environment before the first admin is created.
- Vercel production: `PAYHERO_AUTH_TOKEN` is required for M-Pesa Express; `PAYHERO_CHANNEL_ID` is optional when the account has exactly one active M-Pesa channel.
- Vercel production uses the external Neon database. Vercel deploys do not migrate its schema; apply and verify each required production schema change in Neon before deploying code that depends on it. Never point the development `db push` command at production.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- All dashboard, wallet, tip, purchase, profile, support, and admin data requires a signed-in account. Only sign-in, sign-up, health checks, and provider callbacks remain public.
- Real accounts start at $0. Sample tip packages are never sold for real money.
- New accounts use email/password with a four-character minimum and no verification step; after sign-up, users sign in separately. Users can sign in with email or username; username, full name, phone and country are stored as unverified profile details.
- On the user site, signed-out visitors opening `/` go to sign-up; signed-in visitors go to the dashboard. The separate admin host keeps its own sign-in flow.
- Clerk remains only as an optional authenticated bridge for older accounts. Never link a legacy Clerk account by matching its email; require both the legacy session and the new account session.
- Admin roles are server-enforced. The reserved username `admin` cannot be claimed through public sign-up; public sign-up cannot set a role. Provision the first administrator through a private, secure setup.
- Vercel production serves the admin portal on `admin-probet-tips.vercel.app`; the user site redirects `/admin` to that host, and admin APIs remain role-protected.
- The only purchasable plans are Daily VIP (40 Diamonds for 1 day), Weekly VIP (100 Diamonds for 7 days), and Monthly VIP (300 Diamonds for 30 days). One Diamond is worth KES 1; Weekly VIP is marked Best Value. There is no free VIP plan.
- VIP access expires independently of login sessions. Account sessions use a rolling one-year expiry; premium expiry does not sign users out.
- A referral reward of 10 Diamonds is credited to the inviter's wallet once, after each referred account makes its first successful VIP purchase. The reward is spendable wallet credit.
- Archived legacy package rows and purchases remain stored. Existing paid access remains visible only until its original expiry; archived plans cannot be repurchased.
- Admins can add any number of matches to each VIP plan. They can manually enter fixture details or configure upcoming fixtures from Football-Data.org; odds and overall package odds remain administrator-reviewed before saving. Suggested selections are estimates based on current standings and recent form, not guarantees. `FOOTBALL_DATA_API_TOKEN` is required for fixture configuration; manual entry remains available without it.
- Cashia remains under integration; PayHero is also being added for Safaricom M-Pesa Express while Cashia work continues. Never replace either provider without the user's request.
- PayHero STK deposits must be checked with PayHero's authenticated transaction-status API and credited idempotently; never trust a browser redirect or callback by itself.
- The Cashia staging sample uses KES while the design uses USD. Do not assume an exchange rate or send USD values as KES.
- Browser success redirects are never proof of settlement; require authenticated server verification and idempotency before crediting a wallet.
- The user does not want Replit-managed AI. An external AI provider alone does not move hosting, authentication, or the database away from Replit; confirm hosting scope before proposing a migration.

## Product

Responsive dashboard, email/password signup and login, profile management, an admin portal for profiles and VIP fixtures, package purchase confirmation and success, package-specific unlocked tips, referral rewards, wallet, transaction history, and a private support inbox. No withdrawals or bet placement.
The public ChatBase/community chat was removed; users contact staff through the private support inbox. Stored community messages are retained unless the user explicitly asks to delete them.
The Android app is a WebView wrapper that loads `https://probet-tips.site/`, so website deployments appear without an APK update. Native wrapper changes such as launcher icons require rebuilding the APK.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
