import { Buffer } from 'node:buffer'

export type FreshdeskTicket = {
  id: number
  subject: string
  description?: string | null
  description_text?: string | null
  status: number
  priority: number
  type?: string | null
  requester_id?: number
  requester?: { id?: number; name?: string; email?: string }
  created_at: string
  updated_at: string
  tags?: string[]
}

export type TicketPage = {
  tickets: FreshdeskTicket[]
  page: number
  perPage: number
  hasNextPage: boolean
}

export type TicketSearchFilters = {
  /** Free-text match on subject, description and tags. Freshdesk's filter API has no full-text search, so this is applied by the connector. */
  keyword?: string
  status?: number
  priority?: number
  tag?: string
  createdAfter?: string
  updatedAfter?: string
  page?: number
}

export type TicketSearchResult = {
  tickets: FreshdeskTicket[]
  total: number
  page: number
  hasNextPage: boolean
  /** How the search ran, so an agent can explain the coverage of its answer. */
  strategy: 'freshdesk_filter' | 'freshdesk_filter+keyword' | 'recent_tickets_keyword_scan' | 'mock'
}

export type RateLimitStatus = { total: number | null; remaining: number | null; observedAt: string | null }

export type FreshdeskClientOptions = {
  domain: string
  apiKey: string
  fetchImpl?: typeof fetch
  maxRetries?: number
  /** Longest Retry-After the client will wait out. Longer waits surface as FreshdeskRateLimitError so the agent can tell the user instead of hanging. */
  maxRetryWaitSeconds?: number
  timeoutMs?: number
  sleep?: (milliseconds: number) => Promise<void>
}

export class FreshdeskRateLimitError extends Error {
  readonly retryAfterSeconds: number | null

  constructor(retryAfterSeconds: number | null) {
    super(retryAfterSeconds === null ? 'Freshdesk rate limit exceeded' : `Freshdesk rate limit exceeded; retry after ${retryAfterSeconds}s`)
    this.name = 'FreshdeskRateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class FreshdeskApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'FreshdeskApiError'
    this.status = status
  }
}

export class FreshdeskAuthError extends FreshdeskApiError {
  constructor(status: number) {
    super(status, status === 401
      ? 'Freshdesk rejected the API key (HTTP 401). Check FRESHDESK_API_KEY and FRESHDESK_DOMAIN.'
      : 'Freshdesk denied access (HTTP 403). The API key\'s agent lacks permission for this resource or the plan does not include it.')
    this.name = 'FreshdeskAuthError'
  }
}

export interface TicketSource {
  listTickets(page?: number, perPage?: number): Promise<TicketPage>
  getTicket(id: number): Promise<FreshdeskTicket>
  searchTickets(filters: TicketSearchFilters): Promise<TicketSearchResult>
  verifyCredentials(): Promise<{ agentId: number | null; name: string | null; email: string | null }>
}

export const TICKET_STATUS: Record<number, string> = { 2: 'open', 3: 'pending', 4: 'resolved', 5: 'closed' }
export const TICKET_PRIORITY: Record<number, string> = { 1: 'low', 2: 'medium', 3: 'high', 4: 'urgent' }

