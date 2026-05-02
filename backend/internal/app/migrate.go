package app

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const usersSchemaSQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login_name TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  ticker_symbol TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  initial_info TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  organization TEXT NOT NULL DEFAULT '',
  mbti TEXT NOT NULL DEFAULT '',
  expertise JSONB NOT NULL DEFAULT '[]'::jsonb,
  bio TEXT NOT NULL DEFAULT '',
  links JSONB NOT NULL DEFAULT '[]'::jsonb,
  offer TEXT NOT NULL DEFAULT '',
  portrait_url TEXT NOT NULL DEFAULT '',
  chat_avatar_url TEXT NOT NULL DEFAULT '',
  trade_logo_url TEXT NOT NULL DEFAULT '',
  agent_base_price_cents BIGINT NOT NULL DEFAULT 0,
  balance_cents BIGINT NOT NULL DEFAULT 1000000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (login_name = lower(login_name)),
  CHECK (position('@' in login_name) = 0),
  CHECK (char_length(login_name) BETWEEN 2 AND 40)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS ticker_symbol TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS initial_info TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS headline TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS mbti TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS expertise JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS offer TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS portrait_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS trade_logo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_base_price_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_cents BIGINT NOT NULL DEFAULT 1000000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
`

func OpenDatabase(ctx context.Context, databaseURL string) (*sql.DB, error) {
	if strings.TrimSpace(databaseURL) == "" {
		databaseURL = DatabaseURL()
	}
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func RunMigrations(ctx context.Context, databaseURL string, logger *log.Logger) error {
	db, err := OpenDatabase(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	if logger != nil {
		logger.Printf("migrate: applying 001_users")
	}
	if _, err := db.ExecContext(ctx, usersSchemaSQL); err != nil {
		return fmt.Errorf("apply 001_users: %w", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT (version) DO NOTHING`, "001_users"); err != nil {
		return err
	}

	if logger != nil {
		logger.Printf("migrate: applying 002_default_users")
	}
	if err := ensureDefaultUsers(ctx, db); err != nil {
		return fmt.Errorf("apply 002_default_users: %w", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT (version) DO NOTHING`, "002_default_users"); err != nil {
		return err
	}
	if logger != nil {
		logger.Printf("migrate: ok")
	}
	return nil
}

func ensureDefaultUsers(ctx context.Context, db *sql.DB) error {
	defaults := []struct {
		ID           string
		LoginName    string
		Password     string
		DisplayName  string
		TickerSymbol string
		AvatarURL    string
		InitialInfo  string
		Bio          string
	}{
		{
			ID:           "usr_default_weiyang",
			LoginName:    "weiyang",
			Password:     "Yipansansha",
			DisplayName:  "Weiyang",
			TickerSymbol: "WEIYANG",
			AvatarURL:    "/avatar/Weiyang.png",
			InitialInfo:  "Weiyang focuses on AI product diagnosis, market structure, and practical execution.",
			Bio:          "AI product diagnosis and execution sessions.",
		},
		{
			ID:           "usr_default_ayuan",
			LoginName:    "ayuan",
			Password:     "YuanAYuan",
			DisplayName:  "AYuan",
			TickerSymbol: "AYUAN",
			AvatarURL:    "/avatar/AYuan.png",
			InitialInfo:  "AYuan focuses on market operation, timing windows, and structured founder calls.",
			Bio:          "Market operation and timing sessions.",
		},
	}

	for _, user := range defaults {
		hash, err := hashPassword(user.Password)
		if err != nil {
			return err
		}
		if _, err := db.ExecContext(ctx, `
INSERT INTO users (
  id, login_name, password_hash, display_name, ticker_symbol, avatar_url, initial_info, bio, balance_cents, created_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, 1000000, now()
)
ON CONFLICT (login_name) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  display_name = EXCLUDED.display_name,
  ticker_symbol = EXCLUDED.ticker_symbol,
  avatar_url = EXCLUDED.avatar_url,
  initial_info = EXCLUDED.initial_info,
  bio = EXCLUDED.bio
`, user.ID, user.LoginName, hash, user.DisplayName, user.TickerSymbol, user.AvatarURL, user.InitialInfo, user.Bio); err != nil {
			return err
		}
	}
	return nil
}
