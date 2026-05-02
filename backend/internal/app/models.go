package app

import "time"

const (
	TicketStatusDraft          = "draft"
	TicketStatusListed         = "listed"
	TicketStatusOwned          = "owned"
	TicketStatusRelisted       = "relisted"
	TicketStatusHalted         = "halted"
	TicketStatusDefaulting     = "defaulting"
	TicketStatusCutInAvailable = "cut_in_available"
	TicketStatusInSession      = "in_session"
	TicketStatusCompleted      = "completed"
	TicketStatusCancelled      = "cancelled"
)

type ProfileLink struct {
	Type string `json:"type"`
	URL  string `json:"url"`
}

type ProfilePatch struct {
	DisplayName         *string        `json:"display_name"`
	TickerSymbol        *string        `json:"ticker_symbol"`
	AvatarURL           *string        `json:"avatar_url"`
	InitialInfo         *string        `json:"initial_info"`
	Headline            *string        `json:"headline"`
	Organization        *string        `json:"organization"`
	MBTI                *string        `json:"mbti"`
	Expertise           *[]string      `json:"expertise"`
	Bio                 *string        `json:"bio"`
	Links               *[]ProfileLink `json:"links"`
	Offer               *string        `json:"offer"`
	PortraitURL         *string        `json:"portrait_url"`
	ChatAvatarURL       *string        `json:"chat_avatar_url"`
	TradeLogoURL        *string        `json:"trade_logo_url"`
	AgentBasePriceCents *int64         `json:"agent_base_price_cents"`
}

type User struct {
	ID                  string        `json:"id"`
	LoginName           string        `json:"login_name"`
	Email               string        `json:"email,omitempty"`
	PasswordHash        string        `json:"-"`
	DisplayName         string        `json:"display_name"`
	TickerSymbol        string        `json:"ticker_symbol,omitempty"`
	AvatarURL           string        `json:"avatar_url,omitempty"`
	InitialInfo         string        `json:"initial_info,omitempty"`
	Headline            string        `json:"headline,omitempty"`
	Organization        string        `json:"organization,omitempty"`
	MBTI                string        `json:"mbti,omitempty"`
	Expertise           []string      `json:"expertise,omitempty"`
	Bio                 string        `json:"bio,omitempty"`
	Links               []ProfileLink `json:"links,omitempty"`
	Offer               string        `json:"offer,omitempty"`
	PortraitURL         string        `json:"portrait_url,omitempty"`
	ChatAvatarURL       string        `json:"chat_avatar_url,omitempty"`
	TradeLogoURL        string        `json:"trade_logo_url,omitempty"`
	AgentBasePriceCents int64         `json:"agent_base_price_cents,omitempty"`
	BalanceCents        int64         `json:"balance_cents"`
	CreatedAt           time.Time     `json:"created_at"`
}

type Ticker struct {
	ID            string    `json:"id"`
	OwnerUserID   string    `json:"owner_user_id"`
	Symbol        string    `json:"symbol"`
	DisplayName   string    `json:"display_name"`
	Tagline       string    `json:"tagline"`
	Bio           string    `json:"bio"`
	AvatarURL     string    `json:"avatar_url,omitempty"`
	VerifiedBadge bool      `json:"verified_badge"`
	CreatedAt     time.Time `json:"created_at"`
}

type Slot struct {
	ID                    string    `json:"id"`
	TickerID              string    `json:"ticker_id"`
	SlotName              string    `json:"slot_name"`
	SlotType              string    `json:"slot_type"`
	TokenBudget           int64     `json:"token_budget"`
	PrivacyLevel          string    `json:"privacy_level"`
	KnowledgeBaseID       string    `json:"knowledge_base_id,omitempty"`
	UnifiedBasePriceCents int64     `json:"unified_base_price_cents"`
	DefaultCapacityLimit  int       `json:"default_capacity_limit"`
	IsActive              bool      `json:"is_active"`
	CreatedAt             time.Time `json:"created_at"`
}

