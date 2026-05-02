package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func (s *Store) attachDatabase(ctx context.Context) error {
	db, err := OpenDatabase(ctx, DatabaseURL())
	if err != nil {
		return err
	}
	s.db = db
	return s.loadUsersFromDB(ctx)
}

func (s *Store) loadUsersFromDB(ctx context.Context) error {
	if s.db == nil {
		return nil
	}
	rows, err := s.db.QueryContext(ctx, `
SELECT id, login_name, password_hash, display_name, ticker_symbol, avatar_url, initial_info,
       headline, organization, mbti, expertise::text, bio, links::text, offer, portrait_url,
       chat_avatar_url, trade_logo_url, agent_base_price_cents, balance_cents, created_at
FROM users
ORDER BY created_at ASC`)
	if err != nil {
		return err
	}
	defer rows.Close()

	s.mu.Lock()
	defer s.mu.Unlock()
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return err
		}
		if previousID := s.usersByLoginName[u.LoginName]; previousID != "" && previousID != u.ID {
			delete(s.users, previousID)
		}
		s.users[u.ID] = u
		s.usersByLoginName[u.LoginName] = u.ID
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, u := range s.users {
		s.syncProfileTickerLocked(u)
	}
	return nil
}

func scanUser(scanner interface {
	Scan(dest ...any) error
}) (*User, error) {
	var expertiseRaw, linksRaw string
	u := &User{}
	if err := scanner.Scan(
		&u.ID,
		&u.LoginName,
		&u.PasswordHash,
		&u.DisplayName,
		&u.TickerSymbol,
		&u.AvatarURL,
		&u.InitialInfo,
		&u.Headline,
		&u.Organization,
		&u.MBTI,
		&expertiseRaw,
		&u.Bio,
		&linksRaw,
		&u.Offer,
		&u.PortraitURL,
		&u.ChatAvatarURL,
		&u.TradeLogoURL,
		&u.AgentBasePriceCents,
		&u.BalanceCents,
		&u.CreatedAt,
	); err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(expertiseRaw), &u.Expertise)
	_ = json.Unmarshal([]byte(linksRaw), &u.Links)
	return u, nil
}

func (s *Store) insertUserDB(ctx context.Context, u *User) error {
	if s.db == nil {
		return nil
	}
	expertise, _ := json.Marshal(u.Expertise)
	links, _ := json.Marshal(u.Links)
	_, err := s.db.ExecContext(ctx, `
INSERT INTO users (
  id, login_name, password_hash, display_name, ticker_symbol, avatar_url, initial_info,
  headline, organization, mbti, expertise, bio, links, offer, portrait_url, chat_avatar_url,
  trade_logo_url, agent_base_price_cents, balance_cents, created_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13::jsonb, $14, $15, $16, $17, $18, $19, $20
)
ON CONFLICT (login_name) DO NOTHING`,
		u.ID,
		u.LoginName,
		u.PasswordHash,
		u.DisplayName,
		u.TickerSymbol,
		u.AvatarURL,
		u.InitialInfo,
		u.Headline,
		u.Organization,
		u.MBTI,
		string(expertise),
		u.Bio,
		string(links),
		u.Offer,
		u.PortraitURL,
		u.ChatAvatarURL,
		u.TradeLogoURL,
		u.AgentBasePriceCents,
		u.BalanceCents,
		u.CreatedAt,
	)
	return err
}

func (s *Store) updateUserDB(ctx context.Context, u *User) error {
	if s.db == nil {
		return nil
	}
	expertise, _ := json.Marshal(u.Expertise)
	links, _ := json.Marshal(u.Links)
	_, err := s.db.ExecContext(ctx, `
UPDATE users SET
  display_name = $2,
  ticker_symbol = $3,
  avatar_url = $4,
  initial_info = $5,
  headline = $6,
  organization = $7,
  mbti = $8,
  expertise = $9::jsonb,
  bio = $10,
  links = $11::jsonb,
  offer = $12,
  portrait_url = $13,
  chat_avatar_url = $14,
  trade_logo_url = $15,
  agent_base_price_cents = $16,
  balance_cents = $17
WHERE id = $1`,
		u.ID,
		u.DisplayName,
		u.TickerSymbol,
		u.AvatarURL,
		u.InitialInfo,
		u.Headline,
		u.Organization,
		u.MBTI,
		string(expertise),
		u.Bio,
		string(links),
		u.Offer,
		u.PortraitURL,
		u.ChatAvatarURL,
		u.TradeLogoURL,
		u.AgentBasePriceCents,
		u.BalanceCents,
	)
	return err
}

func userFromDB(ctx context.Context, db *sql.DB, loginName string) (*User, bool, error) {
	if db == nil {
		return nil, false, nil
	}
	row := db.QueryRowContext(ctx, `
SELECT id, login_name, password_hash, display_name, ticker_symbol, avatar_url, initial_info,
       headline, organization, mbti, expertise::text, bio, links::text, offer, portrait_url,
       chat_avatar_url, trade_logo_url, agent_base_price_cents, balance_cents, created_at
FROM users
WHERE login_name = $1`, strings.ToLower(loginName))
	u, err := scanUser(row)
	if err == nil {
		return u, true, nil
	}
	if err == sql.ErrNoRows {
		return nil, false, nil
	}
	return nil, false, err
}

func (s *Store) refreshUserFromDB(ctx context.Context, loginName string) error {
	if s.db == nil {
		return nil
	}
	u, ok, err := userFromDB(ctx, s.db, loginName)
	if err != nil || !ok {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.users[u.ID] = u
	s.usersByLoginName[u.LoginName] = u.ID
	return nil
}

func (s *Store) closeDatabase() error {
	if s.db == nil {
		return nil
	}
	return s.db.Close()
}

func dbContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 5*time.Second)
}

func dbUnavailable(err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("database unavailable: %w", err)
}
