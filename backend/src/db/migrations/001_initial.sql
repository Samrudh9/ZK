-- ZKHealthPass — initial database schema
-- Run: cd backend && npm run db:migrate

-- ── Users ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY,
  user_id       VARCHAR(255) UNIQUE NOT NULL,      -- e.g. "patient_001"
  role          VARCHAR(20) NOT NULL CHECK (role IN ('PATIENT', 'PROVIDER', 'DEVELOPER', 'ADMIN')),
  org_id        VARCHAR(50) NOT NULL,               -- e.g. "Org1MSP"
  password_hash VARCHAR(255) NOT NULL,
  wallet_id     UUID UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ── Refresh Tokens ────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    VARCHAR(255) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ── Proof Metadata (off-chain enrichment) ─────────
CREATE TABLE IF NOT EXISTS proof_metadata (
  proof_id      VARCHAR(255) PRIMARY KEY,
  patient_id    UUID REFERENCES users(id),
  provider_id   VARCHAR(255),
  policy_id     VARCHAR(255),
  status        VARCHAR(20) NOT NULL DEFAULT 'GENERATED',
  proof_json    JSONB,
  public_signals JSONB,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  verified_at   TIMESTAMPTZ,
  fabric_tx_id  VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_proof_patient ON proof_metadata(patient_id);
CREATE INDEX IF NOT EXISTS idx_proof_status ON proof_metadata(status);

-- ── Audit Enrichment (display names, labels) ──────
CREATE TABLE IF NOT EXISTS audit_enrichment (
  audit_id          VARCHAR(255) PRIMARY KEY,
  provider_name     VARCHAR(255),
  category_labels   TEXT[],
  notes             TEXT,
  fabric_tx_id      VARCHAR(255),
  fabric_block_num  INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tx ON audit_enrichment(fabric_tx_id);
