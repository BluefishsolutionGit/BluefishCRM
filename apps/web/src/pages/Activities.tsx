import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import type { ActivityDto, ActivityType, CustomerDto, UserDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

const TYPE_COLOR: Record<ActivityType, string> = {
  meeting: '#2A6FDB', call: '#1F5AC2', visit: '#B4650A', demo: '#6C55E0',
  task: '#0E9C7E', follow_up: '#7C3AED', email: '#8888A0',
}

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  const dow = out.getDay()
  out.setDate(out.getDate() - dow + 1) // start Monday
  out.setHours(0, 0, 0, 0)
  return out
}

export default function Activities() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date('2026-07-07T00:00:00Z')))
  const [items, setItems] = useState<ActivityDto[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ActivityDto | null>(null)
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('opportunity:write')

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    return d
  }, [weekStart])

  const reload = async () => {
    try { setItems(await api.activities({ from: weekStart, to: weekEnd })) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed to load activities') }
  }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [weekStart])

  const days = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const day = new Date(weekStart)
      day.setDate(day.getDate() + i)
      const dow = DAY_NAMES[day.getDay()]
      const events = items
        .filter((e) => {
          const t = new Date(e.scheduledAt)
          return t.getDate() === day.getDate() && t.getMonth() === day.getMonth()
        })
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      return { day, dow, events }
    })
  }, [items, weekStart])

  const sel = items.find((x) => x.id === selId) ?? items[0]

  const shiftWeek = (deltaDays: number) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + deltaDays)
    setWeekStart(d)
  }

  const del = async (id: string) => {
    if (!window.confirm('Delete activity?')) return
    try { await api.deleteActivity(id); toast('Deleted'); reload() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Delete failed') }
  }

  const setStatus = async (a: ActivityDto, status: 'scheduled' | 'completed' | 'cancelled') => {
    try { const upd = await api.updateActivity(a.id, { status }); setItems((xs) => xs.map((x) => (x.id === upd.id ? upd : x))); toast(`Marked ${status}`) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Update failed') }
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 600 }}>Activities</div>
        <div style={{ fontSize: 12.5, color: '#5C5C74' }}>
          {weekStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – {new Date(weekEnd.getTime() - 1).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div onClick={() => shiftWeek(-7)} style={navBtn}>‹</div>
          <div onClick={() => shiftWeek(7)} style={navBtn}>›</div>
        </div>
        <div style={{ flex: 1 }} />
        {canWrite && <div onClick={() => { setEditing(null); setModalOpen(true) }} style={primaryBtn}>+ New activity</div>}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14, fontSize: 11.5, color: '#5C5C74', flexWrap: 'wrap' }}>
        {(Object.keys(TYPE_COLOR) as ActivityType[]).map((t) => (
          <span key={t}>
            <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: TYPE_COLOR[t], marginRight: 5 }} />{t}
          </span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 330px', gap: 14, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)' }}>
            {days.map((d, i) => {
              const today = new Date()
              const isToday = d.day.toDateString() === today.toDateString()
              return (
                <div key={i} style={{ borderRight: '1px solid #F2F3F9', minHeight: 420 }}>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid #F2F3F9', color: isToday ? '#2A6FDB' : '#5C5C74', background: isToday ? '#E4EDFC' : 'transparent' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em' }}>{d.dow}</div>
                    <div style={{ fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 600 }}>{d.day.getDate()}</div>
                  </div>
                  <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {d.events.map((e) => {
                      const isSel = e.id === (sel?.id)
                      const c = TYPE_COLOR[e.type]
                      return (
                        <div
                          key={e.id}
                          onClick={() => setSelId(e.id)}
                          style={{ borderLeft: `3px solid ${c}`, background: isSel ? '#2E1A6B' : '#F7F8FC', color: isSel ? '#fff' : '#1E1E30', borderRadius: 9, padding: '8px 10px', cursor: 'pointer' }}
                        >
                          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, opacity: 0.75 }}>{new Date(e.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                          <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.35, marginTop: 2 }}>{e.title}</div>
                          <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 1 }}>{e.ownerName}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sel ? (
            <>
              <div style={card}>
                <div style={sectionLabel}>Selected activity</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{sel.title}</div>
                <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 3 }}>
                  {new Date(sel.scheduledAt).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {sel.ownerName}
                </div>
                {sel.customerName && <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 3 }}>Customer: {sel.customerName}</div>}
                {sel.notes && <div style={{ marginTop: 12, background: '#F7F8FC', borderRadius: 8, padding: '10px 12px', fontSize: 12, lineHeight: 1.55 }}>{sel.notes}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <span style={{ background: sel.status === 'completed' ? '#E5F8ED' : sel.status === 'cancelled' ? '#FDECEA' : '#E4EDFC', color: sel.status === 'completed' ? '#0E6E4E' : sel.status === 'cancelled' ? '#C0392B' : '#2A6FDB', borderRadius: 8, fontSize: 11, fontWeight: 700, padding: '3px 9px' }}>{sel.status}</span>
                  {canWrite && sel.status === 'scheduled' && <div onClick={() => setStatus(sel, 'completed')} style={miniBtn}>Mark done</div>}
                  {canWrite && sel.status === 'scheduled' && <div onClick={() => setStatus(sel, 'cancelled')} style={miniBtn}>Cancel</div>}
                  {canWrite && <div onClick={() => { setEditing(sel); setModalOpen(true) }} style={miniBtn}>Edit</div>}
                  {canWrite && <div onClick={() => del(sel.id)} style={{ ...miniBtn, color: '#C0392B' }}>Delete</div>}
                </div>
              </div>
            </>
          ) : (
            <div style={{ ...card, color: '#8888A0', fontSize: 13 }}>Select an activity from the calendar to see details.</div>
          )}
        </div>
      </div>

      {modalOpen && <ActivityModal initial={editing} onClose={() => setModalOpen(false)} onSaved={reload} />}
    </div>
  )
}

