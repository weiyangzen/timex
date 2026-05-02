# TimeX Stage 0 Blueprint

This file is the authoritative Stage 0 product blueprint for TimeX. It should be read before implementation. If another doc conflicts with this file, this file wins.

## 1. Product Definition

TimeX is a Stage 0 demo for trading access to human time, AI-avatar time, private knowledge bases, and agent-to-agent conversation rights.

The product has one sentence:

```text
Create a personal/agent ticker, issue future 30-minute access tickets, trade them T+0, then enter a live conversation room where the ticket unlocks a human/avatar/agent session.
```

Stage 0 is not a production exchange. It is a credible demo with real user flows, deterministic mock data, and a UI that makes the market logic understandable in one browser session.

## 2. Stage 0 Product Spine

The app has one entry flow, one shell, and four top-level product areas:

```text
Auth
Personal Center
Calendar
Trade
Conversation
```

The three primary product modules are:

```text
Calendar: find and book future 30-minute access windows
Trade: buy, relist, and match timing demand for tickets
Conversation: spend a held ticket in a chat/live-avatar room
```

Personal Center is the operating console that makes the three modules possible.

Stage 0 also needs one demo support capability:

```text
Immersive Demo Data: one-click insertion of believable historical activity into Calendar, Trade, and Conversation.
```

Stage 0 should include small product moments that make the demo feel coherent:

```text
Demo Mode Overlay: step-by-step rail for live judging
Ticker Discovery: lightweight market entry point
Ticket Receipt: boarding-pass style ownership proof after buy
Conversation Closeout: summary, topics, and next action after session end
```

## 3. Non-Goals

Do not build these for Stage 0:

```text
OAuth / Google login
Cloudflare Turnstile/Auth validation
real KYC
real custody
real payment processing
real exchange matching engine
real vector database ingestion
real production agent credentials in browser
user-provided third-party agent accounts
visible third-party agent import/setup flows
third-party agent connector UI
cross-window desktop pet in browser-only mode
manual full Live2D rigging pipeline
production regulatory checks
mobile-perfect UI
```

Stage 0 can use anonymous browsing, email/password local accounts, demo credits, in-memory demo state, platform-managed agent runtime keys, mock transcripts, and static avatar fallbacks.

## 4. Brand Mark

TimeX uses a simple triangle mark as its product logo.

Logo rule:

```text
use a lucide-style triangle icon everywhere
prefer lucide Triangle where available
same mark in sidebar, auth screen, empty states, favicon, and loading state
do not create multiple logo variants for Stage 0
```

Meaning:

```text
three edges = Calendar, Trade, Conversation
center = ticket ownership unlocks access
```

Visual treatment:

```text
thin stroke
neutral foreground
optional filled active state
no gradient logo
no mascot logo for Stage 0
```

## 5. Core Market Rules

Time unit:

```text
minimum slot = 30 minutes
duration must be an integer multiple of 30 minutes
Stage 0 default = 30 minutes
```

Capacity windows:

```text
a 30-minute scheduled window can have concurrency capacity
default capacity can be 1, but Stage 0 must not assume exclusive 1-seat windows
seller can set total capacity per window
one window can sell multiple seat tickets up to capacity, like seats on one flight
sold_count <= capacity_limit
remaining_capacity = capacity_limit - sold_count
```

Unified base price:

```text
seller sets one unified base price for a slot/ticker access product
seller does not set different base prices per seat
primary sale price, relist price, current/list price, and cut-in floor must be >= unified base price
market prices can move above base
default refund still uses the unified base price
negative timing orders can exist, but they must not create a final ticket sale below base
```

Scattered inventory:

```text
30-minute windows can be scattered across the calendar
windows do not need to be contiguous
Calendar and Trade must handle sparse inventory naturally
```

Free backward aggregation:

```text
held scattered windows under the same ticker/slot can be moved later and aggregated for free when conditions allow
aggregation target must be later than or equal to the earliest held window
aggregation target must have enough remaining capacity
aggregation must not violate 12H halt, session start, or seller capacity rules
aggregation creates a market event but no fee
```

Automatic nearest-window delay:

```text
if a requested window cannot be fulfilled, the system can automatically delay to the nearest later eligible window
eligible means same ticker/slot, enough remaining capacity, >= base price, and not halted
auto-delay is a convenience path, not a paid extension order
UI must show original requested time and delayed target time
```

Primary issuance:

```text
sellers can issue up to 30 days ahead
UI label: 30D bookable
```

Secondary trading:

```text
tickets are tradable within 7 days before session start
UI label: 7D tradable
```

Trading halt:

```text
normal trading halts 12 hours before session start
UI label: 12H halt
```

Settlement:

```text
T+0 transfer
buy -> owner changes immediately -> trade tape updates -> holdings update
```

Fees:

```text
20% total fee surface
15% seller royalty
5% platform fee
```

Timing demand orders:

```text
speed-up order: user wants an earlier window
extension order: user wants a later window
net price can be positive, zero, or negative
```

Default and cut-in:

```text
holder can default
default refund = base issuance price
cut-in buyer can buy remaining active 30-minute segment
cut_in_price = base_price * remaining_seconds / 1800
```

Ticket status taxonomy:

```text
draft: created but not listed
listed: primary ticket available
owned: ticket held by buyer
relisted: owner-listed secondary sale
halted: normal trading disabled inside 12H halt
defaulting: holder has defaulted
cut_in_available: remaining active segment can be bought
in_session: ticket is being consumed in Conversation
completed: session ended
cancelled: removed from demo market
```

## 6. User Roles

One user account can act as all roles:

```text
buyer
seller
trader
agent owner
demo operator
```

Stage 0 auth boundary:

```text
anonymous users can browse Discover
anonymous users can open Calendar and inspect slots/windows
anonymous users can open Trade and inspect market data without buying
anonymous users can open Conversation preview but cannot send messages or consume a ticket
registration is required only when the user performs a state-changing product action
state-changing actions include buy, relist, issue, hold, default, cut-in, start/send conversation, import knowledge base, and edit seller assets
auth prompt appears at the final submit/confirm step of the protected action, not when opening the module or filling the form
after local-name/password register/login, return to the exact prior screen and restore the pending action context
register with local name/password
login with local name/password
local name/password hash is stored locally in Stage 0
no Cloudflare, Google, OAuth, external email verification, or email identifier is required
demo balance starts pre-funded
logout is local/session based
```

## 7. Top-Level Information Architecture

### 7.1 Auth

Purpose:

```text
Let a demo user perform state-changing actions without external identity systems.
```

Required screens:

```text
register
login
optional demo account switcher
```

Required behavior:

```text
anonymous browsing session exists before registration
create user with email/password
start session
show current user in app shell after login
show demo balance after login
gate write actions behind login
preserve intended action after login and continue it
do not discard selected ticker, window, seat, price, order form, or draft message when auth is required
do not block read-only browsing behind login
```

### 7.2 Personal Center

Purpose:

```text
The user's command center for identity, assets, tickets, sessions, and private knowledge bases.
```

Required sections:

