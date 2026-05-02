package app

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

const (
	tradeTestSeller = "usr_trade_seller"
	tradeTestBuyer  = "usr_trade_buyer"
	tradeTestBuyer2 = "usr_trade_buyer_2"
	tradeTestBase   = int64(10000)
)

type tradeTestStore struct {
	store  *Store
	now    time.Time
	window *CapacityWindow
}

func newTradeTestStore(t *testing.T, capacity int) tradeTestStore {
	t.Helper()
	now := time.Date(2026, 5, 2, 10, 0, 0, 0, time.UTC)
	s := &Store{
		now:                func() time.Time { return now },
		users:              map[string]*User{},
		usersByLoginName:   map[string]string{},
		sessions:           map[string]string{},
		tickers:            map[string]*Ticker{},
		slots:              map[string]*Slot{},
		kbs:                map[string]*KnowledgeBase{},
		windows:            map[string]*CapacityWindow{},
		tickets:            map[string]*TimeTicket{},
		receipts:           map[string]*TicketReceipt{},
		receiptsByTicket:   map[string]string{},
		trades:             map[string]*Trade{},
		orders:             map[string]*TimingOrder{},
		chatSessions:       map[string]*Session{},
		activeSessionByKey: map[string]string{},
		events:             map[string]*MarketEvent{},
		aggregations:       map[string]*WindowAggregation{},
		demoBatches:        map[string]*DemoHistoryBatch{},
	}
	s.users[tradeTestSeller] = &User{ID: tradeTestSeller, LoginName: "seller", DisplayName: "Seller", TickerSymbol: "TEST", MBTI: "INTJ", Bio: "Test seller profile", BalanceCents: 100000}
	s.users[tradeTestBuyer] = &User{ID: tradeTestBuyer, LoginName: "buyer", DisplayName: "Buyer", BalanceCents: 50000}
	s.users[tradeTestBuyer2] = &User{ID: tradeTestBuyer2, LoginName: "buyer2", DisplayName: "Buyer 2", BalanceCents: 50000}
	s.tickers["tic_trade_test"] = &Ticker{ID: "tic_trade_test", OwnerUserID: tradeTestSeller, Symbol: "TEST", DisplayName: "Test", CreatedAt: now}
	slot := &Slot{
		ID:                    "slot_trade_test",
		TickerID:              "tic_trade_test",
		SlotName:              "Consultation",
		SlotType:              "human",
		UnifiedBasePriceCents: tradeTestBase,
		DefaultCapacityLimit:  capacity,
		IsActive:              true,
		CreatedAt:             now,
	}
	s.slots[slot.ID] = slot
	window, _, err := s.createWindowLocked(slot, now.Add(48*time.Hour), 30, capacity, tradeTestBase)
	if err != nil {
		t.Fatalf("create window: %v", err)
	}
	return tradeTestStore{store: s, now: now, window: window}
}

func doTestJSON(t *testing.T, client *http.Client, method, url, token string, body any, status int, target any) {
	t.Helper()
	var payload bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&payload).Encode(body); err != nil {
			t.Fatalf("encode request: %v", err)
		}
	}
	req, err := http.NewRequest(method, url, &payload)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != status {
		t.Fatalf("%s %s status = %d, want %d", method, url, resp.StatusCode, status)
	}
	if target != nil {
		if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
			t.Fatalf("decode response: %v", err)
		}
	}
}

func firstListedTicket(t *testing.T, s *Store, windowID string) *TimeTicket {
	t.Helper()
	for _, tk := range s.tickets {
		if tk.CapacityWindowID == windowID && tk.Status == TicketStatusListed && tk.OwnerUserID == "" {
			return tk
		}
	}
	t.Fatalf("no listed ticket in window %s", windowID)
	return nil
}

func countListedTickets(s *Store, windowID string) int {
	count := 0
	for _, tk := range s.tickets {
		if tk.CapacityWindowID == windowID && tk.Status == TicketStatusListed && tk.OwnerUserID == "" {
			count++
		}
	}
	return count
}

