import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CustomerDto, TagDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { fmt, initialsOf } from '../data/mockData'
import { av, statusStyle } from '../lib/styleUtils'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'
import CustomerFormModal from '../components/CustomerFormModal'
import ImportCustomersModal from '../components/ImportCustomersModal'
import './Customers.css'

const OWNER_COLORS = ['#2A6FDB', '#1F5AC2', '#B4650A', '#6C55E0', '#0E9C7E']
function colorFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return OWNER_COLORS[Math.abs(hash) % OWNER_COLORS.length]
}
function ownerInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('')
}

export default function Customers() {
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerDto | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('customer:write')
  const canDelete = hasPermission('customer:delete')

  const reload = useCallback(async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const rows = await api.customers(q || undefined)
      setCustomers(rows)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load customers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => reload(query), 200)
    return () => window.clearTimeout(handle)
  }, [query, reload])

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (c: CustomerDto) => { setEditing(c); setModalOpen(true); setMenuOpenId(null) }
  const onSaved = (saved: CustomerDto) => {
    setCustomers((cs) => {
      const idx = cs.findIndex((x) => x.id === saved.id)
      if (idx >= 0) { const next = [...cs]; next[idx] = saved; return next }
      return [saved, ...cs]
    })
    toast(editing ? `Customer ${saved.code} updated` : `Customer ${saved.code} created`)
  }
  const onDelete = async (c: CustomerDto) => {
    setMenuOpenId(null)
    if (!window.confirm(`Delete ${c.name}? (soft delete — record kept for audit)`)) return
    try {
      await api.deleteCustomer(c.id)
      setCustomers((cs) => cs.filter((x) => x.id !== c.id))
      toast(`Customer ${c.code} deleted`)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Delete failed')
    }
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 600 }}>Customers</div>
        <div style={{ background: '#F2F3F9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#5C5C74', padding: '4px 10px' }}>{customers.length} companies</div>
        <div style={{ flex: 1 }} />
        <div onClick={() => toast('Exporting to Excel…')} style={outlineBtn}>Export ▾</div>
        {canWrite && <div onClick={() => setImportOpen(true)} style={outlineBtn}>Import Excel</div>}
        {canWrite && <div onClick={openNew} style={primaryBtn}>+ Add customer</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E5E7F0', borderRadius: 9, padding: '8px 12px', width: 280 }}>
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5" fill="none" stroke="#5C5C74" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company, industry…" style={{ border: 'none', background: 'transparent', fontSize: 12.5, flex: 1, outline: 'none' }} />
        </div>
        {['Industry ▾', 'Status ▾', 'Owner ▾'].map((l) => <div key={l} style={outlineBtn}>{l}</div>)}
        <div style={{ flex: 1 }} />
      </div>

      {error && (
        <div style={{ background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'visible' }}>
        <div className="customers-grid" style={{ padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8888A0' }}>
          <div>Code</div><div>Company</div><div>Industry</div><div>Service tags</div><div>Status</div><div>Owner</div><div>Last activity</div><div style={{ textAlign: 'right' }}>Open value</div><div />
        </div>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
        {!loading && customers.length === 0 && !error && (
          <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No customers match this search.</div>
        )}
        {customers.map((c) => (
          <div key={c.id} className="customers-grid" style={{ padding: '12px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', position: 'relative' }}>
            <div onClick={() => navigate(`/customers/${c.id}`)} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#5C5C74', cursor: 'pointer' }}>{c.code}</div>
            <div onClick={() => navigate(`/customers/${c.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, cursor: 'pointer' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: '#EAEAF4', color: '#3B3B52', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                {initialsOf(c.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: '#8888A0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nameTh}</div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: '#3B3B52', minWidth: 0 }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.industry}</div>
              {c.primaryServiceLines && c.primaryServiceLines.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                  {c.primaryServiceLines.map((s) => (
                    <span key={s} style={{ background: '#EEF0FA', color: '#2A6FDB', borderRadius: 5, fontSize: 9.5, fontWeight: 700, padding: '1px 5px' }}>{s}</span>
                  ))}
                </div>
              )}
            </div>
            <TagCell tags={c.tags} onClick={() => navigate(`/customers/${c.id}`)} />
            <div><span style={statusStyle(c.status)}>{c.status}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={av(22, colorFor(c.ownerName))} title={c.ownerName}>{ownerInitials(c.ownerName)}</div>
              <span className="owner-name" style={{ fontSize: 12, color: '#3B3B52' }}>{c.ownerName}</span>
            </div>
            <div style={{ fontSize: 12, color: '#5C5C74' }}>{c.lastActivity}</div>
            <div style={{ textAlign: 'right', fontFamily: "'Space Grotesk'", fontSize: 13, fontWeight: 600 }}>{c.openValue ? fmt(c.openValue) : '—'}</div>
            <div style={{ position: 'relative', textAlign: 'right' }}>
              {(canWrite || canDelete) && (
                <div onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === c.id ? null : c.id) }} style={kebab}>⋯</div>
              )}
              {menuOpenId === c.id && (
                <div style={menu} onClick={(e) => e.stopPropagation()}>
                  {canWrite && <div onClick={() => openEdit(c)} style={menuItem}>Edit</div>}
                  {canDelete && <div onClick={() => onDelete(c)} style={{ ...menuItem, color: '#C0392B' }}>Delete</div>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <CustomerFormModal open={modalOpen} initial={editing} onClose={() => setModalOpen(false)} onSaved={onSaved} />
      <ImportCustomersModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => reload(query)} />
    </div>
  )
}

function TagCell({ tags, onClick }: { tags: TagDto[]; onClick: () => void }) {
  if (tags.length === 0) {
    return <div onClick={onClick} style={{ color: '#B4B4C4', fontSize: 11, cursor: 'pointer' }}>—</div>
  }
  const visible = tags.slice(0, 2)
  const extra = tags.length - visible.length
  const tooltip = tags.map((t) => t.name).join(', ')
  return (
    <div onClick={onClick} title={tooltip} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', cursor: 'pointer', minWidth: 0 }}>
      {visible.map((t) => (
        <span
          key={t.id}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: hexToRgba(t.color, 0.12), color: t.color,
            border: `1px solid ${hexToRgba(t.color, 0.35)}`,
            borderRadius: 6, fontSize: 10.5, fontWeight: 700,
            padding: '2px 7px', maxWidth: 100,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.color, flex: 'none' }} />
          {t.name}
        </span>
      ))}
      {extra > 0 && (
        <span style={{ background: '#F2F3F9', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '2px 6px' }}>
          +{extra}
        </span>
      )}
    </div>
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const outlineBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: '#3B3B52' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const kebab: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, color: '#8888A0', fontSize: 18, cursor: 'pointer' }
const menu: CSSProperties = { position: 'absolute', right: 0, top: 30, background: '#fff', border: '1px solid #E5E7F0', borderRadius: 9, boxShadow: '0 12px 30px rgba(14,31,25,.12)', minWidth: 120, zIndex: 10, textAlign: 'left', padding: 4 }
const menuItem: CSSProperties = { padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', borderRadius: 6 }
