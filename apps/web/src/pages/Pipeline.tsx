import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type FormEvent } from 'react'
import type { CreateOpportunityDto, CustomerDto, ForecastDto, OpportunityDto, OpportunityStage, UserDto } from '@bluefish/shared'
import { SERVICE_LINES } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { av } from '../lib/styleUtils'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'
import OpportunityDetailModal from '../components/OpportunityDetailModal'

type View = 'kanban' | 'probability' | 'list' | 'forecast'

interface PipelineColumn {
  name: string      // matches opp.stage
  color: string
  isArchived: boolean
  system?: boolean  // Won/Lost carry forecast semantics — cannot be deleted
}

const CONFIG_KEY = 'bluefish.pipeline.config.v1'
const PROB_CONFIG_KEY = 'bluefish.pipeline.prob-config.v1'
const SYSTEM_STAGES = new Set(['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost'])

interface ProbBucket { pct: number; color: string }

function defaultProbColor(pct: number): string {
  // Mirrors probStyle() palette so the initial column color matches the pill on the card.
  if (pct >= 100) return '#0E9C7E'
  if (pct >= 80)  return '#1F5AC2'
  if (pct >= 60)  return '#6C55E0'
  if (pct >= 40)  return '#B4650A'
  if (pct >= 20)  return '#D2601A'
  return '#C0392B'
}
const DEFAULT_PROB_PCTS = [25, 50, 75, 90, 100]
const DEFAULT_PROB_BUCKETS: ProbBucket[] = DEFAULT_PROB_PCTS.map((p) => ({ pct: p, color: defaultProbColor(p) }))

function loadProbConfig(): ProbBucket[] {
  try {
    const raw = localStorage.getItem(PROB_CONFIG_KEY)
    if (!raw) return DEFAULT_PROB_BUCKETS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PROB_BUCKETS
    // Handle legacy format: [25, 50, 75, ...] → derive colors from the palette
    const normalized: ProbBucket[] = parsed.map((v) => {
      if (typeof v === 'number') return { pct: Math.round(v), color: defaultProbColor(v) }
      if (v && typeof v === 'object' && typeof v.pct === 'number') {
        return { pct: Math.round(v.pct), color: typeof v.color === 'string' ? v.color : defaultProbColor(v.pct) }
      }
      return null as unknown as ProbBucket
    }).filter((b) => b && Number.isFinite(b.pct) && b.pct >= 0 && b.pct <= 100)
    const seen = new Set<number>()
    const clean = normalized.filter((b) => (seen.has(b.pct) ? false : (seen.add(b.pct), true)))
      .sort((a, b) => a.pct - b.pct)
    return clean.length > 0 ? clean : DEFAULT_PROB_BUCKETS
  } catch {
    return DEFAULT_PROB_BUCKETS
  }
}
function saveProbConfig(buckets: ProbBucket[]) {
  try { localStorage.setItem(PROB_CONFIG_KEY, JSON.stringify(buckets)) } catch { /* quota — ignore */ }
}
function nearestBucket(prob: number, buckets: ProbBucket[]): number {
  let best = buckets[0].pct, bestDist = Math.abs(prob - best)
  for (let i = 1; i < buckets.length; i++) {
    const d = Math.abs(prob - buckets[i].pct)
    if (d < bestDist) { best = buckets[i].pct; bestDist = d }
  }
  return best
}

const DEFAULT_COLUMNS: PipelineColumn[] = [
  { name: 'Qualification', color: '#8888A0', isArchived: false, system: true },
  { name: 'Proposal',      color: '#1F5AC2', isArchived: false, system: true },
  { name: 'Negotiation',   color: '#B4650A', isArchived: false, system: true },
  { name: 'Won',           color: '#2A6FDB', isArchived: false, system: true },
  { name: 'Lost',          color: '#C0392B', isArchived: true,  system: true },
]

const COLOR_PALETTE = ['#8888A0', '#1F5AC2', '#2A6FDB', '#0E9C7E', '#B4650A', '#D2601A', '#C0392B', '#6C55E0', '#4A3AB8', '#0E6E4E']

function loadConfig(): PipelineColumn[] {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return DEFAULT_COLUMNS
    const parsed = JSON.parse(raw) as PipelineColumn[]
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_COLUMNS
    // Ensure system stages are always represented so Won/Lost don't disappear if the user's saved config drifts
    const withSystem = [...parsed]
    for (const s of DEFAULT_COLUMNS) {
      if (!withSystem.some((c) => c.name === s.name)) withSystem.push(s)
    }
    return withSystem.map((c) => ({ ...c, system: SYSTEM_STAGES.has(c.name) || c.system }))
  } catch {
    return DEFAULT_COLUMNS
  }
}

function saveConfig(cols: PipelineColumn[]) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cols)) } catch { /* quota — ignore */ }
}

