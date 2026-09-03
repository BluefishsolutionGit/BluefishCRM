import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { LeadDto, UserDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { pill, srcStyle } from '../lib/styleUtils'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'
import LeadFormModal from '../components/LeadFormModal'

/**
 * Desktop counterpart to MobileLeadDetail. Renders the same lead fields but
 * with a wider layout, keeps the rep-picker / unassign flow that lives on
 * the Leads list, and links out to the converted opportunity if any.
 */
export default function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const [lead, setLead] = useState<LeadDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [picker, setPicker] = useState(false)
  const [salesUsers, setSalesUsers] = useState<UserDto[]>([])
  const toast = useToast()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('lead:write')

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true); setError(null)
    try { setLead(await api.lead(id)) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { void reload() }, [reload])

  useEffect(() => {
    if (!canWrite) return
    api.users()
      .then((rows) => setSalesUsers(rows.filter((u) => u.role === 'sales_rep' || u.role === 'sales_manager')))
      .catch(() => setSalesUsers([]))
  }, [canWrite])

  const assign = async (ownerId: string | null) => {
    if (!lead) return
    try {
      const upd = await api.assignLead(lead.id, ownerId)
      setLead(upd)
      toast(ownerId ? `Assigned to ${upd.ownerName}` : `Auto-assigned to ${upd.ownerName}`)
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Assign failed') }
  }

  const unassign = async () => {
    if (!lead) return
    if (!window.confirm(`Return "${lead.companyName}" to the unassigned pool?`)) return
    try {
      const upd = await api.unassignLead(lead.id)
      setLead(upd)
      toast('Lead returned to pool')
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Unassign failed') }
  }

  const convert = async () => {
    if (!lead) return
    if (!window.confirm(`Convert "${lead.companyName}" into an opportunity?`)) return
    try {
      await api.convertLead(lead.id, {})
      toast('Lead converted → opportunity created')
      navigate('/pipeline')
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Convert failed') }
  }

  const del = async () => {
    if (!lead) return
    if (!window.confirm(`Delete lead ${lead.companyName}?`)) return
    try {
      await api.deleteLead(lead.id)
      toast('Lead deleted')
      navigate('/leads')
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Delete failed') }
  }

  if (loading) return <div style={{ padding: 32, color: '#8888A0' }}>Loading…</div>
  if (error || !lead) return (
    <div style={{ padding: 32 }}>
      <Link to="/leads">← Back to leads</Link>
      <div style={{ marginTop: 12, color: '#C0392B' }}>{error ?? 'Lead not found.'}</div>
    </div>
  )

  const scoreCol = lead.score >= 80 ? '#2A6FDB' : lead.score >= 65 ? '#B4650A' : '#8888A0'
  const stStyle = lead.status === 'Converted' ? pill('#E4EDFC', '#2A6FDB')
    : lead.status === 'AI Sourced' ? pill('#F4F1FD', '#4A3AB8')
    : lead.status === 'Lost' ? pill('#FDECEA', '#C0392B')
    : pill('#F2F3F9', '#5C5C74')

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '20px 28px', animation: 'fadeUp .3s ease' }}>
      <Link to="/leads" style={{ fontSize: 12.5, fontWeight: 600, color: '#2A6FDB', display: 'inline-block', marginBottom: 12 }}>← Leads</Link>

      <div style={{ ...card, padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#2E1A6B', color: '#fff', fontSize: 19, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Space Grotesk', flex: 'none' }}>
            {lead.companyName.split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 600 }}>{lead.companyName}</div>
            <div style={{ fontSize: 13, color: '#5C5C74', marginTop: 2 }}>{lead.name}</div>
            <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
              <span style={stStyle}>{lead.status}</span>
              <span style={srcStyle(lead.source)}>{lead.source}</span>
              {lead.serviceOrProduct && (
                <span style={{ background: '#F2F3F9', borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '3px 8px', color: '#3B3B52' }}>{lead.serviceOrProduct}</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8888A0', letterSpacing: '.06em', textTransform: 'uppercase' }}>Score</div>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 32, fontWeight: 700, color: scoreCol, marginTop: 2 }}>{lead.score}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 18, borderTop: '1px solid #F2F3F9', paddingTop: 14 }}>
          <div>
            <div style={metaLabel}>Owner</div>
            <div style={metaValue}>{lead.ownerName ?? <span style={{ color: '#B4650A' }}>— unassigned —</span>}</div>
          </div>
          <div>
            <div style={metaLabel}>Email</div>
            <div style={metaValue}>{lead.email ? <a href={`mailto:${lead.email}`} style={{ color: '#2A6FDB', textDecoration: 'none' }}>{lead.email}</a> : '—'}</div>
          </div>
          <div>
            <div style={metaLabel}>Phone</div>
            <div style={metaValue}>{lead.phone ? <a href={`tel:${lead.phone}`} style={{ color: '#2A6FDB', textDecoration: 'none' }}>{lead.phone}</a> : '—'}</div>
          </div>
          <div>
            <div style={metaLabel}>Est. value</div>
            <div style={metaValue}>{lead.estValue ? `฿${(lead.estValue / 1e6).toFixed(1)}M` : '—'}</div>
          </div>
        </div>

        {lead.notes && (
          <div style={{ marginTop: 14, background: '#F7F8FC', borderRadius: 10, padding: '12px 14px' }}>
            <div style={metaLabel}>Notes</div>
            <div style={{ fontSize: 13, color: '#3B3B52', marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{lead.notes}</div>
          </div>
        )}

        {lead.convertedOpportunityId && (
          <div style={{ marginTop: 14, background: '#EEF3FC', border: '1px solid #D6E3F8', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12.5, color: '#3B3B52', flex: 1 }}>
              This lead was <b>converted</b>{lead.convertedAt && ` on ${new Date(lead.convertedAt).toLocaleDateString('en-GB')}`}.
            </div>
            <Link to={`/pipeline`} style={{ ...smallBtn, background: '#2A6FDB', color: '#fff', borderColor: '#2A6FDB', textDecoration: 'none' }}>
              Open pipeline →
            </Link>
          </div>
        )}
      </div>

      {canWrite && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div onClick={() => setPicker(true)} style={primaryBtn}>{lead.ownerId ? 'Reassign' : 'Assign'}</div>
          {lead.ownerId && <div onClick={unassign} style={ghostBtn}>Unassign</div>}
          {lead.status !== 'Converted' && <div onClick={() => setEditing(true)} style={ghostBtn}>Edit</div>}
          {lead.status !== 'Converted' && <div onClick={convert} style={{ ...primaryBtn, background: '#0E9C7E' }}>Convert to opportunity</div>}
          <div style={{ flex: 1 }} />
          <div onClick={del} style={{ ...ghostBtn, color: '#C0392B', borderColor: '#F5B7B1' }}>Delete</div>
        </div>
      )}

      <LeadFormModal
        open={editing}
        initial={lead}
        onClose={() => setEditing(false)}
        onSaved={(saved) => { setLead(saved); setEditing(false) }}
      />

      {picker && (
        <AssignPickerModal
          lead={lead}
          reps={salesUsers}
          onClose={() => setPicker(false)}
          onPick={async (ownerId) => { setPicker(false); await assign(ownerId) }}
        />
      )}
    </div>
  )
}

function AssignPickerModal({ lead, reps, onClose, onPick }: {
  lead: LeadDto
  reps: UserDto[]
  onClose: () => void
  onPick: (ownerId: string | null) => void
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 460, maxHeight: '80vh', borderRadius: 14, overflow: 'auto', padding: '18px 22px' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Assign lead</div>
        <div style={{ fontSize: 12.5, color: '#5C5C74', marginTop: 3, marginBottom: 14 }}>
          {lead.companyName} · {lead.name}
          {lead.ownerName && <span style={{ marginLeft: 6, color: '#8888A0' }}>(currently {lead.ownerName})</span>}
        </div>

        <div onClick={() => onPick(null)} style={{ ...pickerRow, borderColor: '#2A6FDB', color: '#2A6FDB' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EEF0FA', color: '#2A6FDB', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚡</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Auto (round-robin)</div>
            <div style={{ fontSize: 11, color: '#8888A0', fontWeight: 400 }}>Picks the next rep in the rotation</div>
          </div>
        </div>

        <div style={{ height: 8 }} />
        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8888A0', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>Pick a rep</div>

        {reps.length === 0 && <div style={{ padding: 12, color: '#8888A0', fontSize: 12.5, textAlign: 'center' }}>No sales reps found.</div>}
        {reps.map((r) => {
          const selected = r.id === lead.ownerId
          return (
            <div key={r.id} onClick={() => onPick(r.id)} style={{ ...pickerRow, borderColor: selected ? '#0E9C7E' : '#E5E7F0', background: selected ? '#EBF8F3' : '#fff' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: selected ? '#0E9C7E' : '#F2F3F9',
                color: selected ? '#fff' : '#3B3B52',
                fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{r.name.split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                <div style={{ fontSize: 11, color: '#8888A0' }}>{r.role === 'sales_manager' ? 'Sales manager' : 'Sales rep'}</div>
              </div>
              {selected && <div style={{ fontSize: 11, color: '#0E9C7E', fontWeight: 700 }}>current</div>}
            </div>
          )
        })}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14 }
const metaLabel: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#8888A0', letterSpacing: '.06em', textTransform: 'uppercase' }
const metaValue: CSSProperties = { fontSize: 13.5, fontWeight: 600, marginTop: 5, color: '#3B3B52' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none' }
const ghostBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #E5E7F0', background: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: '#3B3B52' }
const smallBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, fontSize: 11.5, fontWeight: 600, padding: '5px 11px', cursor: 'pointer' }
const pickerRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 12px', borderRadius: 10, border: '1px solid #E5E7F0',
  marginBottom: 6, cursor: 'pointer',
}