func assertBalance(t *testing.T, s *Store, userID string, want int64) {
	t.Helper()
	if got := s.users[userID].BalanceCents; got != want {
		t.Fatalf("balance for %s = %d, want %d", userID, got, want)
	}
}

func assertNoTradeSideEffects(t *testing.T, s *Store, trades, receipts, events int) {
	t.Helper()
	if len(s.trades) != trades {
		t.Fatalf("trade count = %d, want %d", len(s.trades), trades)
	}
	if len(s.receipts) != receipts {
		t.Fatalf("receipt count = %d, want %d", len(s.receipts), receipts)
	}
	if len(s.events) != events {
		t.Fatalf("event count = %d, want %d", len(s.events), events)
	}
}

func TestBuySeatPrimarySaleTransfersAssetsAndCapacity(t *testing.T) {
	fixture := newTradeTestStore(t, 2)
	s := fixture.store
	price := int64(12000)

	ticket, receipt, err := s.BuySeat(tradeTestBuyer, fixture.window.ID, price, "Asia/Shanghai")
	if err != nil {
		t.Fatalf("buy seat: %v", err)
	}

	assertBalance(t, s, tradeTestBuyer, 50000-price)
	assertBalance(t, s, tradeTestSeller, 100000+price-price*20/100)
	if ticket.OwnerUserID != tradeTestBuyer || ticket.Status != TicketStatusOwned {
		t.Fatalf("ticket ownership/status = %s/%s, want %s/%s", ticket.OwnerUserID, ticket.Status, tradeTestBuyer, TicketStatusOwned)
	}
	if receipt.PriceCents != price || receipt.SellerRoyaltyCents != price*15/100 || receipt.PlatformFeeCents != price*5/100 {
		t.Fatalf("receipt fees = price:%d seller:%d platform:%d", receipt.PriceCents, receipt.SellerRoyaltyCents, receipt.PlatformFeeCents)
	}
	window := s.windows[fixture.window.ID]
	if window.SoldCount != 1 || window.RemainingCapacity != 1 {
		t.Fatalf("window capacity = sold:%d remaining:%d, want 1/1", window.SoldCount, window.RemainingCapacity)
	}
	if countListedTickets(s, fixture.window.ID) != 1 {
		t.Fatalf("listed tickets after buy = %d, want 1", countListedTickets(s, fixture.window.ID))
	}
	storedReceipt, err := s.Receipt(ticket.ID)
	if err != nil {
		t.Fatalf("receipt lookup: %v", err)
	}
	if storedReceipt.ID != receipt.ID {
		t.Fatalf("stored receipt id = %s, want %s", storedReceipt.ID, receipt.ID)
	}
	holdings := s.Holdings(tradeTestBuyer)["holdings"].([]*TimeTicket)
	if len(holdings) != 1 || holdings[0].ID != ticket.ID {
		t.Fatalf("holdings = %#v, want bought ticket %s", holdings, ticket.ID)
	}
}

