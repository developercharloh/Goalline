-- Non-destructive schema additions for the external Neon database used by
-- the Vercel deployment. Apply only after confirming the target database.

CREATE TABLE IF NOT EXISTS probet_accounts (
  id text PRIMARY KEY,
  email text NOT NULL,
  username text NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  country text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  legacy_clerk_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS probet_accounts_email_unique
  ON probet_accounts (email);
CREATE UNIQUE INDEX IF NOT EXISTS probet_accounts_username_unique
  ON probet_accounts (username);
CREATE UNIQUE INDEX IF NOT EXISTS probet_accounts_legacy_clerk_unique
  ON probet_accounts (legacy_clerk_id);

CREATE TABLE IF NOT EXISTS probet_account_sessions (
  token_hash text PRIMARY KEY,
  account_id text NOT NULL REFERENCES probet_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS probet_tip_packages (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  price_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS probet_tip_entries (
  id text PRIMARY KEY,
  package_id text NOT NULL REFERENCES probet_tip_packages(id) ON DELETE CASCADE,
  position integer NOT NULL,
  match text NOT NULL,
  prediction text NOT NULL,
  league text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS probet_tip_entries_package_position_unique
  ON probet_tip_entries (package_id, position);
