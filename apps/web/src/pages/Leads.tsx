import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LeadDto } from '@bluefish/shared'
import { SERVICE_LINES } from '@bluefish/shared'
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

  const fileRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false)

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const res = await api.importLeads(file)
      toast(`Imported ${res.imported} · skipped ${res.skipped}${res.errors.length ? ` · ${res.errors.length} error(s)` : ''}`)
      await reload()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Import failed')
    } finally { setImporting(false) }
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 600 }}>Leads</div>
        <div style={{ background: '#F2F3F9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#5C5C74', padding: '4px 10px' }}>{leads.length} total</div>
        <div style={{ flex: 1 }} />
        <a href={api.leadsImportTemplateUrl()} target="_blank" rel="noopener noreferrer" style={ghostBtn}>Template</a>
        <a href={api.leadsExportUrl()} style={ghostBtn}>Export ↓</a>
        {canWrite && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onImport} style={{ display: 'none' }} />
            <div onClick={() => fileRef.current?.click()} style={{ ...ghostBtn, opacity: importing ? 0.5 : 1 }}>{importing ? 'Importing…' : 'Import ↑'}</div>
            <div onClick={openNew} style={primaryBtn}>+ Add lead</div>
          </>
        )}
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
          <div>Lead</div><div>Service</div><div>Source</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            Score
            <span onClick={() => setScoreInfoOpen(true)} title="How is the score calculated?" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', background: '#EEF0FA', color: '#2A6FDB', fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'none' }}>?</span>
          </div>
          <div>Owner</div><div>Status</div><div>Est. value</div><div style={{ textAlign: 'right' }}>Actions</div>
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
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.companyName}</div>
                <div style={{ fontSize: 11.5, fontWeight: 400, color: '#5C5C74', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
              </div>
              <div><ServicePill service={l.serviceOrProduct} /></div>
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
      {scoreInfoOpen && <ScoreInfoModal onClose={() => setScoreInfoOpen(false)} />}
    </div>
  )
}

function ScoreInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 560, maxHeight: '85vh', borderRadius: 14, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>How the lead score is calculated</div>
        <div style={{ fontSize: 12.5, color: '#5C5C74', marginTop: 4, marginBottom: 14 }}>
          Score is 0–100. Higher is hotter. Recomputed on every create / edit — no manual override.
        </div>

        <ScoreSection title="1. Source (base)" total="+8 … +30">
          <ScoreRow label="e-GP Tender" value="+30" />
          <ScoreRow label="Referral" value="+25" />
          <ScoreRow label="LINE OA" value="+20" />
          <ScoreRow label="Facebook Ads" value="+15" />
          <ScoreRow label="Website" value="+10" />
          <ScoreRow label="Email" value="+8" />
          <ScoreRow label="anything else" value="+10 (default)" />
        </ScoreSection>

        <ScoreSection title="2. Contactability" total="+0 … +30">
          <ScoreRow label="Has email" value="+15" />
          <ScoreRow label="Has phone" value="+15" />
        </ScoreSection>

        <ScoreSection title="3. Estimated deal value" total="+0 … +25">
          <ScoreRow label="≥ ฿5,000,000" value="+25" />
          <ScoreRow label="≥ ฿1,000,000" value="+20" />
          <ScoreRow label="≥ ฿500,000" value="+12" />
          <ScoreRow label="any positive value" value="+5" />
        </ScoreSection>

        <ScoreSection title="4. Company signal" total="+0 … +5">
          <ScoreRow label="Company name ≥ 10 chars" value="+5" />
        </ScoreSection>

        <div style={{ fontSize: 12.5, color: '#5C5C74', marginTop: 14, background: '#F7FAFF', border: '1px solid #E4EDFC', borderRadius: 9, padding: '10px 12px' }}>
          <b>Final:</b> sum of all bands, clamped to 0–100.<br />
          <b>Example:</b> e-GP Tender (+30) + email (+15) + phone (+15) + ฿2M (+20) + long name (+5) = <b style={{ color: '#2A6FDB' }}>85</b>.<br />
          <b>Color:</b> ≥80 blue (hot), 65–79 amber (warm), &lt;65 grey (cold).
        </div>

        <div style={{ fontSize: 11, color: '#8888A0', marginTop: 10 }}>Source: <code>apps/api/src/leads/lead-scoring.ts</code></div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={onClose} style={primaryBtn}>Got it</button>
        </div>
      </div>
    </div>
  )
}

function ScoreSection({ title, total, children }: { title: string; total: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid #F1F1F5', padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 11, color: '#8888A0', fontFamily: "'IBM Plex Mono', monospace" }}>{total}</div>
      </div>
      <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px' }}>
        {children}
      </div>
    </div>
  )
}

function ScoreRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div style={{ fontSize: 12, color: '#3B3B52' }}>{label}</div>
      <div style={{ fontSize: 12, color: '#2A6FDB', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{value}</div>
    </>
  )
}

const gridCols: CSSProperties = { display: 'grid', gridTemplateColumns: '1.9fr 100px 130px 150px 130px 110px 90px 260px', gap: 10 }

const SERVICE_COLOR: Record<string, string> = { Box: '#2A6FDB', '3S': '#0E9C7E', '3D': '#B4650A', 'AI&RPA': '#6C55E0' }
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
function ServicePill({ service }: { service: string | null }) {
  if (!service) return <span style={{ fontSize: 11, color: '#B4B4C4' }}>—</span>
  const known = (SERVICE_LINES as readonly string[]).includes(service)
  const c = known ? (SERVICE_COLOR[service] ?? '#5C5C74') : '#5C5C74'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: hexToRgba(c, 0.12), color: c, border: `1px solid ${hexToRgba(c, 0.35)}`, borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c }} />
      {service}
    </span>
  )
}
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none' }
const ghostBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #E5E7F0', background: '#fff', borderRadius: 9, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#3B3B52', textDecoration: 'none' }
const smallBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, fontSize: 11.5, fontWeight: 600, padding: '5px 11px', cursor: 'pointer' }