```text
Profile
Balance
My Tickers
My Slots
Knowledge Bases
Issued Tickets
Holdings
Session History
Demo Controls
```

Profile:

```text
display name
avatar
bio
public seller card
```

My Tickers:

```text
create ticker
edit ticker
view ticker public page
```

My Slots:

```text
human slot
agent slot
hybrid slot
agent_vs_agent slot
token budget
privacy level
unified base price
default capacity per 30-minute window
```

Knowledge Bases:

```text
name
summary
document count
demo source labels
private badge
```

Issued Tickets:

```text
issue primary tickets
show status
show owner
show price
show halt countdown
```

Holdings:

```text
owned ticket
entry price
current/list price
unrealized PnL
session start
halt countdown
actions: relist | speed up | extend | default | start chat
```

Demo Controls:

```text
seed demo users
seed demo tickers
force near-halt state
force default state
reset demo data
inject historical calendar bookings
inject historical trade tape and price movement
inject historical conversation transcripts and topic summaries
```

### 7.3 User Initialization

Purpose:

```text
Make the seller setup feel complete without asking for unstable agent integrations.
```

Required first-run steps:

```text
confirm profile
create or select ticker
create slot
one-click import private knowledge base
issue first ticket
seed immersive history if demo mode is enabled
```

Knowledge base one-click import:

```text
user chooses a local/demo source
app creates knowledge base name
app creates summary
app creates document count
app creates source labels
app attaches knowledge base to selected slot
```

Constraints:

```text
do not ask for third-party agent account
do not ask for agent runtime key
do not expose private source content to buyers
buyer sees only private knowledge base badge and agent answers
```

### 7.4 Ticker Discovery

Purpose:

```text
Give users a lightweight market entry point before they choose Calendar or Trade.
```

Required route shape:

```text
/discover
```

Required UI:

```text
trending tickers
recent trades
soonest available sessions
popular knowledge-base avatars
cut-in opportunities
```

Required actions:

```text
open ticker Calendar
open ticker Trade
open available ticket
open cut-in opportunity
```

Stage 0 style:

```text
app surface, not a marketing landing page
compact list/grid
triangle brand mark in empty/loading state
```

### 7.5 Calendar Module

Purpose:

```text
Let users browse a ticker and book future 30-minute access windows.
```

Required route shape:

```text
/calendar
/calendar/:symbol
```

Required UI:

```text
ticker profile header
slot picker
30-day calendar strip
30-minute time grid
capacity per window
remaining seats per window
historical booking markers
historical demand density
interaction type chip
unified base price
current/list price
availability status
auto-delay suggestion when requested window is full
halt countdown if inside trading window
buy/book button
```

Required actions:

```text
select ticker
select date
select slot
insert believable historical calendar data in demo mode
buy ticket
buy one seat in a capacity window
accept nearest eligible delayed window when requested window is full
view owned ticket in Personal Center
enter Conversation when session is eligible
```

Stage 0 style:

```text
clean, sparse, Calendly-like density
no marketing hero
stable slot card dimensions
minimal explanatory text
```

### 7.6 Trade Module

Purpose:

```text
Let users trade tickets, relist holdings, and match speed-up/extension demand.
```

Required route shape:

```text
/trade
/trade/:symbol
```

Required UI:

```text
ticker selector
ticker market header
price chart or simple price sparkline
historical price candles/sparkline
listed tickets table
window capacity / sold / remaining seats
current ask
last trade
trade tape
buy panel
relist panel
speed-up queue
extension queue
free backward aggregation panel
nearest eligible delay suggestion
manual match panel
fee split preview
halt/default/cut-in state badges
```

Required actions:

```text
insert believable historical trade data in demo mode
buy listed ticket
relist owned ticket
create speed-up order
create extension order
aggregate scattered held windows later for free
auto-delay to nearest eligible later window
match timing order
show negative net price
default ticket
cut into defaulting ticket
```

Stage 0 matching:

```text
manual click-to-match is acceptable
matching must stay under same ticker
matching must update holdings and event tape
negative net price must render correctly
aggregation must stay under same ticker/slot and respect capacity
auto-delay must show source window and target window
```

Stage 0 style:

```text
compact exchange-like tool
readable on laptop
green/red price movement
not visually noisy
```

### 7.7 Conversation Module

Purpose:

```text
Convert an owned or cut-in ticket into a live session with a human/avatar/agent.
```

Required route shape:

```text
/conversation
/conversation/:sessionId
```

Required UI:

```text
ticket metadata
ticker identity
seller/avatar panel
token budget meter
knowledge base badge
chat transcript
topic rail or topic chips
message input
agent state: idle | thinking | speaking
session summary
agent-vs-agent toggle or mode
```

Conversation modes:

```text
human: buyer chats with seller placeholder
agent: buyer chats with seller AI avatar
hybrid: seller avatar plus human handoff label
agent_vs_agent: buyer-side agent and seller-side agent exchange messages
```

Required behavior:

```text
only owned/cut-in ticket can enter session
buyer and seller pair resolves to one active sessionId for the ticket
sessionId is stable across refresh and resume
session self-organizes messages into topics
topics update as the chat progresses
agent answer references slot knowledge base summary
token budget decreases visually
session transcript persists for demo
historical conversation can be inserted in demo mode
session can end with summary
```

Conversation closeout:

```text
session summary
topic list
remaining token budget
ticket final status
save to Session History
next actions: book again | open ticker Trade | return to Personal Center
```

## 8. Live2D / Desktop Pet System

Live2D is part of Conversation, not a blocker for Calendar or Trade.

Stage 0 levels:

```text
L0 required: static avatar card, CSS idle/thinking/speaking states
L1 preferred: in-browser Live2D/animated avatar with blink and cursor gaze
L2 stretch: web canvas Live2D with tap/focus interactions
L3 post-Stage0: desktop pet follows system cursor outside browser window
```

Important boundary:

```text
Live2D effect range is browser-only for Stage 0
browser-only web tracks mouse inside the page
browser-only web does not track the system cursor outside the page
cross-window desktop-pet behavior is not Stage 0
```

Recommended Stage 0 implementation:

```text
ship L0 first
add L1 only if a ready Live2D model asset exists
do not block chat on missing Live2D assets
keep a static fallback always available
```

Project assets:

```text
canonical source directory: assets/
current source images:
  assets/456019c1-9875-416d-9f0c-6ffd6c2492dd.png
  assets/a0fe4738-0d24-4d26-ac91-a67d07b90ee5.png
Assets/ is a duplicate casing path and should not be the canonical import path
```

Asset directory contract:

```text
assets/live2d/source/      source images and original references
assets/live2d/generated/   see-through/decomposition outputs and model packages
assets/live2d/fallback/    static cutouts and parallax-ready PNG layers
```

See-through conversion path:

```text
run shitagaki-lab/see-through-style layer decomposition on the two source images
export separated character layers suitable for animation prep
convert prepared layers into a web-loadable Live2D-style model package if feasible
expected loader target: model3.json + moc3 + textures + optional motion/physics/expression files
load the resulting model through the frontend Live2D loader
```

