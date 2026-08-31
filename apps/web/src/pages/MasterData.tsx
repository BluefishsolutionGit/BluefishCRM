import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type {
  ContractTypeDto, IndustryTypeDto, ProductDto,
  CreateProductDto, UpdateProductDto,
} from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

type MasterTab = 'industries' | 'products' | 'contracts'

const TABS: { id: MasterTab; label: string; hint: string }[] = [
  { id: 'industries', label: 'Industry types',  hint: 'Sectors used to classify customers.' },
  { id: 'products',   label: 'Products',        hint: 'Catalog used in opportunities & quotations.' },
  { id: 'contracts',  label: 'Contract types',  hint: 'Types selectable when creating a contract.' },
]

export default function MasterData({ onToast }: { onToast: (m: string) => void }) {
  const [tab, setTab] = useState<MasterTab>('industries')
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('user:manage')

  if (!canWrite) {
    return (
      <div style={warnCard}>
        Only administrators can manage master data. Ask your admin to add or edit
        industry types, products, and contract types.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, padding: 4, background: '#F2F3F9', borderRadius: 10, marginBottom: 14, width: 'fit-content' }}>
        {TABS.map((t) => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#2A6FDB' : '#5C5C74',
            boxShadow: tab === t.id ? '0 1px 3px rgba(17,24,39,.06)' : undefined,
          }}>{t.label}</div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#8888A0', marginBottom: 12 }}>{TABS.find((t) => t.id === tab)?.hint}</div>

      {tab === 'industries' && <IndustryTypesPanel onToast={onToast} />}
      {tab === 'products'   && <ProductsPanel onToast={onToast} />}
      {tab === 'contracts'  && <ContractTypesPanel onToast={onToast} />}
    </div>
  )
}

// ─── Industry Types ───
function IndustryTypesPanel({ onToast }: { onToast: (m: string) => void }) {
  return (
    <NamedMasterTable
      title="Industry types"
      unitLabel="customer"
      placeholderNew="e.g. Renewable Energy"
      onToast={onToast}
      list={(includeInactive) => api.industryTypes(includeInactive) as unknown as Promise<MasterRow[]>}
      create={(d) => api.createIndustryType(d) as unknown as Promise<MasterRow>}
      update={(id, d) => api.updateIndustryType(id, d) as unknown as Promise<MasterRow>}
      remove={(id) => api.deleteIndustryType(id)}
    />
  )
}

// ─── Contract Types ───
function ContractTypesPanel({ onToast }: { onToast: (m: string) => void }) {
  return (
    <NamedMasterTable
      title="Contract types"
      unitLabel="contract"
      placeholderNew="e.g. Framework Agreement"
      onToast={onToast}
      list={(includeInactive) => api.contractTypes(includeInactive) as unknown as Promise<MasterRow[]>}
      create={(d) => api.createContractType(d) as unknown as Promise<MasterRow>}
      update={(id, d) => api.updateContractType(id, d) as unknown as Promise<MasterRow>}
      remove={(id) => api.deleteContractType(id)}
    />
  )
}

type MasterRow = ContractTypeDto | IndustryTypeDto
type MasterInput = { name: string; description?: string | null; active?: boolean }

