package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"timex/backend/internal/app"
)

func main() {
	addr := os.Getenv("TIMEX_BACKEND_ADDR")
	if addr == "" {
		addr = ":5001"
	}

	store := app.NewStore(time.Now)
	server := app.NewServer(store)

	log.Printf("TimeX backend listening on %s", addr)
	if err := http.ListenAndServe(addr, server); err != nil {
		log.Fatal(err)
	}
}
