-- Email + mobile verification (OTP). Additive and idempotent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

-- One row per code sent. Codes are stored hashed, never in plain text.
CREATE TABLE IF NOT EXISTS otp_codes (
  id          bigserial PRIMARY KEY,
  flow_id     text NOT NULL,              -- groups the email + sms codes of one sign-up / verification
  channel     text NOT NULL,              -- email | sms
  target      text NOT NULL,              -- email address or 10-digit mobile
  purpose     text NOT NULL,              -- signup | verify
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  verified_at timestamptz,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_codes_flow_idx ON otp_codes (flow_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS otp_codes_target_idx ON otp_codes (target, created_at DESC);

-- Sign-ups waiting for their codes (the account is only created after verification)
CREATE TABLE IF NOT EXISTS pending_signups (
  flow_id       text PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL,
  phone         text NOT NULL,
  password_hash text NOT NULL,
  user_id       bigint REFERENCES users(id) ON DELETE CASCADE,  -- set when verifying an existing account
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
