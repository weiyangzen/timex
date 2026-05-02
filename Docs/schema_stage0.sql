CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT ('usr_' || gen_random_uuid()::text),
  login_name TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  balance_cents BIGINT NOT NULL DEFAULT 1000000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (login_name = lower(login_name)),
  CHECK (position('@' in login_name) = 0),
  CHECK (char_length(login_name) BETWEEN 2 AND 40)
);

CREATE TABLE tickers (
  id TEXT PRIMARY KEY DEFAULT ('tkr_' || gen_random_uuid()::text),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  symbol TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  verified_badge BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (symbol = upper(symbol))
);

CREATE TABLE slots (
  id TEXT PRIMARY KEY DEFAULT ('slot_' || gen_random_uuid()::text),
  ticker_id TEXT NOT NULL REFERENCES tickers(id),
  slot_name TEXT NOT NULL,
  slot_type TEXT NOT NULL,
  token_budget BIGINT NOT NULL DEFAULT 18000,
  privacy_level TEXT NOT NULL DEFAULT 'seller_private',
  knowledge_base_id TEXT,
  unified_base_price_cents BIGINT NOT NULL,
  default_capacity_limit INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (slot_type IN ('human', 'agent', 'hybrid', 'agent_vs_agent')),
  CHECK (privacy_level IN ('public', 'private', 'seller_private')),
  CHECK (unified_base_price_cents >= 0),
  CHECK (default_capacity_limit >= 1)
);

