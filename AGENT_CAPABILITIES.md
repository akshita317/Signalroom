# What an agent can and cannot do with this connector

This connector gives an Agent Studio agent **read-only** access to a merchant's Freshdesk tickets through four MCP tools.

## The agent can

| Tool | Use it to | Notes |
|---|---|---|
| `verify_connection` | Confirm the API key works and see which Freshdesk agent it belongs to | Call first when debugging auth |
| `list_tickets` | Browse tickets, most recently updated first, page by page | `perPage` 1–100; follow `hasNextPage`. Freshdesk returns only tickets **created in the last 30 days** here |
| `get_ticket` | Read one ticket in full: subject, status, priority, type, tags, requester, description | Description is plain text, truncated to 2,000 chars, with emails and phone numbers redacted |
| `search_tickets` | Find tickets by `status`, `priority`, `tag`, `createdAfter`, `updatedAfter`, and/or `keyword` | Structured filters run on Freshdesk (up to 300 results: 10 pages × 30). The response's `strategy` field says how the search ran |

Typical questions it can answer:

- "Which open urgent tickets mention payments?" → `search_tickets { status: 2, priority: 4, keyword: "payment" }`
- "What is ticket 1003 about, and who raised it?" → `get_ticket { id: 1003 }`
- "How many tickets tagged `autopay` were created since 1 September?" → `search_tickets { tag: "autopay", createdAfter: "2026-09-01" }` then read `total`
- "Summarise what customers complained about this week" → `search_tickets { updatedAfter: … }` then `get_ticket` on the relevant ones

Statuses and priorities come back as words (`open`, `pending`, `resolved`, `closed`; `low` … `urgent`), so the agent doesn't need to know Freshdesk's numeric codes.

## The agent cannot

- **Change anything.** It cannot reply to, update, assign, merge, close, or delete tickets, and it cannot create contacts. No write tools exist; calls to names like `update_ticket` are rejected before any request reaches Freshdesk.
- **Run full-text search across all history.** Freshdesk's API has no full-text ticket search. A keyword-only search scans the **100 most recently updated tickets**. To reach older tickets, combine the keyword with a structured filter (for example `createdAfter`). The `strategy: "recent_tickets_keyword_scan"` field tells the agent when to caveat a "no results" answer.
- **Read conversations, notes, attachments, custom fields, contacts, companies, agents, groups, SLAs, or satisfaction ratings.** Only the ticket record itself is exposed.
- **See unredacted PII** (unless the operator sets `FRESHDESK_REDACT_PII=false`). Requester emails are masked (`m***@example.test`), and emails and phone numbers inside descriptions become `[email]` and `[phone]`. Requester names and ticket subjects are *not* redacted.
- **Reach more than one Freshdesk account.** One server instance = one helpdesk = one API key.
- **See more than the API key's agent can see.** Freshdesk enforces the key owner's permissions (group and ticket scope). A restricted agent's key gives the bot a restricted view.

## How failures look to the agent

| Situation | What the agent receives | Suggested agent behaviour |
|---|---|---|
| Bad or revoked API key | `Freshdesk rejected the API key (HTTP 401)…` | Tell the user the integration needs re-authorising; don't retry |
| Missing permission or plan feature | `Freshdesk denied access (HTTP 403)…` | Explain the limitation |
| Rate limited, short wait | Nothing: the connector waits out `Retry-After` (≤ 30 s) and retries | — |
| Rate limited, long wait | `Freshdesk rate limit exceeded; retry after N s` | Tell the user and retry later |
| Freshdesk 5xx | Retried with 1 s, 2 s, 4 s backoff, then `HTTP 5xx` error | Report a temporary outage |
| Invalid input (bad date, unknown status, injection attempt in `tag`) | MCP input-validation error naming the field | Fix the arguments |
| Ticket doesn't exist | `HTTP 404 … Record not found` | Ask the user to check the id |
