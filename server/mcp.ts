import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TICKET_PRIORITY, TICKET_STATUS, type FreshdeskTicket, type TicketSource } from './freshdesk.js'

const MAX_DESCRIPTION_CHARS = 2000

const listShape = {
  page: z.number().int().min(1).optional().describe('1-based page number. Default 1.'),
  perPage: z.number().int().min(1).max(100).optional().describe('Tickets per page, 1-100. Default 30.'),
}
const getShape = { id: z.number().int().positive().describe('Freshdesk ticket id.') }
const searchShape = {
  keyword: z.string().trim().min(1).max(200).optional().describe('Text matched against subject, description and tags.'),
  status: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional().describe('2=open, 3=pending, 4=resolved, 5=closed.'),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional().describe('1=low, 2=medium, 3=high, 4=urgent.'),
  tag: z.string().regex(/^[\w .-]{1,64}$/).optional().describe('Exact tag, e.g. "payments".'),
  createdAfter: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Only tickets created after this YYYY-MM-DD date.'),
  updatedAfter: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Only tickets updated after this YYYY-MM-DD date.'),
  page: z.number().int().min(1).max(10).optional().describe('Result page, 1-10 (30 results per page).'),
}

const listInput = z.object(listShape).strict()
const getInput = z.object(getShape).strict()
const searchInput = z.object(searchShape).strict().refine((value) => Object.entries(value).some(([key, field]) => key !== 'page' && field !== undefined), 'Provide at least one of keyword, status, priority, tag, createdAfter or updatedAfter')
const verifyInput = z.object({}).strict()

type ToolDefinition = { name: string; title: string; description: string; shape: z.ZodRawShape; input: z.ZodType; run: (source: TicketSource, input: never, options: AgentViewOptions) => Promise<unknown> }

const tools: ToolDefinition[] = [
  {
    name: 'verify_connection', title: 'Verify Freshdesk connection', shape: {}, input: verifyInput,
    description: 'Check that the configured Freshdesk credentials work and return the authenticated agent. Read-only. Call this first if other tools return authentication errors.',
    run: async (source) => ({ connected: true, agent: await source.verifyCredentials() }),
  },
  {
    name: 'list_tickets', title: 'List tickets', shape: listShape, input: listInput,
    description: 'List Freshdesk tickets, most recently updated first. Read-only. Freshdesk only returns tickets created in the last 30 days here; use search_tickets with createdAfter for older tickets. Use hasNextPage to decide whether to fetch the next page.',
    run: async (source, input: z.infer<typeof listInput>, options) => {
      const page = await source.listTickets(input.page, input.perPage)
      return { ...page, tickets: page.tickets.map((ticket) => toAgentTicket(ticket, options, false)) }
    },
  },
  {
    name: 'get_ticket', title: 'Get ticket', shape: getShape, input: getInput,
    description: 'Get one Freshdesk ticket by id, including its description (truncated to 2000 characters; emails and phone numbers redacted). Read-only.',
    run: async (source, input: z.infer<typeof getInput>, options) => toAgentTicket(await source.getTicket(input.id), options, true),
  },
  {
    name: 'search_tickets', title: 'Search tickets', shape: searchShape, input: searchInput,
    description: 'Find Freshdesk tickets by status, priority, tag, created/updated date and/or keyword. Read-only. Structured filters run on Freshdesk; keyword-only searches scan the 100 most recently updated tickets, so say so when reporting "no results". The strategy field reports which path ran.',
    run: async (source, input: z.infer<typeof searchInput>, options) => {
      const result = await source.searchTickets(input)
      return { ...result, tickets: result.tickets.map((ticket) => toAgentTicket(ticket, options, false)) }
    },
  },
]

/** JSON-Schema tool specification, served over HTTP for agent platforms that do not speak MCP. */
export const freshdeskTools = tools.map((tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: z.toJSONSchema(z.object(tool.shape).strict()),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}))

export type AgentViewOptions = { redactPii: boolean }
const defaultOptions: AgentViewOptions = { redactPii: true }

export async function callFreshdeskTool(source: TicketSource, name: unknown, input: unknown, options: AgentViewOptions = defaultOptions) {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Unsupported tool: ${String(name)}. This connector is read-only; available tools: ${tools.map((candidate) => candidate.name).join(', ')}`)
  return tool.run(source, tool.input.parse(input ?? {}) as never, options)
}

/** Real MCP server exposing the same read-only tools. Connect it to any transport (see mcp-stdio.ts). */
export function createFreshdeskMcpServer(source: TicketSource, options: AgentViewOptions = defaultOptions) {
  const server = new McpServer({ name: 'freshdesk-readonly', version: '1.0.0' })
  for (const tool of tools) {
    server.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (args: unknown) => {
      try {
        const result = await callFreshdeskTool(source, tool.name, args, options)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (error) {
        return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Freshdesk request failed' }] }
      }
    })
  }
  return server
}

/** Agent-facing view: readable labels, only the fields an agent needs, and PII minimisation. */
export function toAgentTicket(ticket: FreshdeskTicket, options: AgentViewOptions, includeDescription: boolean) {
  const description = ticket.description_text ?? stripHtml(ticket.description ?? '')
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: TICKET_STATUS[ticket.status] ?? `unknown(${ticket.status})`,
    priority: TICKET_PRIORITY[ticket.priority] ?? `unknown(${ticket.priority})`,
    type: ticket.type ?? null,
    tags: ticket.tags ?? [],
    requester: {
      id: ticket.requester?.id ?? ticket.requester_id ?? null,
      name: ticket.requester?.name ?? null,
      email: ticket.requester?.email ? (options.redactPii ? maskEmail(ticket.requester.email) : ticket.requester.email) : null,
    },
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    ...(includeDescription ? { description: truncate(options.redactPii ? redactText(description) : description, MAX_DESCRIPTION_CHARS) } : {}),
  }
}

export function redactText(text: string) {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\+?\d[\d\s-]{8,}\d/g, '[phone]')
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  return domain ? `${local.slice(0, 1)}***@${domain}` : '[email]'
}

function stripHtml(html: string) { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
function truncate(text: string, limit: number) { return text.length > limit ? `${text.slice(0, limit)}… [truncated]` : text }
