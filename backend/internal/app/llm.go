package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type llmRuntime struct {
	client       *http.Client
	defaultID    string
	configs      map[string]LLMConfig
	orderedIDs   []string
	mockFallback bool
}

type llmMessage struct {
	Role    string
	Content string
}

func newLLMRuntime(now func() time.Time) *llmRuntime {
	if now == nil {
		now = time.Now
	}
	rt := &llmRuntime{
		client:       &http.Client{Timeout: 90 * time.Second},
		configs:      map[string]LLMConfig{},
		mockFallback: envBool("TIMEX_LLM_MOCK_FALLBACK", true),
	}

	for _, cfg := range []LLMConfig{
		configFromEnv("kimi-2.5", "Kimi 2.5", "TIMEX_KIMI25", "anthropic", "anthropic", "https://api.kimi.com/coding/v1/messages", "kimi-k2.5", now),
		configFromEnv("gpt-5.5", "GPT-5.5", "TIMEX_GPT55", "openai", "openai", "https://api.openai.com/v1/chat/completions", "gpt-5.5", now),
	} {
		if cfg.ID == "" {
			continue
		}
		rt.configs[cfg.ID] = cfg
		rt.orderedIDs = append(rt.orderedIDs, cfg.ID)
	}

	rt.defaultID = strings.TrimSpace(os.Getenv("TIMEX_LLM_DEFAULT_MODEL"))
	if _, ok := rt.configs[rt.defaultID]; !ok {
		rt.defaultID = ""
		for _, id := range rt.orderedIDs {
			if rt.configs[id].Status == "ready" {
				rt.defaultID = id
				break
			}
		}
	}
	return rt
}

func configFromEnv(id, name, prefix, provider, apiFormat, baseURL, model string, now func() time.Time) LLMConfig {
	apiKey := strings.TrimSpace(os.Getenv(prefix + "_API_KEY"))
	if v := strings.TrimSpace(os.Getenv(prefix + "_ID")); v != "" {
		id = v
	}
	if v := strings.TrimSpace(os.Getenv(prefix + "_NAME")); v != "" {
		name = v
	}
	if v := strings.TrimSpace(os.Getenv(prefix + "_PROVIDER")); v != "" {
		provider = v
	}
	if v := strings.TrimSpace(os.Getenv(prefix + "_API_FORMAT")); v != "" {
		apiFormat = v
	}
	if v := strings.TrimSpace(os.Getenv(prefix + "_BASE_URL")); v != "" {
		baseURL = v
	}
	if v := strings.TrimSpace(os.Getenv(prefix + "_MODEL")); v != "" {
		model = v
	}
	status := "missing_key"
	if apiKey != "" {
		status = "ready"
	}
	return LLMConfig{
		ID:                      id,
		Name:                    name,
		Provider:                provider,
		APIFormat:               apiFormat,
		BaseURL:                 baseURL,
		Model:                   model,
		APIKey:                  apiKey,
		MaxTokens:               envInt(prefix+"_MAX_TOKENS", 1200),
		Temperature:             envFloat(prefix+"_TEMPERATURE", 0.7),
		Status:                  status,
		ConfiguredByEnvironment: apiKey != "",
		CreatedAt:               now().UTC(),
	}
}

func (rt *llmRuntime) configured() bool {
	if rt == nil {
		return false
	}
	for _, cfg := range rt.configs {
		if cfg.APIKey != "" {
			return true
		}
	}
	return false
}

func (rt *llmRuntime) publicConfigs() []LLMConfig {
	if rt == nil {
		return nil
	}
	out := make([]LLMConfig, 0, len(rt.orderedIDs))
	for _, id := range rt.orderedIDs {
		cfg := rt.configs[id]
		cfg.APIKey = ""
		out = append(out, cfg)
	}
	return out
}

