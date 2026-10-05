# 3-minute demo script

## 0:00–0:20 · Validation

`npm install && npm test`: 19 tests cover auth, list/get/search, Link-header pagination, `429` with `Retry-After`, 5xx backoff, query-injection rejection, PII redaction, read-only enforcement, and an MCP client↔server round trip.

## 0:20–1:30 · The agent's view (MCP)

`npm run demo:agent` starts the real stdio MCP server and plays an agent through a triage scenario:

1. `verify_connection`: credentials checked
2. `list_tickets`: most recently updated first, with `hasNextPage`
3. `search_tickets { status: 2, tag: "payments" }`: structured Freshdesk filter
4. `search_tickets { keyword: "refund" }`: keyword path, reported by the `strategy` field
5. `get_ticket`: the phone number in the description shows as `[phone]` and the requester email is masked
6. Injection attempt in `tag` → validation error
7. `update_ticket` → tool not found (read-only by construction)

## 1:30–2:15 · UI

`npm run dev:server` + `npm run dev` → `http://127.0.0.1:5173/`. Click **List**, paginate, search `payment`, open a ticket, then **Test blocked write**.

## 2:15–3:00 · Live mode and limits

Set `FRESHDESK_DOMAIN` / `FRESHDESK_API_KEY` in `.env` and rerun `npm run demo:agent`. The same tools now hit Freshdesk, and a bad key fails at startup with a clear 401 message. Close with [AGENT_CAPABILITIES.md](AGENT_CAPABILITIES.md) (what the agent can and can't do) and the long-term fix in [LIMITATIONS.md](LIMITATIONS.md).
