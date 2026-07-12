import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import type {
  CompetitorContractDto, CompetitorContractStatus, CompetitorDto,
  ContractDashboardDto, ContractDto, ContractStatus, ContractTemplateDto,
  CreateCompetitorContractDto, CreateCompetitorDto, CustomerDto, ObligationDto,
  UpdateCompetitorContractDto,
} from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { icons } from '../lib/icons'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

type Sub = 'dashboard' | 'repository' | 'calendar' | 'approvals' | 'obligations' | 'competitors'
const SUB_DEFS: { id: Sub; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: icons.home },
  { id: 'repository', label: 'Repository', icon: icons.contract },
  { id: 'calendar', label: 'Calendar', icon: icons.cal },
  { id: 'approvals', label: 'Approvals', icon: icons.check },
  { id: 'obligations', label: 'Obligations', icon: icons.target },
  { id: 'competitors', label: 'Competitor Tracker', icon: icons.versus },
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

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'

export default function Contracts() {
  const [sub, setSub] = useState<Sub>('dashboard')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newFromTemplate, setNewFromTemplate] = useState(false)
  const toast = useToast()

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
        <div style={{ padding: '22px 24px' }}>
          {sub === 'dashboard' && <DashboardTab onOpenContract={(id) => { setSelectedId(id); setSub('repository') }} />}
          {sub === 'repository' && <RepositoryTab selectedId={selectedId} onSelect={setSelectedId} onNewFromTemplate={() => setNewFromTemplate(true)} onToast={toast} />}
          {sub === 'calendar' && <CalendarTab />}
          {sub === 'approvals' && <ApprovalsTab onToast={toast} />}
          {sub === 'obligations' && <ObligationsTab onToast={toast} />}
          {sub === 'competitors' && <CompetitorTrackerTab onToast={toast} />}
        </div>
      </div>

      {newFromTemplate && <NewFromTemplateModal onClose={() => setNewFromTemplate(false)} onCreated={(id) => { setNewFromTemplate(false); setSub('repository'); setSelectedId(id) }} />}
    </div>
  )
}

