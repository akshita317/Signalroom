import { useState } from 'react'
import { AlertTriangle, ArrowUpRight, BarChart3, Check, ChevronDown, CircleHelp, ClipboardCheck, FileText, GitBranch, Inbox, LayoutDashboard, MessageSquareText, Plus, Search, Settings2, ShieldCheck, Sparkles, Timer, Users, X } from 'lucide-react'
import { analyzeIncident as analyzeWithBackend, approveInvestigation, isAuthenticated, login, register, saveInvestigation, type Analysis, type User } from './api'
import './App.css'

const sampleIncident = `Checkout API latency spiked to 4.2s at 14:07 UTC. We saw a 38% increase in 5xx responses from eu-west-1 after the payments-service deploy 2024.09.18. Database CPU is normal, but the Redis hit rate dropped from 94% to 61%. Customer support has 17 reports of failed checkout attempts. Rollback is available but would revert the tax calculation fix.`
const navItems = [
  { label: 'Command center', icon: LayoutDashboard, active: true },
  { label: 'Incident inbox', icon: Inbox, count: '4' },
  { label: 'Runbook library', icon: FileText },
  { label: 'Team workload', icon: Users },
]
const signals = [
  { label: 'Customer impact', value: 'High', tone: 'danger', detail: '17 reports · 38% errors' },
  { label: 'Likely fault domain', value: 'Payments', tone: 'warn', detail: 'eu-west-1 · post-deploy' },
  { label: 'Evidence quality', value: 'Strong', tone: 'good', detail: '6 corroborating signals' },
]

