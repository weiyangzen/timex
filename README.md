# TimeX

TimeX is a hackathon-stage marketplace for tradable human and AI-avatar time tickets.

The Stage 0 demo turns a person's skills, private knowledge base, AI avatar, and 30-minute availability windows into T+0 tradable tickets.

## Repo Layout

```text
Docs/       Stage 0 product, trading, data, and demo blueprint
frontend/   Next.js frontend, served on port 5012
backend/    Go API backend, default port 5001
```

## Stage 0 Rules

- Minimum time slot: `30 minutes`, integer multiples only.
- Seller primary issuance can schedule up to `30 days` ahead.
- Secondary trading is only available within the `7-day` trading window.
- Trading halts `12 hours` before session start.
- T+0 transfer: ticket ownership changes immediately after buy.
- Fee rate: `20%` total, split as `15% seller royalty` and `5% platform fee`.
- If the holder cannot attend, they can either pay an extension fee or default.
- Default refund returns only the base issuance price.
- During default, buyers can cut in at the base price prorated by remaining seconds in the 30-minute window.

## Local Dev

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend is a minimal ChatGPT-style TimeX console. Agent behavior is
platform-managed or mocked behind TimeX; users provide seller knowledge, not
external agent accounts or runtime keys.

Backend:

```bash
cd backend
go build -o ./bin/timex ./cmd/timex
./bin/timex migrate run
./bin/timex server
```

Optional local dependencies:

```bash
docker compose up -d
```

The compose file maps PostgreSQL to `55432` and Redis to `56379` to avoid common local port collisions.

`timex migrate run` uses `TIMEX_DATABASE_URL`, then `DATABASE_URL`, then the
local compose default `postgres://timex:timex@localhost:55432/timex?sslmode=disable`.
It creates `schema_migrations`, migrates persisted user profile/auth fields, and
initializes the default local accounts:

- `Weiyang` / `Yipansansha`
- `AYuan` / `YuanAYuan`

Runtime keys stay in environment variables or `.env`; they are not stored by
database migrations.

## License

This project is licensed under the PolyForm Noncommercial License 1.0.0. It is
source-available for noncommercial use and is not licensed for direct commercial
use.
