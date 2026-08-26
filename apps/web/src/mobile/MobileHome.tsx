import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ActivityDto, CreateActivityDto, ExecutiveDashboardDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { enqueue as enqueueDraft } from '../lib/offlineQueue'
import { LogActivitySheet } from './MobileDetails'

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'

export default function MobileHome() {
  const [exec, setExec] = useState<ExecutiveDashboardDto | null>(null)
  const [today, setToday] = useState<ActivityDto[]>([])
  const [busy, setBusy] = useState<'gps' | 'voice' | 'card' | null>(null)
  const [lastCheckin, setLastCheckin] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    api.execDashboard().then(setExec).catch(() => {})
    if (user) api.activities({ from: start, to: end, ownerId: user.id }).then(setToday).catch(() => {})
  }, [user])

  const gpsCheckin = async () => {
    if (!('geolocation' in navigator)) { toast('GPS not available'); return }
    setBusy('gps')
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 }))
      const { latitude, longitude } = pos.coords
      const scheduledAt = new Date().toISOString()
      const payload: CreateActivityDto = {
        type: 'visit',
        title: `GPS check-in @ ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        scheduledAt,
        ownerId: user?.id ?? '',
        description: `Location: ${latitude}, ${longitude}\nAccuracy: ${Math.round(pos.coords.accuracy ?? 0)}m`,
      }
      if (!navigator.onLine) {
        const draft = await enqueueDraft({ kind: 'activity', label: `GPS check-in`, payload })
        toast(`Offline — queued check-in (${draft.id.slice(6, 12)})`)
      } else {
        await api.createActivity(payload)
        toast('GPS check-in logged')
      }
      setLastCheckin(scheduledAt)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Check-in failed')
    } finally { setBusy(null) }
  }

  const voiceNote = async () => {
    if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.getUserMedia) { toast('Voice not available'); return }
    setBusy('voice')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
        try {
          await api.uploadDocument(file, { category: 'other', name: `Voice note ${new Date().toLocaleString('en-GB')}` })
          toast('Voice note uploaded')
        } catch (e) {
          toast(e instanceof ApiError ? e.message : 'Upload failed')
        }
      }
      rec.start()
      // Record for 5 seconds
      setTimeout(() => rec.stop(), 5000)
      toast('Recording 5s…')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Voice recording failed')
    } finally { setBusy(null) }
  }

  const scanCard = async () => {
    // Trigger a file input with capture=environment — on iOS/Android this opens the camera
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.setAttribute('capture', 'environment')
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setBusy('card')
      try {
        await api.uploadDocument(file, { category: 'other', name: `Business card ${new Date().toLocaleString('en-GB')}` })
        toast('Card uploaded — OCR queued')
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Upload failed')
      } finally { setBusy(null) }
    }
    input.click()
  }

  return (
    <div style={{ padding: '16px 18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 19, fontWeight: 700 }}>Hi, {user?.name?.split(' ')[0] ?? 'there'}</div>
          <div style={{ fontSize: 12, color: '#5C5C74' }}>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })} · {today.length} activities today</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#2A6FDB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
          {(user?.name ?? 'U').split(' ').slice(0, 2).map((s) => s[0]).join('')}
        </div>
      </div>

      {exec && (
        <div style={{ display: 'flex', gap: 8 }}>
          <MiniCard label="Pipeline" value={fmt(exec.openPipeline)} dark />
          <MiniCard label="MTD" value={fmt(exec.revenueMTD)} />
          <MiniCard label="Tasks" value={String(today.length)} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <ActionTile busy={busy === 'card'} icon="📷" label="Scan card" onClick={scanCard} />
        <ActionTile busy={busy === 'gps'} icon="📍" label="Check-in" onClick={gpsCheckin} />
        <ActionTile busy={busy === 'voice'} icon="🎙" label="Voice note" onClick={voiceNote} />
        <ActionTile icon="+" label="Log activity" onClick={() => setLogOpen(true)} />
        <ActionTile icon="📁" label="Documents" onClick={() => navigate('/m/documents')} />
        <ActionTile icon="📄" label="Quotations" onClick={() => navigate('/m/quotations')} />
      </div>

      {logOpen && <LogActivitySheet onClose={() => setLogOpen(false)} onSaved={() => setLogOpen(false)} />}

      {lastCheckin && (
        <div style={{ background: '#E5F8ED', border: '1px solid #B5E4CB', color: '#0E6E4E', borderRadius: 11, padding: '8px 12px', fontSize: 12 }}>
          Last check-in {new Date(lastCheckin).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8888A0', letterSpacing: '.06em', marginBottom: 8 }}>TODAY</div>
        {today.length === 0 && <div style={{ ...card, padding: 18, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No activities scheduled.</div>}
        {today.map((a) => (
          <div key={a.id} onClick={() => navigate(`/m/tasks/${a.id}`)} style={{ ...card, padding: '12px 14px', marginBottom: 8, cursor: 'pointer' }}>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
              <div style={{ width: 8, height: 8, borderRadius: 3, background: typeColor(a.type) }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{a.title}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#5C5C74' }}>{new Date(a.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            {a.customerName && <div style={{ fontSize: 11.5, color: '#5C5C74', marginTop: 4, paddingLeft: 17 }}>{a.customerName}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function typeColor(t: string): string {
  const map: Record<string, string> = { meeting: '#2A6FDB', call: '#1F5AC2', visit: '#B4650A', demo: '#6C55E0', task: '#0E9C7E', follow_up: '#7C3AED', email: '#8888A0' }
  return map[t] ?? '#8888A0'
}

function MiniCard({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div style={{ flex: 1, background: dark ? '#2E1A6B' : '#fff', color: dark ? '#fff' : '#1E1E30', border: dark ? 'none' : '1px solid #E5E7F0', borderRadius: 13, padding: '11px 13px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: dark ? '#A99FD0' : '#8888A0' }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function ActionTile({ icon, label, onClick, busy = false }: { icon: string; label: string; onClick: () => void; busy?: boolean }) {
  return (
    <div onClick={busy ? undefined : onClick} style={{ background: '#fff', border: '1.5px dashed #D0D0DF', borderRadius: 13, padding: '14px 8px', textAlign: 'center', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#5C5C74', marginTop: 5 }}>{busy ? '…' : label}</div>
    </div>
  )
}

const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13 }
