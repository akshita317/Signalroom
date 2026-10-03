import 'dotenv/config'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { z } from 'zod'
import { analyzeIncident, getFallbackAnalysis } from './analysis.js'
import { retrieveContext } from './retrieval.js'
import { approveInvestigation, createUser, getUser, listInvestigations, saveInvestigation, verifyUser } from './store.js'
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

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => response.status(500).json({ error: error.message }))
app.listen(port, () => console.log(`Signalroom API listening on http://127.0.0.1:${port}`))

function publicUser(user: User) { return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } }

export default app