const DEFAULT_PER_PAGE = 30
const MAX_PER_PAGE = 100
// Freshdesk's filter search returns 30 results per page and at most 10 pages.
const SEARCH_PAGE_SIZE = 30
const SEARCH_MAX_PAGE = 10
const KEYWORD_SCAN_SIZE = 100
const SAFE_TAG = /^[\w .-]{1,64}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export class FreshdeskClient implements TicketSource {
  private readonly fetchImpl: typeof fetch
  private readonly maxRetries: number
  private readonly maxRetryWaitSeconds: number
  private readonly timeoutMs: number
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly baseUrl: string
  private rateLimit: RateLimitStatus = { total: null, remaining: null, observedAt: null }

  constructor(private readonly options: FreshdeskClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.maxRetries = options.maxRetries ?? 3
    this.maxRetryWaitSeconds = options.maxRetryWaitSeconds ?? 30
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
    const normalizedDomain = options.domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!/^[a-z0-9-]+\.freshdesk\.com$/i.test(normalizedDomain)) throw new Error(`FRESHDESK_DOMAIN must look like yourcompany.freshdesk.com, got "${options.domain}"`)
    this.baseUrl = `https://${normalizedDomain}/api/v2`
  }

  getRateLimitStatus(): RateLimitStatus { return { ...this.rateLimit } }

  async verifyCredentials() {
    const { body } = await this.request<{ id?: number; contact?: { name?: string; email?: string } }>('/agents/me')
    return { agentId: body.id ?? null, name: body.contact?.name ?? null, email: body.contact?.email ?? null }
  }

  async listTickets(page = 1, perPage = DEFAULT_PER_PAGE): Promise<TicketPage> {
    const safePage = Math.max(1, Math.trunc(page) || 1)
    const safePerPage = clampPerPage(perPage)
    const { body, headers } = await this.request<FreshdeskTicket[]>(`/tickets?page=${safePage}&per_page=${safePerPage}&include=requester&order_by=updated_at&order_type=desc`)
    // Freshdesk signals another page through the Link header; fall back to a full page as the hint.
    const link = headers.get('link')
    const hasNextPage = link ? /rel="?next"?/.test(link) : body.length === safePerPage
    return { tickets: body, page: safePage, perPage: safePerPage, hasNextPage }
  }

  async getTicket(id: number) {
    if (!Number.isInteger(id) || id <= 0) throw new FreshdeskApiError(400, 'Ticket id must be a positive integer')
    return (await this.request<FreshdeskTicket>(`/tickets/${id}?include=requester`)).body
  }

  async searchTickets(filters: TicketSearchFilters): Promise<TicketSearchResult> {
    const query = buildFilterQuery(filters)
    const keyword = filters.keyword?.trim().toLowerCase() ?? ''
    const page = Math.min(Math.max(1, Math.trunc(filters.page ?? 1)), SEARCH_MAX_PAGE)

    if (!query) {
      // No structured filter: Freshdesk cannot do full-text search over the API, so scan the most recently updated tickets.
      if (!keyword) return { tickets: [], total: 0, page: 1, hasNextPage: false, strategy: 'recent_tickets_keyword_scan' }
      const recent = await this.listTickets(1, KEYWORD_SCAN_SIZE)
      const tickets = recent.tickets.filter((ticket) => matchesKeyword(ticket, keyword))
      return { tickets, total: tickets.length, page: 1, hasNextPage: false, strategy: 'recent_tickets_keyword_scan' }
    }

    const params = new URLSearchParams({ query: `"${query}"`, page: String(page) })
    const { body } = await this.request<{ results: FreshdeskTicket[]; total: number }>(`/search/tickets?${params.toString()}`)
    const results = body.results ?? []
    const tickets = keyword ? results.filter((ticket) => matchesKeyword(ticket, keyword)) : results
    return {
      tickets,
      total: keyword ? tickets.length : body.total ?? results.length,
      page,
      hasNextPage: page < SEARCH_MAX_PAGE && page * SEARCH_PAGE_SIZE < (body.total ?? 0),
      strategy: keyword ? 'freshdesk_filter+keyword' : 'freshdesk_filter',
    }
  }

  private async request<T>(path: string): Promise<{ body: T; headers: Headers }> {
    const authorization = Buffer.from(`${this.options.apiKey}:X`).toString('base64')
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json', Authorization: `Basic ${authorization}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      this.recordRateLimit(response.headers)
      if (response.ok) return { body: await response.json() as T, headers: response.headers }

      if (response.status === 401 || response.status === 403) throw new FreshdeskAuthError(response.status)
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'))
      const retryable = response.status === 429 || response.status >= 500
      const backoffSeconds = retryAfter ?? Math.min(2 ** attempt, this.maxRetryWaitSeconds)
      if (retryable && attempt < this.maxRetries && backoffSeconds <= this.maxRetryWaitSeconds) {
        await this.sleep(backoffSeconds * 1000)
        continue
      }
      if (response.status === 429) throw new FreshdeskRateLimitError(retryAfter)
      throw new FreshdeskApiError(response.status, await describeFailure(response))
    }
    throw new Error('Freshdesk request retry loop ended unexpectedly')
  }

  private recordRateLimit(headers: Headers) {
    const remaining = headers.get('x-ratelimit-remaining')
    if (remaining === null) return
    this.rateLimit = { total: toNumberOrNull(headers.get('x-ratelimit-total')), remaining: toNumberOrNull(remaining), observedAt: new Date().toISOString() }
  }
}

