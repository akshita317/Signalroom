import OpenAI from 'openai'
import { contextAsPrompt, type RetrievalContext } from './retrieval.js'
import { IncidentAnalysisSchema, type IncidentAnalysis } from './types.js'

const fallbackAnalysis: IncidentAnalysis = {
  summary: 'Checkout failures are concentrated in eu-west-1 and correlate with a Redis cache hit-rate collapse immediately after the payments-service deploy. The tax fix is valuable, but customer impact is active and measurable.',
  customerImpact: 'High',
  faultDomain: 'Payments',
  confidence: 0.89,
  recommendedPosture: 'Mitigate now',
  primaryOwner: 'Jordan Davis',
  startedAt: '14:07 UTC',
  likelyCause: 'Cache invalidation or connection pool regression in payments-service@2024.09.18',
  evidence: [
    { claim: 'Redis hit rate dropped from 94% to 61%.', source: 'Incident report', supports: true },
    { claim: 'The 5xx increase began after the payments-service deploy.', source: 'Deploy timeline', supports: true },
    { claim: 'Database CPU remains normal.', source: 'Incident report', supports: false },
  ],
  actions: [
    { id: 'pause-regional-traffic', title: 'Pause eu-west-1 traffic to payments-service', owner: 'Jordan Davis', reversible: true, requiresApproval: true },
    { id: 'compare-redis-config', title: 'Compare Redis client config with last known good', owner: 'Priya Nair', reversible: true, requiresApproval: false },
    { id: 'prepare-rollback', title: 'Prepare rollback with tax-fix validation', owner: 'Akshita Kumar', reversible: true, requiresApproval: true },
  ],
  modelNotes: [
    { title: 'Temporal match', detail: 'Deploy and error spike are three minutes apart.' },
    { title: 'Negative evidence', detail: 'Normal database CPU lowers the likelihood of database saturation.' },
    { title: 'Reversible first', detail: 'Regional traffic isolation limits harm without immediately losing the tax fix.' },
  ],
  guardrailPassed: true,
}

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

export async function analyzeIncident(incident: string, context: RetrievalContext) {
  if (!client) return { analysis: IncidentAnalysisSchema.parse(fallbackAnalysis), provider: 'demo-fallback' as const, context }
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `You are Signalroom, an incident response copilot. Return only valid JSON matching this shape: summary string, customerImpact Low|Medium|High, faultDomain string, confidence number 0..1, recommendedPosture Observe|Investigate|Mitigate now, primaryOwner string, startedAt string, likelyCause string, evidence array of {claim, source, supports}, actions array of {id,title,owner,reversible,requiresApproval}, modelNotes array of {title,detail}, guardrailPassed boolean. Every recommendation must be reversible or requiresApproval=true. Never claim an action was executed. Use the retrieved context below:\n${contextAsPrompt(context)}` },
      { role: 'user', content: incident },
    ],
  })
  const raw = response.choices[0]?.message.content
  if (!raw) throw new Error('The model returned an empty analysis')
  return { analysis: IncidentAnalysisSchema.parse(JSON.parse(raw)), provider: 'openai' as const, context }
}

export function getFallbackAnalysis() { return fallbackAnalysis }
