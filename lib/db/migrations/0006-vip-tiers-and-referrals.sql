-- Add referral identifiers and reward tracking without deleting account data.
ALTER TABLE probet_accounts
  ADD COLUMN IF NOT EXISTS referral_code text;

UPDATE probet_accounts
SET referral_code = upper(substr(md5(id), 1, 16))
WHERE referral_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS probet_accounts_referral_code_unique
  ON probet_accounts (referral_code);

CREATE TABLE IF NOT EXISTS probet_referrals (
  id text PRIMARY KEY,
  referrer_account_id text NOT NULL REFERENCES probet_accounts(id) ON DELETE CASCADE,
  referred_account_id text NOT NULL REFERENCES probet_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  CONSTRAINT probet_referrals_not_self CHECK (referrer_account_id <> referred_account_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS probet_referrals_referred_unique
  ON probet_referrals (referred_account_id);

CREATE INDEX IF NOT EXISTS probet_referrals_referrer_created_idx
  ON probet_referrals (referrer_account_id, created_at);
