-- Add verdict_override column for manual AI verdict overrides
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS verdict_override TEXT;
