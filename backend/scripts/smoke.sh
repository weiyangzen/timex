#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${TIMEX_BASE_URL:-http://localhost:5001}"
LOG_FILE="${TMPDIR:-/tmp}/timex-backend-smoke.log"
PID=""

cleanup() {
  if [[ -n "${PID}" ]]; then
    kill "${PID}" >/dev/null 2>&1 || true
    wait "${PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! curl -fsS "${BASE_URL}/healthz" >/dev/null 2>&1; then
  (cd "${ROOT}" && go run ./cmd/api >"${LOG_FILE}" 2>&1) &
  PID="$!"
  for _ in $(seq 1 60); do
    if curl -fsS "${BASE_URL}/healthz" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
fi

python3 - "${BASE_URL}" <<'PY'
import json
import sys
import time
import urllib.error
import urllib.request

base = sys.argv[1].rstrip("/")

def call(method, path, payload=None, token=None, expect=200):
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            status = resp.status
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        status = exc.code
        body = exc.read().decode("utf-8")
    if status != expect:
        raise AssertionError(f"{method} {path}: expected {expect}, got {status}: {body}")
    return json.loads(body) if body else {}

def first(items, pred):
    for item in items:
        if pred(item):
            return item
    raise AssertionError("expected matching item")

health = call("GET", "/healthz")
ready = call("GET", "/readyz")
assert health["status"] == "ok"
assert ready["status"] == "ready"

discover = call("GET", "/api/discover")
assert discover["anonymous_read_only"] is True

calendar = call("GET", "/api/calendar/AYUAN")
market = call("GET", "/api/market/AYUAN")
preview = call("GET", "/api/conversation/preview")
assert calendar["anonymous_read_only"] is True
assert market["anonymous_read_only"] is True
assert preview["can_send_message"] is False

window = first(calendar["windows"], lambda w: w["remaining_capacity"] > 0)
unauth = call("POST", f"/api/windows/{window['id']}/buy-seat", {"price_cents": window["base_price_cents"]}, expect=401)
assert unauth["error"]["details"]["auth_required"] is True

login_name = f"smoke-{int(time.time())}"
registered = call("POST", "/api/auth/register", {
    "login_name": login_name,
    "password": "password",
    "pending_action": {"path": f"/api/windows/{window['id']}/buy-seat", "price_cents": window["base_price_cents"]},
}, expect=201)
token = registered["token"]
assert registered["created"] is True
assert registered["pending_action"]["path"].endswith("/buy-seat")

me = call("GET", "/api/me", token=token)
assert me["authenticated"] is True and me["balance_cents"] >= 0
assert me["user"]["login_name"] == login_name
smoke_symbol = "SMK" + str(int(time.time()) % 10000)
profile = call("PATCH", "/api/profile", {
    "ticker_symbol": smoke_symbol,
    "display_name": "Smoke Buyer",
    "mbti": "INTJ",
    "bio": "Smoke profile for local backend validation.",
}, token=token)["profile"]
assert profile["ticker_symbol"].startswith("SMK")

registered_again = call("POST", "/api/auth/register", {
    "login_name": login_name,
    "password": "password",
})
assert registered_again["created"] is False
call("POST", "/api/auth/login", {
    "login_name": login_name,
    "password": "wrong",
}, expect=401)

own_ticker = first(call("GET", "/api/tickers")["tickers"], lambda t: t["symbol"] == smoke_symbol)
own_slot = call("POST", "/api/slots", {
    "ticker_id": own_ticker["id"],
    "slot_name": "Smoke agent room",
    "slot_type": "agent",
    "unified_base_price_cents": 12000,
    "default_capacity_limit": 2,
}, token=token, expect=201)["slot"]
kb = call("POST", "/api/knowledge-bases/import-demo", {
    "slot_id": own_slot["id"],
    "summary": "Smoke knowledge base summary for runtime reply validation.",
}, token=token, expect=201)["knowledge_base"]
assert kb["imported_by_one_click"] is True
issued = call("POST", "/api/tickets", {
    "slot_id": own_slot["id"],
    "capacity_limit": 2,
    "base_price_cents": 12000,
}, token=token, expect=201)
assert issued["window"]["capacity_limit"] == 2

bought = call("POST", f"/api/windows/{window['id']}/buy-seat", {
    "price_cents": window["base_price_cents"],
    "timezone": "Asia/Shanghai",
}, token=token)
ticket = bought["ticket"]
receipt = bought["receipt"]
assert ticket["owner_user_id"] == registered["user"]["id"]
assert receipt["t0_transfer_confirmed"] is True
assert receipt["seller_royalty_cents"] == receipt["price_cents"] * 15 // 100
assert receipt["platform_fee_cents"] == receipt["price_cents"] * 5 // 100

receipt_read = call("GET", f"/api/tickets/{ticket['id']}/receipt")
assert receipt_read["receipt"]["receipt_code"] == receipt["receipt_code"]

call("POST", f"/api/tickets/{ticket['id']}/relist", {
    "price_cents": ticket["base_price_cents"] - 1,
}, token=token, expect=400)
relisted = call("POST", f"/api/tickets/{ticket['id']}/relist", {
    "price_cents": ticket["base_price_cents"] + 2500,
}, token=token)["ticket"]
assert relisted["status"] == "relisted"

calendar2 = call("GET", "/api/calendar/AYUAN")
later_windows = [w for w in calendar2["windows"] if w["remaining_capacity"] > 0 and w["id"] != window["id"]]
assert len(later_windows) >= 2
second = call("POST", f"/api/windows/{later_windows[0]['id']}/buy-seat", {
    "price_cents": later_windows[0]["base_price_cents"],
}, token=token)["ticket"]
target_window = later_windows[-1]

delay = call("POST", "/api/windows/nearest-delay", {
    "slot_id": target_window["slot_id"],
    "window_id": window["id"],
    "requested_start": window["starts_at"],
    "seat_count": 1,
    "offered_price_cents": target_window["base_price_cents"],
})
assert delay["target_window"]["remaining_capacity"] > 0

aggregation = call("POST", "/api/windows/aggregate-later", {
    "source_ticket_ids": [ticket["id"], second["id"]],
    "target_window_id": target_window["id"],
}, token=token)["aggregation"]
assert aggregation["fee_cents"] == 0 and aggregation["status"] == "completed"

order = call("POST", "/api/timing-orders/extension", {
    "current_ticket_id": ticket["id"],
    "target_time": target_window["starts_at"],
    "limit_price_cents": -500,
    "allow_negative_price": True,
}, token=token, expect=201)["timing_order"]
matched = call("POST", f"/api/timing-orders/{order['id']}/match", {
    "counter_ticket_id": second["id"],
    "net_price_cents": -500,
}, token=token)
assert matched["net_price_cents"] == -500
assert matched["final_ticket_price_cents"] >= matched["base_price_floor_cents"]

demo = call("POST", "/api/demo/inject-history", {}, token=token)
assert demo["batch"]["scope"] == "all"

session = call("POST", "/api/sessions/start", {
    "ticket_id": ticket["id"],
    "mode": "agent",
}, token=token)["session"]
session_again = call("POST", "/api/sessions/start", {
    "ticket_id": ticket["id"],
    "mode": "agent",
}, token=token)["session"]
assert session["session_id"] == session_again["session_id"]

messaged = call("POST", f"/api/sessions/{session['session_id']}/message", {
    "message": "How should I handle a timing order?",
}, token=token)["session"]
assert len(messaged["topics"]) >= 1
assert "knowledge base" in messaged["transcript"][-1]["content"].lower()

runtime = call("GET", "/api/runtime/health")
assert runtime["mock_enabled"] is True and runtime["user_facing_runtime_setup_flow"] is False
mock = call("POST", "/api/runtime/mock-route", {
    "summary": "Capacity-aware Stage 0 summary",
    "message": "Find a window",
    "mode": "agent_vs_agent",
})
assert mock["user_runtime_setup_required"] is False
assert len(mock["agent_vs_agent"]) == 2

ended = call("POST", f"/api/sessions/{session['session_id']}/end", {}, token=token)["session"]
assert ended["status"] == "completed"

print("smoke ok: anonymous reads, auth gate, register, issue/import, buy-seat, receipt, base floor, timing match, aggregation, session, runtime")
PY
