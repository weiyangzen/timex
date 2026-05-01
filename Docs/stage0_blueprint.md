# TimeX Stage 0 Blueprint

This is the single authoritative Stage 0 blueprint for TimeX.

All implementation agents should read this file as the requirement source. Other docs are supporting references only.

## 1. Product Strategy

TimeX is a hackathon product for trading access to personal AI avatars, skills, private knowledge bases, and future 30-minute time windows.

The core market is not "continuous slot ownership." The core market is one `ticker` with many tradable `time tickets` under it.

A ticker represents a person, identity, skill package, or AI avatar:

```text
ALICE-AI
VC-LUNCH
PM-REVIEW
FOUNDER-DD
SALARY-COACH
```

Under each ticker, participants can issue and trade:

```text
30-minute session tickets
speed-up demand orders
extension demand orders
default cut-in rights
knowledge-base chatbot access
agent-vs-agent conversation rights
```

Stage 0 is a demo product. It should feel complete enough for a hackathon judge, but it does not need production-grade exchange safety, KYC, custody, or exact financial validation.

## 2. Demo Pitch

Calendly sells time.

Binance-style terminals sell liquidity.

Chatbots sell instant access to knowledge.

TimeX combines the three:

```text
Any participant can create a ticker, attach a private knowledge base, issue 30-minute avatar/human access tickets, trade them T+0, and enter a chat room where the ticker becomes a live AI avatar.
```

## 3. Non-Goals

Do not build these in Stage 0:

```text
OAuth / Google / Cloudflare login
real KYC
real custody
real matching engine
real payment processor
real vector database ingestion
strict regulatory checks
multi-asset margin
production-grade token accounting
full Live2D rigging pipeline
mobile-perfect UI
```

Stage 0 uses username/password login and demo credits.

## 4. Core Constraints

### 4.1 Time Unit

Minimum time slot unit is 30 minutes.

All ticket durations are integer multiples of 30 minutes.

Stage 0 default is 30 minutes.

### 4.2 Primary Booking Horizon

Sellers can issue tickets up to 30 days ahead.

The UI must emphasize:

```text
30D bookable
```

### 4.3 Trading Window

Tickets can trade within the 7-day trading window before the session, subject to the 12-hour halt.

The UI must emphasize:

```text
7D tradable
```

### 4.4 Trading Halt

Normal secondary trading halts 12 hours before the session start.

```text
session_start - now <= 12h => normal trading disabled
```

After halt, the ticket can still enter:

```text
session start
extension request
default
cut-in purchase
```

### 4.5 T+0 Transfer

All trades settle instantly in demo credits.

```text
buy -> owner changes immediately -> trade tape updates -> holdings update
```

### 4.6 Fee Split

Every trade has a 20% fee surface:

```text
15% to ticker seller / original issuer
5% to platform
```

Stage 0 can display fees without perfect ledger rigor.

### 4.7 Negative Prices

Speed-up and extension demand orders must support negative prices.

Reason:

```text
One party may be willing to pay to move earlier.
Another party may be willing to pay to delay.
If their needs offset, the market can clear at positive, zero, or negative price.
```

Example:

```text
Holder A wants to extend and is willing to pay 120 credits.
Holder B wants to speed up and is willing to receive 40 credits to take A's earlier window.
Clearing price can be negative from one side's perspective.
```

UI copy should avoid long explanations. Show it as:

```text
Speed-up bid
Extension bid
Net price
```

## 5. Market Objects

### 5.1 User

One table supports all roles:

```text
participant
seller
buyer
trader
```

Stage 0 login:

```text
username
password
demo balance
```

### 5.2 Ticker

A public market namespace for a person/avatar/skill.

Fields:

```text
symbol
display_name
owner_user_id
avatar_url
tagline
bio
verified_badge
```

### 5.3 Slot

A capability mounted under a ticker.

Slots are not the main continuous trading asset. They are the setup layer for ticket issuance.

Fields:

```text
ticker_id
slot_name
slot_type: human | agent | hybrid | agent_vs_agent
token_budget
privacy_level
knowledge_base_id
```

### 5.4 Knowledge Base

Private database attached to a slot.

Stage 0 stores:

```text
name
summary
document_count
demo_source_names
```

It should feel like the slot has become a chatbot.

### 5.5 Time Ticket

The core tradable asset.

Fields:

