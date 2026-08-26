import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ActivityDto, CreateActivityDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { enqueue as enqueueDraft, list as listDrafts, remove as removeDraft, subscribe as subscribeQueue, type OfflineDraft } from '../lib/offlineQueue'

type Tab = 'today' | 'week' | 'overdue' | 'drafts'

const TYPE_COLOR: Record<string, string> = { meeting: '#2A6FDB', call: '#1F5AC2', visit: '#B4650A', demo: '#6C55E0', task: '#0E9C7E', follow_up: '#7C3AED', email: '#8888A0' }

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

  useEffect(() => { if (tab !== 'drafts') load(); else refreshDrafts() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, user])

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

      <div style={{ display: 'flex', gap: 6, background: '#F1F1F5', padding: 4, borderRadius: 999 }}>
        {(['today', 'week', 'overdue', 'drafts'] as Tab[]).map((t) => (
          <div
            key={t}
            onClick={() => setTab(t)}
            style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '7px 4px', borderRadius: 999, cursor: 'pointer', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#1E1E30' : '#5C5C74', boxShadow: tab === t ? '0 1px 2px rgba(0,0,0,.06)' : 'none' }}
          >
            {t === 'drafts' ? `Drafts${drafts.length ? ` (${drafts.length})` : ''}` : t.toUpperCase()}
          </div>
        ))}
      </div>

      {tab === 'drafts' ? (
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

function NewTaskSheet({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<'task' | 'call' | 'meeting' | 'visit' | 'follow_up'>('task')
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState<string>(() => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16))
  const { user } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim() || !user) return
    setSaving(true)
    const payload: CreateActivityDto = { type, title: title.trim(), scheduledAt: new Date(when).toISOString(), ownerId: user.id }
    try {
      if (!navigator.onLine) {
        await enqueueDraft({ kind: 'activity', label: `Task: ${title.trim()}`, payload })
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
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, margin: '0 auto', background: '#fff', borderRadius: '18px 18px 0 0', padding: 18 }}>
        <div style={{ width: 40, height: 4, background: '#D0D0DF', borderRadius: 2, margin: '0 auto 14px' }} />
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>New task</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {(['task', 'call', 'meeting', 'visit', 'follow_up'] as const).map((t) => (
            <div key={t} onClick={() => setType(t)} style={{ padding: '6px 11px', border: '1px solid ' + (type === t ? '#2E1A6B' : '#D0D0DF'), background: type === t ? '#EEF2FF' : '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t}</div>
          ))}
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #D0D0DF', borderRadius: 10, fontSize: 14, marginBottom: 8 }} />
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #D0D0DF', borderRadius: 10, fontSize: 14, marginBottom: 12 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', background: '#fff', border: '1px solid #D0D0DF', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving || !title.trim()} style={{ flex: 1, padding: '11px 0', background: '#2E1A6B', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
