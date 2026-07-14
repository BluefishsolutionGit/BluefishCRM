import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import type { ActivityDto, ActivityStatus, ActivityType, CustomerDto, UserDto } from '@bluefish/shared'
import { SERVICE_LINES } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

const TYPE_COLOR: Record<ActivityType, string> = {
  meeting: '#2A6FDB', call: '#1F5AC2', visit: '#B4650A', demo: '#6C55E0',
  task: '#0E9C7E', follow_up: '#7C3AED', email: '#8888A0',
}
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const SERVICE_COLOR: Record<string, string> = { Box: '#2A6FDB', '3S': '#0E9C7E', '3D': '#B4650A', 'AI&RPA': '#6C55E0' }

type ViewMode = 'week' | 'month' | 'monthList'

function startOfWeek(d: Date): Date {
  const out = new Date(d); out.setHours(0, 0, 0, 0)
  const dow = out.getDay()
  const diff = dow === 0 ? -6 : 1 - dow  // Monday start
  out.setDate(out.getDate() + diff)
  return out
}
function startOfMonth(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), 1); out.setHours(0, 0, 0, 0); return out
}
function endOfMonth(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth() + 1, 1); out.setHours(0, 0, 0, 0); return out
}
function sameDay(a: Date, b: Date): boolean {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
}
const isToday = (d: Date): boolean => sameDay(d, new Date())