// ─── Dashboard ───
function DashboardTab({ onOpenContract }: { onOpenContract: (id: string) => void }) {
  const [data, setData] = useState<ContractDashboardDto | null>(null)
  const toast = useToast()

  useEffect(() => { api.contractDashboard().then(setData).catch((e) => toast(e instanceof ApiError ? e.message : 'Failed')) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  if (!data) return <div style={{ color: '#8888A0' }}>Loading…</div>

  const kpis = [
    { l: 'Total value', v: fmt(data.totalValue), sub: `${data.totalCount} contracts`, g: 'linear-gradient(135deg,#2E6BE6,#1B2F8F)' },
    { l: 'Active', v: String(data.activeCount), sub: 'In force', g: 'linear-gradient(135deg,#22C9B4,#0E9C7E)' },
    { l: 'Expiring', v: String(data.expiringCount), sub: '≤ 60 days', g: 'linear-gradient(135deg,#FFB047,#F5641E)' },
    { l: 'Pending', v: String(data.pendingCount), sub: `Avg ${data.avgApprovalDays}d approval`, g: 'linear-gradient(135deg,#8A5CF6,#5B2C9E)' },
  ]

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div key={k.l} style={{ borderRadius: 14, padding: '15px 17px', background: k.g, color: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.95 }}>{k.l}</div>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 27, fontWeight: 700, marginTop: 7, lineHeight: 1 }}>{k.v}</div>
            <div style={{ fontSize: 11, opacity: 0.9, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Contracts by status</div>
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden' }}>
          {data.byStatus.filter((s) => s.count > 0).map((s, i) => {
            const style = STATUS_STYLE[s.status]
            return (
              <div key={s.status} style={{ flex: 1, background: style.bg, color: style.fg, padding: '16px 18px', borderRight: i < data.byStatus.length - 1 ? '1px solid #fff' : undefined }}>
                <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>{s.status}</div>
                <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 700, marginTop: 4 }}>{s.count}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #F2F3F9', fontSize: 13, fontWeight: 700 }}>Upcoming obligations</div>
        {data.upcomingObligations.map((o) => {
          const overdue = new Date(o.dueDate).getTime() < Date.now()
          return (
            <div key={o.id} onClick={() => onOpenContract(o.contractId)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid #F2F3F9', cursor: 'pointer' }}>
              <div style={{ width: 4, borderRadius: 3, background: KIND_COLOR[o.kind] ?? '#5C5C74', alignSelf: 'stretch' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title}</div>
                <div style={{ fontSize: 11, color: '#8888A0' }}>{o.kind} · {o.contractNo}</div>
              </div>
              <div style={{ fontSize: 11.5, color: overdue ? '#C0392B' : '#5C5C74', fontWeight: overdue ? 700 : 500 }}>
                {new Date(o.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                {overdue && ' — overdue'}
              </div>
            </div>
          )
        })}
        {data.upcomingObligations.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No upcoming obligations.</div>}
      </div>
    </>
  )
}

// ─── Repository ───
function RepositoryTab({ selectedId, onSelect, onNewFromTemplate: _onNewFromTemplate, onToast }: { selectedId: string | null; onSelect: (id: string) => void; onNewFromTemplate: () => void; onToast: (m: string) => void }) {
  const [rows, setRows] = useState<ContractDto[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    try { setRows(await api.contracts(filter && filter !== 'All' ? { status: filter } : {})) }
    catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter])

  const filters = ['All', 'Draft', 'Pending Approval', 'Active', 'Expiring', 'Signed']
  const selected = rows.find((r) => r.id === selectedId)

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {filters.map((f) => (
          <div key={f} onClick={() => setFilter(f)} style={{ border: `1px solid ${filter === f ? '#2A6FDB' : '#E5E7F0'}`, background: filter === f ? '#2A6FDB' : '#fff', color: filter === f ? '#fff' : '#5C5C74', borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{f}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 460px' : '1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ ...repoGrid, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8888A0' }}>
            <div>Contract #</div><div>Party</div><div>Type</div><div style={{ textAlign: 'right' }}>Value</div><div>Status</div><div style={{ textAlign: 'right' }}>Risk</div>
          </div>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
          {!loading && rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No contracts.</div>}
          {rows.map((c) => {
            const s = STATUS_STYLE[c.status]
            const r = RISK_STYLE[c.risk]
            return (
              <div key={c.id} onClick={() => onSelect(c.id)} style={{ ...repoGrid, padding: '13px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', cursor: 'pointer', background: selectedId === c.id ? '#F7F8FC' : 'transparent' }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 500 }}>{c.no}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.customerName}</div>
                  <div style={{ fontSize: 11, color: '#8888A0' }}>{c.startDate ? new Date(c.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} → {c.endDate ? new Date(c.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                </div>
                <div style={{ fontSize: 11.5, color: '#5C5C74' }}>{c.type}</div>
                <div style={{ textAlign: 'right', fontFamily: "'Space Grotesk'", fontSize: 12.5, fontWeight: 600 }}>{c.value ? fmt(c.value) : '—'}</div>
                <div><span style={{ background: s.bg, color: s.fg, borderRadius: 7, fontSize: 11, fontWeight: 700, padding: '3px 9px', whiteSpace: 'nowrap' }}>{c.status}</span></div>
                <div style={{ textAlign: 'right' }}><span style={{ background: r.bg, color: r.fg, borderRadius: 7, fontSize: 11, fontWeight: 700, padding: '3px 9px' }}>{c.risk}</span></div>
              </div>
            )
          })}
        </div>

        {selected && <ContractDetailPanel contract={selected} onClose={() => onSelect('')} onReload={reload} onToast={onToast} />}
      </div>
    </>
  )
}

function ContractDetailPanel({ contract, onClose, onReload, onToast }: { contract: ContractDto; onClose: () => void; onReload: () => void; onToast: (m: string) => void }) {
  const cv = contract.currentVersion
  const currentApproval = contract.approvals.find((a) => a.decision === 'pending' && a.step === contract.approvalStep)
  const { hasPermission } = useAuth()

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

  return (
    <div style={{ ...card, overflow: 'hidden', position: 'sticky', top: 20 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #F2F3F9', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 700, flex: 1 }}>{contract.no}</div>
        <div onClick={onClose} style={{ cursor: 'pointer', color: '#8888A0', fontSize: 18 }}>×</div>
      </div>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{cv?.title ?? contract.type}</div>
        <div><b style={{ color: '#8888A0' }}>Customer:</b> {contract.customerName}</div>
        <div><b style={{ color: '#8888A0' }}>Owner:</b> {contract.ownerName}</div>
        <div><b style={{ color: '#8888A0' }}>Value:</b> {contract.value ? '฿' + contract.value.toLocaleString('en-US') : '—'}</div>
        <div><b style={{ color: '#8888A0' }}>Period:</b> {contract.startDate ? new Date(contract.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} → {contract.endDate ? new Date(contract.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} {contract.daysLeft != null && <span style={{ color: contract.daysLeft <= 30 ? '#C0392B' : contract.daysLeft <= 90 ? '#B4650A' : '#5C5C74' }}>({contract.daysLeft} days left)</span>}</div>
        <div><b style={{ color: '#8888A0' }}>Auto-renew:</b> {contract.autoRenew ? 'yes' : 'no'}</div>

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
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase', marginBottom: 6 }}>Obligations ({contract.obligations.length})</div>
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
      </div>
    </div>
  )
}

// ─── Calendar ───
function CalendarTab() {
  const [obligations, setObligations] = useState<ObligationDto[]>([])
  const [monthStart, setMonthStart] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const toast = useToast()

  const monthEnd = useMemo(() => { const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); return d }, [monthStart])

  useEffect(() => {
    api.obligations({ from: monthStart, to: monthEnd })
      .then(setObligations)
      .catch((e) => toast(e instanceof ApiError ? e.message : 'Failed'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart])

  const dayCount = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const leadEmpty = monthStart.getDay() // Sunday-first
  const cells: Array<null | { d: number; kinds: string[] }> = []
  for (let i = 0; i < leadEmpty; i++) cells.push(null)
  for (let d = 1; d <= dayCount; d++) {
    const items = obligations.filter((o) => new Date(o.dueDate).getDate() === d)
    cells.push({ d, kinds: items.map((i) => i.kind) })
  }
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  const shift = (dir: number) => { const d = new Date(monthStart); d.setMonth(d.getMonth() + dir); setMonthStart(d) }

  return (
    <>
      <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        {Object.entries(KIND_COLOR).map(([k, c]) => (
          <span key={k} style={{ fontSize: 11, color: '#5C5C74' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c, marginRight: 5 }} />{k}
          </span>
        ))}
      </div>

      <div style={{ ...card, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 600, flex: 1 }}>{monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div onClick={() => shift(-1)} style={navBtn}>‹</div>
            <div onClick={() => shift(1)} style={navBtn}>›</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #F2F3F9', padding: '8px 0' }}>
          {dayNames.map((d) => <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: '#8888A0' }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {cells.map((cell, i) => (
            <div key={i} style={{ padding: '5px 0', textAlign: 'center', minHeight: 46 }}>
              {cell && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#3B3B52' }}>{cell.d}</div>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center', height: 6, marginTop: 2 }}>
                    {cell.kinds.slice(0, 3).map((k, j) => <div key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: KIND_COLOR[k] ?? '#5C5C74' }} />)}
                  </div>
                </>
              )}
            </div>
          ))}
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
function ApprovalsTab({ onToast }: { onToast: (m: string) => void }) {
  const [rows, setRows] = useState<ContractDto[]>([])
  const reload = async () => { try { setRows(await api.contracts({ status: 'Pending Approval' })) } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

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

// ─── Obligations tab (full table) ───
function ObligationsTab({ onToast }: { onToast: (m: string) => void }) {
  const [rows, setRows] = useState<ObligationDto[]>([])
  const reload = async () => { try { setRows(await api.obligations()) } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  const { hasPermission } = useAuth()

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ ...oblGrid, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8888A0' }}>
        <div>Type</div><div>Title</div><div>Contract</div><div>Due date</div><div>Amount</div><div>Status</div><div />
      </div>
      {rows.map((o) => {
        const overdue = new Date(o.dueDate).getTime() < Date.now() && o.status !== 'completed'
        return (
          <div key={o.id} style={{ ...oblGrid, padding: '12px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center' }}>
            <div><span style={{ background: (KIND_COLOR[o.kind] ?? '#5C5C74') + '1A', color: KIND_COLOR[o.kind] ?? '#5C5C74', borderRadius: 7, fontSize: 11, fontWeight: 700, padding: '3px 9px' }}>{o.kind}</span></div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{o.title}</div>
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
function NewFromTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [templates, setTemplates] = useState<ContractTemplateDto[]>([])
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [templateId, setTemplateId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [value, setValue] = useState<number>(0)
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10) })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.contractTemplates().then(setTemplates).catch(() => setTemplates([]))
    api.customers().then(setCustomers).catch(() => setCustomers([]))
  }, [])

  const template = templates.find((t) => t.id === templateId)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      const created = await api.createContractFromTemplate({
        templateId, customerId,
        value: value || undefined,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      })
      onCreated(created.id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create')
    } finally { setBusy(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={{ ...dialog, maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, flex: 1 }}>New contract from template</div>
            <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0' }}>×</div>
          </div>
          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={fieldLabel}>Template</div>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required style={inp}>
                <option value="">— select —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={fieldLabel}>Customer</div>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required style={inp}>
                <option value="">— select —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </label>
            <label>
              <div style={fieldLabel}>Value (฿)</div>
              <input type="number" min={0} value={value} onChange={(e) => setValue(Number(e.target.value))} style={inp} />
            </label>
            <label>
              <div style={fieldLabel}>Start date</div>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={inp} />
            </label>
            <label>
              <div style={fieldLabel}>End date</div>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required style={inp} />
            </label>
            {template && template.variables.length > 0 && (
              <div style={{ gridColumn: 'span 2', background: '#F4F1FD', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#4A3AB8' }}>
                <b>Template variables auto-filled:</b> {template.variables.join(', ')}
                <br /><span style={{ color: '#5C5C74' }}>Customer name, address, tax ID, dates, and value will be substituted.</span>
              </div>
            )}
          </div>
          {error && <div style={{ margin: '0 22px 12px', background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>{error}</div>}
          <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
            <button type="submit" disabled={busy || !templateId || !customerId} style={{ ...btnPrimary, opacity: busy || !templateId || !customerId ? 0.5 : 1 }}>{busy ? 'Creating…' : 'Create contract'}</button>
          </div>
        </form>
      </div>
    </div>
  )
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
const compGrid: CSSProperties = { display: 'grid', gridTemplateColumns: '1.5fr 150px 1fr 110px 130px 100px 120px 80px 80px', gap: 10, alignItems: 'center' }

function CompetitorTrackerTab({ onToast }: { onToast: (m: string) => void }) {
  const [competitors, setCompetitors] = useState<CompetitorDto[]>([])
  const [contracts, setContracts] = useState<CompetitorContractDto[]>([])
  const [compFilter, setCompFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)
  const [addCompOpen, setAddCompOpen] = useState(false)
  const [editing, setEditing] = useState<CompetitorContractDto | null>(null)

  const refresh = async () => {
    try {
      const [cs, cn] = await Promise.all([api.competitors(), api.competitorContracts()])
      setCompetitors(cs)
      setContracts(cn)
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Failed to load competitor data')
    } finally { setLoading(false) }
  }
  useEffect(() => { refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const filtered = useMemo(() => contracts.filter((c) => {
    if (compFilter !== 'all' && c.competitorId !== compFilter) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    return true
  }), [contracts, compFilter, statusFilter])

  const totals = useMemo(() => {
    const totalDeals = filtered.reduce((s, c) => s + c.dealValue, 0)
    const weighted = filtered.reduce((s, c) => s + c.dealValue * (c.probability / 100), 0)
    return { count: filtered.length, totalDeals, weighted }
  }, [filtered])

  if (loading) return <div style={{ color: '#8888A0' }}>Loading…</div>

  return (
    <>
      {/* Competitor summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(competitors.length, 1)},1fr)`, gap: 12, marginBottom: 16 }}>
        {competitors.map((c) => (
          <div key={c.id} onClick={() => setCompFilter(compFilter === c.id ? 'all' : c.id)} style={{ ...card, padding: '14px 16px', cursor: 'pointer', outline: compFilter === c.id ? `2px solid ${c.color}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: c.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flex: 'none' }}>{c.logo}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: '#8888A0', marginTop: 1 }}>{c.metrics.activeContracts} contracts tracked</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 12 }}>
              <MetricCell label="Expiring 90d" value={String(c.metrics.expiringIn90Days)} tone={c.metrics.expiringIn90Days > 0 ? 'warn' : 'muted'} />
              <MetricCell label="In neg." value={String(c.metrics.inNegotiationVsUs)} tone="ok" />
              <MetricCell label="Auto renew" value={String(c.metrics.renewedByThem)} tone={c.metrics.renewedByThem > 0 ? 'bad' : 'muted'} />
              <MetricCell label="Pool value" value={fmt(c.metrics.totalDealValue)} tone="muted" />
            </div>
          </div>
        ))}
      </div>

      {/* Filters + Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={compFilter} onChange={(e) => setCompFilter(e.target.value)} style={selectSm}>
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
        <div onClick={() => setAddCompOpen(true)} style={outlineBtn}>+ Competitor</div>
        <div onClick={() => setNewOpen(true)} style={primaryBtn}>+ Track contract</div>
      </div>

      {/* Contract table */}
      <div style={{ ...card, padding: '14px 16px' }}>
        <div style={{ ...compGrid, fontSize: 11, fontWeight: 700, color: '#8888A0', textTransform: 'uppercase', letterSpacing: '.06em', paddingBottom: 8, borderBottom: '1px solid #E5E7F0' }}>
          <div>Customer</div><div>Held by</div><div>Service</div><div>Ends</div><div>Status</div><div>Prob</div><div>Value</div><div>Conf</div><div>Owner</div>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No competitor contracts match this filter.</div>
        )}
        {filtered.map((c) => {
          const days = c.daysUntilEnd
          const dayColor = days < 0 ? '#C0392B' : days <= 30 ? '#D2601A' : days <= 90 ? '#B4650A' : '#5C5C74'
          return (
            <div key={c.id} onClick={() => setEditing(c)} style={{ ...compGrid, padding: '11px 0', borderBottom: '1px solid #F1F1F5', fontSize: 12.5, cursor: 'pointer' }}>
              <div style={{ fontWeight: 700, color: '#1E1E30' }}>{c.customerName}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: c.competitorColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800 }}>{c.competitorLogo}</div>
                <div style={{ color: '#5C5C74' }}>{c.competitorName}</div>
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

      {newOpen && (
        <NewCompetitorContractModal
          competitors={competitors}
          onClose={() => setNewOpen(false)}
          onCreated={() => { setNewOpen(false); onToast('Competitor contract tracked'); refresh() }}
          onToast={onToast}
        />
      )}
      {addCompOpen && (
        <NewCompetitorModal
          onClose={() => setAddCompOpen(false)}
          onCreated={() => { setAddCompOpen(false); onToast('Competitor added'); refresh() }}
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
    </>
  )
}

function MetricCell({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }) {
  const c = tone === 'ok' ? '#0E9C7E' : tone === 'warn' ? '#B4650A' : tone === 'bad' ? '#C0392B' : '#5C5C74'
  return (
    <div>
      <div style={{ fontSize: 10, color: '#8888A0', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 700, color: c }}>{value}</div>
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

function NewCompetitorModal({ onClose, onCreated, onToast }: { onClose: () => void; onCreated: () => void; onToast: (m: string) => void }) {
  const [name, setName] = useState('')
  const [logo, setLogo] = useState('')
  const [color, setColor] = useState('#2A6FDB')
  const [saving, setSaving] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const body: CreateCompetitorDto = { name: name.trim(), logo: logo.trim() || undefined, color }
      await api.createCompetitor(body)
      onCreated()
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} style={{ ...dialog, maxWidth: 440, padding: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Add competitor</div>
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
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
          <button type="submit" disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Add'}</button>
        </div>
      </form>
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
const repoGrid: CSSProperties = { display: 'grid', gridTemplateColumns: '135px 1.5fr 150px 100px 130px 90px', gap: 10 }
const oblGrid: CSSProperties = { display: 'grid', gridTemplateColumns: '110px 1.6fr 130px 130px 130px 110px 130px', gap: 10 }
const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const fieldLabel: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#5C5C74', marginBottom: 6 }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
