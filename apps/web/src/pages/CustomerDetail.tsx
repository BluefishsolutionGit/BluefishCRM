import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ContactDto, CreateContactDto, CustomerDto, DocumentCategory, DocumentDto, OpportunityDto, TagDto, UpdateContactDto } from '@bluefish/shared'
import { DOCUMENT_CATEGORIES } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { fmt, initialsOf } from '../data/mockData'
import { statusStyle } from '../lib/styleUtils'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'
import VoiceInputButton from '../components/VoiceInputButton'
import DocumentViewer, { type ViewableVersion } from '../components/DocumentViewer'

type Tab = 'overview' | 'contacts' | 'docs'
const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['contacts', 'Contacts'],
  ['docs', 'Documents'],
]

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('overview')
  const [customer, setCustomer] = useState<CustomerDto | null>(null)
  const [contacts, setContacts] = useState<ContactDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canWriteContact = hasPermission('contact:write')

  const reload = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [c, cs] = await Promise.all([api.customer(id), api.contacts(id)])
      setCustomer(c)
      setContacts(cs)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id])

  if (loading) return <div style={{ padding: 32, color: '#8888A0' }}>Loading…</div>
  if (error || !customer) return (
    <div style={{ padding: 32 }}>
      <Link to="/customers">← Back to customers</Link>
      <div style={{ marginTop: 12, color: '#C0392B' }}>{error ?? 'Customer not found.'}</div>
    </div>
  )

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '20px 28px', animation: 'fadeUp .3s ease' }}>
      <Link to="/customers" style={{ fontSize: 12.5, fontWeight: 600, color: '#2A6FDB', display: 'inline-block', marginBottom: 12 }}>← Customers</Link>

      <div style={{ ...card, padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#2E1A6B', color: '#fff', fontSize: 19, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Space Grotesk', flex: 'none' }}>
            {initialsOf(customer.name)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 19, fontWeight: 600 }}>{customer.name}</div>
            <div style={{ fontSize: 13, color: '#5C5C74', marginTop: 2 }}>{customer.nameTh}</div>
            <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", background: '#F2F3F9', borderRadius: 6, fontSize: 11, padding: '3px 8px', color: '#5C5C74' }}>{customer.code}</span>
              <span style={{ background: '#F2F3F9', borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '3px 8px', color: '#3B3B52' }}>{customer.industry}</span>
              <span style={{ background: '#F2F3F9', borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '3px 8px', color: '#3B3B52' }}>{customer.city}</span>
              <span style={statusStyle(customer.status)}>{customer.status}</span>
            </div>
            <CustomerTagsRow customer={customer} onChanged={reload} canWrite={hasPermission('customer:write')} onToast={toast} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 16, borderTop: '1px solid #F2F3F9', paddingTop: 14 }}>
          <div><div style={metaLabel}>Open deals</div><div style={metaValue}>{customer.openValue ? fmt(customer.openValue) : '—'}</div></div>
          <div><div style={metaLabel}>Won YTD</div><div style={metaValue}>{customer.wonValue ? fmt(customer.wonValue) : '—'}</div></div>
          <div><div style={metaLabel}>Owner</div><div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 5 }}>{customer.ownerName}</div></div>
          <div><div style={metaLabel}>Last activity</div><div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 5 }}>{customer.lastActivity}</div></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid #E5E7F0' }}>
        {TABS.map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)} style={tabStyle(tab === id)}>{label}</div>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ ...card, padding: '18px 20px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Company profile</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', fontSize: 12.5 }}>
              <div><div style={fieldLabel}>Registered address</div>{customer.address}</div>
              <div><div style={fieldLabel}>Tax ID</div><span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{customer.taxId}</span></div>
              <div><div style={fieldLabel}>Phone</div>{customer.phone}</div>
              <div><div style={fieldLabel}>Credit terms</div>{customer.terms}</div>
            </div>
          </div>
          <div style={{ ...card, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Key contacts</div>
              <div onClick={() => setTab('contacts')} style={{ fontSize: 12, fontWeight: 700, color: '#2A6FDB', cursor: 'pointer' }}>View all →</div>
            </div>
            {contacts.length === 0 && <div style={{ fontSize: 12.5, color: '#8888A0', padding: '8px 0' }}>No contacts yet.</div>}
            {contacts.slice(0, 3).map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #F2F3F9', alignItems: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F2F3F9', color: '#3B3B52', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.name.replace('คุณ', '').trim()[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#5C5C74' }}>{p.role} · {p.phone}</div>
                </div>
                {p.isPrimary && <span style={{ background: '#E4EDFC', color: '#2A6FDB', borderRadius: 6, fontSize: 10, fontWeight: 700, padding: '2px 7px' }}>PRIMARY</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <ContactsPanel customerId={customer.id} contacts={contacts} onReload={reload} canWrite={canWriteContact} onToast={toast} />
      )}

      {tab === 'docs' && (
        <CustomerDocumentsPortal
          customerId={customer.id}
          customerName={customer.name}
          canWrite={hasPermission('customer:write')}
          onToast={toast}
        />
      )}
    </div>
  )
}

