package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Server struct {
	store *Store
	mux   *http.ServeMux
}

type profileImportResult struct {
	URL         string `json:"url"`
	Type        string `json:"type"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Status      string `json:"status"`
}

var (
	titleTagPattern = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	metaTagPattern  = regexp.MustCompile(`(?is)<meta\s+[^>]*>`)
	attrPattern     = regexp.MustCompile(`(?is)(name|property|content)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))`)
	tagPattern      = regexp.MustCompile(`(?is)<[^>]+>`)
	spacePattern    = regexp.MustCompile(`\s+`)
)

func NewServer(store *Store) *Server {
	s := &Server{store: store, mux: http.NewServeMux()}
	s.routes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", originOrWildcard(r.Header.Get("Origin")))
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	s.mux.ServeHTTP(w, r)
}

func (s *Server) routes() {
	s.mux.HandleFunc("/", s.handle)
}

func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/uploads/") && r.Method == http.MethodGet {
		s.handleUploadedFile(w, r)
		return
	}

	path := strings.Trim(r.URL.Path, "/")
	parts := []string{}
	if path != "" {
		parts = strings.Split(path, "/")
	}

	if r.URL.Path == "/healthz" && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, s.store.Health())
		return
	}
	if r.URL.Path == "/readyz" && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, s.store.Ready())
		return
	}
	if len(parts) == 0 || parts[0] != "api" {
		writeError(w, http.StatusNotFound, "not_found", "route not found", nil)
		return
	}

	switch {
	case len(parts) == 2 && parts[1] == "auth":
		writeError(w, http.StatusNotFound, "not_found", "auth route not found", nil)
	case len(parts) == 3 && parts[1] == "auth" && parts[2] == "register" && r.Method == http.MethodPost:
		s.handleRegister(w, r)
	case len(parts) == 3 && parts[1] == "auth" && parts[2] == "login" && r.Method == http.MethodPost:
		s.handleLogin(w, r)
	case len(parts) == 3 && parts[1] == "auth" && parts[2] == "logout" && r.Method == http.MethodPost:
		s.handleLogout(w, r)
	case len(parts) == 2 && parts[1] == "me" && r.Method == http.MethodGet:
		s.handleMe(w, r)
	case len(parts) == 2 && parts[1] == "profile" && r.Method == http.MethodGet:
		s.handleProfile(w, r)
	case len(parts) == 2 && parts[1] == "profile" && r.Method == http.MethodPatch:
		s.handleProfilePatch(w, r)
	case len(parts) == 3 && parts[1] == "profile" && parts[2] == "import-links" && r.Method == http.MethodPost:
		s.handleProfileImportLinks(w, r)
	case len(parts) == 3 && parts[1] == "profile" && parts[2] == "portrait" && r.Method == http.MethodPost:
		s.handleProfilePortrait(w, r)
	case len(parts) == 3 && parts[1] == "profiles" && r.Method == http.MethodGet:
		s.handlePublicProfile(w, r, parts[2])
	case len(parts) == 2 && parts[1] == "discover" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.Discover())
	case len(parts) == 2 && parts[1] == "tickers" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"tickers": s.store.ListTickers(), "anonymous_read_only": true})
	case len(parts) == 2 && parts[1] == "tickers" && r.Method == http.MethodPost:
		s.handleCreateTicker(w, r)
	case len(parts) == 3 && parts[1] == "tickers" && r.Method == http.MethodGet:
		s.handleGetTicker(w, r, parts[2])
	case len(parts) == 3 && parts[1] == "tickers" && r.Method == http.MethodPatch:
		s.handlePatchTicker(w, r, parts[2])
	case len(parts) == 2 && parts[1] == "slots" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"slots": s.store.ListSlots(r.URL.Query().Get("ticker_id"))})
	case len(parts) == 2 && parts[1] == "slots" && r.Method == http.MethodPost:
		s.handleCreateSlot(w, r)
	case len(parts) == 4 && parts[1] == "slots" && parts[3] == "windows" && r.Method == http.MethodPost:
		s.handleCreateWindow(w, r, parts[2])
	case len(parts) == 4 && parts[1] == "slots" && parts[3] == "windows" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"windows": s.store.WindowsForSlot(parts[2])})
	case len(parts) == 2 && parts[1] == "knowledge-bases" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"knowledge_bases": s.store.ListKnowledgeBases(r.URL.Query().Get("slot_id"))})
	case len(parts) == 2 && parts[1] == "knowledge-bases" && r.Method == http.MethodPost:
		s.handleImportKnowledgeBase(w, r, false)
	case len(parts) == 3 && parts[1] == "knowledge-bases" && parts[2] == "import-demo" && r.Method == http.MethodPost:
		s.handleImportKnowledgeBase(w, r, true)
	case len(parts) == 3 && parts[1] == "calendar" && r.Method == http.MethodGet:
		s.handleCalendar(w, r, parts[2])
	case len(parts) == 3 && parts[1] == "market" && r.Method == http.MethodGet:
		s.handleMarket(w, r, parts[2])
	case len(parts) == 2 && parts[1] == "tickets" && r.Method == http.MethodPost:
		s.handleIssueTicket(w, r)
	case len(parts) == 4 && parts[1] == "tickets" && parts[3] == "buy" && r.Method == http.MethodPost:
		s.handleBuyTicket(w, r, parts[2])
	case len(parts) == 4 && parts[1] == "tickets" && parts[3] == "relist" && r.Method == http.MethodPost:
		s.handleRelist(w, r, parts[2])
	case len(parts) == 4 && parts[1] == "tickets" && parts[3] == "default" && r.Method == http.MethodPost:
		s.handleDefault(w, r, parts[2])
	case len(parts) == 4 && parts[1] == "tickets" && parts[3] == "cut-in" && r.Method == http.MethodPost:
		s.handleCutIn(w, r, parts[2])
	case len(parts) == 4 && parts[1] == "tickets" && parts[3] == "receipt" && r.Method == http.MethodGet:
		s.handleReceipt(w, r, parts[2])
	case len(parts) == 4 && parts[1] == "windows" && parts[3] == "buy-seat" && r.Method == http.MethodPost:
		s.handleBuySeat(w, r, parts[2])
	case len(parts) == 3 && parts[1] == "windows" && parts[2] == "nearest-delay" && r.Method == http.MethodPost:
		s.handleNearestDelay(w, r)
	case len(parts) == 3 && parts[1] == "windows" && parts[2] == "aggregate-later" && r.Method == http.MethodPost:
		s.handleAggregateLater(w, r)
	case len(parts) == 2 && parts[1] == "holdings" && r.Method == http.MethodGet:
		s.handleHoldings(w, r)
	case len(parts) == 3 && parts[1] == "timing-orders" && r.Method == http.MethodGet:
		s.handleListTimingOrders(w, r, parts[2])
	case len(parts) == 3 && parts[1] == "timing-orders" && (parts[2] == "speed-up" || parts[2] == "extension") && r.Method == http.MethodPost:
		s.handleCreateTimingOrder(w, r, strings.ReplaceAll(parts[2], "-", "_"))
	case len(parts) == 4 && parts[1] == "timing-orders" && parts[3] == "match" && r.Method == http.MethodPost:
		s.handleMatchTimingOrder(w, r, parts[2])
	case len(parts) == 3 && parts[1] == "sessions" && parts[2] == "start" && r.Method == http.MethodPost:
		s.handleStartSession(w, r)
	case len(parts) == 3 && parts[1] == "sessions" && r.Method == http.MethodGet:
		s.handleGetSession(w, r, parts[2])
	case len(parts) == 4 && parts[1] == "sessions" && parts[3] == "message" && r.Method == http.MethodPost:
		s.handleSessionMessage(w, r, parts[2])
	case len(parts) == 4 && parts[1] == "sessions" && parts[3] == "end" && r.Method == http.MethodPost:
		s.handleEndSession(w, r, parts[2])
	case len(parts) == 5 && parts[1] == "sessions" && parts[3] == "topics" && parts[4] == "organize" && r.Method == http.MethodPost:
		s.handleOrganizeTopics(w, r, parts[2])
	case len(parts) == 3 && parts[1] == "runtime" && parts[2] == "health" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.RuntimeHealth())
	case len(parts) == 3 && parts[1] == "runtime" && parts[2] == "mock-route" && r.Method == http.MethodPost:
		s.handleRuntimeMockRoute(w, r)
	case len(parts) == 3 && parts[1] == "conversation" && parts[2] == "start" && r.Method == http.MethodPost:
		s.handleStartDirectConversation(w, r)
	case len(parts) == 3 && parts[1] == "conversation" && parts[2] == "preview" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.ConversationPreview())
	case len(parts) == 3 && parts[1] == "conversations" && parts[2] == "experience-options" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"personas": s.store.ExperiencePersonas()})
	case len(parts) == 3 && parts[1] == "conversations" && parts[2] == "experience" && r.Method == http.MethodPost:
		s.handleStartExperienceConversation(w, r)
	case len(parts) == 3 && parts[1] == "demo" && parts[2] == "script" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.DemoScript())
	case len(parts) >= 3 && parts[1] == "demo":
		s.handleDemo(w, r, parts[2:])
	default:
		writeError(w, http.StatusNotFound, "not_found", "route not found", map[string]any{"path": r.URL.Path})
	}
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		LoginName     string `json:"login_name"`
		Email         string `json:"email,omitempty"`
		Password      string `json:"password"`
		DisplayName   string `json:"display_name"`
		PendingAction any    `json:"pending_action"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	user, token, created, err := s.store.Register(firstNonEmpty(req.LoginName, req.Email), req.Password, req.DisplayName)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	setSessionCookie(w, token)
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeJSON(w, status, map[string]any{"user": user, "token": token, "created": created, "pending_action": req.PendingAction})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		LoginName     string `json:"login_name"`
		Email         string `json:"email,omitempty"`
		Password      string `json:"password"`
		PendingAction any    `json:"pending_action"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	user, token, err := s.store.Login(firstNonEmpty(req.LoginName, req.Email), req.Password)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	setSessionCookie(w, token)
	writeJSON(w, http.StatusOK, map[string]any{"user": user, "token": token, "pending_action": req.PendingAction})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	token := bearerOrCookieToken(r)
	s.store.Logout(token)
	http.SetCookie(w, &http.Cookie{Name: "timex_session", Value: "", Path: "/", MaxAge: -1, SameSite: http.SameSiteLaxMode})
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	if user, ok := s.currentUser(r); ok {
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "user": user, "balance_cents": user.BalanceCents})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"authenticated": false, "anonymous_read_only": true})
}

func (s *Server) handleProfile(w http.ResponseWriter, r *http.Request) {
	if user, ok := s.currentUser(r); ok {
		writeJSON(w, http.StatusOK, map[string]any{"profile": user})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"profile": map[string]any{"display_name": "Anonymous browser", "anonymous_read_only": true}})
}

func (s *Server) handlePublicProfile(w http.ResponseWriter, r *http.Request, symbol string) {
	profile, err := s.store.PublicProfile(symbol)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	canEdit := false
	if current, ok := s.currentUser(r); ok && current.ID == profile.ID {
		canEdit = true
	}
	writeJSON(w, http.StatusOK, map[string]any{"profile": profile, "can_edit": canEdit})
}

func (s *Server) handleProfilePatch(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r, "edit profile")
	if !ok {
		return
	}
	var req ProfilePatch
	if !decodeJSON(w, r, &req) {
		return
	}
	updated, err := s.store.UpdateProfile(user.ID, req)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"profile": updated})
}

func (s *Server) handleProfileImportLinks(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r, "import profile links")
	if !ok {
		return
	}
	var req struct {
		Links []string `json:"links"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Links) == 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "at least one public link is required", nil)
		return
	}

	imported := make([]profileImportResult, 0, len(req.Links))
	for _, raw := range req.Links {
		if len(imported) == 8 {
			break
		}
		result := fetchProfileMetadata(raw)
		if result.URL != "" {
			imported = append(imported, result)
		}
	}
	if len(imported) == 0 {
		writeError(w, http.StatusBadRequest, "invalid_request", "no valid public profile links were provided", nil)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"suggestion": profileSuggestionFromImports(user, imported),
		"imports":    imported,
	})
}