type CapacityWindow struct {
	ID                string    `json:"id"`
	TickerID          string    `json:"ticker_id"`
	SlotID            string    `json:"slot_id"`
	StartsAt          time.Time `json:"starts_at"`
	EndsAt            time.Time `json:"ends_at"`
	DurationMinutes   int       `json:"duration_minutes"`
	CapacityLimit     int       `json:"capacity_limit"`
	SoldCount         int       `json:"sold_count"`
	RemainingCapacity int       `json:"remaining_capacity"`
	BasePriceCents    int64     `json:"base_price_cents"`
	MinSalePriceCents int64     `json:"min_sale_price_cents"`
	Status            string    `json:"status"`
	TradeHaltsAt      time.Time `json:"trade_halts_at"`
}

type KnowledgeBase struct {
	ID                 string    `json:"id"`
	SlotID             string    `json:"slot_id"`
	Name               string    `json:"name"`
	Summary            string    `json:"summary"`
	DocumentCount      int       `json:"document_count"`
	DemoSourceNames    []string  `json:"demo_source_names"`
	Status             string    `json:"status"`
	ImportedByOneClick bool      `json:"imported_by_one_click"`
	CreatedAt          time.Time `json:"created_at"`
}

type TimeTicket struct {
	ID                string    `json:"id"`
	TickerID          string    `json:"ticker_id"`
	SlotID            string    `json:"slot_id"`
	CapacityWindowID  string    `json:"capacity_window_id"`
	IssuerUserID      string    `json:"issuer_user_id"`
	OwnerUserID       string    `json:"owner_user_id,omitempty"`
	Title             string    `json:"title"`
	InteractionType   string    `json:"interaction_type"`
	StartsAt          time.Time `json:"starts_at"`
	EndsAt            time.Time `json:"ends_at"`
	DurationMinutes   int       `json:"duration_minutes"`
	BasePriceCents    int64     `json:"base_price_cents"`
	CurrentPriceCents int64     `json:"current_price_cents"`
	ListPriceCents    int64     `json:"list_price_cents"`
	SeatIndex         int       `json:"seat_index"`
	Status            string    `json:"status"`
	TradeHaltsAt      time.Time `json:"trade_halts_at"`
	ResaleCount       int       `json:"resale_count"`
	MaxResaleCount    int       `json:"max_resale_count"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type WindowAggregation struct {
	ID              string    `json:"id"`
	TickerID        string    `json:"ticker_id"`
	SlotID          string    `json:"slot_id"`
	UserID          string    `json:"user_id"`
	SourceTicketIDs []string  `json:"source_ticket_ids"`
	SourceWindowIDs []string  `json:"source_window_ids"`
	TargetWindowID  string    `json:"target_window_id"`
	FeeCents        int64     `json:"fee_cents"`
	Reason          string    `json:"reason"`
	Status          string    `json:"status"`
	CreatedAt       time.Time `json:"created_at"`
}

type TicketReceipt struct {
	ID                  string    `json:"id"`
	TicketID            string    `json:"ticket_id"`
	ReceiptCode         string    `json:"receipt_code"`
	BuyerUserID         string    `json:"buyer_user_id"`
	SellerUserID        string    `json:"seller_user_id"`
	SessionID           string    `json:"session_id"`
	PriceCents          int64     `json:"price_cents"`
	SellerRoyaltyCents  int64     `json:"seller_royalty_cents"`
	PlatformFeeCents    int64     `json:"platform_fee_cents"`
	Timezone            string    `json:"timezone"`
	IssuedAt            time.Time `json:"issued_at"`
	T0TransferConfirmed bool      `json:"t0_transfer_confirmed"`
}

type Trade struct {
	ID               string    `json:"id"`
	TicketID         string    `json:"ticket_id"`
	BuyerUserID      string    `json:"buyer_user_id"`
	SellerUserID     string    `json:"seller_user_id"`
	PriceCents       int64     `json:"price_cents"`
	SellerFeeCents   int64     `json:"seller_fee_cents"`
	PlatformFeeCents int64     `json:"platform_fee_cents"`
	TradeType        string    `json:"trade_type"`
	CreatedAt        time.Time `json:"created_at"`
}

type TimingOrder struct {
	ID                 string    `json:"id"`
	TickerID           string    `json:"ticker_id"`
	UserID             string    `json:"user_id"`
	OrderType          string    `json:"order_type"`
	CurrentTicketID    string    `json:"current_ticket_id"`
	TargetTime         time.Time `json:"target_time"`
	LimitPriceCents    int64     `json:"limit_price_cents"`
	AllowNegativePrice bool      `json:"allow_negative_price"`
	Status             string    `json:"status"`
	CreatedAt          time.Time `json:"created_at"`
}

type ChatMessage struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type SessionTopic struct {
	ID          string    `json:"id"`
	SessionID   string    `json:"session_id"`
	Title       string    `json:"title"`
	Summary     string    `json:"summary"`
	MessageRefs []string  `json:"message_refs"`
	Confidence  float64   `json:"confidence"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Session struct {
	ID              string         `json:"id"`
	SessionID       string         `json:"session_id"`
	TicketID        string         `json:"ticket_id"`
	BuyerUserID     string         `json:"buyer_user_id"`
	SellerUserID    string         `json:"seller_user_id"`
	SessionType     string         `json:"session_type"`
	Status          string         `json:"status"`
	ModelID         string         `json:"model_id,omitempty"`
	TokensUsed      int64          `json:"tokens_used"`
	TokenBudget     int64          `json:"token_budget"`
	Transcript      []ChatMessage  `json:"transcript"`
	Topics          []SessionTopic `json:"topics"`
	Summary         string         `json:"summary,omitempty"`
	AgentState      string         `json:"agent_state"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	UniqueActiveKey string         `json:"unique_active_key"`
}

type RuntimeConfig struct {
	ID                         string      `json:"id"`
	Provider                   string      `json:"provider"`
	Status                     string      `json:"status"`
	ConfiguredByEnvironment    bool        `json:"configured_by_environment"`
	MockEnabled                bool        `json:"mock_enabled"`
	LastHealthCheckAt          time.Time   `json:"last_health_check_at"`
	UserFacingRuntimeSetupFlow bool        `json:"user_facing_runtime_setup_flow"`
	DefaultModelID             string      `json:"default_model_id,omitempty"`
	ConfiguredModels           []LLMConfig `json:"configured_models,omitempty"`
}

type LLMConfig struct {
	ID                      string    `json:"id"`
	Name                    string    `json:"name"`
	Provider                string    `json:"provider"`
	APIFormat               string    `json:"api_format"`
	BaseURL                 string    `json:"base_url,omitempty"`
	Model                   string    `json:"model"`
	MaxTokens               int       `json:"max_tokens"`
	Temperature             float64   `json:"temperature"`
	Status                  string    `json:"status"`
	ConfiguredByEnvironment bool      `json:"configured_by_environment"`
	CreatedAt               time.Time `json:"created_at"`
	APIKey                  string    `json:"-"`
}

type MarketEvent struct {
	ID         string    `json:"id"`
	TicketID   string    `json:"ticket_id,omitempty"`
	EventType  string    `json:"event_type"`
	PriceCents *int64    `json:"price_cents,omitempty"`
	Message    string    `json:"message"`
	CreatedAt  time.Time `json:"created_at"`
}

type DemoHistoryBatch struct {
	ID                  string    `json:"id"`
	Scope               string    `json:"scope"`
	CreatedByUserID     string    `json:"created_by_user_id,omitempty"`
	CreatedTicketCount  int       `json:"created_ticket_count"`
	CreatedTradeCount   int       `json:"created_trade_count"`
	CreatedSessionCount int       `json:"created_session_count"`
	CreatedTopicCount   int       `json:"created_topic_count"`
	CreatedAt           time.Time `json:"created_at"`
}