```text
ticker_id
slot_id
issuer_user_id
owner_user_id
title
interaction_type
starts_at
ends_at
duration_minutes
base_price
current_price
list_price
status
trade_halts_at
```

### 5.6 Speed-Up Order

A demand order saying:

```text
I want an earlier window under this ticker and I will pay/receive this net price.
```

Fields:

```text
ticker_id
user_id
target_before_time
current_ticket_id
limit_price
allow_negative_price
status
```

### 5.7 Extension Order

A demand order saying:

```text
I want to delay my current ticket and I will pay/receive this net price.
```

Fields:

```text
ticker_id
user_id
current_ticket_id
target_after_time
limit_price
allow_negative_price
status
```

### 5.8 Position

The user's current holdings.

A position is derived from owned tickets but should have its own UI page/card.

Fields displayed:

```text
ticker
ticket
entry_price
current_list_price
unrealized_pnl
session_start
halt_countdown
actions: relist | start | speed up | extend | default
```

### 5.9 Session

The room where ticket ownership becomes interaction.

Session modes:

```text
human
agent
hybrid
agent_vs_agent
```

## 6. Trading Logic

### 6.1 Primary Issuance

Participants can create a ticker, create a slot, attach a knowledge base, and issue primary tickets.

Primary ticket constraints:

```text
duration_minutes % 30 = 0
starts_at <= now + 30 days
trade_halts_at = starts_at - 12 hours
```

### 6.2 Buy Ticket

Buying a listed ticket:

```text
deduct demo credits
append trade
change owner_user_id
set status = owned
update market feed
update holdings
```

### 6.3 Relist Ticket

Owner can relist before the 12-hour halt.

```text
status = relisted
list_price = owner input
```

### 6.4 Speed-Up / Extension Queue

Each ticker has a queue for timing demand.

The queue matches:

```text
speed-up orders
extension orders
owned tickets under the same ticker
available primary tickets
```

Stage 0 matching can be simple:

```text
show orders in queue
let user click "match"
swap ticket windows or transfer ticket
record net price
support negative net price
```

### 6.5 Default

If a holder defaults:

```text
status = defaulting
holder refund = base_price
market upside forfeited
ticket enters cut-in mode
```

### 6.6 Cut-In Purchase

During default, a new buyer can buy remaining access.

Formula:

```text
cut_in_price = base_price * remaining_seconds / 1800
```

For longer durations, Stage 0 still uses the current 30-minute active segment.

### 6.7 Halted Ticket

Within 12 hours:

```text
normal buy/sell disabled
speed-up disabled
extension allowed if demo operator chooses
default allowed
cut-in allowed only after default
start session allowed
```

## 7. Required Pages

### 7.1 Calendly Page

Purpose:

```text
Buy or book a ticker's available 30-minute access windows.
```

Must show:

```text
ticker profile
slot picker
30-day calendar strip
30-minute time windows
interaction type
base price
current price
halt countdown
buy button
```

UX style:

```text
clean white surface
compact schedule grid
minimal explanatory text
lucide icons for calendar, clock, ticket, bot, user
```

### 7.2 Exchange Page

Purpose:

```text
Trade tickets and timing demand under one ticker.
```

Must show:

```text
ticker header
price chart
trade tape
simple bid/ask panel
current ticket list
speed-up queue
extension queue
negative-price capable net price display
buy / relist / match buttons
```

UX style:

```text
Binance-inspired layout
not visually noisy
dark or light neutral panels
green/red price movement
clear current owner / current ask
```

### 7.3 Chat Page

Purpose:

```text
Convert a held ticket into a live human/avatar/agent conversation.
```

Must show:

```text
seller avatar
ticket metadata
token budget
knowledge base badge
chat transcript
input box
agent-vs-agent mode option
session summary
```

Optional UX enhancement:

```text
Live2D avatar renderer
idle blink
mouth movement during answer
small animated state: idle | thinking | speaking
```

### 7.4 Holdings Page

Purpose:

```text
Show all owned tickets and timing actions.
```

Must show:

```text
owned tickets
entry price
current price
halt countdown
session start
unrealized PnL
relist action
speed-up action
extension action
default action
start chat action
```

## 8. Avatar / Live2D UX Direction

Stage 0 should treat Live2D as a stretch goal.

References:

- `shitagaki-lab/see-through`: static anime illustration to manipulatable 2.5D layer decomposition.
- `moeru-ai/airi` / Project AIRI: web AI companion with Live2D/VRM direction.

Implementation direction:

