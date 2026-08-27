import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ActivityDto, ActivityType, CreateActivityDto, CustomerDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { enqueue as enqueueDraft, list as listDrafts, remove as removeDraft, subscribe as subscribeQueue, type OfflineDraft } from '../lib/offlineQueue'
import VoiceInputButton from '../components/VoiceInputButton'

type Tab = 'today' | 'week' | 'cal' | 'overdue' | 'drafts'

const TYPE_COLOR: Record<string, string> = { meeting: '#2A6FDB', call: '#1F5AC2', visit: '#B4650A', demo: '#6C55E0', task: '#0E9C7E', follow_up: '#7C3AED', email: '#8888A0' }
const TYPE_BG: Record<string, string> = { meeting: '#E4EDFC', call: '#E7EDF9', visit: '#FEF3E2', demo: '#EAE7F7', task: '#E5F8ED', follow_up: '#F4F1FD', email: '#F2F3F9' }

export default function MobileTasks() {
  const [tab, setTab] = useState<Tab>('today')
  const [rows, setRows] = useState<ActivityDto[]>([])
  const [drafts, setDrafts] = useState<OfflineDraft[]>([])
  const [showNew, setShowNew] = useState(false)
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const refreshDrafts = () => { void listDrafts().then(setDrafts) }
  useEffect(() => {
    const unsub = subscribeQueue(() => { void listDrafts().then(setDrafts) })
    return () => { unsub() }
  }, [])

  const load = () => {
    const now = new Date()
    let from: Date, to: Date
    if (tab === 'today') {
      from = new Date(now); from.setHours(0, 0, 0, 0)
      to = new Date(from); to.setDate(to.getDate() + 1)
    } else if (tab === 'week') {
      from = new Date(now); from.setHours(0, 0, 0, 0)
      to = new Date(from); to.setDate(to.getDate() + 7)
    } else {
      from = new Date(2000, 0, 1)
      to = new Date(now); to.setHours(0, 0, 0, 0)
    }
    if (!user) return
    api.activities({ from, to, ownerId: user.id }).then((all) => {
      setRows(tab === 'overdue' ? all.filter((a) => a.status !== 'completed') : all)
    }).catch(() => {})
  }

  useEffect(() => {
    if (tab === 'drafts') refreshDrafts()
    else if (tab !== 'cal') load()
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [tab, user])

  useEffect(() => {
    const h = () => refreshDrafts()
    window.addEventListener('bluefish:offline-queue-changed', h)
    return () => window.removeEventListener('bluefish:offline-queue-changed', h)
  }, [])

  const complete = async (id: string) => {
    try {
      await api.updateActivity(id, { status: 'completed' })
      toast('Marked complete')
      load()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Update failed')
    }
  }

  return (
    <div style={{ padding: '16px 18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 19, fontWeight: 700 }}>Tasks</div>
        <button onClick={() => setShowNew(true)} style={{ background: '#2E1A6B', color: '#fff', border: 'none', borderRadius: 999, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ New</button>
      </div>

      <div style={{ display: 'flex', gap: 4, background: '#F1F1F5', padding: 4, borderRadius: 999 }}>
        {(['today', 'week', 'cal', 'overdue', 'drafts'] as Tab[]).map((t) => (
          <div
            key={t}
            onClick={() => setTab(t)}
            style={{ flex: 1, textAlign: 'center', fontSize: 10.5, fontWeight: 700, padding: '7px 2px', borderRadius: 999, cursor: 'pointer', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#1E1E30' : '#5C5C74', boxShadow: tab === t ? '0 1px 2px rgba(0,0,0,.06)' : 'none' }}
          >
            {t === 'drafts' ? `Drafts${drafts.length ? ` (${drafts.length})` : ''}` : t === 'cal' ? 'CAL' : t.toUpperCase()}
          </div>
        ))}
      </div>

      {tab === 'cal' ? (
        <CalendarView ownerId={user?.id} onOpen={(id) => navigate(`/m/tasks/${id}`)} />
      ) : tab === 'drafts' ? (
        drafts.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No offline drafts.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {drafts.map((d) => (
              <div key={d.id} style={{ background: '#FFF9E6', border: '1px solid #F4E5A8', borderRadius: 11, padding: '10px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{d.label}</div>
                <div style={{ fontSize: 11, color: '#5C5C74', marginTop: 4 }}>
                  {d.kind} · queued {new Date(d.createdAt).toLocaleString('en-GB')}
                  {d.retries > 0 && ` · retried ${d.retries}×`}
                </div>
                {d.lastError && <div style={{ fontSize: 11, color: '#C0392B', marginTop: 3 }}>{d.lastError}</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => { void removeDraft(d.id).then(refreshDrafts) }} style={{ background: '#fff', border: '1px solid #D0D0DF', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>Discard</button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Nothing here.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((a) => (
              <div key={a.id} onClick={() => navigate(`/m/tasks/${a.id}`)} style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 3, background: TYPE_COLOR[a.type] ?? '#8888A0' }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{a.title}</div>
                  {a.status !== 'completed' && (
                    <button onClick={(e) => { e.stopPropagation(); complete(a.id) }} style={{ background: '#0E9C7E', color: '#fff', border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>Done</button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#5C5C74', marginTop: 4, paddingLeft: 16 }}>
                  {new Date(a.scheduledAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {a.customerName ? ` · ${a.customerName}` : ''}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {showNew && <NewTaskSheet onClose={() => { setShowNew(false); load(); refreshDrafts() }} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Calendar view — colorful month grid, weekend tinting, dots per activity
// ─────────────────────────────────────────────────────────────
const DOW_TONE: Record<number, { bg: string; head: string; num: string }> = {
  0: { bg: '#FFF5F5', head: '#FDECEA', num: '#C0392B' }, // Sunday
  1: { bg: '#fff',    head: '#F7F8FC', num: '#3B3B52' },
  2: { bg: '#fff',    head: '#F7F8FC', num: '#3B3B52' },
  3: { bg: '#fff',    head: '#F7F8FC', num: '#3B3B52' },
  4: { bg: '#fff',    head: '#F7F8FC', num: '#3B3B52' },
  5: { bg: '#fff',    head: '#F7F8FC', num: '#3B3B52' },
  6: { bg: '#F1F5FE', head: '#E4EDFC', num: '#2A6FDB' }, // Saturday
}
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function CalendarView({ ownerId, onOpen }: { ownerId?: string; onOpen: (id: string) => void }) {
  const [monthStart, setMonthStart] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const [rows, setRows] = useState<ActivityDto[]>([])
  const [loading, setLoading] = useState(false)
  const [pickedDay, setPickedDay] = useState<number | null>(null)
  const toast = useToast()

  const monthEnd = useMemo(() => { const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); return d }, [monthStart])

  useEffect(() => {
    if (!ownerId) return
    setLoading(true)
    api.activities({ from: monthStart, to: monthEnd, ownerId })
      .then(setRows)
      .catch((e) => toast(e instanceof ApiError ? e.message : 'Failed'))
      .finally(() => setLoading(false))
  }, [ownerId, monthStart, monthEnd, toast])

  const today = new Date()
  const isThisMonth = today.getFullYear() === monthStart.getFullYear() && today.getMonth() === monthStart.getMonth()
  const todayNum = today.getDate()
  const dayCount = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const leadEmpty = monthStart.getDay()

  // Pre-group activities by day-of-month
  const byDay = useMemo(() => {
    const map = new Map<number, ActivityDto[]>()
    for (const a of rows) {
      const d = new Date(a.scheduledAt)
      if (d.getFullYear() !== monthStart.getFullYear() || d.getMonth() !== monthStart.getMonth()) continue
      const day = d.getDate()
      const list = map.get(day) ?? []; list.push(a); map.set(day, list)
    }
    return map
  }, [rows, monthStart])

  const cells: Array<null | { d: number; items: ActivityDto[] }> = []
  for (let i = 0; i < leadEmpty; i++) cells.push(null)
  for (let d = 1; d <= dayCount; d++) cells.push({ d, items: byDay.get(d) ?? [] })
  while (cells.length % 7 !== 0) cells.push(null)

  const shift = (dir: number) => { const d = new Date(monthStart); d.setMonth(d.getMonth() + dir); setMonthStart(d); setPickedDay(null) }
  const jumpToday = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setMonthStart(d); setPickedDay(today.getDate()) }
  const pickedList = pickedDay != null ? (byDay.get(pickedDay) ?? []) : (isThisMonth ? (byDay.get(todayNum) ?? []) : [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {Object.entries(TYPE_COLOR).map(([k, c]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c + '18', color: c, borderRadius: 999, padding: '3px 8px', fontSize: 10, fontWeight: 700 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />{k}
          </span>
        ))}
      </div>

      {/* Month header + prev/next */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 700, flex: 1, background: 'linear-gradient(90deg,#2E6BE6,#7C3AED)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <div onClick={() => shift(-1)} style={navBtn}>‹</div>
          <div onClick={jumpToday} style={{ ...navBtn, width: 'auto', padding: '0 10px', fontSize: 11, color: '#2A6FDB', fontWeight: 700 }}>Today</div>
          <div onClick={() => shift(1)} style={navBtn}>›</div>
        </div>
      </div>

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', border: '1px solid #E5E7F0', borderBottom: 'none', borderTopLeftRadius: 10, borderTopRightRadius: 10, overflow: 'hidden' }}>
        {DAY_NAMES.map((d, i) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', padding: '7px 0', background: DOW_TONE[i].head, color: DOW_TONE[i].num, borderRight: i < 6 ? '1px solid #E5E7F0' : 'none' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', border: '1px solid #E5E7F0', borderTop: 'none', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, overflow: 'hidden', marginTop: -12 }}>
        {cells.map((cell, i) => {
          const dow = i % 7
          const tone = DOW_TONE[dow]
          const isToday = cell && isThisMonth && cell.d === todayNum
          const isPicked = cell && pickedDay === cell.d
          const rightBorder = dow < 6 ? '1px solid #E5E7F0' : 'none'
          const bottomBorder = i < cells.length - 7 ? '1px solid #E5E7F0' : 'none'
          return (
            <div
              key={i}
              onClick={() => cell && setPickedDay(cell.d)}
              style={{
                minHeight: 62, padding: '4px 4px 3px',
                background: cell ? (isPicked ? '#EEF0FA' : isToday ? '#FFF8E1' : tone.bg) : '#FAFAFC',
                borderRight: rightBorder, borderBottom: bottomBorder,
                boxShadow: isPicked ? 'inset 0 0 0 2px #2A6FDB' : isToday ? 'inset 0 0 0 2px #F5A623' : undefined,
                cursor: cell ? 'pointer' : 'default',
              }}
            >
              {cell && (
                <>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 18, height: 18, padding: '0 4px', borderRadius: 999,
                    fontFamily: "'Space Grotesk'", fontSize: 11, fontWeight: 700,
                    background: isToday ? '#F5A623' : 'transparent',
                    color: isToday ? '#fff' : tone.num,
                  }}>{cell.d}</div>
                  <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
                    {cell.items.slice(0, 4).map((a) => (
                      <div key={a.id} title={`${a.type} · ${a.title}`} style={{ width: 6, height: 6, borderRadius: 3, background: TYPE_COLOR[a.type] ?? '#8888A0' }} />
                    ))}
                    {cell.items.length > 4 && (
                      <div style={{ fontSize: 8, fontWeight: 800, color: '#5C5C74' }}>+{cell.items.length - 4}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Picked-day list */}
      <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#5C5C74', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            {pickedDay != null
              ? new Date(monthStart.getFullYear(), monthStart.getMonth(), pickedDay).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })
              : isThisMonth ? 'Today' : `${monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: '#8888A0' }}>{pickedList.length} activit{pickedList.length === 1 ? 'y' : 'ies'}</div>
        </div>
        {loading && <div style={{ padding: 12, textAlign: 'center', color: '#8888A0', fontSize: 12 }}>Loading…</div>}
        {!loading && pickedList.length === 0 && (
          <div style={{ padding: 12, textAlign: 'center', color: '#BBBBCB', fontSize: 12 }}>
            {pickedDay != null ? 'Nothing scheduled.' : 'Pick a day to see its activities.'}
          </div>
        )}
        {pickedList.map((a) => (
          <div
            key={a.id}
            onClick={() => onOpen(a.id)}
            style={{
              padding: '9px 10px', margin: '6px 0', borderRadius: 10, cursor: 'pointer',
              background: TYPE_BG[a.type] ?? '#F7F8FC',
              borderLeft: `3px solid ${TYPE_COLOR[a.type] ?? '#8888A0'}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <div style={{ minWidth: 40, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: TYPE_COLOR[a.type] ?? '#5C5C74', fontWeight: 700 }}>
              {new Date(a.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
              <div style={{ fontSize: 10.5, color: '#5C5C74', marginTop: 2 }}>
                {a.type}{a.customerName ? ` · ${a.customerName}` : ''} · <b style={{ color: a.status === 'completed' ? '#0E6E4E' : a.status === 'cancelled' ? '#8888A0' : '#3B3B52' }}>{a.status}</b>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const navBtn: CSSProperties = { width: 26, height: 26, border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8888A0', fontSize: 13, cursor: 'pointer', fontWeight: 700 }

const TASK_TYPES: ActivityType[] = ['task', 'call', 'meeting', 'visit', 'demo', 'follow_up', 'email']

/**
 * "New task" sheet — full-detail form matching the desktop /activities modal
 * so a rep can capture everything from mobile without needing to jump to web.
 *
 * Fields: type, title, when, duration, customer, location, meeting link
 * (auto-hidden for types that never have one), notes (with voice dictation).
 */
function NewTaskSheet({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<ActivityType>('task')
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState<string>(() => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16))
  const [durationMin, setDurationMin] = useState<string>('')
  const [customerId, setCustomerId] = useState<string>('')
  const [customerQ, setCustomerQ] = useState('')
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [location, setLocation] = useState('')
  const [meetingLink, setMeetingLink] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const { user } = useAuth()
  const toast = useToast()

  // Load a bounded customer list once; the sheet then filters client-side by
  // customerQ so search feels instant on the small mobile screen.
  useEffect(() => {
    api.customers().then(setCustomers).catch(() => setCustomers([]))
  }, [])

  const filteredCustomers = useMemo(() => {
    const q = customerQ.trim().toLowerCase()
    if (!q) return customers.slice(0, 8)
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q) || (c.nameTh ?? '').toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    ).slice(0, 8)
  }, [customers, customerQ])

  const selectedCustomer = customerId ? customers.find((c) => c.id === customerId) ?? null : null
  const showMeetingLink = type === 'meeting' || type === 'call' || type === 'demo'

  const save = async () => {
    if (!title.trim() || !user || saving) return
    setSaving(true)
    const payload: CreateActivityDto = {
      type,
      title: title.trim(),
      scheduledAt: new Date(when).toISOString(),
      ownerId: user.id,
      customerId: customerId || undefined,
      location: location.trim() || undefined,
      meetingLink: showMeetingLink && meetingLink.trim() ? meetingLink.trim() : undefined,
      notes: notes.trim() || undefined,
      durationMin: durationMin && Number(durationMin) > 0 ? Number(durationMin) : undefined,
    }
    try {
      if (!navigator.onLine) {
        await enqueueDraft({ kind: 'activity', label: `${type}: ${title.trim()}`, payload })
        toast('Offline — queued as draft')
      } else {
        await api.createActivity(payload)
        toast('Task created')
      }
      onClose()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'flex-end', zIndex: 60 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, margin: '0 auto', background: '#fff',
          borderRadius: '18px 18px 0 0', padding: '10px 18px 18px',
          maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <div style={{ width: 40, height: 4, background: '#D0D0DF', borderRadius: 2, margin: '4px auto 6px' }} />
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>New task</div>

        {/* Type chips */}
        <div>
          <TinyLabel>Type</TinyLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TASK_TYPES.map((t) => (
              <div
                key={t}
                onClick={() => setType(t)}
                style={{
                  padding: '6px 11px',
                  border: '1px solid ' + (type === t ? '#2A6FDB' : '#D0D0DF'),
                  background: type === t ? '#EEF3FC' : '#fff',
                  color: type === t ? '#2A6FDB' : '#5C5C74',
                  borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >{t.replace('_', ' ')}</div>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <TinyLabel>Title *</TinyLabel>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Follow-up call with Somchai"
            style={inp}
          />
        </div>

        {/* When + duration */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 2 }}>
            <TinyLabel>Scheduled at *</TinyLabel>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <TinyLabel>Duration (min)</TinyLabel>
            <input
              type="number" min={0} step={15}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="30"
              style={inp}
            />
          </div>
        </div>

        {/* Customer picker */}
        <div>
          <TinyLabel>Customer (optional)</TinyLabel>
          {selectedCustomer ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#EEF3FC', border: '1px solid #B7CFF3', borderRadius: 10, padding: '8px 12px',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2A6FDB' }}>{selectedCustomer.name}</div>
                <div style={{ fontSize: 10.5, color: '#5C5C74' }}>{selectedCustomer.code}{selectedCustomer.industry ? ` · ${selectedCustomer.industry}` : ''}</div>
              </div>
              <div onClick={() => { setCustomerId(''); setCustomerQ('') }} style={{ color: '#8888A0', fontSize: 14, cursor: 'pointer', padding: '2px 6px' }}>✕</div>
            </div>
          ) : (
            <>
              <input
                placeholder="Search customer…"
                value={customerQ}
                onChange={(e) => setCustomerQ(e.target.value)}
                style={inp}
              />
              {(customerQ.trim() || filteredCustomers.length > 0) && (
                <div style={{
                  border: '1px solid #E5E7F0', borderTop: 'none',
                  borderRadius: '0 0 10px 10px', maxHeight: 160, overflowY: 'auto', marginTop: -2,
                }}>
                  {filteredCustomers.length === 0 && (
                    <div style={{ padding: 10, fontSize: 11.5, color: '#8888A0' }}>No matches.</div>
                  )}
                  {filteredCustomers.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => { setCustomerId(c.id); setCustomerQ('') }}
                      style={{
                        padding: '8px 12px', borderTop: '1px solid #F2F3F9', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column',
                      }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{c.name}</div>
                      <div style={{ fontSize: 10.5, color: '#8888A0' }}>{c.code} · {c.industry}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Location */}
        <div>
          <TinyLabel>📍 Location</TinyLabel>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Address, floor, room…"
            style={inp}
          />
        </div>

        {/* Meeting link (only for meeting/call/demo) */}
        {showMeetingLink && (
          <div>
            <TinyLabel>🔗 Meeting link</TinyLabel>
            <input
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://teams.microsoft.com/…"
              style={inp}
            />
          </div>
        )}

        {/* Notes with voice input */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <TinyLabel>Notes</TinyLabel>
            <div style={{ flex: 1 }} />
            <VoiceInputButton value={notes} onChange={setNotes} size="sm" label="Dictate notes" />
          </div>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Agenda, decision maker, prep notes…"
            style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '12px 0', background: '#fff', border: '1px solid #D0D0DF', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >Cancel</button>
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            style={{ flex: 1, padding: '12px 0', background: '#2E1A6B', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving || !title.trim() ? 0.5 : 1 }}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function TinyLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, fontWeight: 800, color: '#5C5C74', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 4 }}>{children}</div>
}

const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #D0D0DF', borderRadius: 10, fontSize: 13.5, outline: 'none' }
