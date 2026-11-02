import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type {
  CompetitorContractDto, CompetitorContractStatus, CompetitorDto,
  ContractAttachmentDto, ContractDashboardDto, ContractDto, ContractStatus, ContractTemplateDto,
  ContractTypeDto, CreateCompetitorContractDto, CreateCompetitorDto, CustomerDto, DocumentCategory, ObligationDto,
  ServiceLine, UpdateCompetitorContractDto,
} from '@bluefish/shared'
import { DOCUMENT_CATEGORIES, SERVICE_LINES } from '@bluefish/shared'
import DocumentViewer, { type ViewableVersion } from '../components/DocumentViewer'

function useVisibleServiceLines(): ServiceLine[] {
  // Keep the `SERVICE_LINES` type but filter based on the current user's scope.
  const { user, hasPermission } = useAuth()
  if (hasPermission('service:view_all')) return [...SERVICE_LINES]
  const owned = new Set(user?.services ?? [])
  return SERVICE_LINES.filter((s) => owned.has(s))
}
import { api, ApiError } from '../lib/api'
import './Contracts.css'
import { icons } from '../lib/icons'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

type Sub = 'dashboard' | 'repository' | 'calendar' | 'approvals' | 'obligations' | 'opportunities'
const SUB_DEFS: { id: Sub; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: icons.home },
  { id: 'repository', label: 'Contracts & Agreements', icon: icons.contract },
  { id: 'calendar', label: 'Calendar', icon: icons.cal },
  { id: 'approvals', label: 'Approvals', icon: icons.check },
  { id: 'obligations', label: 'Follow-ups', icon: icons.target },
  { id: 'opportunities', label: 'Opportunity Tracker', icon: icons.versus },
]

const STATUS_STYLE: Record<ContractStatus, { bg: string; fg: string }> = {
  Draft: { bg: '#F2F3F9', fg: '#5C5C74' },
  'Under Review': { bg: '#EAE7F7', fg: '#5B3FC4' },
  'Pending Approval': { bg: '#F7EBD9', fg: '#B4650A' },
  Approved: { bg: '#E4EDFC', fg: '#2A6FDB' },
  Signed: { bg: '#E7EDF9', fg: '#1F5AC2' },
  Active: { bg: '#E5F8ED', fg: '#06A94A' },
  Expiring: { bg: '#FEEFE6', fg: '#D2601A' },
  Expired: { bg: '#FDECEA', fg: '#C0392B' },
  Renewed: { bg: '#F4F1FD', fg: '#4A3AB8' },
  Terminated: { bg: '#ECECF1', fg: '#6B6B7B' },
}
const KIND_COLOR: Record<string, string> = {
  Payment: '#2A6FDB', Delivery: '#7C3AED', SLA: '#0E9C7E',
  Renewal: '#D2601A', Warranty: '#C0392B', Insurance: '#4A3AB8', KPI: '#8888A0',
}
const RISK_STYLE: Record<string, { bg: string; fg: string }> = {
  High: { bg: '#FDECEA', fg: '#C0392B' }, Med: { bg: '#FEF3E2', fg: '#B4650A' }, Low: { bg: '#EAF3EC', fg: '#1E8A4C' },
}
const SERVICE_STYLE: Record<ServiceLine, { bg: string; fg: string }> = {
  '3D':     { bg: '#EEF0FA', fg: '#4A3AB8' },
  '3S':     { bg: '#E4EDFC', fg: '#2A6FDB' },
  'Box':    { bg: '#FEF3E2', fg: '#B4650A' },
  'AI&RPA': { bg: '#E5F8ED', fg: '#0E6E4E' },
}

function ServicePill({ s, sm }: { s: ServiceLine; sm?: boolean }) {
  const st = SERVICE_STYLE[s]
  return <span style={{ background: st.bg, color: st.fg, borderRadius: 6, fontSize: sm ? 9.5 : 10.5, fontWeight: 700, padding: sm ? '1px 5px' : '2px 6px', whiteSpace: 'nowrap' }}>{s}</span>
}

function ServiceLineChips({ selected, onChange, sm }: { selected: ServiceLine[]; onChange: (next: ServiceLine[]) => void; sm?: boolean }) {
  const toggle = (s: ServiceLine) => onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s])
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {SERVICE_LINES.map((s) => {
        const on = selected.includes(s)
        const st = SERVICE_STYLE[s]
        return (
          <div key={s} onClick={() => toggle(s)} style={{
            cursor: 'pointer', border: `1px solid ${on ? st.fg : '#E5E7F0'}`,
            background: on ? st.bg : '#fff', color: on ? st.fg : '#5C5C74',
            borderRadius: 8, padding: sm ? '3px 8px' : '5px 10px',
            fontSize: sm ? 11 : 12, fontWeight: 700,
          }}>{s}</div>
        )
      })}
    </div>
  )
}

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'

