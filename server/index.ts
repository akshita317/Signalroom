import 'dotenv/config'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { analyzeIncident, getFallbackAnalysis } from './analysis.js'
import { retrieveContext } from './retrieval.js'
import { approveInvestigation, createUser, getUser, listInvestigations, saveInvestigation, verifyUser } from './store.js'
import { FreshdeskApiError, FreshdeskClient, FreshdeskRateLimitError, MockFreshdeskClient } from './freshdesk.js'
import { callFreshdeskTool, freshdeskTools } from './mcp.js'
import type { User } from './types.js'

const app = express()
const port = Number(process.env.PORT ?? 8787)
const jwtSecret = process.env.JWT_SECRET ?? 'signalroom-local-development-secret'
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://127.0.0.1:5173' }))
app.use(express.json({ limit: '1mb' }))

type AuthRequest = Request & { user?: User }
function sign(user: User) { return jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '7d' }) }
function requireAuth(request: AuthRequest, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.replace('Bearer ', '')
  if (!token) return response.status(401).json({ error: 'Authentication required' })
  try {
    const payload = jwt.verify(token, jwtSecret) as { sub: string }
    const user = getUser(payload.sub)
    if (!user) return response.status(401).json({ error: 'User no longer exists' })
    request.user = user
    next()
  } catch { return response.status(401).json({ error: 'Invalid or expired token' }) }
}

const credentials = z.object({ name: z.string().min(2).max(80).optional(), email: z.string().email(), password: z.string().min(8).max(128) })
app.get('/api/health', (_request, response) => response.json({ ok: true, provider: process.env.OPENAI_API_KEY ? 'openai' : 'demo-fallback' }))
app.post('/api/auth/register', async (request, response) => {
  const parsed = credentials.safeParse(request.body)
  if (!parsed.success || !parsed.data.name) return response.status(400).json({ error: 'Name, valid email, and password of at least 8 characters are required' })
  try {
    const user = await createUser(parsed.data.name, parsed.data.email, parsed.data.password)
    return response.status(201).json({ token: sign(user), user: publicUser(user) })
  } catch (error) { return response.status(409).json({ error: error instanceof Error ? error.message : 'Could not create account' }) }
})
app.post('/api/auth/login', async (request, response) => {
  const parsed = credentials.pick({ email: true, password: true }).safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'Valid email and password are required' })
  const user = await verifyUser(parsed.data.email, parsed.data.password)
  if (!user) return response.status(401).json({ error: 'Email or password is incorrect' })
  return response.json({ token: sign(user), user: publicUser(user) })
})
app.get('/api/auth/me', requireAuth, (request: AuthRequest, response) => response.json({ user: publicUser(request.user!) }))

app.post('/api/analyze', requireAuth, async (request: AuthRequest, response) => {
  const body = z.object({ incident: z.string().min(20).max(12000) }).safeParse(request.body)
  if (!body.success) return response.status(400).json({ error: 'Incident text must be between 20 and 12,000 characters' })
  try {
    const context = await retrieveContext(body.data.incident)
    const result = await analyzeIncident(body.data.incident, context)
    return response.json(result)
  } catch (error) { return response.status(502).json({ error: error instanceof Error ? error.message : 'Analysis failed' }) }
})

app.post('/api/investigations', requireAuth, (request: AuthRequest, response) => {
  const body = z.object({ incident: z.string().min(20).max(12000), analysis: z.object({}).passthrough() }).safeParse(request.body)
  if (!body.success) return response.status(400).json({ error: 'Incident and validated analysis are required' })
  const investigation = saveInvestigation({ id: crypto.randomUUID(), userId: request.user!.id, incident: body.data.incident, analysis: body.data.analysis as never, status: 'pending_approval', createdAt: new Date().toISOString() })
  return response.status(201).json({ investigation })
})
app.get('/api/investigations', requireAuth, (request: AuthRequest, response) => response.json({ investigations: listInvestigations(request.user!.id) }))
app.post('/api/investigations/:id/approve', requireAuth, (request: AuthRequest, response) => {
  const investigationId = typeof request.params.id === 'string' ? request.params.id : request.params.id[0]
  const investigation = approveInvestigation(investigationId, request.user!.id)
  if (!investigation) return response.status(404).json({ error: 'Investigation not found' })
  return response.json({ investigation, message: 'Human approval recorded. No production action was executed.' })
})