export default function Activities() {
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState<Date>(today)
  const [items, setItems] = useState<ActivityDto[]>([])
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [users, setUsers] = useState<UserDto[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ActivityDto | null>(null)
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('opportunity:write')

  useEffect(() => { api.users().then(setUsers).catch(() => {}) }, [])

  const range = useMemo(() => {
    if (view === 'week') {
      const from = startOfWeek(anchor)
      const to = new Date(from); to.setDate(to.getDate() + 7)
      return { from, to }
    }
    // month + monthList share the same window
    return { from: startOfMonth(anchor), to: endOfMonth(anchor) }
  }, [view, anchor])

  const reload = async () => {
    try { setItems(await api.activities({ from: range.from, to: range.to })) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed to load activities') }
  }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range.from.getTime(), range.to.getTime()])

  const filtered = useMemo(() => items.filter((a) => {
    if (ownerFilter !== 'all' && a.ownerId !== ownerFilter) return false
    if (serviceFilter !== 'all') {
      if (serviceFilter === 'unassigned') { if (a.opportunityServiceOrProduct) return false }
      else if (a.opportunityServiceOrProduct !== serviceFilter) return false
    }
    return true
  }), [items, ownerFilter, serviceFilter])

  const serviceCounts = useMemo(() => {
    const acc: Record<string, number> = { all: items.length, unassigned: 0 }
    for (const s of SERVICE_LINES) acc[s] = 0
    for (const a of items) {
      if (a.opportunityServiceOrProduct && acc[a.opportunityServiceOrProduct] !== undefined) acc[a.opportunityServiceOrProduct]++
      else if (!a.opportunityServiceOrProduct) acc.unassigned++
    }
    return acc
  }, [items])

  const sel = filtered.find((x) => x.id === selId) ?? filtered[0]

  const shift = (units: number) => {
    const d = new Date(anchor)
    if (view === 'week') d.setDate(d.getDate() + units * 7)
    else d.setMonth(d.getMonth() + units)
    setAnchor(d)
  }
  const jumpToToday = () => setAnchor(new Date())

  const del = async (id: string) => {
    if (!window.confirm('Delete activity?')) return
    try { await api.deleteActivity(id); toast('Deleted'); reload() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Delete failed') }
  }
  const setStatus = async (a: ActivityDto, status: ActivityStatus) => {
    try {
      const upd = await api.updateActivity(a.id, { status })
      setItems((xs) => xs.map((x) => (x.id === upd.id ? upd : x)))
      toast(`Marked ${status}`)
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Update failed') }
  }

  const openEdit = (a: ActivityDto) => { setEditing(a); setModalOpen(true) }

  const rangeLabel = view === 'week'
    ? `${range.from.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${new Date(range.to.getTime() - 1).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '22px 28px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 600 }}>Activities</div>

        <div style={{ display: 'flex', background: '#fff', border: '1px solid #E5E7F0', borderRadius: 9, padding: 3, gap: 2 }}>
          {(['week', 'month', 'monthList'] as ViewMode[]).map((v) => (
            <div key={v} onClick={() => setView(v)} style={viewTab(view === v)}>
              {v === 'week' ? 'Week' : v === 'month' ? 'Month' : 'Month list'}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12.5, color: '#5C5C74', minWidth: 200 }}>{rangeLabel}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div onClick={() => shift(-1)} style={navBtn}>‹</div>
          <div onClick={jumpToToday} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 12, fontWeight: 700 }}>Today</div>
          <div onClick={() => shift(1)} style={navBtn}>›</div>
        </div>

        <div style={{ flex: 1 }} />
        {canWrite && <div onClick={() => { setEditing(null); setModalOpen(true) }} style={primaryBtn}>+ New activity</div>}
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8888A0', letterSpacing: '.06em', textTransform: 'uppercase' }}>Sales</div>
        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} style={selectSm}>
          <option value="all">All owners ({items.length})</option>
          {users.filter((u) => u.role === 'sales_rep' || u.role === 'sales_manager').map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({items.filter((a) => a.ownerId === u.id).length})</option>
          ))}
        </select>

        <div style={{ width: 1, height: 22, background: '#E5E7F0', margin: '0 4px' }} />

        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8888A0', letterSpacing: '.06em', textTransform: 'uppercase' }}>Service</div>
        {(['all', ...SERVICE_LINES, 'unassigned'] as const).map((s) => {
          const active = serviceFilter === s
          const color = s === 'all' ? '#5C5C74' : s === 'unassigned' ? '#B4B4C4' : (SERVICE_COLOR[s] ?? '#5C5C74')
          const label = s === 'all' ? 'All' : s === 'unassigned' ? 'No service' : s
          const cnt = serviceCounts[s] ?? 0
          return (
            <div
              key={s}
              onClick={() => setServiceFilter(s)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: active ? color : hexToRgba(color, 0.09),
                color: active ? '#fff' : color,
                border: `1px solid ${active ? color : hexToRgba(color, 0.35)}`,
                borderRadius: 999, padding: '5px 11px',
                fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#fff' : color }} />
              {label}
              <span style={{ opacity: 0.85, fontFamily: "'IBM Plex Mono', monospace" }}>{cnt}</span>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14, fontSize: 11.5, color: '#5C5C74', flexWrap: 'wrap' }}>
        {(Object.keys(TYPE_COLOR) as ActivityType[]).map((t) => (
          <span key={t}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: TYPE_COLOR[t], marginRight: 5 }} />{t}</span>
        ))}
        <span style={{ marginLeft: 8, color: '#0E6E4E' }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: '#0E9C7E', marginRight: 5 }} />done</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: view === 'monthList' ? '1fr' : '1fr 330px', gap: 14, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'hidden' }}>
          {view === 'week' && <WeekView from={range.from} activities={filtered} selId={sel?.id ?? null} onSelect={setSelId} onOpen={openEdit} />}
          {view === 'month' && <MonthGridView month={anchor} activities={filtered} onSelect={setSelId} onOpen={openEdit} />}
          {view === 'monthList' && <MonthListView activities={filtered} onOpen={openEdit} />}
        </div>

        {view !== 'monthList' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sel ? (
              <div style={card}>
                <div style={sectionLabel}>Selected activity</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{sel.title}</div>
                <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 3 }}>
                  {new Date(sel.scheduledAt).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {sel.ownerName}
                </div>
                {sel.customerName && <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 3 }}>Customer: {sel.customerName}</div>}
                {sel.opportunityTitle && (
                  <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 3 }}>
                    Deal: {sel.opportunityTitle}
                    {sel.opportunityServiceOrProduct && <span style={{ marginLeft: 6, background: hexToRgba(SERVICE_COLOR[sel.opportunityServiceOrProduct] ?? '#5C5C74', 0.12), color: SERVICE_COLOR[sel.opportunityServiceOrProduct] ?? '#5C5C74', border: `1px solid ${hexToRgba(SERVICE_COLOR[sel.opportunityServiceOrProduct] ?? '#5C5C74', 0.35)}`, borderRadius: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{sel.opportunityServiceOrProduct}</span>}
                  </div>
                )}
                {sel.location && <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 3 }}>📍 {sel.location}</div>}
                {sel.meetingLink && <div style={{ fontSize: 12, marginTop: 3 }}>🔗 <a href={sel.meetingLink} target="_blank" rel="noopener noreferrer" style={{ color: '#2A6FDB' }}>{sel.meetingLink}</a></div>}
                {sel.notes && <div style={{ marginTop: 12, background: '#F7F8FC', borderRadius: 8, padding: '10px 12px', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{sel.notes}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <StatusPill status={sel.status} />
                  {canWrite && sel.status !== 'completed' && <div onClick={() => setStatus(sel, 'completed')} style={{ ...miniBtn, background: '#0E9C7E', color: '#fff', borderColor: '#0E9C7E' }}>✓ Mark done</div>}
                  {canWrite && sel.status === 'completed' && <div onClick={() => setStatus(sel, 'scheduled')} style={miniBtn}>↺ Cancel mark</div>}
                  {canWrite && sel.status === 'scheduled' && <div onClick={() => setStatus(sel, 'cancelled')} style={miniBtn}>Cancel</div>}
                  {canWrite && <div onClick={() => openEdit(sel)} style={miniBtn}>Edit</div>}
                  {canWrite && <div onClick={() => del(sel.id)} style={{ ...miniBtn, color: '#C0392B' }}>Delete</div>}
                </div>
                <div style={{ fontSize: 10.5, color: '#8888A0', marginTop: 12 }}>Tip: double-click any activity to edit.</div>
              </div>
            ) : (
              <div style={{ ...card, color: '#8888A0', fontSize: 13 }}>Nothing here in this range.</div>
            )}
          </div>
        )}
      </div>

      {modalOpen && <ActivityModal initial={editing} onClose={() => setModalOpen(false)} onSaved={reload} onDeleted={reload} />}
    </div>
  )
}

// ─── Week view ────────────────────────────────────────
function WeekView({ from, activities, selId, onSelect, onOpen }: { from: Date; activities: ActivityDto[]; selId: string | null; onSelect: (id: string) => void; onOpen: (a: ActivityDto) => void }) {
  const days = Array.from({ length: 6 }, (_, i) => {
    const day = new Date(from); day.setDate(day.getDate() + i)
    const events = activities
      .filter((e) => sameDay(new Date(e.scheduledAt), day))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    return { day, events }
  })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)' }}>
      {days.map((d, i) => {
        const todayHi = isToday(d.day)
        return (
          <div key={i} style={{ borderRight: '1px solid #F2F3F9', minHeight: 420, background: todayHi ? '#FFFCEB' : 'transparent' }}>
            <div style={{ padding: '10px 12px', borderBottom: `2px solid ${todayHi ? '#B4650A' : '#F2F3F9'}`, color: todayHi ? '#B4650A' : '#5C5C74', background: todayHi ? '#FEF3E2' : 'transparent' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em' }}>{DAY_NAMES[d.day.getDay()]}{todayHi && ' · TODAY'}</div>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 700 }}>{d.day.getDate()}</div>
            </div>
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {d.events.map((e) => (
                <EventCard key={e.id} e={e} selected={selId === e.id} onClick={() => onSelect(e.id)} onDoubleClick={() => onOpen(e)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Month grid view ──────────────────────────────────
function MonthGridView({ month, activities, onSelect, onOpen }: { month: Date; activities: ActivityDto[]; onSelect: (id: string) => void; onOpen: (a: ActivityDto) => void }) {
  const first = startOfMonth(month)
  const firstDow = first.getDay()  // 0=Sun
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: Array<{ date: Date | null; events: ActivityDto[] }> = []
  const leading = firstDow === 0 ? 6 : firstDow - 1  // Monday start
  for (let i = 0; i < leading; i++) cells.push({ date: null, events: [] })
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(month.getFullYear(), month.getMonth(), d)
    const events = activities.filter((e) => sameDay(new Date(e.scheduledAt), date))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    cells.push({ date, events })
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, events: [] })

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: '#FAFBFD', borderBottom: '1px solid #E5E7F0' }}>
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
          <div key={d} style={{ padding: '9px 10px', fontSize: 10.5, fontWeight: 700, color: '#5C5C74', letterSpacing: '.05em' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {cells.map((c, i) => {
          if (!c.date) return <div key={i} style={{ borderRight: '1px solid #F2F3F9', borderBottom: '1px solid #F2F3F9', minHeight: 110, background: '#FAFBFD' }} />
          const todayHi = isToday(c.date)
          return (
            <div key={i} style={{ borderRight: '1px solid #F2F3F9', borderBottom: '1px solid #F2F3F9', minHeight: 110, background: todayHi ? '#FFFCEB' : '#fff', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: todayHi ? '#fff' : '#3B3B52',
                  background: todayHi ? '#B4650A' : 'transparent',
                  borderRadius: '50%',
                  width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{c.date.getDate()}</div>
                {todayHi && <div style={{ fontSize: 9, fontWeight: 700, color: '#B4650A', letterSpacing: '.06em' }}>TODAY</div>}
              </div>
              {c.events.slice(0, 3).map((e) => (
                <MonthCell key={e.id} e={e} onClick={() => onSelect(e.id)} onDoubleClick={() => onOpen(e)} />
              ))}
              {c.events.length > 3 && (
                <div style={{ fontSize: 10, color: '#5C5C74', paddingLeft: 4 }}>+{c.events.length - 3} more</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Month list view ──────────────────────────────────
function MonthListView({ activities, onOpen }: { activities: ActivityDto[]; onOpen: (a: ActivityDto) => void }) {
  const sorted = [...activities].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
  const groups = new Map<string, ActivityDto[]>()
  for (const a of sorted) {
    const key = new Date(a.scheduledAt).toDateString()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }
  if (sorted.length === 0) return <div style={{ padding: 30, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No activities in this range.</div>
  return (
    <div>
      {Array.from(groups.entries()).map(([key, evts]) => {
        const d = new Date(key)
        const todayHi = isToday(d)
        return (
          <div key={key} style={{ borderBottom: '1px solid #F2F3F9' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '10px 16px', background: todayHi ? '#FEF3E2' : '#FAFBFD', borderBottom: '1px solid #F2F3F9' }}>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700, color: todayHi ? '#B4650A' : '#1E1E30' }}>
                {d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })}
              </div>
              {todayHi && <span style={{ fontSize: 10, fontWeight: 800, color: '#B4650A', letterSpacing: '.06em' }}>TODAY</span>}
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 11, color: '#8888A0' }}>{evts.length} {evts.length === 1 ? 'activity' : 'activities'}</div>
            </div>
            <div style={{ padding: '4px 12px 8px' }}>
              {evts.map((e) => (
                <div key={e.id} onDoubleClick={() => onOpen(e)} onClick={() => onOpen(e)} style={{ display: 'grid', gridTemplateColumns: '60px 24px 1.5fr 1fr 1fr 90px', gap: 10, padding: '10px 8px', borderBottom: '1px solid #F7F8FC', alignItems: 'center', cursor: 'pointer', background: e.status === 'completed' ? '#F0FBF4' : e.status === 'cancelled' ? '#FDF3F1' : 'transparent', borderLeft: `3px solid ${e.status === 'completed' ? '#0E9C7E' : TYPE_COLOR[e.type]}` }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#5C5C74' }}>{new Date(e.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                  <div style={{ width: 18, height: 18, borderRadius: 5, background: TYPE_COLOR[e.type], fontSize: 10, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{e.type[0].toUpperCase()}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: e.status === 'completed' ? '#0E6E4E' : '#1E1E30', textDecoration: e.status === 'cancelled' ? 'line-through' : undefined }}>{e.title}</div>
                  <div style={{ fontSize: 11.5, color: '#5C5C74' }}>{e.customerName ?? e.opportunityTitle ?? '—'}</div>
                  <div style={{ fontSize: 11.5, color: '#5C5C74' }}>{e.ownerName}</div>
                  <div><StatusPill status={e.status} small /></div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EventCard({ e, selected, onClick, onDoubleClick }: { e: ActivityDto; selected: boolean; onClick: () => void; onDoubleClick: () => void }) {
  const done = e.status === 'completed'
  const cancelled = e.status === 'cancelled'
  const c = TYPE_COLOR[e.type]
  const bg = done ? '#E5F8ED' : cancelled ? '#F5F5F7' : selected ? '#2E1A6B' : '#F7F8FC'
  const fg = done ? '#0E6E4E' : cancelled ? '#8888A0' : selected ? '#fff' : '#1E1E30'
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{ borderLeft: `3px solid ${done ? '#0E9C7E' : c}`, background: bg, color: fg, borderRadius: 9, padding: '8px 10px', cursor: 'pointer', textDecoration: cancelled ? 'line-through' : undefined }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, opacity: 0.75 }}>{new Date(e.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
        {done && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#0E6E4E' }}>✓ DONE</span>}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.35, marginTop: 2 }}>{e.title}</div>
      <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 1 }}>{e.ownerName}</div>
    </div>
  )
}

function MonthCell({ e, onClick, onDoubleClick }: { e: ActivityDto; onClick: () => void; onDoubleClick: () => void }) {
  const done = e.status === 'completed'
  const cancelled = e.status === 'cancelled'
  const c = TYPE_COLOR[e.type]
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={`${e.title} · ${e.ownerName}${e.customerName ? ' · ' + e.customerName : ''}`}
      style={{
        fontSize: 10.5, padding: '2px 6px', borderRadius: 5, cursor: 'pointer',
        background: done ? '#E5F8ED' : cancelled ? '#F5F5F7' : hexToRgba(c, 0.15),
        color: done ? '#0E6E4E' : cancelled ? '#8888A0' : c,
        borderLeft: `2px solid ${done ? '#0E9C7E' : c}`,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        fontWeight: 600,
        textDecoration: cancelled ? 'line-through' : undefined,
      }}
    >
      {done && '✓ '}{new Date(e.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} {e.title}
    </div>
  )
}

function StatusPill({ status, small }: { status: ActivityStatus; small?: boolean }) {
  const style = status === 'completed'
    ? { bg: '#E5F8ED', fg: '#0E6E4E' }
    : status === 'cancelled'
      ? { bg: '#FDECEA', fg: '#C0392B' }
      : { bg: '#E4EDFC', fg: '#2A6FDB' }
  return (
    <span style={{
      background: style.bg, color: style.fg,
      borderRadius: 8, fontSize: small ? 10 : 11, fontWeight: 700,
      padding: small ? '2px 7px' : '3px 9px',
    }}>{status === 'completed' ? '✓ DONE' : status.toUpperCase()}</span>
  )
}

// ─── Modal ────────────────────────────────────────────
function ActivityModal({ initial, onClose, onSaved, onDeleted }: { initial: ActivityDto | null; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const [users, setUsers] = useState<UserDto[]>([])
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [type, setType] = useState<ActivityType>((initial?.type as ActivityType) ?? 'meeting')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [scheduledAt, setScheduledAt] = useState(initial ? initial.scheduledAt.slice(0, 16) : new Date().toISOString().slice(0, 16))
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? '')
  const [customerId, setCustomerId] = useState(initial?.customerId ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [meetingLink, setMeetingLink] = useState(initial?.meetingLink ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [status, setLocalStatus] = useState<ActivityStatus>(initial?.status ?? 'scheduled')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('opportunity:write')

  useEffect(() => {
    api.users().then((us) => { setUsers(us); if (!ownerId && us[0]) setOwnerId(us[0].id) }).catch(() => {})
    api.customers().then(setCustomers).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = async (extra?: Partial<{ status: ActivityStatus }>) => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const payload = {
        type, title,
        scheduledAt: new Date(scheduledAt).toISOString(),
        ownerId,
        customerId: customerId || undefined,
        location: location || undefined,
        meetingLink: meetingLink || undefined,
        notes: notes || undefined,
        status: extra?.status ?? status,
      }
      if (initial) await api.updateActivity(initial.id, payload)
      else await api.createActivity(payload)
      onSaved(); onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed')
    } finally { setBusy(false) }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); persist() }

  const markDone = async () => {
    if (!initial) return
    setLocalStatus('completed')
    await persist({ status: 'completed' })
  }
  const unmarkDone = async () => {
    if (!initial) return
    setLocalStatus('scheduled')
    await persist({ status: 'scheduled' })
  }
  const cancel = async () => {
    if (!initial) return
    setLocalStatus('cancelled')
    await persist({ status: 'cancelled' })
  }
  const remove = async () => {
    if (!initial) return
    if (!window.confirm('Delete activity? This cannot be undone.')) return
    try {
      await api.deleteActivity(initial.id)
      toast('Activity deleted')
      onDeleted(); onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed')
    }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 700, flex: 1 }}>{initial ? 'Edit activity' : 'New activity'}</div>
            {initial && <StatusPill status={status} />}
            <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0', padding: '0 4px' }}>×</div>
          </div>

          {initial && canWrite && (
            <div style={{ padding: '10px 22px', borderBottom: '1px solid #F2F3F9', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {status !== 'completed' && <button type="button" onClick={markDone} disabled={busy} style={{ ...btnAction, background: '#0E9C7E', color: '#fff' }}>✓ Mark done</button>}
              {status === 'completed' && <button type="button" onClick={unmarkDone} disabled={busy} style={{ ...btnAction, background: '#fff', color: '#B4650A', borderColor: '#F0BA95' }}>↺ Cancel mark</button>}
              {status !== 'cancelled' && <button type="button" onClick={cancel} disabled={busy} style={btnAction}>Cancel activity</button>}
              <button type="button" onClick={remove} disabled={busy} style={{ ...btnAction, color: '#C0392B', borderColor: '#F5B7B1' }}>Delete</button>
            </div>
          )}

          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px' }}>
            <label style={{ gridColumn: 'span 2' }}>
              <FieldLabel>Type</FieldLabel>
              <select value={type} onChange={(e) => setType(e.target.value as ActivityType)} style={inp}>
                {(Object.keys(TYPE_COLOR) as ActivityType[]).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <FieldLabel>Title *</FieldLabel>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required style={inp} />
            </label>
            <label>
              <FieldLabel>Scheduled at *</FieldLabel>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required style={inp} />
            </label>
            <label>
              <FieldLabel>Owner *</FieldLabel>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required style={inp}>
                <option value="">— select —</option>
                {users.filter((u) => u.role === 'sales_rep' || u.role === 'sales_manager').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <FieldLabel>Customer (optional)</FieldLabel>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inp}>
                <option value="">— none —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              <FieldLabel>📍 Location</FieldLabel>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Address, room, floor…" style={inp} />
            </label>
            <label>
              <FieldLabel>🔗 Meeting link</FieldLabel>
              <input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://teams.microsoft.com/…" style={inp} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <FieldLabel>Notes</FieldLabel>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, resize: 'vertical' }} />
            </label>
          </div>
          {error && <div style={{ margin: '0 22px 12px', background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>{error}</div>}
          <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnGhost}>Close</button>
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5C5C74', marginBottom: 5 }}>{children}</div>
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, padding: '16px 18px' }
const sectionLabel: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8888A0' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const navBtn: CSSProperties = { width: 28, height: 28, border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5C5C74', fontSize: 14, cursor: 'pointer' }
const miniBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, fontSize: 11.5, fontWeight: 600, padding: '5px 11px', cursor: 'pointer' }
const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', maxWidth: 640, borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnAction: CSSProperties = { background: '#fff', color: '#3B3B52', border: '1px solid #E5E7F0', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const selectSm: CSSProperties = { border: '1px solid #E5E7F0', borderRadius: 8, padding: '6px 10px', fontSize: 12, background: '#fff', outline: 'none' }
function viewTab(active: boolean): CSSProperties {
  return { borderRadius: 7, fontSize: 12, fontWeight: 600, padding: '5px 13px', cursor: 'pointer', background: active ? '#2E1A6B' : 'transparent', color: active ? '#fff' : '#5C5C74' }
}