func fetchProfileMetadata(raw string) profileImportResult {
	linkURL, ok := normalizePublicURL(raw)
	if !ok {
		return profileImportResult{}
	}
	result := profileImportResult{URL: linkURL, Type: profileLinkType(linkURL), Status: "metadata unavailable"}

	client := http.Client{Timeout: 4 * time.Second}
	resp, err := client.Get(linkURL)
	if err != nil {
		return result
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		result.Status = fmt.Sprintf("http %d", resp.StatusCode)
		return result
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 256<<10))
	if err != nil {
		return result
	}
	htmlText := string(body)
	result.Title = firstNonEmpty(
		extractMeta(htmlText, "og:title"),
		extractMeta(htmlText, "twitter:title"),
		extractTitle(htmlText),
	)
	result.Description = firstNonEmpty(
		extractMeta(htmlText, "og:description"),
		extractMeta(htmlText, "twitter:description"),
		extractMeta(htmlText, "description"),
	)
	result.Status = "metadata imported"
	return result
}

func profileSuggestionFromImports(user *User, imports []profileImportResult) map[string]any {
	links := make([]ProfileLink, 0, len(imports))
	expertise := []string{}
	descriptions := []string{}
	headline := ""

	for _, item := range imports {
		links = append(links, ProfileLink{Type: item.Type, URL: item.URL})
		switch item.Type {
		case "linkedin":
			expertise = append(expertise, "Professional advisory")
		case "github":
			expertise = append(expertise, "Software systems")
		case "twitter":
			expertise = append(expertise, "Market commentary")
		case "substack", "medium":
			expertise = append(expertise, "Writing and research")
		case "product":
			expertise = append(expertise, "Founder projects")
		case "youtube":
			expertise = append(expertise, "Creator education")
		default:
			expertise = append(expertise, "Portfolio review")
		}
		if headline == "" && item.Title != "" {
			headline = trimToRunes(cleanProfileText(item.Title), 120)
		}
		if item.Description != "" {
			descriptions = append(descriptions, cleanProfileText(item.Description))
		}
	}

	bio := user.Bio
	if bio == "" && user.InitialInfo != "" {
		bio = user.InitialInfo
	}
	if bio == "" && len(descriptions) > 0 {
		bio = trimToRunes(strings.Join(uniqueStrings(descriptions), " "), 520)
	}
	if headline == "" {
		headline = firstNonEmpty(user.Headline, "Professional time seller")
	}

	return map[string]any{
		"display_name":  user.DisplayName,
		"avatar_url":    user.AvatarURL,
		"headline":      headline,
		"organization":  user.Organization,
		"expertise":     normalizeExpertise(append(user.Expertise, expertise...)),
		"bio":           firstNonEmpty(bio, "I sell focused professional time for product, technical, and operating questions."),
		"links":         normalizeProfileLinks(links),
		"offer":         firstNonEmpty(user.Offer, "30-minute professional consultation"),
		"imported_from": len(imports),
	}
}

