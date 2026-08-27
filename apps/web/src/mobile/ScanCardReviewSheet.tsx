import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { CustomerDto, ScanCardResultDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { Sheet } from './MobileDetails'

interface Props {
  result: ScanCardResultDto
  onClose: () => void
  onDone: (customerId: string) => void
}

/**
 * Review + save flow after a business-card scan.
 *
 * The moment the user's company name matches an existing customer, we drop the
 * whole "Company" section and only save a new Contact. This is the flow the
 * user asked for — the card gets recognized as an existing account, we just
 * capture the new person on it.
 */
export default function ScanCardReviewSheet({ result, onClose, onDone }: Props) {
  const { user } = useAuth()
  const toast = useToast()

  // ── Company section (also editable — user can override the OCR guess) ──
  const [companyName, setCompanyName] = useState(result.companyName ?? '')
  const [taxId, setTaxId] = useState(result.taxId ?? '')
  const [address, setAddress] = useState(result.address ?? '')
  const [city, setCity] = useState(result.city ?? '')
  const [phone, setPhone] = useState(result.telephone ?? result.mobile ?? '')

  // ── Contact section ──
  const [firstName, setFirstName] = useState(result.firstName ?? (result.contactName?.split(' ')[0] ?? ''))
  const [lastName, setLastName] = useState(result.lastName ?? (result.contactName?.split(' ').slice(1).join(' ') ?? ''))
  const [position, setPosition] = useState(result.position ?? '')
  const [department, setDepartment] = useState(result.department ?? '')
  const [email, setEmail] = useState(result.email ?? '')
  const [mobile, setMobile] = useState(result.mobile ?? '')
  const [telephone, setTelephone] = useState(result.telephone ?? '')

  // ── Company-match state ──
  const [candidates, setCandidates] = useState<CustomerDto[]>([])
  const [attachTo, setAttachTo] = useState<string | 'new'>('new')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  // Debounced customer lookup — server search is name+code+phone+taxId. We
  // trigger on companyName change so if the user edits it, matches refresh.
  useEffect(() => {
    const q = companyName.trim()
    if (!q) { setCandidates([]); setAttachTo('new'); return }
    setSearching(true)
    const timer = setTimeout(() => {
      api.customers(q)
        .then((rows) => {
          setCandidates(rows.slice(0, 6))
          // Auto-suggest an attach when there's a clean, unambiguous name match.
          const exact = rows.find((r) =>
            r.name.toLowerCase() === q.toLowerCase() ||
            (taxId && r.taxId === taxId)
          )
          if (exact) setAttachTo(exact.id)
        })
        .catch(() => setCandidates([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [companyName, taxId])

  const attaching = attachTo !== 'new'
  const attachedCustomer = useMemo(() => candidates.find((c) => c.id === attachTo), [candidates, attachTo])

  const canSave = () => {
    if (attaching) return !!attachTo && (firstName.trim() || lastName.trim() || email.trim() || mobile.trim())
    return companyName.trim().length > 0 && (firstName.trim() || lastName.trim() || email.trim())
  }

  const save = async () => {
    if (saving) return
    if (!user) { toast('Not signed in'); return }
    if (!canSave()) { toast('Fill at least a name or email'); return }
    setSaving(true)
    try {
      let customerId: string
      if (attaching && attachTo !== 'new') {
        customerId = attachTo
      } else {
        // Create a new customer with only the fields we have; sensible defaults
        // for the required scalars keep the API happy without inventing data.
        const created = await api.createCustomer({
          code: `CUST-${Date.now().toString().slice(-6)}`,
          name: companyName.trim(),
          industry: 'Other',
          ownerId: user.id,
          city: city.trim() || '—',
          address: address.trim() || '—',
          taxId: taxId.trim() || '',
          phone: phone.trim() || '',
          terms: 'NET 30',
          lastActivity: new Date().toISOString().slice(0, 10),
        })
        customerId = created.id
      }

      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || (result.contactName ?? '').trim()
      await api.createContact(customerId, {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        name: fullName || undefined,
        position: position.trim() || undefined,
        department: department.trim() || undefined,
        role: position.trim() || 'Contact',
        email: email.trim() || `${(firstName || 'contact').toLowerCase()}@${companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'unknown'}.local`,
        phone: (mobile.trim() || telephone.trim() || phone.trim()) || '',
        telephone: telephone.trim() || undefined,
        isPrimary: false,
      })

      toast(attaching ? 'Contact added to existing customer' : 'Customer + contact created')
      onDone(customerId)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet onClose={onClose} title="Review scanned card">
      {/* ── Match / attach picker ── */}
      <Section label="Attach to">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {searching && candidates.length === 0 && <div style={hint}>Searching customers…</div>}
          {candidates.length > 0 && candidates.map((c) => (
            <div
              key={c.id}
              onClick={() => setAttachTo(c.id)}
              style={{
                ...pickRow,
                borderColor: attachTo === c.id ? '#2A6FDB' : '#E5E7F0',
                background: attachTo === c.id ? '#EEF3FC' : '#fff',
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${attachTo === c.id ? '#2A6FDB' : '#C4C6D6'}`, background: attachTo === c.id ? '#2A6FDB' : '#fff', flex: 'none', boxShadow: attachTo === c.id ? 'inset 0 0 0 3px #fff' : 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 10.5, color: '#8888A0' }}>{c.code} · {c.industry}{c.taxId ? ` · Tax ${c.taxId}` : ''}</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: attachTo === c.id ? '#2A6FDB' : '#8888A0' }}>Existing</div>
            </div>
          ))}
          <div
            onClick={() => setAttachTo('new')}
            style={{
              ...pickRow,
              borderColor: attachTo === 'new' ? '#0E9C7E' : '#E5E7F0',
              background: attachTo === 'new' ? '#E9F8F1' : '#fff',
            }}
          >
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${attachTo === 'new' ? '#0E9C7E' : '#C4C6D6'}`, background: attachTo === 'new' ? '#0E9C7E' : '#fff', flex: 'none', boxShadow: attachTo === 'new' ? 'inset 0 0 0 3px #fff' : 'none' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Create new customer</div>
              <div style={{ fontSize: 10.5, color: '#8888A0' }}>{companyName || '(no company on the card)'}</div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: attachTo === 'new' ? '#0E9C7E' : '#8888A0' }}>New</div>
          </div>
        </div>
      </Section>

      {/* ── Company section — hidden when attaching to an existing customer ── */}
      {!attaching ? (
        <Section label="Company">
          <Field label="Company name" value={companyName} onChange={setCompanyName} required />
          <Row>
            <Field label="Tax ID" value={taxId} onChange={setTaxId} />
            <Field label="Phone" value={phone} onChange={setPhone} />
          </Row>
          <Field label="Address" value={address} onChange={setAddress} />
          <Field label="City" value={city} onChange={setCity} />
        </Section>
      ) : (
        <div style={{
          background: '#EEF3FC', border: '1px solid #B7CFF3', borderRadius: 10,
          padding: '10px 12px', fontSize: 12, color: '#2A6FDB', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 15 }}>ℹ️</span>
          <span>Company already exists — only the <b>Contact Person</b> below will be saved.</span>
        </div>
      )}

      {/* ── Contact person ── */}
      <Section label={attaching && attachedCustomer ? `Contact Person · ${attachedCustomer.name}` : 'Contact Person'}>
        <Row>
          <Field label="First name" value={firstName} onChange={setFirstName} />
          <Field label="Last name" value={lastName} onChange={setLastName} />
        </Row>
        <Row>
          <Field label="Position" value={position} onChange={setPosition} />
          <Field label="Department" value={department} onChange={setDepartment} />
        </Row>
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Row>
          <Field label="Mobile" value={mobile} onChange={setMobile} />
          <Field label="Office phone" value={telephone} onChange={setTelephone} />
        </Row>
      </Section>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <div onClick={onClose} style={outlineBtn}>Cancel</div>
        <div
          onClick={canSave() && !saving ? save : undefined}
          style={{
            ...primaryBtn, flex: 1,
            opacity: canSave() && !saving ? 1 : 0.5,
            background: attaching ? '#0E9C7E' : '#2A6FDB',
          }}
        >
          {saving ? 'Saving…' : attaching ? 'Add Contact' : 'Create Customer + Contact'}
        </div>
      </div>
    </Sheet>
  )
}

// ── little building blocks ──
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8 }}>{children}</div>
}

function Field({ label, value, onChange, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#5C5C74' }}>{label}{required ? ' *' : ''}</span>
      <input value={value} type={type} onChange={(e) => onChange(e.target.value)} style={inp} />
    </label>
  )
}

const inp: CSSProperties = { border: '1px solid #D0D0DF', borderRadius: 9, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', textAlign: 'center' }
const outlineBtn: CSSProperties = { background: '#fff', color: '#3B3B52', border: '1px solid #D0D0DF', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const pickRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid #E5E7F0', borderRadius: 10, cursor: 'pointer' }
const hint: CSSProperties = { fontSize: 11, color: '#8888A0', padding: '6px 4px' }
