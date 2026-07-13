import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { CreateLeadDto, DuplicateCheckResult, LeadDto, LeadStatus, UserDto } from '@bluefish/shared'
import { SERVICE_LINES } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'

interface Props { open: boolean; initial?: LeadDto | null; onClose: () => void; onSaved: (l: LeadDto) => void }
const SOURCES = ['LINE OA', 'e-GP Tender', 'Facebook Ads', 'Instagram', 'Website', 'Referral']
const STATUSES: LeadStatus[] = ['New', 'Contacted', 'Qualified', 'AI Sourced', 'Converted', 'Lost']

export default function LeadFormModal({ open, initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CreateLeadDto>({
    name: '', companyName: '', email: '', phone: '', source: 'Website', estValue: undefined, serviceOrProduct: '', notes: '',
  })
  const [users, setUsers] = useState<UserDto[]>([])
  const [dupes, setDupes] = useState<DuplicateCheckResult['duplicates']>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    api.users().then(setUsers).catch(() => setUsers([]))
  }, [open])

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name, companyName: initial.companyName,
        email: initial.email ?? '', phone: initial.phone ?? '',
        source: initial.source, status: initial.status,
        ownerId: initial.ownerId ?? undefined,
        estValue: initial.estValue ?? undefined,
        serviceOrProduct: initial.serviceOrProduct ?? '',
        notes: initial.notes ?? '',
      })
    } else if (open) {
      setForm({ name: '', companyName: '', email: '', phone: '', source: 'Website', serviceOrProduct: '', notes: '' })
    }
    setError(null); setDupes([])
  }, [initial, open])

  useEffect(() => {
    if (!open || initial) return
    if (form.name.length < 2 || form.companyName.length < 2) { setDupes([]); return }
    const handle = window.setTimeout(() => {
      api.duplicateCheckLead({ name: form.name, companyName: form.companyName, email: form.email, phone: form.phone })
        .then((r) => setDupes(r.duplicates)).catch(() => setDupes([]))
    }, 350)
    return () => window.clearTimeout(handle)
  }, [form.name, form.companyName, form.email, form.phone, open, initial])

  if (!open) return null

  const change = <K extends keyof CreateLeadDto>(k: K, v: CreateLeadDto[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      const saved = initial ? await api.updateLead(initial.id, form) : await api.createLead(form)
      onSaved(saved); onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, flex: 1 }}>{initial ? 'Edit lead' : 'New lead'}</div>
            <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0' }}>×</div>
          </div>
          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Contact name" required><input value={form.name} onChange={(e) => change('name', e.target.value)} required style={inp} /></Field>
            <Field label="Company" required><input value={form.companyName} onChange={(e) => change('companyName', e.target.value)} required style={inp} /></Field>
            <Field label="Email"><input type="email" value={form.email ?? ''} onChange={(e) => change('email', e.target.value)} style={inp} /></Field>
            <Field label="Phone"><input value={form.phone ?? ''} onChange={(e) => change('phone', e.target.value)} style={inp} /></Field>
            <Field label="Source" required>
              <select value={form.source} onChange={(e) => change('source', e.target.value)} required style={inp}>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Estimated value (฿)"><input type="number" min={0} value={form.estValue ?? ''} onChange={(e) => change('estValue', e.target.value ? Number(e.target.value) : undefined)} style={inp} /></Field>
            <Field label="Service / Product">
              <select value={form.serviceOrProduct ?? ''} onChange={(e) => change('serviceOrProduct', e.target.value || undefined)} style={inp}>
                <option value="">— No service —</option>
                {SERVICE_LINES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            {initial && (
              <Field label="Status">
                <select value={form.status ?? 'New'} onChange={(e) => change('status', e.target.value as LeadStatus)} style={inp}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            )}
            <Field label="Owner (blank = auto round-robin)">
              <select value={form.ownerId ?? ''} onChange={(e) => change('ownerId', e.target.value || undefined)} style={inp}>
                <option value="">— Auto assign —</option>
                {users.filter((u) => u.role === 'sales_rep' || u.role === 'sales_manager').map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </Field>
            <Field label="Notes" span2>
              <textarea rows={2} value={form.notes ?? ''} onChange={(e) => change('notes', e.target.value)} style={{ ...inp, resize: 'vertical' }} />
            </Field>
          </div>

          {dupes.length > 0 && !initial && (
            <div style={{ margin: '0 22px 12px', background: '#FEEFE6', border: '1px solid #F0BA95', borderRadius: 10, padding: '10px 14px', fontSize: 12.5 }}>
              <b style={{ color: '#B4650A' }}>Possible duplicates ({dupes.length}):</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {dupes.slice(0, 3).map((d) => (
                  <li key={d.id}>{d.companyName} — {d.name} <span style={{ color: '#8888A0' }}>({Math.round(d.similarity * 100)}% match)</span></li>
                ))}
              </ul>
            </div>
          )}

          {error && <div style={{ margin: '0 22px 12px', background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>{error}</div>}

          <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create lead'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, required, span2, children }: { label: string; required?: boolean; span2?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: span2 ? 'span 2' : undefined }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5C5C74', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#C0392B' }}>&nbsp;*</span>}
      </div>
      {children}
    </div>
  )
}

const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', maxWidth: 640, borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
