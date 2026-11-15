BEGIN;
CREATE TABLE IF NOT EXISTS probet_manual_deposits (
  id text PRIMARY KEY,
  owner text NOT NULL REFERENCES probet_wallets(owner),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 100 AND 10000000),
  first_name text NOT NULL,
  last_name text NOT NULL,
  mpesa_message text NOT NULL,
  receipt_code text NOT NULL UNIQUE,
  till_number text NOT NULL,
  business_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note text,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS probet_manual_deposits_owner_created ON probet_manual_deposits(owner, created_at);
CREATE INDEX IF NOT EXISTS probet_manual_deposits_status_created ON probet_manual_deposits(status, created_at);
CREATE TABLE IF NOT EXISTS probet_deposit_credits (
  deposit_id text PRIMARY KEY REFERENCES probet_manual_deposits(id),
  owner text NOT NULL REFERENCES probet_wallets(owner),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS probet_deposit_credits_owner ON probet_deposit_credits(owner);
COMMIT;