func normalizePublicURL(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		raw = "https://" + raw
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Hostname() == "" {
		return "", false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", false
	}
	return parsed.String(), true
}

func profileLinkType(linkURL string) string {
	parsed, err := url.Parse(linkURL)
	if err != nil {
		return "website"
	}
	host := strings.ToLower(parsed.Hostname())
	switch {
	case strings.Contains(host, "linkedin."):
		return "linkedin"
	case host == "x.com" || strings.Contains(host, "twitter."):
		return "twitter"
	case strings.Contains(host, "github."):
		return "github"
	case strings.Contains(host, "linktr.ee") || strings.Contains(host, "linktree."):
		return "linktree"
	case strings.Contains(host, "substack."):
		return "substack"
	case strings.Contains(host, "medium."):
		return "medium"
	case strings.Contains(host, "youtube.") || strings.Contains(host, "youtu.be"):
		return "youtube"
	case strings.Contains(host, "producthunt."):
		return "product"
	default:
		return "website"
	}
}

func extractTitle(htmlText string) string {
	match := titleTagPattern.FindStringSubmatch(htmlText)
	if len(match) < 2 {
		return ""
	}
	return cleanProfileText(match[1])
}

func extractMeta(htmlText, key string) string {
	key = strings.ToLower(key)
	for _, tag := range metaTagPattern.FindAllString(htmlText, -1) {
		attrs := map[string]string{}
		for _, match := range attrPattern.FindAllStringSubmatch(tag, -1) {
			if len(match) < 6 {
				continue
			}
			value := firstNonEmpty(match[3], match[4], match[5])
			attrs[strings.ToLower(match[1])] = value
		}
		if strings.ToLower(attrs["name"]) == key || strings.ToLower(attrs["property"]) == key {
			return cleanProfileText(attrs["content"])
		}
	}
	return ""
}

