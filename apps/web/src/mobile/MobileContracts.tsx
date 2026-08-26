/**
 * Mobile Contracts — list + detail with approve/reject/submit actions.
 *
 * Field use case: legal/finance/exec approvers need to act on contracts
 * while off-desk. Sales reps see status + obligations for the deals they own.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ContractDto, ContractStatus } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'

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
const QUICK_STATUSES: ContractStatus[] = ['Pending Approval', 'Active', 'Expiring', 'Draft']

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'
const backBtn: CSSProperties = { fontSize: 14, color: '#2A6FDB', cursor: 'pointer' }
const primaryBtn: CSSProperties = { background: '#0E9C7E', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
const outlineBtn: CSSProperties = { background: '#fff', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
const submitBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '14px 16px' }
const label: CSSProperties = { fontSize: 11, color: '#8888A0', fontWeight: 700, letterSpacing: '.04em' }
const value: CSSProperties = { fontSize: 13.5, color: '#1E1E30', marginTop: 2 }
const sectionLabel: CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', color: '#8888A0', textTransform: 'uppercase', margin: '4px 0 6px' }

// ═══════════════════════════════════════════════════════════════════
// List
// ═══════════════════════════════════════════════════════════════════
export default function MobileContracts() {
  const [rows, setRows] = useState<ContractDto[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<ContractStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.contracts().then((r) => { setRows(r); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (term && !(
        c.no.toLowerCase().includes(term) ||
        c.customerName.toLowerCase().includes(term) ||
        c.type.toLowerCase().includes(term)
      )) return false
      return true
    })
  }, [rows, statusFilter, q])

  const pendingCount = rows.filter((c) => c.status === 'Pending Approval').length

  return (
    <div style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 19, fontWeight: 700 }}>Contracts</div>
        <div style={{ fontSize: 12, color: '#5C5C74' }}>{rows.length}</div>
      </div>

      {pendingCount > 0 && (
        <div onClick={() => setStatusFilter('Pending Approval')} style={{ ...card, background: '#FEF3E2', border: '1px solid #F0BA95', color: '#B4650A', cursor: 'pointer' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{pendingCount} contract{pendingCount === 1 ? '' : 's'} awaiting approval</div>
          <div style={{ fontSize: 11, marginTop: 3 }}>Tap to see the queue</div>
        </div>
      )}

      <input
        placeholder="Search contract # or customer…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ padding: '10px 12px', border: '1px solid #D0D0DF', borderRadius: 11, fontSize: 13.5, outline: 'none' }}
      />

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginRight: -16, paddingRight: 16 }}>
        <div onClick={() => setStatusFilter('all')} style={chip(statusFilter === 'all', '#3B3B52')}>All</div>
        {QUICK_STATUSES.map((s) => (
          <div key={s} onClick={() => setStatusFilter(s === statusFilter ? 'all' : s)} style={chip(statusFilter === s, STATUS_STYLE[s].fg)}>{s}</div>
        ))}
      </div>

      {loading && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {!loading && filtered.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No contracts match.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((c) => {
          const st = STATUS_STYLE[c.status]
          return (
            <div
              key={c.id}
              onClick={() => navigate(`/m/contracts/${c.id}`)}
              style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '12px 14px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#5C5C74' }}>{c.no}</div>
                <div style={{ flex: 1 }} />
                <span style={{ background: st.bg, color: st.fg, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>{c.status}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.customerName}</div>
              <div style={{ fontSize: 11.5, color: '#5C5C74', marginTop: 3, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{c.type}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, color: '#1E1E30' }}>{c.value ? fmt(c.value) : '—'}</span>
              </div>
              {c.serviceLines.length > 0 && (
                <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                  {c.serviceLines.map((s) => <span key={s} style={{ background: '#EEF0FA', color: '#2A6FDB', fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 5 }}>{s}</span>)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Detail
// ═══════════════════════════════════════════════════════════════════
export function MobileContractDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [c, setC] = useState<ContractDto | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('contract:write')

  const reload = useCallback(async () => {
    if (!id) return
    try { setC(await api.contract(id)) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
  }, [id, toast])
  useEffect(() => { void reload() }, [reload])

  if (!c) return <div style={{ padding: 16, color: '#8888A0' }}>Loading…</div>

  const currentApproval = c.approvals.find((a) => a.decision === 'pending' && a.step === c.approvalStep)
  const stepPerm = currentApproval && ({
    Legal:     'contract:approve:legal',
    Finance:   'contract:approve:finance',
    Executive: 'contract:approve:executive',
    Sign:      undefined,
  } as Record<string, string | undefined>)[currentApproval.stepName]
  const canActOnStep = c.status === 'Pending Approval' && currentApproval && (
    !stepPerm ? (hasPermission('contract:approve:legal') || hasPermission('contract:approve:finance') || hasPermission('contract:approve:executive'))
              : hasPermission(stepPerm)
  )

  const submit = async () => { if (busy) return; setBusy(true); try { const u = await api.submitContract(c.id); setC(u); toast('Submitted for approval') } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') } finally { setBusy(false) } }
  const approve = async () => { if (busy) return; setBusy(true); try { const u = await api.approveContract(c.id); setC(u); toast('Approved') } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') } finally { setBusy(false) } }
  const reject = async () => {
    const comment = window.prompt('Reason for rejection?')
    if (!comment) return
    setBusy(true)
    try { const u = await api.rejectContract(c.id, comment); setC(u); toast('Rejected') }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  const st = STATUS_STYLE[c.status]

  return (
    <div style={{ padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'sticky', top: 0, background: '#F4F6F1', paddingBottom: 8, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <div onClick={() => navigate(-1)} style={backBtn}>‹ Back</div>
          <div style={{ flex: 1, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, textAlign: 'center' }}>{c.no}</div>
          <span style={{ background: st.bg, color: st.fg, fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999, minWidth: 44, textAlign: 'center' }}>{c.status}</span>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{c.name ?? c.type}</div>
        <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 3 }}>{c.customerName}</div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><div style={label}>Type</div><div style={value}>{c.type}</div></div>
          <div><div style={label}>Value</div><div style={value}>{c.value ? '฿' + c.value.toLocaleString() : '—'}</div></div>
          <div><div style={label}>Period</div><div style={value}>{c.startDate ? new Date(c.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'} → {c.endDate ? new Date(c.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</div></div>
          <div><div style={label}>Days left</div><div style={value}>{c.daysLeft != null ? `${c.daysLeft}d` : '—'}</div></div>
          <div><div style={label}>Owner</div><div style={value}>{c.ownerName}</div></div>
          <div><div style={label}>Risk</div><div style={value}>{c.risk}</div></div>
        </div>
        {c.serviceLines.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {c.serviceLines.map((s) => <span key={s} style={{ background: '#EEF0FA', color: '#2A6FDB', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{s}</span>)}
          </div>
        )}
      </div>

      {/* Approval actions */}
      {c.status === 'Draft' && canWrite && (
        <div onClick={submit} style={{ ...submitBtn, textAlign: 'center' }}>Submit for approval</div>
      )}
      {c.status === 'Pending Approval' && currentApproval && (
        <div style={{ ...card, background: canActOnStep ? '#FEF3E2' : '#F7F8FC', border: `1px solid ${canActOnStep ? '#F0BA95' : '#E5E7F0'}` }}>
          <div style={{ fontSize: 12, color: '#5C5C74' }}>Awaiting <b style={{ color: canActOnStep ? '#B4650A' : '#3B3B52' }}>{currentApproval.stepName}</b> approval</div>
          {canActOnStep && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <div onClick={approve} style={{ ...primaryBtn, flex: 1, textAlign: 'center', opacity: busy ? 0.6 : 1 }}>Approve</div>
              <div onClick={reject} style={{ ...outlineBtn, flex: 1, textAlign: 'center', opacity: busy ? 0.6 : 1 }}>Reject</div>
            </div>
          )}
          {!canActOnStep && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#8888A0' }}>You do not have permission for this step.</div>
          )}
        </div>
      )}

      {/* Approval flow tracker */}
      <div style={card}>
        <div style={sectionLabel}>Approval flow</div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {c.approvals.map((a, i, arr) => (
            <div key={a.id} style={{ display: 'contents' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: a.decision === 'approved' ? '#0E9C7E' : a.decision === 'rejected' ? '#C0392B' : c.approvalStep === a.step ? '#fff' : '#F2F3F9',
                  color: a.decision === 'approved' || a.decision === 'rejected' ? '#fff' : c.approvalStep === a.step ? '#B4650A' : '#8888A0',
                  border: c.approvalStep === a.step && a.decision === 'pending' ? '2px solid #B4650A' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800,
                }}>{a.decision === 'approved' ? '✓' : a.decision === 'rejected' ? '×' : a.step}</div>
                <span style={{ fontSize: 9.5, color: '#5C5C74', fontWeight: 600 }}>{a.stepName}</span>
              </div>
              {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: a.decision === 'approved' ? '#0E9C7E' : '#E5E7F0', margin: '11px 4px 0' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Obligations */}
      {c.obligations.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>Obligations ({c.obligations.length})</div>
          {c.obligations.map((o) => {
            const overdue = new Date(o.dueDate).getTime() < Date.now() && o.status !== 'completed'
            return (
              <div key={o.id} style={{ padding: '7px 0', borderTop: '1px solid #F1F1F5', display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{o.title}</div>
                  <div style={{ fontSize: 11, color: '#5C5C74' }}>{o.kind} · due {new Date(o.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
                </div>
                <span style={{ background: o.status === 'completed' ? '#E5F8ED' : overdue ? '#FDECEA' : '#F1F1F5', color: o.status === 'completed' ? '#0E6E4E' : overdue ? '#C0392B' : '#5C5C74', fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 6, textTransform: 'uppercase', alignSelf: 'flex-start' }}>{overdue ? 'overdue' : o.status}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Versions */}
      {c.versions.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>Versions ({c.versions.length})</div>
          {c.versions.slice(0, 6).map((v) => (
            <div key={v.id} style={{ padding: '6px 0', borderTop: '1px solid #F1F1F5', display: 'flex', gap: 8, fontSize: 12 }}>
              <span style={{ background: '#EEF0FA', color: '#2A6FDB', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5 }}>v{v.versionNo}</span>
              <span style={{ color: '#5C5C74' }}>{new Date(v.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const chip = (on: boolean, color: string): CSSProperties => ({
  cursor: 'pointer', flex: 'none',
  border: `1px solid ${on ? color : '#E5E7F0'}`,
  background: on ? color + '15' : '#fff',
  color: on ? color : '#5C5C74',
  borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700,
})