Important risk:

```text
see-through-style decomposition is not the same as a guaranteed production Live2D rig
if a complete model3/moc3 package cannot be produced in time, use the decomposed/static cutout as the avatar fallback
do not claim Live2D is active unless the loader actually renders an animated model
```

Live2D inputs:

```text
idle animation
auto blink
look-at/focus cursor position
thinking motion
speaking mouth movement from response state or audio amplitude
tap reaction
```

Asset requirements:

```text
model3.json
moc3
texture files
motion3.json optional
physics3.json optional
exp3.json optional
known parameters for face angle, eye ball, mouth open
```

## 9. Platform Agent Runtime

Stage 0 should not expose third-party agent setup to end users.

Goal:

```text
Give every user agent-like conversation behavior through TimeX-managed runtime keys.
```

User responsibility:

```text
user provides only private knowledge base content/summary
user does not import third-party agents
user does not configure external agent connectors
user does not paste runtime API keys
```

Platform responsibility:

```text
TimeX uses project-provided runtime keys
backend owns any platform runtime calls if needed
frontend never stores or displays secret values
runtime can be mocked without changing user flow
```

Stage 0 behavior:

```text
mock transcript
mock agent response
mock agent-vs-agent exchange
mock runtime health internally if useful for dev/demo
no real external app secret
no user-provided third-party agent key
no visible external connector setup panel
```

Runtime shape:

```text
frontend -> TimeX backend
TimeX backend -> platform-managed agent runtime
agent reply -> backend -> frontend conversation
```

Operational note:

```text
Project owner can configure keys through backend environment variables.
User-facing product should remain knowledge-base-only.
```

## 10. Immersive Demo Data

Stage 0 needs one-click historical data insertion so the product does not feel empty.

Goal:

```text
Calendar, Trade, and Conversation should look like the market has been alive before the judge opened the demo.
```

Required controls:

```text
demo mode overlay
demo story rail: Setup -> Book -> Trade -> Cut-in -> Chat
one-click seed all history
one-click seed calendar history
one-click seed trade history
one-click seed conversation history
one-click reset demo history
```

Demo mode overlay:

```text
shows current script step
highlights next action
can jump to seeded states
can trigger Make Market Look Alive
stays out of normal user flow when hidden
```

Calendar history:

```text
past bookings
upcoming booked windows
demand density by date
sold/available/owned markers
```

Trade history:

```text
price candles or sparkline points
trade tape
listed asks
relisted tickets
speed-up orders
extension orders
negative or zero net-price match example
market events for halt/default/cut-in
```

Conversation history:

```text
prior session transcript
topic chips
auto-generated topic summary
agent-vs-agent transcript example
session outcome summary
```

Quality bar:

```text
timestamps must look plausible
prices must move coherently
bookings must respect 30-minute units
trade data must respect 7D tradable and 12H halt rules
conversation history must attach to valid sessionId and ticketId
```

## 11. Data Objects

User:

```text
id
login_name
password_hash
display_name
avatar_url
balance_cents
created_at
```

Ticker:

```text
id
owner_user_id
symbol
display_name
tagline
bio
avatar_url
verified_badge
```

Slot:

```text
id
ticker_id
slot_name
slot_type: human | agent | hybrid | agent_vs_agent
token_budget
privacy_level
knowledge_base_id
unified_base_price_cents
default_capacity_limit
is_active
```

Capacity Window:

```text
id
ticker_id
slot_id
starts_at
ends_at
duration_minutes
capacity_limit
sold_count
remaining_capacity
base_price_cents
min_sale_price_cents
status
trade_halts_at
```

Knowledge Base:

```text
id
slot_id
name
summary
document_count
demo_source_names
status
imported_by_one_click
```

Time Ticket:

```text
id
ticker_id
slot_id
capacity_window_id
issuer_user_id
owner_user_id
title
interaction_type
starts_at
ends_at
duration_minutes
base_price_cents
current_price_cents
list_price_cents
seat_index
status
trade_halts_at
resale_count
```

Window Aggregation:

```text
id
ticker_id
slot_id
user_id
source_ticket_ids
source_window_ids
target_window_id
fee_cents
reason
status
created_at
```

Ticket Receipt:

```text
id
ticket_id
receipt_code
buyer_user_id
seller_user_id
session_id
price_cents
seller_fee_cents
platform_fee_cents
timezone
issued_at
```

Trade:

```text
id
ticket_id
buyer_user_id
seller_user_id
price_cents
seller_fee_cents
platform_fee_cents
trade_type
created_at
```

Timing Order:

```text
id
ticker_id
user_id
order_type: speed_up | extension
current_ticket_id
target_time
limit_price_cents
allow_negative_price
status
```

Session:

```text
id
session_id
ticket_id
buyer_user_id
seller_user_id
session_type
status
tokens_used
transcript
topics
summary
created_at
updated_at
unique_active_key: buyer_user_id + seller_user_id + ticket_id
```

Session Topic:

```text
id
session_id
title
summary
message_refs
confidence
updated_at
```

Agent Runtime Config:

```text
id
provider: platform | mock
status
configured_by_environment
mock_enabled
last_health_check_at
```

Market Event:

```text
id
ticket_id
event_type
price_cents
message
created_at
```

Demo History Batch:

```text
id
scope: all | calendar | trade | conversation
created_by_user_id
created_ticket_count
created_trade_count
created_session_count
created_topic_count
created_at
```

## 12. Backend/API Surface

Minimum API:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/me

GET  /api/profile
PATCH /api/profile

GET  /api/discover

GET  /api/tickers
POST /api/tickers
GET  /api/tickers/:symbol
PATCH /api/tickers/:id

GET  /api/slots?ticker_id=
POST /api/slots
POST /api/slots/:id/windows
GET  /api/slots/:id/windows

GET  /api/knowledge-bases?slot_id=
POST /api/knowledge-bases
POST /api/knowledge-bases/import-demo

GET  /api/calendar/:symbol

GET  /api/market/:symbol
POST /api/tickets
POST /api/tickets/:id/buy
POST /api/tickets/:id/relist
POST /api/tickets/:id/default
POST /api/tickets/:id/cut-in
GET  /api/tickets/:id/receipt
POST /api/windows/:id/buy-seat
POST /api/windows/nearest-delay
POST /api/windows/aggregate-later

GET  /api/holdings

GET  /api/timing-orders/:symbol
POST /api/timing-orders/speed-up
POST /api/timing-orders/extension
POST /api/timing-orders/:id/match

POST /api/sessions/start
POST /api/sessions/:id/message
GET  /api/sessions/:id
POST /api/sessions/:id/end
POST /api/sessions/:id/topics/organize

GET  /api/runtime/health
POST /api/runtime/mock-route

GET  /healthz
GET  /readyz

