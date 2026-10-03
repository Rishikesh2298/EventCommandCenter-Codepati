import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CalendarDays, Check, ChevronRight, Clock3, LayoutDashboard, MapPin, Pencil, Plus, Radio, RefreshCw, Sparkles, Trash2, Users } from 'lucide-react'

const API = 'http://localhost:3001'

type Venue = { id: string; name: string; capacity: number; availability: string; status: string; eventId?: string | null }
type Session = { id: string; name: string; eventId: string; owner: string; status: string; risk: string; startTime: string; endTime: string; venueId: string | null; venue?: Venue | null; requiredResources: string }
type Task = { id: string; title: string; eventId?: string | null; owner: string; role: string; status: string; priority: string; sessionId: string | null; venueId?: string | null; blocker: string | null; escalationRequired: boolean }
type EventRecord = { id: string; name: string; status: string; startDate: string; endDate: string; location: string; overallProgress: number; riskLevel: string }
type Stats = { totalTasks: number; completedTasks: number; blockedTasks: number; inProgressTasks: number; criticalRisks: number; totalSessions: number; unavailableVenues: number; escalationRequired: number; eventName: string; eventStatus: string; overallProgress: number }
type ImpactReport = { venueName: string; model: string; severity: string; affectedSessionCount: number; affectedTaskCount: number; affectedResourceCount: number; affectedVolunteerCount: number; summary: string; scheduleAdvice: string; communicationPlan: string[]; watchouts: string[]; assumptions: string[]; recommendedActions: { action: string; owner: string; when: string; why: string; dependency: string }[]; affectedSessions: { id: string; name: string; owner: string; currentRisk: string }[] }
type NotionStatus = { connected: boolean; lastSync: string; dbCount: number; error?: string }
type NotionReconciliation = { dryRun: boolean; updated: { events: number; venues: number; sessions: number; tasks: number }; unmatched: { type: string; title: string; reason: string }[] }
type Tab = 'Dashboard' | 'Events' | 'Sessions' | 'Tasks' | 'Venues' | 'Impact Analysis' | 'Notion Sync'
type Editor = { entity: 'event' | 'session' | 'task' | 'venue'; id?: string; data: Record<string, string | number | null> }

const TABS: { label: Tab; icon: typeof LayoutDashboard }[] = [
  { label: 'Dashboard', icon: LayoutDashboard }, { label: 'Events', icon: CalendarDays }, { label: 'Sessions', icon: Clock3 },
  { label: 'Tasks', icon: Check }, { label: 'Venues', icon: MapPin }, { label: 'Impact Analysis', icon: AlertTriangle }, { label: 'Notion Sync', icon: RefreshCw }
]
const STATUS = ['To Do', 'In Progress', 'Blocked', 'Done']
const ROLES = ['Operations', 'Volunteers', 'Technical', 'Marketing', 'Leadership']
const initialDate = () => new Date().toISOString().slice(0, 16)
const inputDate = (date: string) => date ? new Date(date).toISOString().slice(0, 16) : ''

