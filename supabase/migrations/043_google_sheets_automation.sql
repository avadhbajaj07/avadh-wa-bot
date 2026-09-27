-- Google credentials and sheet webhook secrets are encrypted by the server.
-- These tables have RLS enabled with no user policies: only the service role
-- can read them, and the API enforces account admin/owner access.
CREATE TABLE google_connections (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_id uuid GENERATED ALWAYS AS (account_id) STORED,
  refresh_token_encrypted text NOT NULL,
  order_webhook_secret_encrypted text,
  folder_id text,
  connected_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE sheet_configs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_id uuid GENERATED ALWAYS AS (account_id) STORED,
  sheet_type text NOT NULL CHECK (sheet_type IN ('leads', 'bulk', 'failed', 'custom')),
  google_sheet_id text NOT NULL,
  tab_name text NOT NULL DEFAULT 'Sheet1',
  template_id uuid REFERENCES message_templates(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  webhook_secret_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, google_sheet_id, tab_name)
);
CREATE UNIQUE INDEX sheet_configs_one_auto_type ON sheet_configs(account_id, sheet_type)
  WHERE sheet_type IN ('leads', 'bulk', 'failed');
CREATE INDEX sheet_configs_account_active ON sheet_configs(account_id, active);
ALTER TABLE sheet_configs ENABLE ROW LEVEL SECURITY;

CREATE TABLE sheet_message_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_id uuid GENERATED ALWAYS AS (account_id) STORED,
  sheet_config_id uuid NOT NULL REFERENCES sheet_configs(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number >= 2),
  phone text NOT NULL,
  name text,
  template_id uuid REFERENCES message_templates(id) ON DELETE SET NULL,
  whatsapp_message_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  error_code text,
  error_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  replied_at timestamptz,
  UNIQUE (sheet_config_id, row_number)
);
CREATE INDEX sheet_message_log_reply_lookup ON sheet_message_log(account_id, phone, sent_at DESC);
ALTER TABLE sheet_message_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE store_order_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_id uuid GENERATED ALWAYS AS (account_id) STORED,
  external_order_id text NOT NULL,
  phone text NOT NULL,
  customer_name text,
  details text,
  template_id uuid REFERENCES message_templates(id) ON DELETE SET NULL,
  whatsapp_message_id text,
  status text NOT NULL DEFAULT 'pending',
  sheet_row_number integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (account_id, external_order_id)
);
ALTER TABLE store_order_events ENABLE ROW LEVEL SECURITY;

-- Compatibility views matching exact spec identifiers (tenant_id, whatsapp_templates, message_log)
CREATE OR REPLACE VIEW whatsapp_templates AS
  SELECT id, account_id AS tenant_id, account_id, name, category, language, body_text, buttons, status, created_at, updated_at
  FROM message_templates;

CREATE OR REPLACE VIEW message_log AS
  SELECT id, account_id AS tenant_id, account_id, phone, template_id, status, row_number AS sheet_row_ref, created_at AS timestamp, sent_at, replied_at, error_code, error_reason
  FROM sheet_message_log;
