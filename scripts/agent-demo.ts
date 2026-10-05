// Plays the part of an Agent Studio agent: spawns the stdio MCP server and walks a support-triage scenario.
// Runs against fictional mock tickets by default, or a live Freshdesk account if FRESHDESK_DOMAIN/FRESHDESK_API_KEY are set.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', 'server/mcp-stdio.ts'],
  env: { ...process.env } as Record<string, string>,
  stderr: 'inherit',
})
const client = new Client({ name: 'agent-demo', version: '1.0.0' })
await client.connect(transport)

async function step(title: string, name: string, args: Record<string, unknown> = {}) {
  console.log(`\n▶ ${title}\n  tool: ${name} ${JSON.stringify(args)}`)
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as { type: string; text: string }[]).map((part) => part.text).join('\n')
  console.log(`  ${result.isError ? '✖ error' : '✔ ok'}\n${indent(text.length > 1500 ? `${text.slice(0, 1500)}\n…` : text)}`)
  return result.isError ? null : JSON.parse(text)
}

const indent = (text: string) => text.split('\n').map((line) => `    ${line}`).join('\n')

const { tools } = await client.listTools()
console.log(`Connected. Tools: ${tools.map((tool) => tool.name).join(', ')}`)

await step('1. Confirm credentials', 'verify_connection')
const page = await step('2. List the most recently updated tickets', 'list_tickets', { perPage: 3 })
await step('3. Find open tickets tagged payments (Freshdesk filter)', 'search_tickets', { status: 2, tag: 'payments' })
await step('4. Keyword search', 'search_tickets', { keyword: 'refund' })
const firstId = page?.tickets?.[0]?.id ?? 1001
await step(`5. Read ticket #${firstId} (PII redacted)`, 'get_ticket', { id: firstId })
await step('6. Invalid input is rejected', 'search_tickets', { tag: "payments' OR status:5" })
await step('7. Write actions do not exist', 'update_ticket', { id: firstId, status: 5 })

await client.close()