function App() {
  const [incident, setIncident] = useState(sampleIncident)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [hasAnalysis, setHasAnalysis] = useState(true)
  const [activeTab, setActiveTab] = useState('Brief')
  const [isSaved, setIsSaved] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [approvalMessage, setApprovalMessage] = useState('')
  const [authOpen, setAuthOpen] = useState(!isAuthenticated())
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authFields, setAuthFields] = useState({ name: '', email: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [user, setUser] = useState<User | null>(null)

  const analyze = async () => {
    if (!isAuthenticated()) { setAuthOpen(true); return }
    setHasAnalysis(false)
    try {
      const result = await analyzeWithBackend(incident)
      setAnalysis(result.analysis)
      setHasAnalysis(true)
      setApprovalMessage(result.provider === 'demo-fallback' ? 'Demo provider active. Add OPENAI_API_KEY to use the real LLM.' : 'Live LLM analysis grounded in retrieved context.')
    } catch (error) {
      setHasAnalysis(true)
      setApprovalMessage(error instanceof Error ? error.message : 'Analysis failed')
    }
  }

  const loadSample = () => { setIncident(sampleIncident); setAnalysis(null); setHasAnalysis(true) }
  const saveIncident = async () => {
    if (!isAuthenticated()) { setAuthOpen(true); return }
    if (!analysis) { await analyze(); return }
    const result = await saveInvestigation(incident, analysis)
    setSavedId(result.investigation.id)
    setIsSaved(true)
    setShowToast(true)
    window.setTimeout(() => setShowToast(false), 2400)
  }
  const approveLatest = async () => {
    if (!savedId) { setApprovalMessage('Save the investigation before requesting human approval.'); return }
    const result = await approveInvestigation(savedId)
    setApprovalMessage(result.message)
  }
  const submitAuth = async () => {
    try {
      setAuthError('')
      const authenticatedUser = authMode === 'login' ? await login(authFields.email, authFields.password) : await register(authFields.name, authFields.email, authFields.password)
      setUser(authenticatedUser)
      setAuthOpen(false)
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Authentication failed') }
  }

  const currentSummary = analysis?.summary ?? 'Checkout failures are concentrated in eu-west-1 and correlate with a Redis cache hit-rate collapse immediately after the payments-service deploy. The tax fix is valuable, but customer impact is active and measurable.'
  const currentCause = analysis?.likelyCause ?? 'Cache invalidation or connection pool regression in payments-service@2024.09.18'
  const currentOwner = analysis?.primaryOwner ?? 'Jordan Davis'
  const currentConfidence = analysis ? `${Math.round(analysis.confidence * 100)}% confidence` : '89% confidence'
  const currentActions = analysis?.actions ?? [
    { id: 'pause', title: 'Pause eu-west-1 traffic to payments-service', owner: 'Jordan Davis', reversible: true, requiresApproval: true },
    { id: 'compare', title: 'Compare Redis client config with last known good', owner: 'Priya Nair', reversible: true, requiresApproval: false },
    { id: 'rollback', title: 'Prepare rollback with tax-fix validation', owner: 'You', reversible: true, requiresApproval: true },
  ]
  const currentEvidence = analysis?.evidence ?? [
    { claim: 'Redis hit rate dropped 33 points', source: 'Telemetry', supports: true },
    { claim: '38% 5xx increase starts after deploy', source: 'Deploy timeline', supports: true },
    { claim: 'Impact isolated to eu-west-1', source: 'Correlated', supports: true },
    { claim: 'Database CPU remains within baseline', source: 'Negative evidence', supports: false },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Sparkles size={16} /></span><span>signalroom</span></div>
        <div className="workspace-switcher"><span className="workspace-dot">A</span><span><strong>Acme Cloud</strong><small>Platform team</small></span><ChevronDown size={15} /></div>
        <div className="nav-group"><span className="eyebrow">Workspace</span>{navItems.map(({ label, icon: Icon, active, count }) => <button className={`nav-item ${active ? 'active' : ''}`} key={label}><Icon size={17} /><span>{label}</span>{count && <b>{count}</b>}</button>)}</div>
        <div className="nav-group"><span className="eyebrow">Your space</span><button className="nav-item"><MessageSquareText size={17} /><span>My investigations</span></button><button className="nav-item"><GitBranch size={17} /><span>Connected repos</span></button></div>
        <div className="sidebar-bottom"><button className="nav-item"><Settings2 size={17} /><span>Settings</span></button><div className="profile"><div className="avatar">{user?.name.slice(0, 2).toUpperCase() ?? 'AK'}</div><span><strong>{user?.name ?? 'Akshita Kumar'}</strong><small>{user ? 'Signed in' : 'Engineer'}</small></span><MoreDots /></div></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>Command center</span><span>/</span><strong>New investigation</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search"><Search size={18} /></button><button className="help-button"><CircleHelp size={16} /> Help</button><button className="avatar avatar-small" onClick={() => setAuthOpen(true)} aria-label="Open account">{user?.name.slice(0, 2).toUpperCase() ?? 'AK'}</button></div></header>
        <div className="content-wrap">
          <section className="page-heading"><div><div className="kicker"><span className="live-dot"></span> Incident intelligence</div><h1>Make the next move obvious.</h1><p>Turn noisy production signals into a calm, accountable response.</p></div><button className="secondary-button" onClick={loadSample}><Plus size={16} /> New investigation</button></section>
          <FreshdeskDemo />
          <div className="workspace-grid">
            <section className="work-column">
              <div className="panel composer-panel"><div className="panel-header"><div><span className="panel-label">01 / Signal intake</span><h2>What happened?</h2></div><button className="quiet-button" onClick={loadSample}>Load sample</button></div><label className="input-label" htmlFor="incident">Paste an incident, ticket, or Slack thread</label><textarea id="incident" value={incident} onChange={(event) => setIncident(event.target.value)} placeholder="Describe what your team is seeing..." /><div className="composer-footer"><span className="char-count">{incident.length} characters <span>·</span> English</span><button className="analyze-button" onClick={analyze}><Sparkles size={16} /> {hasAnalysis ? 'Analyze with Signalroom' : 'Analyzing signal...'}</button></div></div>
              <div className="signal-strip">{signals.map((signal) => <div className="signal" key={signal.label}><span className={`status-dot ${signal.tone}`}></span><div><span>{signal.label}</span><strong>{signal.value}</strong><small>{signal.detail}</small></div></div>)}</div>
              <div className="panel results-panel"><div className="results-head"><div><span className="panel-label">02 / Decision brief</span><h2>Incident brief</h2></div><div className="confidence"><ShieldCheck size={16} /><span>{currentConfidence}</span></div></div><div className="tabs" role="tablist">{['Brief', 'Evidence', 'Action plan'].map((tab) => <button className={activeTab === tab ? 'selected' : ''} onClick={() => setActiveTab(tab)} key={tab}>{tab}{tab === 'Evidence' && <span className="tab-count">{currentEvidence.length}</span>}</button>)}</div>{!hasAnalysis ? <div className="loading-state"><div className="loading-orb"><Sparkles size={22} /></div><strong>Reading the signal...</strong><span>Checking timeline, blast radius, and likely causes</span></div> : activeTab === 'Brief' ? <div className="brief-content"><div className="summary"><span className="quote-mark">“</span><p>{currentSummary}</p></div><div className="brief-meta"><div><span>Recommended posture</span><strong className="posture"><AlertTriangle size={15} /> {analysis?.recommendedPosture ?? 'Mitigate now'}</strong></div><div><span>Primary owner</span><strong><span className="mini-avatar">JD</span> {currentOwner}</strong></div><div><span>Started</span><strong>{analysis?.startedAt ?? '14:07 UTC'} <Timer size={14} /></strong></div></div><div className="cause-row"><div className="cause-icon"><BarChart3 size={18} /></div><div><span className="cause-title">Most likely cause</span><p>{currentCause}</p></div><span className="likely-tag">Likely</span></div></div> : activeTab === 'Evidence' ? <div className="evidence-list">{currentEvidence.map((item) => <div className="evidence-item" key={item.claim}><span className="check-circle"><Check size={13} /></span><span>{item.claim}</span><small>{item.source}</small></div>)}</div> : <div className="action-list">{currentActions.map((action, index) => <ActionItem key={action.id} number={`0${index + 1}`} text={action.title} owner={action.owner} requiresApproval={action.requiresApproval} />)}<button className="approval-button" onClick={approveLatest}><ShieldCheck size={15} /> Request human approval</button>{approvalMessage && <p className="approval-message">{approvalMessage}</p>}</div>}</div>
            </section>
            <aside className="right-column"><div className="panel notes-panel"><div className="panel-header"><div><span className="panel-label">Model notes</span><h2>Why this read?</h2></div><button className="icon-button" aria-label="Close notes"><X size={16} /></button></div><p className="notes-intro">Signalroom shows its work so your team can challenge the recommendation, not just accept it.</p>{(analysis?.modelNotes ?? [{ title: 'Temporal match', detail: 'Deploy and error spike are three minutes apart.' }, { title: 'Negative evidence', detail: 'Database CPU is normal, lowering DB saturation likelihood.' }, { title: 'Reversible first', detail: 'Traffic isolation limits harm without losing the tax fix.' }]).map((note, index) => <div className="note-block" key={note.title}><span className="note-index">0{index + 1}</span><div><strong>{note.title}</strong><p>{note.detail}</p></div></div>)}<div className="guardrail"><ShieldCheck size={16} /><div><strong>Guardrail passed</strong><p>No customer data was included in the analysis.</p></div></div></div><div className="panel activity-panel"><div className="panel-header"><div><span className="panel-label">Collaboration</span><h2>People in the loop</h2></div><button className="quiet-button">Manage</button></div><div className="people"><span className="avatar-stack"><span className="mini-avatar green">JD</span><span className="mini-avatar orange">PN</span><span className="mini-avatar blue">AK</span></span><span>3 responders notified</span></div><button className="share-button" onClick={saveIncident}><ClipboardCheck size={16} /> {isSaved ? 'Brief saved to workspace' : 'Save investigation'}<ArrowUpRight size={15} /></button></div></aside>
          </div>
        </div>
      </main>
      {showToast && <div className="toast"><Check size={16} /> Investigation saved to workspace</div>}
      {authOpen && <AuthModal mode={authMode} fields={authFields} error={authError} onModeChange={(mode) => { setAuthMode(mode); setAuthError('') }} onChange={(field, value) => setAuthFields({ ...authFields, [field]: value })} onSubmit={submitAuth} onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

function MoreDots() { return <span className="more-dots" aria-hidden="true">•••</span> }
type DemoTicket = { id: number; subject: string; description?: string; description_text?: string; status: number; priority: number; requester?: { name?: string; email?: string } }
function FreshdeskDemo() {
  const [query, setQuery] = useState('')
  const [tickets, setTickets] = useState<DemoTicket[]>([])
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [selected, setSelected] = useState<DemoTicket | null>(null)
  const [message, setMessage] = useState('')
  const [provider, setProvider] = useState('mock')
  const loadTickets = async (nextPage = 1) => {
    const endpoint = query.trim() ? `/api/freshdesk/search?q=${encodeURIComponent(query)}` : `/api/freshdesk/tickets?page=${nextPage}&perPage=2`
    const response = await fetch(endpoint)
    const body = await response.json() as { tickets?: DemoTicket[]; hasNextPage?: boolean; error?: string; provider?: string; strategy?: string }
    if (body.provider) setProvider(body.provider)
    if (!response.ok) { setMessage(body.error ?? 'Freshdesk request failed'); return }
    setTickets(body.tickets ?? [])
    setHasNextPage(Boolean(body.hasNextPage))
    setPage(nextPage)
    setMessage(query.trim() ? `${body.tickets?.length ?? 0} matching tickets (${body.strategy ?? 'search'})` : `Page ${nextPage} loaded`)
  }
  const inspectTicket = async (id: number) => {
    const response = await fetch(`/api/freshdesk/tickets/${id}`)
    const body = await response.json() as { ticket?: DemoTicket; error?: string }
    if (!response.ok) { setMessage(body.error ?? 'Ticket lookup failed'); return }
    setSelected(body.ticket ?? null)
  }
  const tryUnsupportedAction = async () => {
    const response = await fetch('/api/freshdesk/mcp/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'update_ticket', input: { id: selected?.id ?? 1001 } }) })
    const body = await response.json() as { error?: string }
    setMessage(response.ok ? 'Unexpectedly accepted an unsupported action' : `Blocked safely: ${body.error ?? 'Unsupported tool'}`)
  }
  return <section className="panel freshdesk-panel"><div className="panel-header"><div><span className="panel-label">Connector demo</span><h2>Freshdesk tickets</h2></div><span className="connector-badge">Read-only · {provider === 'mock' ? 'mock mode' : 'live Freshdesk'}</span></div><p className="freshdesk-intro">Search and inspect merchant support context through the same primitives exposed to an Agent Studio agent.</p><div className="freshdesk-controls"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadTickets() }} placeholder="Search tickets, e.g. payment" aria-label="Search Freshdesk tickets" /><button className="analyze-button" onClick={() => void loadTickets()}><Search size={15} /> Search</button><button className="quiet-button" onClick={() => { setQuery(''); void loadTickets() }}>List</button></div><div className="freshdesk-results">{tickets.map((ticket) => <button className="ticket-row" key={ticket.id} onClick={() => void inspectTicket(ticket.id)}><span className="ticket-id">#{ticket.id}</span><span><strong>{ticket.subject}</strong><small>{ticket.requester?.name ?? 'Unknown requester'} · Priority {ticket.priority}</small></span><ArrowUpRight size={15} /></button>)}{tickets.length === 0 && <span className="empty-state">Load the demo tickets or search for a ticket.</span>}</div><div className="freshdesk-footer"><span>{message || 'No credentials required for the local demo.'}</span><span className="pagination"><button className="quiet-button" disabled={page === 1 || Boolean(query.trim())} onClick={() => void loadTickets(page - 1)}>Previous</button><button className="quiet-button" disabled={!hasNextPage || Boolean(query.trim())} onClick={() => void loadTickets(page + 1)}>Next</button></span></div>{selected && <div className="ticket-detail"><div><span className="panel-label">Ticket #{selected.id}</span><h3>{selected.subject}</h3><p>{selected.description_text ?? selected.description}</p><small>{selected.requester?.email ?? 'Requester email unavailable'}</small></div><button className="quiet-button" onClick={() => void tryUnsupportedAction()}>Test blocked write</button></div>}</section>
}
function ActionItem({ number, text, owner, requiresApproval }: { number: string; text: string; owner: string; requiresApproval: boolean }) { return <div className="action-item"><span className="action-number">{number}</span><div><strong>{text}</strong><small>Owner: {owner} · {requiresApproval ? 'Approval required' : 'Investigation step'}</small></div><button className="action-check" aria-label={`Mark ${text} ready`}><Check size={14} /></button></div> }
function AuthModal({ mode, fields, error, onModeChange, onChange, onSubmit, onClose }: { mode: 'login' | 'register'; fields: { name: string; email: string; password: string }; error: string; onModeChange: (mode: 'login' | 'register') => void; onChange: (field: 'name' | 'email' | 'password', value: string) => void; onSubmit: () => void; onClose: () => void }) { return <div className="modal-backdrop"><div className="auth-modal"><button className="modal-close" onClick={onClose} aria-label="Close authentication"><X size={17} /></button><span className="panel-label">Signalroom workspace</span><h2>{mode === 'login' ? 'Sign in to investigate' : 'Create your engineer account'}</h2><p className="auth-copy">Analysis, saved investigations, and approval records belong to an authenticated workspace.</p>{mode === 'register' && <label>Name<input value={fields.name} onChange={(event) => onChange('name', event.target.value)} placeholder="Your name" /></label>}<label>Email<input type="email" value={fields.email} onChange={(event) => onChange('email', event.target.value)} placeholder="you@company.com" /></label><label>Password<input type="password" value={fields.password} onChange={(event) => onChange('password', event.target.value)} placeholder="At least 8 characters" /></label>{error && <p className="auth-error">{error}</p>}<button className="analyze-button auth-submit" onClick={onSubmit}>{mode === 'login' ? 'Sign in' : 'Create account'}</button><button className="mode-switch" onClick={() => onModeChange(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button></div></div> }

export default App
