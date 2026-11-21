-- Add the structured fixture fields used by the Weekly VIP package catalogue.
-- Preserve the previous illustrative rows and package purchase history.
ALTER TABLE probet_tip_packages
  ADD COLUMN IF NOT EXISTS total_odds numeric(12, 2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS stake_level text NOT NULL DEFAULT 'medium';

ALTER TABLE probet_tip_entries
  ALTER COLUMN match DROP NOT NULL,
  ALTER COLUMN prediction DROP NOT NULL,
  ALTER COLUMN league DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS match_date date,
  ADD COLUMN IF NOT EXISTS kickoff time,
  ADD COLUMN IF NOT EXISTS home_team text,
  ADD COLUMN IF NOT EXISTS away_team text,
  ADD COLUMN IF NOT EXISTS odds numeric(8, 2);
