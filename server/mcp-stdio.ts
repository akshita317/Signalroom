import 'dotenv/config'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { FreshdeskClient, MockFreshdeskClient } from './freshdesk.js'
import { createFreshdeskMcpServer } from './mcp.js'

// stdout carries the MCP protocol, so all logging goes to stderr.
const { FRESHDESK_DOMAIN, FRESHDESK_API_KEY, FRESHDESK_REDACT_PII } = process.env
const source = FRESHDESK_DOMAIN && FRESHDESK_API_KEY
  ? new FreshdeskClient({ domain: FRESHDESK_DOMAIN, apiKey: FRESHDESK_API_KEY })
  : new MockFreshdeskClient()

if (source instanceof FreshdeskClient) {
  try {
    const agent = await source.verifyCredentials()
    console.error(`[freshdesk-mcp] authenticated to ${FRESHDESK_DOMAIN} as ${agent.name ?? `agent ${agent.agentId}`}`)
  } catch (error) {
    console.error(`[freshdesk-mcp] credential check failed: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
} else {
  console.error('[freshdesk-mcp] FRESHDESK_DOMAIN/FRESHDESK_API_KEY not set; serving fictional mock tickets')
}

const server = createFreshdeskMcpServer(source, { redactPii: FRESHDESK_REDACT_PII !== 'false' })
await server.connect(new StdioServerTransport())
