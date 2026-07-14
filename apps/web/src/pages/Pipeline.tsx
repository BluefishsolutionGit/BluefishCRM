import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from 'react'
import type { ForecastDto, OpportunityDto, OpportunityStage } from '@bluefish/shared'
import { SERVICE_LINES } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { av } from '../lib/styleUtils'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'
import OpportunityDetailModal from '../components/OpportunityDetailModal'

type View = 'kanban' | 'list' | 'forecast'
const STAGES: { name: OpportunityStage; c: string }[] = [
  { name: 'Qualification', c: '#8888A0' },
  { name: 'Proposal', c: '#1F5AC2' },
  { name: 'Negotiation', c: '#B4650A' },
  { name: 'Won', c: '#2A6FDB' },
  { name: 'Lost', c: '#C0392B' },
]
const FCAT_COLOR: Record<string, string> = { Closed: '#06A94A', Commit: '#2A6FDB', 'Best Case': '#6C55E0', Pipeline: '#8888A0' }
const SERVICE_COLOR: Record<string, string> = { Box: '#2A6FDB', '3S': '#0E9C7E', '3D': '#B4650A', 'AI&RPA': '#6C55E0' }

/**
 * Probability pill colors — 100% = green (a closed-won deal), then graded
 * from blue → purple → amber → orange → red as confidence drops.
 * Returns a filled pill style.
 */
function probStyle(p: number): CSSProperties {
  const b =
    p >= 100 ? { bg: '#D6F5E3', fg: '#0E6E4E', border: '#8AD9AC' }
    : p >= 80 ? { bg: '#DDEAFB', fg: '#1F5AC2', border: '#B7CFF3' }
    : p >= 60 ? { bg: '#EAE7F7', fg: '#5B3FC4', border: '#CDBFF9' }
    : p >= 40 ? { bg: '#FEF3E2', fg: '#B4650A', border: '#F0BA95' }
    : p >= 20 ? { bg: '#FEEFE6', fg: '#D2601A', border: '#F0BA95' }
    :           { bg: '#FDECEA', fg: '#C0392B', border: '#F5B7B1' }
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: b.bg, color: b.fg, border: `1px solid ${b.border}`,
    borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '2px 8px',
    fontFamily: "'IBM Plex Mono', monospace",
    whiteSpace: 'nowrap',
  }
}
const fmt = (n: number) => n >= 1e6 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'

const OWNER_COLORS = ['#2A6FDB', '#1F5AC2', '#B4650A', '#6C55E0', '#0E9C7E']
function colorFor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return OWNER_COLORS[Math.abs(h) % OWNER_COLORS.length]
}
function ownerInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('')
}

