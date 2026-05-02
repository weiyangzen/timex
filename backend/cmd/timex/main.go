package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"timex/backend/internal/app"
)

func main() {
	logger := log.New(os.Stdout, "", log.LstdFlags)
	args := os.Args[1:]
	if len(args) == 0 {
		usage()
		os.Exit(2)
	}

	switch args[0] {
	case "migrate":
		if len(args) < 2 || args[1] != "run" {
			usage()
			os.Exit(2)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := app.RunMigrations(ctx, app.DatabaseURL(), logger); err != nil {
			logger.Fatalf("migrate failed: %v", err)
		}
	case "server":
		if err := runServer(logger); err != nil {
			logger.Fatal(err)
		}
	default:
		usage()
		os.Exit(2)
	}
}

func runServer(logger *log.Logger) error {
	addr := os.Getenv("TIMEX_BACKEND_ADDR")
	if addr == "" {
		addr = ":5001"
	}
	store := app.NewStore(time.Now)
	server := app.NewServer(store)
	logger.Printf("TimeX backend listening on %s", addr)
	return http.ListenAndServe(addr, server)
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage:")
	fmt.Fprintln(os.Stderr, "  timex migrate run")
	fmt.Fprintln(os.Stderr, "  timex server")
}
