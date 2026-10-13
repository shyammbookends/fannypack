-- Messages sent from the Contact page (read and answered in Admin -> Messages)
CREATE TABLE IF NOT EXISTS contact_messages (
  id           bigserial PRIMARY KEY,
  name         text NOT NULL,
  email        text NOT NULL,
  phone        text,
  topic        text NOT NULL DEFAULT 'general',
  order_number text,
  message      text NOT NULL,
  user_id      bigint REFERENCES users(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'spam')),
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_messages_status_idx ON contact_messages (status, created_at DESC);
