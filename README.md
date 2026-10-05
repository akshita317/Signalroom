# Freshdesk connector for Agent Studio

**Razorpay FDE assignment, option 3.** A private, read-only Freshdesk connector that lets an Agent Studio agent read support tickets. It runs as a real **MCP server** (stdio) and also exposes the same tools over HTTP.

| Requirement | Where |
|---|---|
| API-key authentication flow | `FreshdeskClient` sends Basic `base64(key:X)`. `verify_connection` calls `/agents/me`; the MCP server checks the key at startup and exits on 401 ([server/freshdesk.ts](server/freshdesk.ts)) |
| list / get / search primitives | `list_tickets`, `get_ticket`, `search_tickets` (status, priority, tag, date, and keyword filters) |
| Rate-limit handling | Honours `Retry-After` on 429, exponential backoff on 5xx, fails fast when the wait exceeds 30 s, tracks `X-Ratelimit-Remaining`, 15 s request timeout |
| MCP tool specification | [server/mcp.ts](server/mcp.ts) (official `@modelcontextprotocol/sdk`, read-only annotations) · JSON Schema at `GET /api/freshdesk/tools` |
| What the agent can / cannot do | [AGENT_CAPABILITIES.md](AGENT_CAPABILITIES.md) |
| Assumptions and limitations | [LIMITATIONS.md](LIMITATIONS.md) · [SECURITY.md](SECURITY.md) |
| Test script | `npm test` (19 tests) · `npm run demo:agent` (end-to-end agent scenario over stdio MCP) |

## Setup

Requires Node 20.19+ (or 22.12+).

```bash
npm install
npm test            # unit + protocol tests, no network or credentials needed
npm run demo:agent  # spawns the MCP server and runs an agent triage scenario
```

With no Freshdesk variables set, everything runs against **six fictional tickets** and never calls an external service.

### Connect a real Freshdesk account

1. Sign up for a free Freshdesk trial, then go to Profile settings → **View API key**.
2. `cp .env.example .env` and set:
   ```dotenv
   FRESHDESK_DOMAIN=yourcompany.freshdesk.com
   FRESHDESK_API_KEY=your-api-key
   FRESHDESK_REDACT_PII=true   # default; set false only if the agent must see raw emails/phones
   ```
3. Run `npm run demo:agent` again. The startup log shows `authenticated to yourcompany.freshdesk.com as <agent>`. A wrong key fails immediately with a 401 explanation.

The key is read only by the server process. It never reaches the browser or the model.

### Plug into an MCP-capable agent (Agent Studio, Claude Desktop, etc.)

```json
{
  "mcpServers": {
    "freshdesk": {
      "command": "npx",
      "args": ["tsx", "server/mcp-stdio.ts"],
      "cwd": "/absolute/path/to/this/repo",
      "env": { "FRESHDESK_DOMAIN": "yourcompany.freshdesk.com", "FRESHDESK_API_KEY": "…" }
    }
  }
}
```

For platforms that use HTTP tool calling instead of MCP, fetch the specs from `GET /api/freshdesk/tools` and execute with `POST /api/freshdesk/mcp/call` `{ "name": "search_tickets", "input": { "tag": "payments", "status": 2 } }`.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `verify_connection` | none | Authenticated agent id, name, email |
| `list_tickets` | `page?`, `perPage?` (≤100) | Tickets (most recently updated first), `hasNextPage` from Freshdesk's `Link` header |
| `get_ticket` | `id` | Ticket with plain-text description (≤2,000 chars, PII redacted) |
| `search_tickets` | at least one of `keyword`, `status`, `priority`, `tag`, `createdAfter`, `updatedAfter`; `page?` | Tickets, `total`, `hasNextPage`, `strategy` |

Design choices worth noting:

- **Search is honest about coverage.** Freshdesk's search API is a filter language with no full-text search. Structured filters go to Freshdesk; a keyword alone scans the 100 most recently updated tickets. The `strategy` field tells the agent which path ran, so it can caveat "no results".
- **Injection-safe query building.** Filter values are validated (enums, `YYYY-MM-DD`, tag allowlist) before they're placed in the Freshdesk query string.
- **Agent-shaped output.** Numeric status and priority codes become words, HTML becomes text, unneeded fields are dropped, and PII is minimised.
- **Read-only by construction.** No write tool is registered, and every tool carries `readOnlyHint: true`.

## Demo UI and HTTP routes

```bash
npm run dev:server   # API on :8787
npm run dev          # UI on :5173
```

Open `http://127.0.0.1:5173/`. The Freshdesk panel at the top lists, paginates, searches, and inspects tickets, and shows a blocked write attempt. Routes: `GET /api/freshdesk/verify`, `/tickets`, `/tickets/:id`, `/search?q=&status=&priority=&tag=&createdAfter=&updatedAfter=`, `/tools`, and `POST /mcp/call`. See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for a 3-minute walkthrough.

## Project layout

```
server/freshdesk.ts     Freshdesk REST client (auth, retries, rate limits, search query builder) + mock source
server/mcp.ts           Tool definitions, input validation, agent view / PII redaction, MCP server factory
server/mcp-stdio.ts     stdio MCP entrypoint (npm run mcp)
server/index.ts         Express routes (connector + surrounding Signalroom app)
scripts/agent-demo.ts   MCP client that runs the end-to-end agent scenario
test/freshdesk.test.ts  19 tests against a fake Freshdesk and a real MCP client
```

No real customer data, credentials, or API keys are in this repository. The demo tickets are fictional and use the reserved `example.test` domain.

---

_The rest of this repository is Signalroom, an earlier incident-intelligence prototype that hosts the connector demo panel. It is not part of the assignment._

## Signalroom

AI incident intelligence for calmer, faster production response.

Signalroom turns a messy production report into an evidence-backed incident brief, a likely cause, and an owner-ready action plan. It is designed as a portfolio project for software engineering and applied AI roles: the prototype is usable without an API key, while the production architecture is ready for retrieval, structured model output, evaluation, and human approval.

## Run locally

```bash
npm install
npm run dev
npm run dev:server
```

Run the frontend and API in separate terminals, then open `http://127.0.0.1:5173/`.

Copy `.env.example` to `.env` for the API. Without `OPENAI_API_KEY`, the server uses a deterministic demo provider. Add an OpenAI key to use the real LLM path.

## Validate

```bash
npm run build
```

## Learn the project

Read [PROJECT_GUIDE.md](PROJECT_GUIDE.md) for the product story, demo walkthrough, AI architecture, interview explanation, roadmap, and resume bullets.

## Implemented capabilities

- Editable incident intake
- Real OpenAI analysis with a safe deterministic fallback
- Retrieved runbooks, deploy timeline, and service ownership context
- Zod-validated structured incident JSON
- JWT authentication with registration and login
- File-backed saved investigations for local development
- Incident brief, evidence, and action-plan views
- Confidence and model reasoning notes
- Evaluation metrics endpoint at `/api/evaluations`
- Human approval endpoint before any production action
- Responsive desktop and mobile layout

## API scripts

```bash
npm run dev:server
npx tsc -p tsconfig.server.json --noEmit
```

The server stores local users and investigations under `data/`, which is intentionally gitignored.
