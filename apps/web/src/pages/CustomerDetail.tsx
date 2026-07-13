import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ContactDto, CreateContactDto, CustomerDto, TagDto, UpdateContactDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { fmt, initialsOf } from '../data/mockData'
import { statusStyle } from '../lib/styleUtils'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

type Tab = 'overview' | 'contacts' | 'opps' | 'quotes' | 'docs' | 'timeline'
const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['contacts', 'Contacts'],
  ['opps', 'Opportunities'],
  ['quotes', 'Quotations'],
  ['docs', 'Documents'],
  ['timeline', 'Timeline'],
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

      {(tab === 'opps' || tab === 'quotes' || tab === 'docs' || tab === 'timeline') && (
        <div style={{ ...card, padding: 24, color: '#8888A0', fontSize: 13 }}>
          Coming in Phase 2/3 — will show real data once Opportunities/Quotations/Documents modules ship.
        </div>
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
  const [firstName, setFirstName] = useState(initial?.firstName ?? '')
  const [lastName, setLastName] = useState(initial?.lastName ?? '')
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

  return (
    <form onSubmit={submit} style={{ padding: '16px 0 20px', borderBottom: '1px solid #F2F3F9' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{initial ? 'Edit contact' : 'Add contact'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 14px' }}>
        <Field label="First name *"><input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={fieldInput} /></Field>
        <Field label="Last name"><input value={lastName} onChange={(e) => setLastName(e.target.value)} style={fieldInput} /></Field>
        <Field label="Nickname (ชื่อเล่น)"><input value={nickname} onChange={(e) => setNickname(e.target.value)} style={fieldInput} /></Field>
        <Field label="Position (ตำแหน่ง)"><input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. IT Manager" style={fieldInput} /></Field>
        <Field label="Department (แผนก)"><input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Operations" style={fieldInput} /></Field>
        <Field label="Email *"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={fieldInput} /></Field>
        <Field label="Mobile *"><input value={mobile} onChange={(e) => setMobile(e.target.value)} required placeholder="+66 8x xxx xxxx" style={fieldInput} /></Field>
        <Field label="Telephone"><input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Office landline" style={fieldInput} /></Field>
        <Field label="LINE ID"><input value={lineId} onChange={(e) => setLineId(e.target.value)} style={fieldInput} /></Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...fieldInput, resize: 'vertical' }} /></Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 14, alignItems: 'center' }}>
        <label style={{ fontSize: 12, color: '#5C5C74', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} /> Primary contact
        </label>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onCancel} style={{ background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 8, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        <button type="submit" disabled={busy} style={{ background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Saving…' : (initial ? 'Save changes' : 'Add contact')}</button>
      </div>
      {error && <div style={{ color: '#C0392B', fontSize: 12, marginTop: 10 }}>{error}</div>}
    </form>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      {children}
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

  const loadTags = () => api.tags().then(setTags).catch(() => {})
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
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 460, maxHeight: '80vh', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7F0' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Assign service tags</div>
          <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 3 }}>Tag customers with the service departments that own them.</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '10px 18px' }}>
          {tags.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 12 }}>No tags yet — create the first one below.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tags.map((t) => {
              const on = selected.has(t.id)
              return (
                <div key={t.id} onClick={() => toggle(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', background: on ? hexToRgba(t.color, 0.09) : 'transparent', border: `1px solid ${on ? hexToRgba(t.color, 0.4) : '#F1F1F5'}` }}>
                  <input type="checkbox" readOnly checked={on} style={{ pointerEvents: 'none' }} />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flex: 'none' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.name}</div>
                    {t.description && <div style={{ fontSize: 10.5, color: '#8888A0' }}>{t.description}</div>}
                  </div>
                  <div style={{ fontSize: 10, color: '#8888A0' }}>{t.kind}{t.usageCount != null ? ` · ${t.usageCount}` : ''}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid #F1F1F5', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New tag name…" style={{ ...fieldInput, flex: 1 }} />
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

const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14 }
const metaLabel: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8888A0' }
const metaValue: CSSProperties = { fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 600, marginTop: 3 }
const fieldLabel: CSSProperties = { color: '#8888A0', fontSize: 11, fontWeight: 600, marginBottom: 2 }
const fieldInput: CSSProperties = { border: '1px solid #E5E7F0', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, outline: 'none' }
function tabStyle(active: boolean): CSSProperties {
  return {
    padding: '9px 15px', fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? '#2A6FDB' : '#5C5C74',
    borderBottom: active ? '2.5px solid #2A6FDB' : '2.5px solid transparent',
    cursor: 'pointer', marginBottom: -1,
  }
}