export default function Contracts() {
  const [sub, setSub] = useState<Sub>('dashboard')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newFromTemplate, setNewFromTemplate] = useState(false)
  const [newContractPrefill, setNewContractPrefill] = useState<NewContractPrefill | undefined>()
  const [statusFilters, setStatusFilters] = useState<ContractStatus[]>([])
  const [serviceFilters, setServiceFilters] = useState<ServiceLine[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => { const t = setTimeout(() => setSearch(searchInput.trim()), 250); return () => clearTimeout(t) }, [searchInput])
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()

  // Opening via `navigate('/contracts', { state: { prefillFromOpportunity: {...} } })`
  // auto-opens the New Contract modal with those values pre-filled, then clears the state
  // so a tab change / refresh doesn't re-trigger it.
  useEffect(() => {
    const prefill = (location.state as { prefillFromOpportunity?: NewContractPrefill } | null)?.prefillFromOpportunity
    if (!prefill) return
    setNewContractPrefill(prefill)
    setNewFromTemplate(true)
    setSub('repository')
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  const showFilterBar = sub !== 'opportunities'

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', background: '#F7F8FC' }}>
      <div style={{ width: 210, minWidth: 210, background: '#fff', borderRight: '1px solid #E5E7F0', display: 'flex', flexDirection: 'column', padding: '18px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 8px 14px' }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: '#2E1A6B', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg viewBox="0 0 24 24" width="17" height="17"><path d={icons.contract} fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div><div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.1 }}>Contracts</div><div style={{ fontSize: 10.5, color: '#8888A0' }}>Lifecycle module</div></div>
        </div>
        <div onClick={() => setNewFromTemplate(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '9px 0', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginBottom: 14 }}>+ New contract</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {SUB_DEFS.map((n) => (
            <div key={n.id} onClick={() => setSub(n.id)} style={subItemStyle(sub === n.id)}>
              <svg viewBox="0 0 24 24" width="16" height="16" style={{ flex: 'none' }}><path d={n.icon} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span>{n.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <div style={{ height: 52, minHeight: 52, background: '#fff', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px' }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 600 }}>{SUB_DEFS.find((s) => s.id === sub)?.label}</div>
        </div>
        {showFilterBar && (
          <div style={{ padding: '14px 24px 0' }}>
            <ContractFilterBar
              statusFilters={statusFilters} setStatusFilters={setStatusFilters}
              serviceFilters={serviceFilters} setServiceFilters={setServiceFilters}
              searchInput={searchInput} setSearchInput={setSearchInput}
              hint={sub === 'approvals' ? 'Approvals defaults to Pending Approval when no status is picked.' : undefined}
            />
          </div>
        )}
        <div style={{ padding: '18px 24px 22px' }}>
          {sub === 'dashboard' && <DashboardTab statusFilters={statusFilters} serviceFilters={serviceFilters} search={search} onOpenContract={(id) => { setSelectedId(id); setSub('repository') }} />}
          {sub === 'repository' && <RepositoryTab statusFilters={statusFilters} serviceFilters={serviceFilters} search={search} selectedId={selectedId} onSelect={setSelectedId} onNewFromTemplate={() => setNewFromTemplate(true)} onToast={toast} />}
          {sub === 'calendar' && <CalendarTab statusFilters={statusFilters} serviceFilters={serviceFilters} search={search} />}
          {sub === 'approvals' && <ApprovalsTab statusFilters={statusFilters} serviceFilters={serviceFilters} search={search} onToast={toast} />}
          {sub === 'obligations' && <ObligationsTab statusFilters={statusFilters} serviceFilters={serviceFilters} search={search} onToast={toast} />}
          {sub === 'opportunities' && <OpportunityTrackerTab onToast={toast} />}
        </div>
      </div>

      {newFromTemplate && <NewFromTemplateModal prefill={newContractPrefill} onClose={() => { setNewFromTemplate(false); setNewContractPrefill(undefined) }} onCreated={(id) => { setNewFromTemplate(false); setNewContractPrefill(undefined); setSub('repository'); setSelectedId(id) }} />}
    </div>
  )
}

const STATUS_FILTER_OPTIONS: ContractStatus[] = ['Draft', 'Pending Approval', 'Active', 'Expiring', 'Signed']

function ContractFilterBar({ statusFilters, setStatusFilters, serviceFilters, setServiceFilters, searchInput, setSearchInput, hint }: {
  statusFilters: ContractStatus[]; setStatusFilters: (v: ContractStatus[]) => void
  serviceFilters: ServiceLine[]; setServiceFilters: (v: ServiceLine[]) => void
  searchInput: string; setSearchInput: (v: string) => void
  hint?: string
}) {
  const toggleStatus = (s: ContractStatus) => setStatusFilters(statusFilters.includes(s) ? statusFilters.filter((x) => x !== s) : [...statusFilters, s])
  const toggleService = (s: ServiceLine) => setServiceFilters(serviceFilters.includes(s) ? serviceFilters.filter((x) => x !== s) : [...serviceFilters, s])
  const anyOn = statusFilters.length > 0 || serviceFilters.length > 0 || !!searchInput
  const visibleServices = useVisibleServiceLines()

  return (
    <div>
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 460 }}>
          <svg viewBox="0 0 24 24" width="15" height="15" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8888A0' }}>
            <path d="M11 4a7 7 0 105.196 11.803l3.5 3.5a1 1 0 001.415-1.414l-3.5-3.5A7 7 0 0011 4zm-5 7a5 5 0 1110 0 5 5 0 01-10 0z" fill="currentColor" />
          </svg>
          <input
            value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search contract #, company, type, title, terms…"
            style={{ width: '100%', border: '1px solid #E5E7F0', borderRadius: 10, padding: '9px 34px 9px 34px', fontSize: 13, outline: 'none', background: '#fff' }}
          />
          {searchInput && (
            <div onClick={() => setSearchInput('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#8888A0', fontSize: 15, padding: '0 4px' }}>×</div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8888A0', letterSpacing: '.05em', textTransform: 'uppercase', marginRight: 2 }}>Status</span>
        <div onClick={() => setStatusFilters([])} style={{ border: `1px solid ${statusFilters.length === 0 ? '#2A6FDB' : '#E5E7F0'}`, background: statusFilters.length === 0 ? '#2A6FDB' : '#fff', color: statusFilters.length === 0 ? '#fff' : '#5C5C74', borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>All</div>
        {STATUS_FILTER_OPTIONS.map((f) => {
          const on = statusFilters.includes(f)
          const st = STATUS_STYLE[f]
          return (
            <div key={f} onClick={() => toggleStatus(f)} style={{
              border: `1px solid ${on ? st.fg : '#E5E7F0'}`, background: on ? st.bg : '#fff', color: on ? st.fg : '#5C5C74',
              borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>{on && <span style={{ fontSize: 10 }}>✓</span>}{f}</div>
          )
        })}
        <div style={{ width: 1, alignSelf: 'stretch', background: '#E5E7F0', margin: '0 4px' }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8888A0', letterSpacing: '.05em', textTransform: 'uppercase', marginRight: 2 }}>Service</span>
        <div onClick={() => setServiceFilters([])} style={{ border: `1px solid ${serviceFilters.length === 0 ? '#2A6FDB' : '#E5E7F0'}`, background: serviceFilters.length === 0 ? '#2A6FDB' : '#fff', color: serviceFilters.length === 0 ? '#fff' : '#5C5C74', borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>All</div>
        {visibleServices.map((s) => {
          const on = serviceFilters.includes(s)
          const st = SERVICE_STYLE[s]
          return (
            <div key={s} onClick={() => toggleService(s)} style={{
              border: `1px solid ${on ? st.fg : '#E5E7F0'}`, background: on ? st.bg : '#fff', color: on ? st.fg : '#5C5C74',
              borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>{on && <span style={{ fontSize: 10 }}>✓</span>}{s}</div>
          )
        })}
        {anyOn && (
          <div onClick={() => { setStatusFilters([]); setServiceFilters([]); setSearchInput('') }} style={{ marginLeft: 'auto', fontSize: 11.5, color: '#8888A0', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>Clear all</div>
        )}
      </div>
      {hint && <div style={{ marginTop: 6, fontSize: 11, color: '#8888A0' }}>{hint}</div>}
    </div>
  )
}

// ─── Dashboard ───
function DashboardTab({ statusFilters, serviceFilters, search, onOpenContract }: { statusFilters: ContractStatus[]; serviceFilters: ServiceLine[]; search: string; onOpenContract: (id: string) => void }) {
  const [data, setData] = useState<ContractDashboardDto | null>(null)
  const toast = useToast()

  useEffect(() => {
    setData(null)
    api.contractDashboard({
      status: statusFilters.length ? statusFilters : undefined,
      service: serviceFilters.length ? serviceFilters : undefined,
      q: search || undefined,
    })
      .then(setData)
      .catch((e) => toast(e instanceof ApiError ? e.message : 'Failed'))
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [statusFilters, serviceFilters, search])

  if (!data) return <div style={{ color: '#8888A0' }}>Loading…</div>

  const activePct = data.totalCount > 0 ? Math.round((data.activeCount / data.totalCount) * 100) : 0
  const funnelOrder: ContractStatus[] = ['Draft', 'Under Review', 'Pending Approval', 'Approved', 'Signed', 'Active']
  const funnelRows = funnelOrder.map((s) => ({ status: s, count: data.byStatus.find((b) => b.status === s)?.count ?? 0 }))
  const funnelMax = Math.max(1, ...funnelRows.map((r) => r.count))
  const trendMax = Math.max(1, ...data.monthlyValueTrend.map((m) => m.value))
  const thisMonth = data.monthlyValueTrend[data.monthlyValueTrend.length - 1]
  const totalByType = data.byType.reduce((a, t) => a + t.value, 0)
  const byTypeSorted = [...data.byType].sort((a, b) => b.value - a.value).slice(0, 4)

  const kpis = [
    { l: 'Total value',       v: fmt(data.totalValue),                       sub: `${data.totalCount} contracts`,            g: 'linear-gradient(135deg,#2E6BE6,#1B2F8F)' },
    { l: 'Active',            v: String(data.activeCount),                    sub: `${activePct}% of total`,                  g: 'linear-gradient(135deg,#22C9B4,#0E9C7E)' },
    { l: 'Expiring ≤ 90d',    v: String(data.expiringBuckets.in90.count),     sub: `pool ${fmt(data.expiringBuckets.in90.value)}`, g: 'linear-gradient(135deg,#FFB047,#F5641E)' },
    { l: 'Pending approval',  v: String(data.pendingCount),                   sub: `avg ${data.avgApprovalDays}d waiting`,    g: 'linear-gradient(135deg,#8A5CF6,#5B2C9E)' },
  ]

  const sectionTitle: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase', marginBottom: 10 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Row 1 — KPI tiles */}
      <div className="contract-kpi-row" style={{ margin: 0 }}>
        {kpis.map((k) => (
          <div key={k.l} style={{ borderRadius: 14, padding: '15px 17px', background: k.g, color: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.95 }}>{k.l}</div>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 27, fontWeight: 700, marginTop: 7, lineHeight: 1 }}>{k.v}</div>
            <div style={{ fontSize: 11, opacity: 0.9, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Row 2 — Funnel + Renewal Radar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {/* Lifecycle Funnel */}
        <div style={{ ...card, padding: '16px 18px' }}>
          <div style={sectionTitle}>Contract pipeline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {funnelRows.map((r) => {
              const w = Math.max(4, (r.count / funnelMax) * 100)
              const style = STATUS_STYLE[r.status]
              return (
                <div key={r.status} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 40px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                  <div style={{ color: '#5C5C74', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.status}</div>
                  <div style={{ height: 20, background: '#F2F3F9', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: style.fg, opacity: 0.9, width: `${w}%`, transition: 'width .2s' }} />
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#1E1E30' }}>{r.count}</div>
                </div>
              )
            })}
          </div>
          {data.approvalLongestWait && data.approvalLongestWait.days > 0 && (
            <div onClick={() => onOpenContract(data.approvalLongestWait!.contractId)} style={{ marginTop: 12, padding: '9px 11px', background: '#FEF3E2', borderRadius: 8, fontSize: 11.5, color: '#8A5C13', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚠</span>
              <span style={{ flex: 1 }}>Longest wait: <b>{data.approvalLongestWait.days}d</b> — {data.approvalLongestWait.contractNo}</span>
              <span style={{ color: '#B4650A' }}>›</span>
            </div>
          )}
          <div style={{ marginTop: 12, borderTop: '1px solid #F2F3F9', paddingTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            {([
              ['Signed',     data.thisMonthThroughput.signed,     '#0E9C7E'],
              ['Renewed',    data.thisMonthThroughput.renewed,    '#5B3FC4'],
              ['Terminated', data.thisMonthThroughput.terminated, '#C0392B'],
              ['Expired',    data.thisMonthThroughput.expired,    '#8888A0'],
            ] as const).map(([label, count, color]) => (
              <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 10.5, color: '#8888A0', letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, color, marginTop: 2 }}>{count}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#8888A0', textAlign: 'center', marginTop: 6 }}>This calendar month</div>
        </div>

        {/* Renewal Radar + Needs Attention */}
        <div style={{ ...card, padding: '16px 18px' }}>
          <div style={sectionTitle}>Renewal radar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {([
              ['≤ 30 days',  data.expiringBuckets.in30, '#C0392B'],
              ['≤ 60 days',  data.expiringBuckets.in60, '#D2601A'],
              ['≤ 90 days',  data.expiringBuckets.in90, '#B4650A'],
            ] as const).map(([label, b, color]) => {
              const w = Math.max(4, (b.count / Math.max(1, data.expiringBuckets.in90.count)) * 100)
              return (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 10, alignItems: 'center', fontSize: 12 }}>
                  <div style={{ color: '#5C5C74', fontWeight: 600 }}>{label}</div>
                  <div style={{ height: 18, background: '#F7F8FC', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${w}%`, background: color, opacity: 0.85 }} />
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5 }}>
                    <b style={{ color: '#1E1E30' }}>{b.count}</b>
                    <span style={{ color: '#8888A0' }}> · {fmt(b.value)}</span>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ borderTop: '1px solid #F2F3F9', paddingTop: 12 }}>
            <div style={sectionTitle}>Needs attention</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {([
                ['Pending approval',    data.pendingCount,            '#5B3FC4', `avg ${data.avgApprovalDays}d waiting`],
                ['Overdue follow-ups',  data.overdueFollowupsCount,   '#C0392B', 'past due date'],
                ['High-risk contracts', data.riskBreakdown.high,      '#C0392B', 'flagged High'],
                ['Medium-risk',         data.riskBreakdown.medium,    '#B4650A', 'review when possible'],
              ] as const).map(([label, count, color, sub]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: count > 0 ? '#F7F8FC' : 'transparent' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: count > 0 ? color : '#D7D7E2', flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: count > 0 ? '#1E1E30' : '#8888A0', fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 10.5, color: '#8888A0' }}>{sub}</div>
                  </div>
                  <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, color: count > 0 ? color : '#D7D7E2' }}>{count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3 — Monthly trend + Top customers / By type */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <div style={{ ...card, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={sectionTitle}>Value by month</div>
            <div style={{ flex: 1 }} />
            {thisMonth && (
              <div style={{ fontSize: 11, color: '#8888A0' }}>
                This month: <b style={{ color: '#1E1E30', fontFamily: "'Space Grotesk'" }}>{fmt(thisMonth.value)}</b>
                {thisMonth.count > 0 && <> · {thisMonth.count} ctrs</>}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, paddingTop: 6, paddingBottom: 20, borderBottom: '1px solid #F2F3F9', position: 'relative' }}>
            {data.monthlyValueTrend.map((m, idx) => {
              const h = Math.max(2, (m.value / trendMax) * 100)
              const isCur = idx === data.monthlyValueTrend.length - 1
              const [, mo] = m.month.split('-')
              return (
                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${m.month}: ${fmt(m.value)} · ${m.count} contract${m.count === 1 ? '' : 's'}`}>
                  <div style={{ width: '100%', height: `${h}%`, background: isCur ? '#2A6FDB' : '#B6CBF3', borderRadius: '4px 4px 0 0', minHeight: 2 }} />
                  <div style={{ fontSize: 9.5, color: isCur ? '#2A6FDB' : '#8888A0', fontFamily: "'IBM Plex Mono', monospace", fontWeight: isCur ? 700 : 400 }}>{Number(mo)}</div>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 10, color: '#8888A0', marginTop: 8 }}>Signed-at (or start-date) · last 12 months</div>
        </div>

        <div style={{ ...card, padding: '16px 18px' }}>
          <div style={sectionTitle}>Top customers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {data.topCustomers.length === 0 && <div style={{ color: '#8888A0', fontSize: 12 }}>No customers with contracts yet.</div>}
            {data.topCustomers.map((c) => {
              const w = Math.max(4, (c.value / (data.topCustomers[0]?.value || 1)) * 100)
              return (
                <div key={c.customerId} style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E1E30', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.customerName}</div>
                    <div style={{ height: 5, background: '#F2F3F9', borderRadius: 3, overflow: 'hidden', marginTop: 3 }}>
                      <div style={{ width: `${w}%`, height: '100%', background: '#2A6FDB' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5 }}>
                    <div style={{ color: '#1E1E30', fontWeight: 700 }}>{fmt(c.value)}</div>
                    <div style={{ color: '#8888A0', fontSize: 10 }}>{c.count} ctr{c.count === 1 ? '' : 's'}</div>
                  </div>
                </div>
              )
            })}
          </div>
          {byTypeSorted.length > 0 && (
            <div style={{ borderTop: '1px solid #F2F3F9', marginTop: 12, paddingTop: 12 }}>
              <div style={sectionTitle}>By type</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {byTypeSorted.map((t) => {
                  const pct = totalByType > 0 ? Math.round((t.value / totalByType) * 100) : 0
                  return (
                    <div key={t.type} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px', gap: 8, alignItems: 'center', fontSize: 11.5 }}>
                      <div style={{ color: '#3B3B52', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.type}</div>
                      <div style={{ textAlign: 'right', color: '#5C5C74' }}>{pct}%</div>
                      <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: '#5C5C74' }}>{fmt(t.value)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 4 — Upcoming follow-ups */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #F2F3F9', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center' }}>
          Upcoming follow-ups
          {data.overdueFollowupsCount > 0 && (
            <span style={{ marginLeft: 10, background: '#FDECEA', color: '#C0392B', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{data.overdueFollowupsCount} overdue</span>
          )}
        </div>
        {data.upcomingObligations.map((o) => {
          const overdue = new Date(o.dueDate).getTime() < Date.now()
          return (
            <div key={o.id} onClick={() => onOpenContract(o.contractId)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid #F2F3F9', cursor: 'pointer' }}>
              <div style={{ width: 4, borderRadius: 3, background: KIND_COLOR[o.kind] ?? '#5C5C74', alignSelf: 'stretch' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1E1E30', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.customerName}</div>
                <div style={{ fontSize: 11, color: '#5C5C74', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title} · {o.kind} · {o.contractNo}</div>
              </div>
              <div style={{ fontSize: 11.5, color: overdue ? '#C0392B' : '#5C5C74', fontWeight: overdue ? 700 : 500 }}>
                {new Date(o.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                {overdue && ' — overdue'}
              </div>
            </div>
          )
        })}
        {data.upcomingObligations.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No upcoming follow-ups.</div>}
      </div>
    </div>
  )
}

// ─── Repository ───
type RepoGroupBy = 'none' | 'company'

function RepositoryTab({ statusFilters, serviceFilters, search, selectedId, onSelect, onNewFromTemplate: _onNewFromTemplate, onToast }: { statusFilters: ContractStatus[]; serviceFilters: ServiceLine[]; search: string; selectedId: string | null; onSelect: (id: string) => void; onNewFromTemplate: () => void; onToast: (m: string) => void }) {
  const [rows, setRows] = useState<ContractDto[]>([])
  const [loading, setLoading] = useState(true)
  // Default to company grouping — repository is almost always browsed
  // "give me every deal we have with X" rather than a flat scroll.
  const [groupBy, setGroupBy] = useState<RepoGroupBy>('company')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const reload = async () => {
    setLoading(true)
    try {
      const query: { status?: string[]; service?: string[]; q?: string } = {}
      if (statusFilters.length) query.status = statusFilters
      if (serviceFilters.length) query.service = serviceFilters
      if (search) query.q = search
      setRows(await api.contracts(query))
    } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilters, serviceFilters, search])

  const selected = rows.find((r) => r.id === selectedId)

  // Group rows by customer (name/code) when groupBy = 'company'
  const groups = useMemo(() => {
    if (groupBy !== 'company') return []
    const byCust = new Map<string, { name: string; contracts: ContractDto[] }>()
    for (const c of rows) {
      const key = c.customerId
      const cur = byCust.get(key) ?? { name: c.customerName, contracts: [] }
      cur.contracts.push(c)
      byCust.set(key, cur)
    }
    return [...byCust.entries()]
      .map(([id, g]) => {
        const totalValue = g.contracts.reduce((a, c) => a + (c.value || 0), 0)
        const activeCount = g.contracts.filter((c) => c.status === 'Active' || c.status === 'Signed').length
        const expiringCount = g.contracts.filter((c) => c.status === 'Expiring').length
        const pendingCount = g.contracts.filter((c) => c.status === 'Pending Approval' || c.status === 'Under Review').length
        return { id, name: g.name, count: g.contracts.length, totalValue, activeCount, expiringCount, pendingCount, contracts: g.contracts }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, groupBy])

  const toggle = (id: string) => setCollapsed((s) => ({ ...s, [id]: !s[id] }))
  const collapseAll = () => setCollapsed(Object.fromEntries(groups.map((g) => [g.id, true])))
  const expandAll   = () => setCollapsed({})

  const renderRow = (c: ContractDto) => {
    const s = STATUS_STYLE[c.status]
    const r = RISK_STYLE[c.risk]
    const expiringSoon = c.daysLeft != null && c.daysLeft >= 0 && c.daysLeft <= 90
    const endColor = c.daysLeft == null ? '#3B3B52' : c.daysLeft < 0 ? '#C0392B' : c.daysLeft <= 30 ? '#C0392B' : c.daysLeft <= 90 ? '#B4650A' : '#3B3B52'
    return (
      <div key={c.id} className="contract-repo-grid" onClick={() => onSelect(c.id)} style={{ padding: '13px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', cursor: 'pointer', background: selectedId === c.id ? '#F7F8FC' : 'transparent' }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 500 }}>{c.no}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1E1E30', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.customerName}</div>
          {(c.name || c.currentVersion?.title) && (
            <div style={{ fontSize: 11, color: '#8888A0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name ?? c.currentVersion?.title}</div>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: '#5C5C74', minWidth: 0 }}>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.type}</div>
          {c.serviceLines.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
              {c.serviceLines.map((sl) => <ServicePill key={sl} s={sl} sm />)}
            </div>
          )}
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#5C5C74' }}>
          {c.startDate ? new Date(c.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: endColor, fontWeight: expiringSoon ? 700 : 500 }}>
          {c.endDate ? new Date(c.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          {c.daysLeft != null && (
            <div style={{ fontSize: 10, color: endColor, opacity: 0.85 }}>{c.daysLeft < 0 ? `${-c.daysLeft}d ago` : `${c.daysLeft}d left`}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#EEF3FC', color: '#2A6FDB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, border: '1px solid #D6E2F7', flex: 'none' }}>{initialsOf(c.ownerName)}</div>
          <div style={{ fontSize: 11.5, color: '#5C5C74', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.ownerName}</div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: "'Space Grotesk'", fontSize: 12.5, fontWeight: 600 }}>{c.value ? fmt(c.value) : '—'}</div>
        <div><span style={{ background: s.bg, color: s.fg, borderRadius: 7, fontSize: 11, fontWeight: 700, padding: '3px 9px', whiteSpace: 'nowrap' }}>{c.status}</span></div>
        <div style={{ textAlign: 'right' }}><span style={{ background: r.bg, color: r.fg, borderRadius: 7, fontSize: 11, fontWeight: 700, padding: '3px 9px' }}>{c.risk}</span></div>
      </div>
    )
  }

  if (selected) {
    return <ContractDetailPanel contract={selected} onClose={() => onSelect('')} onReload={reload} onToast={onToast} />
  }

  return (
    <>
      {/* Repository toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#8888A0' }}>
          <b style={{ color: '#3B3B52' }}>{rows.length}</b> contracts
          {groupBy === 'company' && groups.length > 0 && <> · {groups.length} companies</>}
        </div>
        <div style={{ flex: 1 }} />
        {groupBy === 'company' && groups.length > 0 && (
          <>
            <div onClick={expandAll} style={{ ...miniBtn, fontSize: 11 }}>Expand all</div>
            <div onClick={collapseAll} style={{ ...miniBtn, fontSize: 11 }}>Collapse all</div>
          </>
        )}
        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8888A0', letterSpacing: '.05em', textTransform: 'uppercase' }}>Group by</span>
        <div style={{ display: 'flex', padding: 3, background: '#F2F3F9', borderRadius: 9 }}>
          {(['none', 'company'] as RepoGroupBy[]).map((g) => (
            <div key={g} onClick={() => setGroupBy(g)} style={{
              padding: '5px 12px', borderRadius: 7,
              fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              background: groupBy === g ? '#fff' : 'transparent',
              color: groupBy === g ? '#2A6FDB' : '#5C5C74',
              boxShadow: groupBy === g ? '0 1px 3px rgba(17,24,39,.06)' : undefined,
            }}>{g === 'none' ? 'None' : 'Company'}</div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div className="contract-repo-grid" style={{ padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8888A0' }}>
            <div>Contract #</div><div>Party</div><div>Type</div><div>Start</div><div>End</div><div>Owner</div><div style={{ textAlign: 'right' }}>Value</div><div>Status</div><div style={{ textAlign: 'right' }}>Risk</div>
          </div>

          {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
          {!loading && rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No contracts.</div>}

          {!loading && groupBy === 'none' && rows.map(renderRow)}

          {!loading && groupBy === 'company' && groups.map((g) => {
            const isCollapsed = !!collapsed[g.id]
            return (
              <div key={g.id}>
                <div
                  onClick={() => toggle(g.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 18px',
                    background: '#F7F8FC',
                    borderBottom: '1px solid #E5E7F0',
                    borderTop: '1px solid #EEF0FA',
                    cursor: 'pointer',
                    position: 'sticky', top: 0, zIndex: 1,
                  }}
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" style={{ color: '#5C5C74', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform .12s' }}>
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, background: '#2E1A6B', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10.5, fontWeight: 800, flex: 'none',
                  }}>{initialsOf(g.name)}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: '#8888A0' }}>
                      {g.count} contract{g.count !== 1 ? 's' : ''}
                      {g.activeCount > 0 && <> · <span style={{ color: '#0E6E4E', fontWeight: 700 }}>{g.activeCount} active</span></>}
                      {g.expiringCount > 0 && <> · <span style={{ color: '#B4650A', fontWeight: 700 }}>{g.expiringCount} expiring</span></>}
                      {g.pendingCount > 0 && <> · <span style={{ color: '#5B3FC4', fontWeight: 700 }}>{g.pendingCount} pending</span></>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10.5, color: '#8888A0', letterSpacing: '.05em', textTransform: 'uppercase' }}>Total</div>
                    <div style={{ fontFamily: "'Space Grotesk'", fontSize: 14, fontWeight: 700, color: '#1E1E30' }}>{fmt(g.totalValue)}</div>
                  </div>
                </div>
                {!isCollapsed && g.contracts.map(renderRow)}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function initialsOf(name: string): string {
  const clean = name.replace(/[^\w\s฀-๿&]/g, '').trim()
  const parts = clean.split(/\s+/).slice(0, 2)
  return (parts.map((p) => p[0] ?? '').join('') || '·').slice(0, 3).toUpperCase()
}

function KV({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8888A0', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1E1E30', fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined }}>{value}</div>
    </div>
  )
}

function ContractDetailPanel({ contract, onClose, onReload, onToast }: { contract: ContractDto; onClose: () => void; onReload: () => void; onToast: (m: string) => void }) {
  const cv = contract.currentVersion
  const currentApproval = contract.approvals.find((a) => a.decision === 'pending' && a.step === contract.approvalStep)
  const { hasPermission } = useAuth()
  const [editingServices, setEditingServices] = useState(false)
  const [serviceDraft, setServiceDraft] = useState<ServiceLine[]>(contract.serviceLines)
  const [savingServices, setSavingServices] = useState(false)
  useEffect(() => { setServiceDraft(contract.serviceLines); setEditingServices(false) }, [contract.id, contract.serviceLines])

  const saveServices = async () => {
    setSavingServices(true)
    try {
      await api.updateContract(contract.id, { serviceLines: serviceDraft })
      onToast('Services updated'); setEditingServices(false); onReload()
    } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setSavingServices(false) }
  }

  const submit = async () => { try { await api.submitContract(contract.id); onToast('Submitted for approval'); onReload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }
  const approve = async () => { try { await api.approveContract(contract.id); onToast('Approved'); onReload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }
  const reject = async () => {
    const comment = window.prompt('Reason for rejection?')
    if (!comment) return
    try { await api.rejectContract(contract.id, comment); onToast('Rejected'); onReload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') }
  }
  const renew = async () => {
    const newStart = window.prompt('New start date (YYYY-MM-DD)?', new Date().toISOString().slice(0, 10))
    if (!newStart) return
    const newEnd = window.prompt('New end date (YYYY-MM-DD)?')
    if (!newEnd) return
    try {
      const created = await api.renewContract(contract.id, { newStart: new Date(newStart).toISOString(), newEnd: new Date(newEnd).toISOString() })
      onToast(`Renewed → ${created.no}`); onReload()
    } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') }
  }
  const terminate = async () => {
    const comment = window.prompt('Reason for termination?')
    if (!comment) return
    try { await api.terminateContract(contract.id, comment); onToast('Terminated'); onReload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') }
  }

  const statusStyle = STATUS_STYLE[contract.status]
  const riskStyle = RISK_STYLE[contract.risk]
  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  return (
    <div>
      {/* Back + header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div onClick={onClose} style={{ ...outlineBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>←</span> Back to list
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ background: statusStyle.bg, color: statusStyle.fg, borderRadius: 7, fontSize: 11.5, fontWeight: 700, padding: '4px 10px' }}>{contract.status}</span>
        <span style={{ background: riskStyle.bg, color: riskStyle.fg, borderRadius: 7, fontSize: 11.5, fontWeight: 700, padding: '4px 10px' }}>Risk · {contract.risk}</span>
      </div>

      <div style={{ ...card, padding: '18px 22px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, color: '#5C5C74' }}>{contract.no}</div>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 20, fontWeight: 700, color: '#1E1E30' }}>{contract.name ?? cv?.title ?? contract.type}</div>
        </div>
        <div style={{ fontSize: 12.5, color: '#5C5C74' }}>{contract.customerName}{contract.businessUnit && <> · <span style={{ color: '#8888A0' }}>BU:</span> {contract.businessUnit}</>}</div>
      </div>

      <div style={{ ...card, padding: '18px 22px', marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <KV label="Customer" value={contract.customerName} />
          <KV label="Owner" value={contract.ownerName} />
          <KV label="Type" value={contract.type} />
          <KV label="Value" value={contract.value ? '฿' + contract.value.toLocaleString('en-US') : '—'} mono />
          <KV label="Start date" value={fmtDate(contract.startDate)} mono />
          <KV label="End date" value={
            <>
              {fmtDate(contract.endDate)}
              {contract.daysLeft != null && (
                <span style={{ marginLeft: 6, fontSize: 11, color: contract.daysLeft < 0 ? '#C0392B' : contract.daysLeft <= 30 ? '#C0392B' : contract.daysLeft <= 90 ? '#B4650A' : '#8888A0' }}>
                  ({contract.daysLeft < 0 ? `${-contract.daysLeft}d overdue` : `${contract.daysLeft}d left`})
                </span>
              )}
            </>
          } mono />
          {contract.contractTerm && <KV label="Term" value={contract.contractTerm} />}
          <KV label="Auto-renew" value={<>{contract.autoRenew ? 'Yes' : 'No'}{contract.renewNoticeDays != null && <span style={{ color: '#8888A0' }}> · notice {contract.renewNoticeDays}d</span>}</>} />
          {contract.signedAt && <KV label="Signed" value={fmtDate(contract.signedAt)} mono />}
          {contract.terminatedAt && <KV label="Terminated" value={fmtDate(contract.terminatedAt)} mono />}
        </div>

        {(contract.contactPerson || contract.contactEmail || contract.contactTel || contract.contactFax) && (
          <div style={{ borderTop: '1px solid #F2F3F9', marginTop: 16, paddingTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase', marginBottom: 6 }}>Contact</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: '#3B3B52' }}>
              {contract.contactPerson && <span><b style={{ color: '#8888A0', fontWeight: 600 }}>Person:</b> {contract.contactPerson}</span>}
              {contract.contactEmail && <span><b style={{ color: '#8888A0', fontWeight: 600 }}>Email:</b> <a href={`mailto:${contract.contactEmail}`} style={{ color: '#2A6FDB', textDecoration: 'none' }}>{contract.contactEmail}</a></span>}
              {contract.contactTel && <span><b style={{ color: '#8888A0', fontWeight: 600 }}>Tel:</b> <a href={`tel:${contract.contactTel}`} style={{ color: '#2A6FDB', textDecoration: 'none' }}>{contract.contactTel}</a></span>}
              {contract.contactFax && <span><b style={{ color: '#8888A0', fontWeight: 600 }}>Fax:</b> {contract.contactFax}</span>}
            </div>
          </div>
        )}

        {contract.serviceDescription && (
          <div style={{ borderTop: '1px solid #F2F3F9', marginTop: 16, paddingTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase', marginBottom: 6 }}>Service description</div>
            <div style={{ color: '#3B3B52', whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.55 }}>{contract.serviceDescription}</div>
          </div>
        )}
      </div>

      <div style={{ ...card, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12.5 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ color: '#8888A0', flex: 'none', paddingTop: 2 }}>Services:</b>
          {editingServices ? (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ServiceLineChips selected={serviceDraft} onChange={setServiceDraft} sm />
              <div style={{ display: 'flex', gap: 6 }}>
                <div onClick={saveServices} style={{ ...primaryBtn, opacity: savingServices ? 0.5 : 1, padding: '5px 12px', fontSize: 11.5 }}>{savingServices ? 'Saving…' : 'Save'}</div>
                <div onClick={() => { setServiceDraft(contract.serviceLines); setEditingServices(false) }} style={{ ...outlineBtn, padding: '5px 12px', fontSize: 11.5 }}>Cancel</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', flex: 1 }}>
              {contract.serviceLines.length === 0 && <span style={{ color: '#8888A0' }}>—</span>}
              {contract.serviceLines.map((s) => <ServicePill key={s} s={s} />)}
              {hasPermission('contract:write') && (
                <div onClick={() => setEditingServices(true)} style={{ fontSize: 11, color: '#2A6FDB', fontWeight: 700, cursor: 'pointer', marginLeft: 4 }}>Edit</div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {contract.status === 'Draft' && hasPermission('contract:write') && (
            <div onClick={submit} style={primaryBtn}>Submit for approval</div>
          )}
          {contract.status === 'Pending Approval' && currentApproval && (
            <>
              <div style={{ fontSize: 12, color: '#5C5C74', flex: '1 0 100%', marginBottom: 4 }}>Awaiting <b>{currentApproval.stepName}</b> approval</div>
              <div onClick={approve} style={{ ...primaryBtn, background: '#0E9C7E' }}>Approve {currentApproval.stepName}</div>
              <div onClick={reject} style={{ ...outlineBtn, color: '#C0392B', borderColor: '#F5B7B1' }}>Reject</div>
            </>
          )}
          {(contract.status === 'Expiring' || contract.status === 'Expired') && hasPermission('contract:write') && (
            <div onClick={renew} style={primaryBtn}>Renew</div>
          )}
          {['Signed', 'Active', 'Expiring'].includes(contract.status) && hasPermission('contract:write') && (
            <div onClick={terminate} style={{ ...outlineBtn, color: '#C0392B', borderColor: '#F5B7B1' }}>Terminate</div>
          )}
        </div>

        {/* Approval workflow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 6, borderTop: '1px solid #F2F3F9', paddingTop: 12 }}>
          {contract.approvals.map((a, i, arr) => (
            <div key={a.id} style={{ display: 'contents' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: a.decision === 'approved' ? '#2A6FDB' : a.decision === 'rejected' ? '#C0392B' : contract.approvalStep === a.step ? '#fff' : '#F2F3F9',
                  color: a.decision === 'approved' || a.decision === 'rejected' ? '#fff' : contract.approvalStep === a.step ? '#B4650A' : '#8888A0',
                  border: contract.approvalStep === a.step && a.decision === 'pending' ? '2px solid #B4650A' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
                }}>{a.decision === 'approved' ? '✓' : a.decision === 'rejected' ? '×' : String(a.step)}</div>
                <span style={{ fontSize: 10.5, color: '#5C5C74' }}>{a.stepName}</span>
              </div>
              {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: a.decision === 'approved' ? '#2A6FDB' : '#E5E7F0', margin: '11px 4px 0' }} />}
            </div>
          ))}
        </div>

        {contract.riskFindings.length > 0 && (
          <div style={{ marginTop: 8, borderTop: '1px solid #F2F3F9', paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase', marginBottom: 6 }}>Risk findings ({contract.riskFindings.length})</div>
            {contract.riskFindings.slice(0, 4).map((r) => (
              <div key={r.id} style={{ padding: '6px 0', display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5 }}>
                <span style={{ background: r.severity === 'high' ? '#FDECEA' : r.severity === 'medium' ? '#FEF3E2' : '#F2F3F9', color: r.severity === 'high' ? '#C0392B' : r.severity === 'medium' ? '#B4650A' : '#5C5C74', borderRadius: 5, fontSize: 10, fontWeight: 700, padding: '2px 6px', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{r.severity}</span>
                <span style={{ color: '#3B3B52' }}>{r.message}</span>
              </div>
            ))}
          </div>
        )}

        {contract.obligations.length > 0 && (
          <div style={{ marginTop: 8, borderTop: '1px solid #F2F3F9', paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase', marginBottom: 6 }}>Follow-ups ({contract.obligations.length})</div>
            {contract.obligations.map((o) => {
              const overdue = new Date(o.dueDate).getTime() < Date.now() && o.status !== 'completed'
              return (
                <div key={o.id} style={{ padding: '6px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 3, background: KIND_COLOR[o.kind] }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{o.title}</div>
                    <div style={{ color: '#8888A0', fontSize: 11 }}>{o.kind} · due {new Date(o.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
                  </div>
                  <span style={{ background: o.status === 'completed' ? '#E5F8ED' : overdue ? '#FDECEA' : '#F2F3F9', color: o.status === 'completed' ? '#0E6E4E' : overdue ? '#C0392B' : '#5C5C74', borderRadius: 5, fontSize: 10, fontWeight: 700, padding: '2px 6px', textTransform: 'uppercase' }}>{overdue ? 'overdue' : o.status}</span>
                  {o.status !== 'completed' && hasPermission('contract:write') && (
                    <div onClick={async () => { try { await api.completeObligation(o.id); onToast('Marked done'); onReload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }} style={{ ...miniBtn, fontSize: 10 }}>Done</div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <ContractAttachments contract={contract} onReload={onReload} onToast={onToast} canWrite={hasPermission('contract:write')} />
      </div>
    </div>
  )
}

// ─── Attachments ───
const isSharePointUrl = (url: string) => /\bsharepoint\.com|\.sharepoint\./i.test(url)
const formatBytes = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`

const CATEGORY_TONE: Record<DocumentCategory, { bg: string; fg: string }> = {
  contract:    { bg: '#EEF3FC', fg: '#2A6FDB' },
  amendment:   { bg: '#FEF3E2', fg: '#B4650A' },
  addendum:    { bg: '#F7EBD9', fg: '#D2601A' },
  appendix:    { bg: '#EAE7F7', fg: '#5B3FC4' },
  sow:         { bg: '#F4F1FD', fg: '#4A3AB8' },
  nda:         { bg: '#FDECEA', fg: '#C0392B' },
  po:          { bg: '#EAF3EC', fg: '#0E6E4E' },
  invoice:     { bg: '#E5F8ED', fg: '#0E6E4E' },
  receipt:     { bg: '#E1F3E7', fg: '#1E8A4C' },
  quotation:   { bg: '#E4EDFC', fg: '#2A6FDB' },
  tor:         { bg: '#EEF0FA', fg: '#4A3AB8' },
  boq:         { bg: '#F1F1F5', fg: '#5C5C74' },
  certificate: { bg: '#FEEFE6', fg: '#D2601A' },
  brochure:    { bg: '#F2F3F9', fg: '#5C5C74' },
  other:       { bg: '#ECECF1', fg: '#6B6B7B' },
}

const categoryLabel = (id: DocumentCategory) => DOCUMENT_CATEGORIES.find((c) => c.id === id)?.label ?? id
const categoryThai = (id: DocumentCategory) => DOCUMENT_CATEGORIES.find((c) => c.id === id)?.th ?? ''

function ContractAttachments({ contract, onReload, onToast, canWrite }: { contract: ContractDto; onReload: () => void; onToast: (m: string) => void; canWrite: boolean }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pickerCategory, setPickerCategory] = useState<DocumentCategory>('contract')
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | 'all'>('all')
  const [viewing, setViewing] = useState<ViewableVersion | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await api.uploadDocument(file, { contractId: contract.id, category: pickerCategory })
      onToast('File attached'); onReload()
    } catch (err) { onToast(err instanceof ApiError ? err.message : 'Upload failed') }
    finally { setUploading(false) }
  }

  const remove = async (a: ContractAttachmentDto) => {
    if (!confirm(`Remove "${a.name}"?`)) return
    try { await api.deleteDocument(a.id); onToast('Removed'); onReload() }
    catch (err) { onToast(err instanceof ApiError ? err.message : 'Delete failed') }
  }

  const updateCategory = async (a: ContractAttachmentDto, next: DocumentCategory) => {
    if (next === a.category) return
    try {
      await api.updateDocument(a.id, { category: next })
      onToast('Category updated'); onReload()
    } catch (err) { onToast(err instanceof ApiError ? err.message : 'Failed') }
  }

  const filteredAttachments = categoryFilter === 'all'
    ? contract.attachments
    : contract.attachments.filter((a) => a.category === categoryFilter)

  const categoryCounts = contract.attachments.reduce<Record<string, number>>((acc, a) => {
    acc[a.category] = (acc[a.category] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid #F2F3F9', paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase', flex: 1 }}>Attachments ({contract.attachments.length})</div>
        {canWrite && (
          <>
            <select value={pickerCategory} onChange={(e) => setPickerCategory(e.target.value as DocumentCategory)} title="Category applied when uploading" style={{ ...miniBtn, padding: '3px 6px', fontSize: 11 }}>
              {DOCUMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.th}</option>)}
            </select>
            <input ref={fileInputRef} type="file" onChange={onFilePicked} style={{ display: 'none' }} />
            <div onClick={() => !uploading && fileInputRef.current?.click()} style={{ ...miniBtn, opacity: uploading ? 0.5 : 1 }}>{uploading ? 'Uploading…' : '+ File'}</div>
            <div onClick={() => setLinkOpen(true)} style={miniBtn}>+ Link</div>
          </>
        )}
      </div>

      {contract.attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          <div onClick={() => setCategoryFilter('all')} style={{ ...catChip(categoryFilter === 'all' ? { bg: '#2A6FDB', fg: '#fff' } : { bg: '#fff', fg: '#5C5C74' }), border: '1px solid #E5E7F0' }}>All · {contract.attachments.length}</div>
          {DOCUMENT_CATEGORIES.filter((c) => categoryCounts[c.id]).map((c) => {
            const on = categoryFilter === c.id
            const tone = CATEGORY_TONE[c.id]
            return (
              <div key={c.id} onClick={() => setCategoryFilter(on ? 'all' : c.id)} style={{
                ...catChip(on ? tone : { bg: '#fff', fg: '#5C5C74' }),
                border: `1px solid ${on ? tone.fg : '#E5E7F0'}`,
              }}>{c.label} · {categoryCounts[c.id]}</div>
            )
          })}
        </div>
      )}

      {contract.attachments.length === 0 && <div style={{ fontSize: 12, color: '#8888A0', padding: '4px 0 6px' }}>No attachments yet.</div>}
      {contract.attachments.length > 0 && filteredAttachments.length === 0 && <div style={{ fontSize: 12, color: '#8888A0', padding: '4px 0 6px' }}>No attachments in this category.</div>}

      {filteredAttachments.map((a) => {
        const isSharePoint = a.kind === 'link' && a.url && isSharePointUrl(a.url)
        const sourceBadge = a.kind === 'link' ? (isSharePoint ? { label: 'SharePoint', bg: '#E4EDFC', fg: '#2A6FDB' } : { label: 'Link', bg: '#EEF0FA', fg: '#4A3AB8' }) : { label: 'File', bg: '#EAF3EC', fg: '#0E6E4E' }
        const catTone = CATEGORY_TONE[a.category] ?? CATEGORY_TONE.other
        const href = a.kind === 'link' ? a.url ?? '#' : a.currentVersion ? api.documentDownloadUrl(a.currentVersion.id) : '#'
        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid #F7F8FC' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 'none', alignItems: 'flex-start' }}>
              <span title={categoryThai(a.category)} style={{ background: catTone.bg, color: catTone.fg, borderRadius: 6, fontSize: 10, fontWeight: 800, padding: '2px 7px', whiteSpace: 'nowrap' }}>{categoryLabel(a.category)}</span>
              <span style={{ background: sourceBadge.bg, color: sourceBadge.fg, borderRadius: 5, fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>{sourceBadge.label}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {a.kind === 'file' && a.currentVersion ? (
                <div
                  onClick={() => setViewing({ id: a.currentVersion!.id, filename: a.currentVersion!.filename, mimeType: a.currentVersion!.mimeType, sizeBytes: a.currentVersion!.sizeBytes, createdAt: a.createdAt, uploadedByName: a.uploadedByName })}
                  style={{ fontSize: 12.5, fontWeight: 600, color: '#2A6FDB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'none', display: 'block', cursor: 'pointer' }}
                >{a.name}</div>
              ) : (
                <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: '#2A6FDB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'none', display: 'block' }}>{a.name}</a>
              )}
              <div style={{ fontSize: 10.5, color: '#8888A0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {a.kind === 'link' ? a.url : a.currentVersion ? `${a.currentVersion.filename} · ${formatBytes(a.currentVersion.sizeBytes)}` : '—'}
                {' · '}{a.uploadedByName} · {new Date(a.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
              </div>
            </div>
            {canWrite && (
              <>
                <select value={a.category} onChange={(e) => updateCategory(a, e.target.value as DocumentCategory)} title="Change category" style={{ border: '1px solid #E5E7F0', background: '#fff', borderRadius: 6, fontSize: 10.5, padding: '3px 6px', color: '#3B3B52' }}>
                  {DOCUMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <div onClick={() => remove(a)} style={{ color: '#C0392B', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Remove</div>
              </>
            )}
          </div>
        )
      })}

      {linkOpen && (
        <AttachLinkModal contractId={contract.id} defaultCategory={pickerCategory} onClose={() => setLinkOpen(false)} onCreated={() => { setLinkOpen(false); onToast('Link attached'); onReload() }} onToast={onToast} />
      )}
      {viewing && <DocumentViewer version={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

const catChip = (tone: { bg: string; fg: string }): CSSProperties => ({
  background: tone.bg, color: tone.fg, fontSize: 10.5, fontWeight: 700,
  padding: '3px 9px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
})

function AttachLinkModal({ contractId, defaultCategory, onClose, onCreated, onToast }: { contractId: string; defaultCategory: DocumentCategory; onClose: () => void; onCreated: () => void; onToast: (m: string) => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState<DocumentCategory>(defaultCategory)
  const [saving, setSaving] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setSaving(true)
    try {
      await api.createDocumentLink({ contractId, name: name.trim() || url.trim(), url: url.trim(), category })
      onCreated()
    } catch (err) { onToast(err instanceof ApiError ? err.message : 'Failed') }
    finally { setSaving(false) }
  }

  const looksSharePoint = url && isSharePointUrl(url)

  return (
    <div style={backdrop} onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} style={{ ...dialog, maxWidth: 480, padding: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Attach a link</div>
        <div style={{ fontSize: 11, color: '#8888A0', marginBottom: 14 }}>Paste any URL — public web page, Google Drive, or SharePoint share link.</div>
        <div style={{ marginBottom: 12 }}>
          <div style={fieldLabel}>URL *</div>
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" style={inp} />
          {looksSharePoint && <div style={{ marginTop: 4, fontSize: 11, color: '#2A6FDB', fontWeight: 700 }}>Detected SharePoint link</div>}
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={fieldLabel}>Category *</div>
          <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)} style={inp}>
            {DOCUMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.th}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={fieldLabel}>Label (optional)</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contract exhibit A" style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
          <button type="submit" disabled={saving || !url.trim()} style={{ ...btnPrimary, opacity: saving || !url.trim() ? 0.5 : 1 }}>{saving ? 'Attaching…' : 'Attach link'}</button>
        </div>
      </form>
    </div>
  )
}

// ─── Calendar ───
const DOW_TONE: Record<number, { bg: string; head: string; num: string }> = {
  0: { bg: '#FFF5F5', head: '#FDECEA', num: '#C0392B' }, // Sunday
  1: { bg: '#fff',    head: '#F7F8FC', num: '#3B3B52' },
  2: { bg: '#fff',    head: '#F7F8FC', num: '#3B3B52' },
  3: { bg: '#fff',    head: '#F7F8FC', num: '#3B3B52' },
  4: { bg: '#fff',    head: '#F7F8FC', num: '#3B3B52' },
  5: { bg: '#fff',    head: '#F7F8FC', num: '#3B3B52' },
  6: { bg: '#F1F5FE', head: '#E4EDFC', num: '#2A6FDB' }, // Saturday
}

function CalendarTab({ statusFilters, serviceFilters, search }: { statusFilters: ContractStatus[]; serviceFilters: ServiceLine[]; search: string }) {
  const [obligations, setObligations] = useState<ObligationDto[]>([])
  const [monthStart, setMonthStart] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const toast = useToast()

  const monthEnd = useMemo(() => { const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); return d }, [monthStart])

  useEffect(() => {
    api.obligations({
      from: monthStart, to: monthEnd,
      contractStatus: statusFilters.length ? statusFilters : undefined,
      contractService: serviceFilters.length ? serviceFilters : undefined,
      q: search || undefined,
    })
      .then(setObligations)
      .catch((e) => toast(e instanceof ApiError ? e.message : 'Failed'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart, statusFilters, serviceFilters, search])

  const dayCount = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const leadEmpty = monthStart.getDay() // Sunday-first
  const cells: Array<null | { d: number; items: ObligationDto[] }> = []
  for (let i = 0; i < leadEmpty; i++) cells.push(null)
  for (let d = 1; d <= dayCount; d++) {
    const items = obligations.filter((o) => new Date(o.dueDate).getDate() === d)
    cells.push({ d, items })
  }
  // Trail pad so the grid always ends on a Saturday
  while (cells.length % 7 !== 0) cells.push(null)

  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  const today = new Date()
  const isThisMonth = today.getFullYear() === monthStart.getFullYear() && today.getMonth() === monthStart.getMonth()
  const todayNum = today.getDate()

  const shift = (dir: number) => { const d = new Date(monthStart); d.setMonth(d.getMonth() + dir); setMonthStart(d) }

  return (
    <>
      <div style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {Object.entries(KIND_COLOR).map(([k, c]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: c + '18', color: c, borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{k}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#C0392B', fontWeight: 700 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#FFF5F5', border: '1px solid #F5B7B1' }} />Sunday
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#2A6FDB', fontWeight: 700 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#F1F5FE', border: '1px solid #B7CDF4' }} />Saturday
        </span>
      </div>

      <div style={{ ...card, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, flex: 1, background: 'linear-gradient(90deg,#2E6BE6,#7C3AED)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div onClick={() => shift(-1)} style={navBtn}>‹</div>
            <div onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setMonthStart(d) }} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 11.5, fontWeight: 700, color: '#2A6FDB' }}>Today</div>
            <div onClick={() => shift(1)} style={navBtn}>›</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', border: '1px solid #E5E7F0', borderBottom: 'none', borderTopLeftRadius: 10, borderTopRightRadius: 10, overflow: 'hidden' }}>
          {dayNames.map((d, i) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', padding: '9px 0', background: DOW_TONE[i].head, color: DOW_TONE[i].num, borderRight: i < 6 ? '1px solid #E5E7F0' : 'none' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', border: '1px solid #E5E7F0', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, overflow: 'hidden' }}>
          {cells.map((cell, i) => {
            const dow = i % 7
            const tone = DOW_TONE[dow]
            const isToday = cell && isThisMonth && cell.d === todayNum
            const rightBorder = dow < 6 ? '1px solid #E5E7F0' : 'none'
            const bottomBorder = i < cells.length - 7 ? '1px solid #E5E7F0' : 'none'
            return (
              <div key={i} style={{
                minHeight: 96, padding: '6px 6px 4px', position: 'relative',
                background: cell ? (isToday ? '#FFF8E1' : tone.bg) : '#FAFAFC',
                borderRight: rightBorder, borderBottom: bottomBorder,
                boxShadow: isToday ? 'inset 0 0 0 2px #F5A623' : undefined,
              }}>
                {cell && (
                  <>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 22, height: 22, padding: '0 6px', borderRadius: 999,
                      fontFamily: "'Space Grotesk'", fontSize: 12.5, fontWeight: 700,
                      background: isToday ? '#F5A623' : 'transparent',
                      color: isToday ? '#fff' : tone.num,
                    }}>{cell.d}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                      {cell.items.slice(0, 3).map((o) => {
                        const c = KIND_COLOR[o.kind] ?? '#5C5C74'
                        return (
                          <div key={o.id} title={`${o.kind} · ${o.title}`} style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            background: c + '1A', color: c, borderLeft: `3px solid ${c}`,
                            borderRadius: 4, padding: '2px 5px',
                            fontSize: 10, fontWeight: 700, lineHeight: 1.25,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{o.title}</div>
                        )
                      })}
                      {cell.items.length > 3 && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#5C5C74', paddingLeft: 4 }}>+{cell.items.length - 3} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ ...card, padding: '16px 18px', marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{obligations.length} obligation(s) this month</div>
        {obligations.map((o) => (
          <div key={o.id} style={{ display: 'flex', gap: 11, padding: '10px 0', borderTop: '1px solid #F2F3F9', alignItems: 'center' }}>
            <div style={{ width: 4, height: 30, borderRadius: 2, background: KIND_COLOR[o.kind] ?? '#5C5C74' }} />
            <div style={{ textAlign: 'center', flex: 'none', width: 34 }}>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700 }}>{new Date(o.dueDate).getDate()}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title}</div>
              <div style={{ fontSize: 11, color: '#8888A0' }}>{o.kind} · {o.contractNo}</div>
            </div>
            <span style={{ background: o.status === 'completed' ? '#E5F8ED' : o.status === 'overdue' ? '#FDECEA' : '#F2F3F9', color: o.status === 'completed' ? '#0E6E4E' : o.status === 'overdue' ? '#C0392B' : '#5C5C74', borderRadius: 5, fontSize: 10, fontWeight: 700, padding: '3px 8px', textTransform: 'uppercase' }}>{o.status}</span>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Approvals ───
function ApprovalsTab({ statusFilters, serviceFilters, search, onToast }: { statusFilters: ContractStatus[]; serviceFilters: ServiceLine[]; search: string; onToast: (m: string) => void }) {
  const [rows, setRows] = useState<ContractDto[]>([])
  const reload = async () => {
    try {
      const query: { status?: string[]; service?: string[]; q?: string } = {}
      query.status = statusFilters.length ? statusFilters : ['Pending Approval']
      if (serviceFilters.length) query.service = serviceFilters
      if (search) query.q = search
      setRows(await api.contracts(query))
    } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') }
  }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilters, serviceFilters, search])

  return (
    <div style={{ ...card, padding: '16px 20px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#7C3AED', marginBottom: 12 }}>Approval queue — {rows.length} in queue</div>
      {rows.length === 0 && <div style={{ fontSize: 13, color: '#8888A0', textAlign: 'center', padding: 24 }}>No contracts awaiting approval.</div>}
      {rows.map((c) => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '14px 0', borderTop: '1px solid #F2F3F9' }}>
          <div style={{ width: 260, minWidth: 260 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600 }}>{c.no}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>{c.customerName}</div>
            <div style={{ fontSize: 11, color: '#8888A0' }}>{c.type} · {c.ownerName}</div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            {c.approvals.map((a, i, arr) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: a.decision === 'approved' ? '#2A6FDB' : a.decision === 'rejected' ? '#C0392B' : c.approvalStep === a.step ? '#fff' : '#F2F3F9',
                    color: a.decision === 'pending' && c.approvalStep === a.step ? '#B4650A' : a.decision === 'pending' ? '#8888A0' : '#fff',
                    border: c.approvalStep === a.step && a.decision === 'pending' ? '2px solid #B4650A' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
                  }}>{a.decision === 'approved' ? '✓' : a.decision === 'rejected' ? '×' : String(a.step)}</div>
                  <span style={{ fontSize: 10.5, color: '#5C5C74' }}>{a.stepName}</span>
                </div>
                {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: a.decision === 'approved' ? '#2A6FDB' : '#E5E7F0', margin: '11px 4px 0' }} />}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div onClick={async () => { try { await api.approveContract(c.id); onToast('Approved'); reload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }} style={{ background: '#0E9C7E', color: '#fff', borderRadius: 8, padding: '7px 15px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Approve</div>
            <div onClick={async () => {
              const comment = window.prompt('Reason?')
              if (!comment) return
              try { await api.rejectContract(c.id, comment); onToast('Rejected'); reload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') }
            }} style={{ border: '1px solid #F5B7B1', color: '#C0392B', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Reject</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Follow-ups tab (full table) ───
function ObligationsTab({ statusFilters, serviceFilters, search, onToast }: { statusFilters: ContractStatus[]; serviceFilters: ServiceLine[]; search: string; onToast: (m: string) => void }) {
  const [rows, setRows] = useState<ObligationDto[]>([])
  const reload = async () => {
    try {
      setRows(await api.obligations({
        contractStatus: statusFilters.length ? statusFilters : undefined,
        contractService: serviceFilters.length ? serviceFilters : undefined,
        q: search || undefined,
      }))
    } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') }
  }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilters, serviceFilters, search])
  const { hasPermission } = useAuth()

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ ...oblGrid, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8888A0' }}>
        <div>Type</div><div>Customer</div><div>Title</div><div>Contract</div><div>Due date</div><div>Amount</div><div>Status</div><div />
      </div>
      {rows.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No follow-ups match this filter.</div>
      )}
      {rows.map((o) => {
        const overdue = new Date(o.dueDate).getTime() < Date.now() && o.status !== 'completed'
        return (
          <div key={o.id} style={{ ...oblGrid, padding: '12px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center' }}>
            <div><span style={{ background: (KIND_COLOR[o.kind] ?? '#5C5C74') + '1A', color: KIND_COLOR[o.kind] ?? '#5C5C74', borderRadius: 7, fontSize: 11, fontWeight: 700, padding: '3px 9px' }}>{o.kind}</span></div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1E1E30', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.customerName}</div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: '#3B3B52' }}>{o.title}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#5C5C74' }}>{o.contractNo}</div>
            <div style={{ fontSize: 12, color: overdue ? '#C0392B' : '#3B3B52', fontWeight: overdue ? 700 : 500 }}>{new Date(o.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{o.amount ? '฿' + o.amount.toLocaleString('en-US') : '—'}</div>
            <div><span style={{ background: o.status === 'completed' ? '#E5F8ED' : overdue ? '#FDECEA' : '#F2F3F9', color: o.status === 'completed' ? '#0E6E4E' : overdue ? '#C0392B' : '#5C5C74', borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', textTransform: 'uppercase' }}>{overdue ? 'overdue' : o.status}</span></div>
            <div style={{ textAlign: 'right' }}>
              {o.status !== 'completed' && hasPermission('contract:write') && (
                <div onClick={async () => { try { await api.completeObligation(o.id); onToast('Marked done'); reload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }} style={{ ...miniBtn, display: 'inline-block' }}>Mark done</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── New contract from template modal ───
export interface NewContractPrefill {
  opportunityId?: string
  opportunityTitle?: string
  customerId?: string
  value?: number
  name?: string
  serviceDescription?: string
  serviceLines?: ServiceLine[]
  contactPerson?: string
  contactEmail?: string
  contactTel?: string
}

function NewFromTemplateModal({ onClose, onCreated, prefill }: { onClose: () => void; onCreated: (id: string) => void; prefill?: NewContractPrefill }) {
  const [templates, setTemplates] = useState<ContractTemplateDto[]>([])
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [types, setTypes] = useState<ContractTypeDto[]>([])
  const [templateId, setTemplateId] = useState('')
  const [customerId, setCustomerId] = useState(prefill?.customerId ?? '')
  const [contractType, setContractType] = useState('')
  const [contractName, setContractName] = useState(prefill?.name ?? '')
  const [serviceDescription, setServiceDescription] = useState(prefill?.serviceDescription ?? '')
  const [businessUnit, setBusinessUnit] = useState('')
  const [contactPerson, setContactPerson] = useState(prefill?.contactPerson ?? '')
  const [contactEmail, setContactEmail] = useState(prefill?.contactEmail ?? '')
  const [contactTel, setContactTel] = useState(prefill?.contactTel ?? '')
  const [contactFax, setContactFax] = useState('')
  const [contractTerm, setContractTerm] = useState('')
  const [renewNoticeDays, setRenewNoticeDays] = useState<number | ''>(30)
  const [value, setValue] = useState<number>(prefill?.value ?? 0)
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10) })
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>(prefill?.serviceLines ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.contractTemplates().then(setTemplates).catch(() => setTemplates([]))
    api.customers().then(setCustomers).catch(() => setCustomers([]))
    api.contractTypes().then(setTypes).catch(() => setTypes([]))
  }, [])

  const template = templates.find((t) => t.id === templateId)
  useEffect(() => {
    if (template && !contractType) setContractType(template.type)
  }, [template, contractType])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      const created = await api.createContractFromTemplate({
        templateId, customerId,
        opportunityId: prefill?.opportunityId,
        value: value || undefined,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        serviceLines: serviceLines.length ? serviceLines : undefined,
        type: contractType.trim() || undefined,
        name: contractName.trim() || undefined,
        serviceDescription: serviceDescription.trim() || undefined,
        businessUnit: businessUnit.trim() || undefined,
        contactPerson: contactPerson.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactTel: contactTel.trim() || undefined,
        contactFax: contactFax.trim() || undefined,
        contractTerm: contractTerm.trim() || undefined,
        renewNoticeDays: typeof renewNoticeDays === 'number' ? renewNoticeDays : undefined,
      })
      onCreated(created.id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create')
    } finally { setBusy(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={{ ...dialog, maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center', flex: 'none' }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, flex: 1 }}>New contract from template</div>
            <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0' }}>×</div>
          </div>
          {prefill?.opportunityId && (
            <div style={{ padding: '10px 22px', background: '#EEF8F3', borderBottom: '1px solid #D7EEDF', fontSize: 12, color: '#0E6E4E', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>↳</span>
              <span>Converting from won deal{prefill.opportunityTitle ? ': ' : ''}<b>{prefill.opportunityTitle ?? ''}</b> — customer, amount, service, and contact pre-filled.</span>
            </div>
          )}
          <div style={{ padding: '18px 22px', overflow: 'auto', flex: 1 }}>
            <SectionLabel>Template & basics</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 6 }}>
              <label style={{ gridColumn: 'span 2' }}>
                <div style={fieldLabel}>Template *</div>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required style={inp}>
                  <option value="">— select —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
                </select>
              </label>
              <label>
                <div style={fieldLabel}>Contract type</div>
                <select value={contractType} onChange={(e) => setContractType(e.target.value)} style={inp}>
                  <option value="">— use template default —</option>
                  {types.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  {contractType && !types.some((t) => t.name === contractType) && (
                    <option value={contractType}>{contractType} (custom)</option>
                  )}
                </select>
              </label>
              <label>
                <div style={fieldLabel}>Contract name</div>
                <input value={contractName} onChange={(e) => setContractName(e.target.value)} placeholder="e.g. Hospital ERP 2026" style={inp} />
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                <div style={fieldLabel}>Customer *</div>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required style={inp}>
                  <option value="">— select —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                <div style={fieldLabel}>Service description</div>
                <textarea rows={3} value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} placeholder="Scope, deliverables, SLA highlights…" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
              </label>
            </div>

            <SectionLabel>Contact</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 6 }}>
              <label>
                <div style={fieldLabel}>Business unit / Department</div>
                <input value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)} placeholder="e.g. IT Department" style={inp} />
              </label>
              <label>
                <div style={fieldLabel}>Contact person</div>
                <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Name" style={inp} />
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                <div style={fieldLabel}>Contact email</div>
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="name@company.com" style={inp} />
              </label>
              <label>
                <div style={fieldLabel}>Tel</div>
                <input value={contactTel} onChange={(e) => setContactTel(e.target.value)} placeholder="+66 2 123 4567" style={inp} />
              </label>
              <label>
                <div style={fieldLabel}>Fax</div>
                <input value={contactFax} onChange={(e) => setContactFax(e.target.value)} placeholder="+66 2 123 4568" style={inp} />
              </label>
            </div>

            <SectionLabel>Term & value</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 6 }}>
              <label>
                <div style={fieldLabel}>Contract term</div>
                <input value={contractTerm} onChange={(e) => setContractTerm(e.target.value)} placeholder="e.g. 1 year, 36 months" style={inp} />
              </label>
              <label>
                <div style={fieldLabel}>Renew notice (days)</div>
                <input type="number" min={0} value={renewNoticeDays} onChange={(e) => setRenewNoticeDays(e.target.value === '' ? '' : Number(e.target.value))} placeholder="30" style={inp} />
              </label>
              <label>
                <div style={fieldLabel}>Value (฿)</div>
                <input type="number" min={0} value={value} onChange={(e) => setValue(Number(e.target.value))} style={inp} />
              </label>
              <label>
                <div style={fieldLabel}>Start date *</div>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={inp} />
              </label>
              <label>
                <div style={fieldLabel}>End date *</div>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required style={inp} />
              </label>
            </div>

            <SectionLabel>Services</SectionLabel>
            <div style={{ marginBottom: 6 }}>
              <ServiceLineChips selected={serviceLines} onChange={setServiceLines} />
            </div>

            {template && template.variables.length > 0 && (
              <div style={{ background: '#F4F1FD', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#4A3AB8', marginTop: 6 }}>
                <b>Template variables auto-filled:</b> {template.variables.join(', ')}
                <br /><span style={{ color: '#5C5C74' }}>Customer name, address, tax ID, dates, and value will be substituted.</span>
              </div>
            )}
          </div>
          {error && <div style={{ margin: '0 22px 12px', background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>{error}</div>}
          <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10, justifyContent: 'flex-end', flex: 'none' }}>
            <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
            <button type="submit" disabled={busy || !templateId || !customerId} style={{ ...btnPrimary, opacity: busy || !templateId || !customerId ? 0.5 : 1 }}>{busy ? 'Creating…' : 'Create contract'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: '#5B3FC4', textTransform: 'uppercase', marginBottom: 8 }}>{children}</div>
}

// ─── Competitor Tracker ───
const COMP_STATUSES: CompetitorContractStatus[] = ['Prospect', 'Contract Identified', 'Monitoring', 'Renewal Window', 'Proposal Submitted', 'Negotiation', 'Auto Renewed', 'Won', 'Lost']
const COMP_STATUS_STYLE: Record<CompetitorContractStatus, { bg: string; fg: string }> = {
  Prospect:               { bg: '#F2F3F9', fg: '#5C5C74' },
  'Contract Identified':  { bg: '#EEF0FA', fg: '#4A3AB8' },
  Monitoring:             { bg: '#E4EDFC', fg: '#2A6FDB' },
  'Renewal Window':       { bg: '#FEF3E2', fg: '#B4650A' },
  'Proposal Submitted':   { bg: '#EAE7F7', fg: '#5B3FC4' },
  Negotiation:            { bg: '#F7EBD9', fg: '#D2601A' },
  'Auto Renewed':         { bg: '#FDECEA', fg: '#C0392B' },
  Won:                    { bg: '#E5F8ED', fg: '#06A94A' },
  Lost:                   { bg: '#ECECF1', fg: '#6B6B7B' },
}
const CONFIDENCE_STYLE: Record<'Low'|'Med'|'High', { bg: string; fg: string }> = {
  High: { bg: '#E5F8ED', fg: '#0E6E4E' },
  Med:  { bg: '#FEF3E2', fg: '#B4650A' },
  Low:  { bg: '#FDECEA', fg: '#C0392B' },
}
const compGrid: CSSProperties = { display: 'grid', gridTemplateColumns: '170px 1fr 110px 130px 100px 120px 80px 90px', gap: 10, alignItems: 'center' }

function OpportunityTrackerTab({ onToast }: { onToast: (m: string) => void }) {
  const [competitors, setCompetitors] = useState<CompetitorDto[]>([])
  const [contracts, setContracts] = useState<CompetitorContractDto[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [serviceFilter, setServiceFilter] = useState<ServiceLine | 'all'>('all')
  const [competitorFilter, setCompetitorFilter] = useState<string>('all')
  const [customerSearch, setCustomerSearch] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [editing, setEditing] = useState<CompetitorContractDto | null>(null)
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('competitor:write')

  const refresh = async () => {
    try {
      const [cs, cn] = await Promise.all([api.competitors(), api.competitorContracts()])
      setCompetitors(cs)
      setContracts(cn)
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Failed to load opportunity data')
    } finally { setLoading(false) }
  }
  useEffect(() => { refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const filtered = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    return contracts.filter((c) => {
      if (competitorFilter !== 'all' && c.competitorId !== competitorFilter) return false
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (serviceFilter !== 'all') {
        const comp = competitors.find((k) => k.id === c.competitorId)
        if (!comp?.serviceLines.includes(serviceFilter)) return false
      }
      if (q && !c.customerName.toLowerCase().includes(q)) return false
      return true
    })
  }, [contracts, competitors, competitorFilter, statusFilter, serviceFilter, customerSearch])

  const grouped = useMemo(() => {
    const map = new Map<string, { customerName: string; customerId: string | null; items: CompetitorContractDto[]; totalValue: number; weighted: number }>()
    for (const c of filtered) {
      const key = c.customerId || `name:${c.customerName.toLowerCase()}`
      const g = map.get(key) ?? { customerName: c.customerName, customerId: c.customerId, items: [], totalValue: 0, weighted: 0 }
      g.items.push(c)
      g.totalValue += c.dealValue
      g.weighted += c.dealValue * (c.probability / 100)
      map.set(key, g)
    }
    return Array.from(map.values()).sort((a, b) => a.customerName.localeCompare(b.customerName))
  }, [filtered])

  const totals = useMemo(() => {
    const totalDeals = filtered.reduce((s, c) => s + c.dealValue, 0)
    const weighted = filtered.reduce((s, c) => s + c.dealValue * (c.probability / 100), 0)
    return { count: filtered.length, totalDeals, weighted }
  }, [filtered])

  if (loading) return <div style={{ color: '#8888A0' }}>Loading…</div>

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
          placeholder="Search customer…"
          style={{ ...selectSm, minWidth: 220, fontFamily: 'inherit' }}
        />
        <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value as ServiceLine | 'all')} style={selectSm}>
          <option value="all">All services</option>
          {SERVICE_LINES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={competitorFilter} onChange={(e) => setCompetitorFilter(e.target.value)} style={selectSm}>
          <option value="all">All competitors</option>
          {competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectSm}>
          <option value="all">All statuses</option>
          {COMP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: '#5C5C74' }}>
          <b style={{ color: '#1E1E30' }}>{totals.count}</b> contracts · pool <b style={{ color: '#1E1E30' }}>{fmt(totals.totalDeals)}</b> · weighted <b style={{ color: '#2A6FDB' }}>{fmt(totals.weighted)}</b>
        </div>
        {canWrite && <div onClick={() => setManageOpen(true)} style={outlineBtn}>Manage Competitors</div>}
        {canWrite && <div onClick={() => setNewOpen(true)} style={primaryBtn}>+ Track contract</div>}
      </div>

      {/* Customer-grouped cards */}
      {grouped.length === 0 && (
        <div style={{ ...card, padding: 30, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No opportunities match this filter.</div>
      )}
      {grouped.map((g) => (
        <div key={g.customerId ?? `name:${g.customerName}`} style={{ ...card, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottom: '1px solid #F2F3F9', marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E1E30', flex: 1, minWidth: 0 }}>{g.customerName}</div>
            <div style={{ fontSize: 11.5, color: '#5C5C74' }}>
              <b style={{ color: '#1E1E30' }}>{g.items.length}</b> contract{g.items.length === 1 ? '' : 's'} ·
              value <b style={{ color: '#1E1E30' }}>{fmt(g.totalValue)}</b> ·
              weighted <b style={{ color: '#2A6FDB' }}>{fmt(g.weighted)}</b>
            </div>
          </div>
          <div style={{ ...compGrid, fontSize: 11, fontWeight: 700, color: '#8888A0', textTransform: 'uppercase', letterSpacing: '.06em', paddingBottom: 8, borderBottom: '1px solid #E5E7F0' }}>
            <div>Held by</div><div>Service</div><div>Ends</div><div>Status</div><div>Prob</div><div>Value</div><div>Conf</div><div>Owner</div>
          </div>
          {g.items.map((c) => {
            const days = c.daysUntilEnd
            const dayColor = days < 0 ? '#C0392B' : days <= 30 ? '#D2601A' : days <= 90 ? '#B4650A' : '#5C5C74'
            return (
              <div key={c.id} onClick={() => setEditing(c)} style={{ ...compGrid, padding: '11px 0', borderBottom: '1px solid #F1F1F5', fontSize: 12.5, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: c.competitorColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800 }}>{c.competitorLogo}</div>
                  <div style={{ color: '#3B3B52', fontWeight: 600 }}>{c.competitorName}</div>
                </div>
                <div style={{ color: '#5C5C74' }}>{c.service}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: dayColor }}>
                  {new Date(c.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  <div style={{ fontSize: 10, color: dayColor, opacity: 0.85 }}>{days < 0 ? `${-days}d ago` : `${days}d left`}</div>
                </div>
                <div><StatusPill status={c.status} /></div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 40, height: 5, background: '#F1F1F5', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${c.probability}%`, height: '100%', background: c.probability >= 60 ? '#0E9C7E' : c.probability >= 30 ? '#D2601A' : '#8888A0' }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#5C5C74', fontFamily: "'IBM Plex Mono', monospace" }}>{c.probability}%</div>
                  </div>
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{fmt(c.dealValue)}</div>
                <div><ConfPill c={c.confidence} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.ownerInitials ? (
                    <>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#EEF3FC', color: '#2A6FDB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, border: '1px solid #D6E2F7' }}>{c.ownerInitials}</div>
                      <div style={{ fontSize: 11, color: '#5C5C74' }}>{c.ownerName?.split(' ')[0]}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: '#8888A0' }}>Unassigned</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {newOpen && (
        <NewCompetitorContractModal
          competitors={competitors}
          onClose={() => setNewOpen(false)}
          onCreated={() => { setNewOpen(false); onToast('Competitor contract tracked'); refresh() }}
          onToast={onToast}
        />
      )}
      {manageOpen && (
        <ManageCompetitorsModal
          competitors={competitors}
          contracts={contracts}
          canWrite={canWrite}
          onClose={() => setManageOpen(false)}
          onChanged={refresh}
          onToast={onToast}
        />
      )}
      {editing && (
        <EditCompetitorContractModal
          contract={editing}
          competitors={competitors}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onToast('Updated'); refresh() }}
          onDeleted={() => { setEditing(null); onToast('Deleted'); refresh() }}
          onToast={onToast}
        />
      )}
    </div>
  )
}


function StatusPill({ status }: { status: CompetitorContractStatus }) {
  const s = COMP_STATUS_STYLE[status]
  return <span style={{ display: 'inline-block', background: s.bg, color: s.fg, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>{status}</span>
}

function ConfPill({ c }: { c: 'Low' | 'Med' | 'High' }) {
  const s = CONFIDENCE_STYLE[c]
  return <span style={{ display: 'inline-block', background: s.bg, color: s.fg, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6 }}>{c}</span>
}

function CompetitorFormModal({ initial, onClose, onSaved, onToast }: { initial?: CompetitorDto; onClose: () => void; onSaved: () => void; onToast: (m: string) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [logo, setLogo] = useState(initial?.logo ?? '')
  const [color, setColor] = useState(initial?.color ?? '#2A6FDB')
  const [product, setProduct] = useState(initial?.product ?? '')
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>(initial?.serviceLines ?? [])
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      if (initial) {
        await api.updateCompetitor(initial.id, {
          name: name.trim(), logo: logo.trim() || undefined, color,
          product: product.trim() || null,
          serviceLines, notes: notes.trim() || null,
        })
      } else {
        const body: CreateCompetitorDto = {
          name: name.trim(), logo: logo.trim() || undefined, color,
          product: product.trim() || undefined,
          serviceLines: serviceLines.length ? serviceLines : undefined,
          notes: notes.trim() || undefined,
        }
        await api.createCompetitor(body)
      }
      onSaved()
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} style={{ ...dialog, maxWidth: 520, padding: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{initial ? 'Edit competitor' : 'Add competitor'}</div>
        <div style={{ marginBottom: 12 }}>
          <div style={fieldLabel}>Name *</div>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Oracle Netsuite" style={inp} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={fieldLabel}>Badge (1–3 chars)</div>
            <input value={logo} onChange={(e) => setLogo(e.target.value.slice(0, 3).toUpperCase())} placeholder="ON" style={inp} maxLength={3} />
          </div>
          <div>
            <div style={fieldLabel}>Color</div>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ ...inp, padding: 3, height: 40 }} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={fieldLabel}>Product</div>
          <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Their flagship product this competitor pushes" style={inp} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={fieldLabel}>Service lines (they compete in)</div>
          <ServiceLineChips selected={serviceLines} onChange={setServiceLines} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={fieldLabel}>Notes</div>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Positioning, strengths, weaknesses…" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
          <button type="submit" disabled={saving || !name.trim()} style={{ ...btnPrimary, opacity: saving || !name.trim() ? 0.5 : 1 }}>{saving ? 'Saving…' : (initial ? 'Save' : 'Add')}</button>
        </div>
      </form>
    </div>
  )
}

function ManageCompetitorsModal({ competitors, contracts, canWrite, onClose, onChanged, onToast }: {
  competitors: CompetitorDto[]
  contracts: CompetitorContractDto[]
  canWrite: boolean
  onClose: () => void
  onChanged: () => void
  onToast: (m: string) => void
}) {
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<CompetitorDto | null>(null)

  const q = search.trim().toLowerCase()
  const visible = useMemo(() => {
    const list = q
      ? competitors.filter((c) => c.name.toLowerCase().includes(q) || (c.product ?? '').toLowerCase().includes(q))
      : competitors
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [competitors, q])

  const countFor = (id: string) => contracts.filter((k) => k.competitorId === id).length

  const remove = async (c: CompetitorDto) => {
    const linked = countFor(c.id)
    const warn = linked > 0 ? `\n\nAlso removes ${linked} tracked contract row(s).` : ''
    if (!confirm(`Delete competitor "${c.name}"?${warn}`)) return
    try {
      await api.deleteCompetitor(c.id)
      onToast('Competitor deleted')
      onChanged()
    } catch (e) { onToast(e instanceof ApiError ? e.message : 'Delete failed') }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...dialog, maxWidth: 640, padding: 22, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Manage competitors</div>
          <div onClick={onClose} style={{ ...btnGhost, padding: '6px 10px', cursor: 'pointer' }}>Close</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search competitors…"
            style={{ ...inp, flex: 1 }}
          />
          {canWrite && (
            <button type="button" onClick={() => setAdding(true)} style={btnPrimary}>+ Add competitor</button>
          )}
        </div>

        <div style={{ fontSize: 11, color: '#8888A0', marginBottom: 6 }}>
          {visible.length} of {competitors.length} competitor{competitors.length === 1 ? '' : 's'}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #F1F1F5', borderRadius: 10 }}>
          {visible.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>
              {q ? 'No competitors match.' : 'No competitors yet.'}
            </div>
          )}
          {visible.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #F2F3F9' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: c.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flex: 'none' }}>{c.logo}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1E1E30' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: '#8888A0', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                  <span>{countFor(c.id)} tracked</span>
                  {c.product && <span>· {c.product}</span>}
                  {c.serviceLines.slice(0, 4).map((s) => <ServicePill key={s} s={s} sm />)}
                </div>
              </div>
              {canWrite && (
                <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                  <div onClick={() => setEditing(c)} style={outlineBtn}>Edit</div>
                  <div onClick={() => remove(c)} style={{ ...outlineBtn, color: '#C0392B', borderColor: '#F5C7C0' }}>Delete</div>
                </div>
              )}
            </div>
          ))}
        </div>

        {adding && (
          <CompetitorFormModal
            onClose={() => setAdding(false)}
            onSaved={() => { setAdding(false); onToast('Competitor added'); onChanged() }}
            onToast={onToast}
          />
        )}
        {editing && (
          <CompetitorFormModal
            initial={editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); onToast('Competitor saved'); onChanged() }}
            onToast={onToast}
          />
        )}
      </div>
    </div>
  )
}

function NewCompetitorContractModal({ competitors, onClose, onCreated, onToast }: { competitors: CompetitorDto[]; onClose: () => void; onCreated: () => void; onToast: (m: string) => void }) {
  const { user } = useAuth()
  const [form, setForm] = useState<CreateCompetitorContractDto>({
    competitorId: competitors[0]?.id ?? '',
    customerName: '',
    service: '',
    endDate: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    status: 'Monitoring',
    probability: 0,
    dealValue: 0,
    confidence: 'Med',
    ownerId: user?.id,
  })
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof CreateCompetitorContractDto>(k: K, v: CreateCompetitorContractDto[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.competitorId || !form.customerName.trim() || !form.service.trim()) return
    setSaving(true)
    try {
      await api.createCompetitorContract({ ...form, endDate: new Date(form.endDate).toISOString() })
      onCreated()
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} style={{ ...dialog, maxWidth: 560, padding: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Track competitor contract</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={fieldLabel}>Competitor *</div>
            <select value={form.competitorId} onChange={(e) => set('competitorId', e.target.value)} style={inp}>
              {competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Customer (they hold) *</div>
            <input value={form.customerName} onChange={(e) => set('customerName', e.target.value)} placeholder="Company name" style={inp} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={fieldLabel}>Service *</div>
            <input value={form.service} onChange={(e) => set('service', e.target.value)} placeholder="e.g. Hospital ERP" style={inp} />
          </div>
          <div>
            <div style={fieldLabel}>Contract ends *</div>
            <input type="date" value={form.endDate.slice(0, 10)} onChange={(e) => set('endDate', e.target.value)} style={inp} />
          </div>
          <div>
            <div style={fieldLabel}>Status</div>
            <select value={form.status} onChange={(e) => set('status', e.target.value as CompetitorContractStatus)} style={inp}>
              {COMP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Deal value (฿)</div>
            <input type="number" min={0} value={form.dealValue ?? 0} onChange={(e) => set('dealValue', Number(e.target.value))} style={inp} />
          </div>
          <div>
            <div style={fieldLabel}>Probability we win</div>
            <input type="number" min={0} max={100} value={form.probability ?? 0} onChange={(e) => set('probability', Number(e.target.value))} style={inp} />
          </div>
          <div>
            <div style={fieldLabel}>Confidence</div>
            <select value={form.confidence} onChange={(e) => set('confidence', e.target.value as 'Low'|'Med'|'High')} style={inp}>
              <option value="Low">Low</option><option value="Med">Med</option><option value="High">High</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
          <button type="submit" disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Track'}</button>
        </div>
      </form>
    </div>
  )
}

function EditCompetitorContractModal({ contract, competitors, onClose, onSaved, onDeleted, onToast }: {
  contract: CompetitorContractDto; competitors: CompetitorDto[]
  onClose: () => void; onSaved: () => void; onDeleted: () => void; onToast: (m: string) => void
}) {
  const [form, setForm] = useState<UpdateCompetitorContractDto>({
    competitorId: contract.competitorId,
    customerName: contract.customerName,
    service: contract.service,
    endDate: contract.endDate.slice(0, 10),
    status: contract.status,
    probability: contract.probability,
    dealValue: contract.dealValue,
    confidence: contract.confidence,
    notes: contract.notes ?? undefined,
  })
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof UpdateCompetitorContractDto>(k: K, v: UpdateCompetitorContractDto[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = { ...form, endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined }
      await api.updateCompetitorContract(contract.id, body)
      onSaved()
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!confirm('Delete this tracked contract?')) return
    try {
      await api.deleteCompetitorContract(contract.id)
      onDeleted()
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Delete failed')
    }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} style={{ ...dialog, maxWidth: 560, padding: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Edit tracked contract</div>
        <div style={{ fontSize: 11, color: '#8888A0', marginBottom: 14 }}>{contract.customerName} · {contract.competitorName}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={fieldLabel}>Competitor</div>
            <select value={form.competitorId} onChange={(e) => set('competitorId', e.target.value)} style={inp}>
              {competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Customer</div>
            <input value={form.customerName ?? ''} onChange={(e) => set('customerName', e.target.value)} style={inp} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={fieldLabel}>Service</div>
            <input value={form.service ?? ''} onChange={(e) => set('service', e.target.value)} style={inp} />
          </div>
          <div>
            <div style={fieldLabel}>Contract ends</div>
            <input type="date" value={(form.endDate ?? '').slice(0, 10)} onChange={(e) => set('endDate', e.target.value)} style={inp} />
          </div>
          <div>
            <div style={fieldLabel}>Status</div>
            <select value={form.status} onChange={(e) => set('status', e.target.value as CompetitorContractStatus)} style={inp}>
              {COMP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Deal value (฿)</div>
            <input type="number" min={0} value={form.dealValue ?? 0} onChange={(e) => set('dealValue', Number(e.target.value))} style={inp} />
          </div>
          <div>
            <div style={fieldLabel}>Probability we win</div>
            <input type="number" min={0} max={100} value={form.probability ?? 0} onChange={(e) => set('probability', Number(e.target.value))} style={inp} />
          </div>
          <div>
            <div style={fieldLabel}>Confidence</div>
            <select value={form.confidence} onChange={(e) => set('confidence', e.target.value as 'Low'|'Med'|'High')} style={inp}>
              <option value="Low">Low</option><option value="Med">Med</option><option value="High">High</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={fieldLabel}>Notes</div>
            <textarea rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} style={{ ...inp, resize: 'vertical' }} placeholder="Intel, decision maker, timing hints…" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={remove} style={{ ...btnGhost, color: '#C0392B', borderColor: '#F5C7C0' }}>Delete</button>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
          <button type="submit" disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

const selectSm: CSSProperties = { border: '1px solid #E5E7F0', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, background: '#fff', color: '#1E1E30', outline: 'none' }

// ─── styles ───
function subItemStyle(active: boolean): CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#2A6FDB' : '#5C5C74', background: active ? '#EEF0FA' : 'transparent' }
}
const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14 }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 15px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-block' }
const outlineBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', color: '#3B3B52', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-block' }
const miniBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: 'pointer', color: '#3B3B52' }
const navBtn: CSSProperties = { width: 28, height: 28, border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8888A0', fontSize: 14, cursor: 'pointer' }
// repoGrid moved to Contracts.css .contract-repo-grid for responsive column drops
const oblGrid: CSSProperties = { display: 'grid', gridTemplateColumns: '100px 180px 1.4fr 130px 130px 130px 110px 130px', gap: 10 }
const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const fieldLabel: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#5C5C74', marginBottom: 6 }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
