# ProBet Tips

Football-tip packages, a top-up-only wallet, ChatBase, and transaction history, based on the user's supplied reference.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

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

- Signed-out visitors can explore a clearly labeled $25 demo wallet. Demo credits are not money and never transfer into real accounts.
- Real accounts start at $0. Sample tip packages are never sold for real money.
- Cashia is the chosen provider. Do not replace it with Stripe or Whop. Wallet funding remains disabled until checkout responses and authenticated settlement are documented.
- The Cashia staging sample uses KES while the design uses USD. Do not assume an exchange rate or send USD values as KES.
- Browser success redirects are never proof of settlement; require authenticated server verification and idempotency before crediting a wallet.
- The user does not want Replit-managed AI. An external AI provider alone does not move hosting, authentication, or the database away from Replit; confirm hosting scope before proposing a migration.

## Product

Responsive dashboard, Clerk signup/login, package purchase confirmation and success, unlocked sample tips, wallet and transaction history, and ChatBase. No withdrawals or bet placement.
Do not configure Replit AI Integrations. Select an external AI provider with the user before enabling ChatBase. The user does not have an OpenAI API key; do not ask for one.
No live sports feed is connected; supplied football matches are labeled as samples.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
