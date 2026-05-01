CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  balance_cents BIGINT NOT NULL DEFAULT 1000000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity_tickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  symbol TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  title TEXT,
  bio TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_id UUID NOT NULL REFERENCES identity_tickers(id),
  name TEXT NOT NULL,
  slot_type TEXT NOT NULL,
  token_budget BIGINT NOT NULL DEFAULT 100000,
  privacy_level TEXT NOT NULL DEFAULT 'confidential',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES identity_slots(id),
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  document_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE time_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES identity_slots(id),
  original_seller_user_id UUID NOT NULL REFERENCES users(id),
  owner_user_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  interaction_type TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  base_price_cents BIGINT NOT NULL,
  current_price_cents BIGINT NOT NULL,
  list_price_cents BIGINT NOT NULL,
  token_budget BIGINT NOT NULL DEFAULT 100000,
  resale_count INT NOT NULL DEFAULT 0,
  max_resale_count INT NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'listed',
  trading_halts_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (duration_minutes % 30 = 0),
  CHECK (ends_at > starts_at)
);

CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES time_tickets(id),
  buyer_user_id UUID NOT NULL REFERENCES users(id),
  seller_user_id UUID NOT NULL REFERENCES users(id),
  price_cents BIGINT NOT NULL,
  seller_fee_cents BIGINT NOT NULL,
  platform_fee_cents BIGINT NOT NULL,
  trade_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES time_tickets(id),
  buyer_user_id UUID NOT NULL REFERENCES users(id),
  session_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  tokens_used BIGINT NOT NULL DEFAULT 0,
  transcript JSONB NOT NULL DEFAULT '[]',
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE market_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES time_tickets(id),
  event_type TEXT NOT NULL,
  price_cents BIGINT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