```text
primary path: static avatar card + animated CSS state
stretch path: web Live2D component
extra stretch: use see-through-style decomposed character assets
extra stretch: AIRI-inspired chat companion layout
```

Do not let avatar work block the three required pages.

## 9. Technical Architecture

### 9.1 Repository Layout

```text
Docs/
  stage0_blueprint.md
  schema_stage0.sql
frontend/
  Next.js app on port 5000
backend/
  Go API on port 5001
docker-compose.yml
```

### 9.2 Frontend

Use:

```text
Next.js
TypeScript
Tailwind
lucide-react
lightweight chart or simple SVG chart
local API client
```

Port:

```text
5000
```

### 9.3 Backend

Use:

```text
Go
Postgres-ready data model
in-memory demo store acceptable for Stage 0
Redis optional for market feed
username/password auth
demo credits
```

Port:

```text
5001
```

### 9.4 Database Ports

Avoid common local collisions:

```text
Postgres host port: 55432
Redis host port: 56379
```

## 10. API Surface

Minimum endpoints:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/me

GET  /api/tickers
POST /api/tickers
GET  /api/tickers/:symbol

POST /api/slots
POST /api/knowledge-bases

GET  /api/market/:symbol
POST /api/tickets
POST /api/tickets/:id/buy
POST /api/tickets/:id/relist
POST /api/tickets/:id/default
POST /api/tickets/:id/cut-in

GET  /api/holdings

GET  /api/queue/:symbol
POST /api/queue/speed-up
POST /api/queue/extension
POST /api/queue/:id/match

POST /api/sessions/start
POST /api/sessions/:id/message
GET  /api/sessions/:id
```

## 11. Lint Rules

These are product and implementation lint rules for Stage 0.

### 11.1 Product Lint

- UI must not explain the whole product in long paragraphs.
- UI must show `30D bookable`.
- UI must show `7D tradable`.
- UI must show `12H halt`.
- Every ticket must display ticker symbol.
- Every ticket must display interaction type.
- Every ticket must display start time.
- Every ticket must display duration.
- Every ticket must display base price.
- Every ticket must display current price or list price.
- Every held ticket must appear in Holdings.
- Every held ticket must have at least one next action.
- Speed-up orders must show desired earlier time.
- Extension orders must show desired later time.
- Negative net price must render correctly.
- Normal trading must visually disable after halt.
- Chat must visually connect to the held ticker/ticket.
- Knowledge base must feel private to the seller slot.
- Agent-vs-agent must look different from normal chat.
- Live2D/avatar work must not block core flow.

### 11.2 Frontend Lint

- Use lucide icons for buttons where practical.
- No giant hero page as the main experience.
- First screen must be the app shell or market.
- Avoid nested cards.
- Cards radius <= 8px.
- Do not use purple-heavy or one-note palettes.
- Do not use viewport-scaled font sizes.
- All buttons must have clear affordance.
- Text must not overflow buttons.
- Trade forms must show entered price before action.
- Holdings actions must be reachable without hidden menus.
- Chat input must remain visible at common laptop viewport sizes.
- Calendar grid must remain stable when slots update.
- Exchange layout must not overlap on 1440px and 390px widths.

### 11.3 Backend Lint

- Keep Stage 0 auth username/password only.
- Do not add OAuth.
- Do not require external payment.
- Do not require KYC.
- Keep ticket duration as 30-minute integer multiples.
- Keep `base_price`, `current_price`, and `list_price` separate.
- Keep `issuer_user_id` separate from `owner_user_id`.
- Support negative prices in queue orders.
- Store trade fee split.
- Store market events for demo feed.
- Do not block demo on Redis.
- Do not block demo on Postgres if in-memory mode is enabled.
- API responses should be deterministic enough for live demo.

## 12. Acceptance Criteria

Stage 0 is accepted when the demo can run this script:

1. User registers with username/password.
2. User creates a ticker.
3. User creates a slot under the ticker.
4. User attaches a knowledge base summary.
5. User issues a 30-minute ticket within the next 30 days.
6. Market page shows the ticket.
7. Calendly page buys the ticket.
8. Holdings page shows the owned ticket.
9. Owner relists the ticket.
10. Exchange page shows updated ask and trade tape.
11. Another user buys the relisted ticket T+0.
12. Fee split is shown as 15% seller and 5% platform.
13. User creates a speed-up demand order.
14. User creates an extension demand order.
15. Queue page/exchange panel shows both orders.
16. A matched timing order supports negative net price.
17. Ticket enters halted state inside 12 hours.
18. Normal trading is disabled in halted state.
19. Holder defaults.
20. Cut-in buyer sees prorated base price by remaining seconds.
21. Cut-in buyer enters chat.
22. Chat page shows avatar, token budget, and knowledge base badge.
23. Agent replies using the slot's knowledge base summary.
24. Agent-vs-agent mode shows two sides and a summary.

## 13. Authoritative Execution Checklist

### A. Repo And Blueprint

- [ ] A01 Create repository layout with `Docs/`, `frontend/`, and `backend/`.
- [ ] A02 Keep this file as the only authoritative Stage 0 requirement source.
- [ ] A03 Add `README.md` with local dev commands.
- [ ] A04 Add `.gitignore` for Node, Next, env, logs, and temp files.
- [ ] A05 Add `docker-compose.yml` using Postgres `55432` and Redis `56379`.
- [ ] A06 Add Stage 0 schema reference under `Docs/schema_stage0.sql`.
- [ ] A07 Add remote origin `https://github.com/weiyangzen/timex.git` after remote exists.
- [ ] A08 Confirm local default branch naming.
- [ ] A09 Confirm local repo has no accidental implementation-only generated files.
- [ ] A10 Confirm docs mention Stage 0 non-goals.

