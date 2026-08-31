import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CreateOpportunityDto, CustomerDto, ForecastDto, OpportunityDto, OpportunityStage } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { Sheet } from './MobileDetails'

const STAGE_COLOR: Record<OpportunityStage, string> = {
  Qualification: '#2A6FDB', Proposal: '#B4650A', Negotiation: '#6C55E0', Won: '#0E9C7E', Lost: '#8888A0',
}
// Gradient per stage — gives each column its own personality. Left→right subtle.
const STAGE_GRADIENT: Record<OpportunityStage, string> = {
  Qualification: 'linear-gradient(135deg,#2A6FDB,#4A88F0)',
  Proposal:      'linear-gradient(135deg,#B4650A,#E68A2E)',
  Negotiation:   'linear-gradient(135deg,#6C55E0,#9781F5)',
  Won:           'linear-gradient(135deg,#0E9C7E,#22C9A3)',
  Lost:          'linear-gradient(135deg,#6E6E82,#9598AA)',
}
const STAGES: OpportunityStage[] = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost']

type ViewMode = 'cards' | 'list'

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'

export default function MobileOpportunities() {
  const [rows, setRows] = useState<OpportunityDto[]>([])
  const [forecast, setForecast] = useState<ForecastDto | null>(null)
  const [q, setQ] = useState('')
  const [stageFilter, setStageFilter] = useState<OpportunityStage | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)
  const [view, setView] = useState<ViewMode>('cards')
  const [activeStage, setActiveStage] = useState<OpportunityStage>('Qualification')
  const scrollerRef = useRef<HTMLDivElement | null>(null)
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
        <div style={miniCard('linear-gradient(135deg,#6C55E0,#9781F5)', '#6C55E0')}>
          <div style={miniLabel}>Open</div>
          <div style={miniValue}>{fmt(summary.open)}</div>
        </div>
        <div style={miniCard('linear-gradient(135deg,#2A6FDB,#4A88F0)', '#2A6FDB')}>
          <div style={miniLabel}>Weighted</div>
          <div style={miniValue}>{fmt(summary.weighted)}</div>
        </div>
        {forecast && (
          <div style={miniCard('linear-gradient(135deg,#0E9C7E,#22C9A3)', '#0E9C7E')}>
            <div style={miniLabel}>MTD closed</div>
            <div style={miniValue}>{fmt(forecast.closed)}</div>
          </div>
        )}
      </div>

      {/* Search + view toggle */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          placeholder="Search deal or customer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, padding: '10px 12px', border: '1px solid #D0D0DF', borderRadius: 11, fontSize: 13.5, outline: 'none' }}
        />
        <div style={{ display: 'flex', padding: 3, background: '#F1F1F5', borderRadius: 9 }}>
          {(['cards', 'list'] as ViewMode[]).map((v) => (
            <div key={v} onClick={() => setView(v)} title={v === 'cards' ? 'Kanban cards' : 'Grouped list'} style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              background: view === v ? '#fff' : 'transparent',
              color: view === v ? '#2A6FDB' : '#5C5C74',
              boxShadow: view === v ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
            }}>{v === 'cards' ? '▢▢' : '☰'}</div>
          ))}
        </div>
      </div>

      {loading && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}

      {/* ── LIST view (grouped one column, all stages stacked) ── */}
      {!loading && view === 'list' && (
        <>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginRight: -16, paddingRight: 16 }}>
            <div onClick={() => setStageFilter('all')} style={stageChip(stageFilter === 'all', '#3B3B52')}>All</div>
            {STAGES.map((s) => (
              <div key={s} onClick={() => setStageFilter(s === stageFilter ? 'all' : s)} style={stageChip(stageFilter === s, STAGE_COLOR[s])}>{s}</div>
            ))}
          </div>
          {filtered.length === 0 && (
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
                  {rows.map((o) => <DealCard key={o.id} o={o} onOpen={() => navigate(`/m/opportunities/${o.id}`)} />)}
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* ── CARDS view (swipeable Kanban columns) ── */}
      {!loading && view === 'cards' && (
        <KanbanCards
          filtered={filtered}
          grouped={grouped}
          activeStage={activeStage}
          setActiveStage={setActiveStage}
          scrollerRef={scrollerRef}
          onOpen={(id) => navigate(`/m/opportunities/${id}`)}
        />
      )}

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
// Kanban swipeable columns
// ─────────────────────────────────────────────────────────────────
function KanbanCards({ filtered, grouped, activeStage, setActiveStage, scrollerRef, onOpen }: {
  filtered: OpportunityDto[]
  grouped: Record<string, OpportunityDto[]>
  activeStage: OpportunityStage
  setActiveStage: (s: OpportunityStage) => void
  scrollerRef: React.RefObject<HTMLDivElement | null>
  onOpen: (id: string) => void
}) {
  // When active stage changes (via chip click), scroll to that column.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const idx = STAGES.indexOf(activeStage)
    if (idx < 0) return
    const target = idx * el.clientWidth
    // Only auto-scroll if we're currently sitting on a different column — user
    // finger scrolls would trigger onScroll → setActiveStage; we don't want to
    // fight them.
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollTo({ left: target, behavior: 'smooth' })
  }, [activeStage, scrollerRef])

  // Sync active-stage highlight with scroll position (round to nearest column).
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
    const next = STAGES[Math.max(0, Math.min(STAGES.length - 1, idx))]
    if (next !== activeStage) setActiveStage(next)
  }

  return (
    <>
      {/* Stage indicator chips — tap to jump */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginRight: -16, paddingRight: 16 }}>
        {STAGES.map((s) => {
          const on = s === activeStage
          const count = (grouped[s] ?? []).length
          return (
            <div key={s} onClick={() => setActiveStage(s)} style={{
              cursor: 'pointer', flex: 'none',
              background: on ? STAGE_GRADIENT[s] : '#fff',
              color: on ? '#fff' : '#5C5C74',
              border: `1px solid ${on ? 'transparent' : '#E5E7F0'}`,
              borderRadius: 999, padding: '5px 12px', fontSize: 11.5, fontWeight: 700,
              boxShadow: on ? `0 4px 10px ${STAGE_COLOR[s]}40` : undefined,
              transition: 'all .15s',
            }}>{s} · {count}</div>
          )
        })}
      </div>

      {/* Hint strip */}
      <div style={{ fontSize: 10.5, color: '#8888A0', textAlign: 'center', letterSpacing: '.04em' }}>
        ← swipe to switch stage →
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No deals match this filter.</div>
      )}

      {/* Scroll-snap horizontal row — each column takes 100% of the shell width */}
      <div
        ref={scrollerRef as React.RefObject<HTMLDivElement>}
        onScroll={onScroll}
        style={{
          display: 'flex',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          gap: 0,
          marginLeft: -16,
          marginRight: -16,
          paddingLeft: 0,
          paddingRight: 0,
          // Hide default scrollbar for a native feel; the chip strip is the affordance.
          scrollbarWidth: 'none',
        }}
      >
        {STAGES.map((s) => {
          const rows = grouped[s] ?? []
          const total = rows.reduce((a, o) => a + o.value, 0)
          const weighted = rows.reduce((a, o) => a + o.value * (o.probability / 100), 0)
          return (
            <div key={s} style={{
              flex: '0 0 100%',
              width: '100%',
              scrollSnapAlign: 'center',
              scrollSnapStop: 'always',
              padding: '0 16px',
              boxSizing: 'border-box',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {/* Colored stage header */}
              <div style={{
                background: STAGE_GRADIENT[s], color: '#fff', borderRadius: 14,
                padding: '13px 15px', boxShadow: `0 6px 18px -6px ${STAGE_COLOR[s]}80`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', flex: 1 }}>{s}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.9 }}>{rows.length} deal{rows.length === 1 ? '' : 's'}</div>
                </div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 9.5, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '.06em' }}>Total</div>
                    <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 800 }}>{fmt(total)}</div>
                  </div>
                  <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,.25)' }} />
                  <div>
                    <div style={{ fontSize: 9.5, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '.06em' }}>Weighted</div>
                    <div style={{ fontFamily: "'Space Grotesk'", fontSize: 14, fontWeight: 700 }}>{fmt(weighted)}</div>
                  </div>
                </div>
              </div>

              {/* Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 96 /* space above FAB */ }}>
                {rows.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 12, background: '#F7F8FC', border: '1px dashed #D0D0DF', borderRadius: 12 }}>
                    No deals in {s}.
                  </div>
                )}
                {rows.map((o) => <DealCard key={o.id} o={o} onOpen={() => onOpen(o.id)} big />)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Dots underneath — position indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: -4 }}>
        {STAGES.map((s) => (
          <div key={s} style={{
            width: s === activeStage ? 18 : 6, height: 6, borderRadius: 3,
            background: s === activeStage ? STAGE_COLOR[s] : '#D0D0DF',
            transition: 'all .15s',
          }} />
        ))}
      </div>
    </>
  )
}

