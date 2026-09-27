-- ============================================================
-- 044_wallet_system.sql
--
-- In-app prepaid wallet and credit ledger for WhatsApp messaging.
-- Members recharge via UPI (QR code / Intent) or payment gateway.
-- Per-message costs are deducted in real-time.
-- ============================================================

-- 1. WALLETS (one per account)
CREATE TABLE IF NOT EXISTS wallets (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_id UUID GENERATED ALWAYS AS (account_id) STORED,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  is_exempt BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallets_select ON wallets;
CREATE POLICY wallets_select ON wallets
  FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS wallets_admin ON wallets;
CREATE POLICY wallets_admin ON wallets
  FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- 2. WALLET_TRANSACTIONS (Ledger)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_id UUID GENERATED ALWAYS AS (account_id) STORED,
  amount NUMERIC(12, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('topup', 'message_debit', 'broadcast_debit', 'refund', 'admin_adjustment')),
  description TEXT NOT NULL,
  reference_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'rejected')),
  balance_after NUMERIC(12, 2),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_account ON wallet_transactions(account_id, created_at DESC);
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_transactions_select ON wallet_transactions;
CREATE POLICY wallet_transactions_select ON wallet_transactions
  FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS wallet_transactions_admin ON wallet_transactions;
CREATE POLICY wallet_transactions_admin ON wallet_transactions
  FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- 3. WALLET_TOPUP_REQUESTS (Pending / Approved UPI UTRs)
CREATE TABLE IF NOT EXISTS wallet_topup_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_id UUID GENERATED ALWAYS AS (account_id) STORED,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  utr_number TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'upi',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_account ON wallet_topup_requests(account_id, created_at DESC);
ALTER TABLE wallet_topup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_topup_requests_select ON wallet_topup_requests;
CREATE POLICY wallet_topup_requests_select ON wallet_topup_requests
  FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS wallet_topup_requests_insert ON wallet_topup_requests;
CREATE POLICY wallet_topup_requests_insert ON wallet_topup_requests
  FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS wallet_topup_requests_admin ON wallet_topup_requests;
CREATE POLICY wallet_topup_requests_admin ON wallet_topup_requests
  FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- 4. WALLET_RATES (Per-account message rates and UPI ID in INR)
CREATE TABLE IF NOT EXISTS wallet_rates (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_id UUID GENERATED ALWAYS AS (account_id) STORED,
  marketing_rate NUMERIC(8, 4) NOT NULL DEFAULT 0.85,
  utility_rate NUMERIC(8, 4) NOT NULL DEFAULT 0.40,
  service_rate NUMERIC(8, 4) NOT NULL DEFAULT 0.30,
  auth_rate NUMERIC(8, 4) NOT NULL DEFAULT 0.40,
  upi_id TEXT NOT NULL DEFAULT 'avadhbajaj02@okhdfcbank',
  upi_name TEXT NOT NULL DEFAULT 'SandeshAI',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE wallet_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_rates_select ON wallet_rates;
CREATE POLICY wallet_rates_select ON wallet_rates
  FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS wallet_rates_admin ON wallet_rates;
CREATE POLICY wallet_rates_admin ON wallet_rates
  FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- 5. RPC: Atomic Deduction
CREATE OR REPLACE FUNCTION deduct_wallet_balance(
  p_account_id UUID,
  p_amount NUMERIC,
  p_type TEXT,
  p_description TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_new_balance NUMERIC(12, 2);
  v_tx_id UUID;
BEGIN
  -- 1. Ensure wallet exists with row lock
  SELECT * INTO v_wallet
  FROM wallets
  WHERE account_id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO wallets (account_id, balance, currency, is_exempt)
    VALUES (p_account_id, 0.00, 'INR', false)
    RETURNING * INTO v_wallet;
  END IF;

  -- 2. If account is exempt (e.g. system owner), allow send without deduction
  IF v_wallet.is_exempt = true THEN
    RETURN jsonb_build_object(
      'success', true,
      'exempt', true,
      'balance', v_wallet.balance,
      'amount_deducted', 0
    );
  END IF;

  -- 3. Check sufficiency
  IF v_wallet.balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_balance',
      'required', p_amount,
      'available', v_wallet.balance
    );
  END IF;

  -- 4. Deduct
  v_new_balance := ROUND(v_wallet.balance - p_amount, 2);

  UPDATE wallets
  SET balance = v_new_balance,
      updated_at = now()
  WHERE account_id = p_account_id;

  -- 5. Insert ledger
  INSERT INTO wallet_transactions (
    account_id, amount, type, description, reference_id, status, balance_after, metadata
  ) VALUES (
    p_account_id, -p_amount, p_type, p_description, p_reference_id, 'completed', v_new_balance, p_metadata
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'exempt', false,
    'transaction_id', v_tx_id,
    'balance', v_new_balance,
    'amount_deducted', p_amount
  );
END;
$$;

-- 6. RPC: Atomic Credit / Top-Up
CREATE OR REPLACE FUNCTION credit_wallet_balance(
  p_account_id UUID,
  p_amount NUMERIC,
  p_type TEXT,
  p_description TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_new_balance NUMERIC(12, 2);
  v_tx_id UUID;
BEGIN
  SELECT * INTO v_wallet
  FROM wallets
  WHERE account_id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO wallets (account_id, balance, currency, is_exempt)
    VALUES (p_account_id, ROUND(p_amount, 2), 'INR', false)
    RETURNING * INTO v_wallet;
    v_new_balance := v_wallet.balance;
  ELSE
    v_new_balance := ROUND(v_wallet.balance + p_amount, 2);
    UPDATE wallets
    SET balance = v_new_balance,
        updated_at = now()
    WHERE account_id = p_account_id;
  END IF;

  INSERT INTO wallet_transactions (
    account_id, amount, type, description, reference_id, status, balance_after, metadata
  ) VALUES (
    p_account_id, p_amount, p_type, p_description, p_reference_id, 'completed', v_new_balance, p_metadata
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'balance', v_new_balance,
    'amount_credited', p_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_wallet_balance TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION credit_wallet_balance TO authenticated, service_role;
