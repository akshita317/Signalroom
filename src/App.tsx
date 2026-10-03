import { useState } from 'react'
import { AlertTriangle, ArrowUpRight, BarChart3, Check, ChevronDown, CircleHelp, ClipboardCheck, FileText, GitBranch, Inbox, LayoutDashboard, MessageSquareText, Plus, Search, Settings2, ShieldCheck, Sparkles, Timer, Users, X } from 'lucide-react'
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
  const [hasAnalysis, setHasAnalysis] = useState(true)
  const [activeTab, setActiveTab] = useState('Brief')
  const [isSaved, setIsSaved] = useState(false)
  const [showToast, setShowToast] = useState(false)

  const analyze = () => {
    setHasAnalysis(false)
    window.setTimeout(() => setHasAnalysis(true), 700)
  }

  const loadSample = () => {
    setIncident(sampleIncident)
    setHasAnalysis(true)
  }

  const saveIncident = () => {
    setIsSaved(true)
    setShowToast(true)
    window.setTimeout(() => setShowToast(false), 2400)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Sparkles size={16} /></span><span>signalroom</span></div>
        <div className="workspace-switcher"><span className="workspace-dot">A</span><span><strong>Acme Cloud</strong><small>Platform team</small></span><ChevronDown size={15} /></div>
        <div className="nav-group"><span className="eyebrow">Workspace</span>{navItems.map(({ label, icon: Icon, active, count }) => <button className={`nav-item ${active ? 'active' : ''}`} key={label}><Icon size={17} /><span>{label}</span>{count && <b>{count}</b>}</button>)}</div>
        <div className="nav-group"><span className="eyebrow">Your space</span><button className="nav-item"><MessageSquareText size={17} /><span>My investigations</span></button><button className="nav-item"><GitBranch size={17} /><span>Connected repos</span></button></div>
        <div className="sidebar-bottom"><button className="nav-item"><Settings2 size={17} /><span>Settings</span></button><div className="profile"><div className="avatar">AK</div><span><strong>Akshita Kumar</strong><small>Engineer</small></span><MoreDots /></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>Command center</span><span>/</span><strong>New investigation</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search"><Search size={18} /></button><button className="help-button"><CircleHelp size={16} /> Help</button><button className="avatar avatar-small">AK</button></div></header>
        <div className="content-wrap">
          <section className="page-heading"><div><div className="kicker"><span className="live-dot"></span> Incident intelligence</div><h1>Make the next move obvious.</h1><p>Turn noisy production signals into a calm, accountable response.</p></div><button className="secondary-button" onClick={loadSample}><Plus size={16} /> New investigation</button></section>
          <div className="workspace-grid">
            <section className="work-column">
              <div className="panel composer-panel"><div className="panel-header"><div><span className="panel-label">01 / Signal intake</span><h2>What happened?</h2></div><button className="quiet-button" onClick={loadSample}>Load sample</button></div><label className="input-label" htmlFor="incident">Paste an incident, ticket, or Slack thread</label><textarea id="incident" value={incident} onChange={(event) => setIncident(event.target.value)} placeholder="Describe what your team is seeing..." /><div className="composer-footer"><span className="char-count">{incident.length} characters <span>·</span> English</span><button className="analyze-button" onClick={analyze}><Sparkles size={16} /> {hasAnalysis ? 'Re-analyze signal' : 'Analyzing signal...'}</button></div></div>
              <div className="signal-strip">{signals.map((signal) => <div className="signal" key={signal.label}><span className={`status-dot ${signal.tone}`}></span><div><span>{signal.label}</span><strong>{signal.value}</strong><small>{signal.detail}</small></div></div>)}</div>
              <div className="panel results-panel"><div className="results-head"><div><span className="panel-label">02 / Decision brief</span><h2>Incident brief</h2></div><div className="confidence"><ShieldCheck size={16} /><span>89% confidence</span></div></div><div className="tabs" role="tablist">{['Brief', 'Evidence', 'Action plan'].map((tab) => <button className={activeTab === tab ? 'selected' : ''} onClick={() => setActiveTab(tab)} key={tab}>{tab}{tab === 'Evidence' && <span className="tab-count">6</span>}</button>)}</div>{!hasAnalysis ? <div className="loading-state"><div className="loading-orb"><Sparkles size={22} /></div><strong>Reading the signal...</strong><span>Checking timeline, blast radius, and likely causes</span></div> : activeTab === 'Brief' ? <div className="brief-content"><div className="summary"><span className="quote-mark">“</span><p><strong>Checkout failures are concentrated in eu-west-1</strong> and correlate with a Redis cache hit-rate collapse immediately after the payments-service deploy. The tax fix is valuable, but the customer impact is active and measurable.</p></div><div className="brief-meta"><div><span>Recommended posture</span><strong className="posture"><AlertTriangle size={15} /> Mitigate now</strong></div><div><span>Primary owner</span><strong><span className="mini-avatar">JD</span> Jordan Davis</strong></div><div><span>Started</span><strong>14:07 UTC <Timer size={14} /></strong></div></div><div className="cause-row"><div className="cause-icon"><BarChart3 size={18} /></div><div><span className="cause-title">Most likely cause</span><p>Cache invalidation or connection pool regression in <code>payments-service@2024.09.18</code></p></div><span className="likely-tag">Likely</span></div></div> : activeTab === 'Evidence' ? <div className="evidence-list">{['Redis hit rate dropped 33 points', '38% 5xx increase starts after deploy', 'Impact isolated to eu-west-1', 'Database CPU remains within baseline'].map((item, index) => <div className="evidence-item" key={item}><span className="check-circle"><Check size={13} /></span><span>{item}</span><small>{index < 2 ? 'Telemetry' : 'Correlated'}</small></div>)}</div> : <div className="action-list"><ActionItem number="01" text="Pause eu-west-1 traffic to payments-service" owner="Jordan Davis" /><ActionItem number="02" text="Compare Redis client config with last known good" owner="Priya Nair" /><ActionItem number="03" text="Prepare rollback with tax-fix validation" owner="You" /></div>}</div>
            </section>
            <aside className="right-column"><div className="panel notes-panel"><div className="panel-header"><div><span className="panel-label">Model notes</span><h2>Why this read?</h2></div><button className="icon-button" aria-label="Close notes"><X size={16} /></button></div><p className="notes-intro">Signalroom is showing its work so your team can challenge the recommendation, not just accept it.</p><div className="note-block"><span className="note-index">01</span><div><strong>Temporal match</strong><p>Deploy and error spike are 3 minutes apart.</p></div></div><div className="note-block"><span className="note-index">02</span><div><strong>Negative evidence</strong><p>Database CPU is normal, lowering DB saturation likelihood.</p></div></div><div className="note-block"><span className="note-index">03</span><div><strong>Reversible first</strong><p>Traffic isolation limits harm without losing the tax fix.</p></div></div><div className="guardrail"><ShieldCheck size={16} /><div><strong>Guardrail passed</strong><p>No customer data was included in the analysis.</p></div></div></div><div className="panel activity-panel"><div className="panel-header"><div><span className="panel-label">Collaboration</span><h2>People in the loop</h2></div><button className="quiet-button">Manage</button></div><div className="people"><span className="avatar-stack"><span className="mini-avatar green">JD</span><span className="mini-avatar orange">PN</span><span className="mini-avatar blue">AK</span></span><span>3 responders notified</span></div><button className="share-button" onClick={saveIncident}><ClipboardCheck size={16} /> {isSaved ? 'Brief saved to workspace' : 'Save & notify team'}<ArrowUpRight size={15} /></button></div></aside>
          </div>
        </div>
      </main>
      {showToast && <div className="toast"><Check size={16} /> Investigation saved and team notified</div>}
    </div>
  )
}

function MoreDots() { return <span className="more-dots" aria-hidden="true">•••</span> }

function ActionItem({ number, text, owner }: { number: string; text: string; owner: string }) { return <div className="action-item"><span className="action-number">{number}</span><div><strong>{text}</strong><small>Owner: {owner}</small></div><button className="action-check" aria-label={`Complete ${text}`}><Check size={14} /></button></div> }

export default App