func TestHTTPBuySeatConsumesBalanceAndAppearsInHoldingsAndCalendar(t *testing.T) {
	fixture := newTradeTestStore(t, 2)
	s := fixture.store
	server := httptest.NewServer(NewServer(s))
	defer server.Close()

	buyerToken := "buyer-calendar-token"
	s.sessions[buyerToken] = tradeTestBuyer
	price := int64(12000)

	doTestJSON(t, server.Client(), http.MethodPost, server.URL+"/api/windows/"+fixture.window.ID+"/buy-seat", "", map[string]any{
		"price_cents": price,
		"timezone":    "Asia/Shanghai",
	}, http.StatusUnauthorized, nil)
	assertBalance(t, s, tradeTestBuyer, 50000)
	assertBalance(t, s, tradeTestSeller, 100000)

	var buyResponse struct {
		Ticket  TimeTicket    `json:"ticket"`
		Receipt TicketReceipt `json:"receipt"`
	}
	doTestJSON(t, server.Client(), http.MethodPost, server.URL+"/api/windows/"+fixture.window.ID+"/buy-seat", buyerToken, map[string]any{
		"price_cents": price,
		"timezone":    "Asia/Shanghai",
	}, http.StatusOK, &buyResponse)

	if buyResponse.Ticket.OwnerUserID != tradeTestBuyer || buyResponse.Ticket.Status != TicketStatusOwned {
		t.Fatalf("api ticket owner/status = %s/%s, want %s/%s", buyResponse.Ticket.OwnerUserID, buyResponse.Ticket.Status, tradeTestBuyer, TicketStatusOwned)
	}
	if buyResponse.Receipt.PriceCents != price || buyResponse.Receipt.T0TransferConfirmed != true {
		t.Fatalf("api receipt price/t0 = %d/%v, want %d/true", buyResponse.Receipt.PriceCents, buyResponse.Receipt.T0TransferConfirmed, price)
	}

	var meResponse struct {
		Authenticated bool `json:"authenticated"`
		User          User `json:"user"`
	}
	doTestJSON(t, server.Client(), http.MethodGet, server.URL+"/api/me", buyerToken, nil, http.StatusOK, &meResponse)
	if !meResponse.Authenticated || meResponse.User.BalanceCents != 50000-price {
		t.Fatalf("me auth/balance = %v/%d, want true/%d", meResponse.Authenticated, meResponse.User.BalanceCents, 50000-price)
	}

	var holdingsResponse struct {
		Holdings []TimeTicket `json:"holdings"`
	}
	doTestJSON(t, server.Client(), http.MethodGet, server.URL+"/api/holdings", buyerToken, nil, http.StatusOK, &holdingsResponse)
	if len(holdingsResponse.Holdings) != 1 || holdingsResponse.Holdings[0].ID != buyResponse.Ticket.ID {
		t.Fatalf("api holdings = %#v, want bought ticket %s", holdingsResponse.Holdings, buyResponse.Ticket.ID)
	}

	var calendarResponse struct {
		Windows []CapacityWindow `json:"windows"`
	}
	doTestJSON(t, server.Client(), http.MethodGet, server.URL+"/api/calendar/TEST", "", nil, http.StatusOK, &calendarResponse)
	var refreshed *CapacityWindow
	for i := range calendarResponse.Windows {
		if calendarResponse.Windows[i].ID == fixture.window.ID {
			refreshed = &calendarResponse.Windows[i]
			break
		}
	}
	if refreshed == nil {
		t.Fatalf("calendar response missing bought window %s", fixture.window.ID)
	}
	if refreshed.SoldCount != 1 || refreshed.RemainingCapacity != 1 {
		t.Fatalf("calendar capacity = sold:%d remaining:%d, want 1/1", refreshed.SoldCount, refreshed.RemainingCapacity)
	}
}

func TestBuyTicketRejectsInsufficientBalanceWithoutMutation(t *testing.T) {
	fixture := newTradeTestStore(t, 1)
	s := fixture.store
	ticket := firstListedTicket(t, s, fixture.window.ID)
	price := ticket.ListPriceCents
	s.users[tradeTestBuyer].BalanceCents = price - 1

	errTicket, receipt, err := s.BuyTicket(tradeTestBuyer, ticket.ID, price, "UTC")
	if err == nil || !errors.Is(err, ErrForbidden) {
		t.Fatalf("buy with insufficient balance err = %v, want forbidden", err)
	}
	if errTicket != nil || receipt != nil {
		t.Fatalf("failed buy returned ticket/receipt = %#v/%#v", errTicket, receipt)
	}

	assertBalance(t, s, tradeTestBuyer, price-1)
	assertBalance(t, s, tradeTestSeller, 100000)
	stored := s.tickets[ticket.ID]
	if stored.OwnerUserID != "" || stored.Status != TicketStatusListed || stored.CurrentPriceCents != tradeTestBase {
		t.Fatalf("ticket mutated after failed buy: owner=%q status=%s current=%d", stored.OwnerUserID, stored.Status, stored.CurrentPriceCents)
	}
	window := s.windows[fixture.window.ID]
	if window.SoldCount != 0 || window.RemainingCapacity != 1 {
		t.Fatalf("window mutated after failed buy: sold=%d remaining=%d", window.SoldCount, window.RemainingCapacity)
	}
	assertNoTradeSideEffects(t, s, 0, 0, 0)
}