### B. Auth And Users

- [ ] B01 Add username/password registration page.
- [ ] B02 Add username/password login page.
- [ ] B03 Add demo logout action.
- [ ] B04 Add backend register endpoint.
- [ ] B05 Add backend login endpoint.
- [ ] B06 Add simple session token or cookie.
- [ ] B07 Add `/api/me`.
- [ ] B08 Add demo starting balance.
- [ ] B09 Add user switcher for demo if useful.
- [ ] B10 Show current user and balance in app shell.

### C. Ticker Setup

- [ ] C01 Add seller setup page.
- [ ] C02 Add ticker creation form.
- [ ] C03 Add ticker symbol validation for demo.
- [ ] C04 Add ticker display name field.
- [ ] C05 Add ticker avatar URL field.
- [ ] C06 Add ticker tagline field.
- [ ] C07 Add ticker bio field.
- [ ] C08 Add backend ticker create endpoint.
- [ ] C09 Add backend ticker list endpoint.
- [ ] C10 Add ticker detail endpoint.
- [ ] C11 Show ticker created by current user.
- [ ] C12 Seed at least three demo tickers.

### D. Slot Setup

- [ ] D01 Add slot creation form under ticker.
- [ ] D02 Support slot type `human`.
- [ ] D03 Support slot type `agent`.
- [ ] D04 Support slot type `hybrid`.
- [ ] D05 Support slot type `agent_vs_agent`.
- [ ] D06 Add token budget field.
- [ ] D07 Add privacy level field.
- [ ] D08 Add backend slot create endpoint.
- [ ] D09 Show slot list under ticker.
- [ ] D10 Seed at least one slot per demo ticker.

### E. Knowledge Base Setup

- [ ] E01 Add knowledge base form under slot.
- [ ] E02 Add knowledge base name.
- [ ] E03 Add knowledge base summary.
- [ ] E04 Add demo document count.
- [ ] E05 Add backend knowledge base create endpoint.
- [ ] E06 Show knowledge base badge on ticker detail.
- [ ] E07 Show knowledge base badge on chat page.
- [ ] E08 Make agent reply reference the knowledge base summary.
- [ ] E09 Seed at least three knowledge base summaries.
- [ ] E10 Do not expose raw private docs in buyer UI.

### F. Ticket Issuance

- [ ] F01 Add primary ticket issue form.
- [ ] F02 Enforce 30-minute integer duration in UI.
- [ ] F03 Default duration to 30 minutes.
- [ ] F04 Allow 60-minute duration as integer multiple.
- [ ] F05 Show 30-day booking horizon.
- [ ] F06 Add base price field.
- [ ] F07 Add interaction type field.
- [ ] F08 Set `trade_halts_at = starts_at - 12h`.
- [ ] F09 Add backend ticket create endpoint.
- [ ] F10 Reject or warn when start time exceeds 30 days.
- [ ] F11 Show issued ticket on market page.
- [ ] F12 Seed at least six demo tickets.

### G. Calendly Page