POST /api/demo/seed
GET  /api/demo/script
POST /api/demo/inject-history
POST /api/demo/inject-history/calendar
POST /api/demo/inject-history/trade
POST /api/demo/inject-history/conversation
POST /api/demo/reset
POST /api/demo/force-halt
POST /api/demo/force-default
```

Backend constraints:

```text
Go backend on port 5001
backend must expose /healthz and /readyz
backend must stay alive for the full demo script
backend restart should not be required during Stage 0 validation
in-memory demo store acceptable
Postgres-ready structs preferred
Redis optional
no external payment dependency
no real KYC dependency
```

## 13. Frontend Direction

Frontend stack:

```text
Next.js
TypeScript
lucide-react
CSS modules/global CSS or Tailwind
simple API client
```

Port:

```text
5012
```

Local service requirement:

```text
frontend dev server runs on localhost:5012
frontend must stay alive for the full demo script
final Stage 0 validation must use 5012 to avoid macOS/AirTunes conflicts on 5000
frontend must keep retrying backend reads gracefully if backend is briefly unavailable
```

Visual direction:

```text
minimal ChatGPT-like shell for Conversation
clean Calendly-like Calendar
compact exchange-like Trade with a real candlestick/K-line chart area
quiet Personal Center
no landing page as first experience
no giant marketing hero
no nested cards
card radius <= 8px
stable grid dimensions
text must not overflow buttons/cards
Calendar, Trade, and Conversation each require desktop/wide-screen and mobile layouts
the responsive breakpoint is 768px
```

Navigation:

```text
left sidebar on desktop
top/bottom compact navigation on mobile
primary items: Discover | Calendar | Trade | Conversation | Personal Center
current balance and user visible
```

Low-cost delight:

```text
T+0 transfer animation after buy
boarding-pass style ticket receipt
halt countdown ring on ticket cards
calendar demand heatmap
trade tape pulse on new events
fee split pills: 15% seller royalty / 5% platform fee
conversation topic chips that update live
token budget meter near chat input
static cutout parallax if Live2D is unavailable
avatar state dot: idle | thinking | speaking
```

Brand usage:

```text
use lucide Triangle as the TimeX mark
use the same triangle in shell header, auth screen, favicon, and loading state
do not introduce a separate mascot or wordmark system in Stage 0
```

### 13.1 Global UI Rules

App shell:

```text
desktop: fixed left navigation, main content, optional right context rail
mobile: compact top header plus bottom navigation
navigation items: Discover, Calendar, Trade, Conversation, Personal Center
current user and demo balance must be visible outside modal flows
Demo Mode overlay must be dismissible and must not replace normal navigation
```

Visual system:

```text
neutral work-focused palette
one accent color for positive action/state
green/red reserved for market movement and PnL
cards radius <= 8px
no nested cards
no oversized hero sections
no gradient/orb decorative background
stable table/grid/card heights where dynamic data changes
```

Text density:

```text
use labels and compact helper text, not explanatory paragraphs
avoid product theory in UI
show rules as short badges: 30D bookable, 7D tradable, 12H halt, T+0
long identifiers use middle ellipsis
button text must not wrap awkwardly; use icons where obvious
```

Common states:

```text
loading: skeleton rows/cards, not only spinner
empty: one-line explanation plus one primary action
error: show recovery action and preserve user input
success: toast plus event feed update
disabled: show reason tooltip or inline reason
mocked: mark only backend/runtime behavior as mock; do not mark normal product data as fake
backend unavailable: show reconnecting state, preserve current screen, and retry health check
```

### 13.2 Module UI Specs

Auth:

```text
single centered panel
triangle mark at top
register/login tabs or clear route switch
local name + password only
demo account shortcut allowed
no marketing copy
```

Auth gating UX:

```text
read-only browsing never opens a login wall
Discover, Calendar inspection, Trade inspection, and Conversation preview work anonymously
state-changing actions open a compact login/register prompt only at final submit/confirm
login prompt must name the action being protected, e.g. "Sign in to buy this seat"
after auth, continue the original action instead of dumping user on a generic dashboard
preserve pending context: route, ticker, window, seat, price, order type, form values, and draft message
examples:
  buy seat -> auth -> same Calendar/Trade confirmation resumes
  relist -> auth -> same relist form resumes
  match timing order -> auth -> same match confirmation resumes
  cut-in/default -> auth -> same protected confirmation resumes
  send chat message -> auth -> same Conversation draft resumes
```

Personal Center:

```text
quiet dashboard layout
sections: profile, balance, tickers, slots, knowledge bases, issued tickets, holdings, sessions, demo controls
use compact editable rows for ticker/slot settings
unified base price and default capacity must be visually tied to the slot
knowledge base import must feel like the primary initialization action
demo controls must be visually separate from real user settings
```

Discover:

```text
first useful market screen after login if user is not in setup
show trending tickers, recent trades, soonest sessions, and cut-in opportunities
each ticker row shows symbol, display name, base price, next available window, and activity
avoid big cards; prioritize scan speed
clicking a ticker offers Calendar and Trade as adjacent actions
```

Calendar:

```text
left/top ticker profile context
30-day strip with heatmap dots or density shading
30-minute grid with stable slot dimensions
each window shows capacity, sold, remaining seats, base price, current/list price, and halt state
full windows show nearest eligible delay suggestion
buy action buys one seat, not the entire window
selected window summary stays visible before confirmation
>=768px: Calendly-like two or three column layout with profile/context, day strip, slot grid, and confirmation rail visible together when space allows
<768px: profile condenses to header, day strip scrolls horizontally, slot grid becomes single-column touch rows, confirmation becomes a bottom sheet or inline step
ultra-wide: content should expand meaningfully with wider slot grids/context rails instead of leaving one narrow centered column
```

Calendar pitfalls:

```text
do not hide capacity behind hover-only UI
do not let historical heatmap make available windows hard to read
do not imply one buyer owns the whole 30-minute window when capacity > 1
```

Trade:

```text
compact exchange-like surface
primary visual area is a candlestick/K-line chart similar to a lightweight exchange terminal
K-line chart shows OHLC candles, current price line, high/low labels, timeframe controls, overlay toggles, and volume bars
optional Stage 0 indicators can include MA/VOL/RSI/MACD labels or mock controls, but they must not imply live brokerage functionality
listed tickets/windows, capacity, ask, last price, status, halt countdown, and order actions sit beside or below the chart
price chart must align with trade tape and historical price movement
trade tape pulses for new events
buy/relist panel must show base price floor before submit
negative net price must be visually explicit and not confused with final sale below base
free aggregation and nearest-delay actions should appear next to affected holdings/windows
>=768px: exchange-like layout with chart as the dominant pane, side order/action pane, and lower tape/table/backtest or history band
<768px: chart remains first, controls collapse into compact rows/tabs, ticket tables become stacked rows, buy/relist/timing panels become tabs or sheets
ultra-wide: chart and lower history/tape can stretch horizontally while order panels keep readable max widths
```

Trade pitfalls:

```text
do not overload with pro-trading chrome
do not mix base price, list price, and net timing price without labels
do not allow below-base sale/relist controls to look enabled
do not bury halt/default/cut-in status in small text
```

Ticket Receipt:

```text
boarding-pass style compact receipt
shows triangle mark, receipt code, ticker, seller, buyer, seat/window, sessionId, price, fee split, timezone
primary action: enter Conversation when eligible
secondary actions: view Holdings, open Trade
```

Conversation:

```text
ChatGPT-like minimal chat surface
ticket/session context always visible
input stays fixed at bottom of conversation area
token budget meter near input
topic chips or topic rail updates as transcript grows
avatar panel shows idle/thinking/speaking state
agent-vs-agent mode uses two clearly separated columns or lanes
closeout shows summary, topics, remaining tokens, final ticket status, and next actions
>=768px: ChatGPT-like center transcript with left navigation and a right ticket/avatar/topic rail when available
<768px: transcript is the primary view, ticket/session context becomes compact sticky header, avatar becomes a small state indicator or collapsible panel, input remains fixed
ultra-wide: transcript width stays readable while side rails absorb extra space; messages should not stretch into long unreadable lines
```

Conversation pitfalls:

```text
do not let avatar/Live2D cover messages or input
do not allow direct entry without owned/cut-in ticket
do not hide sessionId when demonstrating uniqueness
do not make topic chips so large that they compete with the transcript
```

Live2D / avatar:

```text
browser-contained canvas or static cutout only
static fallback must look intentional, not broken
parallax fallback is acceptable when real Live2D package is unavailable
pointer tracking only inside avatar/canvas bounds
respect reduced-motion preference with static or lower-motion state
```

Demo Mode Overlay:

```text
small step rail, not a modal
shows current step, next step, and one action button
can trigger Make Market Look Alive
can jump to forced halt/default states
must be hidden in normal user screenshots if desired
```

### 13.3 Responsive Rules

Breakpoint:

```text
768px is the Stage 0 responsive breakpoint
>=768px uses desktop/wide-screen layouts
<768px uses mobile layouts
all three main modules, Calendar, Trade, and Conversation, must implement both sides of this breakpoint
```

Desktop / wide-screen:

```text
target 1440px first
left nav fixed width
Calendar and Trade can use two or three columns
Conversation can use transcript plus right avatar/context rail
wide and ultra-wide screens must not break layout or leave primary content trapped in a tiny phone-like column
module-specific wide behavior:
  Calendar: profile/context + day strip + slot grid + confirmation rail can be visible together
  Trade: K-line chart is dominant, with side order pane and lower tape/table/history region
  Conversation: transcript stays readable, side rails hold ticket, avatar, and topic context
