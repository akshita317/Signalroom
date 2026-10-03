export type User = { id: string; name: string; email: string; createdAt: string }
export type Analysis = {
  summary: string; customerImpact: 'Low' | 'Medium' | 'High'; faultDomain: string; confidence: number; recommendedPosture: 'Observe' | 'Investigate' | 'Mitigate now'; primaryOwner: string; startedAt: string; likelyCause: string
  evidence: { claim: string; source: string; supports: boolean }[]
  actions: { id: string; title: string; owner: string; reversible: boolean; requiresApproval: boolean }[]
  modelNotes: { title: string; detail: string }[]; guardrailPassed: boolean
}

const tokenKey = 'signalroom_token'
const request = async <T>(path: string, options: RequestInit = {}) => {
  const token = localStorage.getItem(tokenKey)
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } })
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'Request failed')
  return body
}

export async function register(name: string, email: string, password: string) {
  const result = await request<{ token: string; user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) })
  localStorage.setItem(tokenKey, result.token)
  return result.user
}
export async function login(email: string, password: string) {
  const result = await request<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  localStorage.setItem(tokenKey, result.token)
  return result.user
}
export function logout() { localStorage.removeItem(tokenKey) }
export function isAuthenticated() { return Boolean(localStorage.getItem(tokenKey)) }
export async function analyzeIncident(incident: string) { return request<{ analysis: Analysis; provider: string; context: { runbooks: string[]; deploys: string[]; owners: string[] } }>('/api/analyze', { method: 'POST', body: JSON.stringify({ incident }) }) }
export async function saveInvestigation(incident: string, analysis: Analysis) { return request<{ investigation: { id: string; status: string } }>('/api/investigations', { method: 'POST', body: JSON.stringify({ incident, analysis }) }) }
export async function approveInvestigation(id: string) { return request<{ message: string }>(`/api/investigations/${id}/approve`, { method: 'POST' }) }