- [ ] G01 Create ticker booking page route.
- [ ] G02 Show ticker profile at top.
- [ ] G03 Show 30-day calendar strip.
- [ ] G04 Show 30-minute slot grid.
- [ ] G05 Show interaction type chips.
- [ ] G06 Show base price and list price.
- [ ] G07 Show halt countdown.
- [ ] G08 Add buy button.
- [ ] G09 Use lucide calendar icon.
- [ ] G10 Use lucide clock icon.
- [ ] G11 Keep text minimal.
- [ ] G12 Make slot cards stable in size.
- [ ] G13 Show sold/owned status.
- [ ] G14 Link owned ticket to holdings.

### H. Ticket Trading

- [ ] H01 Add backend buy endpoint.
- [ ] H02 Change owner immediately after buy.
- [ ] H03 Append trade record.
- [ ] H04 Deduct demo buyer balance.
- [ ] H05 Show T+0 transfer state.
- [ ] H06 Add relist endpoint.
- [ ] H07 Add relist form.
- [ ] H08 Disable relist after 12-hour halt.
- [ ] H09 Show current ask.
- [ ] H10 Show last traded price.
- [ ] H11 Show trade tape.
- [ ] H12 Store 15% seller fee.
- [ ] H13 Store 5% platform fee.
- [ ] H14 Display fee split in confirmation.

### I. Exchange Page

- [ ] I01 Create exchange page route.
- [ ] I02 Add ticker selector.
- [ ] I03 Add price chart.
- [ ] I04 Add simple order book panel.
- [ ] I05 Add buy ticket panel.
- [ ] I06 Add relist panel for owned tickets.
- [ ] I07 Add recent trades panel.
- [ ] I08 Add ticker tickets table.
- [ ] I09 Add speed-up queue panel.
- [ ] I10 Add extension queue panel.
- [ ] I11 Render negative net price cleanly.
- [ ] I12 Use green/red price deltas.
- [ ] I13 Keep exchange layout readable on laptop.
- [ ] I14 Add demo "market pulse" data.
- [ ] I15 Avoid long prose on exchange screen.

### J. Holdings

- [ ] J01 Create holdings page route.
- [ ] J02 Show all owned tickets.
- [ ] J03 Show ticker symbol per holding.
- [ ] J04 Show entry price.
- [ ] J05 Show current price.
- [ ] J06 Show unrealized PnL.
- [ ] J07 Show session start time.
- [ ] J08 Show halt countdown.
- [ ] J09 Add relist action.
- [ ] J10 Add speed-up action.
- [ ] J11 Add extension action.
- [ ] J12 Add default action.
- [ ] J13 Add start chat action.
- [ ] J14 Show halted badge when appropriate.
- [ ] J15 Show defaulting badge when appropriate.

### K. Speed-Up And Extension Queue

- [ ] K01 Add speed-up order data model.
- [ ] K02 Add extension order data model.
- [ ] K03 Allow positive limit price.
- [ ] K04 Allow zero limit price.
- [ ] K05 Allow negative limit price.
- [ ] K06 Add speed-up create endpoint.
- [ ] K07 Add extension create endpoint.
- [ ] K08 Add queue list endpoint by ticker.
- [ ] K09 Add manual match endpoint for demo.
- [ ] K10 Show net price calculation.
- [ ] K11 Show matched timing event in trade tape.
- [ ] K12 Update holdings after timing match.
- [ ] K13 Keep matching under same ticker.
- [ ] K14 Add seed speed-up order.
- [ ] K15 Add seed extension order.

### L. Halt, Default, And Cut-In

- [ ] L01 Calculate 12-hour halt per ticket.
- [ ] L02 Show halt countdown on all ticket cards.
- [ ] L03 Disable normal trading after halt.
- [ ] L04 Allow start session after halt.
- [ ] L05 Add default endpoint.
- [ ] L06 Set ticket status to `defaulting`.
- [ ] L07 Show base-price refund amount.
- [ ] L08 Add cut-in endpoint.
- [ ] L09 Calculate remaining seconds in active 30-minute unit.
- [ ] L10 Calculate prorated cut-in price.
- [ ] L11 Show cut-in price in UI.
- [ ] L12 Transfer ticket to cut-in buyer.
- [ ] L13 Start chat after cut-in.
- [ ] L14 Show default/cut-in event in market feed.
- [ ] L15 Add demo button to force near-start state.

### M. Chat Page

