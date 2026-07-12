import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { CreateCustomerDto, CustomerDto, CustomerStatus, UserDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'

interface Props {
  open: boolean
  initial?: CustomerDto | null
  onClose: () => void
  onSaved: (c: CustomerDto) => void
}

const STATUSES: CustomerStatus[] = ['Prospect', 'Active', 'Inactive']

export default function CustomerFormModal({ open, initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CreateCustomerDto>({
    code: '', name: '', nameTh: '', industry: '', status: 'Prospect',
    ownerId: '', city: '', address: '', taxId: '', phone: '', terms: 'Net 30',
    lastActivity: 'New customer',
  })
  const [owners, setOwners] = useState<UserDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    api.users().then(setOwners).catch(() => setOwners([]))
  }, [open])

  useEffect(() => {
    if (initial) {
      setForm({
        code: initial.code, name: initial.name, nameTh: initial.nameTh ?? '',
        industry: initial.industry, status: initial.status,
        ownerId: initial.ownerId, city: initial.city, address: initial.address,
        taxId: initial.taxId, phone: initial.phone, terms: initial.terms,
        openValue: initial.openValue, wonValue: initial.wonValue,
        lastActivity: initial.lastActivity,
      })
    } else if (open) {
      setForm((f) => ({ ...f, code: '', name: '', nameTh: '', industry: '', city: '', address: '', taxId: '', phone: '', terms: 'Net 30' }))
    }
    setError(null)
  }, [initial, open])

  if (!open) return null

  const change = <K extends keyof CreateCustomerDto>(key: K, value: CreateCustomerDto[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const saved = initial
        ? await api.updateCustomer(initial.id, form)
        : await api.createCustomer(form)
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, flex: 1 }}>
              {initial ? 'Edit customer' : 'New customer'}
            </div>
            <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0', padding: 4 }}>×</div>
          </div>

          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Code" required>
              <input value={form.code} onChange={(e) => change('code', e.target.value)} required style={inputStyle} placeholder="C-1099" />
            </Field>
            <Field label="Company name (EN)" required>
              <input value={form.name} onChange={(e) => change('name', e.target.value)} required style={inputStyle} />
            </Field>
            <Field label="Company name (TH)">
              <input value={form.nameTh ?? ''} onChange={(e) => change('nameTh', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Industry" required>
              <input value={form.industry} onChange={(e) => change('industry', e.target.value)} required style={inputStyle} />
            </Field>
            <Field label="Status">
              <select value={form.status ?? 'Prospect'} onChange={(e) => change('status', e.target.value as CustomerStatus)} style={inputStyle}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Owner" required>
              <select value={form.ownerId} onChange={(e) => change('ownerId', e.target.value)} required style={inputStyle}>
                <option value="">— Select —</option>
                {owners.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </Field>
            <Field label="City" required>
              <input value={form.city} onChange={(e) => change('city', e.target.value)} required style={inputStyle} />
            </Field>
            <Field label="Phone" required>
              <input value={form.phone} onChange={(e) => change('phone', e.target.value)} required style={inputStyle} />
            </Field>
            <Field label="Address" required span2>
              <input value={form.address} onChange={(e) => change('address', e.target.value)} required style={inputStyle} />
            </Field>
            <Field label="Tax ID" required>
              <input value={form.taxId} onChange={(e) => change('taxId', e.target.value)} required style={inputStyle} placeholder="0105549001234" />
            </Field>
            <Field label="Credit terms">
              <input value={form.terms} onChange={(e) => change('terms', e.target.value)} style={inputStyle} placeholder="Net 30" />
            </Field>
          </div>

          {error && (
            <div style={{ margin: '0 22px', background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Saving…' : initial ? 'Save changes' : 'Create customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, required, span2, children }: { label: string; required?: boolean; span2?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: span2 ? 'span 2' : undefined }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5C5C74', marginBottom: 6, letterSpacing: '.03em' }}>
        {label}{required && <span style={{ color: '#C0392B' }}>&nbsp;*</span>}
      </div>
      {children}
    </div>
  )
}

const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 200, padding: 20,
}
const dialog: CSSProperties = {
  background: '#fff', width: '100%', maxWidth: 720, borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)',
  animation: 'fadeUp .2s ease',
}
const inputStyle: CSSProperties = {
  width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px',
  fontSize: 13, background: '#fff', outline: 'none',
}
const btnPrimary: CSSProperties = {
  background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9,
  padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const btnGhost: CSSProperties = {
  background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9,
  padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
