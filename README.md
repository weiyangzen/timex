# TimeX

TimeX is a hackathon-stage marketplace for tradable human and AI-avatar time tickets.

The Stage 0 demo turns a person's skills, private knowledge base, AI avatar, and 30-minute availability windows into T+0 tradable tickets.

## Repo Layout

```text
Docs/       Stage 0 product, trading, data, and demo blueprint
frontend/   Next.js frontend, served on port 5000
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

Backend:

```bash
cd backend
go run ./cmd/api
```

Optional local dependencies:

```bash
docker compose up -d
```

The compose file maps PostgreSQL to `55432` and Redis to `56379` to avoid common local port collisions.