func TestRelistedTicketRequiresCurrentAskAndPaysPreviousOwner(t *testing.T) {
	fixture := newTradeTestStore(t, 1)
	s := fixture.store
	primaryTicket := firstListedTicket(t, s, fixture.window.ID)

	bought, _, err := s.BuyTicket(tradeTestBuyer, primaryTicket.ID, tradeTestBase, "UTC")
	if err != nil {
		t.Fatalf("primary buy: %v", err)
	}
	ask := int64(26000)
	relisted, err := s.Relist(tradeTestBuyer, bought.ID, ask)
	if err != nil {
		t.Fatalf("relist: %v", err)
	}
	if relisted.Status != TicketStatusRelisted || relisted.ListPriceCents != ask {
		t.Fatalf("relisted status/ask = %s/%d, want relisted/%d", relisted.Status, relisted.ListPriceCents, ask)
	}

	beforeBuyer2 := s.users[tradeTestBuyer2].BalanceCents
	beforeHolder := s.users[tradeTestBuyer].BalanceCents
	_, _, err = s.BuyTicket(tradeTestBuyer2, bought.ID, tradeTestBase, "UTC")
	if err == nil || !errors.Is(err, ErrInvalid) {
		t.Fatalf("below ask buy err = %v, want invalid", err)
	}
	assertBalance(t, s, tradeTestBuyer2, beforeBuyer2)
	assertBalance(t, s, tradeTestBuyer, beforeHolder)
	if s.tickets[bought.ID].OwnerUserID != tradeTestBuyer || s.tickets[bought.ID].Status != TicketStatusRelisted {
		t.Fatalf("below ask buy changed ticket owner/status")
	}

	secondary, receipt, err := s.BuyTicket(tradeTestBuyer2, bought.ID, ask, "UTC")
	if err != nil {
		t.Fatalf("secondary buy: %v", err)
	}
	assertBalance(t, s, tradeTestBuyer2, beforeBuyer2-ask)
	assertBalance(t, s, tradeTestBuyer, beforeHolder+ask-ask*20/100)
	assertBalance(t, s, tradeTestSeller, 100000+tradeTestBase-tradeTestBase*20/100)
	if secondary.OwnerUserID != tradeTestBuyer2 || secondary.Status != TicketStatusOwned {
		t.Fatalf("secondary owner/status = %s/%s", secondary.OwnerUserID, secondary.Status)
	}
	if receipt.SellerUserID != tradeTestBuyer || receipt.PriceCents != ask {
		t.Fatalf("secondary receipt seller/price = %s/%d", receipt.SellerUserID, receipt.PriceCents)
	}
	window := s.windows[fixture.window.ID]
	if window.SoldCount != 1 || window.RemainingCapacity != 0 {
		t.Fatalf("secondary trade changed capacity: sold=%d remaining=%d", window.SoldCount, window.RemainingCapacity)
	}
}

