import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CreateActivityDto, CustomerDto, ScanCardResultDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { enqueue as enqueueDraft } from '../lib/offlineQueue'
import { LogActivitySheet } from './MobileDetails'
import QrScannerSheet from './QrScannerSheet'
import ScanCardReviewSheet from './ScanCardReviewSheet'
import ScanCardCaptureSheet from './ScanCardCaptureSheet'
import { useVoiceInput } from '../lib/useVoiceInput'

export default function MobileMore() {
  const [busy, setBusy] = useState<'gps' | 'voice' | 'card' | null>(null)
  const [lastCheckin, setLastCheckin] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState<false | { description?: string }>(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [cardResult, setCardResult] = useState<ScanCardResultDto | null>(null)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [checkinCustomerOpen, setCheckinCustomerOpen] = useState(false)
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const openCheckin = () => {
    if (!user?.id) { toast('Sign in first'); return }
    setCheckinCustomerOpen(true)
  }

  /**
   * Acquire GPS + log a "visit" activity against the chosen customer.
   * Customer selection is mandatory — the picker sheet does not offer a
   * skip anymore. Owner is always the current mobile user, and the
   * activity title reads "Check-in: <Customer>" so the activities feed
   * says which visit happened, not raw coordinates.
   */
  const runCheckin = async (customer: CustomerDto) => {
    setCheckinCustomerOpen(false)
    if (!user?.id) { toast('Sign in first'); return }
    if (!('geolocation' in navigator)) { toast('GPS not available'); return }
    setBusy('gps')
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 }))
      const { latitude, longitude } = pos.coords
      const scheduledAt = new Date().toISOString()
      const title = `Check-in: ${customer.name}`
      const payload: CreateActivityDto = {
        type: 'visit',
        title,
        scheduledAt,
        ownerId: user.id,
        customerId: customer.id,
        description: `Location: ${latitude}, ${longitude}\nAccuracy: ${Math.round(pos.coords.accuracy ?? 0)}m`,
      }
      if (!navigator.onLine) {
        const draft = await enqueueDraft({ kind: 'activity', label: title, payload })
        toast(`Offline — queued check-in (${draft.id.slice(6, 12)})`)
      } else {
        await api.createActivity(payload)
        toast(`Checked in at ${customer.name}`)
      }
      setLastCheckin(scheduledAt)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Check-in failed')
    } finally { setBusy(null) }
  }

  const voice = useVoiceInput({
    lang: 'th-TH',
    maxMs: 20_000,
    onFinal: (text) => setLogOpen({ description: text }),
    onError: (msg) => toast(msg),
  })

  // Mirror recording state into the tile busy indicator so the Voice tile
  // shows the same "…" spinner idiom the other tiles use.
  useEffect(() => {
    if (voice.recording) setBusy('voice')
    else setBusy((b) => (b === 'voice' ? null : b))
  }, [voice.recording])

  const voiceNote = () => {
    if (!voice.supported) { toast('Voice-to-text not supported on this browser'); return }
    if (voice.recording) { voice.stop(); return }
    toast('Listening… tap again to stop')
    voice.start()
  }

  const scanCard = () => setCaptureOpen(true)

  const runScan = async (front: File, back: File | null) => {
    setBusy('card')
    try {
      const result = await api.scanCard(front, back)
      setCaptureOpen(false)
      setCardResult(result)
      toast(back ? 'Both sides scanned — review and save' : 'Card scanned — review and save')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Scan failed')
    } finally { setBusy(null) }
  }

  const runParseText = async (text: string) => {
    setBusy('card')
    try {
      const result = await api.parseCardText(text)
      setCaptureOpen(false)
      setCardResult(result)
      toast('Text parsed — review and save')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Parse failed')
    } finally { setBusy(null) }
  }

  const handleQrResult = async (value: string, _fmt: string) => {
    setQrOpen(false)
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
      navigate(trimmed.startsWith('CT') ? '/m/contracts' : '/m/quotations')
      return
    }
    setLogOpen({ description: `Scanned: ${trimmed}` })
  }

  return (
    <div style={{ padding: '16px 18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 19, fontWeight: 800 }}>Quick Actions</div>
        <div style={{ fontSize: 11.5, color: '#8888A0', marginTop: 2 }}>Capture and log from the field</div>
      </div>

      {/* Field capture — colored tiles */}
      <div>
        <SectionLabel>Capture</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          <BigTile busy={busy === 'card'} icon="📷" label="Scan card" hint="Business card → OCR"
            gradient="linear-gradient(135deg,#2A6FDB,#4A88F0)" onClick={scanCard} />
          <BigTile icon="⬜" label="Scan QR" hint="Deep-link or search"
            gradient="linear-gradient(135deg,#6C55E0,#9781F5)" onClick={() => setQrOpen(true)} />
          <BigTile busy={busy === 'gps'} icon="📍" label="GPS check-in" hint="Log a visit"
            gradient="linear-gradient(135deg,#0E9C7E,#22C9A3)" onClick={openCheckin} />
          <BigTile busy={busy === 'voice'} icon="🎙" label="Voice note" hint="Speak → activity"
            gradient="linear-gradient(135deg,#B4650A,#E68A2E)" onClick={voiceNote} />
        </div>
      </div>

      {/* Log */}
      <div>
        <SectionLabel>Log</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <SmallTile icon="+" label="Activity" onClick={() => setLogOpen({})} />
          <SmallTile icon="💬" label="Inbox" onClick={() => navigate('/m/inbox')} />
          <SmallTile icon="📁" label="Docs" onClick={() => navigate('/m/documents')} />
          <SmallTile icon="📄" label="Quotes" onClick={() => navigate('/m/quotations')} />
          <SmallTile icon="📊" label="Reports" onClick={() => navigate('/m/reports')} />
          <SmallTile icon="🗺" label="Nearby" onClick={() => navigate('/m/nearby')} />
          <SmallTile icon="✨" label="AI Workspace" onClick={() => navigate('/m/ai')} />
          <SmallTile icon="📃" label="Contracts" onClick={() => navigate('/m/contracts')} />
        </div>
      </div>

      {lastCheckin && (
        <div style={{ background: '#E5F8ED', border: '1px solid #B5E4CB', color: '#0E6E4E', borderRadius: 11, padding: '8px 12px', fontSize: 12 }}>
          Last check-in {new Date(lastCheckin).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {logOpen && (
        <LogActivitySheet
          defaultDescription={logOpen.description}
          onClose={() => setLogOpen(false)}
          onSaved={() => setLogOpen(false)}
        />
      )}
      {qrOpen && <QrScannerSheet onResult={handleQrResult} onClose={() => setQrOpen(false)} />}
      {captureOpen && (
        <ScanCardCaptureSheet
          submitting={busy === 'card'}
          onCancel={() => setCaptureOpen(false)}
          onSubmitPhoto={(front, back) => void runScan(front, back)}
          onSubmitText={(text) => void runParseText(text)}
        />
      )}
      {cardResult && (
        <ScanCardReviewSheet
          result={cardResult}
          onClose={() => setCardResult(null)}
          onDone={(customerId) => { setCardResult(null); navigate(`/m/customers/${customerId}`) }}
        />
      )}
      {checkinCustomerOpen && (
        <CheckinCustomerSheet
          onClose={() => setCheckinCustomerOpen(false)}
          onPick={(c) => void runCheckin(c)}
        />
      )}
    </div>
  )
}

/**
 * Bottom-sheet customer picker for GPS check-in. Debounced search hits
 * /customers?q=. Customer selection is required — the check-in only
 * fires once the user taps a customer row.
 */
function CheckinCustomerSheet({ onClose, onPick }: {
  onClose: () => void
  onPick: (customer: CustomerDto) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerDto[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(() => {
      api.customers(query || undefined)
        .then((rows) => { if (!cancelled) { setResults(rows.slice(0, 40)); setLoading(false) } })
        .catch(() => { if (!cancelled) { setResults([]); setLoading(false) } })
    }, 200)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [query])

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,20,45,.55)', zIndex: 90,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, background: '#fff',
        borderRadius: '18px 18px 0 0', padding: '10px 16px 16px',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ width: 40, height: 4, background: '#D0D0DF', borderRadius: 2, margin: '4px auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, flex: 1 }}>Check in at customer</div>
          <div onClick={onClose} style={{ color: '#8888A0', fontSize: 18, cursor: 'pointer', padding: '2px 6px' }}>✕</div>
        </div>

        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer name…"
          style={{
            border: '1px solid #E5E7F0', borderRadius: 10,
            padding: '10px 12px', fontSize: 14, outline: 'none',
            marginBottom: 8,
          }}
        />

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 12.5 }}>Loading…</div>}
          {!loading && results.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 12.5 }}>
              {query ? 'No matches.' : 'Type a name to search.'}
            </div>
          )}
          {!loading && results.map((c) => (
            <div
              key={c.id}
              onClick={() => onPick(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                border: '1px solid #E5E7F0', marginBottom: 6, background: '#fff',
              }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: '#EEF3FC', color: '#2A6FDB', border: '1px solid #D6E2F7',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, flex: 'none',
              }}>{c.name.split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                {c.industry && <div style={{ fontSize: 11, color: '#8888A0' }}>{c.industry}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: '#8888A0', textTransform: 'uppercase', marginBottom: 8 }}>{children}</div>
}

function BigTile({ icon, label, hint, gradient, onClick, busy = false }: { icon: string; label: string; hint: string; gradient: string; onClick: () => void; busy?: boolean }) {
  return (
    <div onClick={busy ? undefined : onClick} style={{
      background: gradient, color: '#fff', borderRadius: 14,
      padding: '14px 14px', cursor: 'pointer', opacity: busy ? 0.6 : 1,
      boxShadow: '0 6px 16px -8px rgba(30,30,48,.35)',
      display: 'flex', flexDirection: 'column', gap: 6, minHeight: 92,
    }}>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 800 }}>{busy ? 'Working…' : label}</div>
      <div style={{ fontSize: 10.5, opacity: 0.9 }}>{hint}</div>
    </div>
  )
}

function SmallTile({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={tileStyle}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#3B3B52', marginTop: 4 }}>{label}</div>
    </div>
  )
}

const tileStyle: CSSProperties = {
  background: '#fff', border: '1px solid #E5E7F0', borderRadius: 12,
  padding: '12px 6px', textAlign: 'center', cursor: 'pointer',
}