export default function Pipeline() {
  const [view, setView] = useState<View>('kanban')
  const [serviceFilter, setServiceFilter] = useState<string>('all')  // 'all' | 'Box' | '3S' | '3D' | 'AI&RPA' | 'unassigned'
  const [selectedOpp, setSelectedOpp] = useState<OpportunityDto | null>(null)
  const [opps, setOpps] = useState<OpportunityDto[]>([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [forecast, setForecast] = useState<ForecastDto | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canMove = hasPermission('opportunity:write')

  const reload = async () => {
    setLoading(true)
    try { setOpps(await api.opportunities()) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed to load opportunities') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  useEffect(() => {
    if (view === 'forecast') api.forecast().then(setForecast).catch(() => setForecast(null))
  }, [view, opps])

  const filteredOpps = useMemo(() => {
    if (serviceFilter === 'all') return opps
    if (serviceFilter === 'unassigned') return opps.filter((o) => !o.serviceOrProduct)
    return opps.filter((o) => o.serviceOrProduct === serviceFilter)
  }, [opps, serviceFilter])

  const columns = useMemo(() => STAGES.filter((s) => s.name !== 'Lost').map((s) => ({
    ...s, deals: filteredOpps.filter((o) => o.stage === s.name),
    total: filteredOpps.filter((o) => o.stage === s.name).reduce((a, o) => a + o.value, 0),
  })), [filteredOpps])
  const pipeTotal = filteredOpps.filter((o) => o.stage !== 'Won' && o.stage !== 'Lost').reduce((a, o) => a + o.value, 0)

  const serviceCounts = useMemo(() => {
    const acc: Record<string, number> = { all: opps.length, unassigned: 0 }
    for (const line of SERVICE_LINES) acc[line] = 0
    for (const o of opps) {
      if (o.serviceOrProduct && acc[o.serviceOrProduct] !== undefined) acc[o.serviceOrProduct]++
      else if (!o.serviceOrProduct) acc.unassigned++
    }
    return acc
  }, [opps])

  const moveTo = async (deal: OpportunityDto, stage: OpportunityStage) => {
    if (!canMove || deal.stage === stage) return
    setOpps((os) => os.map((o) => (o.id === deal.id ? { ...o, stage } : o)))
    try { const upd = await api.setOpportunityStage(deal.id, stage); setOpps((os) => os.map((o) => (o.id === upd.id ? upd : o))); toast(`"${deal.title}" → ${stage}`) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Stage change failed'); reload() }
  }

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const res = await api.importOpportunities(file)
      const summary = `Imported ${res.imported} · skipped ${res.skipped}${res.errors.length ? ` · ${res.errors.length} error(s) — check first row` : ''}`
      toast(summary)
      if (res.errors.length > 0 && res.errors[0]) {
        // eslint-disable-next-line no-console
        console.warn('Import errors:', res.errors)
      }
      await reload()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Import failed')
    } finally { setImporting(false) }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', animation: 'fadeUp .3s ease', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 28px 14px', flexWrap: 'wrap' }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 600 }}>Pipeline — Q3 FY2026</div>
        <div style={{ flex: 1 }} />

        <a href={api.opportunitiesImportTemplateUrl()} target="_blank" rel="noopener noreferrer" style={ioBtn}>Template</a>
        <a href={api.opportunitiesExportUrl()} style={ioBtn}>Export ↓</a>
        {canMove && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onImport} style={{ display: 'none' }} />
            <div onClick={() => fileRef.current?.click()} style={{ ...ioBtn, opacity: importing ? 0.5 : 1 }}>{importing ? 'Importing…' : 'Import ↑'}</div>
          </>
        )}

        <div style={{ display: 'flex', background: '#fff', border: '1px solid #E5E7F0', borderRadius: 9, padding: 3, gap: 2 }}>
          {(['kanban', 'list', 'forecast'] as View[]).map((v) => (
            <div key={v} onClick={() => setView(v)} style={viewTab(view === v)}>
              {v === 'kanban' ? 'Kanban' : v === 'list' ? 'List' : 'Forecast'}
            </div>
          ))}
        </div>
      </div>

      {view === 'kanban' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 28px', overflow: 'hidden' }}>
          <ServiceFilterRow filter={serviceFilter} onFilter={setServiceFilter} counts={serviceCounts} />
          <div style={{ display: 'flex', gap: 18, marginBottom: 14, fontSize: 12.5, color: '#5C5C74', alignItems: 'center' }}>
            <div>Total open <b style={{ color: '#1E1E30', fontFamily: "'Space Grotesk'" }}>{fmt(pipeTotal)}</b></div>
            <div>{filteredOpps.length} of {opps.length} deals</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 11.5, color: '#8888A0' }}>{canMove ? 'Drag cards between stages' : 'Read-only'}</div>
          </div>
          {loading && <div style={{ color: '#8888A0', padding: 24 }}>Loading…</div>}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 13, overflow: 'auto', paddingBottom: 20 }}>
            {columns.map((col) => (
              <div
                key={col.name}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragId) {
                    const d = opps.find((x) => x.id === dragId)
                    setDragId(null)
                    if (d) moveTo(d, col.name)
                  }
                }}
                style={{ width: 284, minWidth: 284, background: '#EAEAF4', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, alignSelf: 'flex-start', maxHeight: '100%', overflow: 'auto' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
                  <div style={{ width: 9, height: 9, borderRadius: 3, background: col.c }} />
                  <div style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>{col.name}</div>
                  <div style={{ fontSize: 11.5, color: '#5C5C74' }}>
                    {col.deals.length} · <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: '#1E1E30' }}>{fmt(col.total)}</span>
                  </div>
                </div>
                {col.deals.map((d) => (
                  <div
                    key={d.id}
                    draggable={canMove}
                    onDragStart={(e: DragEvent<HTMLDivElement>) => { setDragId(d.id); e.dataTransfer.effectAllowed = 'move' }}
                    onClick={() => setSelectedOpp(d)}
                    style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 12, padding: '13px 14px', cursor: canMove ? 'grab' : 'pointer', boxShadow: '0 1px 2px rgba(14,31,25,.05)' }}
                    title="Click to open · drag to move"
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35, flex: 1 }}>{d.title}</div>
                      {d.serviceOrProduct && (
                        <span style={{ background: hexToRgba(SERVICE_COLOR[d.serviceOrProduct] ?? '#5C5C74', 0.12), color: SERVICE_COLOR[d.serviceOrProduct] ?? '#5C5C74', border: `1px solid ${hexToRgba(SERVICE_COLOR[d.serviceOrProduct] ?? '#5C5C74', 0.35)}`, borderRadius: 6, fontSize: 10, fontWeight: 700, padding: '2px 6px', whiteSpace: 'nowrap', flex: 'none' }}>
                          {d.serviceOrProduct}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#5C5C74', marginTop: 3 }}>{d.customerName}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 14.5, fontWeight: 700 }}>{fmt(d.value)}</div>
                      <span style={probStyle(d.probability)}>{d.probability}%</span>
                      <div style={{ flex: 1 }} />
                      <div style={av(24, colorFor(d.ownerName))}>{ownerInitials(d.ownerName)}</div>
                    </div>
                    {d.closeDate && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: '#8888A0' }}>
                        <svg viewBox="0 0 24 24" width="12" height="12"><path d="M4 6.5h16V20H4z M4 11h16 M8.5 3.5v5 M15.5 3.5v5" fill="none" stroke="#8888A0" strokeWidth={1.8} /></svg>
                        {new Date(d.closeDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                    {d.aiHint && (
                      <div style={{ marginTop: 9, background: '#F4F1FD', borderRadius: 8, padding: '7px 9px', fontSize: 11, lineHeight: 1.45, color: '#4A3AB8', display: 'flex', gap: 6 }}>
                        <span>✦</span><span>{d.aiHint}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'list' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 28px 24px' }}>
          <ServiceFilterRow filter={serviceFilter} onFilter={setServiceFilter} counts={serviceCounts} />
          <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ ...gridColsList, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8888A0' }}>
              <div>Opportunity</div><div>Service</div><div>Owner</div><div>Stage</div><div style={{ textAlign: 'right' }}>Amount</div><div>Probability</div><div>Close</div>
            </div>
            {filteredOpps.map((o) => (
              <div key={o.id} onClick={() => setSelectedOpp(o)} style={{ ...gridColsList, padding: '12px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#2A6FDB' }}>{o.title} — {o.customerName}</div>
                <div>
                  {o.serviceOrProduct ? (
                    <span style={{ background: hexToRgba(SERVICE_COLOR[o.serviceOrProduct] ?? '#5C5C74', 0.12), color: SERVICE_COLOR[o.serviceOrProduct] ?? '#5C5C74', border: `1px solid ${hexToRgba(SERVICE_COLOR[o.serviceOrProduct] ?? '#5C5C74', 0.35)}`, borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '2px 7px' }}>
                      {o.serviceOrProduct}
                    </span>
                  ) : <span style={{ fontSize: 11, color: '#B4B4C4' }}>—</span>}
                </div>
                <div style={{ fontSize: 12.5, color: '#3B3B52' }}>{o.ownerName}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: o.stage === 'Won' ? '#0E9C7E' : o.stage === 'Lost' ? '#C0392B' : '#3B3B52' }}>{o.stage}</div>
                <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>{fmt(o.value)}</div>
                <div><span style={probStyle(o.probability)}>{o.probability}%</span></div>
                <div style={{ fontSize: 12.5, color: '#5C5C74' }}>{o.closeDate ? new Date(o.closeDate).toLocaleDateString() : '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'forecast' && forecast && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 28px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>
            {[
              { l: 'Closed Won', v: forecast.closed, g: 'linear-gradient(135deg,#22C9B4,#0E9C7E)', sub: 'Booked this quarter' },
              { l: 'Commit', v: forecast.commit, g: 'linear-gradient(135deg,#2E6BE6,#1B2F8F)', sub: 'High confidence' },
              { l: 'Best Case', v: forecast.bestCase, g: 'linear-gradient(135deg,#8A5CF6,#5B2C9E)', sub: 'Upside included' },
              { l: 'Pipeline', v: forecast.pipeline, g: 'linear-gradient(135deg,#9CA3B4,#5C6270)', sub: 'Early stage' },
            ].map((k) => (
              <div key={k.l} style={{ borderRadius: 14, padding: '16px 18px', color: '#fff', background: k.g }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.95 }}>{k.l}</div>
                <div style={{ fontFamily: "'Space Grotesk'", fontSize: 28, fontWeight: 700, marginTop: 8, lineHeight: 1 }}>{fmt(k.v)}</div>
                <div style={{ fontSize: 11, opacity: 0.9, marginTop: 5 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Forecast vs quota</div>
              <div style={{ fontSize: 12, color: '#5C5C74' }}>
                Committed <b style={{ fontFamily: "'Space Grotesk'", color: '#1E1E30' }}>{fmt(forecast.closed + forecast.commit)}</b> of <b style={{ fontFamily: "'Space Grotesk'", color: '#1E1E30' }}>{fmt(forecast.quota)}</b> ·
                <span style={{ color: '#06A94A', fontWeight: 700 }}> {forecast.attainmentPct}% attained</span>
              </div>
            </div>
            <div style={{ height: 26, background: '#F2F3F9', borderRadius: 8, display: 'flex', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: FCAT_COLOR.Closed, width: `${(forecast.closed / forecast.quota) * 100}%` }} />
              <div style={{ height: '100%', background: FCAT_COLOR.Commit, width: `${(forecast.commit / forecast.quota) * 100}%` }} />
              <div style={{ height: '100%', background: FCAT_COLOR['Best Case'], width: `${(forecast.bestCase / forecast.quota) * 100}%` }} />
            </div>
            <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 12 }}>
              Weighted forecast: <b style={{ color: '#1E1E30', fontFamily: "'Space Grotesk'" }}>{fmt(forecast.weighted)}</b>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F2F3F9', fontSize: 13, fontWeight: 700 }}>Forecast by sales rep</div>
            <div style={{ ...repGrid, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8888A0' }}>
              <div>Sales rep</div><div style={{ textAlign: 'right' }}>Closed</div><div style={{ textAlign: 'right' }}>Commit</div><div style={{ textAlign: 'right' }}>Best case</div><div style={{ textAlign: 'right' }}>Pipeline</div><div style={{ textAlign: 'right' }}>Total</div>
            </div>
            {forecast.byRep.map((r) => (
              <div key={r.ownerId} style={{ ...repGrid, padding: '13px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'IBM Plex Sans Thai'" }}>
                  <div style={av(26, colorFor(r.ownerName))}>{ownerInitials(r.ownerName)}</div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.ownerName}</span>
                </div>
                <div style={{ textAlign: 'right', color: '#06A94A', fontWeight: 600 }}>{fmt(r.closed)}</div>
                <div style={{ textAlign: 'right' }}>{fmt(r.commit)}</div>
                <div style={{ textAlign: 'right' }}>{fmt(r.bestCase)}</div>
                <div style={{ textAlign: 'right', color: '#8888A0' }}>{fmt(r.pipeline)}</div>
                <div style={{ textAlign: 'right', fontWeight: 700, fontFamily: "'Space Grotesk'" }}>{fmt(r.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <OpportunityDetailModal
        opp={selectedOpp}
        onClose={() => setSelectedOpp(null)}
        onChanged={(upd) => {
          setOpps((os) => os.map((o) => (o.id === upd.id ? upd : o)))
          setSelectedOpp(upd)
        }}
        onDeleted={(id) => {
          setOpps((os) => os.filter((o) => o.id !== id))
          setSelectedOpp(null)
        }}
      />
    </div>
  )
}

function viewTab(active: boolean): CSSProperties {
  return { borderRadius: 7, fontSize: 12, fontWeight: 600, padding: '5px 13px', cursor: 'pointer', background: active ? '#2E1A6B' : 'transparent', color: active ? '#fff' : '#5C5C74' }
}
const gridColsList: CSSProperties = { display: 'grid', gridTemplateColumns: '2.4fr 100px 130px 130px 130px 110px 130px', gap: 10 }
const ioBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #E5E7F0', background: '#fff', borderRadius: 9, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#3B3B52', textDecoration: 'none' }

function ServiceFilterRow({ filter, onFilter, counts }: { filter: string; onFilter: (v: string) => void; counts: Record<string, number> }) {
  const chips: Array<{ id: string; label: string; color: string }> = [
    { id: 'all', label: 'All', color: '#5C5C74' },
    ...SERVICE_LINES.map((s) => ({ id: s, label: s, color: SERVICE_COLOR[s] ?? '#5C5C74' })),
    { id: 'unassigned', label: 'No service', color: '#B4B4C4' },
  ]
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
      {chips.map((c) => {
        const active = filter === c.id
        const count = counts[c.id] ?? 0
        return (
          <div
            key={c.id}
            onClick={() => onFilter(c.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: active ? c.color : hexToRgba(c.color, 0.09),
              color: active ? '#fff' : c.color,
              border: `1px solid ${active ? c.color : hexToRgba(c.color, 0.35)}`,
              borderRadius: 999,
              padding: '6px 13px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 120ms',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#fff' : c.color }} />
            {c.label}
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, opacity: 0.85 }}>{count}</span>
          </div>
        )
      })}
    </div>
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
const repGrid: CSSProperties = { display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr 1fr', gap: 10 }