func TestDuplicateAndOwnedTicketBuysFailWithoutAssetMutation(t *testing.T) {
	fixture := newTradeTestStore(t, 1)
	s := fixture.store
	ticket := firstListedTicket(t, s, fixture.window.ID)
	bought, _, err := s.BuyTicket(tradeTestBuyer, ticket.ID, tradeTestBase, "UTC")
	if err != nil {
		t.Fatalf("primary buy: %v", err)
	}
	buyerBalance := s.users[tradeTestBuyer].BalanceCents
	buyer2Balance := s.users[tradeTestBuyer2].BalanceCents
	sellerBalance := s.users[tradeTestSeller].BalanceCents

	_, _, err = s.BuyTicket(tradeTestBuyer, bought.ID, tradeTestBase, "UTC")
	if err == nil || !errors.Is(err, ErrConflict) {
		t.Fatalf("same owner rebuy err = %v, want conflict", err)
	}
	_, _, err = s.BuyTicket(tradeTestBuyer2, bought.ID, tradeTestBase, "UTC")
	if err == nil || !errors.Is(err, ErrInvalid) {
		t.Fatalf("owned ticket buy err = %v, want invalid", err)
	}

	assertBalance(t, s, tradeTestBuyer, buyerBalance)
	assertBalance(t, s, tradeTestBuyer2, buyer2Balance)
	assertBalance(t, s, tradeTestSeller, sellerBalance)
	if s.tickets[bought.ID].OwnerUserID != tradeTestBuyer || s.tickets[bought.ID].Status != TicketStatusOwned {
		t.Fatalf("owned ticket mutated after duplicate buys")
	}
	assertNoTradeSideEffects(t, s, 1, 1, 1)
}

func TestBuySeatStopsAtCapacityWithoutCharging(t *testing.T) {
	fixture := newTradeTestStore(t, 1)
	s := fixture.store
	if _, _, err := s.BuySeat(tradeTestBuyer, fixture.window.ID, tradeTestBase, "UTC"); err != nil {
		t.Fatalf("first buy seat: %v", err)
	}
	buyer2Balance := s.users[tradeTestBuyer2].BalanceCents
	sellerBalance := s.users[tradeTestSeller].BalanceCents

	_, _, err := s.BuySeat(tradeTestBuyer2, fixture.window.ID, tradeTestBase, "UTC")
	if err == nil || !errors.Is(err, ErrConflict) {
		t.Fatalf("full window buy err = %v, want conflict", err)
	}
	assertBalance(t, s, tradeTestBuyer2, buyer2Balance)
	assertBalance(t, s, tradeTestSeller, sellerBalance)
	window := s.windows[fixture.window.ID]
	if window.SoldCount != 1 || window.RemainingCapacity != 0 {
		t.Fatalf("full window mutated capacity: sold=%d remaining=%d", window.SoldCount, window.RemainingCapacity)
	}
	assertNoTradeSideEffects(t, s, 1, 1, 1)
}

func TestDefaultRefundsOnceAndCutInUsesStoreClockForAssetTransfer(t *testing.T) {
	fixture := newTradeTestStore(t, 1)
	s := fixture.store
	ticket := firstListedTicket(t, s, fixture.window.ID)
	bought, _, err := s.BuyTicket(tradeTestBuyer, ticket.ID, tradeTestBase, "UTC")
	if err != nil {
		t.Fatalf("primary buy: %v", err)
	}
	s.tickets[bought.ID].EndsAt = fixture.now.Add(15 * time.Minute)
	holderBeforeDefault := s.users[tradeTestBuyer].BalanceCents

	defaulted, err := s.DefaultTicket(tradeTestBuyer, bought.ID)
	if err != nil {
		t.Fatalf("default: %v", err)
	}
	if defaulted.Status != TicketStatusDefaulting {
		t.Fatalf("default status = %s, want defaulting", defaulted.Status)
	}
	assertBalance(t, s, tradeTestBuyer, holderBeforeDefault+tradeTestBase)

	_, err = s.DefaultTicket(tradeTestBuyer, bought.ID)
	if err == nil || !errors.Is(err, ErrInvalid) {
		t.Fatalf("second default err = %v, want invalid", err)
	}
	assertBalance(t, s, tradeTestBuyer, holderBeforeDefault+tradeTestBase)

	cutInPrice := tradeTestBase * 900 / 1800
	buyer2Before := s.users[tradeTestBuyer2].BalanceCents
	holderBeforeCutIn := s.users[tradeTestBuyer].BalanceCents
	cutInTicket, receipt, err := s.CutIn(tradeTestBuyer2, bought.ID, "Asia/Shanghai")
	if err != nil {
		t.Fatalf("cut in: %v", err)
	}
	if cutInTicket.OwnerUserID != tradeTestBuyer2 || cutInTicket.Status != TicketStatusOwned {
		t.Fatalf("cut-in owner/status = %s/%s", cutInTicket.OwnerUserID, cutInTicket.Status)
	}
	if receipt.PriceCents != cutInPrice || receipt.SellerRoyaltyCents != cutInPrice*15/100 || receipt.PlatformFeeCents != cutInPrice*5/100 {
		t.Fatalf("cut-in receipt = price:%d seller:%d platform:%d, want price:%d", receipt.PriceCents, receipt.SellerRoyaltyCents, receipt.PlatformFeeCents, cutInPrice)
	}
	assertBalance(t, s, tradeTestBuyer2, buyer2Before-cutInPrice)
	assertBalance(t, s, tradeTestBuyer, holderBeforeCutIn+cutInPrice-cutInPrice*20/100)
}

