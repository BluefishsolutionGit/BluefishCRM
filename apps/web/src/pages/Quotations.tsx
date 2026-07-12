import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CustomerDto, QuotationDto, QuotationStatus } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

const STATUS_STYLE: Record<QuotationStatus, { bg: string; fg: string }> = {
  Draft: { bg: '#F2F3F9', fg: '#5C5C74' },
  'Pending Approval': { bg: '#F7EBD9', fg: '#B4650A' },
  Approved: { bg: '#E4EDFC', fg: '#2A6FDB' },
  Sent: { bg: '#E7EDF9', fg: '#1F5AC2' },
  Accepted: { bg: '#E5F8ED', fg: '#0E6E4E' },
  Rejected: { bg: '#FDECEA', fg: '#C0392B' },
  Expired: { bg: '#F2F3F9', fg: '#8888A0' },
}

const fmt = (n: number | undefined) => n == null ? '—' : '฿' + new Intl.NumberFormat('en-US').format(n)

export default function Quotations() {
  const [quotations, setQuotations] = useState<QuotationDto[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('quotation:write')

  const reload = async () => {
    setLoading(true)
    try { setQuotations(await api.quotations()) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 600 }}>Quotations</div>
        <div style={{ background: '#F2F3F9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#5C5C74', padding: '4px 10px' }}>{quotations.length} total</div>
        <div style={{ flex: 1 }} />
        {canWrite && <div onClick={() => setModalOpen(true)} style={primaryBtn}>+ New quotation</div>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ ...gridCols, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8888A0' }}>
          <div>Quote #</div><div>Customer</div><div>Owner</div><div>Version</div><div>Status</div><div>Created</div><div style={{ textAlign: 'right' }}>Grand total</div>
        </div>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
        {!loading && quotations.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No quotations yet.</div>}
        {quotations.map((q) => {
          const s = STATUS_STYLE[q.status]
          return (
            <div key={q.id} onClick={() => navigate(`/quotations/${q.id}`)} style={{ ...gridCols, padding: '13px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', cursor: 'pointer' }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, fontWeight: 500 }}>{q.no}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{q.customerName}</div>
              <div style={{ fontSize: 12.5, color: '#3B3B52' }}>{q.ownerName}</div>
              <div style={{ fontSize: 12.5, color: '#5C5C74' }}>v{q.currentVersion?.versionNo ?? '—'}</div>
              <div><span style={{ background: s.bg, color: s.fg, borderRadius: 7, fontSize: 11, fontWeight: 700, padding: '3px 9px', whiteSpace: 'nowrap' }}>{q.status}</span></div>
              <div style={{ fontSize: 12.5, color: '#5C5C74' }}>{new Date(q.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
              <div style={{ textAlign: 'right', fontFamily: "'Space Grotesk'", fontSize: 13.5, fontWeight: 600 }}>{fmt(q.currentVersion?.grandTotal)}</div>
            </div>
          )
        })}
      </div>

      {modalOpen && <NewQuotationModal onClose={() => setModalOpen(false)} onCreated={(id) => { setModalOpen(false); navigate(`/quotations/${id}`) }} />}
    </div>
  )
}

function NewQuotationModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [customerId, setCustomerId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api.customers().then(setCustomers).catch(() => setCustomers([])) }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      const q = await api.createQuotation({ customerId })
      onCreated(q.id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create')
    } finally { setBusy(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, flex: 1 }}>New quotation</div>
            <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0' }}>×</div>
          </div>
          <div style={{ padding: '18px 22px' }}>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: '#5C5C74' }}>Customer</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required style={{ ...inp, marginTop: 6 }}>
              <option value="">— select —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
            {error && <div style={{ marginTop: 12, background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>{error}</div>}
          </div>
          <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
            <button type="submit" disabled={busy || !customerId} style={{ ...btnPrimary, opacity: busy || !customerId ? 0.5 : 1 }}>{busy ? 'Creating…' : 'Create quotation'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const gridCols: CSSProperties = { display: 'grid', gridTemplateColumns: '150px 1.6fr 130px 80px 150px 130px 130px', gap: 10 }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', maxWidth: 520, borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
