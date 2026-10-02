import { useState, useEffect, useCallback } from 'react'

const API = 'http://localhost:3001'

// ── Types ────────────────────────────────────────────────────────────────────
type Venue = { id: string; name: string; capacity: number; availability: string; status: string }
type Session = { id: string; name: string; owner: string; status: string; risk: string; startTime: string; endTime: string; venueId: string; venue?: Venue; requiredResources: string }
type Task = { id: string; title: string; owner: string; role: string; status: string; priority: string; sessionId: string | null; blocker: string | null; escalationRequired: boolean }
type Stats = { totalTasks: number; completedTasks: number; blockedTasks: number; inProgressTasks: number; criticalRisks: number; atRiskSessions: number; totalSessions: number; unavailableVenues: number; escalationRequired: number; eventName: string; eventStatus: string; overallProgress: number }
type ImpactReport = { venueName: string; severity: string; affectedSessionCount: number; affectedTaskCount: number; affectedResourceCount: number; affectedVolunteerCount: number; explanation: string; recommendedActions: string[]; affectedSessions: { id: string; name: string; owner: string; currentRisk: string }[] }
type NotionStatus = { connected: boolean; lastSync: string; dbCount: number }

// ── Helpers ──────────────────────────────────────────────────────────────────
function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}

function riskBg(risk: string) {
  if (risk === 'High' || risk === 'Critical') return 'bg-rose-500/15 border-rose-500/30 text-rose-400'
  if (risk === 'Medium') return 'bg-amber-500/15 border-amber-500/30 text-amber-400'
  return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
}

function statusBg(status: string) {
  if (status === 'Blocked' || status === 'Needs Rescheduling') return 'bg-rose-500/15 border-rose-500/30 text-rose-400'
  if (status === 'At Risk' || status === 'In Progress') return 'bg-amber-500/15 border-amber-500/30 text-amber-400'
  if (status === 'Done' || status === 'Completed' || status === 'Live') return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
  return 'bg-slate-700/40 border-slate-600/30 text-slate-300'
}