function ContactsPanel({ customerId, contacts, onReload, canWrite, onToast }: { customerId: string; contacts: ContactDto[]; onReload: () => void; canWrite: boolean; onToast: (msg: string) => void }) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ContactDto | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const remove = async (c: ContactDto) => {
    if (!window.confirm(`Delete contact ${c.name}?`)) return
    try { await api.deleteContact(c.id); onToast('Contact deleted'); onReload() }
    catch (e) { onToast(e instanceof ApiError ? e.message : 'Delete failed') }
  }

  const startEdit = (c: ContactDto) => { setEditing(c); setFormOpen(true) }
  const startAdd = () => { setEditing(null); setFormOpen(true) }
  const cancel = () => { setFormOpen(false); setEditing(null) }

  return (
    <div style={{ ...card, padding: '6px 20px' }}>
      {canWrite && !formOpen && (
        <div style={{ padding: '12px 0', borderBottom: '1px solid #F2F3F9' }}>
          <div onClick={startAdd} style={{ display: 'inline-block', background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>+ Add contact</div>
        </div>
      )}
      {formOpen && (
        <ContactForm
          initial={editing ?? undefined}
          onCancel={cancel}
          onSaved={() => { cancel(); onReload() }}
          customerId={customerId}
        />
      )}
      {contacts.map((p) => {
        const open = expanded === p.id
        return (
          <div key={p.id} style={{ padding: '13px 0', borderBottom: '1px solid #F2F3F9' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: p.isPrimary ? '#2A6FDB' : '#F2F3F9', color: p.isPrimary ? '#fff' : '#3B3B52', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {(p.nickname || p.firstName || p.name || 'C').replace('คุณ', '').trim()[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {p.name}
                  {p.nickname && <span style={{ color: '#8888A0', fontWeight: 500, fontSize: 12 }}>({p.nickname})</span>}
                  {p.isPrimary && <span style={{ background: '#E4EDFC', color: '#2A6FDB', borderRadius: 6, fontSize: 10, fontWeight: 700, padding: '2px 7px' }}>PRIMARY</span>}
                </div>
                <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 2 }}>
                  {p.position || p.role || '—'}{p.department ? ` · ${p.department}` : ''}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: '#3B3B52', width: 160 }}>
                <div>{p.phone}</div>
                {p.telephone && <div style={{ color: '#8888A0', fontSize: 11 }}>Tel: {p.telephone}</div>}
              </div>
              <div style={{ fontSize: 12.5, color: '#3B3B52', width: 240 }}>{p.email}</div>
              <div onClick={() => setExpanded(open ? null : p.id)} style={{ fontSize: 11, color: '#2A6FDB', cursor: 'pointer', fontWeight: 700, padding: '4px 8px' }}>{open ? 'Less' : 'More'}</div>
              {canWrite && (
                <>
                  <div onClick={() => startEdit(p)} style={{ border: '1px solid #E5E7F0', borderRadius: 8, fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}>Edit</div>
                  <div onClick={() => remove(p)} style={{ color: '#C0392B', fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}>Delete</div>
                </>
              )}
            </div>
            {open && (
              <div style={{ marginTop: 10, marginLeft: 52, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 24px', fontSize: 12.5, background: '#FAFBFD', border: '1px solid #E5E7F0', borderRadius: 8, padding: '10px 14px' }}>
                <MetaRow label="First name" value={p.firstName} />
                <MetaRow label="Last name" value={p.lastName} />
                <MetaRow label="Nickname" value={p.nickname} />
                <MetaRow label="Position" value={p.position} />
                <MetaRow label="Department" value={p.department} />
                <MetaRow label="LINE ID" value={p.lineId} />
                {p.notes && <div style={{ gridColumn: '1 / -1' }}><MetaRow label="Notes" value={p.notes} /></div>}
              </div>
            )}
          </div>
        )
      })}
      {contacts.length === 0 && !formOpen && (
        <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No contacts yet.</div>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 12, color: value ? '#1E1E30' : '#B4B4C4', fontWeight: value ? 600 : 400 }}>{value || '—'}</div>
    </div>
  )
}

function ContactForm({ initial, customerId, onCancel, onSaved }: { initial?: ContactDto; customerId: string; onCancel: () => void; onSaved: () => void }) {
  // Legacy contacts have only `name` — split it so the form isn't empty on first edit.
  const legacySplit = (() => {
    if (!initial) return { first: '', last: '' }
    if (initial.firstName || initial.lastName) return { first: initial.firstName ?? '', last: initial.lastName ?? '' }
    const raw = (initial.name ?? '').replace(/^คุณ\s*/, '').trim()
    if (!raw) return { first: '', last: '' }
    const parts = raw.split(/\s+/)
    return { first: parts[0] ?? '', last: parts.slice(1).join(' ') }
  })()
  const [firstName, setFirstName] = useState(legacySplit.first)
  const [lastName, setLastName] = useState(legacySplit.last)
  const [nickname, setNickname] = useState(initial?.nickname ?? '')
  const [position, setPosition] = useState(initial?.position ?? initial?.role ?? '')
  const [department, setDepartment] = useState(initial?.department ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [mobile, setMobile] = useState(initial?.phone ?? '')
  const [telephone, setTelephone] = useState(initial?.telephone ?? '')
  const [lineId, setLineId] = useState(initial?.lineId ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() && !lastName.trim() && !nickname.trim()) {
      setError('Please provide at least a first name, last name, or nickname')
      return
    }
    setBusy(true); setError(null)
    try {
      if (initial) {
        const body: UpdateContactDto = {
          firstName: firstName || null, lastName: lastName || null, nickname: nickname || null,
          position: position || null, department: department || null, role: position || undefined,
          email, phone: mobile, telephone: telephone || null,
          lineId: lineId || null, notes: notes || null,
          isPrimary,
        }
        await api.updateContact(initial.id, body)
      } else {
        const body: CreateContactDto = {
          firstName: firstName || undefined, lastName: lastName || undefined, nickname: nickname || undefined,
          position: position || undefined, department: department || undefined, role: position || '',
          email, phone: mobile, telephone: telephone || undefined,
          lineId: lineId || undefined, notes: notes || undefined,
          isPrimary,
        }
        await api.createContact(customerId, body)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed')
    } finally { setBusy(false) }
  }

  const initial1 = (nickname || firstName || lastName || 'C').replace(/^คุณ\s*/, '').trim()[0]?.toUpperCase() ?? 'C'
  const emailInvalid = email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  return (
    <form onSubmit={submit} style={{ padding: '18px 4px 4px', borderBottom: '1px solid #F2F3F9' }}>
      {/* Header — avatar preview + title + primary toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: isPrimary ? '#2A6FDB' : '#F2F3F9',
          color: isPrimary ? '#fff' : '#3B3B52',
          fontSize: 15, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
          transition: 'background .12s',
        }}>{initial1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{initial ? 'Edit contact' : 'Add contact'}</div>
          <div style={{ fontSize: 11.5, color: '#8888A0', marginTop: 2 }}>
            {initial ? 'Update the person you deal with.' : 'A person at this company — decision maker, day-to-day, or referral.'}
          </div>
        </div>
        {/* Primary contact toggle — big enough to see, not a hidden checkbox */}
        <PrimaryToggle value={isPrimary} onChange={setIsPrimary} />
      </div>

      {/* ── Identity ─────────────────────────────────────────────── */}
      <SectionHeader label="Identity" hint="Who they are — name, nickname, and role at the company." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px', marginBottom: 20 }}>
        <Field label="First name" required>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" style={contactInput} />
        </Field>
        <Field label="Last name">
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" style={contactInput} />
        </Field>
        <Field label="Nickname (ชื่อเล่น)" hint="What their colleagues call them — shows in the contact list.">
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Nong, Jay" autoComplete="nickname" style={contactInput} />
        </Field>
        <div /> {/* spacer to keep nickname on its own row */}
        <Field label="Position (ตำแหน่ง)">
          <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. IT Manager" autoComplete="organization-title" style={contactInput} />
        </Field>
        <Field label="Department (แผนก)">
          <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Operations" style={contactInput} />
        </Field>
      </div>

      {/* ── Reach ────────────────────────────────────────────────── */}
      <SectionHeader label="How to reach them" hint="At least one channel — email or mobile is usually required to close the loop." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px', marginBottom: 20 }}>
        <Field label="Email" required error={emailInvalid ? 'Invalid email format' : undefined}>
          <InputWithIcon icon={<MailIcon />}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="name@company.com" style={contactInputBare} />
          </InputWithIcon>
        </Field>
        <Field label="Mobile" required hint="Best channel for a quick call — SMS/LINE later fine too.">
          <InputWithIcon icon={<PhoneIcon />}>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="+66 8x xxx xxxx" style={contactInputBare} />
          </InputWithIcon>
        </Field>
        <Field label="Office telephone" hint="Landline — useful for reaching them at work when their mobile is off.">
          <InputWithIcon icon={<PhoneIcon />}>
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} inputMode="tel" autoComplete="tel-national" placeholder="02 xxx xxxx" style={contactInputBare} />
          </InputWithIcon>
        </Field>
        <Field label="LINE ID" hint="Common in TH — attach here so reps see it in the mobile app too.">
          <InputWithIcon icon={<ChatIcon />}>
            <input value={lineId} onChange={(e) => setLineId(e.target.value)} placeholder="@lineid" style={contactInputBare} />
          </InputWithIcon>
        </Field>
      </div>

      {/* ── Notes ────────────────────────────────────────────────── */}
      <SectionHeader label="Notes" hint="Context that isn't obvious from the profile — preferences, blockers, family, hobbies." />
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Prefers WhatsApp over email · Golfs at Alpine on Sundays · Wife's name is Ploy…"
          style={{ ...contactInput, resize: 'vertical', paddingRight: 46, minHeight: 90 }}
        />
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <VoiceInputButton value={notes} onChange={setNotes} size="sm" label="Dictate contact notes" />
        </div>
      </div>

      {/* Sticky action bar */}
      <div style={{
        position: 'sticky', bottom: 0, background: '#fff',
        borderTop: '1px solid #F2F3F9',
        display: 'flex', gap: 10, alignItems: 'center',
        padding: '14px 0 6px', marginTop: 6,
      }}>
        {error && <div style={{ color: '#C0392B', fontSize: 12, fontWeight: 600 }}>⚠ {error}</div>}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onCancel} style={{ background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 18px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        <button type="submit" disabled={busy || emailInvalid} style={{ background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 20px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: busy || emailInvalid ? 0.55 : 1 }}>
          {busy ? 'Saving…' : (initial ? 'Save changes' : 'Add contact')}
        </button>
      </div>
    </form>
  )
}

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#4A3AB8' }}>{label}</div>
      {hint && <div style={{ fontSize: 11.5, color: '#8888A0', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

function PrimaryToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      title={value ? 'This is the main contact — appears first everywhere.' : 'Mark as the main contact for this company.'}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 10px 5px 6px', borderRadius: 999, cursor: 'pointer',
        background: value ? '#E4EDFC' : '#F7F8FC',
        border: `1px solid ${value ? '#B7CFF3' : '#E5E7F0'}`,
      }}
    >
      <div style={{
        width: 32, height: 18, borderRadius: 999, position: 'relative',
        background: value ? '#2A6FDB' : '#D0D0DF', transition: 'background .12s',
      }}>
        <div style={{
          position: 'absolute', top: 2, left: value ? 16 : 2,
          width: 14, height: 14, borderRadius: '50%', background: '#fff',
          transition: 'left .12s',
        }} />
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: value ? '#2A6FDB' : '#5C5C74' }}>
        Primary contact
      </span>
    </div>
  )
}

function InputWithIcon({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      border: '1px solid #E5E7F0', borderRadius: 9,
      padding: '0 10px 0 10px', background: '#fff',
      transition: 'border-color .12s',
    }}>
      <div style={{ color: '#8888A0', display: 'flex', alignItems: 'center', flex: 'none', marginRight: 8 }}>{icon}</div>
      {children}
    </div>
  )
}

function MailIcon() { return <svg viewBox="0 0 24 24" width="15" height="15"><path d="M3 6.5A2.5 2.5 0 015.5 4h13A2.5 2.5 0 0121 6.5v11A2.5 2.5 0 0118.5 20h-13A2.5 2.5 0 013 17.5v-11zm2.4-.5l6.6 5.3L18.6 6H5.4z" fill="currentColor" /></svg> }
function PhoneIcon() { return <svg viewBox="0 0 24 24" width="15" height="15"><path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2c.3-.3.7-.4 1-.3a11 11 0 003.5.6c.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 013 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1a11 11 0 00.6 3.5c.1.4 0 .7-.3 1L6.6 10.8z" fill="currentColor" /></svg> }
function ChatIcon() { return <svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 4h16a1 1 0 011 1v11a1 1 0 01-1 1H8l-4 4V5a1 1 0 011-1z" fill="currentColor" /></svg> }

const contactInput: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', color: '#1E1E30', background: '#fff' }
const contactInputBare: CSSProperties = { flex: 1, minWidth: 0, border: 'none', outline: 'none', padding: '9px 0', fontSize: 13, background: 'transparent', color: '#1E1E30' }

function Field({ label, children, required, hint, error }: { label: string; children: ReactNode; required?: boolean; hint?: string; error?: string }) {
  return (
    <div>
      <div style={{ ...fieldLabel, display: 'flex', gap: 4, alignItems: 'baseline' }}>
        <span>{label}</span>
        {required && <span style={{ color: '#C0392B' }}>*</span>}
      </div>
      {children}
      {error && <div style={{ fontSize: 10.5, color: '#C0392B', marginTop: 3, fontWeight: 600 }}>{error}</div>}
      {!error && hint && <div style={{ fontSize: 10.5, color: '#8888A0', marginTop: 3, lineHeight: 1.35 }}>{hint}</div>}
    </div>
  )
}

function CustomerTagsRow({ customer, onChanged, canWrite, onToast }: { customer: CustomerDto; onChanged: () => void; canWrite: boolean; onToast: (m: string) => void }) {
  const [picking, setPicking] = useState(false)
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {customer.tags.map((t) => (
        <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: hexToRgba(t.color, 0.12), color: t.color, borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '3px 9px', border: `1px solid ${hexToRgba(t.color, 0.35)}` }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }} />
          {t.name}
        </span>
      ))}
      {canWrite && (
        <div onClick={() => setPicking(true)} style={{ background: '#F2F3F9', color: '#5C5C74', border: '1px dashed #C4CBDA', borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '3px 9px', cursor: 'pointer' }}>
          + Tag
        </div>
      )}
      {picking && (
        <TagPickerModal
          currentIds={customer.tags.map((t) => t.id)}
          onClose={() => setPicking(false)}
          onSaved={() => { setPicking(false); onToast('Tags updated'); onChanged() }}
          customerId={customer.id}
          onToast={onToast}
        />
      )}
    </div>
  )
}