func TestExpiredCutInFailsWithoutAssetMutation(t *testing.T) {
	fixture := newTradeTestStore(t, 1)
	s := fixture.store
	ticket := firstListedTicket(t, s, fixture.window.ID)
	bought, _, err := s.BuyTicket(tradeTestBuyer, ticket.ID, tradeTestBase, "UTC")
	if err != nil {
		t.Fatalf("primary buy: %v", err)
	}
	s.tickets[bought.ID].EndsAt = fixture.now.Add(-time.Minute)
	if _, err := s.DefaultTicket(tradeTestBuyer, bought.ID); err != nil {
		t.Fatalf("default expired ticket: %v", err)
	}
	buyer2Balance := s.users[tradeTestBuyer2].BalanceCents
	holderBalance := s.users[tradeTestBuyer].BalanceCents
	tradeCount := len(s.trades)
	receiptCount := len(s.receipts)

	cutInTicket, receipt, err := s.CutIn(tradeTestBuyer2, bought.ID, "UTC")
	if err == nil || !errors.Is(err, ErrForbidden) {
		t.Fatalf("expired cut-in err = %v, want forbidden", err)
	}
	if cutInTicket != nil || receipt != nil {
		t.Fatalf("expired cut-in returned ticket/receipt = %#v/%#v", cutInTicket, receipt)
	}
	assertBalance(t, s, tradeTestBuyer2, buyer2Balance)
	assertBalance(t, s, tradeTestBuyer, holderBalance)
	if s.tickets[bought.ID].OwnerUserID != tradeTestBuyer || s.tickets[bought.ID].Status != TicketStatusDefaulting {
		t.Fatalf("expired cut-in mutated ticket owner/status")
	}
	if len(s.trades) != tradeCount || len(s.receipts) != receiptCount {
		t.Fatalf("expired cut-in created side effects: trades %d/%d receipts %d/%d", len(s.trades), tradeCount, len(s.receipts), receiptCount)
	}
}

