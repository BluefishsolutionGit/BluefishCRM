/**
 * Mobile detail screens — Customer / Lead / Opportunity / Task/Activity.
 *
 * Design brief (per P0):
 *  - Read-heavy, but inline actions that let a sales rep close the loop from
 *    the field: mark done, move stage, log activity, complete lead.
 *  - No fallback to desktop routes — every action stays inside /m.
 *  - Writes that hit the network use `api.*`; writes made while offline (or
 *    that fail with a retryable error) get pushed to the offline queue.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type {
  ActivityDto, ActivityStatus, ActivityType, ContactDto, CreateActivityDto,
  CustomerDto, LeadDto, OpportunityDto, OpportunityStage, UpdateLeadDto,
} from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { enqueue as enqueueDraft } from '../lib/offlineQueue'

// ── Shared style tokens ─────────────────────────────────────────────────
const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '14px 16px' }
const backBtn: CSSProperties = { fontSize: 14, color: '#2A6FDB', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }
const sectionLabel: CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', color: '#8888A0', textTransform: 'uppercase', margin: '4px 0 6px' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const outlineBtn: CSSProperties = { background: '#fff', color: '#3B3B52', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const label: CSSProperties = { fontSize: 11, color: '#8888A0', fontWeight: 700, letterSpacing: '.04em' }
const value: CSSProperties = { fontSize: 13.5, color: '#1E1E30', marginTop: 2 }
const fmtMoney = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'

function BackBar({ title, right }: { title: string; right?: React.ReactNode }) {
  const nav = useNavigate()
  return (
    <div style={{ position: 'sticky', top: 0, background: '#F4F6F1', paddingBottom: 8, zIndex: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <div onClick={() => nav(-1)} style={backBtn}>‹ Back</div>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{title}</div>
        <div style={{ minWidth: 44 }}>{right}</div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Customer detail
// ═══════════════════════════════════════════════════════════════════════
export function MobileCustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const [c, setC] = useState<CustomerDto | null>(null)
  const [contacts, setContacts] = useState<ContactDto[]>([])
  const [opps, setOpps] = useState<OpportunityDto[]>([])
  const [activities, setActivities] = useState<ActivityDto[]>([])
  const [logOpen, setLogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [cust, cts, os, acts] = await Promise.all([
        api.customer(id),
        api.contacts(id),
        api.opportunities({}).catch(() => [] as OpportunityDto[]),
        api.activities({ customerId: id }).catch(() => [] as ActivityDto[]),
      ])
      setC(cust); setContacts(cts)
      setOpps(os.filter((o) => o.customerId === id))
      setActivities(acts.slice(0, 10))
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [id, toast])
  useEffect(() => { void reload() }, [reload])

  if (loading || !c) return <div style={{ padding: 16, color: '#8888A0' }}>Loading…</div>

  return (
    <div style={{ padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <BackBar title={c.name} />
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: '#EEF2FF', color: '#2E1A6B', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.name.slice(0, 2).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: '#5C5C74' }}>{c.industry} · {c.city}</div>
          </div>
          <span style={{ background: c.status === 'Active' ? '#E5F8ED' : '#F1F1F5', color: c.status === 'Active' ? '#0E6E4E' : '#5C5C74', fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>{c.status}</span>
        </div>
        {(c.primaryServiceLines ?? []).length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {c.primaryServiceLines.map((s) => <span key={s} style={{ background: '#EEF0FA', color: '#2A6FDB', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{s}</span>)}
          </div>
        )}
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><div style={label}>Owner</div><div style={value}>{c.ownerName}</div></div>
          <div><div style={label}>Terms</div><div style={value}>{c.terms}</div></div>
          <div><div style={label}>Phone</div><div style={value}><a href={`tel:${c.phone}`} style={{ color: '#2A6FDB', textDecoration: 'none' }}>{c.phone || '—'}</a></div></div>
          <div><div style={label}>Tax ID</div><div style={value}>{c.taxId || '—'}</div></div>
          <div style={{ gridColumn: 'span 2' }}><div style={label}>Address</div><div style={value}>{c.address || '—'}</div></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div onClick={() => setLogOpen(true)} style={{ ...primaryBtn, flex: 1, textAlign: 'center' }}>+ Log activity</div>
        {c.phone && <a href={`tel:${c.phone}`} style={{ ...outlineBtn, flex: 1, textAlign: 'center', textDecoration: 'none' }}>Call</a>}
      </div>

      {contacts.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>Contacts ({contacts.length})</div>
          <ContactsList contacts={contacts} />
        </div>
      )}

      {opps.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>Opportunities ({opps.length})</div>
          {opps.slice(0, 8).map((o) => (
            <div key={o.id} onClick={() => window.location.assign(`/m/opportunities/${o.id}`)} style={{ padding: '8px 0', borderTop: '1px solid #F1F1F5', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title}</div>
                <div style={{ fontSize: 11, color: '#5C5C74' }}>{o.stage} · {o.probability}%</div>
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{fmtMoney(o.value)}</div>
            </div>
          ))}
        </div>
      )}

      {activities.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>Recent activities</div>
          {activities.map((a) => (
            <div key={a.id} style={{ padding: '8px 0', borderTop: '1px solid #F1F1F5' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{a.title}</div>
              <div style={{ fontSize: 11, color: '#5C5C74' }}>{a.type} · {new Date(a.scheduledAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · <b>{a.status}</b></div>
            </div>
          ))}
        </div>
      )}

      {logOpen && <LogActivitySheet defaultCustomerId={id} onClose={() => setLogOpen(false)} onSaved={() => { setLogOpen(false); void reload() }} />}
    </div>
  )
}

// ── Contacts (tap-to-expand card with all fields + quick actions) ──────
function ContactsList({ contacts }: { contacts: ContactDto[] }) {
  const [showAll, setShowAll] = useState(false)
  // Primary contacts first, then the rest — reps expect the "main" person on top.
  const sorted = useMemo(() =>
    [...contacts].sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)),
    [contacts])
  const shown = showAll ? sorted : sorted.slice(0, 6)
  return (
    <>
      {shown.map((ct) => <ContactCard key={ct.id} c={ct} />)}
      {contacts.length > 6 && !showAll && (
        <div onClick={() => setShowAll(true)} style={{ padding: '10px 0 2px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#2A6FDB', cursor: 'pointer' }}>
          Show all {contacts.length} contacts
        </div>
      )}
    </>
  )
}

function ContactCard({ c }: { c: ContactDto }) {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  const title = [c.position, c.department].filter(Boolean).join(' · ') || c.role || ''
  const summary = title || c.email || c.phone || '—'
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${label} copied`) }
    catch { toast('Copy failed') }
  }

  return (
    <div style={{ borderTop: '1px solid #F1F1F5' }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E1E30', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>{c.name}</span>
            {c.nickname && <span style={{ fontSize: 11, fontWeight: 600, color: '#8888A0' }}>({c.nickname})</span>}
            {c.isPrimary && <span style={{ background: '#E4EDFC', color: '#2A6FDB', fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.05em' }}>primary</span>}
          </div>
          <div style={{ fontSize: 11, color: '#5C5C74', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</div>
        </div>
        {c.phone && (
          <a
            href={`tel:${c.phone}`}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 32, height: 32, borderRadius: '50%', background: '#EAF3EC', color: '#0E6E4E', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flex: 'none' }}
            title="Call"
          >
            <svg viewBox="0 0 24 24" width="15" height="15"><path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2c.3-.3.7-.4 1-.3a11 11 0 003.5.6c.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 013 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1a11 11 0 00.6 3.5c.1.4 0 .7-.3 1L6.6 10.8z" fill="currentColor" /></svg>
          </a>
        )}
        <div style={{ color: '#8888A0', fontSize: 13, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s', flex: 'none' }}>▾</div>
      </div>

      {open && (
        <div style={{ padding: '4px 0 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {c.role && c.role !== c.position && <Row label="Role" value={c.role} />}
          {c.position && <Row label="Position" value={c.position} />}
          {c.department && <Row label="Department" value={c.department} />}
          {c.email && (
            <Row
              label="Email"
              value={c.email}
              action={<a href={`mailto:${c.email}`} style={pillLink}>Mail</a>}
              onCopy={() => copy(c.email, 'Email')}
            />
          )}
          {c.phone && (
            <Row
              label="Mobile"
              value={c.phone}
              action={<a href={`tel:${c.phone}`} style={pillLink}>Call</a>}
              onCopy={() => copy(c.phone, 'Phone')}
            />
          )}
          {c.telephone && (
            <Row
              label="Office"
              value={c.telephone}
              action={<a href={`tel:${c.telephone}`} style={pillLink}>Call</a>}
              onCopy={() => copy(c.telephone!, 'Office phone')}
            />
          )}
          {c.lineId && (
            <Row
              label="LINE"
              value={c.lineId}
              onCopy={() => copy(c.lineId!, 'LINE ID')}
            />
          )}
          {c.notes && (
            <div style={{ background: '#F7F8FC', borderRadius: 9, padding: '8px 10px', marginTop: 2 }}>
              <div style={{ ...label, marginBottom: 3 }}>Notes</div>
              <div style={{ fontSize: 12.5, color: '#3B3B52', whiteSpace: 'pre-wrap' }}>{c.notes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label: lb, value: v, action, onCopy }: { label: string; value: string; action?: React.ReactNode; onCopy?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ ...label, width: 76, flex: 'none' }}>{lb}</div>
      <div
        onClick={onCopy}
        style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#1E1E30', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: onCopy ? 'pointer' : 'default' }}
        title={onCopy ? 'Tap to copy' : undefined}
      >{v}</div>
      {action}
    </div>
  )
}

const pillLink: CSSProperties = {
  background: '#EEF0FA', color: '#2A6FDB', textDecoration: 'none',
  fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, flex: 'none',
}

// ═══════════════════════════════════════════════════════════════════════
// Lead detail (with inline status change + convert-to-opportunity)
// ═══════════════════════════════════════════════════════════════════════
export function MobileLeadDetail() {
  const { id } = useParams<{ id: string }>()
  const [l, setL] = useState<LeadDto | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try { setL(await api.lead(id)) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [id, toast])
  useEffect(() => { void reload() }, [reload])

  const patch = async (data: UpdateLeadDto) => {
    if (!l || busy) return
    setBusy(true)
    try { const updated = await api.updateLead(l.id, data); setL(updated); toast('Saved') }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  if (loading || !l) return <div style={{ padding: 16, color: '#8888A0' }}>Loading…</div>

  const STATUSES: LeadDto['status'][] = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost']

  return (
    <div style={{ padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <BackBar title={l.name} />
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{l.name}</div>
            <div style={{ fontSize: 12, color: '#5C5C74' }}>{l.companyName || '—'}</div>
          </div>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 700, color: l.score >= 70 ? '#0E6E4E' : l.score >= 40 ? '#B4650A' : '#8888A0' }}>{l.score}</div>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><div style={label}>Source</div><div style={value}>{l.source}</div></div>
          <div><div style={label}>Owner</div><div style={value}>{l.ownerName ?? '—'}</div></div>
          <div><div style={label}>Email</div><div style={value}>{l.email ? <a href={`mailto:${l.email}`} style={{ color: '#2A6FDB', textDecoration: 'none' }}>{l.email}</a> : '—'}</div></div>
          <div><div style={label}>Phone</div><div style={value}>{l.phone ? <a href={`tel:${l.phone}`} style={{ color: '#2A6FDB', textDecoration: 'none' }}>{l.phone}</a> : '—'}</div></div>
          {l.serviceOrProduct && <div><div style={label}>Service</div><div style={value}>{l.serviceOrProduct}</div></div>}
          {l.estValue != null && <div><div style={label}>Est. value</div><div style={value}>{fmtMoney(l.estValue)}</div></div>}
        </div>
        {l.notes && (
          <div style={{ marginTop: 10, background: '#F7F8FC', borderRadius: 8, padding: '8px 10px' }}>
            <div style={label}>Notes</div>
            <div style={{ fontSize: 12.5, color: '#3B3B52', marginTop: 3, whiteSpace: 'pre-wrap' }}>{l.notes}</div>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={sectionLabel}>Status</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STATUSES.map((s) => {
            const on = l.status === s
            return (
              <div key={s} onClick={() => !on && !busy && patch({ status: s })} style={{
                cursor: busy ? 'not-allowed' : 'pointer',
                border: `1px solid ${on ? '#2A6FDB' : '#E5E7F0'}`,
                background: on ? '#EEF0FA' : '#fff',
                color: on ? '#2A6FDB' : '#5C5C74',
                borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700,
              }}>{on && <span style={{ marginRight: 4 }}>✓</span>}{s}</div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div onClick={() => setLogOpen(true)} style={{ ...primaryBtn, flex: 1, textAlign: 'center' }}>+ Log activity</div>
        {l.email && <a href={`mailto:${l.email}`} style={{ ...outlineBtn, flex: 1, textAlign: 'center', textDecoration: 'none' }}>Email</a>}
      </div>

      {logOpen && <LogActivitySheet defaultTitle={`Follow up with ${l.name}`} onClose={() => setLogOpen(false)} onSaved={() => setLogOpen(false)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Opportunity detail (with inline stage / probability / value edits)
// ═══════════════════════════════════════════════════════════════════════
const STAGES: OpportunityStage[] = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost']
const STAGE_COLOR: Record<OpportunityStage, string> = {
  Qualification: '#2A6FDB', Proposal: '#B4650A', Negotiation: '#6C55E0', Won: '#0E9C7E', Lost: '#8888A0',
}

export function MobileOpportunityDetail() {
  const { id } = useParams<{ id: string }>()
  const [o, setO] = useState<OpportunityDto | null>(null)
  const [activities, setActivities] = useState<ActivityDto[]>([])
  const [logOpen, setLogOpen] = useState(false)
  const [editing, setEditing] = useState<null | 'value' | 'probability' | 'notes' | 'closeDate'>(null)
  const [draftValue, setDraftValue] = useState<number>(0)
  const [draftProb, setDraftProb] = useState<number>(0)
  const [draftCloseDate, setDraftCloseDate] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const reload = useCallback(async () => {
    if (!id) return
    try {
      const [opp, acts] = await Promise.all([
        api.opportunity(id),
        api.activities({ opportunityId: id }).catch(() => [] as ActivityDto[]),
      ])
      setO(opp); setActivities(acts.slice(0, 10))
      setDraftValue(opp.value); setDraftProb(opp.probability)
      setDraftCloseDate(opp.closeDate?.slice(0, 10) ?? '')
      setDraftNotes(opp.notes ?? '')
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed to load') }
  }, [id, toast])
  useEffect(() => { void reload() }, [reload])

  const moveStage = async (stage: OpportunityStage) => {
    if (!o || busy || o.stage === stage) return
    setBusy(true)
    const patch = { stage }
    try {
      const updated = await api.updateOpportunity(o.id, patch)
      setO(updated); toast(`Moved to ${stage}`)
    } catch (e) {
      if (!navigator.onLine) {
        await enqueueDraft({ kind: 'opportunity.update', label: `${o.title} → ${stage}`, payload: { opportunityId: o.id, patch } })
        toast('Offline — queued stage change')
      } else {
        toast(e instanceof ApiError ? e.message : 'Failed')
      }
    } finally { setBusy(false) }
  }

  const saveEdit = async () => {
    if (!o || busy || !editing) return
    setBusy(true)
    const patch: Parameters<typeof api.updateOpportunity>[1] = {}
    if (editing === 'value') patch.value = draftValue
    if (editing === 'probability') patch.probability = draftProb
    if (editing === 'closeDate') patch.closeDate = draftCloseDate ? new Date(draftCloseDate).toISOString() : null
    if (editing === 'notes') patch.notes = draftNotes
    try {
      const updated = await api.updateOpportunity(o.id, patch)
      setO(updated); toast('Saved'); setEditing(null)
    } catch (e) {
      if (!navigator.onLine) {
        await enqueueDraft({ kind: 'opportunity.update', label: `Edit ${editing} on ${o.title}`, payload: { opportunityId: o.id, patch } })
        toast('Offline — queued'); setEditing(null)
      } else {
        toast(e instanceof ApiError ? e.message : 'Failed')
      }
    } finally { setBusy(false) }
  }

  if (!o) return <div style={{ padding: 16, color: '#8888A0' }}>Loading…</div>

  return (
    <div style={{ padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <BackBar title={o.title} />
      <div style={card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800 }}>{o.title}</div>
            <div style={{ fontSize: 12, color: '#5C5C74' }}>{o.customerName ?? '—'}</div>
          </div>
          <span style={{ background: '#F7F8FC', color: STAGE_COLOR[o.stage], border: `1px solid ${STAGE_COLOR[o.stage]}30`, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>{o.stage}</span>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={() => setEditing('value')} style={editableCell}>
            <div style={label}>Value</div>
            <div style={value}>{fmtMoney(o.value)}</div>
          </button>
          <button onClick={() => setEditing('probability')} style={editableCell}>
            <div style={label}>Probability</div>
            <div style={value}>{o.probability}%</div>
          </button>
          <button onClick={() => setEditing('closeDate')} style={editableCell}>
            <div style={label}>Close</div>
            <div style={value}>{o.closeDate ? new Date(o.closeDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</div>
          </button>
          <div style={{ ...editableCell, cursor: 'default' }}>
            <div style={label}>Owner</div>
            <div style={value}>{o.ownerName}</div>
          </div>
        </div>
        {o.serviceOrProduct && (
          <div style={{ marginTop: 10 }}>
            <span style={{ background: '#EEF0FA', color: '#2A6FDB', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{o.serviceOrProduct}</span>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={sectionLabel}>Move to stage</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STAGES.map((s) => {
            const on = o.stage === s
            return (
              <div key={s} onClick={() => moveStage(s)} style={{
                cursor: busy || on ? 'default' : 'pointer',
                border: `1px solid ${on ? STAGE_COLOR[s] : '#E5E7F0'}`,
                background: on ? `${STAGE_COLOR[s]}15` : '#fff',
                color: on ? STAGE_COLOR[s] : '#5C5C74',
                borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700,
              }}>{on && <span style={{ marginRight: 4 }}>✓</span>}{s}</div>
            )
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ ...sectionLabel, flex: 1, margin: 0 }}>Notes</div>
          <div onClick={() => setEditing('notes')} style={{ fontSize: 11, color: '#2A6FDB', cursor: 'pointer', fontWeight: 700 }}>Edit</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: '#3B3B52', whiteSpace: 'pre-wrap' }}>{o.notes || <span style={{ color: '#BBBBCB' }}>Add notes…</span>}</div>
      </div>

      <div onClick={() => setLogOpen(true)} style={{ ...primaryBtn, textAlign: 'center' }}>+ Log activity for this deal</div>

      {activities.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>Recent activities</div>
          {activities.map((a) => (
            <div key={a.id} style={{ padding: '8px 0', borderTop: '1px solid #F1F1F5' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{a.title}</div>
              <div style={{ fontSize: 11, color: '#5C5C74' }}>{a.type} · {new Date(a.scheduledAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · <b>{a.status}</b></div>
            </div>
          ))}
        </div>
      )}

      {logOpen && <LogActivitySheet defaultOpportunityId={o.id} defaultCustomerId={o.customerId} defaultTitle={o.title} onClose={() => setLogOpen(false)} onSaved={() => { setLogOpen(false); void reload() }} />}
      {editing && (
        <Sheet onClose={() => setEditing(null)} title={`Edit ${editing}`}>
          {editing === 'value' && <input type="number" min={0} value={draftValue} onChange={(e) => setDraftValue(Number(e.target.value))} style={inp} />}
          {editing === 'probability' && <input type="number" min={0} max={100} value={draftProb} onChange={(e) => setDraftProb(Number(e.target.value))} style={inp} />}
          {editing === 'closeDate' && <input type="date" value={draftCloseDate} onChange={(e) => setDraftCloseDate(e.target.value)} style={inp} />}
          {editing === 'notes' && <textarea rows={5} value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setEditing(null)} style={{ ...outlineBtn, flex: 1 }}>Cancel</button>
            <button onClick={saveEdit} disabled={busy} style={{ ...primaryBtn, flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Task / Activity detail
// ═══════════════════════════════════════════════════════════════════════
export function MobileTaskDetail() {
  const { id } = useParams<{ id: string }>()
  const [a, setA] = useState<ActivityDto | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const reload = useCallback(async () => {
    if (!id) return
    try { setA(await api.activity(id)) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
  }, [id, toast])
  useEffect(() => { void reload() }, [reload])

  const setStatus = async (status: ActivityStatus) => {
    if (!a || busy || a.status === status) return
    setBusy(true)
    try {
      if (status === 'completed' && !navigator.onLine) {
        await enqueueDraft({ kind: 'activity.complete', label: `Complete: ${a.title}`, payload: { activityId: a.id } })
        toast('Offline — will sync')
      } else {
        const updated = await api.updateActivity(a.id, { status })
        setA(updated); toast(status === 'completed' ? 'Marked done' : 'Updated')
      }
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  if (!a) return <div style={{ padding: 16, color: '#8888A0' }}>Loading…</div>

  const overdue = a.status === 'scheduled' && new Date(a.scheduledAt).getTime() < Date.now()

  return (
    <div style={{ padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <BackBar title={a.title} />
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: '#EEF0FA', color: '#2A6FDB', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{a.type}</span>
          <span style={{ background: a.status === 'completed' ? '#E5F8ED' : overdue ? '#FDECEA' : '#F1F1F5', color: a.status === 'completed' ? '#0E6E4E' : overdue ? '#C0392B' : '#5C5C74', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{overdue ? 'overdue' : a.status}</span>
          <div style={{ flex: 1 }} />
        </div>
        <div style={{ marginTop: 10, fontSize: 15, fontWeight: 700 }}>{a.title}</div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: '#5C5C74' }}>{new Date(a.scheduledAt).toLocaleString('en-GB')}</div>
        {a.customerName && <div style={{ marginTop: 6, fontSize: 12.5 }}><b style={label}>Customer:</b> {a.customerName}</div>}
        {a.opportunityTitle && <div style={{ marginTop: 6, fontSize: 12.5 }}><b style={label}>Deal:</b> {a.opportunityTitle}</div>}
        {a.description && (
          <div style={{ marginTop: 10, background: '#F7F8FC', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{a.description}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {a.status !== 'completed' && <div onClick={() => setStatus('completed')} style={{ ...primaryBtn, background: '#0E9C7E', flex: 1, textAlign: 'center' }}>Mark done</div>}
        {a.status !== 'cancelled' && <div onClick={() => setStatus('cancelled')} style={{ ...outlineBtn, flex: 1, textAlign: 'center' }}>Cancel</div>}
        {a.status !== 'scheduled' && <div onClick={() => setStatus('scheduled')} style={{ ...outlineBtn, flex: 1, textAlign: 'center' }}>Reopen</div>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Log Activity sheet — reused across screens
// ═══════════════════════════════════════════════════════════════════════
export function LogActivitySheet({ defaultCustomerId, defaultOpportunityId, defaultTitle, defaultDescription, onClose, onSaved }: {
  defaultCustomerId?: string; defaultOpportunityId?: string; defaultTitle?: string; defaultDescription?: string
  onClose: () => void; onSaved: () => void
}) {
  const { user } = useAuth()
  const toast = useToast()
  const [type, setType] = useState<ActivityType>('call')
  const [title, setTitle] = useState(defaultTitle ? `Follow up · ${defaultTitle}` : '')
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 16))
  const [description, setDescription] = useState(defaultDescription ?? '')
  const [saving, setSaving] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !user || saving) return
    setSaving(true)
    const payload: CreateActivityDto = {
      type, title: title.trim(), scheduledAt: new Date(when).toISOString(),
      ownerId: user.id,
      customerId: defaultCustomerId,
      opportunityId: defaultOpportunityId,
      description: description.trim() || undefined,
      status: 'completed',
    }
    try {
      if (!navigator.onLine) {
        await enqueueDraft({ kind: 'activity', label: `${type}: ${title.trim()}`, payload })
        toast('Offline — queued')
      } else {
        await api.createActivity(payload)
        toast('Logged')
      }
      onSaved()
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setSaving(false) }
  }

  const TYPES: ActivityType[] = ['call', 'meeting', 'visit', 'demo', 'email', 'follow_up', 'task']

  return (
    <Sheet onClose={onClose} title="Log activity">
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TYPES.map((t) => (
            <div key={t} onClick={() => setType(t)} style={{
              cursor: 'pointer', border: `1px solid ${type === t ? '#2A6FDB' : '#E5E7F0'}`,
              background: type === t ? '#EEF0FA' : '#fff',
              color: type === t ? '#2A6FDB' : '#5C5C74',
              borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, textTransform: 'capitalize',
            }}>{t.replace('_', ' ')}</div>
          ))}
        </div>
        <input required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={inp} />
        <input required type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={inp} />
        <textarea rows={3} placeholder="What happened?" value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...outlineBtn, flex: 1 }}>Cancel</button>
          <button type="submit" disabled={saving || !title.trim()} style={{ ...primaryBtn, flex: 1, opacity: saving || !title.trim() ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Log'}</button>
        </div>
      </form>
    </Sheet>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Sheet primitive
// ═══════════════════════════════════════════════════════════════════════
export function Sheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,45,.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 480, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, background: '#E5E7F0', borderRadius: 2, margin: '0 auto 12px' }} />
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

const inp: CSSProperties = { width: '100%', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }
const editableCell: CSSProperties = { textAlign: 'left', background: '#F7F8FC', border: '1px solid #EEF0FA', borderRadius: 9, padding: '8px 10px', cursor: 'pointer' }

// Re-export so main.tsx has one import site.
export { MobileNewLeadSheet } from './MobileNewLeadSheet'