const FCAT_COLOR: Record<string, string> = { Closed: '#06A94A', Commit: '#2A6FDB', 'Best Case': '#6C55E0', Pipeline: '#8888A0' }
const SERVICE_COLOR: Record<string, string> = { Box: '#2A6FDB', '3S': '#0E9C7E', '3D': '#B4650A', 'AI&RPA': '#6C55E0' }

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
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [selectedOpp, setSelectedOpp] = useState<OpportunityDto | null>(null)
  const [opps, setOpps] = useState<OpportunityDto[]>([])
  const [users, setUsers] = useState<UserDto[]>([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [forecast, setForecast] = useState<ForecastDto | null>(null)
  const [importing, setImporting] = useState(false)
  const [columns, setColumns] = useState<PipelineColumn[]>(() => loadConfig())
  const [probBuckets, setProbBuckets] = useState<ProbBucket[]>(() => loadProbConfig())
  const [showArchived, setShowArchived] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [showManageProb, setShowManageProb] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()
  const { hasPermission, user } = useAuth()
  const canMove = hasPermission('opportunity:write')
  const canFilterByOwner = user?.role === 'admin' || user?.role === 'sales_manager'

  useEffect(() => { saveConfig(columns) }, [columns])
  useEffect(() => { saveProbConfig(probBuckets) }, [probBuckets])
  useEffect(() => {
    // Owner filter needs a full user list; the create-deal modal also picks an owner.
    api.users().then(setUsers).catch(() => setUsers([]))
  }, [])

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
    let list = opps
    if (serviceFilter === 'unassigned') list = list.filter((o) => !o.serviceOrProduct)
    else if (serviceFilter !== 'all') list = list.filter((o) => o.serviceOrProduct === serviceFilter)
    if (ownerFilter !== 'all') list = list.filter((o) => o.ownerId === ownerFilter)
    return list
  }, [opps, serviceFilter, ownerFilter])

  // Owners with at least one deal — populates the "filter by salesperson" dropdown
  const ownerOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const o of opps) if (!seen.has(o.ownerId)) seen.set(o.ownerId, o.ownerName)
    // Prefer full user list ordering when available so inactive owners still appear
    if (users.length > 0) {
      return users
        .filter((u) => seen.has(u.id) || u.isActive !== false)
        .map((u) => ({ id: u.id, name: u.name, hasDeals: seen.has(u.id) }))
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name, hasDeals: true }))
  }, [opps, users])

  const visibleColumns = useMemo(() => {
    return columns.filter((c) => showArchived || !c.isArchived)
  }, [columns, showArchived])

  const columnsWithDeals = useMemo(() => visibleColumns.map((c) => {
    const deals = filteredOpps.filter((o) => o.stage === c.name)
    return { ...c, deals, total: deals.reduce((a, o) => a + o.value, 0) }
  }), [visibleColumns, filteredOpps])

  const dealsPerColumn = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of opps) m.set(o.stage, (m.get(o.stage) ?? 0) + 1)
    return m
  }, [opps])

  const probColumnsWithDeals = useMemo(() => {
    const grouped = new Map<number, OpportunityDto[]>(probBuckets.map((b) => [b.pct, []]))
    for (const o of filteredOpps) {
      const bucket = nearestBucket(o.probability, probBuckets)
      grouped.get(bucket)!.push(o)
    }
    return probBuckets.map((b) => {
      const deals = grouped.get(b.pct) ?? []
      return { pct: b.pct, color: b.color, deals, total: deals.reduce((a, o) => a + o.value, 0) }
    })
  }, [filteredOpps, probBuckets])

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

  const moveTo = async (deal: OpportunityDto, stage: string) => {
    if (!canMove || deal.stage === stage) return
    setOpps((os) => os.map((o) => (o.id === deal.id ? { ...o, stage: stage as OpportunityStage } : o)))
    try { const upd = await api.setOpportunityStage(deal.id, stage as OpportunityStage); setOpps((os) => os.map((o) => (o.id === upd.id ? upd : o))); toast(`"${deal.title}" → ${stage}`) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Stage change failed'); reload() }
  }

  const moveToProb = async (deal: OpportunityDto, pct: number) => {
    if (!canMove || deal.probability === pct) return
    setOpps((os) => os.map((o) => (o.id === deal.id ? { ...o, probability: pct } : o)))
    try { const upd = await api.updateOpportunity(deal.id, { probability: pct }); setOpps((os) => os.map((o) => (o.id === upd.id ? upd : o))); toast(`"${deal.title}" → ${pct}%`) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Probability change failed'); reload() }
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

  const hasArchivedColumns = columns.some((c) => c.isArchived)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', animation: 'fadeUp .3s ease', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 28px 14px', flexWrap: 'wrap' }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 600 }}>
          Pipeline — Q3 FY2026
          <span style={{ color: '#2E1A6B', marginLeft: 6 }}>
            — {ownerFilter === 'all' ? 'All Sales' : (ownerOptions.find((o) => o.id === ownerFilter)?.name ?? 'All Sales')}
          </span>
        </div>
        <div style={{ flex: 1 }} />

        <button type="button" style={ioBtn} onClick={async () => {
          try { await api.downloadOpportunitiesTemplate() }
          catch (e) { toast(e instanceof ApiError ? e.message : 'Template download failed') }
        }}>Template</button>
        <button type="button" style={ioBtn} onClick={async () => {
          try { await api.downloadOpportunitiesExport() }
          catch (e) { toast(e instanceof ApiError ? e.message : 'Export failed') }
        }}>Export ↓</button>
        {canMove && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onImport} style={{ display: 'none' }} />
            <div onClick={() => fileRef.current?.click()} style={{ ...ioBtn, opacity: importing ? 0.5 : 1 }}>{importing ? 'Importing…' : 'Import ↑'}</div>
          </>
        )}
        {view === 'kanban' && canMove && (
          <div onClick={() => setShowManage(true)} style={ioBtn} title="Add / edit / reorder columns">⚙ Manage columns</div>
        )}
        {view === 'probability' && canMove && (
          <div onClick={() => setShowManageProb(true)} style={ioBtn} title="Add / edit / reorder probability buckets">⚙ Manage %</div>
        )}
        {canMove && (
          <button type="button" onClick={() => setShowCreate(true)} style={createBtn}>+ New deal</button>
        )}

        <div style={{ display: 'flex', background: '#fff', border: '1px solid #E5E7F0', borderRadius: 9, padding: 3, gap: 2 }}>
          {(['kanban', 'probability', 'list', 'forecast'] as View[]).map((v) => (
            <div key={v} onClick={() => setView(v)} style={viewTab(view === v)}>
              {v === 'kanban' ? 'Kanban' : v === 'probability' ? 'By %' : v === 'list' ? 'List' : 'Forecast'}
            </div>
          ))}
        </div>
      </div>

      {view === 'kanban' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 28px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <ServiceFilterRow filter={serviceFilter} onFilter={setServiceFilter} counts={serviceCounts} />
            {canFilterByOwner && (
              <OwnerFilter value={ownerFilter} owners={ownerOptions} onChange={setOwnerFilter} />
            )}
          </div>
          <PipelineBar columns={visibleColumns} opps={filteredOpps} />
          <div style={{ display: 'flex', gap: 18, marginBottom: 14, fontSize: 12.5, color: '#5C5C74', alignItems: 'center' }}>
            <div>Total open <b style={{ color: '#1E1E30', fontFamily: "'Space Grotesk'" }}>{fmt(pipeTotal)}</b></div>
            <div>{filteredOpps.length} of {opps.length} deals</div>
            <div style={{ flex: 1 }} />
            {hasArchivedColumns && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5C5C74', cursor: 'pointer' }}>
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Show archived columns
              </label>
            )}
            <div style={{ fontSize: 11.5, color: '#8888A0' }}>{canMove ? 'Drag cards between stages' : 'Read-only'}</div>
          </div>
          {loading && <div style={{ color: '#8888A0', padding: 24 }}>Loading…</div>}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 13, overflow: 'auto', paddingBottom: 20 }}>
            {columnsWithDeals.map((col) => (
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
                style={{
                  width: 296, minWidth: 296,
                  background: col.isArchived ? '#F1F1F7' : '#EAEAF4',
                  borderRadius: 14, padding: 12,
                  display: 'flex', flexDirection: 'column', gap: 10,
                  alignSelf: 'flex-start', maxHeight: '100%', overflow: 'auto',
                  outline: col.isArchived ? '1px dashed #C4C6D8' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
                  <div style={{ width: 11, height: 11, borderRadius: 3, background: col.color }} />
                  <div style={{ fontSize: 15, fontWeight: 700, flex: 1, color: '#1E1E30' }}>
                    {col.name}
                    {col.isArchived && <span style={{ marginLeft: 6, fontSize: 10, background: '#DFE1EE', color: '#5C5C74', padding: '2px 6px', borderRadius: 6, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' }}>Archived</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#5C5C74', fontWeight: 600 }}>
                    {col.deals.length} · <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: '#1E1E30' }}>{fmt(col.total)}</span>
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
                    {d.managerHint && (
                      <div style={{ marginTop: 9, background: '#F4F1FD', borderRadius: 8, padding: '7px 9px', fontSize: 11, lineHeight: 1.45, color: '#4A3AB8', display: 'flex', gap: 6 }} title="Manager suggestion">
                        <span>✦</span><span>{d.managerHint}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'probability' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 28px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <ServiceFilterRow filter={serviceFilter} onFilter={setServiceFilter} counts={serviceCounts} />
            {canFilterByOwner && (
              <OwnerFilter value={ownerFilter} owners={ownerOptions} onChange={setOwnerFilter} />
            )}
          </div>
          <ProbabilityBar buckets={probBuckets} opps={filteredOpps} />
          <div style={{ display: 'flex', gap: 18, marginBottom: 14, fontSize: 12.5, color: '#5C5C74', alignItems: 'center' }}>
            <div>Total open <b style={{ color: '#1E1E30', fontFamily: "'Space Grotesk'" }}>{fmt(pipeTotal)}</b></div>
            <div>{filteredOpps.length} of {opps.length} deals</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 11.5, color: '#8888A0' }}>{canMove ? 'Drag between % columns to update probability' : 'Read-only'}</div>
          </div>
          {loading && <div style={{ color: '#8888A0', padding: 24 }}>Loading…</div>}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 13, overflow: 'auto', paddingBottom: 20 }}>
            {probColumnsWithDeals.map((col) => {
              const color = col.color
              return (
                <div
                  key={col.pct}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragId) {
                      const d = opps.find((x) => x.id === dragId)
                      setDragId(null)
                      if (d) moveToProb(d, col.pct)
                    }
                  }}
                  style={{
                    width: 296, minWidth: 296,
                    background: '#EAEAF4',
                    borderRadius: 14, padding: 12,
                    display: 'flex', flexDirection: 'column', gap: 10,
                    alignSelf: 'flex-start', maxHeight: '100%', overflow: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
                    <div style={{ width: 11, height: 11, borderRadius: 3, background: color }} />
                    <div style={{ fontSize: 15, fontWeight: 700, flex: 1, color: '#1E1E30' }}>{col.pct}%</div>
                    <div style={{ fontSize: 13, color: '#5C5C74', fontWeight: 600 }}>
                      {col.deals.length} · <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: '#1E1E30' }}>{fmt(col.total)}</span>
                    </div>
                  </div>
                  {col.deals.map((d) => (
                    <div
                      key={d.id}
                      draggable={canMove}
                      onDragStart={(e: DragEvent<HTMLDivElement>) => { setDragId(d.id); e.dataTransfer.effectAllowed = 'move' }}
                      onClick={() => setSelectedOpp(d)}
                      style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 12, padding: '13px 14px', cursor: canMove ? 'grab' : 'pointer', boxShadow: '0 1px 2px rgba(14,31,25,.05)' }}
                      title="Click to open · drag to change probability"
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
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: '#5C5C74', background: '#F2F3F9', borderRadius: 6, padding: '2px 6px' }} title="Current stage">{d.stage}</span>
                        <div style={{ flex: 1 }} />
                        <div style={av(24, colorFor(d.ownerName))}>{ownerInitials(d.ownerName)}</div>
                      </div>
                      {d.closeDate && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: '#8888A0' }}>
                          <svg viewBox="0 0 24 24" width="12" height="12"><path d="M4 6.5h16V20H4z M4 11h16 M8.5 3.5v5 M15.5 3.5v5" fill="none" stroke="#8888A0" strokeWidth={1.8} /></svg>
                          {new Date(d.closeDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {view === 'list' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 28px 24px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <ServiceFilterRow filter={serviceFilter} onFilter={setServiceFilter} counts={serviceCounts} />
            {canFilterByOwner && (
              <OwnerFilter value={ownerFilter} owners={ownerOptions} onChange={setOwnerFilter} />
            )}
          </div>
          <PipelineBar columns={visibleColumns} opps={filteredOpps} />
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

      {showManage && (
        <ManageColumnsModal
          columns={columns}
          dealsPerColumn={dealsPerColumn}
          onClose={() => setShowManage(false)}
          onSave={(next) => { setColumns(next); setShowManage(false); toast('Pipeline columns saved') }}
          onReset={() => { setColumns(DEFAULT_COLUMNS); toast('Reset to defaults') }}
        />
      )}

      {showManageProb && (
        <ManageProbColumnsModal
          buckets={probBuckets}
          onClose={() => setShowManageProb(false)}
          onSave={(next) => { setProbBuckets(next); setShowManageProb(false); toast('Probability columns saved') }}
          onReset={() => { setProbBuckets(DEFAULT_PROB_BUCKETS); toast('Reset to defaults') }}
        />
      )}

      {showCreate && (
        <CreateDealModal
          columns={visibleColumns}
          users={users}
          defaultOwnerId={user?.id}
          onClose={() => setShowCreate(false)}
          onCreated={async (opp) => {
            setShowCreate(false)
            setOpps((os) => [opp, ...os])
            toast(`Deal "${opp.title}" created`)
          }}
        />
      )}
    </div>
  )
}

/* ─────────────── Manage Columns Modal ─────────────── */

function ManageColumnsModal({
  columns, dealsPerColumn, onClose, onSave, onReset,
}: {
  columns: PipelineColumn[]
  dealsPerColumn: Map<string, number>
  onClose: () => void
  onSave: (cols: PipelineColumn[]) => void
  onReset: () => void
}) {
  const [draft, setDraft] = useState<PipelineColumn[]>(() => columns.map((c) => ({ ...c })))
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COLOR_PALETTE[0])
  const [newArchived, setNewArchived] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const addColumn = () => {
    setErr(null)
    const trimmed = newName.trim()
    if (!trimmed) { setErr('Enter a column name'); return }
    if (draft.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setErr('A column with this name already exists'); return
    }
    setDraft([...draft, { name: trimmed, color: newColor, isArchived: newArchived, system: false }])
    setNewName(''); setNewArchived(false); setNewColor(COLOR_PALETTE[0])
  }

  const removeColumn = (idx: number) => {
    const col = draft[idx]
    const count = dealsPerColumn.get(col.name) ?? 0
    if (count > 0) { setErr(`"${col.name}" still has ${count} card(s). Move them first.`); return }
    if (col.system) { setErr(`"${col.name}" is a system column and cannot be deleted.`); return }
    setDraft(draft.filter((_, i) => i !== idx))
    setErr(null)
  }

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= draft.length) return
    const next = [...draft]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setDraft(next)
  }

  const patch = (idx: number, patch: Partial<PipelineColumn>) => {
    setDraft(draft.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,45,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ width: 620, maxWidth: '100%', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F2F3F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Manage pipeline columns</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: '#8082A5' }}>×</button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          <div style={{ background: '#F7F8FC', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3B3B52', marginBottom: 8 }}>Add a new column</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text" placeholder="Column name (e.g. Discovery, Demo, PoC)"
                value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColumn() } }}
                style={{ ...inputStyle, flex: 1, minWidth: 200 }}
              />
              <ColorSwatchPicker color={newColor} onChange={setNewColor} />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5C5C74' }}>
                <input type="checkbox" checked={newArchived} onChange={(e) => setNewArchived(e.target.checked)} />
                Archive
              </label>
              <button onClick={addColumn} style={primaryBtn}>+ Add</button>
            </div>
          </div>

          {err && <div style={{ ...errBox, marginBottom: 12 }}>{err}</div>}

          <div style={{ fontSize: 11, fontWeight: 700, color: '#8082A5', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Columns (top → bottom = left → right on board)</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {draft.map((c, i) => {
              const count = dealsPerColumn.get(c.name) ?? 0
              return (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E5E7F0', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button onClick={() => move(i, -1)} disabled={i === 0} style={arrowBtn(i === 0)}>▲</button>
                    <button onClick={() => move(i, 1)} disabled={i === draft.length - 1} style={arrowBtn(i === draft.length - 1)}>▼</button>
                  </div>
                  <ColorSwatchPicker color={c.color} onChange={(color) => patch(i, { color })} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E1E30' }}>
                      {c.name}
                      {c.system && <span style={{ marginLeft: 6, fontSize: 10, background: '#EEE7FF', color: '#6C55E0', padding: '1px 6px', borderRadius: 5, fontWeight: 700 }}>system</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#8082A5' }}>{count} card{count === 1 ? '' : 's'}</div>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#5C5C74' }}>
                    <input type="checkbox" checked={c.isArchived} onChange={(e) => patch(i, { isArchived: e.target.checked })} />
                    Archive
                  </label>
                  <button
                    onClick={() => removeColumn(i)}
                    disabled={c.system || count > 0}
                    style={c.system || count > 0 ? { ...linkBtnDanger, opacity: 0.4, cursor: 'not-allowed' } : linkBtnDanger}
                    title={c.system ? 'System column' : count > 0 ? 'Move cards out first' : 'Delete'}
                  >
                    Delete
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ padding: 14, borderTop: '1px solid #F2F3F9', display: 'flex', gap: 8 }}>
          <button onClick={onReset} style={ghostBtn}>Reset to defaults</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button onClick={() => onSave(draft)} style={primaryBtn}>Save</button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────── Manage % Buckets Modal ─────────────── */

function ManageProbColumnsModal({
  buckets, onClose, onSave, onReset,
}: {
  buckets: ProbBucket[]
  onClose: () => void
  onSave: (next: ProbBucket[]) => void
  onReset: () => void
}) {
  const [draft, setDraft] = useState<ProbBucket[]>(() => buckets.map((b) => ({ ...b })))
  const [newVal, setNewVal] = useState<string>('')
  const [newColor, setNewColor] = useState<string>(COLOR_PALETTE[0])
  const [err, setErr] = useState<string | null>(null)

  const add = () => {
    setErr(null)
    const n = Math.round(Number(newVal))
    if (!Number.isFinite(n)) { setErr('Enter a number between 0 and 100'); return }
    if (n < 0 || n > 100) { setErr('Value must be between 0 and 100'); return }
    if (draft.some((b) => b.pct === n)) { setErr(`${n}% is already a column`); return }
    setDraft([...draft, { pct: n, color: newColor }].sort((a, b) => a.pct - b.pct))
    setNewVal('')
  }
  const remove = (pct: number) => {
    if (draft.length <= 1) { setErr('At least one column is required'); return }
    setDraft(draft.filter((b) => b.pct !== pct))
    setErr(null)
  }
  const patchPct = (idx: number, value: number) => {
    const n = Math.round(value)
    if (!Number.isFinite(n) || n < 0 || n > 100) return
    const next = [...draft]
    next[idx] = { ...next[idx], pct: n }
    setDraft(next)
  }
  const patchColor = (idx: number, color: string) => {
    const next = [...draft]
    next[idx] = { ...next[idx], color }
    setDraft(next)
  }
  const commitSort = () => {
    const seen = new Set<number>()
    const dedup = draft.filter((b) => (seen.has(b.pct) ? false : (seen.add(b.pct), true)))
    setDraft(dedup.sort((a, b) => a.pct - b.pct))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,45,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ width: 520, maxWidth: '100%', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F2F3F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Manage probability columns</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: '#8082A5' }}>×</button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: 11.5, color: '#5C5C74', marginBottom: 12, lineHeight: 1.5 }}>
            Each column represents a target probability. Deals snap to the closest column;
            dragging a card sets its probability to that column's exact value.
          </div>

          <div style={{ background: '#F7F8FC', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3B3B52', marginBottom: 8 }}>Add a bucket</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number" min={0} max={100} placeholder="e.g. 60"
                value={newVal} onChange={(e) => setNewVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
                style={{ ...inputStyle, width: 120 }}
              />
              <span style={{ fontSize: 12, color: '#5C5C74' }}>%</span>
              <ColorSwatchPicker color={newColor} onChange={setNewColor} />
              <button onClick={add} style={primaryBtn}>+ Add</button>
            </div>
          </div>

          {err && <div style={{ ...errBox, marginBottom: 12 }}>{err}</div>}

          <div style={{ fontSize: 11, fontWeight: 700, color: '#8082A5', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Columns (low → high = left → right) — color applies to both the top bar and the column</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {draft.map((b, i) => (
              <div key={`${b.pct}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #E5E7F0', borderRadius: 10, padding: '8px 12px' }}>
                <ColorSwatchPicker color={b.color} onChange={(color) => patchColor(i, color)} />
                <input
                  type="number" min={0} max={100} value={b.pct}
                  onChange={(e) => patchPct(i, Number(e.target.value))}
                  onBlur={commitSort}
                  style={{ ...inputStyle, width: 90 }}
                />
                <span style={{ fontSize: 12, color: '#5C5C74' }}>%</span>
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => remove(b.pct)}
                  disabled={draft.length <= 1}
                  style={draft.length <= 1 ? { ...linkBtnDanger, opacity: 0.4, cursor: 'not-allowed' } : linkBtnDanger}
                  title={draft.length <= 1 ? 'At least one column required' : 'Delete'}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 14, borderTop: '1px solid #F2F3F9', display: 'flex', gap: 8 }}>
          <button onClick={onReset} style={ghostBtn}>Reset to defaults</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button
            onClick={() => {
              const seen = new Set<number>()
              const clean = draft
                .map((b) => ({ pct: Math.round(b.pct), color: b.color }))
                .filter((b) => Number.isFinite(b.pct) && b.pct >= 0 && b.pct <= 100)
                .filter((b) => (seen.has(b.pct) ? false : (seen.add(b.pct), true)))
                .sort((a, b) => a.pct - b.pct)
              if (clean.length === 0) { setErr('Keep at least one column'); return }
              onSave(clean)
            }}
            style={primaryBtn}
          >Save</button>
        </div>
      </div>
    </div>
  )
}

function ColorSwatchPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: 26, height: 26, borderRadius: 7, background: color, border: '2px solid #fff', boxShadow: '0 0 0 1px #E5E7F0', cursor: 'pointer' }}
        title="Choose color"
      />
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 210 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: 30, left: 0, zIndex: 211, background: '#fff', border: '1px solid #E5E7F0', borderRadius: 10, padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => { onChange(c); setOpen(false) }}
                style={{ width: 22, height: 22, borderRadius: 5, background: c, border: c === color ? '2px solid #1E1E30' : '1px solid #E5E7F0', cursor: 'pointer', padding: 0 }}
              />
            ))}
            <input
              type="color" value={color}
              onChange={(e) => onChange(e.target.value)}
              style={{ gridColumn: 'span 5', width: '100%', height: 26, padding: 0, border: '1px solid #E5E7F0', borderRadius: 5, cursor: 'pointer' }}
              title="Custom color"
            />
          </div>
        </>
      )}
    </div>
  )
}

/* ─────────────── Shared bits ─────────────── */

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

const inputStyle: CSSProperties = { border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const ghostBtn: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
const errBox: CSSProperties = { background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }
const linkBtnDanger: CSSProperties = { background: 'transparent', border: 'none', color: '#C0392B', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }
function arrowBtn(disabled: boolean): CSSProperties {
  return {
    width: 22, height: 16, fontSize: 10, lineHeight: 1,
    background: '#F7F8FC', border: '1px solid #E5E7F0', borderRadius: 4,
    color: disabled ? '#C4C6D8' : '#5C5C74',
    cursor: disabled ? 'not-allowed' : 'pointer', padding: 0,
  }
}

/* ─────────────── Pipeline Bar (chevron summary) ─────────────── */

function PipelineBar({ columns, opps }: { columns: PipelineColumn[]; opps: OpportunityDto[] }) {
  const items = useMemo(() => columns.map((c) => {
    const deals = opps.filter((o) => o.stage === c.name)
    return { name: c.name, color: c.color, count: deals.length, total: deals.reduce((a, o) => a + o.value, 0), isArchived: c.isArchived }
  }), [columns, opps])

  if (items.length === 0) return null

  const CHEV = 14  // chevron point width in px
  return (
    <div style={{ display: 'flex', height: 48, marginBottom: 14, minWidth: 0 }}>
      {items.map((it, i) => {
        const isFirst = i === 0
        const isLast = i === items.length - 1
        const active = it.count > 0
        const bg = active ? it.color : '#E5E7F0'
        const fg = active ? '#fff' : '#5C5C74'
        // Right-pointing chevron on all except last; left notch on all except first.
        const clip = isFirst && isLast
          ? undefined
          : isFirst
            ? `polygon(0 0, calc(100% - ${CHEV}px) 0, 100% 50%, calc(100% - ${CHEV}px) 100%, 0 100%)`
            : isLast
              ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${CHEV}px 50%)`
              : `polygon(0 0, calc(100% - ${CHEV}px) 0, 100% 50%, calc(100% - ${CHEV}px) 100%, 0 100%, ${CHEV}px 50%)`
        return (
          <div
            key={it.name}
            title={`${it.name} — ${it.count} deal${it.count === 1 ? '' : 's'} · ${fmt(it.total)}`}
            style={{
              flex: 1, minWidth: 0,
              background: bg, color: fg,
              clipPath: clip,
              marginLeft: isFirst ? 0 : -CHEV,
              paddingLeft: isFirst ? 14 : CHEV + 10,
              paddingRight: isLast ? 14 : CHEV + 10,
              display: 'flex', alignItems: 'center', gap: 10,
              opacity: it.isArchived ? 0.7 : 1,
            }}
          >
            <span style={{
              fontFamily: "'Space Grotesk'", fontSize: 13, fontWeight: 700,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
            }}>
              {it.name}
              {it.isArchived && <span style={{ marginLeft: 6, fontSize: 9.5, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.4 }}>arch</span>}
            </span>
            <span style={{
              fontFamily: "'Space Grotesk'", fontSize: 13, fontWeight: 700,
              whiteSpace: 'nowrap',
              background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
              padding: active ? '2px 8px' : 0,
              borderRadius: 999,
            }}>
              {it.count} · {fmt(it.total)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────── Probability Bar (chevron summary, % view) ─────────────── */

function ProbabilityBar({ buckets, opps }: { buckets: ProbBucket[]; opps: OpportunityDto[] }) {
  const items = useMemo(() => buckets.map((b) => {
    const deals = opps.filter((o) => nearestBucket(o.probability, buckets) === b.pct)
    return { pct: b.pct, color: b.color, count: deals.length, total: deals.reduce((a, o) => a + o.value, 0) }
  }), [buckets, opps])

  if (items.length === 0) return null

  const CHEV = 14
  return (
    <div style={{ display: 'flex', height: 48, marginBottom: 14, minWidth: 0 }}>
      {items.map((it, i) => {
        const isFirst = i === 0
        const isLast = i === items.length - 1
        const active = it.count > 0
        const bg = active ? it.color : '#E5E7F0'
        const fg = active ? '#fff' : '#5C5C74'
        const clip = isFirst && isLast
          ? undefined
          : isFirst
            ? `polygon(0 0, calc(100% - ${CHEV}px) 0, 100% 50%, calc(100% - ${CHEV}px) 100%, 0 100%)`
            : isLast
              ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${CHEV}px 50%)`
              : `polygon(0 0, calc(100% - ${CHEV}px) 0, 100% 50%, calc(100% - ${CHEV}px) 100%, 0 100%, ${CHEV}px 50%)`
        return (
          <div
            key={it.pct}
            title={`${it.pct}% — ${it.count} deal${it.count === 1 ? '' : 's'} · ${fmt(it.total)}`}
            style={{
              flex: 1, minWidth: 0,
              background: bg, color: fg,
              clipPath: clip,
              marginLeft: isFirst ? 0 : -CHEV,
              paddingLeft: isFirst ? 14 : CHEV + 10,
              paddingRight: isLast ? 14 : CHEV + 10,
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <span style={{ fontFamily: "'Space Grotesk'", fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
              {it.pct}%
            </span>
            <span style={{
              fontFamily: "'Space Grotesk'", fontSize: 13, fontWeight: 700,
              whiteSpace: 'nowrap',
              background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
              padding: active ? '2px 8px' : 0,
              borderRadius: 999,
            }}>
              {it.count} · {fmt(it.total)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────── Owner (salesperson) filter ─────────────── */

function OwnerFilter({
  value, owners, onChange,
}: {
  value: string
  owners: Array<{ id: string; name: string; hasDeals: boolean }>
  onChange: (id: string) => void
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
      <svg viewBox="0 0 24 24" width="14" height="14" style={{ color: '#8082A5' }}>
        <path fill="currentColor" d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-8 2-8 6v1h16v-1c0-4-4-6-8-6z" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: '1px solid #E5E7F0', background: '#fff',
          borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600,
          color: '#3B3B52', cursor: 'pointer', outline: 'none',
        }}
      >
        <option value="all">All salespeople</option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}{o.hasDeals ? '' : ' (no deals)'}
          </option>
        ))}
      </select>
    </div>
  )
}

/* ─────────────── Create-deal modal ─────────────── */

function CreateDealModal({
  columns, users, defaultOwnerId, onClose, onCreated,
}: {
  columns: PipelineColumn[]
  users: UserDto[]
  defaultOwnerId?: string
  onClose: () => void
  onCreated: (opp: OpportunityDto) => void
}) {
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [loadingCust, setLoadingCust] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const firstStage = columns.find((c) => !c.isArchived)?.name ?? columns[0]?.name ?? 'Qualification'

  const [form, setForm] = useState<CreateOpportunityDto>({
    title: '',
    customerId: '',
    ownerId: defaultOwnerId ?? '',
    stage: firstStage as OpportunityStage,
    value: 0,
    probability: 20,
    closeDate: undefined,
    bidDeadline: undefined,
    decisionDate: undefined,
    serviceOrProduct: undefined,
    competitor: undefined,
    notes: undefined,
  })

  useEffect(() => {
    api.customers()
      .then((rows) => setCustomers(rows))
      .catch(() => setCustomers([]))
      .finally(() => setLoadingCust(false))
  }, [])

  const set = <K extends keyof CreateOpportunityDto>(k: K, v: CreateOpportunityDto[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!form.title.trim()) { setErr('Title is required'); return }
    if (!form.customerId) { setErr('Pick a customer'); return }
    if (!form.ownerId) { setErr('Pick an owner (sales rep)'); return }
    setBusy(true)
    try {
      const payload: CreateOpportunityDto = {
        ...form,
        title: form.title.trim(),
        closeDate: form.closeDate || undefined,
        bidDeadline: form.bidDeadline || undefined,
        decisionDate: form.decisionDate || undefined,
        serviceOrProduct: form.serviceOrProduct || undefined,
        competitor: form.competitor?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
      }
      const created = await api.createOpportunity(payload)
      onCreated(created)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Create failed')
    } finally { setBusy(false) }
  }

  const activeUsers = users.filter((u) => u.isActive !== false)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,45,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ width: 620, maxWidth: '100%', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F2F3F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Create new deal</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: '#8082A5' }}>×</button>
        </div>

        <form onSubmit={submit} style={{ padding: 18, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormField label="Title">
            <input required autoFocus value={form.title} onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Factory Automation Phase 2" style={inputStyle} />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormField label="Customer">
              <select required value={form.customerId} onChange={(e) => set('customerId', e.target.value)} style={inputStyle} disabled={loadingCust}>
                <option value="">{loadingCust ? 'Loading…' : '— Select customer —'}</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Owner (sales rep)">
              <select required value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)} style={inputStyle}>
                <option value="">— Select owner —</option>
                {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
              </select>
            </FormField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormField label="Stage">
              <select value={form.stage ?? firstStage} onChange={(e) => set('stage', e.target.value as OpportunityStage)} style={inputStyle}>
                {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Service / Product">
              <select value={form.serviceOrProduct ?? ''} onChange={(e) => set('serviceOrProduct', e.target.value || undefined)} style={inputStyle}>
                <option value="">— No service —</option>
                {SERVICE_LINES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormField label="Amount (฿)">
              <input type="number" min={0} value={form.value ?? 0}
                onChange={(e) => set('value', Number(e.target.value))} style={inputStyle} />
            </FormField>
            <FormField label="Probability %">
              <input type="number" min={0} max={100} value={form.probability ?? 20}
                onChange={(e) => set('probability', Number(e.target.value))} style={inputStyle} />
            </FormField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <FormField label="Close date" hint="Expected close (or actual once Won/Lost)">
              <input type="date" value={form.closeDate ?? ''}
                onChange={(e) => set('closeDate', e.target.value || undefined)} style={inputStyle} />
            </FormField>
            <FormField label="Bid deadline" hint="Submission cut-off">
              <input type="date" value={form.bidDeadline ?? ''}
                onChange={(e) => set('bidDeadline', e.target.value || undefined)} style={inputStyle} />
            </FormField>
            <FormField label="Decision date" hint="Award announcement">
              <input type="date" value={form.decisionDate ?? ''}
                onChange={(e) => set('decisionDate', e.target.value || undefined)} style={inputStyle} />
            </FormField>
          </div>

          <FormField label="Competitor">
            <input value={form.competitor ?? ''} onChange={(e) => set('competitor', e.target.value)}
              placeholder="e.g. AlphaSoft ERP" style={inputStyle} />
          </FormField>

          <FormField label="Notes">
            <textarea rows={3} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)}
              placeholder="Context, decision maker, next steps…" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </FormField>

          {err && <div style={errBox}>{err}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="submit" disabled={busy} style={{ ...primaryBtn, flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? 'Creating…' : 'Create deal'}</button>
            <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#5C5C74', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10.5, color: '#8082A5', lineHeight: 1.35 }}>{hint}</span>}
    </label>
  )
}

const createBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