func cleanProfileText(value string) string {
	value = html.UnescapeString(value)
	value = tagPattern.ReplaceAllString(value, " ")
	value = spacePattern.ReplaceAllString(value, " ")
	return strings.TrimSpace(value)
}

func (s *Server) handleProfilePortrait(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r, "upload portrait")
	if !ok {
		return
	}
	if err := r.ParseMultipartForm(24 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "portrait multipart form is required", nil)
		return
	}

	portraitURL, portraitErr := saveProfileImagePart(r, user.ID, "portrait", "portraits")
	avatarURL, avatarErr := saveProfileImagePart(r, user.ID, "avatar", "avatars")
	logoURL, logoErr := saveProfileImagePart(r, user.ID, "logo", "logos")

	if portraitErr != nil || avatarErr != nil || logoErr != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", firstNonEmpty(errorString(portraitErr), errorString(avatarErr), errorString(logoErr)), nil)
		return
	}
	if portraitURL == "" && avatarURL == "" && logoURL == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "portrait, avatar, or logo image is required", nil)
		return
	}

	patch := ProfilePatch{}
	if portraitURL != "" {
		patch.PortraitURL = stringPtr(portraitURL)
	}
	if avatarURL != "" {
		patch.ChatAvatarURL = stringPtr(avatarURL)
		patch.AvatarURL = stringPtr(avatarURL)
		patch.TradeLogoURL = stringPtr(avatarURL)
	}
	if logoURL != "" && avatarURL == "" {
		patch.TradeLogoURL = stringPtr(logoURL)
	}

	updated, err := s.store.UpdateProfile(user.ID, patch)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"profile":         updated,
		"portrait_url":    portraitURL,
		"chat_avatar_url": avatarURL,
		"trade_logo_url":  firstNonEmpty(avatarURL, logoURL),
	})
}