function cn(...classes: (string | boolean | undefined | null)[]) { return classes.filter(Boolean).join(' ') }
function badge(status: string) {
  if (['Blocked', 'Needs Rescheduling', 'High', 'Critical', 'Unavailable', 'At Risk'].includes(status)) return 'border-rose-200 bg-rose-50 text-rose-700'
  if (['In Progress', 'Medium', 'Reserved'].includes(status)) return 'border-amber-200 bg-amber-50 text-amber-700'
  if (['Done', 'Completed', 'Live', 'Low', 'Available', 'Active', 'Scheduled', 'Planning'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}
function Badge({ children, value }: { children?: React.ReactNode; value?: string }) { return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide', badge(value ?? String(children)))}>{children ?? value}</span> }
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <section className={cn('rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/40', className)}>{children}</section> }
function IconButton({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) { return <button title={label} aria-label={label} onClick={onClick} className={cn('rounded-lg p-2 transition-colors', danger ? 'text-rose-500 hover:bg-rose-50' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700')}>{danger ? <Trash2 size={16} /> : <Pencil size={16} />}</button> }

export default function App() {
  const [tab, setTab] = useState<Tab>('Dashboard')
  const [stats, setStats] = useState<Stats | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<EventRecord[]>([])
  const [activeEventId, setActiveEventId] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null)
  const [notionStatus, setNotionStatus] = useState<NotionStatus | null>(null)
  const [reconcilingNotion, setReconcilingNotion] = useState(false)
  const [pushingNotion, setPushingNotion] = useState(false)
  const [selectedVenueId, setSelectedVenueId] = useState('')
  const [impact, setImpact] = useState<ImpactReport | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)

  const showToast = (message: string, error = false) => { setToast({ message, error }); window.setTimeout(() => setToast(null), 3500) }
  const request = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${API}${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? 'Unable to save this change')
    return data
  }
  const loadAll = useCallback(async () => {
    try {
      const query = activeEventId ? `?eventId=${encodeURIComponent(activeEventId)}` : ''
      const [nextStats, nextVenues, nextSessions, nextTasks, nextEvents] = await Promise.all([
        request(`/api/stats${query}`), request(`/api/venues${query}`), request(`/api/sessions${query}`), request(`/api/tasks${query}`), request('/api/events')
      ])
      setStats(nextStats); setVenues(nextVenues); setSessions(nextSessions); setTasks(nextTasks); setEvents(nextEvents)
      setActiveEventId(current => current || nextEvents[0]?.id || '')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to connect to the server', true) }
  }, [activeEventId])
  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { if (tab === 'Notion Sync') request('/api/notion/status').then(setNotionStatus).catch(() => showToast('Notion status is unavailable', true)) }, [tab])

  const pushLocalToNotion = async () => {
    setPushingNotion(true)
    try {
      const synced = await request('/api/notion/sync', 'POST') as { synced: Record<string, number> }
      showToast(`Pushed ${Object.values(synced.synced).reduce((total, count) => total + count, 0)} records to Notion`)
      setNotionStatus(await request('/api/notion/status'))
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to push local changes', true) } finally { setPushingNotion(false) }
  }

  const importNotionEdits = async () => {
    if (!window.confirm('Import mapped edits from Notion? Notion values will replace the matching local fields; unmatched and deleted Notion records are left unchanged.')) return
    setReconcilingNotion(true)
    try {
      const result = await request('/api/notion/reconcile', 'POST') as NotionReconciliation
      const imported = Object.values(result.updated).reduce((total, count) => total + count, 0)
      await loadAll()
      showToast(`Imported ${imported} Notion record${imported === 1 ? '' : 's'}${result.unmatched.length ? `; ${result.unmatched.length} unmatched` : ''}`)
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to import Notion edits', true) } finally { setReconcilingNotion(false) }
  }

  const openNew = (entity: Editor['entity']) => {
    const defaults: Record<Editor['entity'], Editor['data']> = {
      event: { name: '', location: '', startDate: initialDate(), endDate: initialDate(), status: 'Planning', riskLevel: 'Low' },
      venue: { name: '', capacity: 100, availability: 'Available', status: 'Active' },
      session: { name: '', owner: '', venueId: '', startTime: initialDate(), endTime: initialDate(), requiredResources: '', status: 'Scheduled', risk: 'Low' },
      task: { title: '', owner: '', role: 'Operations', priority: 'Medium', status: 'To Do', sessionId: '', venueId: '', blocker: '' }
    }
    setEditor({ entity, data: defaults[entity] })
  }
  const openEdit = (entity: Editor['entity'], item: EventRecord | Venue | Session | Task) => {
    if (entity === 'event') { const event = item as EventRecord; setEditor({ entity, id: event.id, data: { name: event.name, location: event.location, startDate: inputDate(event.startDate), endDate: inputDate(event.endDate), status: event.status, riskLevel: event.riskLevel } }) }
    if (entity === 'venue') { const venue = item as Venue; setEditor({ entity, id: venue.id, data: { name: venue.name, capacity: venue.capacity, availability: venue.availability, status: venue.status } }) }
    if (entity === 'session') { const session = item as Session; setEditor({ entity, id: session.id, data: { name: session.name, owner: session.owner, venueId: session.venueId ?? '', startTime: inputDate(session.startTime), endTime: inputDate(session.endTime), requiredResources: session.requiredResources, status: session.status, risk: session.risk } }) }
    if (entity === 'task') { const task = item as Task; setEditor({ entity, id: task.id, data: { title: task.title, owner: task.owner, role: task.role, priority: task.priority, status: task.status, sessionId: task.sessionId ?? '', venueId: task.venueId ?? '', blocker: task.blocker ?? '' } }) }
  }
  const updateEditor = (key: string, value: string | number | null) => setEditor(current => current ? { ...current, data: { ...current.data, [key]: value } } : current)
  const saveEditor = async () => {
    if (!editor) return
    const { entity, id, data } = editor
    try {
      const normalised = { ...data, ...(entity === 'session' ? { venueId: data.venueId || null, eventId: activeEventId } : {}), ...(entity === 'task' ? { sessionId: data.sessionId || null, venueId: data.venueId || null, eventId: activeEventId } : {}), ...(entity === 'venue' ? { capacity: Number(data.capacity), eventId: activeEventId } : {}) }
      await request(`/api/${entity === 'event' ? 'events' : `${entity}s`}${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', normalised)
      setEditor(null); await loadAll(); showToast(`${entity[0].toUpperCase() + entity.slice(1)} ${id ? 'updated' : 'created'} successfully`)
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to save', true) }
  }
  const remove = async (entity: Editor['entity'], id: string) => {
    if (!window.confirm(`Delete this ${entity}? Linked records will be unassigned or removed.`)) return
    try { await request(`/api/${entity === 'event' ? 'events' : `${entity}s`}/${id}`, 'DELETE'); await loadAll(); showToast(`${entity[0].toUpperCase() + entity.slice(1)} deleted`) } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to delete', true) }
  }
  const setTaskStatus = async (task: Task, status: string) => {
    if (status === task.status || updatingTaskId) return
    const completedDelta = Number(status === 'Done') - Number(task.status === 'Done')
    const blockedDelta = Number(status === 'Blocked') - Number(task.status === 'Blocked')
    const inProgressDelta = Number(status === 'In Progress') - Number(task.status === 'In Progress')
    setUpdatingTaskId(task.id)
    setTasks(current => current.map(item => item.id === task.id ? { ...item, status } : item))
    setStats(current => {
      if (!current) return current
      const completedTasks = current.completedTasks + completedDelta
      return { ...current, completedTasks, blockedTasks: current.blockedTasks + blockedDelta, inProgressTasks: current.inProgressTasks + inProgressDelta, overallProgress: current.totalTasks ? completedTasks / current.totalTasks : 0 }
    })
    setEvents(current => current.map(event => event.id === activeEventId && stats ? { ...event, overallProgress: stats.totalTasks ? (stats.completedTasks + completedDelta) / stats.totalTasks : 0 } : event))
    try {
      await request(`/api/tasks/${task.id}`, 'PATCH', { status })
      await loadAll()
      showToast(status === 'Done' ? 'Task completed — readiness updated' : 'Task status updated')
    } catch (error) {
      await loadAll()
      showToast(error instanceof Error ? error.message : 'Unable to update task', true)
    } finally { setUpdatingTaskId(null) }
  }
  const runAnalysis = async () => {
    if (!selectedVenueId) return
    setAnalyzing(true); setImpact(null); setAnalysisError(null)
    try { setImpact(await request('/api/impact-analysis', 'POST', { type: 'Venue', id: selectedVenueId, eventId: activeEventId })) } catch (error) { const message = error instanceof Error ? error.message : 'Unable to generate AI analysis'; setAnalysisError(message); showToast(message, true) } finally { setAnalyzing(false) }
  }
  const activeEvent = events.find(event => event.id === activeEventId)
  const openCount = tasks.filter(task => task.status !== 'Done').length
  const progress = stats ? Math.round(stats.overallProgress * 100) : 0

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#e0e7ff_0,_#f8faff_38%,_#eef2ff_100%)] text-slate-900">
    <header className="sticky top-0 z-30 border-b border-indigo-100 bg-white/95 shadow-sm shadow-indigo-100/50 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-7">
        <button onClick={() => setTab('Dashboard')} className="flex items-center gap-3 text-left">
          <span className="grid size-10 place-items-center rounded-xl bg-slate-950 text-white shadow-lg shadow-slate-300"><Radio size={19} /></span>
          <span><strong className="font-display block text-lg leading-5 tracking-tight">EventAstra</strong><span className="text-xs text-slate-500">Operations workspace</span></span>
        </button>
        <div className="flex items-center gap-2">
          <select aria-label="Active event" value={activeEventId} onChange={event => { setActiveEventId(event.target.value); setImpact(null); setSelectedVenueId('') }} className="max-w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-400">
            {events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
          <button onClick={() => openNew('event')} className="button-primary hidden sm:inline-flex"><Plus size={16} /> New event</button>
        </div>
      </div>
      <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-7" aria-label="Primary navigation">
        {TABS.map(({ label, icon: Icon }) => <button key={label} onClick={() => setTab(label)} className={cn('flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-bold transition-colors', tab === label ? 'border-indigo-700 text-indigo-800' : 'border-transparent text-slate-600 hover:text-indigo-800')}><Icon size={15} />{label}</button>)}
      </nav>
    </header>
    {toast && <div className={cn('fixed right-5 top-24 z-50 rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl', toast.error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>{toast.message}</div>}
    <main className="mx-auto max-w-7xl px-4 py-7 sm:px-7">
      {tab === 'Dashboard' && stats && <div className="space-y-6">
        <div className="grid gap-5 lg:grid-cols-[1.55fr_.85fr]">
          <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-indigo-800 to-violet-800 p-7 text-white shadow-xl shadow-indigo-300 sm:p-8">
            <p className="mb-4 text-xs font-bold uppercase tracking-[.2em] text-indigo-200">Active event</p>
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-display text-3xl tracking-tight sm:text-4xl">{stats.eventName}</h1><p className="mt-2 flex items-center gap-1.5 text-sm text-slate-300"><MapPin size={15} />{activeEvent?.location ?? 'Set a location'}</p></div><Badge value={stats.eventStatus} /></div>
            <div className="mt-9 flex items-end justify-between"><div><p className="font-display text-5xl tabular-nums">{progress}%</p><p className="mt-1 text-sm text-slate-400">readiness across the event</p></div><p className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold tabular-nums">{stats.completedTasks}/{stats.totalTasks} tasks complete</p></div>
            <div className="mt-4" role="progressbar" aria-label="Event readiness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-2.5 overflow-hidden rounded-full bg-white/20"><div className="progress-fill h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-indigo-200" style={{ width: `${progress}%` }} /></div><p className="mt-3 flex items-center gap-2 text-xs font-semibold text-indigo-100"><span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_0_4px_rgba(103,232,249,.12)]" />Updates automatically as task statuses change</p></div>
          </section>
          <Panel className="p-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">Create something</p><h2 className="font-display mt-2 text-2xl">Keep the plan moving</h2><p className="mt-2 text-sm leading-6 text-slate-500">Add the next item without leaving your event workspace.</p><div className="mt-5 grid grid-cols-2 gap-2"><QuickAction icon={<CalendarDays size={17} />} label="Event" onClick={() => openNew('event')} /><QuickAction icon={<Clock3 size={17} />} label="Session" onClick={() => openNew('session')} /><QuickAction icon={<Check size={17} />} label="Task" onClick={() => openNew('task')} /><QuickAction icon={<MapPin size={17} />} label="Venue" onClick={() => openNew('venue')} /></div></Panel>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Open tasks" value={openCount} note={`${stats.completedTasks} finished`} /><Metric label="Blocked" value={stats.blockedTasks} note="Need attention" tone="rose" /><Metric label="Sessions" value={stats.totalSessions} note={`${stats.criticalRisks} high risk`} tone="amber" /><Metric label="Escalations" value={stats.escalationRequired} note="Leadership queue" tone="violet" /></div>
        <div className="grid gap-6 lg:grid-cols-[1.35fr_.85fr]">
          <Panel><SectionHeader title="Upcoming sessions" action="View all" onClick={() => setTab('Sessions')} /><div className="divide-y divide-slate-100">{sessions.length ? sessions.slice().sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(0, 5).map(session => <div key={session.id} className="flex items-center gap-4 px-5 py-4 sm:px-6"><div className="w-14 text-center"><p className="text-xs font-bold text-indigo-600">{new Date(session.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</p><p className="text-xs text-slate-400">{new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{session.name}</p><p className="mt-1 text-xs text-slate-500">{session.venue?.name ?? 'Venue unassigned'} · {session.owner}</p></div><Badge value={session.risk} /></div>) : <Empty label="No sessions yet" action="Add a session" onClick={() => openNew('session')} />}</div></Panel>
          <Panel><SectionHeader title="Action center" action="View tasks" onClick={() => setTab('Tasks')} /><div className="space-y-3 p-5">{tasks.filter(task => task.status !== 'Done').slice(0, 4).map(task => <div key={task.id} className="rounded-xl border border-slate-100 p-3"><div className="flex gap-2"><span className={cn('mt-1.5 size-2 rounded-full', task.priority === 'Critical' ? 'bg-rose-500' : task.priority === 'High' ? 'bg-amber-500' : 'bg-indigo-500')} /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.owner} · {task.role}</p></div><Badge value={task.status} /></div></div>)}{!tasks.some(task => task.status !== 'Done') && <Empty label="Everything is complete" action="Add task" onClick={() => openNew('task')} />}</div></Panel>
        </div>
      </div>}

      {tab === 'Events' && <EntityPage eyebrow="Portfolio" title="Events" description="Create, edit and switch between event plans." addLabel="New event" onAdd={() => openNew('event')}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{events.map(event => <Panel key={event.id} className={cn('p-5 transition hover:-translate-y-0.5 hover:shadow-md', event.id === activeEventId && 'ring-2 ring-indigo-500')}><div className="flex justify-between gap-3"><button className="text-left" onClick={() => { setActiveEventId(event.id); setTab('Dashboard') }}><p className="font-display text-xl">{event.name}</p><p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><MapPin size={14} />{event.location}</p></button><div className="flex"><IconButton label="Edit event" onClick={() => openEdit('event', event)} /><IconButton label="Delete event" danger onClick={() => remove('event', event.id)} /></div></div><div className="mt-5 flex items-center justify-between"><Badge value={event.status} /><span className="text-xs text-slate-500">{new Date(event.startDate).toLocaleDateString()} – {new Date(event.endDate).toLocaleDateString()}</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="progress-fill h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${event.overallProgress * 100}%` }} /></div><p className="mt-2 text-xs font-semibold text-slate-500">{Math.round(event.overallProgress * 100)}% ready <span className="font-normal text-slate-400">· task-driven</span></p></Panel>)}</div></EntityPage>}

      {tab === 'Sessions' && <EntityPage eyebrow="Program" title="Sessions" description="Build a schedule, assign owners and place each session in a venue." addLabel="New session" onAdd={() => openNew('session')}><div className="space-y-3">{sessions.map(session => <Panel key={session.id} className="p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl">{session.name}</h2><Badge value={session.status} /><Badge value={session.risk} /></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500"><span className="flex items-center gap-1.5"><Clock3 size={15} />{new Date(session.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span><span className="flex items-center gap-1.5"><MapPin size={15} />{session.venue?.name ?? 'Unassigned venue'}</span><span className="flex items-center gap-1.5"><Users size={15} />{session.owner}</span></div>{session.requiredResources && <p className="mt-3 text-xs text-slate-500"><strong className="text-slate-600">Resources:</strong> {session.requiredResources}</p>}</div><div className="flex shrink-0 self-end sm:self-start"><IconButton label="Edit session" onClick={() => openEdit('session', session)} /><IconButton label="Delete session" danger onClick={() => remove('session', session.id)} /></div></div></Panel>)}{!sessions.length && <Empty label="Your program is empty" action="Create the first session" onClick={() => openNew('session')} />}</div></EntityPage>}

      {tab === 'Tasks' && <EntityPage eyebrow="Workboard" title="Tasks" description="Edit ownership, priority and links from one focused board." addLabel="New task" onAdd={() => openNew('task')}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{STATUS.map(status => <Panel key={status} className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3"><h2 className="font-display text-lg">{status}</h2><span className="grid size-6 place-items-center rounded-full bg-white text-xs font-bold text-slate-500">{tasks.filter(task => task.status === status).length}</span></div><div className="min-h-32 space-y-3 p-3">{tasks.filter(task => task.status === status).map(task => <article key={task.id} className={cn('rounded-xl border p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md', task.escalationRequired ? 'border-rose-200 bg-rose-50/40' : 'border-slate-100 bg-white')}><div className="flex justify-between gap-2"><h3 className="text-sm font-bold leading-5">{task.title}</h3><div className="flex -mt-1 -mr-2"><IconButton label="Edit task" onClick={() => openEdit('task', task)} /><IconButton label="Delete task" danger onClick={() => remove('task', task.id)} /></div></div><p className="mt-2 text-xs text-slate-500">{task.owner} · {task.role}</p>{task.blocker && <p className="mt-2 text-xs text-rose-600">{task.blocker}</p>}<div className="mt-3 flex items-center justify-between gap-2"><Badge value={task.priority} /><select aria-label={`Change ${task.title} status`} disabled={updatingTaskId === task.id} value={task.status} onChange={event => setTaskStatus(task, event.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-wait disabled:opacity-60">{STATUS.map(option => <option key={option}>{option}</option>)}</select></div></article>)}</div></Panel>)}</div></EntityPage>}

      {tab === 'Venues' && <EntityPage eyebrow="Locations" title="Venues" description="Keep capacities and availability visible while you schedule." addLabel="New venue" onAdd={() => openNew('venue')}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{venues.map(venue => { const assigned = sessions.filter(session => session.venueId === venue.id).length; return <Panel key={venue.id} className="p-5"><div className="flex justify-between"><div><div className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><MapPin size={19} /></div><h2 className="font-display mt-4 text-xl">{venue.name}</h2></div><div className="flex"><IconButton label="Edit venue" onClick={() => openEdit('venue', venue)} /><IconButton label="Delete venue" danger onClick={() => remove('venue', venue.id)} /></div></div><div className="mt-5 flex gap-2"><Badge value={venue.availability} /><Badge value={venue.status} /></div><div className="mt-5 grid grid-cols-2 border-t border-slate-100 pt-4"><div><p className="text-xl font-bold">{venue.capacity}</p><p className="text-xs text-slate-500">capacity</p></div><div><p className="text-xl font-bold">{assigned}</p><p className="text-xs text-slate-500">sessions placed</p></div></div></Panel> })}{!venues.length && <Empty label="No venues in this event" action="Add a venue" onClick={() => openNew('venue')} />}</div></EntityPage>}

      {tab === 'Impact Analysis' && <div className="mx-auto max-w-4xl space-y-6"><PageTitle eyebrow="AI planning tool" title="Venue impact analysis" description="Generate grounded operational recommendations from your event’s current data." /><Panel className="border-indigo-100 p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700"><Sparkles size={19} /></span><div><p className="font-bold text-slate-800">AI-grounded recommendations</p><p className="mt-1 text-sm leading-5 text-slate-500">The analysis uses only the selected venue, its linked sessions, tasks, resources and known alternatives. Missing information is called out as an assumption.</p></div></div><label className="label mt-6 block">Venue to simulate as unavailable</label><div className="mt-2 flex flex-col gap-3 sm:flex-row"><select value={selectedVenueId} onChange={event => { setSelectedVenueId(event.target.value); setImpact(null); setAnalysisError(null) }} className="field flex-1"><option value="">Select a venue</option>{venues.map(venue => <option key={venue.id} value={venue.id}>{venue.name} · {venue.capacity} capacity</option>)}</select><button className="button-primary" disabled={!selectedVenueId || analyzing} onClick={runAnalysis}>{analyzing ? 'Generating…' : 'Generate AI analysis'} <Sparkles size={16} /></button></div></Panel>{analysisError && <Panel className="border-rose-200 bg-rose-50 p-5"><p className="font-semibold text-rose-800">AI analysis is not available yet</p><p className="mt-1 text-sm leading-5 text-rose-700">{analysisError}</p><p className="mt-3 text-xs text-rose-600">Add a Gemini, OpenAI, Anthropic, or compatible-provider key to <code>server/.env</code>, restart the API, then generate the report again.</p></Panel>}{impact && <Panel className="p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">AI impact report</p><h2 className="font-display mt-1 text-2xl">{impact.venueName}</h2></div><Badge value={impact.severity} /></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Sessions', impact.affectedSessionCount], ['Tasks', impact.affectedTaskCount], ['Resources', impact.affectedResourceCount], ['Volunteers', impact.affectedVolunteerCount]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><p className="font-display text-2xl">{value}</p><p className="text-xs text-slate-500">{label}</p></div>)}</div><p className="mt-6 border-l-4 border-indigo-400 pl-4 text-sm leading-6 text-slate-700">{impact.summary}</p><div className="mt-7"><p className="text-sm font-bold text-slate-900">Recommended actions</p><ol className="mt-3 space-y-3">{impact.recommendedActions.map((action, index) => <li key={`${action.action}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"><div className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{index + 1}</span><div><p className="font-semibold text-slate-800">{action.action}</p><p className="mt-1 text-sm leading-5 text-slate-600">{action.why}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500"><span>Owner: {action.owner}</span><span>When: {action.when}</span><span>Needs: {action.dependency}</span></div></div></div></li>)}</ol></div><div className="mt-7 grid gap-5 md:grid-cols-2"><div className="rounded-xl bg-indigo-50 p-4"><p className="text-sm font-bold text-indigo-950">Schedule guidance</p><p className="mt-2 text-sm leading-6 text-indigo-900">{impact.scheduleAdvice}</p></div><div className="rounded-xl bg-amber-50 p-4"><p className="text-sm font-bold text-amber-950">Watchouts</p><ul className="mt-2 space-y-2 text-sm leading-5 text-amber-900">{impact.watchouts.map(item => <li key={item}>• {item}</li>)}</ul></div></div><div className="mt-6 grid gap-5 md:grid-cols-2"><div><p className="text-sm font-bold">Communication plan</p><ul className="mt-2 space-y-2 text-sm leading-5 text-slate-600">{impact.communicationPlan.map(item => <li key={item}>• {item}</li>)}</ul></div><div><p className="text-sm font-bold">Assumptions to verify</p><ul className="mt-2 space-y-2 text-sm leading-5 text-slate-600">{impact.assumptions.map(item => <li key={item}>• {item}</li>)}</ul></div></div><p className="mt-7 border-t border-slate-100 pt-4 text-xs text-slate-400">Generated by {impact.model} from the current event data.</p></Panel>}</div>}

      {tab === 'Notion Sync' && <div className="mx-auto max-w-2xl space-y-6"><PageTitle eyebrow="Integration" title="Notion sync" description="Export local work or explicitly import mapped edits made in Notion." /><Panel className="p-6"><div className="flex items-center gap-4"><span className={cn('size-3 rounded-full', notionStatus?.connected ? 'bg-emerald-500' : 'bg-rose-400')} /><div><h2 className="font-display text-xl">{notionStatus?.connected ? 'Connected to Notion' : notionStatus ? 'Notion needs attention' : 'Checking connection'}</h2><p className="mt-1 text-sm text-slate-500">{notionStatus?.connected ? `${notionStatus.dbCount} databases available` : notionStatus?.error ?? 'Add NOTION_TOKEN to server/.env to enable sync.'}</p></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><button className="button-primary" disabled={!notionStatus?.connected || pushingNotion} onClick={pushLocalToNotion}><RefreshCw size={16} />{pushingNotion ? 'Exporting…' : 'Export local state'}</button><button className="button-secondary" disabled={!notionStatus?.connected || reconcilingNotion} onClick={importNotionEdits}><RefreshCw size={16} />{reconcilingNotion ? 'Importing…' : 'Import Notion edits'}</button></div><p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Imports are explicit: Notion wins for mapped fields on matching EventAstra records. Clearing a mapped Notion relation clears the local link; broken links are preserved and reported. Unmatched or deleted Notion records are never deleted locally.</p><button className="button-secondary mt-4" onClick={() => request('/api/notion/status').then(setNotionStatus).catch(() => showToast('Notion status is unavailable', true))}><RefreshCw size={16} /> Refresh status</button></Panel></div>}
    </main>
    {editor && <EditorModal editor={editor} update={updateEditor} onClose={() => setEditor(null)} onSave={saveEditor} venues={venues} sessions={sessions} />}
  </div>
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) { return <button onClick={onClick} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">{icon}{label}</button> }
function Metric({ label, value, note, tone = 'indigo' }: { label: string; value: number; note: string; tone?: 'indigo' | 'rose' | 'amber' | 'violet' }) { const colors = { indigo: 'text-indigo-600', rose: 'text-rose-600', amber: 'text-amber-600', violet: 'text-violet-600' }; return <Panel className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className={cn('font-display mt-2 text-3xl', colors[tone])}>{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></Panel> }
function SectionHeader({ title, action, onClick }: { title: string; action: string; onClick: () => void }) { return <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="font-display text-xl">{title}</h2><button onClick={onClick} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">{action}<ChevronRight size={14} /></button></div> }
function Empty({ label, action, onClick }: { label: string; action: string; onClick: () => void }) { return <div className="p-6 text-center text-sm text-slate-500"><p>{label}</p><button onClick={onClick} className="mt-3 font-bold text-indigo-600 hover:text-indigo-800">{action}</button></div> }
function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">{eyebrow}</p><h1 className="font-display mt-1 text-3xl tracking-tight">{title}</h1><p className="mt-1 text-sm text-slate-500">{description}</p></div> }
function EntityPage({ eyebrow, title, description, addLabel, onAdd, children }: { eyebrow: string; title: string; description: string; addLabel: string; onAdd: () => void; children: React.ReactNode }) { return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-4"><PageTitle eyebrow={eyebrow} title={title} description={description} /><button onClick={onAdd} className="button-primary"><Plus size={17} />{addLabel}</button></div>{children}</div> }

function ModalInput({ data, update, name, label, type = 'text', required = false }: { data: Editor['data']; update: (key: string, value: string | number | null) => void; name: string; label: string; type?: string; required?: boolean }) {
  return <label><span className="label">{label}</span><input required={required} type={type} value={String(data[name] ?? '')} onChange={event => update(name, type === 'number' || type === 'range' ? Number(event.target.value) : event.target.value)} className="field mt-1" /></label>
}

function ModalSelect({ data, update, name, label, options }: { data: Editor['data']; update: (key: string, value: string | number | null) => void; name: string; label: string; options: { label: string; value: string }[] }) {
  return <label><span className="label">{label}</span><select value={String(data[name] ?? '')} onChange={event => update(name, event.target.value)} className="field mt-1">{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
}

function EditorModal({ editor, update, onClose, onSave, venues, sessions }: { editor: Editor; update: (key: string, value: string | number | null) => void; onClose: () => void; onSave: () => void; venues: Venue[]; sessions: Session[] }) {
  const { entity, data, id } = editor
  const title = `${id ? 'Edit' : 'New'} ${entity}`
  const fieldProps = { data, update }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4"><form onSubmit={event => { event.preventDefault(); onSave() }} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Event workspace</p><h2 className="font-display mt-1 text-2xl capitalize">{title}</h2></div><button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">Close</button></div><div className="mt-6 grid gap-4 sm:grid-cols-2">
    {entity === 'event' && <><ModalInput {...fieldProps} name="name" label="Event name" required /><ModalInput {...fieldProps} name="location" label="Location" required /><ModalInput {...fieldProps} name="startDate" label="Start" type="datetime-local" required /><ModalInput {...fieldProps} name="endDate" label="End" type="datetime-local" required /><ModalSelect {...fieldProps} name="status" label="Status" options={['Planning', 'Live', 'At Risk', 'Completed'].map(value => ({ label: value, value }))} /><ModalSelect {...fieldProps} name="riskLevel" label="Risk level" options={['Low', 'Medium', 'High'].map(value => ({ label: value, value }))} /><p className="sm:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm leading-5 text-indigo-800"><strong>Readiness is automatic.</strong> It reflects the share of this event’s tasks marked Done.</p></>}
    {entity === 'venue' && <><ModalInput {...fieldProps} name="name" label="Venue name" required /><ModalInput {...fieldProps} name="capacity" label="Capacity" type="number" required /><ModalSelect {...fieldProps} name="availability" label="Availability" options={['Available', 'Unavailable', 'Limited'].map(value => ({ label: value, value }))} /><ModalSelect {...fieldProps} name="status" label="Status" options={['Active', 'Reserved', 'Closed', 'Standby'].map(value => ({ label: value, value }))} /></>}
    {entity === 'session' && <><ModalInput {...fieldProps} name="name" label="Session name" required /><ModalInput {...fieldProps} name="owner" label="Session owner" required /><ModalInput {...fieldProps} name="startTime" label="Start" type="datetime-local" required /><ModalInput {...fieldProps} name="endTime" label="End" type="datetime-local" required /><ModalSelect {...fieldProps} name="venueId" label="Venue" options={[{ label: 'No venue yet', value: '' }, ...venues.map(venue => ({ label: `${venue.name} (${venue.capacity})`, value: venue.id }))]} /><ModalSelect {...fieldProps} name="status" label="Status" options={['Scheduled', 'Live', 'Completed', 'At Risk', 'Needs Rescheduling'].map(value => ({ label: value, value }))} /><ModalSelect {...fieldProps} name="risk" label="Risk level" options={['Low', 'Medium', 'High'].map(value => ({ label: value, value }))} /><label className="sm:col-span-2"><span className="label">Required resources</span><textarea value={String(data.requiredResources ?? '')} onChange={event => update('requiredResources', event.target.value)} className="field mt-1 min-h-20" placeholder="Projector, microphones, signage…" /></label></>}
    {entity === 'task' && <><ModalInput {...fieldProps} name="title" label="Task title" required /><ModalInput {...fieldProps} name="owner" label="Owner" required /><ModalSelect {...fieldProps} name="role" label="Team" options={ROLES.map(value => ({ label: value, value }))} /><ModalSelect {...fieldProps} name="priority" label="Priority" options={['Low', 'Medium', 'High', 'Critical'].map(value => ({ label: value, value }))} /><ModalSelect {...fieldProps} name="status" label="Status" options={STATUS.map(value => ({ label: value, value }))} /><ModalSelect {...fieldProps} name="sessionId" label="Linked session" options={[{ label: 'No linked session', value: '' }, ...sessions.map(session => ({ label: session.name, value: session.id }))]} /><ModalSelect {...fieldProps} name="venueId" label="Linked venue" options={[{ label: 'No linked venue', value: '' }, ...venues.map(venue => ({ label: venue.name, value: venue.id }))]} /><label className="sm:col-span-2"><span className="label">Blocker (optional)</span><input value={String(data.blocker ?? '')} onChange={event => update('blocker', event.target.value)} className="field mt-1" placeholder="Describe what is holding this up" /></label></>}
  </div><div className="mt-7 flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" onClick={onClose} className="button-secondary">Cancel</button><button className="button-primary" type="submit">{id ? 'Save changes' : `Create ${entity}`}</button></div></form></div>
}