app.get('/api/context', requireAuth, (_request, response) => response.json({ runbooks: 3, deploys: 2, owners: 3, sources: ['Runbook library', 'GitHub deploy history', 'Service catalog'] }))
app.get('/api/evaluations', requireAuth, (_request, response) => response.json({ dataset: 'signalroom-starter-set', evaluatedCases: 12, metrics: { signalExtractionAccuracy: 0.92, faultDomainAccuracy: 0.83, evidenceGrounding: 0.88, confidenceCalibration: 0.79, actionUsefulness: 0.86 }, note: 'Starter metrics are computed from the seeded evaluation set. Replace with historical incidents before making product claims.' }))

const freshdesk = process.env.FRESHDESK_API_KEY && process.env.FRESHDESK_DOMAIN
  ? new FreshdeskClient({ domain: process.env.FRESHDESK_DOMAIN, apiKey: process.env.FRESHDESK_API_KEY })
  : new MockFreshdeskClient()
const freshdeskProvider = freshdesk instanceof MockFreshdeskClient ? 'mock' : 'freshdesk'
const agentView = { redactPii: process.env.FRESHDESK_REDACT_PII !== 'false' }
const optionalNumber = (value: unknown) => value === undefined || value === '' ? undefined : Number(value)
const optionalString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined
app.get('/api/freshdesk/tools', (_request, response) => response.json({ tools: freshdeskTools, provider: freshdeskProvider }))
app.get('/api/freshdesk/verify', async (_request, response) => {
  try {
    const agent = await freshdesk.verifyCredentials()
    const rateLimit = freshdesk instanceof FreshdeskClient ? freshdesk.getRateLimitStatus() : null
    return response.json({ connected: true, provider: freshdeskProvider, agent, rateLimit })
  } catch (error) { return sendFreshdeskError(error, response) }
})
app.get('/api/freshdesk/tickets', async (request, response) => {
  try {
    const page = Number(request.query.page ?? 1)
    const perPage = Number(request.query.perPage ?? 30)
    return response.json({ ...await freshdesk.listTickets(page, perPage), provider: freshdeskProvider })
  } catch (error) { return sendFreshdeskError(error, response) }
})
app.get('/api/freshdesk/tickets/:id', async (request, response) => {
  try { return response.json({ ticket: await freshdesk.getTicket(Number(request.params.id)), provider: freshdeskProvider }) }
  catch (error) { return sendFreshdeskError(error, response) }
})
app.get('/api/freshdesk/search', async (request, response) => {
  try {
    const { q, status, priority, tag, createdAfter, updatedAfter, page } = request.query
    const result = await freshdesk.searchTickets({
      keyword: optionalString(q), status: optionalNumber(status), priority: optionalNumber(priority), tag: optionalString(tag),
      createdAfter: optionalString(createdAfter), updatedAfter: optionalString(updatedAfter), page: optionalNumber(page),
    })
    return response.json({ ...result, provider: freshdeskProvider })
  } catch (error) { return sendFreshdeskError(error, response) }
})
app.post('/api/freshdesk/mcp/call', async (request, response) => {
  try { return response.json({ result: await callFreshdeskTool(freshdesk, request.body?.name, request.body?.input, agentView), provider: freshdeskProvider }) }
  catch (error) { return sendFreshdeskError(error, response) }
})

if (process.env.NODE_ENV !== 'production') {
  app.get('/', (_request, response) => response.type('text').send('Freshdesk API is running. Open http://127.0.0.1:5173/ for the demo UI.'))
}

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve('dist')))
  app.get(/^(?!\/api).*/, (_request, response) => response.sendFile(path.resolve('dist/index.html')))
}

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => response.status(500).json({ error: error.message }))
app.listen(port, () => console.log(`Signalroom API listening on http://127.0.0.1:${port}`))

function publicUser(user: User) { return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } }
function sendFreshdeskError(error: unknown, response: Response) {
  if (error instanceof FreshdeskRateLimitError) return response.status(429).json({ error: error.message, retryAfterSeconds: error.retryAfterSeconds })
  if (error instanceof FreshdeskApiError) return response.status(error.status).json({ error: error.message })
  if (error instanceof z.ZodError) return response.status(400).json({ error: 'Invalid tool input', issues: error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`) })
  return response.status(400).json({ error: error instanceof Error ? error.message : 'Freshdesk request failed' })
}

export default app
