-- Broadcast exclusion list: phone numbers that should never receive campaign messages.
CREATE TABLE IF NOT EXISTS broadcast_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  phone_normalized TEXT GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  reason TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- One exclusion per phone per account
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_exclusions_account_phone
  ON broadcast_exclusions (account_id, phone_normalized)
  WHERE phone_normalized <> '';

CREATE INDEX IF NOT EXISTS idx_broadcast_exclusions_account
  ON broadcast_exclusions (account_id);

-- RLS
ALTER TABLE broadcast_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage exclusions for their account"
  ON broadcast_exclusions
  FOR ALL
  USING (
    account_id IN (
      SELECT account_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM profiles WHERE id = auth.uid()
    )
  );