function DealCard({ o, onOpen, big }: { o: OpportunityDto; onOpen: () => void; big?: boolean }) {
  const probColor = o.probability >= 60 ? '#0E9C7E' : o.probability >= 30 ? '#B4650A' : '#8888A0'
  const stageColor = STAGE_COLOR[o.stage]
  return (
    <div
      onClick={onOpen}
      style={{
        background: '#fff', border: '1px solid #E5E7F0', borderRadius: big ? 13 : 11,
        borderLeft: `4px solid ${stageColor}`,
        padding: big ? '12px 14px' : '10px 12px', cursor: 'pointer',
        boxShadow: big ? '0 2px 6px rgba(30,30,48,.04)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: big ? 13.5 : 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title}</div>
          <div style={{ fontSize: 11, color: '#8888A0', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.customerName ?? '—'}</div>
        </div>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: big ? 14 : 12.5, fontWeight: 800, color: stageColor, flex: 'none' }}>{fmt(o.value)}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: big ? 10 : 6 }}>
        <div style={{ flex: 1, height: 5, background: '#F1F1F5', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${o.probability}%`, height: '100%', background: probColor, transition: 'width .2s' }} />
        </div>
        <div style={{ fontSize: 10.5, color: probColor, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", minWidth: 36, textAlign: 'right' }}>{o.probability}%</div>
        {o.ownerName && (
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#EEF3FC', color: '#2A6FDB', border: '1px solid #D6E2F7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 800, flex: 'none' }} title={o.ownerName}>
            {o.ownerName.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()}
          </div>
        )}
      </div>
      {o.closeDate && (
        <div style={{ fontSize: 10.5, color: '#8888A0', marginTop: 5 }}>
          Close by {new Date(o.closeDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
        </div>
      )}
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
const miniCard = (bg: string, shadowColor = '#2A6FDB'): CSSProperties => ({ flex: 1, background: bg, color: '#fff', borderRadius: 12, padding: '10px 12px', boxShadow: `0 6px 16px -8px ${shadowColor}CC` })
const miniLabel: CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(255,255,255,.9)', textTransform: 'uppercase' }
const miniValue: CSSProperties = { fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 800, marginTop: 2, color: '#fff' }
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