func (rt *llmRuntime) generate(ctx context.Context, preferredID string, messages []llmMessage) (string, string, int64, error) {
	cfg, ok := rt.selectConfig(preferredID)
	if !ok || cfg.APIKey == "" {
		return "", "", 0, fmt.Errorf("no configured LLM model")
	}
	var (
		reply string
		err   error
	)
	switch strings.ToLower(firstNonEmpty(cfg.APIFormat, cfg.Provider)) {
	case "anthropic":
		reply, err = rt.generateAnthropic(ctx, cfg, messages)
	default:
		reply, err = rt.generateOpenAI(ctx, cfg, messages)
	}
	if err != nil {
		return "", cfg.ID, 0, err
	}
	return reply, cfg.ID, estimateTokens(messages, reply), nil
}

func (rt *llmRuntime) selectConfig(preferredID string) (LLMConfig, bool) {
	if rt == nil {
		return LLMConfig{}, false
	}
	for _, id := range []string{preferredID, rt.defaultID} {
		if cfg, ok := rt.configs[strings.TrimSpace(id)]; ok {
			return cfg, true
		}
	}
	for _, id := range rt.orderedIDs {
		cfg := rt.configs[id]
		if cfg.APIKey != "" {
			return cfg, true
		}
	}
	return LLMConfig{}, false
}

func (rt *llmRuntime) generateOpenAI(ctx context.Context, cfg LLMConfig, messages []llmMessage) (string, error) {
	payload := map[string]any{
		"model":       cfg.Model,
		"messages":    messages,
		"temperature": cfg.Temperature,
		"max_tokens":  cfg.MaxTokens,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.BaseURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := rt.doJSON(req, &out); err != nil {
		return "", err
	}
	if out.Error != nil && out.Error.Message != "" {
		return "", fmt.Errorf("%s", out.Error.Message)
	}
	if len(out.Choices) == 0 || strings.TrimSpace(out.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("empty LLM response")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

func (rt *llmRuntime) generateAnthropic(ctx context.Context, cfg LLMConfig, messages []llmMessage) (string, error) {
	system := ""
	userMessages := []llmMessage{}
	for _, msg := range messages {
		if msg.Role == "system" {
			if system != "" {
				system += "\n\n"
			}
			system += msg.Content
			continue
		}
		role := msg.Role
		if role == "assistant" || role == "agent" {
			role = "assistant"
		} else {
			role = "user"
		}
		userMessages = append(userMessages, llmMessage{Role: role, Content: msg.Content})
	}
	payload := map[string]any{
		"model":       cfg.Model,
		"messages":    userMessages,
		"temperature": cfg.Temperature,
		"max_tokens":  cfg.MaxTokens,
	}
	if system != "" {
		payload["system"] = system
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.BaseURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("x-api-key", cfg.APIKey)
	req.Header.Set("anthropic-version", firstNonEmpty(os.Getenv("TIMEX_KIMI25_ANTHROPIC_VERSION"), "2023-06-01"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	var out struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := rt.doJSON(req, &out); err != nil {
		return "", err
	}
	if out.Error != nil && out.Error.Message != "" {
		return "", fmt.Errorf("%s", out.Error.Message)
	}
	parts := []string{}
	for _, item := range out.Content {
		if strings.TrimSpace(item.Text) != "" {
			parts = append(parts, strings.TrimSpace(item.Text))
		}
	}
	if len(parts) == 0 {
		return "", fmt.Errorf("empty LLM response")
	}
	return strings.Join(parts, "\n"), nil
}

func (rt *llmRuntime) doJSON(req *http.Request, target any) error {
	res, err := rt.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("LLM request failed with %s: %s", res.Status, strings.TrimSpace(string(body)))
	}
	if err := json.Unmarshal(body, target); err != nil {
		return err
	}
	return nil
}

func estimateTokens(messages []llmMessage, reply string) int64 {
	total := len(strings.Fields(reply))
	for _, msg := range messages {
		total += len(strings.Fields(msg.Content))
	}
	return int64(total)
}

func envBool(key string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes" || value == "on"
}

func envInt(key string, fallback int) int {
	var out int
	if _, err := fmt.Sscanf(strings.TrimSpace(os.Getenv(key)), "%d", &out); err != nil || out <= 0 {
		return fallback
	}
	return out
}

func envFloat(key string, fallback float64) float64 {
	var out float64
	if _, err := fmt.Sscanf(strings.TrimSpace(os.Getenv(key)), "%f", &out); err != nil || out < 0 {
		return fallback
	}
	return out
}
