import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ActivityDto, CreateActivityDto, ExecutiveDashboardDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { enqueue as enqueueDraft } from '../lib/offlineQueue'
import { LogActivitySheet } from './MobileDetails'
import QrScannerSheet from './QrScannerSheet'
import { isPlatformAuthenticatorAvailable, isWebAuthnSupported, registerBiometric } from '../lib/webauthnClient'

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'

export default function MobileHome() {
  const [exec, setExec] = useState<ExecutiveDashboardDto | null>(null)
  const [today, setToday] = useState<ActivityDto[]>([])
  const [busy, setBusy] = useState<'gps' | 'voice' | 'card' | null>(null)
  const [lastCheckin, setLastCheckin] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState<false | { description?: string }>(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioBusy, setBioBusy] = useState(false)
  const [bioDismissed, setBioDismissed] = useState(() => localStorage.getItem('bluefish.bioDismissedAt') !== null)
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    api.execDashboard().then(setExec).catch(() => {})
    if (user) api.activities({ from: start, to: end, ownerId: user.id }).then(setToday).catch(() => {})
    // Only offer biometric registration when the device actually has a platform
    // authenticator (Face ID / Touch ID / Windows Hello) — external keys are
    // less useful on mobile.
    if (isWebAuthnSupported()) {
      void isPlatformAuthenticatorAvailable().then(setBioAvailable)
    }
  }, [user])

  const enableBiometric = async () => {
    if (bioBusy) return
    setBioBusy(true)
    const res = await registerBiometric(`${navigator.userAgent.split(') ')[0].split(' (').pop() ?? 'this device'}`)
    setBioBusy(false)
    if (res.ok) { toast('Biometric enabled — sign in with Face/Touch next time'); setBioDismissed(true); localStorage.setItem('bluefish.bioDismissedAt', String(Date.now())) }
    else toast(res.reason)
  }
  const dismissBio = () => {
    setBioDismissed(true); localStorage.setItem('bluefish.bioDismissedAt', String(Date.now()))
  }

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
    // Web Speech API — Chrome/Android + Safari 15+ (webkit prefix).
    const Rec = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
              ?? (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!Rec) { toast('Voice-to-text not supported on this browser'); return }
    setBusy('voice')
    let transcript = ''
    try {
      const rec: SpeechRecognition = new Rec()
      rec.lang = 'th-TH'                 // Bluefish is TH-first; browser falls back if unsupported
      rec.continuous = true
      rec.interimResults = false
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) transcript += (transcript ? ' ' : '') + e.results[i][0].transcript
        }
      }
      rec.onend = () => {
        setBusy(null)
        if (transcript.trim()) setLogOpen({ description: transcript.trim() })
        else toast('No speech captured')
      }
      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        setBusy(null)
        toast(e.error === 'not-allowed' ? 'Microphone permission denied' : `Voice: ${e.error}`)
      }
      rec.start()
      // Stop after 12 s so we don't hold the mic forever
      setTimeout(() => { try { rec.stop() } catch { /* already ended */ } }, 12_000)
      toast('Listening… speak your note')
    } catch (e) {
      setBusy(null)
      toast(e instanceof Error ? e.message : 'Voice failed')
    }
  }

  const scanCard = async () => {
    // Camera-first capture. On iOS/Android this opens the rear camera; on
    // desktop it falls back to the file picker.
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.setAttribute('capture', 'environment')
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setBusy('card')
      try {
        const doc = await api.uploadDocument(file, {
          category: 'certificate',
          name: `Business card · ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
          description: 'Captured from mobile camera — OCR queued',
        })
        toast('Card uploaded — opening OCR result…')
        navigate(`/m/documents/${doc.id}`)
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Upload failed')
      } finally { setBusy(null) }
    }
    input.click()
  }

  const handleQrResult = async (value: string, _fmt: string) => {
    setQrOpen(false)
    // Best-effort routing: if the scanned value looks like a URL that points
    // into the app itself, follow it. Otherwise offer to search customers /
    // contracts / quotes by number.
    const trimmed = value.trim()
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const u = new URL(trimmed)
        if (u.origin === window.location.origin) {
          navigate(u.pathname + u.search + u.hash)
          return
        }
      } catch { /* noop */ }
      window.open(trimmed, '_blank', 'noopener')
      toast(`Opened ${new URL(trimmed).host}`)
      return
    }
    if (/^CT-\d{4}-\d+/i.test(trimmed) || /^QT-\d{4}-\d+/i.test(trimmed)) {
      toast(`Search ${trimmed}`)
      // Fire the global search feature via URL to reuse existing UI.
      navigate(trimmed.startsWith('CT') ? '/m/contracts' : '/m/quotations')
      return
    }
    // Fallback — pre-fill a Log activity with the scanned value
    setLogOpen({ description: `Scanned: ${trimmed}` })
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

      {bioAvailable && !bioDismissed && (
        <div style={{
          background: '#F4F1FD', border: '1px solid #EAE7F7', borderRadius: 12,
          padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ fontSize: 22 }}>🔐</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2E1A6B' }}>Sign in faster with Face / Touch ID</div>
            <div style={{ fontSize: 11, color: '#5B3FC4', marginTop: 2 }}>Enable biometric login on this device.</div>
          </div>
          <div onClick={enableBiometric} style={{ background: '#4A3AB8', color: '#fff', fontSize: 11.5, fontWeight: 800, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', opacity: bioBusy ? 0.6 : 1 }}>{bioBusy ? '…' : 'Enable'}</div>
          <div onClick={dismissBio} style={{ color: '#8888A0', fontSize: 14, padding: '2px 4px', cursor: 'pointer' }}>✕</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <ActionTile busy={busy === 'card'} icon="📷" label="Scan card" onClick={scanCard} />
        <ActionTile icon="⬜" label="Scan QR" onClick={() => setQrOpen(true)} />
        <ActionTile busy={busy === 'gps'} icon="📍" label="Check-in" onClick={gpsCheckin} />
        <ActionTile busy={busy === 'voice'} icon="🎙" label="Voice" onClick={voiceNote} />
        <ActionTile icon="+" label="Activity" onClick={() => setLogOpen({})} />
        <ActionTile icon="💬" label="Inbox" onClick={() => navigate('/m/inbox')} />
        <ActionTile icon="📁" label="Docs" onClick={() => navigate('/m/documents')} />
        <ActionTile icon="📄" label="Quotes" onClick={() => navigate('/m/quotations')} />
        <ActionTile icon="📊" label="Reports" onClick={() => navigate('/m/reports')} />
        <ActionTile icon="🗺" label="Nearby" onClick={() => navigate('/m/nearby')} />
        <ActionTile icon="✨" label="AI" onClick={() => navigate('/m/ai')} />
      </div>

      {logOpen && (
        <LogActivitySheet
          defaultDescription={logOpen.description}
          onClose={() => setLogOpen(false)}
          onSaved={() => setLogOpen(false)}
        />
      )}
      {qrOpen && <QrScannerSheet onResult={handleQrResult} onClose={() => setQrOpen(false)} />}

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
