import { useCallback, useEffect, useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import type { ByServiceDashboardDto, ExecutiveDashboardDto, PipelineDashboardDto, RevenueDashboardDto, SalesDashboardDto, UserDto } from '@bluefish/shared'
import { SERVICE_LINES } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import './Dashboard.css'

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'

// Palette matches Pipeline.tsx / Settings.tsx so the same service reads the same colour everywhere.
const SERVICE_COLOR: Record<string, string> = { Box: '#2A6FDB', '3S': '#0E9C7E', '3D': '#B4650A', 'AI&RPA': '#6C55E0' }

/* ─────────────── Widget layout persistence ─────────────── */

// v4 = YTD target + Won-revenue-by-service paired side-by-side in the top
//      row; KPI rows stay full width below.
// v3 = YTD target promoted to first, full-width; KPI rows shrunk and moved
//      below so revenue-vs-target reads as the hero row.
// v2 = multi-column layout (columns count + per-item column assignment).
// v1 was single-column only. Load code accepts v1/v2 and upgrades silently.
const LAYOUT_KEY = 'bluefish.dashboard.layout.v4'
const LEGACY_LAYOUT_KEY = 'bluefish.dashboard.layout.v1'

type ColumnCount = 1 | 2 | 3

interface WidgetLayoutEntry { id: string; visible: boolean; column: number }
interface DashboardLayout { columns: ColumnCount; items: WidgetLayoutEntry[] }

/** Ordered by desirability in a single-column stack — order also decides round-robin
 *  distribution into multi-column layouts (item 0 → col 0, item 1 → col 1, ...). */
const DEFAULT_ITEMS: Array<Omit<WidgetLayoutEntry, 'column'>> = [
  { id: 'byServiceTarget',  visible: true },   // hero row — target ↔ revenue paired
  { id: 'byServiceRevenue', visible: true },   // sits next to target
  { id: 'kpiRow1',          visible: true },   // Open pipeline / Revenue MTD / New leads / Deals won
  { id: 'kpiRow2',          visible: true },
  { id: 'topDeals',         visible: true },
  { id: 'activityBreakdown', visible: true },
  { id: 'salesTeam',        visible: true },
  { id: 'pipelineByStage',  visible: true },
  { id: 'revenueMonthly',   visible: true },
  { id: 'byIndustry',       visible: true },
]

/** Widgets rendered in the wrapping full-width row above the column grid.
 *  Their layout on the row depends on TOP_ROW_FLEX_BASIS below — narrow
 *  cards (640px) pair up, KPI rows force their own line. */
const FULL_WIDTH_WIDGETS = new Set(['byServiceTarget', 'byServiceRevenue', 'kpiRow1', 'kpiRow2'])

/** Per-widget flex basis on the top row. Revenue-by-service is the wider
 *  card of the pair (12 monthly bars need room to breathe); target is
 *  narrower since 5 donuts / 5 rows read fine at 640. */
const TOP_ROW_FLEX_BASIS: Record<string, string> = {
  byServiceTarget: '0 1 640px',
  byServiceRevenue: '0 1 900px',
}

const DEFAULT_LAYOUT: DashboardLayout = {
  columns: 1,
  items: DEFAULT_ITEMS.map((d) => ({ ...d, column: 0 })),
}

function loadLayout(): DashboardLayout {
  try {
    // Try v2 first
    const rawV2 = localStorage.getItem(LAYOUT_KEY)
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as DashboardLayout
      if (parsed && Array.isArray(parsed.items)) return normaliseLayout(parsed)
    }
    // Fall back to v1 (flat array) and migrate
    const rawV1 = localStorage.getItem(LEGACY_LAYOUT_KEY)
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as Array<{ id: string; visible: boolean }>
      if (Array.isArray(parsed)) {
        return normaliseLayout({ columns: 1, items: parsed.map((p) => ({ ...p, column: 0 })) })
      }
    }
  } catch { /* fall through */ }
  return DEFAULT_LAYOUT
}

function saveLayout(layout: DashboardLayout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* quota */ }
}

/** Drop unknown widget ids, append any newly-shipped widgets, and clamp column
 *  assignments to the current column count. Idempotent — call whenever you touch
 *  layout state. */
function normaliseLayout(input: DashboardLayout): DashboardLayout {
  const columns = ([1, 2, 3] as ColumnCount[]).includes(input.columns) ? input.columns : 1
  const known = new Set(DEFAULT_ITEMS.map((d) => d.id))
  const seen = new Set<string>()
  const valid: WidgetLayoutEntry[] = input.items
    .filter((it) => known.has(it.id) && !seen.has(it.id))
    .map((it) => {
      seen.add(it.id)
      return { id: it.id, visible: Boolean(it.visible), column: Math.min(Math.max(0, it.column | 0), columns - 1) }
    })
  // Append any newly-shipped widgets round-robin into columns.
  DEFAULT_ITEMS.forEach((d, i) => {
    if (!seen.has(d.id)) valid.push({ ...d, column: i % columns })
  })
  return { columns, items: valid }
}