func saveProfileImagePart(r *http.Request, userID, fieldName, folder string) (string, error) {
	file, header, err := r.FormFile(fieldName)
	if err != nil {
		if errors.Is(err, http.ErrMissingFile) {
			return "", nil
		}
		return "", err
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		return "", fmt.Errorf("%s must be an image", fieldName)
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		ext = extensionForContentType(contentType)
	}
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp" && ext != ".gif" {
		return "", fmt.Errorf("%s image type is not supported", fieldName)
	}

	dir := filepath.Join(uploadRoot(), folder)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	filename := fmt.Sprintf("%s-%s-%d%s", userID, fieldName, time.Now().UnixNano(), ext)
	targetPath := filepath.Join(dir, filename)
	target, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return "", err
	}
	defer target.Close()
	if _, err := io.Copy(target, io.LimitReader(file, 8<<20)); err != nil {
		return "", err
	}
	return "/uploads/" + folder + "/" + filename, nil
}

func errorString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func (s *Server) handleUploadedFile(w http.ResponseWriter, r *http.Request) {
	clean := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/uploads/"))
	if clean == "." || strings.HasPrefix(clean, "..") {
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid upload path", nil)
		return
	}
	http.ServeFile(w, r, filepath.Join(uploadRoot(), clean))
}

func (s *Server) handleCreateTicker(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r, "create ticker")
	if !ok {
		return
	}
	var req struct {
		Symbol      string `json:"symbol"`
		DisplayName string `json:"display_name"`
		Tagline     string `json:"tagline"`
		Bio         string `json:"bio"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	t, err := s.store.CreateTicker(user.ID, req.Symbol, req.DisplayName, req.Tagline, req.Bio)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ticker": t})
}

func (s *Server) handleGetTicker(w http.ResponseWriter, r *http.Request, symbol string) {
	t, err := s.store.GetTickerBySymbol(symbol)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ticker": t, "anonymous_read_only": true})
}

func (s *Server) handlePatchTicker(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := s.requireUser(w, r, "edit ticker")
	if !ok {
		return
	}
	var req struct {
		DisplayName string `json:"display_name"`
		Tagline     string `json:"tagline"`
		Bio         string `json:"bio"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	t, err := s.store.UpdateTicker(user.ID, id, req.DisplayName, req.Tagline, req.Bio)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ticker": t})
}

func (s *Server) handleCreateSlot(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r, "create slot")
	if !ok {
		return
	}
	var req struct {
		TickerID              string `json:"ticker_id"`
		SlotName              string `json:"slot_name"`
		SlotType              string `json:"slot_type"`
		PrivacyLevel          string `json:"privacy_level"`
		UnifiedBasePriceCents int64  `json:"unified_base_price_cents"`
		DefaultCapacityLimit  int    `json:"default_capacity_limit"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	slot, err := s.store.CreateSlot(user.ID, req.TickerID, req.SlotName, req.SlotType, req.PrivacyLevel, req.UnifiedBasePriceCents, req.DefaultCapacityLimit)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"slot": slot})
}

func (s *Server) handleCreateWindow(w http.ResponseWriter, r *http.Request, slotID string) {
	user, ok := s.requireUser(w, r, "issue capacity window")
	if !ok {
		return
	}
	var req struct {
		StartsAt        string `json:"starts_at"`
		DurationMinutes int    `json:"duration_minutes"`
		CapacityLimit   int    `json:"capacity_limit"`
		BasePriceCents  int64  `json:"base_price_cents"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	startsAt, err := parseTimeOrDefault(req.StartsAt, time.Now().UTC().Add(24*time.Hour).Truncate(30*time.Minute))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_time", err.Error(), nil)
		return
	}
	window, tickets, err := s.store.CreateWindow(user.ID, slotID, startsAt, req.DurationMinutes, req.CapacityLimit, req.BasePriceCents)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"window": window, "tickets": tickets})
}