function ActivityModal({ initial, onClose, onSaved }: { initial: ActivityDto | null; onClose: () => void; onSaved: () => void }) {
  const [users, setUsers] = useState<UserDto[]>([])
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [type, setType] = useState<ActivityType>((initial?.type as ActivityType) ?? 'meeting')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [scheduledAt, setScheduledAt] = useState(initial ? initial.scheduledAt.slice(0, 16) : new Date().toISOString().slice(0, 16))
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? '')
  const [customerId, setCustomerId] = useState(initial?.customerId ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.users().then((us) => { setUsers(us); if (!ownerId && us[0]) setOwnerId(us[0].id) }).catch(() => {})
    api.customers().then(setCustomers).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      const payload = { type, title, scheduledAt: new Date(scheduledAt).toISOString(), ownerId, customerId: customerId || undefined, notes: notes || undefined }
      if (initial) await api.updateActivity(initial.id, payload)
      else await api.createActivity(payload)
      onSaved(); onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, flex: 1 }}>{initial ? 'Edit activity' : 'New activity'}</div>
            <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0' }}>×</div>
          </div>
          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ gridColumn: 'span 2', fontSize: 11.5, fontWeight: 700, color: '#5C5C74' }}>Type
              <select value={type} onChange={(e) => setType(e.target.value as ActivityType)} style={inp}>
                {(Object.keys(TYPE_COLOR) as ActivityType[]).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2', fontSize: 11.5, fontWeight: 700, color: '#5C5C74' }}>Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} required style={inp} />
            </label>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: '#5C5C74' }}>Scheduled at
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required style={inp} />
            </label>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: '#5C5C74' }}>Owner
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required style={inp}>
                <option value="">— select —</option>
                {users.filter((u) => u.role === 'sales_rep' || u.role === 'sales_manager').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2', fontSize: 11.5, fontWeight: 700, color: '#5C5C74' }}>Customer (optional)
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inp}>
                <option value="">— none —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2', fontSize: 11.5, fontWeight: 700, color: '#5C5C74' }}>Notes
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, resize: 'vertical' }} />
            </label>
          </div>
          {error && <div style={{ margin: '0 22px 12px', background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>{error}</div>}
          <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, padding: '16px 18px' }
const sectionLabel: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8888A0' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const navBtn: CSSProperties = { width: 28, height: 28, border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5C5C74', fontSize: 14, cursor: 'pointer' }
const miniBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, fontSize: 11.5, fontWeight: 600, padding: '5px 11px', cursor: 'pointer' }
const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', maxWidth: 560, borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', marginTop: 6 }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
