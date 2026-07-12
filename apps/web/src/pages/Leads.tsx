import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LeadDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { pill, srcStyle } from '../lib/styleUtils'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'
import LeadFormModal from '../components/LeadFormModal'

export default function Leads() {
  const [leads, setLeads] = useState<LeadDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<LeadDto | null>(null)
  const toast = useToast()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('lead:write')

  const reload = async () => {
    setLoading(true); setError(null)
    try { setLeads(await api.leads()) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to load leads') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (l: LeadDto) => { setEditing(l); setModalOpen(true) }
  const onSaved = (saved: LeadDto) => {
    setLeads((ls) => {
      const idx = ls.findIndex((x) => x.id === saved.id)
      if (idx >= 0) { const next = [...ls]; next[idx] = saved; return next }
      return [saved, ...ls]
    })
    toast(editing ? 'Lead updated' : 'Lead created + assigned')
  }

  const assign = async (l: LeadDto) => {
    try { const upd = await api.assignLead(l.id, null); onSaved(upd); toast(`Assigned to ${upd.ownerName}`) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Assign failed') }
  }

  const convert = async (l: LeadDto) => {
    if (!window.confirm(`Convert "${l.companyName}" into an opportunity?`)) return
    try {
      await api.convertLead(l.id, {})
      toast('Lead converted → opportunity created')
      await reload()
      navigate('/pipeline')
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Convert failed') }
  }

  const del = async (l: LeadDto) => {
    if (!window.confirm(`Delete lead ${l.companyName}?`)) return
    try { await api.deleteLead(l.id); setLeads((ls) => ls.filter((x) => x.id !== l.id)); toast('Lead deleted') }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Delete failed') }
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 600 }}>Leads</div>
        <div style={{ background: '#F2F3F9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#5C5C74', padding: '4px 10px' }}>{leads.length} total</div>
        <div style={{ flex: 1 }} />
        {canWrite && <div onClick={openNew} style={primaryBtn}>+ Add lead</div>}
      </div>

      <div style={{ borderRadius: 13, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 13, marginBottom: 14, color: '#EAE7F7', background: '#1A236B' }}>
        <svg viewBox="0 0 24 24" width="19" height="19">
          <path d="M12 3.5l1.9 5.4 5.4 1.9-5.4 1.9L12 18.1l-1.9-5.4-5.4-1.9 5.4-1.9z" fill="#A995F5" />
        </svg>
        <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
          <b style={{ color: '#CDBFF9' }}>Auto scoring</b> + round-robin assignment · {leads.filter((l) => l.ownerId).length} of {leads.length} assigned · duplicate check active
        </div>
      </div>

      {error && <div style={{ background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ ...gridCols, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8888A0' }}>
          <div>Lead</div><div>Source</div><div>Score</div><div>Owner</div><div>Status</div><div>Est. value</div><div style={{ textAlign: 'right' }}>Actions</div>
        </div>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
        {!loading && leads.length === 0 && !error && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No leads yet.</div>}
        {leads.map((l) => {
          const scoreCol = l.score >= 80 ? '#2A6FDB' : l.score >= 65 ? '#B4650A' : '#8888A0'
          const stStyle = l.status === 'Converted' ? pill('#E4EDFC', '#2A6FDB')
            : l.status === 'AI Sourced' ? pill('#F4F1FD', '#4A3AB8')
            : l.status === 'Lost' ? pill('#FDECEA', '#C0392B')
            : pill('#F2F3F9', '#5C5C74')
          return (
            <div key={l.id} style={{ ...gridCols, padding: '12px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{l.name}</div>
                <div style={{ fontSize: 11.5, color: '#5C5C74', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.companyName}</div>
              </div>
              <div><span style={srcStyle(l.source)}>{l.source}</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 13, color: scoreCol }}>{l.score}</span>
                <div style={{ flex: 1, height: 4, background: '#F2F3F9', borderRadius: 2, maxWidth: 60 }}>
                  <div style={{ width: `${l.score}%`, height: '100%', background: scoreCol, borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: '#3B3B52' }}>{l.ownerName ?? '— unassigned —'}</div>
              <div><span style={stStyle}>{l.status}</span></div>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 13, fontWeight: 600 }}>{l.estValue ? `฿${(l.estValue / 1e6).toFixed(1)}M` : '—'}</div>
              <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {canWrite && !l.ownerId && <div onClick={() => assign(l)} style={smallBtn}>Assign</div>}
                {canWrite && l.status !== 'Converted' && <div onClick={() => openEdit(l)} style={smallBtn}>Edit</div>}
                {canWrite && l.status !== 'Converted' && <div onClick={() => convert(l)} style={{ ...smallBtn, background: '#2A6FDB', color: '#fff', borderColor: '#2A6FDB' }}>Convert</div>}
                {canWrite && <div onClick={() => del(l)} style={{ ...smallBtn, color: '#C0392B' }}>Delete</div>}
              </div>
            </div>
          )
        })}
      </div>

      <LeadFormModal open={modalOpen} initial={editing} onClose={() => setModalOpen(false)} onSaved={onSaved} />
    </div>
  )
}

const gridCols: CSSProperties = { display: 'grid', gridTemplateColumns: '1.9fr 130px 150px 130px 110px 90px 260px', gap: 10 }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const smallBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, fontSize: 11.5, fontWeight: 600, padding: '5px 11px', cursor: 'pointer' }
