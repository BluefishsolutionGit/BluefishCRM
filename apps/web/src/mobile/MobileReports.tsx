/**
 * Mobile Reports — condensed dashboard that stitches together the same data
 * a sales manager sees on the desktop /dashboards routes but sized for a
 * phone: big KPI cards, per-service sparklines, rep leaderboard, funnel.
 *
 * Everything is read-only + fed by existing endpoints. No new server code.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  ByServiceDashboardDto, ByServiceStatDto, ExecutiveDashboardDto,
  MonthlyByServiceDto, PipelineDashboardDto, SalesDashboardDto,
} from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : n >= 1_000 ? '฿' + Math.round(n / 1e3) + 'K' : '฿' + n
const SERVICE_COLOR: Record<string, string> = { Box: '#B4650A', '3S': '#2A6FDB', '3D': '#4A3AB8', 'AI&RPA': '#0E6E4E' }

const backBtn: CSSProperties = { fontSize: 14, color: '#2A6FDB', cursor: 'pointer' }
const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '14px 16px' }
const label: CSSProperties = { fontSize: 10.5, color: '#8888A0', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }
const sectionLabel: CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', color: '#8888A0', textTransform: 'uppercase', margin: '4px 0 6px' }

export default function MobileReports() {
  const [exec, setExec] = useState<ExecutiveDashboardDto | null>(null)
  const [byService, setByService] = useState<ByServiceDashboardDto | null>(null)
  const [sales, setSales] = useState<SalesDashboardDto | null>(null)
  const [pipeline, setPipeline] = useState<PipelineDashboardDto | null>(null)
  const [loading, setLoading] = useState(true)
  const toast = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      api.execDashboard().catch(() => null),
      api.byServiceDashboard().catch(() => null),
      api.salesDashboard().catch(() => null),
      api.pipelineDashboard().catch(() => null),
    ]).then(([e, b, s, p]) => {
      setExec(e); setByService(b); setSales(s); setPipeline(p); setLoading(false)
    }).catch((e) => { toast(e instanceof ApiError ? e.message : 'Failed'); setLoading(false) })
  }, [toast])

  return (
    <div style={{ padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <div onClick={() => navigate(-1)} style={backBtn}>‹ Back</div>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 800, textAlign: 'center' }}>Reports</div>
        <div style={{ width: 44 }} />
      </div>

      {loading && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}

      {/* ── KPI grid ────────────────────────────────────────────── */}
      {exec && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Kpi label="Open pipeline" value={fmt(exec.openPipeline)} accent="#2E1A6B" />
          <Kpi label="MTD closed" value={fmt(exec.revenueMTD)} accent="#0E9C7E" />
          <Kpi label="QTD" value={fmt(exec.revenueQTD)} accent="#2A6FDB" />
          <Kpi label="YTD" value={fmt(exec.revenueYTD)} accent="#5B3FC4" />
          <Kpi label="Deals won (period)" value={String(exec.dealsWonPeriod)} accent="#0E6E4E" small />
          <Kpi label="New leads (period)" value={String(exec.newLeadsPeriod)} accent="#B4650A" small />
          <Kpi label="Active contracts" value={String(exec.activeContracts)} accent="#2A6FDB" small />
          <Kpi label="Expiring" value={String(exec.expiringContracts)} accent="#D2601A" small />
        </div>
      )}

      {/* ── By-service ─────────────────────────────────────────── */}
      {byService && byService.stats.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <div style={sectionLabel}>By service · {byService.period}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {byService.stats.map((s) => (
              <ServiceRow key={s.service} stat={s} monthly={byService.monthly} />
            ))}
          </div>
        </div>
      )}

      {/* ── Pipeline funnel ─────────────────────────────────────── */}
      {pipeline && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ ...sectionLabel, flex: 1, margin: 0 }}>Pipeline funnel</div>
            <div style={{ fontSize: 11.5, color: '#5C5C74' }}>Avg cycle <b style={{ color: '#1E1E30' }}>{pipeline.avgCycleDays}d</b></div>
          </div>
          {pipeline.stages.map((s) => {
            const total = pipeline.stages.reduce((a, x) => a + x.value, 0) || 1
            const pct = (s.value / total) * 100
            return (
              <div key={s.name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{s.name}</span>
                  <span style={{ color: '#5C5C74' }}>{s.count} · {fmt(s.value)}</span>
                </div>
                <div style={{ height: 8, background: '#F1F1F5', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: STAGE_BAR[s.name] ?? '#8888A0', transition: 'width .18s' }} />
                </div>
              </div>
            )
          })}
          <div style={{ marginTop: 8, fontSize: 12, color: '#5C5C74' }}>
            Weighted <b style={{ color: '#2A6FDB' }}>{fmt(pipeline.weightedTotal)}</b>
          </div>
        </div>
      )}

      {/* ── Rep leaderboard ─────────────────────────────────────── */}
      {sales && sales.reps.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>Rep leaderboard</div>
          <div style={{ fontSize: 11.5, color: '#5C5C74', marginBottom: 8 }}>
            Total open {fmt(sales.totalOpen)} · won {fmt(sales.totalWon)} · quota {sales.quotaAttainment.toFixed(0)}%
          </div>
          {sales.reps.slice(0, 8).map((r, i) => (
            <div key={r.ownerId} style={{ padding: '7px 0', borderTop: i === 0 ? '1px solid #F1F1F5' : '1px solid #F7F8FC', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: '#EEF0FA', color: '#2A6FDB', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>#{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.ownerName}</div>
                <div style={{ fontSize: 10.5, color: '#8888A0' }}>{r.openDeals} open · {r.wonDeals} won · {r.activitiesLastWeek} activities/wk</div>
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                <div style={{ fontFamily: "'Space Grotesk'", fontSize: 12.5, fontWeight: 700 }}>{fmt(r.wonValue)}</div>
                <div style={{ fontSize: 10.5, color: '#5C5C74' }}>{fmt(r.openValue)} open</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Top deals ────────────────────────────────────────────── */}
      {exec && exec.topDeals.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>Top deals</div>
          {exec.topDeals.slice(0, 5).map((d, i) => (
            <div key={d.id} onClick={() => navigate(`/m/opportunities/${d.id}`)} style={{ padding: '8px 0', borderTop: i === 0 ? '1px solid #F1F1F5' : '1px solid #F7F8FC', display: 'flex', gap: 8, cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                <div style={{ fontSize: 10.5, color: '#8888A0' }}>{d.customerName} · {d.stage} · {d.probability}%</div>
              </div>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 12.5, fontWeight: 700, flex: 'none' }}>{fmt(d.value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────
function Kpi({ label: lbl, value, accent, small }: { label: string; value: string; accent: string; small?: boolean }) {
  return (
    <div style={{ ...card, borderLeft: `3px solid ${accent}`, padding: small ? '9px 12px' : '12px 14px' }}>
      <div style={label}>{lbl}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: small ? 16 : 20, fontWeight: 800, marginTop: 3 }}>{value}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Service row with mini sparkline
// ─────────────────────────────────────────────────────────────
function ServiceRow({ stat, monthly }: { stat: ByServiceStatDto; monthly: MonthlyByServiceDto[] }) {
  const spark = useMemo(() => monthly.map((m) => m.byService[stat.service] ?? 0), [monthly, stat.service])
  const color = SERVICE_COLOR[stat.service] ?? '#8888A0'
  const pct = Math.min(120, Math.round(stat.pctOfTarget))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ background: color + '18', color, fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999 }}>{stat.service}</span>
        <div style={{ flex: 1, fontSize: 12, color: '#5C5C74' }}>{stat.count} deals</div>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 13, fontWeight: 700 }}>{fmt(stat.won)}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, height: 6, background: '#F1F1F5', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: pct >= 100 ? '#0E9C7E' : pct >= 70 ? color : '#D2601A' }} />
        </div>
        <div style={{ fontSize: 10.5, color: pct >= 100 ? '#0E6E4E' : pct >= 70 ? '#3B3B52' : '#D2601A', fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{pct}% of target</div>
      </div>
      <Sparkline values={spark} color={color} />
    </div>
  )
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) return null
  const max = Math.max(1, ...values)
  const w = 260, h = 32, step = w / Math.max(1, values.length - 1)
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, marginTop: 6 }}>
      <polyline fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={pts} />
      {values.map((v, i) => (
        <circle key={i} cx={(i * step).toFixed(1)} cy={(h - (v / max) * (h - 4) - 2).toFixed(1)} r={v > 0 ? 1.8 : 0} fill={color} />
      ))}
    </svg>
  )
}

const STAGE_BAR: Record<string, string> = {
  Qualification: '#2A6FDB', Proposal: '#B4650A', Negotiation: '#6C55E0', Won: '#0E9C7E', Lost: '#8888A0',
}