function TagPickerModal({ customerId, currentIds, onClose, onSaved, onToast }: { customerId: string; currentIds: string[]; onClose: () => void; onSaved: () => void; onToast: (m: string) => void }) {
  const [tags, setTags] = useState<TagDto[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(currentIds))
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#2A6FDB')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('#2A6FDB')

  const loadTags = () => api.tags().then((t) => setTags(t.sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {})
  useEffect(() => { loadTags() }, [])

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const createTag = async () => {
    if (!newName.trim()) return
    try {
      const t = await api.createTag({ name: newName.trim(), color: newColor, kind: 'department' })
      setTags((all) => [...all, t].sort((a, b) => a.name.localeCompare(b.name)))
      setSelected((s) => new Set(s).add(t.id))
      setNewName('')
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Create failed')
    }
  }

  const startEdit = (t: TagDto) => {
    setEditingId(t.id)
    setEditName(t.name)
    setEditColor(t.color)
  }
  const cancelEdit = () => { setEditingId(null); setEditName(''); setEditColor('#2A6FDB') }
  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return
    try {
      const updated = await api.updateTag(editingId, { name: editName.trim(), color: editColor })
      setTags((all) => all.map((x) => x.id === updated.id ? { ...updated, usageCount: x.usageCount } : x).sort((a, b) => a.name.localeCompare(b.name)))
      cancelEdit()
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Update failed')
    }
  }

  const removeTag = async (t: TagDto) => {
    const inUse = t.usageCount ?? 0
    const msg = inUse > 0
      ? `Delete tag "${t.name}"? It's applied to ${inUse} customer${inUse === 1 ? '' : 's'} — they will be un-tagged.`
      : `Delete tag "${t.name}"?`
    if (!window.confirm(msg)) return
    try {
      await api.deleteTag(t.id)
      setTags((all) => all.filter((x) => x.id !== t.id))
      setSelected((s) => { const n = new Set(s); n.delete(t.id); return n })
      onToast('Tag deleted')
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Delete failed')
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.setCustomerTags(customerId, Array.from(selected))
      onSaved()
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 500, maxHeight: '80vh', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7F0' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Assign service tags</div>
          <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 3 }}>Click a tag to (un)assign. Hover to rename or delete.</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '10px 18px' }}>
          {tags.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 12 }}>No tags yet — create the first one below.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tags.map((t) => {
              const on = selected.has(t.id)
              if (editingId === t.id) {
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, background: '#FAFBFD', border: '1px solid #B7CFF3' }}>
                    <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} style={{ width: 28, height: 28, border: '1px solid #E5E7F0', borderRadius: 5, padding: 1, flex: 'none' }} />
                    <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit() } if (e.key === 'Escape') cancelEdit() }} style={{ ...fieldInput, flex: 1 }} />
                    <button type="button" onClick={saveEdit} disabled={!editName.trim()} style={{ background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                    <button type="button" onClick={cancelEdit} style={{ background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 7, padding: '6px 11px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  </div>
                )
              }
              return (
                <div key={t.id} className="tag-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, background: on ? hexToRgba(t.color, 0.09) : 'transparent', border: `1px solid ${on ? hexToRgba(t.color, 0.4) : '#F1F1F5'}` }}>
                  <div onClick={() => toggle(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer' }}>
                    <input type="checkbox" readOnly checked={on} style={{ pointerEvents: 'none' }} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                      {t.description && <div style={{ fontSize: 10.5, color: '#8888A0' }}>{t.description}</div>}
                    </div>
                    <div style={{ fontSize: 10, color: '#8888A0', whiteSpace: 'nowrap' }}>{t.kind}{t.usageCount != null ? ` · ${t.usageCount}` : ''}</div>
                  </div>
                  <button type="button" onClick={() => startEdit(t)} title="Rename / recolor" style={iconBtn}>
                    <svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 20h4l10-10-4-4-10 10v4z M14 6l4 4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <button type="button" onClick={() => removeTag(t)} title="Delete tag" style={{ ...iconBtn, color: '#C0392B' }}>
                    <svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 7h14 M8 7l1-3h6l1 3 M9 11v6 M15 11v6 M6.5 7l1 12a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid #F1F1F5', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New tag name…" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createTag() } }} style={{ ...fieldInput, flex: 1 }} />
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: 34, height: 32, border: '1px solid #E5E7F0', borderRadius: 6, padding: 1 }} />
          <button type="button" onClick={createTag} disabled={!newName.trim()} style={{ background: '#F2F3F9', color: '#3B3B52', border: '1px solid #E5E7F0', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Create</button>
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #F1F1F5', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 8, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="button" disabled={saving} onClick={save} style={{ background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ═══════════════════════════════════════════════════════════════════════
// Documents portal — per-customer view, grouped by Project (opportunity)
// and further split by category.
// ═══════════════════════════════════════════════════════════════════════
const DOC_CAT_STYLE: Record<string, { bg: string; fg: string }> = {
  contract:    { bg: '#E4EDFC', fg: '#2A6FDB' },
  amendment:   { bg: '#FEF3E2', fg: '#B4650A' },
  addendum:    { bg: '#F7EBD9', fg: '#D2601A' },
  appendix:    { bg: '#EAE7F7', fg: '#5B3FC4' },
  sow:         { bg: '#F4F1FD', fg: '#4A3AB8' },
  nda:         { bg: '#FDECEA', fg: '#C0392B' },
  po:          { bg: '#EAF3EC', fg: '#0E6E4E' },
  invoice:     { bg: '#E5F8ED', fg: '#0E6E4E' },
  receipt:     { bg: '#E1F3E7', fg: '#1E8A4C' },
  quotation:   { bg: '#E7EDF9', fg: '#1F5AC2' },
  tor:         { bg: '#EEF0FA', fg: '#4A3AB8' },
  boq:         { bg: '#F1F1F5', fg: '#5C5C74' },
  certificate: { bg: '#FEEFE6', fg: '#D2601A' },
  brochure:    { bg: '#FCE9F2', fg: '#D6337A' },
  other:       { bg: '#F2F3F9', fg: '#5C5C74' },
}

const GENERAL_PROJECT_ID = '__general__'
type ProjectKey = string  // opp.id or GENERAL_PROJECT_ID

function CustomerDocumentsPortal({ customerId, customerName, canWrite, onToast }: {
  customerId: string; customerName: string; canWrite: boolean; onToast: (m: string) => void
}) {
  const [docs, setDocs] = useState<DocumentDto[]>([])
  const [opps, setOpps] = useState<OpportunityDto[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState<DocumentCategory | 'all'>('all')
  const [collapsed, setCollapsed] = useState<Set<ProjectKey>>(new Set())
  const [uploadOpen, setUploadOpen] = useState<null | { projectId: ProjectKey | null }>(null)
  const [viewing, setViewing] = useState<ViewableVersion | null>(null)

  const reload = async () => {
    setLoading(true)
    try {
      // Opportunities aren't filterable by customerId server-side — filter locally.
      const [d, o] = await Promise.all([
        api.documents({ customerId }),
        api.opportunities({}).catch(() => [] as OpportunityDto[]),
      ])
      setDocs(d)
      setOpps(o.filter((x) => x.customerId === customerId))
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Failed to load documents')
    } finally { setLoading(false) }
  }
  useEffect(() => { void reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [customerId])

  const oppTitleById = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of opps) m.set(o.id, o.title)
    return m
  }, [opps])

  // Filter (search + category), then bucket by project → category.
  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase()
    return docs.filter((d) => {
      if (catFilter !== 'all' && d.category !== catFilter) return false
      if (!nq) return true
      const hay = `${d.name} ${d.description ?? ''} ${d.currentVersion?.filename ?? ''}`.toLowerCase()
      return hay.includes(nq)
    })
  }, [docs, q, catFilter])

  const grouped = useMemo(() => {
    const byProject = new Map<ProjectKey, DocumentDto[]>()
    for (const d of filtered) {
      const key = d.opportunityId && oppTitleById.has(d.opportunityId) ? d.opportunityId : GENERAL_PROJECT_ID
      const bucket = byProject.get(key) ?? []
      bucket.push(d)
      byProject.set(key, bucket)
    }
    // Order: projects with docs sorted by title, "General" last.
    const withOpps = [...byProject.entries()]
      .filter(([k]) => k !== GENERAL_PROJECT_ID)
      .sort(([a], [b]) => (oppTitleById.get(a) ?? '').localeCompare(oppTitleById.get(b) ?? ''))
    const general = byProject.get(GENERAL_PROJECT_ID)
    if (general && general.length) withOpps.push([GENERAL_PROJECT_ID, general])
    return withOpps
  }, [filtered, oppTitleById])

  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of docs) m[d.category] = (m[d.category] ?? 0) + 1
    return m
  }, [docs])

  const toggle = (key: ProjectKey) => setCollapsed((s) => {
    const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n
  })

  const del = async (d: DocumentDto) => {
    if (!window.confirm(`Delete "${d.name}"?`)) return
    try { await api.deleteDocument(d.id); onToast('Deleted'); void reload() }
    catch (e) { onToast(e instanceof ApiError ? e.message : 'Delete failed') }
  }

  const openDoc = (d: DocumentDto) => {
    if (d.kind === 'link' && d.url) { window.open(d.url, '_blank', 'noopener'); return }
    const cv = d.currentVersion
    if (!cv) return
    setViewing({ id: cv.id, filename: cv.filename, mimeType: cv.mimeType, sizeBytes: cv.sizeBytes, createdAt: cv.createdAt, uploadedByName: cv.uploadedByName, notes: cv.notes })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Portal header + toolbar */}
      <div style={{ ...card, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EAE7F7', color: '#4A3AB8', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M6.5 3h8l4 4v14h-12z M14 3v5h4.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700 }}>{customerName} · Document portal</div>
            <div style={{ fontSize: 11.5, color: '#8888A0', marginTop: 2 }}>
              {docs.length} file{docs.length === 1 ? '' : 's'} across {grouped.length || 1} project{grouped.length === 1 ? '' : 's'} · grouped by project → category
            </div>
          </div>
          {canWrite && <div onClick={() => setUploadOpen({ projectId: null })} style={docsPrimaryBtn}>+ Upload file</div>}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 380 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8888A0' }}>
              <path d="M11 4a7 7 0 105.196 11.803l3.5 3.5a1 1 0 001.415-1.414l-3.5-3.5A7 7 0 0011 4zm-5 7a5 5 0 1110 0 5 5 0 01-10 0z" fill="currentColor" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files by name…"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E5E7F0', borderRadius: 9, padding: '7px 30px', fontSize: 12.5, outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <FilterChip active={catFilter === 'all'} onClick={() => setCatFilter('all')} label="All types" count={docs.length} />
            {DOCUMENT_CATEGORIES.filter((c) => categoryCounts[c.id]).map((c) => (
              <FilterChip key={c.id} active={catFilter === c.id} onClick={() => setCatFilter(catFilter === c.id ? 'all' : c.id)} label={c.label} count={categoryCounts[c.id]} tone={DOC_CAT_STYLE[c.id]} />
            ))}
          </div>
        </div>
      </div>

      {/* Body — grouped list */}
      {loading ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading documents…</div>
      ) : docs.length === 0 ? (
        <div style={{ ...card, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📁</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#3B3B52' }}>No documents for {customerName} yet.</div>
          <div style={{ fontSize: 12, color: '#8888A0', marginTop: 4 }}>Upload contracts, quotations, POs, receipts — they'll be organized by project automatically.</div>
          {canWrite && <div onClick={() => setUploadOpen({ projectId: null })} style={{ ...docsPrimaryBtn, marginTop: 14, display: 'inline-block' }}>+ Upload first file</div>}
        </div>
      ) : grouped.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>
          No files match your search or filter.
        </div>
      ) : grouped.map(([projectKey, projectDocs]) => {
        const isCollapsed = collapsed.has(projectKey)
        const isGeneral = projectKey === GENERAL_PROJECT_ID
        const title = isGeneral ? 'General · Company-wide' : (oppTitleById.get(projectKey) ?? 'Project')
        const subtitle = isGeneral ? 'Files not tied to a specific deal (registration, MOU, brochures…)' : 'Opportunity'
        // Sub-group by category inside the project.
        const byCat = new Map<DocumentCategory, DocumentDto[]>()
        for (const d of projectDocs) {
          const arr = byCat.get(d.category) ?? []
          arr.push(d); byCat.set(d.category, arr)
        }
        const orderedCats = DOCUMENT_CATEGORIES.filter((c) => byCat.has(c.id))
        return (
          <div key={projectKey} style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div
              onClick={() => toggle(projectKey)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '14px 18px', cursor: 'pointer',
                background: isGeneral ? 'linear-gradient(135deg, #F4F1FD, #FBFAFE)' : '#fff',
                borderBottom: isCollapsed ? 'none' : '1px solid #F2F3F9',
              }}
            >
              <div style={{ color: '#8888A0', fontSize: 12, transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .12s' }}>▾</div>
              <div style={{
                width: 32, height: 32, borderRadius: 9, flex: 'none',
                background: isGeneral ? '#4A3AB8' : '#EEF0FA',
                color: isGeneral ? '#fff' : '#2A6FDB',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 7h6l2 2h10v11H3z" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E1E30', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                <div style={{ fontSize: 11, color: '#8888A0' }}>{subtitle} · {projectDocs.length} file{projectDocs.length === 1 ? '' : 's'}</div>
              </div>
              {canWrite && !isGeneral && (
                <div
                  onClick={(e) => { e.stopPropagation(); setUploadOpen({ projectId: projectKey }) }}
                  title="Upload a file to this project"
                  style={{ ...docsGhostBtn, fontSize: 11 }}
                >+ File</div>
              )}
              {canWrite && isGeneral && (
                <div
                  onClick={(e) => { e.stopPropagation(); setUploadOpen({ projectId: null }) }}
                  title="Upload a general (non-project) file"
                  style={{ ...docsGhostBtn, fontSize: 11 }}
                >+ File</div>
              )}
            </div>

            {!isCollapsed && (
              <div style={{ padding: '4px 18px 14px' }}>
                {orderedCats.map((c) => {
                  const list = byCat.get(c.id) ?? []
                  const tone = DOC_CAT_STYLE[c.id] ?? DOC_CAT_STYLE.other
                  return (
                    <div key={c.id} style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 6px' }}>
                        <span style={{ background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.05em' }}>{c.label}</span>
                        <span style={{ fontSize: 11, color: '#8888A0' }}>{c.th}</span>
                        <div style={{ flex: 1, height: 1, background: '#F2F3F9' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#8888A0' }}>{list.length}</span>
                      </div>
                      {list.map((d) => (
                        <DocRow key={d.id} d={d} canWrite={canWrite} onOpen={() => openDoc(d)} onDelete={() => del(d)} />
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {viewing && <DocumentViewer version={viewing} onClose={() => setViewing(null)} />}

      {uploadOpen && (
        <PortalUploadModal
          customerId={customerId}
          customerName={customerName}
          opportunities={opps}
          defaultProjectId={uploadOpen.projectId}
          onClose={() => setUploadOpen(null)}
          onDone={() => { setUploadOpen(null); void reload() }}
          onToast={onToast}
        />
      )}
    </div>
  )
}

function DocRow({ d, canWrite, onOpen, onDelete }: { d: DocumentDto; canWrite: boolean; onOpen: () => void; onDelete: () => void }) {
  const cv = d.currentVersion
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFBFD' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" style={{ color: '#8888A0', flex: 'none' }}>
        <path d="M6.5 3h8l4 4v14h-12z M14 3v5h4.5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={onOpen} title="Open in viewer"
          style={{ fontSize: 12.5, fontWeight: 700, color: '#2A6FDB', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.name}
          {d.kind === 'link' && <span style={{ marginLeft: 6, background: '#EEF0FA', color: '#4A3AB8', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 999, textTransform: 'uppercase' }}>link</span>}
        </div>
        <div style={{ fontSize: 10.5, color: '#8888A0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {cv ? `${cv.filename} · ${Math.max(1, Math.round(cv.sizeBytes / 1024))} KB · v${cv.versionNo}` : d.kind === 'link' ? d.url : '—'}
          {' · '}{d.uploadedByName}
          {cv ? ` · ${new Date(cv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}` : ''}
        </div>
      </div>
      {cv && (
        <a href={api.documentDownloadUrl(cv.id)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
          title="Download" style={{ ...docsGhostBtn, fontSize: 11, textDecoration: 'none' }}>↓</a>
      )}
      {canWrite && (
        <div onClick={onDelete} title="Delete" style={{ color: '#C0392B', fontSize: 11, fontWeight: 700, padding: '4px 8px', cursor: 'pointer' }}>×</div>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, label, count, tone }: {
  active: boolean; onClick: () => void; label: string; count: number; tone?: { bg: string; fg: string }
}) {
  const bg = active ? (tone?.fg ?? '#2A6FDB') : (tone?.bg ?? '#F2F3F9')
  const fg = active ? '#fff' : (tone?.fg ?? '#5C5C74')
  return (
    <div onClick={onClick} style={{
      cursor: 'pointer', background: bg, color: fg,
      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
      border: '1px solid transparent', whiteSpace: 'nowrap',
    }}>
      {label} · {count}
    </div>
  )
}

function PortalUploadModal({ customerId, customerName, opportunities, defaultProjectId, onClose, onDone, onToast }: {
  customerId: string; customerName: string
  opportunities: OpportunityDto[]
  defaultProjectId: ProjectKey | null
  onClose: () => void; onDone: () => void; onToast: (m: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<DocumentCategory | ''>('')
  const [projectId, setProjectId] = useState<string>(defaultProjectId && defaultProjectId !== GENERAL_PROJECT_ID ? defaultProjectId : '')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const onFile = (e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)

  const submit = async () => {
    if (!file) return
    setBusy(true)
    try {
      await api.uploadDocument(file, {
        customerId,
        opportunityId: projectId || undefined,
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        category: category || undefined,
      })
      onToast('File uploaded'); onDone()
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Upload failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={docsBackdrop} onClick={onClose}>
      <div style={docsDialog} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 700, flex: 1 }}>Upload document · {customerName}</div>
          <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0' }}>×</div>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1.5px dashed #D0D0DF', borderRadius: 10, padding: 12 }}>
            <input type="file" onChange={onFile} />
            {file && <div style={{ fontSize: 12, color: '#5C5C74' }}>{file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)</div>}
          </div>
          <label>
            <div style={fieldLabel}>Project (optional)</div>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ ...fieldInput, width: '100%' }}>
              <option value="">— General (no project) —</option>
              {opportunities.map((o) => <option key={o.id} value={o.id}>{o.title} · {o.stage}</option>)}
            </select>
            <div style={{ fontSize: 10.5, color: '#8888A0', marginTop: 4 }}>Attaching to a project groups the file under that deal in the portal.</div>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              <div style={fieldLabel}>Category</div>
              <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory | '')} style={{ ...fieldInput, width: '100%' }}>
                <option value="">Auto-detect</option>
                {DOCUMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.th}</option>)}
              </select>
            </label>
            <label>
              <div style={fieldLabel}>Display name (optional)</div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to filename" style={{ ...fieldInput, width: '100%' }} />
            </label>
          </div>
          <label>
            <div style={fieldLabel}>Description (optional)</div>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this document is about" style={{ ...fieldInput, width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
          </label>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={docsGhostBtnLg}>Cancel</button>
          <button type="button" disabled={!file || busy} onClick={submit} style={{ ...docsPrimaryBtnLg, opacity: !file || busy ? 0.5 : 1 }}>{busy ? 'Uploading…' : 'Upload'}</button>
        </div>
      </div>
    </div>
  )
}

const docsPrimaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const docsGhostBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', color: '#3B3B52', borderRadius: 8, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }
const docsBackdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const docsDialog: CSSProperties = { background: '#fff', width: '100%', maxWidth: 560, borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const docsPrimaryBtnLg: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const docsGhostBtnLg: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14 }
const metaLabel: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8888A0' }
const metaValue: CSSProperties = { fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 600, marginTop: 3 }
const fieldLabel: CSSProperties = { color: '#8888A0', fontSize: 11, fontWeight: 600, marginBottom: 2 }
const fieldInput: CSSProperties = { border: '1px solid #E5E7F0', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, outline: 'none' }
const iconBtn: CSSProperties = { background: 'transparent', border: '1px solid transparent', borderRadius: 6, padding: '4px 6px', color: '#5C5C74', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
function tabStyle(active: boolean): CSSProperties {
  return {
    padding: '9px 15px', fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? '#2A6FDB' : '#5C5C74',
    borderBottom: active ? '2.5px solid #2A6FDB' : '2.5px solid transparent',
    cursor: 'pointer', marginBottom: -1,
  }
}
