/**
 * New Lead sheet — reachable from MobileLeads FAB.
 *
 * Sales rep flow: opens sheet → fills name/company/phone → picks service +
 * source → save. Offline? queues via `offlineQueue`.
 */

import { useState, type CSSProperties, type FormEvent } from 'react'
import { SERVICE_LINES, type CreateLeadDto, type ServiceLine } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { enqueue as enqueueDraft } from '../lib/offlineQueue'
import { Sheet } from './MobileDetails'

const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const outlineBtn: CSSProperties = { background: '#fff', color: '#3B3B52', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const inp: CSSProperties = { width: '100%', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }

export function MobileNewLeadSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const availableServices = (user?.services ?? SERVICE_LINES) as ServiceLine[]
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState('Referral')
  const [serviceOrProduct, setServiceOrProduct] = useState<ServiceLine | ''>('')
  const [estValue, setEstValue] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !companyName.trim() || saving) return
    setSaving(true)
    const payload: CreateLeadDto = {
      name: name.trim(),
      companyName: companyName.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      source: source.trim() || 'Referral',
      serviceOrProduct: serviceOrProduct || undefined,
      estValue: typeof estValue === 'number' ? estValue : undefined,
      notes: notes.trim() || undefined,
    }
    try {
      if (!navigator.onLine) {
        await enqueueDraft({ kind: 'lead', label: `Lead: ${name.trim()}`, payload })
        toast('Offline — queued')
      } else {
        await api.createLead(payload)
        toast('Lead created')
      }
      onSaved()
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose} title="New lead">
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input required placeholder="Contact name *" value={name} onChange={(e) => setName(e.target.value)} style={inp} />
        <input required placeholder="Company *" value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inp} />
        <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} inputMode="tel" />
        <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} />

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5C5C74', marginBottom: 5 }}>Service</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {availableServices.map((s) => {
              const on = serviceOrProduct === s
              return (
                <div key={s} onClick={() => setServiceOrProduct(on ? '' : s)} style={{
                  cursor: 'pointer',
                  border: `1px solid ${on ? '#2A6FDB' : '#E5E7F0'}`,
                  background: on ? '#EEF0FA' : '#fff',
                  color: on ? '#2A6FDB' : '#5C5C74',
                  borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700,
                }}>{s}</div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input placeholder="Source" value={source} onChange={(e) => setSource(e.target.value)} style={inp} />
          <input placeholder="Est. value" inputMode="numeric" value={estValue} onChange={(e) => setEstValue(e.target.value === '' ? '' : Number(e.target.value))} style={inp} />
        </div>

        <textarea rows={3} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{ ...outlineBtn, flex: 1 }}>Cancel</button>
          <button type="submit" disabled={saving || !name.trim() || !companyName.trim()} style={{ ...primaryBtn, flex: 1, opacity: saving || !name.trim() || !companyName.trim() ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Sheet>
  )
}