/** Redistribute items when the user changes column count. Full-width widgets keep
 *  their column (they render outside the grid anyway); everything else gets an
 *  even round-robin fill so switching 1→2→3 always yields a sensibly-populated
 *  grid rather than leaving the extra columns empty. */
function reshapeColumns(layout: DashboardLayout, columns: ColumnCount): DashboardLayout {
  if (layout.columns === columns) return layout
  let colIdx = 0
  const items = layout.items.map((it) => {
    if (FULL_WIDTH_WIDGETS.has(it.id)) return { ...it, column: 0 }
    const next = { ...it, column: colIdx % columns }
    colIdx++
    return next
  })
  return normaliseLayout({ columns, items })
}

/* ─────────────── Main component ─────────────── */

export default function Dashboard() {
  const [exec, setExec] = useState<ExecutiveDashboardDto | null>(null)
  const [sales, setSales] = useState<SalesDashboardDto | null>(null)
  const [pipeline, setPipeline] = useState<PipelineDashboardDto | null>(null)
  const [revenue, setRevenue] = useState<RevenueDashboardDto | null>(null)
  const [byService, setByService] = useState<ByServiceDashboardDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [layout, setLayout] = useState<DashboardLayout>(() => loadLayout())
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<number | null>(null)
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [users, setUsers] = useState<UserDto[]>([])
  const toast = useToast()

  useEffect(() => { saveLayout(layout) }, [layout])
  useEffect(() => {
    api.users().then(setUsers).catch(() => setUsers([]))
  }, [])

  const load = useCallback(() => {
    const filter = { serviceOrProduct: serviceFilter, ownerId: ownerFilter }
    Promise.all([
      api.execDashboard(filter), api.salesDashboard(filter), api.pipelineDashboard(filter),
      api.revenueDashboard(filter), api.byServiceDashboard(undefined, filter),
    ])
      .then(([e, s, p, r, b]) => { setExec(e); setSales(s); setPipeline(p); setRevenue(r); setByService(b) })
      .catch((e) => toast(e instanceof ApiError ? e.message : 'Failed'))
      .finally(() => setLoading(false))
  }, [serviceFilter, ownerFilter, toast])

  useEffect(() => { load() }, [load])

  const filterActive = serviceFilter !== 'all' || ownerFilter !== 'all'

  const maxMonthly = useMemo(() => Math.max(1, ...(revenue?.monthly ?? []).map((m) => m.won)), [revenue])
  const maxRep = useMemo(() => Math.max(1, ...(sales?.reps ?? []).map((r) => r.wonValue + r.openValue)), [sales])

  if (loading) return <div style={{ padding: 32, color: '#8888A0' }}>Loading dashboards…</div>
  if (!exec || !sales || !pipeline || !revenue || !byService) return <div style={{ padding: 32, color: '#C0392B' }}>Failed to load</div>

  // Registry of every widget the dashboard can render — id must match layout entries.
  const widgets: Record<string, { title: string; render: () => ReactNode }> = {
    kpiRow1: {
      title: 'Top KPIs',
      render: () => (
        <div className="dash-kpi-row">
          <KpiCard label="Open pipeline" value={fmt(exec.openPipeline)} grad="linear-gradient(135deg,#3BB0F5,#1E63E9)" />
          <KpiCard label="Revenue MTD" value={fmt(exec.revenueMTD)} sub={`QTD ${fmt(exec.revenueQTD)}`} grad="linear-gradient(135deg,#2E6BE6,#1B2F8F)" />
          <KpiCard label="New leads (7d)" value={String(exec.newLeadsPeriod)} sub={`Conversion ${exec.leadConversionRate}%`} grad="linear-gradient(135deg,#FFB047,#F5641E)" />
          <KpiCard label="Deals won (MTD)" value={String(exec.dealsWonPeriod)} sub={`Avg ${fmt(exec.avgDealSize)}`} grad="linear-gradient(135deg,#22C9B4,#0E9C7E)" />
        </div>
      ),
    },
    kpiRow2: {
      title: 'Contracts & Ops',
      render: () => (
        <div className="dash-kpi-row">
          <KpiCard label="Active contracts" value={String(exec.activeContracts)} grad="linear-gradient(135deg,#5B93E6,#2A6FDB)" />
          <KpiCard label="Expiring ≤ 60d" value={String(exec.expiringContracts)} grad="linear-gradient(135deg,#FFB047,#B4650A)" />
          <KpiCard label="Pending approvals" value={String(exec.pendingApprovals)} grad="linear-gradient(135deg,#8A5CF6,#5B2C9E)" />
          <KpiCard label="AI spend (all time)" value={`$${exec.aiSpendUsd.toFixed(4)}`} grad="linear-gradient(135deg,#6C55E0,#4A3AB8)" />
        </div>
      ),
    },
    byServiceTarget: {
      title: `Target attainment by service — ${byService.period}`,
      render: () => <ByServiceTargets stats={byService.stats} />,
    },
    byServiceRevenue: {
      title: `Won revenue by service — ${byService.period}`,
      render: () => <ByServiceBars period={byService.period} monthly={byService.monthly} />,
    },
    topDeals: {
      title: 'Top open deals (weighted)',
      render: () => (
        <div style={card}>
          <div style={cardTitle}>Top open deals (weighted)</div>
          {exec.topDeals.map((d) => (
            <div key={d.id} style={{ display: 'flex', gap: 12, padding: '12px 18px', borderTop: '1px solid #F2F3F9', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{d.title}</div>
                <div style={{ fontSize: 11.5, color: '#5C5C74' }}>{d.customerName} · {d.stage}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: "'Space Grotesk'", fontSize: 14, fontWeight: 700 }}>{fmt(d.value)}</div>
                <div style={{ fontSize: 11, color: '#5C5C74' }}>{d.probability}% prob</div>
              </div>
            </div>
          ))}
          {exec.topDeals.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No open deals</div>}
        </div>
      ),
    },
    activityBreakdown: {
      title: 'Activity breakdown',
      render: () => (
        <div style={card}>
          <div style={cardTitle}>Activity breakdown</div>
          <div style={{ padding: '10px 18px 14px' }}>
            {exec.activityBreakdown.map((a) => (
              <div key={a.type} style={{ display: 'flex', gap: 10, padding: '6px 0', fontSize: 12.5 }}>
                <div style={{ flex: 1, textTransform: 'capitalize' }}>{a.type.replace('_', ' ')}</div>
                <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700 }}>{a.count}</div>
              </div>
            ))}
            {exec.activityBreakdown.length === 0 && <div style={{ color: '#8888A0', fontSize: 13 }}>No activities</div>}
          </div>
        </div>
      ),
    },
    salesTeam: {
      title: `Sales team performance · quota attainment ${sales.quotaAttainment}%`,
      render: () => (
        <div style={card}>
          <div style={cardTitle}>Sales team performance · quota attainment {sales.quotaAttainment}%</div>
          <div style={{ padding: '10px 18px 14px' }}>
            {sales.reps.map((r) => (
              <div key={r.ownerId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid #F2F3F9', fontSize: 12.5 }}>
                <div style={{ width: 120, fontWeight: 600 }}>{r.ownerName}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', height: 18, borderRadius: 6, background: '#F2F3F9', overflow: 'hidden' }}>
                    <div style={{ width: `${(r.wonValue / maxRep) * 100}%`, background: '#0E9C7E' }} title={`Won ${fmt(r.wonValue)}`} />
                    <div style={{ width: `${(r.openValue / maxRep) * 100}%`, background: '#2A6FDB' }} title={`Open ${fmt(r.openValue)}`} />
                  </div>
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", width: 80, textAlign: 'right' }}>{fmt(r.wonValue)}</div>
                <div style={{ width: 65, textAlign: 'right', color: '#8888A0' }}>{r.activitiesLastWeek} acts</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    pipelineByStage: {
      title: 'Pipeline by stage',
      render: () => (
        <div style={card}>
          <div style={cardTitle}>Pipeline by stage</div>
          <div style={{ padding: '10px 18px 14px' }}>
            {pipeline.stages.map((s) => (
              <div key={s.name} style={{ display: 'flex', gap: 10, padding: '6px 0', fontSize: 12.5, alignItems: 'center' }}>
                <div style={{ flex: 1, fontWeight: 600 }}>{s.name}</div>
                <div style={{ color: '#8888A0' }}>{s.count}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", width: 80, textAlign: 'right' }}>{fmt(s.value)}</div>
              </div>
            ))}
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #F2F3F9', fontSize: 12, color: '#5C5C74' }}>
              Weighted total: <b style={{ color: '#1E1E30', fontFamily: "'Space Grotesk'" }}>{fmt(pipeline.weightedTotal)}</b> · Avg cycle {pipeline.avgCycleDays} days
            </div>
            {pipeline.idleDeals.length > 0 && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#FEEFE6', borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#B4650A', marginBottom: 4 }}>{pipeline.idleDeals.length} idle deals ≥ 7 days</div>
                {pipeline.idleDeals.slice(0, 3).map((d) => (
                  <div key={d.id} style={{ fontSize: 11.5, color: '#5C5C74' }}>{d.title} — {d.daysIdle}d</div>
                ))}
              </div>
            )}
          </div>
        </div>
      ),
    },
    revenueMonthly: {
      title: 'Revenue (last 12 months)',
      render: () => (
        <div style={card}>
          <div style={cardTitle}>Revenue (last 12 months)</div>
          <div style={{ padding: '20px 22px 14px', display: 'flex', alignItems: 'flex-end', gap: 8, height: 240 }}>
            {revenue.monthly.map((m) => {
              const h = maxMonthly > 0 ? Math.max(3, (m.won / maxMonthly) * 170) : 3
              // "2026-09" → Sep so months read at a glance instead of digits.
              const monthShort = new Date(`${m.month}-01`).toLocaleString('en-GB', { month: 'short' })
              return (
                <div key={m.month} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: m.won > 0 ? '#3B3B52' : '#B4B4C4', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {m.won > 0 ? fmt(m.won) : '—'}
                  </div>
                  <div style={{ width: '100%', height: 170, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{ width: 26, height: h, background: '#2A6FDB', borderRadius: '4px 4px 2px 2px' }} title={`${monthShort} ${fmt(m.won)}`} />
                  </div>
                  <div style={{ fontSize: 11, color: '#5C5C74', fontWeight: 600 }}>{monthShort}</div>
                </div>
              )
            })}
          </div>
        </div>
      ),
    },
    byIndustry: {
      title: 'Won by industry',
      render: () => (
        <div style={card}>
          <div style={cardTitle}>Won by industry</div>
          <div style={{ padding: '10px 18px 14px' }}>
            {revenue.byIndustry.map((i) => (
              <div key={i.industry} style={{ display: 'flex', gap: 10, padding: '6px 0', fontSize: 12.5 }}>
                <div style={{ flex: 1 }}>{i.industry}</div>
                <div style={{ color: '#8888A0' }}>{i.count}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", width: 80, textAlign: 'right' }}>{fmt(i.won)}</div>
              </div>
            ))}
            {revenue.byIndustry.length === 0 && <div style={{ color: '#8888A0', fontSize: 13 }}>No wins yet</div>}
          </div>
        </div>
      ),
    },
  }

  const toggleVisible = (id: string) => setLayout((cur) => ({
    ...cur,
    items: cur.items.map((e) => e.id === id ? { ...e, visible: !e.visible } : e),
  }))
  const resetLayout = () => setLayout(DEFAULT_LAYOUT)
  const setColumnCount = (n: ColumnCount) => setLayout((cur) => reshapeColumns(cur, n))

  const onDragStart = (id: string) => (e: DragEvent<HTMLDivElement>) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOverItem = (id: string, column: number) => (e: DragEvent<HTMLDivElement>) => {
    if (!dragId || dragId === id) return
    e.preventDefault()
    setDragOverId(id); setDragOverColumn(column)
  }
  /** Drop onto another widget → insert dragged item right before it (same column
   *  as target). Preserves order across the whole flat list to keep drag+visibility
   *  logic simple. */
  const onDropOnItem = (targetId: string) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOverId(null); setDragOverColumn(null)
    if (!dragId || dragId === targetId) return
    setLayout((cur) => {
      const from = cur.items.findIndex((x) => x.id === dragId)
      const to = cur.items.findIndex((x) => x.id === targetId)
      if (from < 0 || to < 0) return cur
      const targetColumn = cur.items[to].column
      const next = [...cur.items]
      const [moved] = next.splice(from, 1)
      // After splice `to` may have shifted by one if from < to.
      const insertAt = from < to ? to - 1 : to
      next.splice(insertAt, 0, { ...moved, column: targetColumn })
      return { ...cur, items: next }
    })
    setDragId(null)
  }
  /** Drop onto an empty column → append to that column at the end. */
  const onDropOnColumn = (column: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOverId(null); setDragOverColumn(null)
    if (!dragId) return
    setLayout((cur) => {
      const from = cur.items.findIndex((x) => x.id === dragId)
      if (from < 0) return cur
      const next = [...cur.items]
      const [moved] = next.splice(from, 1)
      moved.column = column
      // Append at the end — visually goes to the bottom of that column.
      next.push(moved)
      return { ...cur, items: next }
    })
    setDragId(null)
  }

  const visibleCount = layout.items.filter((l) => l.visible).length

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 600, letterSpacing: '-.01em' }}>
            Executive dashboard
            {filterActive && (
              <span style={{ marginLeft: 10, fontSize: 12, background: '#EEF3FC', color: '#2A6FDB', border: '1px solid #B7CFF3', borderRadius: 999, padding: '2px 10px', fontWeight: 700, verticalAlign: 'middle' }}>
                Filtered
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#5C5C74', marginTop: 3 }}>
            Live from CRM · {new Date(exec.asOf).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {filterActive && (
              <>
                {' · '}
                <span style={{ color: '#2A6FDB' }}>
                  {serviceFilter !== 'all' ? serviceFilter : 'All services'} · {ownerFilter === 'all' ? 'All salespeople' : (users.find((u) => u.id === ownerFilter)?.name ?? '—')}
                </span>{' '}
                <button type="button" onClick={() => { setServiceFilter('all'); setOwnerFilter('all') }} style={clearBtn}>Clear</button>
              </>
            )}
          </div>
        </div>
        <button type="button" onClick={() => setEditMode((v) => !v)}
          style={{
            background: editMode ? '#2A6FDB' : '#fff', color: editMode ? '#fff' : '#3B3B52',
            border: `1px solid ${editMode ? '#2A6FDB' : '#E5E7F0'}`, borderRadius: 9,
            padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          }}>
          {editMode ? 'Done editing' : '⚙ Edit dashboard'}
        </button>
      </div>

      <FilterRow
        service={serviceFilter} onService={setServiceFilter}
        owner={ownerFilter} onOwner={setOwnerFilter}
        users={users}
      />

      {editMode && (
        <EditPanel
          layout={layout} widgets={widgets}
          onToggle={toggleVisible} onReset={resetLayout} onColumns={setColumnCount}
        />
      )}

      {/* Top row above the column grid. Wraps horizontally so narrow paired
          cards (target + revenue) can sit side-by-side; wide widgets (KPI
          rows) force their own line via `flex: 1 1 100%`. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start', marginBottom: layout.columns > 1 ? 14 : 0 }}>
        {layout.items
          .filter((it) => it.visible && FULL_WIDTH_WIDGETS.has(it.id) && widgets[it.id])
          .map((it) => (
            <div key={it.id} style={{ flex: TOP_ROW_FLEX_BASIS[it.id] ?? '1 1 100%', minWidth: 0 }}>
              {renderWidget(it)}
            </div>
          ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
        gap: 14,
        alignItems: 'start',
      }}>
        {Array.from({ length: layout.columns }).map((_, col) => {
          const columnItems = layout.items.filter((it) => it.visible && it.column === col && !FULL_WIDTH_WIDGETS.has(it.id) && widgets[it.id])
          const isDropTarget = dragOverColumn === col && dragOverId === null
          return (
            <div
              key={col}
              onDragOver={editMode ? (e) => { if (dragId) { e.preventDefault(); setDragOverColumn(col); setDragOverId(null) } } : undefined}
              onDrop={editMode ? onDropOnColumn(col) : undefined}
              style={{
                display: 'flex', flexDirection: 'column', gap: 14,
                minHeight: editMode ? 200 : undefined,
                background: editMode ? 'rgba(244, 241, 253, 0.4)' : 'transparent',
                border: editMode ? `1px dashed ${isDropTarget ? '#2A6FDB' : '#C9CDE0'}` : 'none',
                borderRadius: 12, padding: editMode ? 10 : 0,
              }}
            >
              {editMode && (
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8082A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Column {col + 1}
                </div>
              )}
              {columnItems.map((it) => renderWidget(it))}
              {editMode && columnItems.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: '#8082A5', fontSize: 11.5, border: '1px dashed #C9CDE0', borderRadius: 10 }}>
                  Drop a widget here
                </div>
              )}
            </div>
          )
        })}
      </div>

      {visibleCount === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#8888A0', fontSize: 13, background: '#F7F8FC', borderRadius: 14 }}>
          All widgets hidden. Click <b>⚙ Edit dashboard</b> to re-enable.
        </div>
      )}
    </div>
  )

  /** Renders one widget wrapper — used by both the full-width row and the column grid. */
  function renderWidget(entry: WidgetLayoutEntry): ReactNode {
    const widget = widgets[entry.id]
    if (!widget) return null
    const dragging = dragId === entry.id
    const dragTarget = dragOverId === entry.id
    return (
      <div
        key={entry.id}
        draggable={editMode}
        onDragStart={editMode ? onDragStart(entry.id) : undefined}
        onDragOver={editMode ? onDragOverItem(entry.id, entry.column) : undefined}
        onDragLeave={editMode ? () => setDragOverId(null) : undefined}
        onDrop={editMode ? onDropOnItem(entry.id) : undefined}
        onDragEnd={() => { setDragId(null); setDragOverId(null); setDragOverColumn(null) }}
        style={{
          position: 'relative',
          outline: dragTarget ? '2px dashed #2A6FDB' : editMode ? '1px dashed #C9CDE0' : 'none',
          outlineOffset: editMode ? 4 : 0,
          opacity: dragging ? 0.5 : 1,
          cursor: editMode ? 'grab' : 'default',
          borderRadius: 14,
        }}
      >
        {editMode && (
          <div style={{ position: 'absolute', top: -10, left: 10, zIndex: 5, background: '#2E1A6B', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⋮⋮ {widget.title}</span>
            <button type="button" onClick={() => toggleVisible(entry.id)}
              title="Hide this widget"
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
          </div>
        )}
        {widget.render()}
      </div>
    )
  }
}

/* ─────────────── Edit panel ─────────────── */

function EditPanel({
  layout, widgets, onToggle, onReset, onColumns,
}: {
  layout: DashboardLayout
  widgets: Record<string, { title: string; render: () => ReactNode }>
  onToggle: (id: string) => void
  onReset: () => void
  onColumns: (n: ColumnCount) => void
}) {
  return (
    <div style={{ background: '#F4F1FD', border: '1px solid #C9B8FA', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ fontSize: 12.5, color: '#4A3AB8', fontWeight: 700, marginRight: 4 }}>Edit mode</div>
      <div style={{ fontSize: 11.5, color: '#5C5C74', lineHeight: 1.5, flex: 1, minWidth: 200 }}>
        Drag widgets by their grip · drop into a different column to move · click ✕ or the checkbox below to hide.
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11.5, color: '#5C5C74', fontWeight: 600 }}>Columns</span>
        <div style={{ display: 'inline-flex', background: '#fff', border: '1px solid #E5E7F0', borderRadius: 8, padding: 2 }}>
          {([1, 2, 3] as ColumnCount[]).map((n) => (
            <button key={n} type="button" onClick={() => onColumns(n)}
              style={{
                background: layout.columns === n ? '#2E1A6B' : 'transparent',
                color: layout.columns === n ? '#fff' : '#5C5C74',
                border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11.5,
                fontWeight: 700, cursor: 'pointer',
              }}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <button type="button" onClick={onReset}
        style={{ background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 8, padding: '5px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
        Reset to defaults
      </button>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexBasis: '100%' }}>
        {layout.items.map((e) => {
          const w = widgets[e.id]
          if (!w) return null
          return (
            <label key={e.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff', border: '1px solid #E5E7F0', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={e.visible} onChange={() => onToggle(e.id)} />
              {w.title}
            </label>
          )
        })}
      </div>
    </div>
  )
}

/* ─────────────── By-service charts ─────────────── */

function ByServiceBars({ period, monthly }: { period: string; monthly: ByServiceDashboardDto['monthly'] }) {
  // Global max across all service bars in every month — one shared y-scale keeps
  // months visually comparable to each other (a huge outlier month doesn't dwarf the rest).
  const max = Math.max(
    1,
    ...monthly.flatMap((m) => SERVICE_LINES.map((s) => m.byService[s] ?? 0)),
  )
  const chartHeight = 240
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return (
    <div style={{ ...card, maxWidth: 900 }}>
      <div style={cardTitle}>Won revenue by service — {period} (monthly)</div>
      <div style={{ padding: '20px 20px 10px' }}>
        {/* Card is wider now (900) so bars can breathe — 10px each, gap 2.
            4 services × 10 + 3 * 2 gap = 46px bar cluster; 12 months × 60px
            column ≈ 720px + inner gaps, fits ~860px content area. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: chartHeight }}>
          {monthly.map((m, i) => {
            const monthTotal = SERVICE_LINES.reduce((a, s) => a + (m.byService[s] ?? 0), 0)
            return (
              <div key={m.month} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', height: chartHeight - 32, gap: 2 }}>
                  {SERVICE_LINES.map((service) => {
                    const value = m.byService[service] ?? 0
                    const h = value > 0 ? Math.max(3, (value / max) * (chartHeight - 50)) : 0
                    const color = SERVICE_COLOR[service] ?? '#5C5C74'
                    return (
                      <div key={service}
                        title={`${monthNames[i]} · ${service}: ${fmt(value)}`}
                        style={{
                          width: 10, height: h,
                          background: value > 0 ? color : 'transparent',
                          borderRadius: '3px 3px 0 0',
                        }} />
                    )
                  })}
                </div>
                <div style={{ fontSize: 11, color: '#8082A5', fontFamily: "'IBM Plex Mono', monospace" }}>{monthNames[i]}</div>
                <div style={{ fontSize: 10, color: monthTotal > 0 ? '#3B3B52' : '#B4B4C4', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {monthTotal > 0 ? fmt(monthTotal) : '—'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ padding: '4px 22px 14px', fontSize: 10.5, color: '#8082A5', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {SERVICE_LINES.map((s) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: SERVICE_COLOR[s] ?? '#5C5C74' }} />
            <span style={{ color: '#3B3B52', fontWeight: 600 }}>{s}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

type TargetChartKind = 'bar' | 'donut'
const CHART_KIND_KEY = 'bluefish.dashboard.ytdTarget.chart'

/**
 * Primary YTD target view — Overall + per-service progress against target.
 * User can flip between:
 *   - "bar"    → horizontal bars with revenue filling the target track
 *   - "donut"  → donut per service with % centered (the previous look)
 * Selection persists in localStorage.
 *
 * Card is capped at ~50% width so it reads as a hero panel next to (not
 * across) the rest of the layout — user asked for this size on 2026-09-03.
 */
function ByServiceTargets({ stats }: { stats: ByServiceDashboardDto['stats'] }) {
  const overallWon = stats.reduce((s, r) => s + r.won, 0)
  const overallTarget = stats.reduce((s, r) => s + r.target, 0)
  const overallPct = overallTarget > 0 ? Math.round((overallWon / overallTarget) * 100) : 0

  const [kind, setKind] = useState<TargetChartKind>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(CHART_KIND_KEY) : null
    return saved === 'donut' ? 'donut' : 'bar'
  })
  const pickKind = (next: TargetChartKind) => {
    setKind(next)
    try { localStorage.setItem(CHART_KIND_KEY, next) } catch { /* quota */ }
  }

  return (
    <div style={{ ...card, maxWidth: 640 }}>
      <div style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>YTD target · revenue vs target</div>
        <div style={{ display: 'inline-flex', border: '1px solid #E5E7F0', borderRadius: 8, padding: 2, background: '#F7F8FC' }}>
          {(['bar', 'donut'] as const).map((k) => {
            const on = kind === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => pickKind(k)}
                style={{
                  background: on ? '#fff' : 'transparent',
                  color: on ? '#2A6FDB' : '#5C5C74',
                  border: 'none', borderRadius: 6, padding: '4px 12px',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  boxShadow: on ? '0 1px 3px rgba(30,20,80,.12)' : 'none',
                  textTransform: 'capitalize',
                }}
              >{k}</button>
            )
          })}
        </div>
      </div>
      {kind === 'bar' ? (
        <div style={{ padding: '16px 22px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TargetBar
            label="Overall"
            color="#1E1E30"
            won={overallWon}
            target={overallTarget}
            pct={overallPct}
            primary
          />
          <div style={{ height: 1, background: '#F2F3F9' }} />
          {stats.map((s) => (
            <TargetBar
              key={s.service}
              label={s.service}
              color={SERVICE_COLOR[s.service] ?? '#5C5C74'}
              won={s.won}
              target={s.target}
              pct={s.pctOfTarget}
            />
          ))}
        </div>
      ) : (
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch' }}>
          {/* Overall donut in its own row, drawn larger so it reads as the
              "hero" number. Services follow below in a 4-across strip. */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Donut
              size={140}
              label="Overall"
              color="#1E1E30"
              won={overallWon}
              target={overallTarget}
              pct={overallPct}
            />
          </div>
          <div style={{ height: 1, background: '#F2F3F9' }} />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 8 }}>
            {stats.map((s) => (
              <Donut
                key={s.service}
                size={96}
                label={s.service}
                color={SERVICE_COLOR[s.service] ?? '#5C5C74'}
                won={s.won}
                target={s.target}
                pct={s.pctOfTarget}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Donut({ label, color, won, target, pct, size }: {
  label: string
  color: string
  won: number
  target: number
  pct: number
  size: number
}) {
  const stroke = size >= 130 ? 14 : 11
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const frac = target > 0 ? Math.min(1, won / target) : 0
  const dash = c * frac
  const gap = c - dash
  const noTarget = target === 0
  // Font sizes scale a little with the donut so the number sits well inside.
  const bigFont = size >= 130 ? 28 : 17
  const subFont = size >= 130 ? 11 : 9
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEF0F7" strokeWidth={stroke} />
          {!noTarget && (
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={pct >= 100 ? '#0E9C7E' : color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${dash} ${gap}`}
            />
          )}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {noTarget ? (
            <>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: bigFont - 4, fontWeight: 700, color: '#8082A5' }}>—</div>
              <div style={{ fontSize: subFont, color: '#8082A5', marginTop: 2 }}>no target</div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: bigFont, fontWeight: 700, color: pct >= 100 ? '#0E6E4E' : color }}>
                {pct}%
              </div>
              <div style={{ fontSize: subFont, color: '#5C5C74', marginTop: 2 }}>of target</div>
            </>
          )}
        </div>
      </div>
      <div style={{ fontSize: size >= 130 ? 13.5 : 11.5, fontWeight: 800, color }}>{label}</div>
      <div style={{ fontSize: size >= 130 ? 11 : 9.5, color: '#5C5C74', fontFamily: "'IBM Plex Mono', monospace" }}>
        {fmt(won)}{target > 0 ? ` / ${fmt(target)}` : ''}
      </div>
    </div>
  )
}

/** One row = label + [ track [fill = won] ] + numbers. Full width. */
function TargetBar({ label, color, won, target, pct, primary }: {
  label: string
  color: string
  won: number
  target: number
  pct: number
  primary?: boolean
}) {
  const noTarget = target === 0
  const fillPct = Math.min(100, Math.max(0, pct))
  // Green when hitting/exceeding target, service colour otherwise — matches
  // the tone the mobile Home target rows and the pipeline gauge use.
  const fillColor = noTarget ? '#D0D0DF' : pct >= 100 ? '#0E9C7E' : color
  const barHeight = primary ? 24 : 18
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 200px', gap: 14, alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flex: 'none' }} />
        <div style={{ fontSize: primary ? 13.5 : 12.5, fontWeight: primary ? 800 : 700, color: '#1E1E30' }}>{label}</div>
      </div>
      <div style={{
        position: 'relative',
        height: barHeight, borderRadius: 6, overflow: 'hidden',
        background: '#F2F3F9', border: '1px solid #E5E7F0',
      }}>
        {!noTarget && (
          <div style={{
            width: `${fillPct}%`, height: '100%', background: fillColor,
            transition: 'width .4s ease',
          }} />
        )}
        {/* Percent label centered on the bar — flips to inside/outside
            depending on how far the fill has traveled. */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          paddingLeft: 10, fontSize: primary ? 12 : 11, fontWeight: 800,
          color: fillPct >= 55 ? '#fff' : '#3B3B52',
          textShadow: fillPct >= 55 ? '0 1px 1px rgba(0,0,0,.15)' : 'none',
          pointerEvents: 'none',
        }}>
          {noTarget ? 'No target set' : `${pct}%`}
        </div>
      </div>
      <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: primary ? 13 : 12, color: '#3B3B52' }}>
        <b style={{ color: fillColor === '#0E9C7E' ? '#0E6E4E' : '#1E1E30' }}>{fmt(won)}</b>
        {!noTarget && <span style={{ color: '#8888A0' }}> / {fmt(target)}</span>}
      </div>
    </div>
  )
}

/* ─────────────── Shared bits ─────────────── */

function KpiCard({ label, value, sub, grad }: { label: string; value: string; sub?: string; grad: string }) {
  // Shrunk from padding 17/19 + value 32 to 12/15 + value 22 so the KPI row
  // reads as a secondary strip — the YTD target row above is now the hero.
  return (
    <div style={{ position: 'relative', borderRadius: 12, padding: '12px 15px', background: grad, color: '#fff', overflow: 'hidden' }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.96 }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'hidden' }
const cardTitle: CSSProperties = { padding: '14px 18px', borderBottom: '1px solid #F2F3F9', fontSize: 13, fontWeight: 700 }
const clearBtn: CSSProperties = { background: 'transparent', border: 'none', color: '#2A6FDB', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }

/** Shared filter bar for the executive dashboard — mirrors the chip + dropdown
 *  pattern used on the Pipeline page so filters read the same across the app. */
function FilterRow({
  service, onService, owner, onOwner, users,
}: {
  service: string
  onService: (v: string) => void
  owner: string
  onOwner: (v: string) => void
  users: UserDto[]
}) {
  const chips: Array<{ id: string; label: string; color: string }> = [
    { id: 'all', label: 'All services', color: '#5C5C74' },
    ...SERVICE_LINES.map((s) => ({ id: s, label: s, color: SERVICE_COLOR[s] ?? '#5C5C74' })),
  ]
  const salesUsers = users.filter((u) => u.role === 'sales_rep' || u.role === 'sales_manager')
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {chips.map((c) => {
          const active = service === c.id
          return (
            <div
              key={c.id}
              onClick={() => onService(c.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: active ? c.color : hexToRgbaLocal(c.color, 0.09),
                color: active ? '#fff' : c.color,
                border: `1px solid ${active ? c.color : hexToRgbaLocal(c.color, 0.35)}`,
                borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', transition: 'background 120ms',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#fff' : c.color }} />
              {c.label}
            </div>
          )
        })}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <svg viewBox="0 0 24 24" width="14" height="14" style={{ color: '#8082A5' }}>
          <path fill="currentColor" d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-8 2-8 6v1h16v-1c0-4-4-6-8-6z" />
        </svg>
        <select
          value={owner}
          onChange={(e) => onOwner(e.target.value)}
          style={{
            border: '1px solid #E5E7F0', background: '#fff',
            borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600,
            color: '#3B3B52', cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="all">All salespeople</option>
          {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
    </div>
  )
}

/** Local hex→rgba — the Pipeline page has its own, but importing across pages
 *  couples two big files unnecessarily. */
function hexToRgbaLocal(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
