# Assumptions, limitations and production follow-ups

## Assumptions

- The merchant uses Freshdesk (v2 API) and can generate an agent API key (Profile settings → *View API key*).
- Freshdesk is the system of record, and the agent only needs to *read* support context: triage, summarisation, and lookups.
- One deployment serves one Freshdesk helpdesk.

## Limitations

- **API-key auth only.** Freshdesk's REST API authenticates with an agent API key (Basic auth, `key:X`). OAuth exists only for Freshworks marketplace apps, so it isn't implemented here. The key is server-side configuration, not an end-user onboarding flow. `verify_connection` (and a check at MCP-server startup) catches bad keys early.
- **Search.** Freshdesk's `/search/tickets` is a filter query language (`status:2 AND tag:'x'`) capped at 30 results × 10 pages, and it has no full-text search. Keyword-only searches therefore scan the 100 most recently updated tickets. Mock and live search can rank results differently.
- **List window.** `GET /tickets` returns only tickets created in the last 30 days unless filtered. Older tickets are reachable through `search_tickets` with `createdAfter`.
- **Fields.** Only core ticket fields are exposed. Conversations, attachments, and custom fields are not.
- **Rate limits.** Retries are per process. Several replicas sharing one Freshdesk account each count against the same per-minute quota without coordinating. Every `include=requester` call costs an extra API credit.
- **PII.** Redaction is regex-based (emails, phone-like digit runs). It won't catch names, addresses, or IDs embedded in free text. The raw `/api/freshdesk/tickets` and `/search` HTTP routes used by the demo UI return unredacted fixtures. The agent-facing surfaces (MCP server and `/api/freshdesk/mcp/call`) are redacted.
- **No authentication on the connector's own HTTP routes.** Anyone who can reach the server can read tickets through it, so run it on a private network or behind the platform's auth.
- **Pagination consistency.** Page-based pagination can skip or repeat tickets that change while being traversed.
- The surrounding Signalroom prototype (JSON-file store, demo JWT auth) is separate from the connector and isn't production architecture.

## Appropriate long-term fix

Ship it as an installable multi-tenant integration:

1. **Per-tenant credentials** stored in a secret manager (encrypted, rotatable), collected through an install flow that runs `verify_connection` before saving. Where the merchant uses a Freshworks marketplace app, use OAuth with least-privilege scopes.
2. **A shared rate-limit budget per Freshdesk account** (e.g. a Redis token bucket fed by `X-Ratelimit-Remaining`), with request queuing, a circuit breaker, and per-tenant metrics.
3. **A sync and index layer** (incremental via `updated_since` and webhooks) so agents get real full-text and semantic search over all history instead of the 100-ticket keyword scan.
4. **Configurable field allowlists and proper PII detection** per merchant, plus audit logs of every tool call (who, which tool, which ticket ids).
5. **Opt-in write tools** (add private note, set status) gated behind human approval in Agent Studio, with dry-run previews and idempotency keys.
