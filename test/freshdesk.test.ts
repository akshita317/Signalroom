import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { FreshdeskApiError, FreshdeskAuthError, FreshdeskClient, FreshdeskRateLimitError, MockFreshdeskClient, buildFilterQuery, demoTickets } from '../server/freshdesk.js'
import { callFreshdeskTool, createFreshdeskMcpServer, freshdeskTools, redactText } from '../server/mcp.js'

type Call = { url: string; authorization: string | null }

/** Fake Freshdesk: replays the given responses in order and records every request. */
function fakeFreshdesk(responses: Response[], overrides: Partial<ConstructorParameters<typeof FreshdeskClient>[0]> = {}) {
  const calls: Call[] = []
  const waits: number[] = []
  const client = new FreshdeskClient({
    domain: 'example.freshdesk.com',
    apiKey: 'demo-key',
    sleep: async (milliseconds) => { waits.push(milliseconds) },
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), authorization: new Headers(init?.headers).get('Authorization') })
      const next = responses.shift()
      if (!next) throw new Error(`Unexpected request to ${String(input)}`)
      return next
    },
    ...overrides,
  })
  return { client, calls, waits }
}

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init, headers: { 'content-type': 'application/json', ...init.headers } })

// --- Authentication -------------------------------------------------------

test('auth: sends API key as Basic base64(key:X) and verifies credentials via /agents/me', async () => {
  const { client, calls } = fakeFreshdesk([json({ id: 77, contact: { name: 'Support Bot', email: 'bot@example.test' } })])
  assert.deepEqual(await client.verifyCredentials(), { agentId: 77, name: 'Support Bot', email: 'bot@example.test' })
  assert.equal(calls[0].url, 'https://example.freshdesk.com/api/v2/agents/me')
  assert.equal(calls[0].authorization, 'Basic ZGVtby1rZXk6WA==')
})

test('auth: 401 raises FreshdeskAuthError immediately without retrying', async () => {
  const { client, calls } = fakeFreshdesk([new Response(null, { status: 401 })])
  await assert.rejects(() => client.verifyCredentials(), (error: unknown) => error instanceof FreshdeskAuthError && /API key/.test(error.message))
  assert.equal(calls.length, 1)
})

test('auth: rejects a domain that is not a Freshdesk subdomain', () => {
  assert.throws(() => new FreshdeskClient({ domain: 'evil.example.com', apiKey: 'k' }), /freshdesk\.com/)
  assert.doesNotThrow(() => new FreshdeskClient({ domain: 'https://acme.freshdesk.com/', apiKey: 'k' }))
})

// --- List / get -----------------------------------------------------------

test('list: uses Link header for hasNextPage and caps perPage at 100', async () => {
  const { client, calls } = fakeFreshdesk([
    json(demoTickets.slice(0, 2), { headers: { link: '<https://example.freshdesk.com/api/v2/tickets?page=2&per_page=100>; rel="next"' } }),
    json(demoTickets.slice(0, 2)),
  ])
  const first = await client.listTickets(1, 500)
  assert.equal(first.perPage, 100)
  assert.equal(first.hasNextPage, true)
  assert.match(calls[0].url, /\/tickets\?page=1&per_page=100&include=requester/)
  assert.equal((await client.listTickets(2, 100)).hasNextPage, false)
})

test('get: fetches one ticket and rejects invalid ids before calling Freshdesk', async () => {
  const { client, calls } = fakeFreshdesk([json(demoTickets[0])])
  assert.equal((await client.getTicket(1001)).subject, 'Checkout payment failed')
  assert.match(calls[0].url, /\/tickets\/1001\?include=requester$/)
  await assert.rejects(() => client.getTicket(-1), FreshdeskApiError)
  assert.equal(calls.length, 1)
})

test('get: 404 surfaces Freshdesk error details', async () => {
  const { client } = fakeFreshdesk([json({ description: 'Not found', errors: [{ message: 'Record not found' }] }, { status: 404 })])
  await assert.rejects(() => client.getTicket(9999), (error: unknown) => error instanceof FreshdeskApiError && error.status === 404 && /Record not found/.test(error.message))
})

// --- Search ---------------------------------------------------------------

test('search: builds a Freshdesk filter query and parses { results, total }', async () => {
  const { client, calls } = fakeFreshdesk([json({ results: demoTickets.slice(0, 1), total: 45 })])
  const result = await client.searchTickets({ status: 2, priority: 4, tag: 'payments', createdAfter: '2026-09-01' })
  const query = new URL(calls[0].url).searchParams.get('query')
  assert.equal(query, `"status:2 AND priority:4 AND tag:'payments' AND created_at:>'2026-09-01'"`)
  assert.equal(result.total, 45)
  assert.equal(result.hasNextPage, true)
  assert.equal(result.strategy, 'freshdesk_filter')
})

test('search: keyword-only search scans recent tickets because Freshdesk has no full-text filter', async () => {
  const { client, calls } = fakeFreshdesk([json(demoTickets)])
  const result = await client.searchTickets({ keyword: 'webhook' })
  assert.match(calls[0].url, /\/tickets\?page=1&per_page=100/)
  assert.deepEqual(result.tickets.map((ticket) => ticket.id), [1003])
  assert.equal(result.strategy, 'recent_tickets_keyword_scan')
})