function priorityDot(p: string) {
  if (p === 'Critical') return 'bg-rose-500'
  if (p === 'High') return 'bg-amber-500'
  if (p === 'Medium') return 'bg-blue-400'
  return 'bg-slate-500'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Components ───────────────────────────────────────────────────────────────
function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border', className)}>
      {label}
    </span>
  )
}

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-sm', className)}>
      {title && (
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center gap-2">
          <span className="font-semibold text-slate-200 text-sm tracking-wide">{title}</span>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <p className={cn('text-3xl font-bold tabular-nums', accent)}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
type Tab = 'Dashboard' | 'Sessions' | 'Tasks' | 'Impact Analysis' | 'Notion Sync'
const TABS: Tab[] = ['Dashboard', 'Sessions', 'Tasks', 'Impact Analysis', 'Notion Sync']
const ROLES = ['Leadership', 'Operations', 'Volunteers', 'Technical'] as const
type Role = typeof ROLES[number]

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<Tab>('Dashboard')
  const [role, setRole] = useState<Role>('Leadership')
  const [stats, setStats] = useState<Stats | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [notionStatus, setNotionStatus] = useState<NotionStatus | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskOwner, setNewTaskOwner] = useState('')

  // Impact analysis
  const [selectedVenueId, setSelectedVenueId] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [impact, setImpact] = useState<ImpactReport | null>(null)
  const [changeApplied, setChangeApplied] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const loadAll = useCallback(async () => {
    try {
      const [s, v, sess, t] = await Promise.all([
        fetch(`${API}/api/stats`).then(r => r.json()),
        fetch(`${API}/api/venues`).then(r => r.json()),
        fetch(`${API}/api/sessions`).then(r => r.json()),
        fetch(`${API}/api/tasks`).then(r => r.json())
      ])
      setStats(s)
      setVenues(v)
      setSessions(sess)
      setTasks(t)
    } catch {
      showToast('Failed to connect to Ripple server. Is it running on port 3001?', 'error')
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const loadNotion = async () => {
    const status = await fetch(`${API}/api/notion/status`).then(r => r.json())
    setNotionStatus(status)
  }

  useEffect(() => {
    if (tab === 'Notion Sync') loadNotion()
  }, [tab])

  const handleAnalyze = async () => {
    if (!selectedVenueId) return
    setIsAnalyzing(true)
    setImpact(null)
    setChangeApplied(false)
    const res = await fetch(`${API}/api/impact-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Venue', id: selectedVenueId })
    })
    setImpact(await res.json())
    setIsAnalyzing(false)
  }

  const handleApplyChange = async () => {
    if (!selectedVenueId || !impact) return
    setIsApplying(true)
    const res = await fetch(`${API}/api/apply-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Venue', id: selectedVenueId, action: 'Make Unavailable' })
    })
    const result = await res.json()
    setIsApplying(false)
    if (result.success) {
      setChangeApplied(true)
      showToast('Change applied! Notion sync in progress...', 'success')
      await loadAll()
    } else {
      showToast('Failed to apply change.', 'error')
    }
  }

  const handleReset = async () => {
    await fetch(`${API}/api/reset`, { method: 'POST' })
    setImpact(null)
    setChangeApplied(false)
    setSelectedVenueId('')
    await loadAll()
    showToast('Demo data reset to initial state.', 'success')
  }

  const updateTask = async (task: Task, update: Partial<Pick<Task, 'status' | 'escalationRequired' | 'blocker'>>) => {
    try {
      const response = await fetch(`${API}/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update)
      })
      if (!response.ok) throw new Error('Task update failed')
      await loadAll()
      showToast(update.status === 'Done' ? 'Task marked complete.' : 'Task escalated to leadership.', 'success')
    } catch {
      showToast('Could not update the task. Please retry.', 'error')
    }
  }

  const createTask = async () => {
    if (!newTaskTitle.trim()) {
      showToast('Enter a task title first.', 'error')
      return
    }
    try {
      const response = await fetch(`${API}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle,
          owner: newTaskOwner.trim() || 'Command Center',
          role: role === 'Leadership' ? 'Operations' : role,
          priority: 'Medium'
        })
      })
      if (!response.ok) throw new Error('Task creation failed')
      setNewTaskTitle('')
      setNewTaskOwner('')
      await loadAll()
      showToast('New task created.', 'success')
    } catch {
      showToast('Could not create the task. Please retry.', 'error')
    }
  }

  const filteredTasks = role === 'Leadership'
    ? tasks
    : tasks.filter(t => t.role === role || t.role === 'Operations')

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-100 font-['Inter',sans-serif]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');`}</style>

      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 px-5 py-3 rounded-xl border shadow-2xl text-sm font-medium transition-all',
          toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200' : 'bg-rose-900/90 border-rose-500/40 text-rose-200'
        )}>
          {toast.msg}
        </div>
      )}

      {/* Navbar */}
      <nav className="border-b border-slate-800/60 bg-[#0d1017]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-base bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">Ripple</span>
              <span className="ml-2 text-xs text-slate-500">Event Command Center</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors"
            >
              Reset Demo
            </button>
            <div className="flex items-center gap-2 bg-slate-800/70 border border-slate-700/50 rounded-lg px-3 py-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <select
                value={role}
                onChange={e => setRole(e.target.value as Role)}
                className="bg-transparent text-sm text-slate-200 focus:outline-none cursor-pointer"
              >
                {ROLES.map(r => <option key={r} value={r} className="bg-slate-900">{r}</option>)}
              </select>
            </div>
          </div>
        </div>
      </nav>

      {/* Tab Bar */}
      <div className="border-b border-slate-800/60 bg-[#0d1017]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 flex gap-1 overflow-x-auto py-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap',
                tab === t
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8">

        {/* ── DASHBOARD ─────────────────────────────────────────── */}
        {tab === 'Dashboard' && stats && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h1 className="text-2xl font-bold text-slate-100">{stats.eventName}</h1>
                  <p className="text-sm text-slate-500 mt-0.5">Live operational view · {role} role</p>
                </div>
                <Badge label={stats.eventStatus} className={statusBg(stats.eventStatus)} />
              </div>
              {/* Progress bar */}
              <div className="mt-4 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-600 rounded-full transition-all"
                  style={{ width: `${Math.round(stats.overallProgress * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Overall progress: {Math.round(stats.overallProgress * 100)}%</p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Tasks" value={stats.totalTasks} sub={`${stats.completedTasks} done`} accent="text-slate-100" />
              <StatCard label="Blocked" value={stats.blockedTasks} sub="Need immediate action" accent="text-rose-400" />
              <StatCard label="Critical Risks" value={stats.criticalRisks} sub="High-risk sessions" accent="text-amber-400" />
              <StatCard label="Escalations" value={stats.escalationRequired} sub="Require leadership" accent="text-orange-400" />
            </div>

            {/* Sessions + Tasks overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card title="Sessions">
                <div className="space-y-3">
                  {sessions.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl border border-slate-700/40 hover:border-slate-600/60 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-slate-200 truncate">{s.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{s.venue?.name ?? 'No venue'} · {formatTime(s.startTime)}</p>
                      </div>
                      <div className="flex gap-2 ml-3">
                        <Badge label={s.risk} className={riskBg(s.risk)} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title={role === 'Leadership' ? 'All Tasks' : `${role} Tasks`}>
                <div className="space-y-3">
                  {filteredTasks.map(t => (
                    <div key={t.id} className={cn(
                      'flex items-start gap-3 p-3 rounded-xl border transition-colors',
                      t.status === 'Blocked' ? 'bg-rose-950/30 border-rose-800/40' : 'bg-slate-800/40 border-slate-700/40'
                    )}>
                      <div className={cn('mt-1.5 w-2 h-2 rounded-full flex-shrink-0', priorityDot(t.priority))} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200">{t.title}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className="text-xs text-slate-500">{t.owner}</span>
                          {t.blocker && <span className="text-xs text-rose-400">⚠ {t.blocker}</span>}
                        </div>
                      </div>
                      <Badge label={t.status} className={statusBg(t.status)} />
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Venues */}
            <Card title="Venues">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {venues.map(v => (
                  <div key={v.id} className={cn(
                    'p-4 rounded-xl border',
                    v.availability === 'Unavailable' ? 'bg-rose-950/30 border-rose-800/40' : 'bg-slate-800/40 border-slate-700/40'
                  )}>
                    <p className="font-semibold text-sm text-slate-200">{v.name}</p>
                    <p className="text-xs text-slate-500 mt-1">Cap: {v.capacity}</p>
                    <div className="mt-2">
                      <Badge label={v.availability} className={v.availability === 'Unavailable' ? riskBg('High') : riskBg('Low')} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── SESSIONS ──────────────────────────────────────────── */}
        {tab === 'Sessions' && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-slate-100">Sessions</h1>
            <div className="space-y-4">
              {sessions.map(s => (
                <div key={s.id} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold text-slate-100">{s.name}</h3>
                        <Badge label={s.status} className={statusBg(s.status)} />
                        <Badge label={`Risk: ${s.risk}`} className={riskBg(s.risk)} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-400">
                        <span>📍 {s.venue?.name ?? 'Unassigned'}</span>
                        <span>👤 {s.owner}</span>
                        <span>🕐 {formatTime(s.startTime)} – {formatTime(s.endTime)}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Resources: {s.requiredResources}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TASKS ─────────────────────────────────────────────── */}
        {tab === 'Tasks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-slate-100">Tasks & Escalations</h1>
              <span className="text-sm text-slate-500">{tasks.filter(t => t.status === 'Blocked').length} blocked · {tasks.filter(t => t.escalationRequired).length} escalated</span>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
              <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="New task title" className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
              <input value={newTaskOwner} onChange={e => setNewTaskOwner(e.target.value)} placeholder="Owner (optional)" className="sm:w-48 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
              <button onClick={createTask} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-sm font-semibold rounded-lg text-white transition-colors">Add task</button>
            </div>
            {/* Escalations first */}
            {tasks.filter(t => t.escalationRequired).length > 0 && (
              <div className="bg-rose-950/30 border border-rose-800/40 rounded-2xl p-4 mb-2">
                <p className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-3">⚠ Requires Escalation</p>
                <div className="space-y-3">
                  {tasks.filter(t => t.escalationRequired).map(t => (
                    <div key={t.id} className="flex items-start gap-3">
                      <div className={cn('mt-1.5 w-2 h-2 rounded-full flex-shrink-0', priorityDot(t.priority))} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-200">{t.title}</p>
                        <p className="text-xs text-rose-400">{t.blocker}</p>
                      </div>
                      <span className="text-xs text-slate-400">{t.owner}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-3">
              {tasks.map(t => (
                <div key={t.id} className={cn(
                  'flex items-start gap-3 p-4 rounded-xl border',
                  t.status === 'Blocked' ? 'bg-rose-950/20 border-rose-800/30' : 'bg-slate-900/60 border-slate-800/80'
                )}>
                  <div className={cn('mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0', priorityDot(t.priority))} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-200">{t.title}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="text-xs text-slate-500">{t.owner} · {t.role}</span>
                      {t.blocker && <span className="text-xs text-rose-400">🚫 {t.blocker}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge label={t.status} className={statusBg(t.status)} />
                    <Badge label={t.priority} className={riskBg(t.priority === 'Critical' ? 'High' : t.priority === 'High' ? 'High' : t.priority === 'Medium' ? 'Medium' : 'Low')} />
                    <div className="flex gap-2 mt-1">
                      {t.status !== 'Done' && (
                        <button onClick={() => updateTask(t, { status: 'Done' })} className="text-xs px-2 py-1 rounded border border-emerald-700/60 text-emerald-400 hover:bg-emerald-950/50">
                          Complete
                        </button>
                      )}
                      {!t.escalationRequired && t.status !== 'Done' && (
                        <button onClick={() => updateTask(t, { escalationRequired: true, blocker: t.blocker || 'Needs leadership review' })} className="text-xs px-2 py-1 rounded border border-amber-700/60 text-amber-400 hover:bg-amber-950/50">
                          Escalate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── IMPACT ANALYSIS ───────────────────────────────────── */}
        {tab === 'Impact Analysis' && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <h1 className="text-xl font-bold text-slate-100">Venue Change Impact Analysis</h1>
              <p className="text-sm text-slate-500 mt-1">Simulate a venue becoming unavailable and discover the downstream cascade.</p>
            </div>

            {/* Change applied banner */}
            {changeApplied && (
              <div className="bg-emerald-900/40 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3">
                <div className="text-emerald-400 text-xl">✓</div>
                <div>
                  <p className="text-sm font-semibold text-emerald-300">Change Applied & Synced</p>
                  <p className="text-xs text-emerald-500">Local state updated. Notion records being synced in background.</p>
                </div>
              </div>
            )}

            {/* Venue selector */}
            <Card title="Select Venue to Simulate">
              <div className="space-y-4">
                <select
                  value={selectedVenueId}
                  onChange={e => { setSelectedVenueId(e.target.value); setImpact(null); setChangeApplied(false) }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-slate-200 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60 focus:outline-none"
                >
                  <option value="">-- Select a venue to make unavailable --</option>
                  {venues.map(v => (
                    <option key={v.id} value={v.id} className="bg-slate-900">
                      {v.name} ({v.availability}) · Cap: {v.capacity}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAnalyze}
                  disabled={!selectedVenueId || isAnalyzing}
                  className="w-full px-5 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-amber-600/20"
                >
                  {isAnalyzing ? 'Analyzing dependencies...' : '⚡ Run Dependency Impact Analysis'}
                </button>
              </div>
            </Card>

            {/* Impact report */}
            {impact && (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-lg text-slate-100">Impact Report</h2>
                  <div className="flex gap-2">
                    <Badge label="AI-generated analysis" className="bg-blue-500/15 border-blue-500/30 text-blue-400" />
                    <Badge label={impact.severity} className={riskBg(impact.severity)} />
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Sessions', value: impact.affectedSessionCount, accent: 'text-rose-400' },
                    { label: 'Tasks Blocked', value: impact.affectedTaskCount, accent: 'text-amber-400' },
                    { label: 'Resources', value: impact.affectedResourceCount, accent: 'text-orange-400' },
                    { label: 'Volunteers', value: impact.affectedVolunteerCount, accent: 'text-yellow-400' },
                  ].map(m => (
                    <div key={m.label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
                      <p className={cn('text-3xl font-bold', m.accent)}>{m.value}</p>
                      <p className="text-xs text-slate-500 mt-1">{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* AI explanation */}
                <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-4">
                  <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">AI Analysis</p>
                  <p className="text-sm text-slate-300 leading-relaxed">{impact.explanation}</p>
                </div>

                {/* Affected sessions */}
                {impact.affectedSessions.length > 0 && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Affected Sessions</p>
                    <div className="space-y-2">
                      {impact.affectedSessions.map(s => (
                        <div key={s.id} className="flex items-center justify-between">
                          <span className="text-sm text-slate-300">{s.name}</span>
                          <div className="flex gap-2">
                            <span className="text-xs text-slate-500">{s.owner}</span>
                            <Badge label={s.currentRisk} className={riskBg(s.currentRisk)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommended actions */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Recommended Actions</p>
                  <ol className="space-y-2">
                    {impact.recommendedActions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-amber-500 font-bold">{i + 1}.</span> {a}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Apply button */}
                {!changeApplied && (
                  <button
                    onClick={handleApplyChange}
                    disabled={isApplying}
                    className="w-full px-5 py-4 bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white font-bold rounded-xl transition-all shadow-xl shadow-rose-700/30 text-sm"
                  >
                    {isApplying
                      ? '⏳ Applying change & syncing to Notion...'
                      : '🔴 Apply Change & Sync to Notion'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── NOTION SYNC ───────────────────────────────────────── */}
        {tab === 'Notion Sync' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h1 className="text-xl font-bold text-slate-100">Notion Integration</h1>
              <p className="text-sm text-slate-500 mt-1">Live connection to KBC 2026 | Ripple — Engineering HQ workspace.</p>
            </div>

            <Card title="Connection Status">
              <div className="flex items-center gap-4 mb-6">
                <div className={cn(
                  'w-3 h-3 rounded-full',
                  notionStatus?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                )} />
                <div>
                  <p className="font-semibold text-slate-200">
                    {notionStatus === null ? 'Checking...' : notionStatus.connected ? 'Connected to Notion' : 'Notion not configured or unreachable'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {notionStatus?.connected
                      ? `${notionStatus.dbCount} databases available · Last checked: ${new Date(notionStatus.lastSync).toLocaleTimeString()}`
                      : 'Add NOTION_TOKEN to server/.env, then restart the server.'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { db: 'Events', id: '3f4f9cf5', ops: 'READ' },
                  { db: 'Sessions', id: '9d975922', ops: 'READ / WRITE' },
                  { db: 'Venues', id: 'bf8cc321', ops: 'READ / WRITE' },
                  { db: 'Tasks', id: '3fe1b77d', ops: 'READ / WRITE' },
                ].map(item => (
                  <div key={item.db} className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl border border-slate-700/40">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{item.db}</p>
                      <p className="text-xs text-slate-500 font-mono">{item.id}</p>
                    </div>
                    <Badge label={item.ops} className="bg-slate-700/50 border-slate-600/30 text-slate-300" />
                  </div>
                ))}
              </div>

              <button
                onClick={loadNotion}
                className="mt-4 w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-xl border border-slate-700 transition-colors"
              >
                Refresh Notion Status
              </button>
            </Card>

            <Card title="How Notion Sync Works">
              <div className="space-y-4 text-sm text-slate-400">
                <div className="flex gap-3">
                  <div className="text-amber-400 font-bold">1.</div>
                  <div>When you click <strong className="text-slate-200">Apply Change</strong>, the backend immediately updates the local JSON data store.</div>
                </div>
                <div className="flex gap-3">
                  <div className="text-amber-400 font-bold">2.</div>
                  <div>The server then calls the <strong className="text-slate-200">Notion API</strong> to update the matching Venue, Session, and Task records by name lookup.</div>
                </div>
                <div className="flex gap-3">
                  <div className="text-amber-400 font-bold">3.</div>
                  <div>An <strong className="text-slate-200">Incident record</strong> is appended to the Engineering HQ page as a callout block.</div>
                </div>
                <div className="flex gap-3">
                  <div className="text-amber-400 font-bold">4.</div>
                  <div>The UI refreshes to reflect the new state. Open Notion to verify the records were updated.</div>
                </div>
              </div>
            </Card>
          </div>
        )}

      </main>
    </div>
  )
}
