# ProBet Tips

Football-tip packages, a top-up-only wallet, ChatBase, and transaction history, based on the user's supplied reference.

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

- All dashboard, wallet, tip, chat, purchase, profile, and admin data requires a signed-in account. Only sign-in, sign-up, health checks, and provider callbacks remain public.
- Real accounts start at $0. Sample tip packages are never sold for real money.
- New accounts use email/password with a four-character minimum and no verification step; after sign-up, users sign in separately. Users can sign in with email or username; username, full name, phone and country are stored as unverified profile details.
- On the user site, signed-out visitors opening `/` go to sign-up; signed-in visitors go to the dashboard. The separate admin host keeps its own sign-in flow.
- Clerk remains only as an optional authenticated bridge for older accounts. Never link a legacy Clerk account by matching its email; require both the legacy session and the new account session.
- Admin roles are server-enforced. The reserved username `admin` cannot be claimed through public sign-up; public sign-up cannot set a role. Provision the first administrator through a private, secure setup.
- Vercel production serves the admin portal on `admin-probet-tips.vercel.app`; the user site redirects `/admin` to that host, and admin APIs remain role-protected.
- The public package list is fixed to Free VIP (KES 0), Weekly Multibet (KES 50), and Weekly Premium VIP (KES 70). Admins edit match date, kickoff, teams, odds, total odds, and the stake label; prices and package names stay fixed.
- Archived legacy package rows and purchases remain stored, but only the three fixed packages are exposed in the user tip list.
- Cashia remains under integration; PayHero is also being added for Safaricom M-Pesa Express while Cashia work continues. Never replace either provider without the user's request.
- PayHero STK deposits must be checked with PayHero's authenticated transaction-status API and credited idempotently; never trust a browser redirect or callback by itself.
- The Cashia staging sample uses KES while the design uses USD. Do not assume an exchange rate or send USD values as KES.
- Browser success redirects are never proof of settlement; require authenticated server verification and idempotency before crediting a wallet.
- The user does not want Replit-managed AI. An external AI provider alone does not move hosting, authentication, or the database away from Replit; confirm hosting scope before proposing a migration.

## Product

Responsive dashboard, email/password signup and login, profile management, an admin portal for profiles and weekly VIP fixtures, package purchase confirmation and success, unlocked tips, wallet and transaction history, and ChatBase. No withdrawals or bet placement.
Do not configure Replit AI Integrations. Select an external AI provider with the user before enabling ChatBase. The user does not have an OpenAI API key; do not ask for one.
No live sports feed is connected; administrators enter match fixtures and odds manually.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
