import { z } from 'zod'

export const EvidenceSchema = z.object({
  claim: z.string().min(1),
  source: z.string().min(1),
  supports: z.boolean(),
})

export const ActionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  owner: z.string().min(1),
  reversible: z.boolean(),
  requiresApproval: z.boolean(),
})

export const IncidentAnalysisSchema = z.object({
  summary: z.string().min(1),
  customerImpact: z.enum(['Low', 'Medium', 'High']),
  faultDomain: z.string().min(1),
  confidence: z.number().min(0).max(1),
  recommendedPosture: z.enum(['Observe', 'Investigate', 'Mitigate now']),
  primaryOwner: z.string().min(1),
  startedAt: z.string().min(1),
  likelyCause: z.string().min(1),
  evidence: z.array(EvidenceSchema).min(1),
  actions: z.array(ActionSchema).min(1),
  modelNotes: z.array(z.object({ title: z.string(), detail: z.string() })).min(1),
  guardrailPassed: z.boolean(),
})

export type IncidentAnalysis = z.infer<typeof IncidentAnalysisSchema>

export type User = {
  id: string
  name: string
  email: string
  passwordHash: string
  createdAt: string
}

export type Investigation = {
  id: string
  userId: string
  incident: string
  analysis: IncidentAnalysis
  status: 'draft' | 'pending_approval' | 'approved'
  createdAt: string
  approvedAt?: string
}
