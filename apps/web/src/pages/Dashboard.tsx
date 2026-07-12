import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { ExecutiveDashboardDto, PipelineDashboardDto, RevenueDashboardDto, SalesDashboardDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'

export default function Dashboard() {
  const [exec, setExec] = useState<ExecutiveDashboardDto | null>(null)
  const [sales, setSales] = useState<SalesDashboardDto | null>(null)
  const [pipeline, setPipeline] = useState<PipelineDashboardDto | null>(null)
  const [revenue, setRevenue] = useState<RevenueDashboardDto | null>(null)
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    Promise.all([api.execDashboard(), api.salesDashboard(), api.pipelineDashboard(), api.revenueDashboard()])
      .then(([e, s, p, r]) => { setExec(e); setSales(s); setPipeline(p); setRevenue(r) })
      .catch((e) => toast(e instanceof ApiError ? e.message : 'Failed'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const maxMonthly = useMemo(() => Math.max(1, ...(revenue?.monthly ?? []).map((m) => m.won)), [revenue])
  const maxRep = useMemo(() => Math.max(1, ...(sales?.reps ?? []).map((r) => r.wonValue + r.openValue)), [sales])

  if (loading) return <div style={{ padding: 32, color: '#8888A0' }}>Loading dashboards…</div>
  if (!exec || !sales || !pipeline || !revenue) return <div style={{ padding: 32, color: '#C0392B' }}>Failed to load</div>

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 600, letterSpacing: '-.01em' }}>Executive dashboard</div>
          <div style={{ fontSize: 13, color: '#5C5C74', marginTop: 3 }}>Live from CRM · {new Date(exec.asOf).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 14 }}>
        <KpiCard label="Open pipeline" value={fmt(exec.openPipeline)} grad="linear-gradient(135deg,#3BB0F5,#1E63E9)" />
        <KpiCard label="Revenue MTD" value={fmt(exec.revenueMTD)} sub={`QTD ${fmt(exec.revenueQTD)}`} grad="linear-gradient(135deg,#2E6BE6,#1B2F8F)" />
        <KpiCard label="New leads (7d)" value={String(exec.newLeadsPeriod)} sub={`Conversion ${exec.leadConversionRate}%`} grad="linear-gradient(135deg,#FFB047,#F5641E)" />
        <KpiCard label="Deals won (MTD)" value={String(exec.dealsWonPeriod)} sub={`Avg ${fmt(exec.avgDealSize)}`} grad="linear-gradient(135deg,#22C9B4,#0E9C7E)" />
      </div>

      {/* Second row: contract + AI cost */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 14 }}>
        <KpiCard label="Active contracts" value={String(exec.activeContracts)} grad="linear-gradient(135deg,#5B93E6,#2A6FDB)" />
        <KpiCard label="Expiring ≤ 60d" value={String(exec.expiringContracts)} grad="linear-gradient(135deg,#FFB047,#B4650A)" />
        <KpiCard label="Pending approvals" value={String(exec.pendingApprovals)} grad="linear-gradient(135deg,#8A5CF6,#5B2C9E)" />
        <KpiCard label="AI spend (all time)" value={`$${exec.aiSpendUsd.toFixed(4)}`} grad="linear-gradient(135deg,#6C55E0,#4A3AB8)" />
      </div>

      {/* Top deals + activity breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, marginBottom: 14 }}>
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
      </div>

      {/* Sales team + pipeline stages */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
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
      </div>

      {/* Revenue by month + by industry */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <div style={card}>
          <div style={cardTitle}>Revenue (last 12 months)</div>
          <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-end', gap: 6, height: 180 }}>
            {revenue.monthly.map((m) => {
              const h = maxMonthly > 0 ? Math.max(3, (m.won / maxMonthly) * 140) : 3
              return (
                <div key={m.month} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ width: '100%', height: 140, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{ width: 22, height: h, background: '#2A6FDB', borderRadius: '4px 4px 2px 2px' }} title={`${m.month} ${fmt(m.won)}`} />
                  </div>
                  <div style={{ fontSize: 9.5, color: '#8888A0', marginTop: 4 }}>{m.month.slice(5)}</div>
                </div>
              )
            })}
          </div>
        </div>

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
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, grad }: { label: string; value: string; sub?: string; grad: string }) {
  return (
    <div style={{ position: 'relative', borderRadius: 14, padding: '17px 19px', background: grad, color: '#fff', overflow: 'hidden' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, opacity: 0.96 }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 32, fontWeight: 700, marginTop: 10, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'hidden' }
const cardTitle: CSSProperties = { padding: '14px 18px', borderBottom: '1px solid #F2F3F9', fontSize: 13, fontWeight: 700 }