export class MockFreshdeskClient implements TicketSource {
  constructor(private readonly tickets: FreshdeskTicket[] = demoTickets) {}

  async verifyCredentials() { return { agentId: 0, name: 'Mock agent', email: 'agent@example.test' } }

  async listTickets(page = 1, perPage = DEFAULT_PER_PAGE): Promise<TicketPage> {
    const safePage = Math.max(1, Math.trunc(page) || 1)
    const safePerPage = clampPerPage(perPage)
    const start = (safePage - 1) * safePerPage
    const sorted = [...this.tickets].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return { tickets: sorted.slice(start, start + safePerPage), page: safePage, perPage: safePerPage, hasNextPage: start + safePerPage < sorted.length }
  }

  async getTicket(id: number) {
    const ticket = this.tickets.find((candidate) => candidate.id === id)
    if (!ticket) throw new FreshdeskApiError(404, `Ticket ${id} not found`)
    return ticket
  }

  async searchTickets(filters: TicketSearchFilters): Promise<TicketSearchResult> {
    buildFilterQuery(filters) // same validation as live mode
    const keyword = filters.keyword?.trim().toLowerCase() ?? ''
    const tickets = this.tickets.filter((ticket) =>
      (filters.status === undefined || ticket.status === filters.status)
      && (filters.priority === undefined || ticket.priority === filters.priority)
      && (!filters.tag || (ticket.tags ?? []).includes(filters.tag))
      && (!filters.createdAfter || ticket.created_at.slice(0, 10) > filters.createdAfter)
      && (!filters.updatedAfter || ticket.updated_at.slice(0, 10) > filters.updatedAfter)
      && (!keyword || matchesKeyword(ticket, keyword)))
    return { tickets, total: tickets.length, page: 1, hasNextPage: false, strategy: 'mock' }
  }
}

/** Builds a Freshdesk filter query such as `status:2 AND tag:'payments'`. Values are validated, never interpolated raw. */
export function buildFilterQuery(filters: TicketSearchFilters) {
  const clauses: string[] = []
  if (filters.status !== undefined) {
    if (!(filters.status in TICKET_STATUS)) throw new FreshdeskApiError(400, 'status must be 2 (open), 3 (pending), 4 (resolved) or 5 (closed)')
    clauses.push(`status:${filters.status}`)
  }
  if (filters.priority !== undefined) {
    if (!(filters.priority in TICKET_PRIORITY)) throw new FreshdeskApiError(400, 'priority must be 1 (low), 2 (medium), 3 (high) or 4 (urgent)')
    clauses.push(`priority:${filters.priority}`)
  }
  if (filters.tag) {
    if (!SAFE_TAG.test(filters.tag)) throw new FreshdeskApiError(400, 'tag may contain only letters, numbers, spaces, dots, dashes and underscores')
    clauses.push(`tag:'${filters.tag}'`)
  }
  for (const [field, value] of [['created_at', filters.createdAfter], ['updated_at', filters.updatedAfter]] as const) {
    if (!value) continue
    if (!ISO_DATE.test(value)) throw new FreshdeskApiError(400, `${field} filter must be a YYYY-MM-DD date`)
    clauses.push(`${field}:>'${value}'`)
  }
  return clauses.join(' AND ')
}