CREATE TABLE capacity_windows (
  id TEXT PRIMARY KEY DEFAULT ('win_' || gen_random_uuid()::text),
  ticker_id TEXT NOT NULL REFERENCES tickers(id),
  slot_id TEXT NOT NULL REFERENCES slots(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  capacity_limit INT NOT NULL DEFAULT 1,
  sold_count INT NOT NULL DEFAULT 0,
  remaining_capacity INT NOT NULL DEFAULT 1,
  base_price_cents BIGINT NOT NULL,
  min_sale_price_cents BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'listed',
  trade_halts_at TIMESTAMPTZ NOT NULL,
  CHECK (duration_minutes % 30 = 0),
  CHECK (ends_at > starts_at),
  CHECK (capacity_limit >= 1),
  CHECK (sold_count >= 0),
  CHECK (remaining_capacity >= 0),
  CHECK (sold_count + remaining_capacity = capacity_limit),
  CHECK (base_price_cents >= 0),
  CHECK (min_sale_price_cents >= base_price_cents),
  CHECK (trade_halts_at <= starts_at)
);

CREATE TABLE knowledge_bases (
  id TEXT PRIMARY KEY DEFAULT ('kb_' || gen_random_uuid()::text),
  slot_id TEXT NOT NULL REFERENCES slots(id),
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  document_count INT NOT NULL DEFAULT 0,
  demo_source_names TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ready',
  imported_by_one_click BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (document_count >= 0),
  CHECK (status IN ('ready', 'importing', 'empty'))
);

ALTER TABLE slots
  ADD CONSTRAINT slots_knowledge_base_id_fkey
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE time_tickets (
  id TEXT PRIMARY KEY DEFAULT ('ticket_' || gen_random_uuid()::text),
  ticker_id TEXT NOT NULL REFERENCES tickers(id),
  slot_id TEXT NOT NULL REFERENCES slots(id),
  capacity_window_id TEXT NOT NULL REFERENCES capacity_windows(id),
  issuer_user_id TEXT NOT NULL REFERENCES users(id),
  owner_user_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  interaction_type TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  base_price_cents BIGINT NOT NULL,
  current_price_cents BIGINT NOT NULL,
  list_price_cents BIGINT NOT NULL,
  seat_index INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'listed',
  trade_halts_at TIMESTAMPTZ NOT NULL,
  resale_count INT NOT NULL DEFAULT 0,
  max_resale_count INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (interaction_type IN ('human', 'agent', 'hybrid', 'agent_vs_agent')),
  CHECK (duration_minutes % 30 = 0),
  CHECK (ends_at > starts_at),
  CHECK (base_price_cents >= 0),
  CHECK (current_price_cents >= base_price_cents),
  CHECK (list_price_cents >= base_price_cents),
  CHECK (seat_index >= 1),
  CHECK (resale_count >= 0),
  CHECK (max_resale_count >= 0),
  CHECK (trade_halts_at <= starts_at),
  CHECK (
    status IN (
      'draft',
      'listed',
      'owned',
      'relisted',
      'halted',
      'defaulting',
      'cut_in_available',
      'in_session',
      'completed',
      'cancelled'
    )
  )
);

CREATE TABLE window_aggregations (
  id TEXT PRIMARY KEY DEFAULT ('agg_' || gen_random_uuid()::text),
  ticker_id TEXT NOT NULL REFERENCES tickers(id),
  slot_id TEXT NOT NULL REFERENCES slots(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  source_ticket_ids TEXT[] NOT NULL DEFAULT '{}',
  source_window_ids TEXT[] NOT NULL DEFAULT '{}',
  target_window_id TEXT NOT NULL REFERENCES capacity_windows(id),
  fee_cents BIGINT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'free_later_aggregation',
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fee_cents >= 0)
);

CREATE TABLE ticket_receipts (
  id TEXT PRIMARY KEY DEFAULT ('rcpt_' || gen_random_uuid()::text),
  ticket_id TEXT NOT NULL UNIQUE REFERENCES time_tickets(id),
  receipt_code TEXT UNIQUE NOT NULL,
  buyer_user_id TEXT NOT NULL REFERENCES users(id),
  seller_user_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL,
  price_cents BIGINT NOT NULL,
  seller_royalty_cents BIGINT NOT NULL,
  platform_fee_cents BIGINT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  t0_transfer_confirmed BOOLEAN NOT NULL DEFAULT true,
  CHECK (price_cents >= 0),
  CHECK (seller_royalty_cents >= 0),
  CHECK (platform_fee_cents >= 0)
);

CREATE TABLE trades (
  id TEXT PRIMARY KEY DEFAULT ('trade_' || gen_random_uuid()::text),
  ticket_id TEXT NOT NULL REFERENCES time_tickets(id),
  buyer_user_id TEXT NOT NULL REFERENCES users(id),
  seller_user_id TEXT NOT NULL REFERENCES users(id),
  price_cents BIGINT NOT NULL,
  seller_fee_cents BIGINT NOT NULL,
  platform_fee_cents BIGINT NOT NULL,
  trade_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (seller_fee_cents >= 0),
  CHECK (platform_fee_cents >= 0)
);

CREATE TABLE timing_orders (
  id TEXT PRIMARY KEY DEFAULT ('ord_' || gen_random_uuid()::text),
  ticker_id TEXT NOT NULL REFERENCES tickers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  order_type TEXT NOT NULL,
  current_ticket_id TEXT NOT NULL REFERENCES time_tickets(id),
  target_time TIMESTAMPTZ NOT NULL,
  limit_price_cents BIGINT NOT NULL,
  allow_negative_price BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (order_type IN ('speed_up', 'extension')),
  CHECK (status IN ('open', 'matched', 'cancelled'))
);

CREATE TABLE conversation_sessions (
  id TEXT PRIMARY KEY DEFAULT ('session_' || gen_random_uuid()::text),
  session_id TEXT UNIQUE NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES time_tickets(id),
  buyer_user_id TEXT NOT NULL REFERENCES users(id),
  seller_user_id TEXT NOT NULL REFERENCES users(id),
  session_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview',
  tokens_used BIGINT NOT NULL DEFAULT 0,
  token_budget BIGINT NOT NULL DEFAULT 18000,
  transcript JSONB NOT NULL DEFAULT '[]',
  summary TEXT,
  agent_state TEXT NOT NULL DEFAULT 'idle',
  unique_active_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (session_type IN ('human', 'agent', 'hybrid', 'agent_vs_agent')),
  CHECK (status IN ('preview', 'idle', 'thinking', 'speaking', 'ended', 'completed')),
  CHECK (tokens_used >= 0),
  CHECK (token_budget >= 0)
);

CREATE TABLE session_topics (
  id TEXT PRIMARY KEY DEFAULT ('topic_' || gen_random_uuid()::text),
  session_id TEXT NOT NULL REFERENCES conversation_sessions(session_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  message_refs TEXT[] NOT NULL DEFAULT '{}',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE TABLE runtime_configs (
  id TEXT PRIMARY KEY DEFAULT ('rt_' || gen_random_uuid()::text),
  provider TEXT NOT NULL DEFAULT 'mock',
  status TEXT NOT NULL DEFAULT 'ready',
  configured_by_environment BOOLEAN NOT NULL DEFAULT false,
  mock_enabled BOOLEAN NOT NULL DEFAULT true,
  last_health_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_facing_runtime_setup_flow BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE market_events (
  id TEXT PRIMARY KEY DEFAULT ('evt_' || gen_random_uuid()::text),
  ticket_id TEXT REFERENCES time_tickets(id),
  event_type TEXT NOT NULL,
  price_cents BIGINT,
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    event_type IN (
      'primary',
      'secondary',
      'relist',
      'halt',
      'default',
      'cut_in',
      'timing'
    )
  )
);

CREATE TABLE demo_history_batches (
  id TEXT PRIMARY KEY DEFAULT ('demo_' || gen_random_uuid()::text),
  scope TEXT NOT NULL DEFAULT 'all',
  created_by_user_id TEXT REFERENCES users(id),
  created_ticket_count INT NOT NULL DEFAULT 0,
  created_trade_count INT NOT NULL DEFAULT 0,
  created_session_count INT NOT NULL DEFAULT 0,
  created_topic_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (scope IN ('all', 'calendar', 'trade', 'conversation')),
  CHECK (created_ticket_count >= 0),
  CHECK (created_trade_count >= 0),
  CHECK (created_session_count >= 0),
  CHECK (created_topic_count >= 0)
);

CREATE INDEX idx_tickers_owner ON tickers(owner_user_id);
CREATE INDEX idx_slots_ticker ON slots(ticker_id);
CREATE INDEX idx_capacity_windows_slot_time ON capacity_windows(slot_id, starts_at);
CREATE INDEX idx_time_tickets_owner ON time_tickets(owner_user_id);
CREATE INDEX idx_time_tickets_window ON time_tickets(capacity_window_id);
CREATE INDEX idx_trades_ticket ON trades(ticket_id);
CREATE INDEX idx_market_events_created_at ON market_events(created_at DESC);
CREATE INDEX idx_conversation_sessions_ticket ON conversation_sessions(ticket_id);
CREATE INDEX idx_session_topics_session ON session_topics(session_id);