function NamedMasterTable({ title, unitLabel, placeholderNew, list, create, update, remove, onToast }: {
  title: string
  unitLabel: string
  placeholderNew: string
  list: (includeInactive: boolean) => Promise<MasterRow[]>
  create: (data: { name: string; description?: string; active?: boolean }) => Promise<MasterRow>
  update: (id: string, data: MasterInput) => Promise<MasterRow>
  remove: (id: string) => Promise<void>
  onToast: (m: string) => void
}) {
  const [rows, setRows] = useState<MasterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ name: string; description: string; active: boolean }>({ name: '', description: '', active: true })
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    setLoading(true)
    try { setRows(await list(showInactive)) }
    catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showInactive])

  const startCreate = () => { setDraft({ name: '', description: '', active: true }); setEditingId(null); setCreating(true) }
  const startEdit = (t: MasterRow) => { setDraft({ name: t.name, description: t.description ?? '', active: t.active }); setCreating(false); setEditingId(t.id) }
  const cancel = () => { setCreating(false); setEditingId(null) }

  const save = async () => {
    if (!draft.name.trim() || busy) return
    setBusy(true)
    try {
      if (creating) {
        await create({ name: draft.name.trim(), description: draft.description.trim() || undefined, active: draft.active })
        onToast(`${title} added`)
      } else if (editingId) {
        await update(editingId, { name: draft.name.trim(), description: draft.description.trim() || null, active: draft.active })
        onToast(`${title} saved`)
      }
      cancel(); reload()
    } catch (e) { onToast(e instanceof ApiError ? e.message : 'Save failed') }
    finally { setBusy(false) }
  }

  const del = async (t: MasterRow) => {
    if (t.usageCount > 0) {
      onToast(`"${t.name}" is used by ${t.usageCount} ${unitLabel}(s). Deactivate it instead of deleting.`)
      return
    }
    if (!confirm(`Delete "${t.name}"?`)) return
    try { await remove(t.id); onToast('Deleted'); reload() }
    catch (e) { onToast(e instanceof ApiError ? e.message : 'Delete failed') }
  }

  const toggleActive = async (t: MasterRow) => {
    try { await update(t.id, { name: t.name, active: !t.active }); reload() }
    catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') }
  }

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #F2F3F9', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{title}</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#5C5C74', cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Include inactive
        </label>
        {!creating && editingId == null && <div onClick={startCreate} style={primaryBtn}>+ New</div>}
      </div>

      {(creating || editingId) && (
        <div style={{ padding: '14px 18px', background: '#F7F8FC', borderBottom: '1px solid #E5E7F0', display: 'grid', gridTemplateColumns: '1.2fr 2fr 130px auto', gap: 12, alignItems: 'end' }}>
          <div>
            <div style={fieldLabel}>Name *</div>
            <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={placeholderNew} style={inp} />
          </div>
          <div>
            <div style={fieldLabel}>Description</div>
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Optional" style={inp} />
          </div>
          <div>
            <div style={fieldLabel}>Status</div>
            <select value={draft.active ? 'active' : 'inactive'} onChange={(e) => setDraft({ ...draft, active: e.target.value === 'active' })} style={inp}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div onClick={cancel} style={outlineBtn}>Cancel</div>
            <div onClick={save} style={{ ...primaryBtn, opacity: !draft.name.trim() || busy ? 0.5 : 1 }}>{busy ? 'Saving…' : (creating ? 'Create' : 'Save')}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 90px 90px 160px', gap: 10, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8888A0' }}>
        <div>Name</div><div>Description</div><div style={{ textAlign: 'right' }}>In use</div><div>Status</div><div style={{ textAlign: 'right' }} />
      </div>

      {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {!loading && rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Nothing here yet.</div>}
      {rows.map((t) => (
        <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 90px 90px 160px', gap: 10, padding: '12px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', opacity: t.active ? 1 : 0.6 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
          <div style={{ fontSize: 12, color: '#5C5C74' }}>{t.description || <span style={{ color: '#BBBBCB' }}>—</span>}</div>
          <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: t.usageCount > 0 ? '#2A6FDB' : '#8888A0' }}>{t.usageCount}</div>
          <div>
            <span style={{ background: t.active ? '#E5F8ED' : '#F2F3F9', color: t.active ? '#0E6E4E' : '#8888A0', borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '3px 8px' }}>{t.active ? 'Active' : 'Inactive'}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <div onClick={() => toggleActive(t)} style={{ ...miniBtn, fontSize: 10.5 }}>{t.active ? 'Disable' : 'Enable'}</div>
            <div onClick={() => startEdit(t)} style={{ ...miniBtn, fontSize: 10.5 }}>Edit</div>
            <div onClick={() => del(t)} style={{ ...miniBtn, fontSize: 10.5, color: t.usageCount > 0 ? '#BBBBCB' : '#C0392B', borderColor: t.usageCount > 0 ? '#E5E7F0' : '#F5C7C0', cursor: t.usageCount > 0 ? 'not-allowed' : 'pointer' }} title={t.usageCount > 0 ? 'Cannot delete — in use' : undefined}>Delete</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Products ───
function ProductsPanel({ onToast }: { onToast: (m: string) => void }) {
  const [rows, setRows] = useState<ProductDto[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ProductDto | null>(null)

  const reload = async () => {
    setLoading(true)
    try { setRows(await api.products()) }
    catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const filtered = q.trim()
    ? rows.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.code.toLowerCase().includes(q.toLowerCase()))
    : rows

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #F2F3F9', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, flex: 'none' }}>Products</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code or name" style={{ ...inp, maxWidth: 260, padding: '6px 10px', fontSize: 12 }} />
        <div style={{ flex: 1 }} />
        <div onClick={() => setCreating(true)} style={primaryBtn}>+ New product</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '130px 1.5fr 2fr 110px 90px 130px', gap: 10, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8888A0' }}>
        <div>Code</div><div>Name</div><div>Description</div><div style={{ textAlign: 'right' }}>Unit price</div><div>Status</div><div style={{ textAlign: 'right' }} />
      </div>
      {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {!loading && filtered.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No products.</div>}
      {filtered.map((p) => (
        <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '130px 1.5fr 2fr 110px 90px 130px', gap: 10, padding: '12px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', opacity: p.isActive ? 1 : 0.55 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{p.code}</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
          <div style={{ fontSize: 12, color: '#5C5C74' }}>{p.description || <span style={{ color: '#BBBBCB' }}>—</span>}</div>
          <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{p.currency} {p.unitPrice.toLocaleString('en-US')}</div>
          <div>
            <span style={{ background: p.isActive ? '#E5F8ED' : '#F2F3F9', color: p.isActive ? '#0E6E4E' : '#8888A0', borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '3px 8px' }}>{p.isActive ? 'Active' : 'Inactive'}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <div onClick={async () => { try { await api.updateProduct(p.id, { isActive: !p.isActive }); reload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }} style={{ ...miniBtn, fontSize: 10.5 }}>{p.isActive ? 'Disable' : 'Enable'}</div>
            <div onClick={() => setEditing(p)} style={{ ...miniBtn, fontSize: 10.5 }}>Edit</div>
            <div onClick={async () => { if (confirm(`Delete product "${p.name}"?`)) { try { await api.deleteProduct(p.id); onToast('Deleted'); reload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Delete failed') } } }} style={{ ...miniBtn, fontSize: 10.5, color: '#C0392B', borderColor: '#F5C7C0' }}>Delete</div>
          </div>
        </div>
      ))}

      {(creating || editing) && (
        <ProductEditor
          product={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); reload() }}
          onToast={onToast}
        />
      )}
    </div>
  )
}

function ProductEditor({ product, onClose, onSaved, onToast }: { product: ProductDto | null; onClose: () => void; onSaved: () => void; onToast: (m: string) => void }) {
  const [code, setCode] = useState(product?.code ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [unitPrice, setUnitPrice] = useState<number>(product?.unitPrice ?? 0)
  const [currency, setCurrency] = useState(product?.currency ?? 'THB')
  const [isActive, setIsActive] = useState(product?.isActive ?? true)
  const [busy, setBusy] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !name.trim() || busy) return
    setBusy(true)
    try {
      if (product) {
        const body: UpdateProductDto = { code: code.trim(), name: name.trim(), description: description.trim() || undefined, unitPrice, currency, isActive }
        await api.updateProduct(product.id, body)
        onToast('Product saved')
      } else {
        const body: CreateProductDto = { code: code.trim(), name: name.trim(), description: description.trim() || undefined, unitPrice, currency, isActive }
        await api.createProduct(body)
        onToast('Product added')
      }
      onSaved()
    } catch (err) { onToast(err instanceof ApiError ? err.message : 'Save failed') }
    finally { setBusy(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} style={{ ...dialog, maxWidth: 560, padding: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{product ? 'Edit product' : 'New product'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
          <label>
            <div style={fieldLabel}>Code *</div>
            <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SKU-001" style={inp} />
          </label>
          <label>
            <div style={fieldLabel}>Name *</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" style={inp} />
          </label>
          <label style={{ gridColumn: 'span 2' }}>
            <div style={fieldLabel}>Description</div>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          </label>
          <label>
            <div style={fieldLabel}>Unit price</div>
            <input type="number" min={0} value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} style={inp} />
          </label>
          <label>
            <div style={fieldLabel}>Currency</div>
            <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} maxLength={3} style={inp} />
          </label>
          <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5C5C74' }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
          <button type="submit" disabled={busy || !code.trim() || !name.trim()} style={{ ...btnPrimary, opacity: busy || !code.trim() || !name.trim() ? 0.5 : 1 }}>{busy ? 'Saving…' : (product ? 'Save' : 'Create')}</button>
        </div>
      </form>
    </div>
  )
}

// ─── styles ───
const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14 }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 15px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-block' }
const outlineBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', color: '#3B3B52', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-block' }
const miniBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: 'pointer', color: '#3B3B52' }
const fieldLabel: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#5C5C74', marginBottom: 6 }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const warnCard: CSSProperties = { background: '#FEF3E2', color: '#B4650A', border: '1px solid #F5D4A6', borderRadius: 10, padding: '14px 18px', fontSize: 13 }
