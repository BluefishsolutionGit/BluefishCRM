import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { CreateVersionDto, ProductDto, QuotationDto, QuotationStatus } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

const STATUS_STYLE: Record<QuotationStatus, { bg: string; fg: string }> = {
  Draft: { bg: '#F2F3F9', fg: '#5C5C74' },
  'Pending Approval': { bg: '#F7EBD9', fg: '#B4650A' },
  Approved: { bg: '#E4EDFC', fg: '#2A6FDB' },
  Sent: { bg: '#E7EDF9', fg: '#1F5AC2' },
  Accepted: { bg: '#E5F8ED', fg: '#0E6E4E' },
  Rejected: { bg: '#FDECEA', fg: '#C0392B' },
  Expired: { bg: '#F2F3F9', fg: '#8888A0' },
}

interface EditableLine {
  productId?: string
  itemName: string
  description?: string
  quantity: number
  unitPrice: number
  discountPct?: number
}

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>()
  const [q, setQ] = useState<QuotationDto | null>(null)
  const [products, setProducts] = useState<ProductDto[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [lines, setLines] = useState<EditableLine[]>([])
  const [discountPct, setDiscountPct] = useState(0)
  const [vatPct, setVatPct] = useState(7)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [showEmailBox, setShowEmailBox] = useState(false)
  const [toEmail, setToEmail] = useState('')
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('quotation:write')
  const canApprove = hasPermission('quotation:approve')

  const reload = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [quote, prods] = await Promise.all([api.quotation(id), api.products()])
      setQ(quote)
      setProducts(prods)
      if (quote.currentVersion) {
        setDiscountPct(quote.currentVersion.discountPct)
        setVatPct(quote.currentVersion.vatPct)
        setNotes(quote.currentVersion.notes ?? '')
        setLines(quote.currentVersion.lines.map((l) => ({
          productId: l.productId ?? undefined, itemName: l.itemName,
          description: l.description ?? undefined, quantity: l.quantity,
          unitPrice: l.unitPrice, discountPct: l.discountPct,
        })))
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to load')
    } finally { setLoading(false) }
  }

  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id])

  if (loading || !q) return <div style={{ padding: 32, color: '#8888A0' }}>Loading…</div>

  const cv = q.currentVersion
  const s = STATUS_STYLE[q.status]
  const editable = q.status === 'Draft' || q.status === 'Rejected'

  const addLine = () => setLines((ls) => [...ls, { itemName: '', quantity: 1, unitPrice: 0, discountPct: 0 }])
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i))
  const updateLine = (i: number, patch: Partial<EditableLine>) =>
    setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const pickProduct = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId)
    if (!p) return updateLine(i, { productId: undefined })
    updateLine(i, { productId: p.id, itemName: p.name, description: p.description ?? undefined, unitPrice: p.unitPrice })
  }

  const subtotal = lines.reduce((a, l) => a + Math.round(l.quantity * l.unitPrice * (1 - (l.discountPct ?? 0) / 100)), 0)
  const discountAmt = Math.round(subtotal * (discountPct / 100))
  const afterDisc = subtotal - discountAmt
  const vatAmt = Math.round(afterDisc * (vatPct / 100))
  const grandTotal = afterDisc + vatAmt

  const saveVersion = async () => {
    if (!id) return
    setBusy(true)
    try {
      const payload: CreateVersionDto = { discountPct, vatPct, notes: notes || undefined, lines }
      const updated = await api.addQuotationVersion(id, payload)
      setQ(updated); setEditing(false)
      toast(`New version v${updated.currentVersion?.versionNo} saved`)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Save failed')
    } finally { setBusy(false) }
  }

  const submit = async () => { if (!id) return; try { setQ(await api.submitQuotation(id)); toast('Submitted for approval') } catch (e) { toast(e instanceof ApiError ? e.message : 'Submit failed') } }
  const approve = async () => { if (!id) return; try { setQ(await api.approveQuotation(id)); toast('Approved') } catch (e) { toast(e instanceof ApiError ? e.message : 'Approve failed') } }
  const reject = async () => {
    if (!id) return
    const comment = window.prompt('Reason for rejection?')
    if (!comment) return
    try { setQ(await api.rejectQuotation(id, comment)); toast('Rejected — back to Draft') }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Reject failed') }
  }
  const send = async () => {
    if (!id) return
    setSending(true)
    try {
      const updated = await api.sendQuotation(id, { toEmail: toEmail || undefined })
      setQ(updated); setShowEmailBox(false); setToEmail('')
      toast(`Sent to ${toEmail || 'primary contact'}`)
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Send failed') }
    finally { setSending(false) }
  }

  const currentApproval = q.approvals.find((a) => a.step === q.approvalStep && a.decision === 'pending')

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '20px 28px', animation: 'fadeUp .3s ease' }}>
      <Link to="/quotations" style={{ fontSize: 12.5, fontWeight: 600, color: '#2A6FDB', display: 'inline-block', marginBottom: 12 }}>← Quotations</Link>

      {/* Header card */}
      <div style={{ ...card, padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 17, fontWeight: 600 }}>{q.no}</span>
              <span style={{ background: s.bg, color: s.fg, borderRadius: 7, fontSize: 11, fontWeight: 700, padding: '3px 9px', textTransform: 'uppercase' }}>{q.status}</span>
            </div>
            <div style={{ fontSize: 13.5, marginTop: 6, fontWeight: 600 }}>
              {q.customerName} <span style={{ color: '#5C5C74', fontWeight: 400 }}>· owner {q.ownerName}</span>
              {q.opportunityTitle && <span style={{ color: '#5C5C74', fontWeight: 400 }}> · {q.opportunityTitle}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {q.versions.map((v) => (
                <span key={v.id} style={{
                  background: cv?.id === v.id ? '#2E1A6B' : '#fff',
                  color: cv?.id === v.id ? '#fff' : '#5C5C74',
                  border: cv?.id === v.id ? 'none' : '1px solid #E5E7F0',
                  borderRadius: 7, fontSize: 11, fontWeight: 700, padding: '3px 9px',
                }}>v{v.versionNo}{cv?.id === v.id && ' · current'}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {q.status !== 'Draft' && (
              <a href={api.quotationPdfUrl(q.id)} target="_blank" rel="noopener noreferrer" style={outlineBtn}>Download PDF</a>
            )}
            {canWrite && editable && !editing && <div onClick={() => setEditing(true)} style={outlineBtn}>Edit lines</div>}
            {canWrite && editable && q.currentVersion && (q.currentVersion.lines.length > 0) && !editing && (
              <div onClick={submit} style={primaryBtn}>Submit for approval</div>
            )}
            {canApprove && q.status === 'Pending Approval' && (
              <>
                <div onClick={reject} style={{ ...outlineBtn, color: '#C0392B', borderColor: '#F5B7B1' }}>Reject</div>
                <div onClick={approve} style={{ ...primaryBtn, background: '#0E9C7E' }}>Approve ({currentApproval?.stepName})</div>
              </>
            )}
            {canWrite && q.status === 'Approved' && (
              <div onClick={() => setShowEmailBox(true)} style={primaryBtn}>Email to customer</div>
            )}
          </div>
        </div>

        {/* Approval workflow visual */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 18, borderTop: '1px solid #F2F3F9', paddingTop: 16 }}>
          {[
            { name: 'Draft', done: true },
            ...q.approvals.map((a) => ({ name: a.stepName, done: a.decision === 'approved', current: a.decision === 'pending' && q.approvalStep === a.step })),
            { name: 'Sent', done: q.status === 'Sent' || q.status === 'Accepted' },
          ].map((step, i, arr) => (
            <div key={i} style={{ display: 'contents' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: step.done ? '#2A6FDB' : (step as { current?: boolean }).current ? '#fff' : '#F2F3F9',
                  color: step.done ? '#fff' : (step as { current?: boolean }).current ? '#B4650A' : '#8888A0',
                  border: (step as { current?: boolean }).current ? '2px solid #B4650A' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                }}>{step.done ? '✓' : String(i + 1)}</div>
                <span style={{ fontSize: 12, fontWeight: 600, color: (step as { current?: boolean }).current ? '#B4650A' : '#3B3B52' }}>{step.name}</span>
              </div>
              {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: step.done ? '#2A6FDB' : '#E5E7F0', margin: '0 10px' }} />}
            </div>
          ))}
        </div>
      </div>

      <FlowaccountPanel q={q} canWrite={canWrite} onChanged={reload} />

      {showEmailBox && (
        <div style={{ ...card, padding: '14px 18px', marginBottom: 14, background: '#F4F1FD', borderColor: '#DCD4F6' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Send quotation by email</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Recipient email (leave blank for primary contact)" value={toEmail} onChange={(e) => setToEmail(e.target.value)} style={{ ...inp, flex: 1 }} />
            <div onClick={send} style={{ ...primaryBtn, opacity: sending ? 0.5 : 1 }}>{sending ? 'Sending…' : 'Send'}</div>
            <div onClick={() => setShowEmailBox(false)} style={outlineBtn}>Cancel</div>
          </div>
          <div style={{ fontSize: 11.5, color: '#5C5C74', marginTop: 8 }}>Dev mode: the email is logged to the API console instead of actually sent.</div>
        </div>
      )}

      {/* Line editor / viewer */}
      {cv && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ ...lineHeader, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8888A0' }}>
              <div>#</div><div>Item</div><div style={{ textAlign: 'right' }}>Qty</div><div style={{ textAlign: 'right' }}>Unit price</div><div style={{ textAlign: 'right' }}>Disc %</div><div style={{ textAlign: 'right' }}>Amount</div>{editing && <div />}
            </div>
            {(editing ? lines : cv.lines.map((l) => ({ ...l, itemName: l.itemName, description: l.description ?? undefined }))).map((line, i) => {
              const amount = Math.round(line.quantity * line.unitPrice * (1 - (line.discountPct ?? 0) / 100))
              return editing ? (
                <div key={i} style={{ ...lineGrid, padding: '10px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'flex-start' }}>
                  <div style={{ color: '#8888A0', paddingTop: 8 }}>{i + 1}</div>
                  <div>
                    <select value={(line as EditableLine).productId ?? ''} onChange={(e) => pickProduct(i, e.target.value)} style={{ ...inpSmall, marginBottom: 4 }}>
                      <option value="">— pick product —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                    </select>
                    <input placeholder="Item name" value={line.itemName} onChange={(e) => updateLine(i, { itemName: e.target.value })} style={inpSmall} />
                    <input placeholder="Description (optional)" value={(line as EditableLine).description ?? ''} onChange={(e) => updateLine(i, { description: e.target.value })} style={{ ...inpSmall, marginTop: 4 }} />
                  </div>
                  <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} style={{ ...inpSmall, textAlign: 'right' }} />
                  <input type="number" min={0} value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} style={{ ...inpSmall, textAlign: 'right' }} />
                  <input type="number" min={0} max={100} value={line.discountPct ?? 0} onChange={(e) => updateLine(i, { discountPct: Number(e.target.value) })} style={{ ...inpSmall, textAlign: 'right' }} />
                  <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, paddingTop: 8 }}>{fmt(amount)}</div>
                  <div style={{ textAlign: 'right', paddingTop: 4 }}>
                    <button onClick={() => removeLine(i)} type="button" style={{ background: 'transparent', color: '#C0392B', border: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
                  </div>
                </div>
              ) : (
                <div key={i} style={{ ...lineGrid, padding: '13px 18px', borderBottom: '1px solid #F2F3F9', fontSize: 12.5, alignItems: 'center' }}>
                  <div style={{ color: '#8888A0' }}>{i + 1}</div>
                  <div>
                    <b>{line.itemName}</b>
                    {line.description && <div style={{ fontSize: 11.5, color: '#5C5C74' }}>{line.description}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>{line.quantity}</div>
                  <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{fmt(line.unitPrice)}</div>
                  <div style={{ textAlign: 'right' }}>{line.discountPct ?? 0}%</div>
                  <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{fmt(amount)}</div>
                </div>
              )
            })}
            {editing && (
              <div style={{ padding: '12px 18px' }}>
                <div onClick={addLine} style={{ display: 'inline-block', color: '#2A6FDB', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>+ Add line item</div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ ...card, padding: '18px 20px' }}>
              {editing ? (
                <>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                    <label style={{ fontSize: 12, color: '#5C5C74', flex: 1 }}>Discount %</label>
                    <input type="number" min={0} max={100} value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value))} style={{ ...inpSmall, width: 80, textAlign: 'right' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <label style={{ fontSize: 12, color: '#5C5C74', flex: 1 }}>VAT %</label>
                    <input type="number" min={0} max={30} value={vatPct} onChange={(e) => setVatPct(Number(e.target.value))} style={{ ...inpSmall, width: 80, textAlign: 'right' }} />
                  </div>
                </>
              ) : null}
              <div style={sumRow}><span style={{ color: '#5C5C74' }}>Subtotal</span><span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>฿{fmt(editing ? subtotal : cv.subtotal)}</span></div>
              <div style={sumRow}><span style={{ color: '#5C5C74' }}>Discount {editing ? discountPct : cv.discountPct}%</span><span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#C0392B' }}>−฿{fmt(editing ? discountAmt : cv.discountAmt)}</span></div>
              <div style={{ ...sumRow, borderBottom: '1px solid #F2F3F9' }}><span style={{ color: '#5C5C74' }}>VAT {editing ? vatPct : cv.vatPct}%</span><span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>฿{fmt(editing ? vatAmt : cv.vatAmt)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0 2px' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Grand total</span>
                <span style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 700 }}>฿{fmt(editing ? grandTotal : cv.grandTotal)}</span>
              </div>
              {editing && (
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <div onClick={() => setEditing(false)} style={{ ...outlineBtn, flex: 1, textAlign: 'center' }}>Cancel</div>
                  <div onClick={saveVersion} style={{ ...primaryBtn, flex: 1, textAlign: 'center', opacity: busy ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save as new version'}</div>
                </div>
              )}
            </div>

            {editing && (
              <div style={{ ...card, padding: '16px 18px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#5C5C74', marginBottom: 6 }}>Notes</div>
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, resize: 'vertical' }} />
              </div>
            )}

            <div style={{ ...card, padding: '16px 18px', fontSize: 12, color: '#5C5C74', lineHeight: 1.6 }}>
              <b style={{ color: '#1E1E30' }}>Terms</b><br />
              {cv.terms}
            </div>

            {q.approvals.length > 0 && (
              <div style={{ ...card, padding: '16px 18px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#5C5C74', marginBottom: 10 }}>Approval history</div>
                {q.approvals.map((a) => (
                  <div key={a.id} style={{ padding: '8px 0', borderTop: '1px solid #F2F3F9', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                    <span style={{ background: a.decision === 'approved' ? '#E5F8ED' : a.decision === 'rejected' ? '#FDECEA' : '#F2F3F9', color: a.decision === 'approved' ? '#0E6E4E' : a.decision === 'rejected' ? '#C0392B' : '#8888A0', borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', textTransform: 'uppercase' }}>{a.decision}</span>
                    <span style={{ fontWeight: 600 }}>{a.stepName}</span>
                    {a.approverName && <span style={{ color: '#5C5C74' }}>— {a.approverName}</span>}
                    {a.comment && <span style={{ color: '#5C5C74', fontStyle: 'italic' }}>· "{a.comment}"</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const FA_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  draft:     { bg: '#F2F3F9', fg: '#5C5C74' },
  sent:      { bg: '#E4EDFC', fg: '#2A6FDB' },
  accepted:  { bg: '#E5F8ED', fg: '#0E6E4E' },
  rejected:  { bg: '#FDECEA', fg: '#C0392B' },
  converted: { bg: '#EAE7F7', fg: '#5B3FC4' },
  cancelled: { bg: '#ECECF1', fg: '#6B6B7B' },
}

function FlowaccountPanel({ q, canWrite, onChanged }: { q: QuotationDto; canWrite: boolean; onChanged: () => void }) {
  const [status, setStatus] = useState<{ configured: boolean; mode: 'stub' | 'live' } | null>(null)
  const [busy, setBusy] = useState<'push' | 'sync' | null>(null)
  const toast = useToast()

  useEffect(() => {
    api.flowaccountStatus().then((s) => setStatus({ configured: s.configured, mode: s.mode })).catch(() => {})
  }, [])

  const canPush = canWrite && ['Approved', 'Sent', 'Accepted'].includes(q.status)
  const pushed = q.flowaccountId != null

  const push = async () => {
    setBusy('push')
    try {
      const r = await api.flowaccountPush(q.id)
      toast(r.contactCreated ? `Pushed · contact created (${r.contactCode})` : 'Pushed to FlowAccount')
      onChanged()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Push failed')
    } finally { setBusy(null) }
  }

  const sync = async () => {
    setBusy('sync')
    try {
      const r = await api.flowaccountSync(q.id)
      toast(r.previousStatus === r.currentStatus ? `Still ${r.currentStatus}` : `Status: ${r.previousStatus ?? '—'} → ${r.currentStatus}`)
      onChanged()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Sync failed')
    } finally { setBusy(null) }
  }

  const faStatus = q.flowaccountStatus ?? 'draft'
  const faStyle = FA_STATUS_STYLE[faStatus] ?? { bg: '#F2F3F9', fg: '#5C5C74' }

  return (
    <div style={{ ...card, padding: '14px 18px', marginBottom: 14, borderColor: pushed ? '#B7CFF3' : '#E5E7F0', background: pushed ? '#F4F8FE' : '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 190 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#0055FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk'", fontSize: 13, fontWeight: 800 }}>FA</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>FlowAccount</div>
            <div style={{ fontSize: 10.5, color: '#5C5C74' }}>
              {status ? (status.configured ? 'Live mode' : status.mode === 'stub' ? 'Stub mode (no credentials)' : 'Not configured') : 'Checking…'}
            </div>
          </div>
        </div>

        {pushed ? (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
            <MetaItem label="Doc no." value={q.flowaccountDocumentNumber ?? '—'} mono />
            <MetaItem label="Ext id" value={q.flowaccountId!} mono small />
            <MetaItem label="Status" value={<span style={{ background: faStyle.bg, color: faStyle.fg, padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>{faStatus}</span>} />
            <MetaItem label="Last sync" value={q.flowaccountLastSyncedAt ? new Date(q.flowaccountLastSyncedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'} />
          </div>
        ) : (
          <div style={{ flex: 1, fontSize: 12, color: '#5C5C74' }}>
            {q.status === 'Approved' || q.status === 'Sent' || q.status === 'Accepted'
              ? 'Auto-push should have fired on approval — click Push if the doc is missing.'
              : `Auto-push runs on final approval (currently ${q.status}).`}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {pushed && q.flowaccountDeepLink && (
            <a href={q.flowaccountDeepLink} target="_blank" rel="noopener noreferrer"
              style={{ ...outlineBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Open this quotation in FlowAccount">
              Open in FlowAccount ↗
            </a>
          )}
          {pushed && (
            <div onClick={busy ? undefined : sync} style={{ ...outlineBtn, opacity: busy ? 0.5 : 1 }}>
              {busy === 'sync' ? 'Syncing…' : 'Sync status'}
            </div>
          )}
          {canPush && (
            <div onClick={busy ? undefined : push} style={{ ...primaryBtn, background: '#0055FF', opacity: busy ? 0.5 : 1 }}
              title={pushed ? 'Force a re-push if the doc drifted' : 'Manual override — normally auto-pushed on approval'}>
              {busy === 'push' ? 'Pushing…' : pushed ? 'Re-push' : 'Push now'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetaItem({ label, value, mono, small }: { label: string; value: ReactNode; mono?: boolean; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined, fontSize: small ? 11 : 12.5, fontWeight: 600, color: '#1E1E30', marginTop: 2 }}>{value}</div>
    </div>
  )
}

const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14 }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 15px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-block' }
const outlineBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', color: '#3B3B52', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const inpSmall: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 7, padding: '6px 8px', fontSize: 12, outline: 'none' }
const sumRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0' }
const lineGrid: CSSProperties = { display: 'grid', gridTemplateColumns: '24px 1fr 60px 100px 70px 100px 30px', gap: 8 }
const lineHeader: CSSProperties = { display: 'grid', gridTemplateColumns: '24px 1fr 60px 100px 70px 100px 30px', gap: 8 }