test('search: rejects query injection through filter values', () => {
  assert.throws(() => buildFilterQuery({ tag: "payments' OR status:5" }), /tag may contain only/)
  assert.throws(() => buildFilterQuery({ createdAfter: "2026-01-01' OR 1" }), /YYYY-MM-DD/)
  assert.throws(() => buildFilterQuery({ status: 9 }), /status must be/)
})

// --- Rate limits and transient failures ----------------------------------

test('rate limit: retries 429 after Retry-After seconds, then succeeds', async () => {
  const { client, waits, calls } = fakeFreshdesk([new Response(null, { status: 429, headers: { 'retry-after': '2' } }), json(demoTickets)])
  assert.equal((await client.listTickets()).tickets.length, demoTickets.length)
  assert.deepEqual(waits, [2000])
  assert.equal(calls.length, 2)
})

test('rate limit: Retry-After longer than the wait budget fails fast with retryAfterSeconds', async () => {
  const { client, waits } = fakeFreshdesk([new Response(null, { status: 429, headers: { 'retry-after': '120' } })])
  await assert.rejects(() => client.getTicket(1001), (error: unknown) => error instanceof FreshdeskRateLimitError && error.retryAfterSeconds === 120)
  assert.deepEqual(waits, [])
})

test('rate limit: explicit error once retries are exhausted', async () => {
  const { client } = fakeFreshdesk([new Response(null, { status: 429 })], { maxRetries: 0 })
  await assert.rejects(() => client.getTicket(1001), FreshdeskRateLimitError)
})

test('transient 5xx: exponential backoff 1s, 2s then success', async () => {
  const { client, waits } = fakeFreshdesk([new Response(null, { status: 503 }), new Response(null, { status: 502 }), json(demoTickets[0])])
  assert.equal((await client.getTicket(1001)).id, 1001)
  assert.deepEqual(waits, [1000, 2000])
})

test('rate limit: records X-Ratelimit headers for observability', async () => {
  const { client } = fakeFreshdesk([json(demoTickets[0], { headers: { 'x-ratelimit-total': '200', 'x-ratelimit-remaining': '163' } })])
  await client.getTicket(1001)
  const status = client.getRateLimitStatus()
  assert.equal(status.total, 200)
  assert.equal(status.remaining, 163)
})

// --- Agent tool layer -----------------------------------------------------

test('tools: registry is read-only and write actions are rejected before any provider call', async () => {
  assert.deepEqual(freshdeskTools.map((tool) => tool.name), ['verify_connection', 'list_tickets', 'get_ticket', 'search_tickets'])
  assert.ok(freshdeskTools.every((tool) => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint))
  const client = new MockFreshdeskClient()
  for (const name of ['update_ticket', 'delete_ticket', 'reply_ticket']) {
    await assert.rejects(() => callFreshdeskTool(client, name, { id: 1001 }), /Unsupported tool/)
  }
})

test('tools: validates input and requires at least one search criterion', async () => {
  const client = new MockFreshdeskClient()
  await assert.rejects(() => callFreshdeskTool(client, 'get_ticket', { id: 'abc' }))
  await assert.rejects(() => callFreshdeskTool(client, 'search_tickets', {}), /at least one/)
  await assert.rejects(() => callFreshdeskTool(client, 'list_tickets', { perPage: 1000 }))
})

test('tools: agent view uses readable labels and redacts PII', async () => {
  const ticket = await callFreshdeskTool(new MockFreshdeskClient(), 'get_ticket', { id: 1001 }) as Record<string, unknown>
  assert.equal(ticket.status, 'open')
  assert.equal(ticket.priority, 'urgent')
  assert.deepEqual(ticket.requester, { id: 501, name: 'Demo Merchant', email: 'm***@example.test' })
  assert.match(String(ticket.description), /\[phone\]/)
  assert.doesNotMatch(String(ticket.description), /98765/)
  assert.equal(redactText('mail a.b@x.test now'), 'mail [email] now')
})

test('tools: mock search combines structured filters with keyword', async () => {
  const result = await callFreshdeskTool(new MockFreshdeskClient(), 'search_tickets', { tag: 'payments', status: 2, keyword: 'autopay' }) as { tickets: { id: number }[] }
  assert.deepEqual(result.tickets.map((ticket) => ticket.id), [1004])
})

// --- MCP protocol end to end ---------------------------------------------

test('mcp: an MCP client can list and call the tools over the protocol', async () => {
  const server = createFreshdeskMcpServer(new MockFreshdeskClient())
  const client = new Client({ name: 'agent-studio-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const { tools } = await client.listTools()
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['get_ticket', 'list_tickets', 'search_tickets', 'verify_connection'])

  const search = await client.callTool({ name: 'search_tickets', arguments: { keyword: 'refund' } })
  const payload = JSON.parse((search.content as { text: string }[])[0].text) as { tickets: { id: number }[] }
  assert.deepEqual(payload.tickets.map((ticket) => ticket.id), [1002])

  const missing = await client.callTool({ name: 'get_ticket', arguments: { id: 424242 } })
  assert.equal(missing.isError, true)
  await client.close()
})