func (s *Server) handleImportKnowledgeBase(w http.ResponseWriter, r *http.Request, demo bool) {
	user, ok := s.requireUser(w, r, "import knowledge base")
	if !ok {
		return
	}
	var req struct {
		SlotID          string   `json:"slot_id"`
		Name            string   `json:"name"`
		Summary         string   `json:"summary"`
		DemoSourceNames []string `json:"demo_source_names"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	kb, err := s.store.ImportDemoKnowledgeBase(user.ID, req.SlotID, req.Name, req.Summary, req.DemoSourceNames)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"knowledge_base": kb, "one_click_import": demo || kb.ImportedByOneClick})
}

func (s *Server) handleCalendar(w http.ResponseWriter, r *http.Request, symbol string) {
	out, err := s.store.Calendar(symbol)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleMarket(w http.ResponseWriter, r *http.Request, symbol string) {
	out, err := s.store.Market(symbol)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleIssueTicket(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r, "issue ticket")
	if !ok {
		return
	}
	var req struct {
		SlotID          string `json:"slot_id"`
		StartsAt        string `json:"starts_at"`
		DurationMinutes int    `json:"duration_minutes"`
		CapacityLimit   int    `json:"capacity_limit"`
		BasePriceCents  int64  `json:"base_price_cents"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	startsAt, err := parseTimeOrDefault(req.StartsAt, time.Now().UTC().Add(24*time.Hour).Truncate(30*time.Minute))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_time", err.Error(), nil)
		return
	}
	window, tickets, err := s.store.IssueTicket(user.ID, req.SlotID, startsAt, req.DurationMinutes, req.CapacityLimit, req.BasePriceCents)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"window": window, "tickets": tickets})
}

func (s *Server) handleBuyTicket(w http.ResponseWriter, r *http.Request, ticketID string) {
	user, ok := s.requireUser(w, r, "buy ticket")
	if !ok {
		return
	}
	var req struct {
		PriceCents int64  `json:"price_cents"`
		Timezone   string `json:"timezone"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	tk, receipt, err := s.store.BuyTicket(user.ID, ticketID, req.PriceCents, req.Timezone)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ticket": tk, "receipt": receipt})
}

func (s *Server) handleBuySeat(w http.ResponseWriter, r *http.Request, windowID string) {
	user, ok := s.requireUser(w, r, "buy seat")
	if !ok {
		return
	}
	var req struct {
		PriceCents int64  `json:"price_cents"`
		Timezone   string `json:"timezone"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	tk, receipt, err := s.store.BuySeat(user.ID, windowID, req.PriceCents, req.Timezone)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ticket": tk, "receipt": receipt})
}

func (s *Server) handleRelist(w http.ResponseWriter, r *http.Request, ticketID string) {
	user, ok := s.requireUser(w, r, "relist ticket")
	if !ok {
		return
	}
	var req struct {
		PriceCents int64 `json:"price_cents"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	tk, err := s.store.Relist(user.ID, ticketID, req.PriceCents)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ticket": tk})
}

func (s *Server) handleDefault(w http.ResponseWriter, r *http.Request, ticketID string) {
	user, ok := s.requireUser(w, r, "default ticket")
	if !ok {
		return
	}
	tk, err := s.store.DefaultTicket(user.ID, ticketID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ticket": tk})
}

func (s *Server) handleCutIn(w http.ResponseWriter, r *http.Request, ticketID string) {
	user, ok := s.requireUser(w, r, "cut in")
	if !ok {
		return
	}
	var req struct {
		Timezone string `json:"timezone"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	tk, receipt, err := s.store.CutIn(user.ID, ticketID, req.Timezone)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ticket": tk, "receipt": receipt})
}

func (s *Server) handleReceipt(w http.ResponseWriter, r *http.Request, ticketID string) {
	receipt, err := s.store.Receipt(ticketID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"receipt": receipt})
}

func (s *Server) handleHoldings(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r, "view holdings")
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, s.store.Holdings(user.ID))
}