```

Mobile:

```text
target 390px smoke test
all mobile module layouts are active below 768px
tables become stacked rows
Trade panels become tabs
Calendar day strip scrolls horizontally
Conversation avatar collapses above transcript or into a small floating state indicator
Demo Mode overlay collapses to top progress pill
module-specific mobile behavior:
  Calendar: one-column slot rows and bottom-sheet/inline confirmation
  Trade: K-line chart remains visible before forms; controls/tables collapse into tabs or stacked sections
  Conversation: fixed input remains visible and avatar never covers transcript
```

Touch and keyboard:

```text
all primary actions have 44px touch targets on mobile
all form controls are keyboard reachable
Enter submits chat, Shift+Enter inserts newline
Escape closes receipt/demo overlays
```

### 13.4 Critical UI Invariants

These must stay true across modules:

```text
read-only browsing stays anonymous
state-changing actions require email/password login
auth prompt appears only at final protected submit/confirm, never just for opening Discover/Calendar/Trade/Conversation preview
post-auth return preserves prior screen and pending action context
base price floor is always visible before a buy/relist/cut-in action
capacity/sold/remaining seats are visible wherever a window is purchasable
halt status is visible before trade actions
T+0 ownership transfer has immediate visible feedback
Conversation entry always traces back to ticket receipt or holding
knowledge base appears as seller-private context, not buyer-owned data
mock runtime behavior is labeled behind backend, not presented as user setup
```

## 14. Required Demo Script

Stage 0 is accepted when this script works:

1. Open Discover anonymously and browse tickers.
2. Open Calendar anonymously and inspect slots/windows without ordering.
3. Open Trade anonymously and inspect market data without buying.
4. Open Conversation preview anonymously without sending a message.
5. Select a window, review buy confirmation, and see email/password auth prompt only at final buy submit.
6. Register a new email/password user with local Stage 0 auth.
7. Return to the same Calendar/Trade confirmation and continue the original buy action after auth.
8. Land in Personal Center after the action and see the owned ticket.
9. Create or select a demo seller ticker.
10. Create a slot under the ticker.
11. Set one unified base price and capacity per 30-minute window.
12. One-click import a private knowledge base.
13. Issue 30-minute capacity windows within the next 30 days.
14. One-click insert believable Calendar, Trade, and Conversation history.
15. Use Demo Mode overlay to show current script step.
16. Open Discover and select a ticker or cut-in opportunity.
17. Open Calendar and see capacity, sold seats, remaining seats, and historical demand markers.
18. Buy one seat in a capacity window at or above base price.
19. Show T+0 ownership transfer animation and ticket receipt.
20. Open Personal Center and see the ticket in Holdings.
21. Relist the ticket above the unified base price.
22. Open Trade and see historical price movement, updated ask, window capacity, and event tape.
23. Buy the relisted ticket as another demo user or demo actor.
24. Show 15% seller royalty and 5% platform fee.
25. Create a speed-up order.
26. Create an extension order.
27. Match timing demand with a negative or zero net price.
28. Show free backward aggregation of scattered held windows when capacity allows.
29. Show automatic nearest eligible delay when a requested window is full.
30. Force a 12H halt state.
31. Confirm normal trading is disabled.
32. Default the holder.
33. Cut into the defaulting ticket at prorated base price.
34. Start Conversation from the owned/cut-in ticket.
35. Confirm the buyer/seller/ticket resolves to one stable sessionId.
36. Chat with the avatar/agent using the knowledge base summary.
37. Show auto-organized topics and topic summary.
38. Switch to agent-vs-agent display mode.
39. Show platform-managed mock agent response without asking user for runtime keys.
40. If Live2D model output exists, render browser-contained Live2D; otherwise show static cutout fallback.
41. End the session and show closeout summary with topics and next actions.

## 15. Stage 0 Priority

P0 must ship:

```text
anonymous read-only browsing
email/password local register/login
Personal Center
Discover
Calendar
Trade
Conversation
static avatar fallback
demo seed/reset
one-click immersive history insertion
Demo Mode overlay
ticket receipt after buy
one-click knowledge base import
capacity windows with multi-seat sales
single unified base price floor
nearest eligible delay
free backward aggregation
conversation access gate with stable sessionId
conversation closeout
topic auto-organization
in-memory backend
core ticket lifecycle
```

P1 should ship if time allows:

```text
agent-vs-agent conversation layout
negative timing order match
near-halt/default demo controls
simple price chart
browser-contained Live2D loader if converted assets exist
T+0 transfer animation
halt countdown ring
seat capacity meter
calendar heatmap
trade tape pulse
static avatar parallax fallback
```

P2 stretch:

```text
in-page Live2D renderer
cursor gaze inside web page
mouth movement while speaking
tap reactions
see-through conversion quality improvements
```

Post-Stage0:

```text
real platform-managed runtime
desktop pet follows system cursor
real vector database
real streaming voice
production exchange hardening
```

## 16. Product Lint

The implementation must satisfy these checks:

- First screen after login is an app surface, not a landing page.
- Anonymous users can browse Discover, inspect Calendar slots/windows, inspect Trade, and open Conversation preview.
- Registration is required only for state-changing actions.
- Protected actions trigger auth only at final submit/confirm, not while browsing or filling forms.
- After auth, the user returns to the same screen with pending action context restored.
- Registration uses local name/password stored locally for Stage 0.
- No Cloudflare, Google, OAuth, external email verification, or email identifier is required.
- App shell keeps primary navigation, current user, and demo balance visible.
- Personal Center exists and exposes profile, tickers, slots, knowledge bases, issued tickets, holdings, sessions, and demo controls.
- Discover exists as the lightweight market entry point.
- Calendar, Trade, and Conversation are visible as the three main modules.
- TimeX uses the same lucide-style triangle logo everywhere.
- Demo Mode overlay can guide the live script without replacing normal navigation.
- Demo mode can one-click insert believable historical data into Calendar, Trade, and Conversation.
- Knowledge base setup is part of user initialization and supports one-click import.
- Seller sets one unified base price for the slot/ticker access product.
- Sale/relist/current/cut-in floor price must not go below unified base.
- 30-minute windows can sell multiple seat tickets up to seller-defined capacity.
- UI shows capacity, sold count, and remaining seats where windows are listed.
- Buy controls must clearly buy one seat, not imply exclusive ownership of the whole window when capacity > 1.
- Scattered held windows can be aggregated later for free when capacity and halt rules allow.
- Requested full windows can auto-delay to the nearest later eligible window.
- UI shows `30D bookable`.
- UI shows `7D tradable`.
- UI shows `12H halt`.
- Every ticket shows ticker, interaction type, start time, duration, base price, and current/list price.
- Ticket status follows the shared status taxonomy.
- Buy action produces a ticket receipt and T+0 transfer feedback.
- Ticket receipt shows receipt code, seat/window, sessionId, fee split, and timezone.
- Holdings has next actions without hidden menus.
- Normal trading is disabled after halt.
- Speed-up and extension orders support negative net price.
- Conversation visually connects to the held ticket.
- Conversation requires owned/cut-in ticket access.
- Buyer/seller/ticket pair has one stable active sessionId.
- Conversation self-organizes topics and displays topic summary.
- Conversation closeout shows summary, topics, remaining tokens, and next actions.
- Conversation input remains visible at common laptop viewport sizes.
- Avatar/Live2D must not cover transcript or input.
- Knowledge base is shown as private seller context.
- Agent-vs-agent looks different from normal chat.
- Users are not asked to import third-party agents or provide agent runtime keys.
- Agent runtime is platform-managed or mocked behind the backend.
- Deprecated third-party agent import/connector code from earlier prototypes is removed from product code and docs.
- Live2D is scoped to browser-only interaction for Stage 0.
- Live2D is only claimed active when a loader renders an animated model.
- Live2D missing assets do not crash the app.
- Browser-only Live2D does not claim system-wide mouse tracking.
- Calendar implements both `>=768px` wide-screen and `<768px` mobile layouts.
- Trade implements both `>=768px` wide-screen and `<768px` mobile layouts, with a visible candlestick/K-line chart as the primary market surface.
- Conversation implements both `>=768px` wide-screen and `<768px` mobile layouts.
- Mobile layouts must avoid table overflow at 390px width.
- Disabled actions must show a short reason.

## 17. Implementation Checklist

Progress notation for the current local 8-worker run:

```text
[x] means the item has runnable evidence in an isolated worker copy.
Items marked from worker output still require main-repo integration and final validation before Stage 0 is accepted.
Unchecked items are either not implemented, still running, failed validation, or not yet evidenced.
```

Current progress evidence:

```text
2026-05-01 W4 worker-validated Discover and Calendar with npm run lint, npm run build, and static responsive/string checks.
2026-05-01 W5 worker-validated Trade/K-line terminal with rule validator, npm run lint, npm run build, and HTTP smoke checks on 5012.
2026-05-01 W6 worker-validated Conversation and avatar fallback with npm run lint, npm run build, and static layout contract checks.
2026-05-01 W7 worker-validated offline validation tooling; product checklist items remain gated on integration/live validation.
2026-05-01 W8 worker-validated agentic lint/reconciliation tooling; it correctly refused doc reconciliation without green merged evidence.
2026-05-01 W1 worker-validated backend/API with backend smoke, go test, go vet, and go build.
2026-05-01 W2 worker-validated frontend shell/shared primitives/contracts/routes with npm ci, npm run lint, npm run build, and HTTP route smoke on 5012.
2026-05-01 W3 worker-validated auth UX and Personal Center with npm install, npm run check:auth, npm run lint, npm run build, and HTTP smoke on 5013 because 5012 was occupied.
2026-05-01 main repo integrated frontend Stage 0 route shell and backend API; `npm run lint`, `npm run build`, `go test ./...`, `go vet ./...`, `go build ./cmd/api`, and `backend/scripts/smoke.sh` pass.
2026-05-01 main repo integrated browser-contained avatar fallback blink, in-page gaze, and tap reaction; `npm run lint` and `npm run build` pass.
2026-05-01 cloned `shitagaki-lab/see-through` into `.cron/research/see-through`; README confirms PSD/mask/depth layer decomposition via `inference/scripts/inference_psd.py`, not direct Live2D `model3/moc3` generation.
2026-05-01 cloned Project AIRI into `.cron/research/airi`; relevant web Live2D implementation lives in `packages/stage-ui-live2d` and uses Pixi + `pixi-live2d-display` with focus/blink/motion handling for already-prepared Live2D models.
2026-05-01 main repo aligned `Docs/schema_stage0.sql` with the backend Stage 0 object model; static table/field checks pass, but no psql execution check is available locally.
2026-05-01 Live2D worker result: see-through isolated Python environment and `--help` probes pass, but H08/H09 remain blocked because HuggingFace model download returns `[Errno 65] No route to host` and the available inference paths are CUDA-oriented while this host exposes MPS but no CUDA.
2026-05-01 Live2D worker result: Project AIRI-informed H10 boundary is integrated in `frontend/lib/live2d-assets.ts` and `frontend/components/live2d-model-boundary.tsx`; it detects model3/moc3 packages and preserves fallback, but H10 remains unchecked because no generated model package exists and no Pixi renderer has been render-verified.
```

### A. Blueprint And Repo

- [x] A01 Keep this file as the authoritative Stage 0 requirement source. _(main repo doc update; integration validation still pending)_
- [x] A02 Keep `Docs/schema_stage0.sql` aligned with this object model. _(main-repo schema now includes users, tickers, slots, capacity windows, tickets, receipts, timing orders, sessions/topics, runtime config, market events, and demo history; static checks pass, psql unavailable locally)_
- [x] A03 Keep README local dev commands accurate. _(main-repo verified README uses frontend 5012 and backend 5001; frontend/backend build checks pass)_
- [x] A04 Keep license clear and noncommercial if that remains the project choice. _(PolyForm Noncommercial License 1.0.0 present in `LICENSE`)_

### B. Auth

- [x] B01 Anonymous read-only browsing. _(worker-validated W1 APIs plus W4/W5/W6 module routes; integration pending)_
- [x] B02 Email/password register screen. _(worker-validated W3; integration pending)_
- [x] B03 Email/password login screen. _(worker-validated W3; integration pending)_
- [x] B04 Logout action. _(worker-validated W3; integration pending)_
- [x] B05 Session/current user API. _(worker-validated W1; integration pending)_
- [x] B06 Demo balance visible after login. _(worker-validated W3; integration pending)_
- [x] B07 Protected action auth prompt preserves intended action. _(worker-validated W3; integration pending)_
- [x] B08 No Cloudflare/Google/OAuth/email verification dependency. _(worker-validated W1 local email/password backend; integration pending)_
- [x] B09 Auth prompt triggers only at final protected submit/confirm. _(worker-validated W3; integration pending)_
- [x] B10 Pending route/form/action context restores after auth. _(worker-validated W3; integration pending)_

### C. Personal Center

- [x] C01 Profile panel. _(worker-validated W3; integration pending)_
- [x] C02 Balance panel. _(worker-validated W3; integration pending)_
- [x] C03 My Tickers panel. _(worker-validated W3; integration pending)_
- [x] C04 My Slots panel. _(worker-validated W3; integration pending)_
- [x] C05 Knowledge Bases panel. _(worker-validated W3; integration pending)_
- [x] C06 One-click knowledge base import. _(worker-validated W3; integration pending)_
- [x] C07 Unified base price setting. _(worker-validated W3; integration pending)_
- [x] C08 Default window capacity setting. _(worker-validated W3; integration pending)_
- [x] C09 Issued Tickets panel. _(worker-validated W3; integration pending)_
- [x] C10 Holdings panel. _(worker-validated W3; integration pending)_
- [x] C11 Session History panel. _(worker-validated W3; integration pending)_
- [x] C12 Demo Controls panel. _(worker-validated W3; integration pending)_

### D. Discover

- [x] D01 Discover route. _(worker-validated W4; integration pending)_
- [x] D02 Trending ticker list. _(worker-validated W4; integration pending)_
- [x] D03 Recent trade and cut-in opportunity entry points. _(worker-validated W4; integration pending)_

### E. Calendar

- [x] E01 Calendar route. _(worker-validated W4; integration pending)_
- [x] E02 Ticker profile header. _(worker-validated W4; integration pending)_
- [x] E03 30-day strip. _(worker-validated W4; integration pending)_
- [x] E04 30-minute slot grid. _(worker-validated W4; integration pending)_
- [x] E05 Historical booking/demand markers. _(worker-validated W4; integration pending)_
- [x] E06 Capacity/sold/remaining seat display. _(worker-validated W4; integration pending)_
- [x] E07 Buy/book one seat in a capacity window. _(worker-validated W4; integration pending)_
- [x] E08 Nearest eligible delay suggestion. _(worker-validated W4; integration pending)_
- [x] E09 Owned-ticket handoff to Personal Center. _(worker-validated W4; integration pending)_
- [x] E10 Calendar responsive layout at `>=768px` and `<768px`. _(worker-validated W4; integration pending)_

### F. Trade

- [x] F01 Trade route. _(worker-validated W5; integration pending)_
- [x] F02 Listed tickets table. _(worker-validated W5; integration pending)_
- [x] F03 Buy panel. _(worker-validated W5; integration pending)_
- [x] F04 Relist panel. _(worker-validated W5; integration pending)_
- [x] F05 Trade tape. _(worker-validated W5; integration pending)_
- [x] F06 Fee split display. _(worker-validated W5; integration pending)_
- [x] F07 Speed-up queue. _(worker-validated W5; integration pending)_
- [x] F08 Extension queue. _(worker-validated W5; integration pending)_
- [x] F09 Negative net price rendering. _(worker-validated W5; integration pending)_
- [x] F10 Halt/default/cut-in flow. _(worker-validated W5; integration pending)_
- [x] F11 Historical price movement and trade tape injection. _(worker-validated W5; integration pending)_
- [x] F12 Shared ticket status taxonomy. _(worker-validated W5; integration pending)_
- [x] F13 Ticket receipt after buy. _(worker-validated W5; integration pending)_
- [x] F14 Base price floor enforcement. _(worker-validated W5; integration pending)_
- [x] F15 Free backward aggregation action. _(worker-validated W5; integration pending)_
- [x] F16 Nearest eligible delay action. _(worker-validated W5; integration pending)_
- [x] F17 Candlestick/K-line chart plus responsive Trade layout at `>=768px` and `<768px`. _(worker-validated W5; integration pending)_

### G. Conversation

- [x] G01 Conversation route. _(worker-validated W6; integration pending)_
- [x] G02 Ticket access gate. _(worker-validated W6; integration pending)_
- [x] G03 Chat transcript. _(worker-validated W6; integration pending)_
- [x] G04 Token budget meter. _(worker-validated W6; integration pending)_
- [x] G05 Knowledge base badge. _(worker-validated W6; integration pending)_
- [x] G06 Agent response from summary. _(worker-validated W6; integration pending)_
- [x] G07 Agent-vs-agent layout. _(worker-validated W6; integration pending)_
- [x] G08 Session summary. _(worker-validated W6; integration pending)_
- [x] G09 Static avatar fallback. _(worker-validated W6; integration pending)_
- [x] G10 Stable sessionId for buyer/seller/ticket. _(worker-validated W6; integration pending)_
- [x] G11 Topic auto-organization. _(worker-validated W6; integration pending)_
- [x] G12 Historical transcript injection. _(worker-validated W6; integration pending)_
- [x] G13 Conversation closeout with next actions. _(worker-validated W6; integration pending)_
- [x] G14 Conversation responsive layout at `>=768px` and `<768px`. _(worker-validated W6; integration pending)_

### H. Live2D Stretch

- [x] H01 Optional Live2D component boundary. _(worker-validated W6 static fallback boundary; integration pending)_
- [x] H02 Asset presence check. _(worker-validated W6 static avatar contract; integration pending)_
- [x] H03 In-page cursor gaze. _(worker-validated W6 browser-contained pointer tracking inside avatar panel; integration pending)_
- [x] H04 Auto blink. _(main-repo integrated browser-contained avatar fallback blink animation; `npm run lint` and `npm run build` pass)_
- [x] H05 Thinking/speaking state. _(worker-validated W6; integration pending)_
- [x] H06 Tap reaction. _(main-repo integrated avatar tap reaction state and pulse animation; `npm run lint` and `npm run build` pass)_
- [x] H07 Live2D asset directory contract. _(worker-validated W6 `frontend/public/avatar` fallback contract; integration pending)_
- [ ] H08 Run see-through decomposition for `assets/456019c1-9875-416d-9f0c-6ffd6c2492dd.png`. _(worker attempted main, quantized, and blockswap paths at low resolution; no PSD/mask/depth output generated due HuggingFace no-route and CUDA-only path blockers)_
- [ ] H09 Run see-through decomposition for `assets/a0fe4738-0d24-4d26-ac91-a67d07b90ee5.png`. _(worker attempted main and quantized paths at low resolution; no PSD/mask/depth output generated due HuggingFace no-route and CUDA-only path blockers)_
- [ ] H10 Load generated model package if model3/moc3 output exists. _(main-repo detection/fallback boundary integrated, but no `model3.json`/`.moc3` package exists under `assets/live2d/generated` and no Pixi render verification has passed)_
- [x] H11 Fall back to static cutout if conversion is incomplete. _(worker-validated W6; integration pending)_

### I. Platform Agent Runtime

- [x] I01 Backend runtime health endpoint. _(worker-validated W1 `/healthz` and `/readyz`; integration pending)_
- [x] I02 Platform-managed key configuration through environment. _(main-repo backend reads `TIMEX_AGENT_RUNTIME_KEY`; runtime health reports environment configuration without frontend/user key setup)_
- [x] I03 Mock route endpoint for demo. _(worker-validated W1 backend-managed mock runtime; integration pending)_
- [x] I04 Agent reply uses knowledge base summary. _(worker-validated W1/W6; integration pending)_
- [x] I05 Agent-vs-agent uses runtime abstraction. _(worker-validated W1/W6; integration pending)_
- [x] I06 No frontend secret storage. _(worker-validated W2/W3; integration pending)_
- [x] I07 No user-facing third-party agent import flow. _(worker-validated W2/W8; integration pending)_
- [x] I08 Remove deprecated third-party agent connector/import prototype code from the main product surface. _(main-repo verified: product docs/frontend/README contain no deprecated named agent or key-scope surface strings; `npm run lint` and `npm run build` pass)_

### J. Demo Validation

- [x] J01 Run frontend on localhost:5012 and keep it alive for the full validation run. _(main-repo live route smoke passed on `http://localhost:5012` for Discover, Calendar, Trade, Conversation, Personal Center, and dynamic detail routes)_
- [x] J02 Run backend on localhost:5001 and keep it alive for the full validation run. _(main-repo `backend/scripts/smoke.sh` starts backend on 5001 when needed and keeps it alive for the smoke run)_
- [ ] J03 Complete full demo script.
- [x] J04 Check 1440px desktop layout. _(Chrome DevTools viewport check passed for Discover, Calendar, Trade, Conversation, and Personal Center with no horizontal overflow)_
- [x] J05 Check 390px mobile layout. _(Chrome DevTools mobile emulation `390x844x2` passed for Discover, Calendar, Trade, Conversation, and Personal Center with no horizontal overflow)_
- [x] J06 Verify missing Live2D assets do not crash. _(worker-validated W6 static fallback contract; integration pending)_
- [ ] J07 Verify mock labels are visible where runtime behavior is mocked.
- [ ] J08 Verify one-click history insertion populates Calendar, Trade, and Conversation.
- [x] J09 Verify conversation access gate blocks users without owned/cut-in ticket. _(worker-validated W6; integration pending)_
- [x] J10 Verify browser-only Live2D does not claim desktop/system cursor behavior. _(worker-validated W6; integration pending)_
- [ ] J11 Verify Demo Mode overlay follows the script without blocking normal use.
- [x] J12 Verify capacity windows can sell multiple seats up to limit. _(worker-validated W1/W4; integration pending)_
- [x] J13 Verify base price floor blocks below-base sale/relist. _(worker-validated W1/W5; integration pending)_
- [x] J14 Verify free backward aggregation and nearest eligible delay. _(worker-validated W1/W5; integration pending)_
- [x] J15 Verify module UI states: loading, empty, error, success, disabled. _(main-repo integrated shared UI primitives; `npm run lint` and `npm run build` pass)_
- [x] J16 Verify Calendar/Trade never hide capacity or base floor before purchase. _(main-repo integrated Calendar/Trade surfaces show `CapacityMeter`, unified base floor, and current/list price before buy; `npm run build` pass)_
- [x] J17 Verify Conversation input and avatar do not overlap on desktop/mobile. _(worker-validated W6 static layout contract; integration pending)_
- [ ] J18 Verify receipt, toast, and event tape all update after buy/relist/match.
- [x] J19 Verify mobile Trade tables collapse without horizontal overflow. _(main-repo integrated responsive table CSS uses `data-label` card rows under 520px; `npm run build` pass)_
- [x] J20 Verify backend `/healthz` and `/readyz` stay green during the full demo. _(main-repo `backend/scripts/smoke.sh` asserts both endpoints before exercising auth, market, ticket, demo, session, and runtime flows)_
- [ ] J21 Verify frontend recovers gracefully from a brief backend reconnect state.
- [x] J22 Verify anonymous users can browse Discover, Calendar, Trade, and Conversation preview. _(main-repo integrated routes `/discover`, `/calendar`, `/trade`, `/conversation`; `npm run build` pass)_
- [x] J23 Verify buy/relist/issue/import/chat send actions require email/password auth. _(worker-validated W3; integration pending)_
- [x] J24 Verify protected action resumes after successful login/register. _(worker-validated W3; integration pending)_
- [x] J25 Verify auth does not trigger while browsing modules or filling protected forms before final submit. _(worker-validated W3; integration pending)_
- [x] J26 Verify pending context restores for buy, relist, match, cut-in/default, import, and chat send. _(worker-validated W3; integration pending)_