func TestProfileTickerScaffoldCreatesIsolatedMockMarket(t *testing.T) {
	fixture := newTradeTestStore(t, 1)
	s := fixture.store
	userID := "usr_profile_market"
	s.users[userID] = &User{
		ID:           userID,
		LoginName:    "profilemarket",
		DisplayName:  "Profile Market",
		BalanceCents: 100000,
		CreatedAt:    fixture.now.Add(-time.Hour),
	}

	symbol := "PMKT"
	mbti := "ENTJ"
	bio := "I sell focused product and engineering review time."
	price := int64(15000)
	updated, err := s.UpdateProfile(userID, ProfilePatch{
		TickerSymbol:        &symbol,
		MBTI:                &mbti,
		Bio:                 &bio,
		AgentBasePriceCents: &price,
	})
	if err != nil {
		t.Fatalf("update profile: %v", err)
	}
	if updated.TickerSymbol != symbol {
		t.Fatalf("ticker symbol = %s, want %s", updated.TickerSymbol, symbol)
	}

	market, err := s.Market(symbol)
	if err != nil {
		t.Fatalf("market: %v", err)
	}
	windows := market["windows"].([]*CapacityWindow)
	tickets := market["listed_tickets"].([]*TimeTicket)
	trades := market["trade_tape"].([]*Trade)
	events := market["market_events"].([]*MarketEvent)
	if len(windows) != 3 {
		t.Fatalf("window count = %d, want 3", len(windows))
	}
	if len(tickets) == 0 {
		t.Fatalf("expected listed tickets for generated market")
	}
	avatarURL := "/uploads/profile/avatars/usr_profile_market-avatar.png"
	updated, err = s.UpdateProfile(userID, ProfilePatch{
		AvatarURL:     &avatarURL,
		ChatAvatarURL: &avatarURL,
		TradeLogoURL:  &avatarURL,
	})
	if err != nil {
		t.Fatalf("update profile avatar: %v", err)
	}
	if updated.AvatarURL != avatarURL || updated.ChatAvatarURL != avatarURL || updated.TradeLogoURL != avatarURL {
		t.Fatalf("profile avatar fields = avatar %q chat %q logo %q, want %q", updated.AvatarURL, updated.ChatAvatarURL, updated.TradeLogoURL, avatarURL)
	}
	market, err = s.Market(symbol)
	if err != nil {
		t.Fatalf("market after avatar update: %v", err)
	}
	if got := market["ticker"].(*Ticker).AvatarURL; got != avatarURL {
		t.Fatalf("market ticker avatar = %q, want %q", got, avatarURL)
	}
	if len(trades) == 0 || len(events) == 0 {
		t.Fatalf("expected mock trades/events, got trades=%d events=%d", len(trades), len(events))
	}
	for _, trade := range trades {
		tk := s.tickets[trade.TicketID]
		if tk == nil || tk.TickerID != "tic_user_"+userID {
			t.Fatalf("trade %s leaked from another ticker via ticket %s", trade.ID, trade.TicketID)
		}
		if trade.PriceCents < price {
			t.Fatalf("trade price = %d, want >= base %d", trade.PriceCents, price)
		}
	}

	tradeCount := len(trades)
	eventCount := len(events)
	_, err = s.UpdateProfile(userID, ProfilePatch{Bio: &bio})
	if err != nil {
		t.Fatalf("second profile update: %v", err)
	}
	marketAgain, err := s.Market(symbol)
	if err != nil {
		t.Fatalf("market again: %v", err)
	}
	if got := len(marketAgain["trade_tape"].([]*Trade)); got != tradeCount {
		t.Fatalf("trade count after second update = %d, want %d", got, tradeCount)
	}
	if got := len(marketAgain["market_events"].([]*MarketEvent)); got != eventCount {
		t.Fatalf("event count after second update = %d, want %d", got, eventCount)
	}
}