func (s *Server) handleNearestDelay(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SlotID            string `json:"slot_id"`
		WindowID          string `json:"window_id"`
		RequestedStart    string `json:"requested_start"`
		SeatCount         int    `json:"seat_count"`
		OfferedPriceCents int64  `json:"offered_price_cents"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	requested, err := parseTimeOrDefault(req.RequestedStart, time.Now().UTC())
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_time", err.Error(), nil)
		return
	}
	out, err := s.store.NearestDelay(req.SlotID, req.WindowID, requested, req.SeatCount, req.OfferedPriceCents)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleAggregateLater(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r, "aggregate later")
	if !ok {
		return
	}
	var req struct {
		SourceTicketIDs []string `json:"source_ticket_ids"`
		TargetWindowID  string   `json:"target_window_id"`
		Reason          string   `json:"reason"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	ag, err := s.store.AggregateLater(user.ID, req.SourceTicketIDs, req.TargetWindowID, req.Reason)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"aggregation": ag})
}

func (s *Server) handleListTimingOrders(w http.ResponseWriter, r *http.Request, symbol string) {
	orders, err := s.store.ListTimingOrders(symbol)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"timing_orders": orders})
}

func (s *Server) handleCreateTimingOrder(w http.ResponseWriter, r *http.Request, orderType string) {
	user, ok := s.requireUser(w, r, "create timing order")
	if !ok {
		return
	}
	var req struct {
		CurrentTicketID    string `json:"current_ticket_id"`
		TargetTime         string `json:"target_time"`
		LimitPriceCents    int64  `json:"limit_price_cents"`
		AllowNegativePrice bool   `json:"allow_negative_price"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	target, err := parseTimeOrDefault(req.TargetTime, time.Now().UTC().Add(48*time.Hour))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_time", err.Error(), nil)
		return
	}
	order, err := s.store.CreateTimingOrder(user.ID, req.CurrentTicketID, orderType, target, req.LimitPriceCents, req.AllowNegativePrice)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"timing_order": order})
}

func (s *Server) handleMatchTimingOrder(w http.ResponseWriter, r *http.Request, orderID string) {
	user, ok := s.requireUser(w, r, "match timing order")
	if !ok {
		return
	}
	var req struct {
		CounterTicketID string `json:"counter_ticket_id"`
		NetPriceCents   int64  `json:"net_price_cents"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	out, err := s.store.MatchTimingOrder(user.ID, orderID, req.CounterTicketID, req.NetPriceCents)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleStartSession(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r, "start conversation")
	if !ok {
		return
	}
	var req struct {
		TicketID string `json:"ticket_id"`
		Mode     string `json:"mode"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	session, err := s.store.StartSession(user.ID, req.TicketID, req.Mode)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": session})
}

func (s *Server) handleStartDirectConversation(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r, "start conversation")
	if !ok {
		return
	}
	var req struct {
		ModelID string `json:"model_id"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	session, err := s.store.StartDirectConversation(user.ID, req.ModelID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"session": session,
		"profile": user,
		"runtime": s.store.RuntimeHealth(),
	})
}

func (s *Server) handleStartExperienceConversation(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r, "start experience conversation")
	if !ok {
		return
	}
	var req struct {
		Symbol  string `json:"symbol"`
		ModelID string `json:"model_id"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	session, persona, balance, err := s.store.StartExperienceConversation(user.ID, req.Symbol, req.ModelID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"session":       session,
		"persona":       persona,
		"balance_cents": balance,
		"runtime":       s.store.RuntimeHealth(),
	})
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request, sessionID string) {
	user, ok := s.requireUser(w, r, "view conversation session")
	if !ok {
		return
	}
	session, err := s.store.GetSession(user.ID, sessionID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	buyer, seller := s.store.SessionParticipants(session)
	writeJSON(w, http.StatusOK, map[string]any{"session": session, "buyer_profile": buyer, "seller_profile": seller})
}

func (s *Server) handleSessionMessage(w http.ResponseWriter, r *http.Request, sessionID string) {
	user, ok := s.requireUser(w, r, "send chat message")
	if !ok {
		return
	}
	var req struct {
		Message string `json:"message"`
		Content string `json:"content"`
		ModelID string `json:"model_id"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	content := req.Content
	if content == "" {
		content = req.Message
	}
	session, err := s.store.SendMessage(r.Context(), user.ID, sessionID, content, req.ModelID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": session})
}

func (s *Server) handleEndSession(w http.ResponseWriter, r *http.Request, sessionID string) {
	user, ok := s.requireUser(w, r, "end conversation")
	if !ok {
		return
	}
	session, err := s.store.EndSession(user.ID, sessionID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": session})
}

func (s *Server) handleOrganizeTopics(w http.ResponseWriter, r *http.Request, sessionID string) {
	user, ok := s.requireUser(w, r, "organize conversation topics")
	if !ok {
		return
	}
	topics, err := s.store.OrganizeTopics(user.ID, sessionID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"topics": topics})
}

func (s *Server) handleRuntimeMockRoute(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Summary string `json:"summary"`
		Message string `json:"message"`
		Mode    string `json:"mode"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	writeJSON(w, http.StatusOK, s.store.RuntimeMockRoute(req.Summary, req.Message, req.Mode))
}

func (s *Server) handleDemo(w http.ResponseWriter, r *http.Request, parts []string) {
	if len(parts) == 0 {
		writeError(w, http.StatusNotFound, "not_found", "demo route not found", nil)
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "demo mutation requires POST", nil)
		return
	}
	user, ok := s.requireUser(w, r, "run demo control")
	if !ok {
		return
	}
	switch strings.Join(parts, "/") {
	case "seed":
		writeJSON(w, http.StatusOK, map[string]any{"batch": s.store.Seed("all", user.ID)})
	case "inject-history":
		writeJSON(w, http.StatusOK, map[string]any{"batch": s.store.InjectHistory("all", user.ID)})
	case "inject-history/calendar":
		writeJSON(w, http.StatusOK, map[string]any{"batch": s.store.InjectHistory("calendar", user.ID)})
	case "inject-history/trade":
		writeJSON(w, http.StatusOK, map[string]any{"batch": s.store.InjectHistory("trade", user.ID)})
	case "inject-history/conversation":
		writeJSON(w, http.StatusOK, map[string]any{"batch": s.store.InjectHistory("conversation", user.ID)})
	case "reset":
		writeJSON(w, http.StatusOK, map[string]any{"batch": s.store.ResetDemo(user.ID)})
	case "force-halt":
		writeJSON(w, http.StatusOK, s.store.ForceHalt(user.ID))
	case "force-default":
		writeJSON(w, http.StatusOK, s.store.ForceDefault(user.ID))
	default:
		writeError(w, http.StatusNotFound, "not_found", "demo route not found", map[string]any{"route": strings.Join(parts, "/")})
	}
}

func (s *Server) currentUser(r *http.Request) (*User, bool) {
	return s.store.UserByToken(bearerOrCookieToken(r))
}

func (s *Server) requireUser(w http.ResponseWriter, r *http.Request, action string) (*User, bool) {
	user, ok := s.currentUser(r)
	if ok {
		return user, true
	}
	writeError(w, http.StatusUnauthorized, "auth_required", fmt.Sprintf("Sign in to %s", action), map[string]any{
		"auth_required":    true,
		"protected_action": action,
		"pending_context":  map[string]any{"method": r.Method, "path": r.URL.Path},
	})
	return nil, false
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	if r.Body == nil {
		return true
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error(), nil)
		return false
	}
	return true
}

func writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		writeError(w, http.StatusUnauthorized, "unauthorized", err.Error(), nil)
	case errors.Is(err, ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", err.Error(), nil)
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", err.Error(), nil)
	case errors.Is(err, ErrConflict):
		writeError(w, http.StatusConflict, "conflict", err.Error(), nil)
	case errors.Is(err, ErrInvalid):
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error(), nil)
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string, details map[string]any) {
	if details == nil {
		details = map[string]any{}
	}
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": message, "details": details}})
}

func bearerOrCookieToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	cookie, err := r.Cookie("timex_session")
	if err == nil {
		return cookie.Value
	}
	return ""
}

func setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "timex_session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int((24 * time.Hour).Seconds()),
	})
}

func parseTimeOrDefault(raw string, fallback time.Time) (time.Time, error) {
	if raw == "" {
		return fallback.UTC(), nil
	}
	if ts, err := time.Parse(time.RFC3339, raw); err == nil {
		return ts.UTC(), nil
	}
	if unix, err := strconv.ParseInt(raw, 10, 64); err == nil {
		return time.Unix(unix, 0).UTC(), nil
	}
	return time.Time{}, fmt.Errorf("expected RFC3339 timestamp")
}

func originOrWildcard(origin string) string {
	if origin == "" {
		return "*"
	}
	return origin
}

func uploadRoot() string {
	if dir := strings.TrimSpace(os.Getenv("TIMEX_UPLOAD_DIR")); dir != "" {
		return dir
	}
	return "uploads"
}

func extensionForContentType(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ".png"
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
