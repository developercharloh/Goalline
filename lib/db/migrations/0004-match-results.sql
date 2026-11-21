-- Keep result status with the saved fixture, defaulting existing entries to pending.
ALTER TABLE probet_tip_entries
  ADD COLUMN IF NOT EXISTS result text NOT NULL DEFAULT 'pending';