func TestMarketReplenishesLiquidityAfterTickerSellsOut(t *testing.T) {
	fixture := newTradeTestStore(t, 1)
	s := fixture.store
	userID := "usr_sellout_market"
	s.users[userID] = &User{
		ID:           userID,
		LoginName:    "sellout",
		DisplayName:  "Sellout Market",
		BalanceCents: 100000,
		CreatedAt:    fixture.now.Add(-time.Hour),
	}
	s.users[tradeTestBuyer].BalanceCents = 500000

	symbol := "SOUT"
	mbti := "INTJ"
	bio := "I sell focused review time."
	price := int64(11000)
	if _, err := s.UpdateProfile(userID, ProfilePatch{
		TickerSymbol:        &symbol,
		MBTI:                &mbti,
		Bio:                 &bio,
		AgentBasePriceCents: &price,
	}); err != nil {
		t.Fatalf("update profile: %v", err)
	}

	initialMarket, err := s.Market(symbol)
	if err != nil {
		t.Fatalf("initial market: %v", err)
	}
	initialTickets := initialMarket["listed_tickets"].([]*TimeTicket)
	if len(initialTickets) == 0 {
		t.Fatalf("expected initial listed tickets")
	}
	for _, ticket := range initialTickets {
		if _, _, err := s.BuyTicket(tradeTestBuyer, ticket.ID, ticket.ListPriceCents, "UTC"); err != nil {
			t.Fatalf("buy ticket %s: %v", ticket.ID, err)
		}
	}
	if got := len(s.listedTicketsLocked("tic_user_" + userID)); got != 0 {
		t.Fatalf("listed tickets before replenish = %d, want 0", got)
	}

	replenishedMarket, err := s.Market(symbol)
	if err != nil {
		t.Fatalf("replenished market: %v", err)
	}
	replenishedTickets := replenishedMarket["listed_tickets"].([]*TimeTicket)
	if len(replenishedTickets) == 0 {
		t.Fatalf("expected market to replenish listed tickets after sellout")
	}
	for _, ticket := range replenishedTickets {
		if ticket.OwnerUserID != "" || ticket.Status != TicketStatusListed || ticket.ListPriceCents < price {
			t.Fatalf("bad replenished ticket: owner=%q status=%s list=%d", ticket.OwnerUserID, ticket.Status, ticket.ListPriceCents)
		}
	}
}

func TestDiscoverAndExperienceAvatarPreferTradeLogoThenChatAvatar(t *testing.T) {
	fixture := newTradeTestStore(t, 1)
	s := fixture.store
	seller := s.users[tradeTestSeller]
	seller.AvatarURL = "/uploads/avatars/plain.png"
	seller.ChatAvatarURL = "/uploads/avatars/chat.png"
	seller.TradeLogoURL = "/uploads/logos/logo.png"
	seller.PortraitURL = "/uploads/portraits/full.png"
	s.tickers["tic_trade_test"].AvatarURL = profileAvatarURL(seller)

	discover := s.Discover()
	profiles := discover["registered_users"].([]map[string]any)
	if len(profiles) != 1 {
		t.Fatalf("registered profile count = %d, want 1", len(profiles))
	}
	if got := profiles[0]["avatar_url"]; got != seller.TradeLogoURL {
		t.Fatalf("discover profile avatar_url = %q, want trade logo %q", got, seller.TradeLogoURL)
	}
	if got := profiles[0]["chat_avatar_url"]; got != seller.ChatAvatarURL {
		t.Fatalf("discover profile chat_avatar_url = %q, want %q", got, seller.ChatAvatarURL)
	}
	if got := profiles[0]["trade_logo_url"]; got != seller.TradeLogoURL {
		t.Fatalf("discover profile trade_logo_url = %q, want %q", got, seller.TradeLogoURL)
	}

	experiences := s.ExperiencePersonas()
	if len(experiences) != 1 {
		t.Fatalf("experience persona count = %d, want 1", len(experiences))
	}
	if got := experiences[0]["avatar_url"]; got != seller.TradeLogoURL {
		t.Fatalf("experience avatar_url = %q, want trade logo %q", got, seller.TradeLogoURL)
	}
	if got := profileAvatarURL(seller); got != seller.TradeLogoURL {
		t.Fatalf("profileAvatarURL = %q, want trade logo %q", got, seller.TradeLogoURL)
	}

	seller.TradeLogoURL = ""
	if got := profileAvatarURL(seller); got != seller.ChatAvatarURL {
		t.Fatalf("profileAvatarURL without trade logo = %q, want chat avatar %q", got, seller.ChatAvatarURL)
	}
}
