-- Add the admin-selected market/pick while keeping older archived rows intact.
ALTER TABLE probet_tip_entries
  ADD COLUMN IF NOT EXISTS selection text;
