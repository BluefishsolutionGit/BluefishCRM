import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { ProductDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

export default function Products() {
  const [products, setProducts] = useState<ProductDto[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ProductDto | null>(null)
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canManage = hasPermission('user:manage')

  const reload = async () => {
    setLoading(true)
    try { setProducts(await api.products(canManage)) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed to load products') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (p: ProductDto) => { setEditing(p); setModalOpen(true) }

  const del = async (p: ProductDto) => {
    if (!window.confirm(`Deactivate ${p.name}?`)) return
    try { await api.deleteProduct(p.id); toast('Product deactivated'); reload() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 600 }}>Product catalog</div>
        <div style={{ background: '#F2F3F9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#5C5C74', padding: '4px 10px' }}>{products.length} products</div>
        <div style={{ flex: 1 }} />
        {canManage && <div onClick={openNew} style={primaryBtn}>+ New product</div>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ ...gridCols, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8888A0' }}>
          <div>Code</div><div>Name</div><div>Description</div><div style={{ textAlign: 'right' }}>Unit price</div><div>Status</div><div />
        </div>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
        {!loading && products.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No products yet.</div>}
        {products.map((p) => (
          <div key={p.id} style={{ ...gridCols, padding: '12px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', opacity: p.isActive ? 1 : 0.55 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, fontWeight: 500 }}>{p.code}</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
            <div style={{ fontSize: 12, color: '#5C5C74' }}>{p.description ?? '—'}</div>
            <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>{p.currency} {p.unitPrice.toLocaleString()}</div>
            <div>
              <span style={{ background: p.isActive ? '#E5F8ED' : '#F2F3F9', color: p.isActive ? '#0E6E4E' : '#8888A0', borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '3px 8px' }}>{p.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              {canManage && <div onClick={() => openEdit(p)} style={miniBtn}>Edit</div>}
              {canManage && p.isActive && <div onClick={() => del(p)} style={{ ...miniBtn, color: '#C0392B' }}>Deactivate</div>}
            </div>
          </div>
        ))}
      </div>

      {modalOpen && <ProductModal initial={editing} onClose={() => setModalOpen(false)} onSaved={reload} />}
    </div>
  )
}

function ProductModal({ initial, onClose, onSaved }: { initial: ProductDto | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      const payload = { code, name, description: description || undefined, unitPrice: Number(unitPrice) }
      if (initial) await api.updateProduct(initial.id, payload)
      else await api.createProduct(payload)
      onSaved(); onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, flex: 1 }}>{initial ? 'Edit product' : 'New product'}</div>
            <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0' }}>×</div>
          </div>
          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={label}>Code<input value={code} onChange={(e) => setCode(e.target.value)} required style={inp} /></label>
            <label style={label}>Unit price (฿)<input type="number" min={0} value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} required style={inp} /></label>
            <label style={{ ...label, gridColumn: 'span 2' }}>Name<input value={name} onChange={(e) => setName(e.target.value)} required style={inp} /></label>
            <label style={{ ...label, gridColumn: 'span 2' }}>Description<input value={description} onChange={(e) => setDescription(e.target.value)} style={inp} /></label>
          </div>
          {error && <div style={{ margin: '0 22px 12px', background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>{error}</div>}
          <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const gridCols: CSSProperties = { display: 'grid', gridTemplateColumns: '140px 1.6fr 2fr 140px 100px 140px', gap: 10 }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const miniBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, fontSize: 11.5, fontWeight: 600, padding: '5px 11px', cursor: 'pointer' }
const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', maxWidth: 560, borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const label: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#5C5C74' }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', marginTop: 6 }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