function matchesKeyword(ticket: FreshdeskTicket, keyword: string) {
  return `${ticket.subject} ${ticket.description_text ?? ticket.description ?? ''} ${ticket.tags?.join(' ') ?? ''}`.toLowerCase().includes(keyword)
}

function clampPerPage(perPage: number) { return Math.min(Math.max(Math.trunc(perPage) || DEFAULT_PER_PAGE, 1), MAX_PER_PAGE) }

function parseRetryAfter(value: string | null) {
  if (!value) return null
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

function toNumberOrNull(value: string | null) {
  const parsed = Number(value)
  return value !== null && Number.isFinite(parsed) ? parsed : null
}

async function describeFailure(response: Response) {
  try {
    const body = await response.json() as { description?: string; errors?: { field?: string; message?: string }[] }
    const details = body.errors?.map((error) => [error.field, error.message].filter(Boolean).join(': ')).join('; ')
    return `Freshdesk request failed with HTTP ${response.status}${details ? ` (${details})` : body.description ? ` (${body.description})` : ''}`
  } catch {
    return `Freshdesk request failed with HTTP ${response.status}`
  }
}

// Fictional records only. Addresses use the reserved example.test domain.
export const demoTickets: FreshdeskTicket[] = [
  { id: 1001, subject: 'Checkout payment failed', description_text: 'Several customers cannot complete checkout with UPI. Contact me at +91 98765 43210.', status: 2, priority: 4, type: 'Incident', requester: { id: 501, name: 'Demo Merchant', email: 'merchant@example.test' }, created_at: '2026-09-30T09:00:00Z', updated_at: '2026-09-30T09:15:00Z', tags: ['payments', 'checkout'] },
  { id: 1002, subject: 'Refund status question', description_text: 'Merchant needs the status of a recent refund for order ORD-2231.', status: 2, priority: 2, type: 'Question', requester: { id: 502, name: 'Demo Operator', email: 'operator@example.test' }, created_at: '2026-09-29T12:00:00Z', updated_at: '2026-09-29T12:30:00Z', tags: ['refunds'] },
  { id: 1003, subject: 'Webhook delivery delayed', description_text: 'Order webhooks arrived several minutes late.', status: 3, priority: 3, type: 'Incident', requester: { id: 501, name: 'Demo Merchant', email: 'merchant@example.test' }, created_at: '2026-09-28T14:00:00Z', updated_at: '2026-09-28T16:00:00Z', tags: ['webhooks', 'orders'] },
  { id: 1004, subject: 'Autopay mandate not debited', description_text: 'Subscription autopay for customer C-118 failed twice this week.', status: 2, priority: 3, type: 'Incident', requester: { id: 503, name: 'Demo Subscriptions Lead', email: 'subs@example.test' }, created_at: '2026-09-27T08:20:00Z', updated_at: '2026-09-30T07:45:00Z', tags: ['payments', 'autopay'] },
  { id: 1005, subject: 'Settlement report mismatch', description_text: 'Settlement total for 25 Sep differs from dashboard by a small amount.', status: 4, priority: 2, type: 'Problem', requester: { id: 504, name: 'Demo Finance', email: 'finance@example.test' }, created_at: '2026-09-25T10:00:00Z', updated_at: '2026-09-26T11:00:00Z', tags: ['settlements'] },
  { id: 1006, subject: 'How do I add a team member?', description_text: 'Need to invite a new support agent to the dashboard.', status: 5, priority: 1, type: 'Question', requester: { id: 502, name: 'Demo Operator', email: 'operator@example.test' }, created_at: '2026-09-20T09:00:00Z', updated_at: '2026-09-21T09:00:00Z', tags: ['account'] },
]
