package app

import (
	"bufio"
	"os"
	"strings"
)

func loadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" || os.Getenv(key) != "" {
			continue
		}
		value = strings.TrimSpace(value)
		value = strings.Trim(value, `"'`)
		os.Setenv(key, value)
	}
}

func LoadEnvironment() {
	loadDotEnv(os.Getenv("TIMEX_ENV_FILE"))
	loadDotEnv(".env")
	loadDotEnv("../.env")
}

func DatabaseURL() string {
	LoadEnvironment()
	if value := strings.TrimSpace(os.Getenv("TIMEX_DATABASE_URL")); value != "" {
		return value
	}
	if value := strings.TrimSpace(os.Getenv("DATABASE_URL")); value != "" {
		return value
	}
	return "postgres://timex:timex@localhost:55432/timex?sslmode=disable"
}