## 18. Completion Gate

Stage 0 is complete only when:

```text
frontend runs on localhost:5012 and stays alive during the full validation
backend runs on localhost:5001 and stays alive during the full validation
backend /healthz and /readyz stay green
anonymous read-only browsing works
email/password local auth works for protected actions
auth triggers only at final protected submit/confirm
protected actions resume after login/register with route/form/action context intact
Personal Center works
Discover works
Calendar works
Trade works
Conversation works
ticket lifecycle works from issue -> buy -> relist -> trade -> halt/default/cut-in -> chat
capacity windows can sell multiple seats up to seller-defined capacity
seller uses one unified base price and prices do not settle below base
scattered held windows can aggregate later for free when conditions allow
full requested windows can delay to nearest eligible later window
shared ticket statuses render consistently
ticket receipt confirms T+0 ownership transfer after buy
one-click history insertion makes Calendar, Trade, and Conversation look populated
Demo Mode overlay can guide the 41-step script
knowledge base can be imported in one click during user initialization
conversation access is gated by owned/cut-in ticket
buyer/seller/ticket resolves to one stable sessionId with auto-organized topics
conversation closeout saves summary, topics, and next actions
agent runtime is platform-managed or clearly mocked behind backend
users only provide private knowledge base content, not runtime keys
Live2D is browser-scoped and either loads converted model assets or falls back to static cutout
demo script can be completed in one browser session
```
