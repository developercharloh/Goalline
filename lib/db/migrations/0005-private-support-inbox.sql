-- Private support threads contain one conversation per ProBet account.
-- Apply separately to the external Neon production database after confirming
-- that it is the database used by the Vercel deployment.
CREATE TABLE IF NOT EXISTS probet_support_messages (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES probet_accounts(id) ON DELETE CASCADE,
  sender_role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS probet_support_messages_account_created_idx
  ON probet_support_messages (account_id, created_at);
