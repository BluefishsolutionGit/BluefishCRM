import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CreateOpportunityDto, CustomerDto, ForecastDto, OpportunityDto, OpportunityStage } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { Sheet } from './MobileDetails'

const STAGE_COLOR: Record<OpportunityStage, string> = {
  Qualification: '#2A6FDB', Proposal: '#B4650A', Negotiation: '#6C55E0', Won: '#0E9C7E', Lost: '#8888A0',
}
const STAGES: OpportunityStage[] = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost']

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'

export default function MobileOpportunities() {
  const [rows, setRows] = useState<OpportunityDto[]>([])
  const [forecast, setForecast] = useState<ForecastDto | null>(null)
  const [q, setQ] = useState('')
  const [stageFilter, setStageFilter] = useState<OpportunityStage | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)
  const navigate = useNavigate()

  const reload = () => {
    setLoading(true)
    return Promise.all([
      api.opportunities(),
      api.forecast().catch(() => null),
    ]).then(([r, f]) => { setRows(r); setForecast(f); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { void reload() }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter((o) => {
      if (stageFilter !== 'all' && o.stage !== stageFilter) return false
      if (term && !(
        o.title.toLowerCase().includes(term) ||
        (o.customerName ?? '').toLowerCase().includes(term)
      )) return false
      return true
    })
  }, [rows, q, stageFilter])

  const grouped = useMemo(() => filtered.reduce<Record<string, OpportunityDto[]>>((acc, o) => {
    (acc[o.stage] ??= []).push(o)
    return acc
  }, {}), [filtered])

  const summary = useMemo(() => {
    const open = filtered.filter((o) => o.stage !== 'Won' && o.stage !== 'Lost').reduce((s, o) => s + o.value, 0)
    const weighted = filtered.reduce((s, o) => s + o.value * (o.probability / 100), 0)
    return { open, weighted, count: filtered.length }
  }, [filtered])

  return (
    <div style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 19, fontWeight: 700 }}>Pipeline</div>
        <div style={{ fontSize: 12, color: '#5C5C74' }}>{summary.count}</div>
      </div>

      {/* Summary card */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={miniCard('#2E1A6B')}>
          <div style={miniLabel}>Open</div>
          <div style={miniValue}>{fmt(summary.open)}</div>
        </div>
        <div style={miniCard('#2A6FDB')}>
          <div style={miniLabel}>Weighted</div>
          <div style={miniValue}>{fmt(summary.weighted)}</div>
        </div>
        {forecast && (
          <div style={miniCard('#0E9C7E')}>
            <div style={miniLabel}>MTD closed</div>
            <div style={miniValue}>{fmt(forecast.closed)}</div>
          </div>
        )}
      </div>

      {/* Search */}
      <input
        placeholder="Search deal or customer…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ padding: '10px 12px', border: '1px solid #D0D0DF', borderRadius: 11, fontSize: 13.5, outline: 'none' }}
      />

      {/* Stage chips (horizontal scroll for small screens) */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginRight: -16, paddingRight: 16 }}>
        <div onClick={() => setStageFilter('all')} style={stageChip(stageFilter === 'all', '#3B3B52')}>All</div>
        {STAGES.map((s) => (
          <div key={s} onClick={() => setStageFilter(s === stageFilter ? 'all' : s)} style={stageChip(stageFilter === s, STAGE_COLOR[s])}>{s}</div>
        ))}
      </div>

      {loading && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No deals match this filter.</div>
      )}

      {STAGES.map((s) => {
        const rows = grouped[s]
        if (!rows || rows.length === 0) return null
        return (
          <div key={s}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: STAGE_COLOR[s] }} />
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: '#5C5C74' }}>{s.toUpperCase()}</div>
              <div style={{ fontSize: 11, color: '#8888A0' }}>· {rows.length}</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 11, color: '#5C5C74', fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(rows.reduce((a, o) => a + o.value, 0))}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.map((o) => (
                <div
                  key={o.id}
                  onClick={() => navigate(`/m/opportunities/${o.id}`)}
                  style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 11, padding: '10px 12px', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title}</div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center' }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#1E1E30' }}>{fmt(o.value)}</div>
                    <div style={{ width: 40, height: 4, background: '#F1F1F5', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${o.probability}%`, height: '100%', background: o.probability >= 60 ? '#0E9C7E' : o.probability >= 30 ? '#B4650A' : '#8888A0' }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#5C5C74' }}>{o.probability}%</div>
                    <div style={{ flex: 1 }} />
                    <div style={{ fontSize: 10.5, color: '#8888A0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>{o.customerName ?? ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* +New Deal FAB */}
      <div
        onClick={() => setNewOpen(true)}
        style={{
          position: 'fixed', bottom: 86, right: 'calc(50% - 240px + 20px)',
          width: 54, height: 54, borderRadius: '50%',
          background: '#2A6FDB', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(42,111,219,.4)',
          cursor: 'pointer', fontSize: 26, lineHeight: 1,
          zIndex: 10,
        }}
        aria-label="New deal"
      >+</div>

      {newOpen && <NewOpportunitySheet onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); void reload() }} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// New Deal sheet
// ─────────────────────────────────────────────────────────────────
function NewOpportunitySheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [title, setTitle] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [value, setValue] = useState<number | ''>('')
  const [probability, setProbability] = useState<number>(20)
  const [stage, setStage] = useState<OpportunityStage>('Qualification')
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.customers().then(setCustomers).catch(() => setCustomers([])) }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !customerId || !user || busy) return
    setBusy(true)
    const payload: CreateOpportunityDto = {
      title: title.trim(), customerId, ownerId: user.id, stage,
      value: typeof value === 'number' ? value : 0,
      probability,
    }
    try {
      await api.createOpportunity(payload)
      toast('Deal created'); onSaved()
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed') }
    finally { setBusy(false) }
  }

  return (
    <Sheet onClose={onClose} title="New deal">
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input required placeholder="Deal title *" value={title} onChange={(e) => setTitle(e.target.value)} style={inp} />
        <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inp}>
          <option value="">Select customer *</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input placeholder="Value" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value === '' ? '' : Number(e.target.value))} style={inp} />
          <input placeholder="Probability" inputMode="numeric" value={probability} onChange={(e) => setProbability(Math.max(0, Math.min(100, Number(e.target.value))))} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5C5C74', marginBottom: 5 }}>Stage</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STAGES.map((s) => (
              <div key={s} onClick={() => setStage(s)} style={{
                cursor: 'pointer',
                border: `1px solid ${stage === s ? STAGE_COLOR[s] : '#E5E7F0'}`,
                background: stage === s ? STAGE_COLOR[s] + '15' : '#fff',
                color: stage === s ? STAGE_COLOR[s] : '#5C5C74',
                borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700,
              }}>{s}</div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{ ...outlineBtn, flex: 1 }}>Cancel</button>
          <button type="submit" disabled={busy || !title.trim() || !customerId} style={{ ...primaryBtn, flex: 1, opacity: busy || !title.trim() || !customerId ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Sheet>
  )
}

// ─── Styles ─────────────────────────────────────────────────────
const miniCard = (accent: string): CSSProperties => ({ flex: 1, background: '#fff', border: `1px solid ${accent}20`, borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: '9px 11px' })
const miniLabel: CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase' }
const miniValue: CSSProperties = { fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700, marginTop: 2 }
const stageChip = (on: boolean, color: string): CSSProperties => ({
  cursor: 'pointer', flex: 'none',
  border: `1px solid ${on ? color : '#E5E7F0'}`,
  background: on ? color + '15' : '#fff',
  color: on ? color : '#5C5C74',
  borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700,
})
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const outlineBtn: CSSProperties = { background: '#fff', color: '#3B3B52', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const inp: CSSProperties = { width: '100%', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }
