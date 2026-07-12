import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ContactDto, CustomerDto } from '@bluefish/shared'
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
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<ContactDto | null>(null)

  const remove = async (c: ContactDto) => {
    if (!window.confirm(`Delete contact ${c.name}?`)) return
    try { await api.deleteContact(c.id); onToast('Contact deleted'); onReload() }
    catch (e) { onToast(e instanceof ApiError ? e.message : 'Delete failed') }
  }

  return (
    <div style={{ ...card, padding: '6px 20px' }}>
      {canWrite && !showAdd && !editing && (
        <div style={{ padding: '12px 0', borderBottom: '1px solid #F2F3F9' }}>
          <div onClick={() => setShowAdd(true)} style={{ display: 'inline-block', background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>+ Add contact</div>
        </div>
      )}
      {(showAdd || editing) && (
        <ContactForm
          initial={editing ?? undefined}
          onCancel={() => { setShowAdd(false); setEditing(null) }}
          onSaved={() => { setShowAdd(false); setEditing(null); onReload() }}
          customerId={customerId}
        />
      )}
      {contacts.map((p) => (
        <div key={p.id} style={{ display: 'flex', gap: 12, padding: '13px 0', borderBottom: '1px solid #F2F3F9', alignItems: 'center' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#F2F3F9', color: '#3B3B52', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {p.name.replace('คุณ', '').trim()[0]}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              {p.name}
              {p.isPrimary && <span style={{ background: '#E4EDFC', color: '#2A6FDB', borderRadius: 6, fontSize: 10, fontWeight: 700, padding: '2px 7px' }}>PRIMARY</span>}
            </div>
            <div style={{ fontSize: 12, color: '#5C5C74' }}>{p.role}</div>
          </div>
          <div style={{ fontSize: 12.5, color: '#3B3B52', width: 150 }}>{p.phone}</div>
          <div style={{ fontSize: 12.5, color: '#3B3B52', width: 230 }}>{p.email}</div>
          {canWrite && (
            <>
              <div onClick={() => setEditing(p)} style={{ border: '1px solid #E5E7F0', borderRadius: 8, fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}>Edit</div>
              <div onClick={() => remove(p)} style={{ color: '#C0392B', fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}>Delete</div>
            </>
          )}
        </div>
      ))}
      {contacts.length === 0 && !showAdd && (
        <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No contacts yet.</div>
      )}
    </div>
  )
}

function ContactForm({ initial, customerId, onCancel, onSaved }: { initial?: ContactDto; customerId: string; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [role, setRole] = useState(initial?.role ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      if (initial) await api.updateContact(initial.id, { name, role, phone, email, isPrimary })
      else await api.createContact(customerId, { name, role, phone, email, isPrimary })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} style={{ padding: '14px 0', borderBottom: '1px solid #F2F3F9', display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr auto auto', gap: 8, alignItems: 'center' }}>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required style={fieldInput} />
      <input placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} required style={fieldInput} />
      <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} required style={fieldInput} />
      <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={fieldInput} />
      <label style={{ fontSize: 12, color: '#5C5C74', display: 'flex', alignItems: 'center', gap: 5 }}>
        <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} /> Primary
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" disabled={busy} style={{ background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{busy ? '…' : 'Save'}</button>
        <button type="button" onClick={onCancel} style={{ background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
      </div>
      {error && <div style={{ gridColumn: '1 / -1', color: '#C0392B', fontSize: 12 }}>{error}</div>}
    </form>
  )
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