- [ ] M01 Create chat page route.
- [ ] M02 Require owned or cut-in ticket to enter chat.
- [ ] M03 Show ticker avatar.
- [ ] M04 Show ticket metadata.
- [ ] M05 Show token budget meter.
- [ ] M06 Show knowledge base badge.
- [ ] M07 Add user message input.
- [ ] M08 Add agent response using knowledge base summary.
- [ ] M09 Add transcript panel.
- [ ] M10 Add agent-vs-agent display mode.
- [ ] M11 Add buyer agent column.
- [ ] M12 Add seller avatar agent column.
- [ ] M13 Add final session summary.
- [ ] M14 Add speaking/thinking visual state.
- [ ] M15 Keep chat input visible at laptop viewport.

### N. Live2D / Avatar Stretch

- [ ] N01 Add static avatar fallback.
- [ ] N02 Add CSS idle animation fallback.
- [ ] N03 Add optional Live2D component boundary.
- [ ] N04 Research `moeru-ai/airi` web rendering approach.
- [ ] N05 Research `shitagaki-lab/see-through` asset prep route.
- [ ] N06 Add model asset placeholder directory.
- [ ] N07 Render idle avatar if model asset exists.
- [ ] N08 Add thinking state animation.
- [ ] N09 Add speaking state animation.
- [ ] N10 Ensure missing Live2D assets do not break chat.

### O. Backend Data And API

- [ ] O01 Add Go backend skeleton.
- [ ] O02 Add health endpoint.
- [ ] O03 Add CORS for frontend port 5000.
- [ ] O04 Add in-memory store for demo.
- [ ] O05 Add Postgres-ready model structs.
- [ ] O06 Add seed data endpoint or startup seed.
- [ ] O07 Add market list endpoint.
- [ ] O08 Add ticker market endpoint.
- [ ] O09 Add holdings endpoint.
- [ ] O10 Add session start endpoint.
- [ ] O11 Add session message endpoint.
- [ ] O12 Add deterministic demo agent replies.
- [ ] O13 Add market events to every meaningful action.
- [ ] O14 Keep API runnable without Redis.
- [ ] O15 Keep API runnable without Postgres in demo mode.

### P. Frontend App Shell

- [ ] P01 Create Next.js app.
- [ ] P02 Configure dev port 5000.
- [ ] P03 Add Tailwind.
- [ ] P04 Add lucide-react.
- [ ] P05 Add API client.
- [ ] P06 Add app navigation.
- [ ] P07 Add market route.
- [ ] P08 Add booking route.
- [ ] P09 Add exchange route.
- [ ] P10 Add holdings route.
- [ ] P11 Add chat route.
- [ ] P12 Add seller setup route.
- [ ] P13 Add login/register route.
- [ ] P14 Add responsive layout check.
- [ ] P15 Add clean neutral visual system.

### Q. Demo Validation

- [ ] Q01 Run backend locally on port 5001.
- [ ] Q02 Run frontend locally on port 5000.
- [ ] Q03 Register demo user.
- [ ] Q04 Login demo user.
- [ ] Q05 Create ticker.
- [ ] Q06 Create slot.
- [ ] Q07 Attach knowledge base.
- [ ] Q08 Issue ticket.
- [ ] Q09 Buy ticket from Calendly page.
- [ ] Q10 Verify holdings.
- [ ] Q11 Relist ticket.
- [ ] Q12 Buy relisted ticket as another user.
- [ ] Q13 Verify trade tape.
- [ ] Q14 Verify fee split display.
- [ ] Q15 Create speed-up order.
- [ ] Q16 Create extension order.
- [ ] Q17 Match timing order with negative price.
- [ ] Q18 Force halt/default state.
- [ ] Q19 Cut into defaulting ticket.
- [ ] Q20 Complete chat session.
- [ ] Q21 Verify no text overlap on 1440px width.
- [ ] Q22 Verify no text overlap on 390px width.
- [ ] Q23 Verify missing avatar assets do not crash.
- [ ] Q24 Record final demo script.

## 14. Completion Gate

Do not mark a checklist item complete unless the related UI/API/demo path is runnable.

Documentation-only edits do not complete implementation items.

Mocked demo data is acceptable only when the UI and user action path are real.

Live2D items are stretch items and do not block Stage 0 acceptance.

Stage 0 complete means:

```text
three required pages work:
  Calendly
  Exchange
  Chat

holdings work
username/password registration works
ticker setup works
ticket trading works
speed-up/extension queue works
default/cut-in works
demo script runs in one browser session
```
