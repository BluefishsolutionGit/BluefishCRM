/**
 * Mobile Quotations — list + detail with PDF preview, approve/reject/send.
 *
 * Field flow:
 *  - Sales rep can see their quotes, open PDF, tap Send to email the customer
 *  - Sales manager / finance can Approve / Reject from the phone
 *  - Anyone with the link can view detail (server enforces scope + permissions)
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { QuotationApprovalDto, QuotationDto, QuotationStatus } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { Sheet } from './MobileDetails'

const STATUS_STYLE: Record<QuotationStatus, { bg: string; fg: string }> = {
  Draft:              { bg: '#F2F3F9', fg: '#5C5C74' },
  'Pending Approval': { bg: '#F7EBD9', fg: '#B4650A' },
  Approved:           { bg: '#E4EDFC', fg: '#2A6FDB' },
  Sent:               { bg: '#E7EDF9', fg: '#1F5AC2' },
  Accepted:           { bg: '#E5F8ED', fg: '#0E6E4E' },
  Rejected:           { bg: '#FDECEA', fg: '#C0392B' },
  Expired:            { bg: '#ECECF1', fg: '#6B6B7B' },
}
const QUICK_STATUSES: QuotationStatus[] = ['Draft', 'Pending Approval', 'Approved', 'Sent']

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'
const backBtn: CSSProperties = { fontSize: 14, color: '#2A6FDB', cursor: 'pointer' }
const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '14px 16px' }
const primaryBtn: CSSProperties = { background: '#0E9C7E', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
const outlineBtn: CSSProperties = { background: '#fff', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
const submitBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
const label: CSSProperties = { fontSize: 11, color: '#8888A0', fontWeight: 700, letterSpacing: '.04em' }
const value: CSSProperties = { fontSize: 13.5, color: '#1E1E30', marginTop: 2 }
const sectionLabel: CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', color: '#8888A0', textTransform: 'uppercase', margin: '4px 0 6px' }
const inp: CSSProperties = { width: '100%', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }

// ═══════════════════════════════════════════════════════════════════════
// List
// ═══════════════════════════════════════════════════════════════════════
export default function MobileQuotations() {
  const [rows, setRows] = useState<QuotationDto[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.quotations().then((r) => { setRows(r); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (term && !(
        r.no.toLowerCase().includes(term) ||
        r.customerName.toLowerCase().includes(term) ||
        (r.opportunityTitle ?? '').toLowerCase().includes(term)
      )) return false
      return true
    })
  }, [rows, statusFilter, q])

  const pendingCount = rows.filter((r) => r.status === 'Pending Approval').length

  return (
    <div style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 19, fontWeight: 700 }}>Quotations</div>
        <div style={{ fontSize: 12, color: '#5C5C74' }}>{rows.length}</div>
      </div>

      {pendingCount > 0 && (
        <div onClick={() => setStatusFilter('Pending Approval')} style={{ ...card, background: '#FEF3E2', border: '1px solid #F0BA95', color: '#B4650A', cursor: 'pointer' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{pendingCount} quotation{pendingCount === 1 ? '' : 's'} awaiting approval</div>
          <div style={{ fontSize: 11, marginTop: 3 }}>Tap to see the queue</div>
        </div>
      )}

      <input
        placeholder="Search Q-number, customer, deal…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ ...inp, padding: '10px 12px' }}
      />

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginRight: -16, paddingRight: 16 }}>
        <div onClick={() => setStatusFilter('all')} style={chip(statusFilter === 'all', '#3B3B52')}>All</div>
        {QUICK_STATUSES.map((s) => (
          <div key={s} onClick={() => setStatusFilter(s === statusFilter ? 'all' : s)} style={chip(statusFilter === s, STATUS_STYLE[s].fg)}>{s}</div>
        ))}
      </div>

      {loading && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {!loading && filtered.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No quotations match.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((qt) => {
          const st = STATUS_STYLE[qt.status]
          const total = qt.currentVersion?.grandTotal ?? 0
          return (
            <div
              key={qt.id}
              onClick={() => navigate(`/m/quotations/${qt.id}`)}
              style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '12px 14px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#5C5C74' }}>{qt.no}</div>
                <div style={{ flex: 1 }} />
                <span style={{ background: st.bg, color: st.fg, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>{qt.status}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{qt.customerName}</div>
              {qt.opportunityTitle && <div style={{ fontSize: 11.5, color: '#5C5C74', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{qt.opportunityTitle}</div>}
              <div style={{ display: 'flex', marginTop: 4, alignItems: 'center' }}>
                <div style={{ fontSize: 10.5, color: '#8888A0' }}>{qt.ownerName}</div>
                <div style={{ flex: 1 }} />
                <div style={{ fontFamily: "'Space Grotesk'", fontSize: 13, fontWeight: 700 }}>{total ? fmt(total) : '—'}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Detail
// ═══════════════════════════════════════════════════════════════════════
export function MobileQuotationDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canApprove = hasPermission('quotation:approve')
  const canWrite = hasPermission('quotation:write')
  const [qt, setQt] = useState<QuotationDto | null>(null)
  const [busy, setBusy] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)

  const reload = useCallback(async () => {
    if (!id) return
    try { setQt(await api.quotation(id)) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
  }, [id, toast])
  useEffect(() => { void reload() }, [reload])

  if (!qt) return <div style={{ padding: 16, color: '#8888A0' }}>Loading…</div>

  const st = STATUS_STYLE[qt.status]
  const cv = qt.currentVersion
  const currentApproval = qt.approvals.find((a) => a.decision === 'pending' && a.step === qt.approvalStep)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try { setQt(await api.submitQuotation(qt.id)); toast('Submitted') }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  const approve = async () => {
    if (busy) return
    setBusy(true)
    try { setQt(await api.approveQuotation(qt.id)); toast('Approved') }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  const reject = async () => {
    const comment = window.prompt('Reason for rejection?')
    if (!comment) return
    setBusy(true)
    try { setQt(await api.rejectQuotation(qt.id, comment)); toast('Rejected') }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'sticky', top: 0, background: '#F4F6F1', paddingBottom: 8, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <div onClick={() => navigate(-1)} style={backBtn}>‹ Back</div>
          <div style={{ flex: 1, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, textAlign: 'center' }}>{qt.no}</div>
          <span style={{ background: st.bg, color: st.fg, fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999, minWidth: 44, textAlign: 'center' }}>{qt.status}</span>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{qt.customerName}</div>
        {qt.opportunityTitle && <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 3 }}>{qt.opportunityTitle}</div>}

        {cv && (
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><div style={label}>Version</div><div style={value}>v{cv.versionNo}</div></div>
            <div><div style={label}>Grand total</div><div style={value}>฿{cv.grandTotal.toLocaleString()}</div></div>
            <div><div style={label}>VAT ({cv.vatPct}%)</div><div style={value}>฿{cv.vatAmt.toLocaleString()}</div></div>
            <div><div style={label}>Owner</div><div style={value}>{qt.ownerName}</div></div>
          </div>
        )}
        {qt.sentAt && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: '#0E6E4E' }}>Sent {new Date(qt.sentAt).toLocaleString('en-GB')}</div>
        )}
      </div>

      {/* Primary actions row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div onClick={() => setPdfOpen(true)} style={{ ...submitBtn, flex: 1, textAlign: 'center' }}>👁 View PDF</div>
        <a href={api.quotationPdfUrl(qt.id)} target="_blank" rel="noopener noreferrer" style={{ ...submitBtn, background: '#3B3B52', flex: 1, textAlign: 'center', textDecoration: 'none' }}>↓ PDF</a>
      </div>

      {/* Approval flow tracker */}
      {qt.approvals.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>Approval flow</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {qt.approvals.map((a, i, arr) => (
              <div key={a.id} style={{ display: 'contents' }}>
                <ApprovalDot approval={a} isCurrent={qt.approvalStep === a.step} />
                {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: a.decision === 'approved' ? '#0E9C7E' : '#E5E7F0', margin: '11px 4px 0' }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons based on status/permission */}
      {qt.status === 'Draft' && canWrite && (
        <div onClick={submit} style={{ ...submitBtn, textAlign: 'center', opacity: busy ? 0.6 : 1 }}>Submit for approval</div>
      )}
      {qt.status === 'Pending Approval' && currentApproval && canApprove && (
        <div style={{ ...card, background: '#FEF3E2', border: '1px solid #F0BA95' }}>
          <div style={{ fontSize: 12, color: '#B4650A' }}>Awaiting <b>{currentApproval.stepName}</b> approval</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <div onClick={approve} style={{ ...primaryBtn, flex: 1, textAlign: 'center', opacity: busy ? 0.6 : 1 }}>Approve</div>
            <div onClick={reject} style={{ ...outlineBtn, flex: 1, textAlign: 'center', opacity: busy ? 0.6 : 1 }}>Reject</div>
          </div>
        </div>
      )}
      {qt.status === 'Pending Approval' && currentApproval && !canApprove && (
        <div style={{ ...card, color: '#8888A0', fontSize: 12 }}>Awaiting <b style={{ color: '#3B3B52' }}>{currentApproval.stepName}</b> approval — you don't have permission for this step.</div>
      )}
      {(qt.status === 'Approved' || qt.status === 'Sent') && canWrite && (
        <div onClick={() => setSendOpen(true)} style={{ ...submitBtn, textAlign: 'center' }}>{qt.sentAt ? 'Resend to customer' : 'Send to customer'}</div>
      )}

      {/* Line items */}
      {cv && cv.lines.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>Items ({cv.lines.length})</div>
          {cv.lines.map((ln) => (
            <div key={ln.id} style={{ padding: '8px 0', borderTop: '1px solid #F1F1F5' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{ln.itemName}</div>
                  {ln.description && <div style={{ fontSize: 11, color: '#8888A0', marginTop: 2 }}>{ln.description}</div>}
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div style={{ fontFamily: "'Space Grotesk'", fontSize: 12.5, fontWeight: 700 }}>฿{ln.amount.toLocaleString()}</div>
                  <div style={{ fontSize: 10.5, color: '#8888A0' }}>{ln.quantity} × ฿{ln.unitPrice.toLocaleString()}{ln.discountPct > 0 ? ` −${ln.discountPct}%` : ''}</div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', marginTop: 10, paddingTop: 10, borderTop: '2px solid #F1F1F5' }}>
            <div style={{ flex: 1, fontSize: 12.5, color: '#5C5C74' }}>Grand total</div>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 800 }}>฿{cv.grandTotal.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Terms + notes */}
      {cv?.terms && (
        <div style={card}>
          <div style={sectionLabel}>Terms</div>
          <div style={{ fontSize: 12, color: '#3B3B52', whiteSpace: 'pre-wrap' }}>{cv.terms}</div>
        </div>
      )}
      {cv?.notes && (
        <div style={card}>
          <div style={sectionLabel}>Notes</div>
          <div style={{ fontSize: 12, color: '#3B3B52', whiteSpace: 'pre-wrap' }}>{cv.notes}</div>
        </div>
      )}

      {pdfOpen && <PdfPreviewSheet quotationId={qt.id} onClose={() => setPdfOpen(false)} />}
      {sendOpen && <SendSheet quotation={qt} onClose={() => setSendOpen(false)} onSent={() => { setSendOpen(false); void reload() }} />}
    </div>
  )
}

function ApprovalDot({ approval, isCurrent }: { approval: QuotationApprovalDto; isCurrent: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: approval.decision === 'approved' ? '#0E9C7E' : approval.decision === 'rejected' ? '#C0392B' : isCurrent ? '#fff' : '#F2F3F9',
        color: approval.decision === 'approved' || approval.decision === 'rejected' ? '#fff' : isCurrent ? '#B4650A' : '#8888A0',
        border: isCurrent && approval.decision === 'pending' ? '2px solid #B4650A' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800,
      }}>{approval.decision === 'approved' ? '✓' : approval.decision === 'rejected' ? '×' : approval.step}</div>
      <span style={{ fontSize: 9.5, color: '#5C5C74', fontWeight: 600 }}>{approval.stepName}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// PDF preview sheet — iframe inline
// ═══════════════════════════════════════════════════════════════════════
function PdfPreviewSheet({ quotationId, onClose }: { quotationId: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,45,.7)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center' }}>
        <div onClick={onClose} style={{ color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>✕ Close</div>
        <div style={{ flex: 1 }} />
        <a href={api.quotationPdfUrl(quotationId)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Open in new tab ↗</a>
      </div>
      <div style={{ flex: 1, background: '#fff', margin: '0 12px 12px', borderRadius: 10, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <iframe title="Quotation PDF" src={api.quotationPdfUrl(quotationId)} style={{ width: '100%', height: '100%', border: 'none' }} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Send-to-customer sheet
// ═══════════════════════════════════════════════════════════════════════
function SendSheet({ quotation, onClose, onSent }: { quotation: QuotationDto; onClose: () => void; onSent: () => void }) {
  const toast = useToast()
  const [toEmail, setToEmail] = useState('')
  const [ccEmails, setCcEmails] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (busy) return
    setBusy(true)
    try {
      const cc = ccEmails.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean)
      await api.sendQuotation(quotation.id, { toEmail: toEmail.trim() || undefined, ccEmails: cc.length ? cc : undefined })
      toast('Quotation sent'); onSent()
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  return (
    <Sheet onClose={onClose} title="Send to customer">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: '#5C5C74' }}>
          {quotation.no} · {quotation.customerName}
        </div>
        <input type="email" placeholder="To email (leave blank to use customer default)" value={toEmail} onChange={(e) => setToEmail(e.target.value)} style={inp} />
        <input placeholder="CC (comma-separated)" value={ccEmails} onChange={(e) => setCcEmails(e.target.value)} style={inp} />
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{ ...outlineBtn, flex: 1, color: '#3B3B52', border: '1px solid #D0D0DF' }}>Cancel</button>
          <button type="button" onClick={send} disabled={busy} style={{ ...submitBtn, flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </div>
    </Sheet>
  )
}

const chip = (on: boolean, color: string): CSSProperties => ({
  cursor: 'pointer', flex: 'none',
  border: `1px solid ${on ? color : '#E5E7F0'}`,
  background: on ? color + '15' : '#fff',
  color: on ? color : '#5C5C74',
  borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700,
})
