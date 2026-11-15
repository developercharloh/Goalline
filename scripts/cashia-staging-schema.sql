-- Additive schema for the external Neon deployment and development database.
-- No existing balances or transactions are changed.
CREATE TABLE IF NOT EXISTS probet_cashia_deposits (
  id text PRIMARY KEY,
  owner text NOT NULL REFERENCES probet_wallets(owner),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'credited', 'failed')),
  session_id text,
  checkout_url text,
  provider_transaction_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
