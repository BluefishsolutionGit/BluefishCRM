import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react'
import type { CustomerDto, DocumentCategory, DocumentDto, ServiceLine } from '@bluefish/shared'
import { DOCUMENT_CATEGORIES, SERVICE_LINES } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

const CAT_STYLE: Record<string, { bg: string; fg: string }> = {
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
const SERVICE_STYLE: Record<ServiceLine, { bg: string; fg: string }> = {
  '3D':     { bg: '#EEF0FA', fg: '#4A3AB8' },
  '3S':     { bg: '#E4EDFC', fg: '#2A6FDB' },
  'Box':    { bg: '#FEF3E2', fg: '#B4650A' },
  'AI&RPA': { bg: '#E5F8ED', fg: '#0E6E4E' },
}

type ViewMode = 'category' | 'company' | 'service'
type SelectionKey =
  | { view: 'category'; value: DocumentCategory | 'all' | '__central' }
  | { view: 'company';  value: string | 'all' | '__central' }
  | { view: 'service';  value: ServiceLine | 'all' | '__central' }

export default function Documents() {
  const [documents, setDocuments] = useState<DocumentDto[]>([])
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState<false | 'default' | 'central'>(false)
  const [selected, setSelected] = useState<DocumentDto | null>(null)
  const [view, setView] = useState<ViewMode>('category')
  const [pick, setPick] = useState<SelectionKey>({ view: 'category', value: 'all' })
  const [q, setQ] = useState('')
  const toast = useToast()
  const { hasPermission, user } = useAuth()
  const canWrite = hasPermission('customer:write')
  const canSeeAll = hasPermission('service:view_all')
  const availableServices = useMemo<ServiceLine[]>(
    () => canSeeAll ? [...SERVICE_LINES] : SERVICE_LINES.filter((s) => (user?.services ?? []).includes(s)),
    [canSeeAll, user?.services],
  )

  const reload = async () => {
    setLoading(true)
    try {
      const [docs, cs] = await Promise.all([
        api.documents({ q: q.trim() || undefined }),
        customers.length ? Promise.resolve(customers) : api.customers(),
      ])
      setDocuments(docs)
      if (!customers.length) setCustomers(cs)
      if (selected) setSelected(docs.find((d) => d.id === selected.id) ?? null)
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { const h = setTimeout(reload, 250); return () => clearTimeout(h) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [q])
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  // Switch view resets the picked bucket
  const switchView = (v: ViewMode) => { setView(v); setPick({ view: v, value: 'all' } as SelectionKey); setSelected(null) }

  // ── Grouping / left-rail buckets ──────────────────────────────────────
  const centralCount = useMemo(() => documents.filter((d) => d.isCentral).length, [documents])

  const buckets = useMemo(() => {
    const items: Array<{ key: string; label: string; sub?: string; count: number; onPick: () => void; tone?: { bg: string; fg: string }; icon?: string; badge?: string }> = []
    items.push({ key: 'all', label: 'All documents', count: documents.length, onPick: () => setPick({ view, value: 'all' } as SelectionKey) })
    const scopeDocs = documents.filter((d) => !d.isCentral)
    if (view === 'category') {
      const bySlug = new Map<DocumentCategory, number>()
      for (const d of scopeDocs) bySlug.set(d.category, (bySlug.get(d.category) ?? 0) + 1)
      for (const c of DOCUMENT_CATEGORIES) {
        const cnt = bySlug.get(c.id) ?? 0
        if (cnt === 0) continue
        items.push({ key: c.id, label: c.label, sub: c.th, count: cnt, tone: CAT_STYLE[c.id], onPick: () => setPick({ view, value: c.id } as SelectionKey) })
      }
    } else if (view === 'company') {
      const byCust = new Map<string, { name: string; code: string; count: number }>()
      let noCust = 0
      for (const d of scopeDocs) {
        if (!d.customerId) { noCust++; continue }
        const cur = byCust.get(d.customerId) ?? { name: d.customerName ?? '—', code: d.customerCode ?? '', count: 0 }
        cur.count++; byCust.set(d.customerId, cur)
      }
      for (const [id, meta] of [...byCust.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name))) {
        items.push({ key: id, label: meta.name, sub: meta.code, count: meta.count, onPick: () => setPick({ view, value: id } as SelectionKey), tone: { bg: '#F7F8FC', fg: '#3B3B52' } })
      }
      if (noCust > 0) items.push({ key: '__nocust', label: 'Unlinked', sub: 'Not tied to a company', count: noCust, tone: { bg: '#F2F3F9', fg: '#8888A0' }, onPick: () => setPick({ view, value: '__nocust' } as SelectionKey) })
    } else {
      const bySvc = new Map<ServiceLine, number>()
      let noSvc = 0
      for (const d of scopeDocs) {
        if (!d.serviceLines || d.serviceLines.length === 0) { noSvc++; continue }
        for (const s of d.serviceLines) bySvc.set(s, (bySvc.get(s) ?? 0) + 1)
      }
      for (const s of availableServices) {
        const cnt = bySvc.get(s) ?? 0
        if (cnt === 0) continue
        items.push({ key: s, label: s, count: cnt, tone: SERVICE_STYLE[s], onPick: () => setPick({ view, value: s } as SelectionKey) })
      }
      if (noSvc > 0) items.push({ key: '__nosvc', label: 'No service tag', count: noSvc, tone: { bg: '#F2F3F9', fg: '#8888A0' }, onPick: () => setPick({ view, value: '__nosvc' } as SelectionKey) })
    }
    return items
  }, [documents, view, availableServices])

  // ── Filtering the right-side list based on picked bucket ───────────────
  const visible = useMemo(() => {
    return documents.filter((d) => {
      if (pick.view !== view) return true
      const v = pick.value as string
      if (v === 'all') return true
      if (v === '__central') return d.isCentral
      if (view === 'category') return !d.isCentral && d.category === v
      if (view === 'company')  return v === '__nocust' ? (!d.customerId && !d.isCentral) : (d.customerId === v && !d.isCentral)
      if (view === 'service')  return v === '__nosvc' ? ((d.serviceLines?.length ?? 0) === 0 && !d.isCentral) : (d.serviceLines?.includes(v as ServiceLine) && !d.isCentral)
      return true
    })
  }, [documents, view, pick])

  const del = async (d: DocumentDto) => {
    if (!window.confirm(`Delete "${d.name}"? All versions are removed.`)) return
    try { await api.deleteDocument(d.id); toast('Deleted'); if (selected?.id === d.id) setSelected(null); reload() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Delete failed') }
  }

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', background: '#F7F8FC' }}>
      {/* Left rail */}
      <div style={{ width: 260, minWidth: 260, background: '#fff', borderRight: '1px solid #E5E7F0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 700, flex: 1 }}>Documents</div>
            <ViewSwitcher view={view} onChange={switchView} />
          </div>
          <div style={{ fontSize: 11.5, color: '#8888A0', marginTop: 4 }}>
            {documents.length} across your workspace · <span style={{ color: '#2A6FDB', fontWeight: 700 }}>{VIEW_LABEL[view]}</span>
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 8px 12px' }}>
          {/* Pinned: central (company-shared) documents. Always visible even if empty so
              admins have an obvious place to drop registration/policy docs. */}
          <div style={{ padding: '2px 4px 8px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.09em', color: '#8888A0', textTransform: 'uppercase', padding: '4px 8px 6px' }}>
              Company
            </div>
            <div
              onClick={() => setPick({ view, value: '__central' } as SelectionKey)}
              style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                cursor: 'pointer',
                background: pick.value === '__central'
                  ? 'linear-gradient(135deg, #EAE7F7, #F4F1FD)'
                  : 'linear-gradient(135deg, #F4F1FD, #FBFAFE)',
                border: `1px solid ${pick.value === '__central' ? '#B7A8ED' : '#EAE7F7'}`,
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 9, flex: 'none',
                background: '#4A3AB8', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path d="M4 20V8l8-5 8 5v12M9 20v-6h6v6M9 10h.01M13 10h.01M13 14h.01M9 14h.01"
                        fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2E1A6B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Company Documents
                </div>
                <div style={{ fontSize: 10.5, color: '#5B3FC4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Company registration · policies · shared assets
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#4A3AB8', minWidth: 20, textAlign: 'right' }}>
                {centralCount}
              </div>
              {canWrite && canSeeAll && (
                <div
                  onClick={(e) => { e.stopPropagation(); setUploadOpen('central') }}
                  title="Upload a company document"
                  style={{
                    width: 22, height: 22, borderRadius: 6, cursor: 'pointer', flex: 'none',
                    background: '#4A3AB8', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: 700, lineHeight: 1,
                  }}
                >+</div>
              )}
            </div>
          </div>

          {buckets.map((b) => {
            const active = (pick.view === view) && (pick.value as string) === b.key
            return (
              <div key={b.key} onClick={b.onPick} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9,
                cursor: 'pointer', marginBottom: 2,
                background: active ? '#EEF0FA' : 'transparent',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flex: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10.5, fontWeight: 800,
                  background: b.tone?.bg ?? '#F2F3F9', color: b.tone?.fg ?? '#5C5C74',
                }}>{initials(b.label)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: active ? '#2E1A6B' : '#3B3B52', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</div>
                  {b.sub && <div style={{ fontSize: 10.5, color: '#8888A0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.sub}</div>}
                </div>
                {b.badge && <span style={{ background: '#F4F1FD', color: '#4A3AB8', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, textTransform: 'uppercase' }}>{b.badge}</span>}
                <span style={{ fontSize: 11, fontWeight: 700, color: '#8888A0', minWidth: 20, textAlign: 'right' }}>{b.count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main pane */}
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div style={{ padding: '18px 24px 12px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #E5E7F0', background: '#fff' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 460 }}>
            <svg viewBox="0 0 24 24" width="15" height="15" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8888A0' }}>
              <path d="M11 4a7 7 0 105.196 11.803l3.5 3.5a1 1 0 001.415-1.414l-3.5-3.5A7 7 0 0011 4zm-5 7a5 5 0 1110 0 5 5 0 01-10 0z" fill="currentColor" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents by name, company, description…"
              style={{ width: '100%', border: '1px solid #E5E7F0', borderRadius: 10, padding: '8px 32px', fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ fontSize: 12, color: '#8888A0' }}>Showing <b style={{ color: '#3B3B52' }}>{visible.length}</b></div>
          <div style={{ flex: 1 }} />
          {!canSeeAll && (
            <div title="Rep-only view: only central docs + your services" style={{ background: '#EEF0FA', color: '#2A6FDB', fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 999 }}>
              scoped to {user?.services?.join(', ') || '—'}
            </div>
          )}
          {canWrite && <div onClick={() => setUploadOpen('default')} style={primaryBtn}>+ Upload document</div>}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr' }}>
          <div style={{ overflow: 'auto', padding: '14px 24px 22px' }}>
            <DocGrid rows={visible} loading={loading} selected={selected} setSelected={setSelected} canWrite={canWrite} del={del} />
          </div>
          {selected && (
            <div style={{ borderLeft: '1px solid #E5E7F0', background: '#fff', overflow: 'auto' }}>
              <DocumentDetailPanel
                key={selected.id}
                document={selected}
                onClose={() => setSelected(null)}
                canWrite={canWrite}
                availableServices={availableServices}
                onReload={reload}
              />
            </div>
          )}
        </div>
      </div>

      {uploadOpen && (
        <UploadModal
          customers={customers}
          availableServices={availableServices}
          canMarkCentral={canSeeAll}
          defaultCentral={uploadOpen === 'central'}
          onClose={() => setUploadOpen(false)}
          onDone={() => { setUploadOpen(false); reload() }}
        />
      )}
    </div>
  )
}

const VIEW_LABEL: Record<ViewMode, string> = {
  category: 'By type',
  company:  'By company',
  service:  'By service',
}

// Compact SVG paths for the three view modes.
const VIEW_ICON: Record<ViewMode, string> = {
  // Category → tag-style icon
  category: 'M20 12l-8 8-9-9V3h8l9 9zM6.5 6.5h.01',
  // Company → building icon
  company:  'M4 20V6a2 2 0 012-2h4v16H4zm10-12h4a2 2 0 012 2v10h-6V8zM7 7h.01M7 11h.01M7 15h.01M17 11h.01M17 15h.01',
  // Service → layers icon
  service:  'M12 3l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5M3 17l9 5 9-5',
}

function ViewSwitcher({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen((v) => !v)}
        title={`View: ${VIEW_LABEL[view]}`}
        style={{
          width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
          background: open ? '#EEF0FA' : '#F7F8FC',
          border: '1px solid #E5E7F0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: open ? '#2A6FDB' : '#5C5C74',
        }}
      >
        <svg viewBox="0 0 24 24" width="15" height="15">
          <path d={VIEW_ICON[view]} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 34,
          background: '#fff', border: '1px solid #E5E7F0', borderRadius: 10,
          boxShadow: '0 12px 32px rgba(14,31,25,.14)', minWidth: 160, padding: 4, zIndex: 30,
        }}>
          {(['category', 'company', 'service'] as ViewMode[]).map((id) => (
            <div key={id} onClick={() => { onChange(id); setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7,
              cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              color: view === id ? '#2A6FDB' : '#3B3B52',
              background: view === id ? '#EEF0FA' : 'transparent',
            }}>
              <svg viewBox="0 0 24 24" width="14" height="14" style={{ flex: 'none' }}>
                <path d={VIEW_ICON[id]} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ flex: 1 }}>{VIEW_LABEL[id]}</span>
              {view === id && <span style={{ fontSize: 12, color: '#2A6FDB' }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function initials(s: string): string {
  const clean = s.replace(/[^\w\s฀-๿&]/g, '').trim()
  const parts = clean.split(/\s+/).slice(0, 2)
  return (parts.map((p) => p[0] ?? '').join('') || '·').slice(0, 3).toUpperCase()
}

function DocGrid({ rows, loading, selected, setSelected, canWrite, del }: {
  rows: DocumentDto[]; loading: boolean; selected: DocumentDto | null
  setSelected: (d: DocumentDto | null) => void
  canWrite: boolean; del: (d: DocumentDto) => void
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ ...grid, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8888A0' }}>
        <div>Name</div><div>Category</div><div>Company</div><div>Services</div><div>v</div><div>Size</div><div>Uploaded</div><div />
      </div>
      {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {!loading && rows.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Nothing here.</div>}
      {rows.map((d) => {
        const cat = CAT_STYLE[d.category] ?? CAT_STYLE.other
        const cv = d.currentVersion
        return (
          <div key={d.id} onClick={() => setSelected(d)} style={{ ...grid, padding: '12px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', cursor: 'pointer', background: selected?.id === d.id ? '#F7F8FC' : 'transparent' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
              <svg viewBox="0 0 24 24" width="18" height="18" style={{ flex: 'none' }}><path d="M6.5 3h8l4 4v14h-12z M14 3v5h4.5" fill="none" stroke="#5C5C74" strokeWidth={1.7} strokeLinejoin="round" /></svg>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', gap: 6, alignItems: 'center' }}>
                  {d.name}
                  {d.isCentral && <span style={{ background: '#F4F1FD', color: '#4A3AB8', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, textTransform: 'uppercase' }}>central</span>}
                  {d.kind === 'link' && <span style={{ background: '#EEF0FA', color: '#4A3AB8', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, textTransform: 'uppercase' }}>link</span>}
                </div>
                {d.description && <div style={{ fontSize: 11, color: '#8888A0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.description}</div>}
              </div>
            </div>
            <div><span style={{ background: cat.bg, color: cat.fg, borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '3px 8px' }}>{d.category}</span></div>
            <div style={{ fontSize: 12, color: '#5C5C74', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.customerName ?? '—'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {(d.serviceLines ?? []).length === 0
                ? <span style={{ color: '#BBBBCB', fontSize: 11 }}>—</span>
                : (d.serviceLines ?? []).map((s) => {
                    const st = SERVICE_STYLE[s]
                    return <span key={s} style={{ background: st.bg, color: st.fg, borderRadius: 5, fontSize: 9.5, fontWeight: 800, padding: '1px 5px' }}>{s}</span>
                  })}
            </div>
            <div style={{ fontSize: 12, color: '#5C5C74' }}>v{cv?.versionNo ?? '—'}</div>
            <div style={{ fontSize: 12, color: '#5C5C74' }}>{cv ? Math.max(1, Math.round(cv.sizeBytes / 1024)) + ' KB' : '—'}</div>
            <div style={{ fontSize: 12, color: '#5C5C74' }}>{cv ? new Date(cv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</div>
            <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
              {cv && <a href={api.documentDownloadUrl(cv.id)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={miniBtn}>↓</a>}
              {canWrite && <div onClick={(e) => { e.stopPropagation(); del(d) }} style={{ ...miniBtn, color: '#C0392B' }}>×</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DocumentDetailPanel({ document, onClose, canWrite, availableServices, onReload }: {
  document: DocumentDto; onClose: () => void; canWrite: boolean
  availableServices: ServiceLine[]; onReload: () => void
}) {
  const toast = useToast()
  const cv = document.currentVersion
  const extraction = cv?.extraction
  const [editing, setEditing] = useState(false)
  const [pendingNote, setPendingNote] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const uploadNewVersion = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const notes = window.prompt('Version note (what changed)?', pendingNote) ?? undefined
    try { await api.uploadDocumentVersion(document.id, file, { notes }); toast('New version uploaded'); onReload() }
    catch (err) { toast(err instanceof ApiError ? err.message : 'Upload failed') }
    setPendingNote('')
  }

  const makeCurrent = async (versionId: string) => {
    try { await api.makeDocumentVersionCurrent(document.id, versionId); toast('Version rolled back'); onReload() }
    catch (err) { toast(err instanceof ApiError ? err.message : 'Failed') }
  }

  const deleteVersion = async (versionId: string) => {
    if (!window.confirm('Delete this version?')) return
    try { await api.deleteDocumentVersion(document.id, versionId); toast('Version removed'); onReload() }
    catch (err) { toast(err instanceof ApiError ? err.message : 'Failed') }
  }

  return (
    <div>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid #F2F3F9', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{document.name}</div>
        {canWrite && <div onClick={() => setEditing(true)} style={miniBtn}>Edit</div>}
        <div onClick={onClose} style={{ cursor: 'pointer', color: '#8888A0', fontSize: 18 }}>×</div>
      </div>

      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
        {document.description && <div style={{ background: '#F7F8FC', borderRadius: 8, padding: '8px 10px', color: '#3B3B52' }}>{document.description}</div>}
        <div><b style={{ color: '#8888A0' }}>Category:</b> {document.category}</div>
        <div>
          <b style={{ color: '#8888A0' }}>Scope:</b>{' '}
          {document.isCentral
            ? <span style={{ background: '#F4F1FD', color: '#4A3AB8', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>central — visible to all</span>
            : ((document.serviceLines?.length ?? 0) > 0
                ? document.serviceLines.map((s) => {
                    const st = SERVICE_STYLE[s]
                    return <span key={s} style={{ background: st.bg, color: st.fg, borderRadius: 5, fontSize: 10.5, fontWeight: 700, padding: '2px 7px', marginRight: 4 }}>{s}</span>
                  })
                : <span style={{ color: '#8888A0' }}>Not scoped to a service</span>)}
        </div>
        {document.customerName && <div><b style={{ color: '#8888A0' }}>Company:</b> {document.customerName}</div>}
        <div><b style={{ color: '#8888A0' }}>Uploaded by:</b> {document.uploadedByName}</div>

        {cv && (
          <div style={{ marginTop: 4, borderTop: '1px solid #F2F3F9', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase', marginBottom: 6 }}>Current version</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ background: '#EEF0FA', color: '#2A6FDB', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6 }}>v{cv.versionNo}</span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cv.filename} · {Math.max(1, Math.round(cv.sizeBytes / 1024))} KB</div>
              <a href={api.documentDownloadUrl(cv.id)} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, fontSize: 11, padding: '5px 12px', textDecoration: 'none', display: 'inline-block' }}>Download</a>
            </div>
            {cv.notes && <div style={{ marginTop: 6, fontSize: 11.5, color: '#5C5C74', background: '#F7F8FC', borderRadius: 8, padding: '6px 10px' }}>{cv.notes}</div>}
          </div>
        )}

        {canWrite && (
          <>
            <input ref={fileInputRef} type="file" onChange={uploadNewVersion} style={{ display: 'none' }} />
            <div onClick={() => fileInputRef.current?.click()} style={{ ...outlineBtn, textAlign: 'center', cursor: 'pointer' }}>+ Upload new version</div>
          </>
        )}

        {document.versions.length > 1 && (
          <div style={{ marginTop: 8, borderTop: '1px solid #F2F3F9', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase', marginBottom: 6 }}>Version history ({document.versions.length})</div>
            {document.versions.map((v) => {
              const isCurrent = v.id === cv?.id
              return (
                <div key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 0', borderTop: '1px solid #F7F8FC' }}>
                  <span style={{ background: isCurrent ? '#0E9C7E' : '#F2F3F9', color: isCurrent ? '#fff' : '#5C5C74', fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, flex: 'none' }}>v{v.versionNo}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.filename}</div>
                    <div style={{ fontSize: 10.5, color: '#8888A0' }}>
                      {new Date(v.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })} · {v.uploadedByName} · {Math.max(1, Math.round(v.sizeBytes / 1024))} KB
                    </div>
                    {v.notes && <div style={{ marginTop: 3, fontSize: 11, color: '#5C5C74' }}>{v.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 3, flex: 'none' }}>
                    <a href={api.documentDownloadUrl(v.id)} target="_blank" rel="noopener noreferrer" style={{ ...miniBtn, fontSize: 10.5, padding: '3px 8px' }}>↓</a>
                    {canWrite && !isCurrent && (
                      <>
                        <div onClick={() => makeCurrent(v.id)} title="Make this the current version" style={{ ...miniBtn, fontSize: 10.5, padding: '3px 8px', color: '#2A6FDB' }}>current</div>
                        <div onClick={() => deleteVersion(v.id)} title="Delete this version" style={{ ...miniBtn, fontSize: 10.5, padding: '3px 8px', color: '#C0392B' }}>×</div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {extraction && extraction.status === 'ready' && (
          <div style={{ marginTop: 10, borderTop: '1px solid #F2F3F9', paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase', marginBottom: 8 }}>AI extraction</div>
            {extraction.classification && extraction.classification !== 'other' && (
              <div style={{ marginBottom: 6 }}><b style={{ color: '#8888A0' }}>Classification:</b> {extraction.classification}</div>
            )}
            {extraction.fields && Object.keys(extraction.fields).length > 0 ? (
              <div style={{ background: '#F4F1FD', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(extraction.fields).map(([k, val]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ color: '#4A3AB8', fontWeight: 700, minWidth: 100, textTransform: 'capitalize' }}>{k}</span>
                    <span>{String(val)}</span>
                  </div>
                ))}
              </div>
            ) : <div style={{ fontSize: 12, color: '#8888A0' }}>No fields auto-detected.</div>}
          </div>
        )}
      </div>

      {editing && (
        <EditDocumentModal
          document={document}
          availableServices={availableServices}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onReload() }}
        />
      )}
    </div>
  )
}

function EditDocumentModal({ document, availableServices, onClose, onSaved }: {
  document: DocumentDto; availableServices: ServiceLine[]; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const { hasPermission } = useAuth()
  const [name, setName] = useState(document.name)
  const [description, setDescription] = useState(document.description ?? '')
  const [category, setCategory] = useState<DocumentCategory>(document.category)
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>(document.serviceLines ?? [])
  const [isCentral, setIsCentral] = useState(document.isCentral)
  const [busy, setBusy] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true)
    try {
      await api.updateDocument(document.id, {
        name: name.trim(),
        description: description.trim() || null,
        category, serviceLines, isCentral,
      })
      toast('Saved'); onSaved()
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Save failed') }
    finally { setBusy(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} style={{ ...dialog, maxWidth: 520, padding: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Edit document</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            <div style={fieldLabel}>Name *</div>
            <input value={name} onChange={(e) => setName(e.target.value)} required style={inp} />
          </label>
          <label>
            <div style={fieldLabel}>Description</div>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          </label>
          <label>
            <div style={fieldLabel}>Category</div>
            <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)} style={inp}>
              {DOCUMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.th}</option>)}
            </select>
          </label>
          <div>
            <div style={fieldLabel}>Service lines</div>
            <ServiceChipPicker selected={serviceLines} onChange={setServiceLines} available={availableServices} />
          </div>
          {hasPermission('service:view_all') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#3B3B52' }}>
              <input type="checkbox" checked={isCentral} onChange={(e) => setIsCentral(e.target.checked)} />
              Mark as <b>central</b> — visible to every user regardless of service scope
            </label>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
          <button type="submit" disabled={busy || !name.trim()} style={{ ...btnPrimary, opacity: busy || !name.trim() ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

function UploadModal({ customers, availableServices, canMarkCentral, defaultCentral, onClose, onDone }: {
  customers: CustomerDto[]; availableServices: ServiceLine[]; canMarkCentral: boolean
  defaultCentral?: boolean
  onClose: () => void; onDone: () => void
}) {
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [category, setCategory] = useState<DocumentCategory | ''>('')
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([])
  const [isCentral, setIsCentral] = useState(!!(defaultCentral && canMarkCentral))
  const [versionNotes, setVersionNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!file) return
    setBusy(true)
    try {
      await api.uploadDocument(file, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        customerId: customerId || undefined,
        category: category || undefined,
        serviceLines: serviceLines.length ? serviceLines : undefined,
        isCentral: isCentral || undefined,
        versionNotes: versionNotes.trim() || undefined,
      })
      toast('Document uploaded')
      onDone()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Upload failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={{ ...dialog, maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, flex: 1 }}>Upload document</div>
          <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0' }}>×</div>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1.5px dashed #D0D0DF', borderRadius: 12, padding: 14 }}>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && <div style={{ fontSize: 12.5, color: '#5C5C74' }}>{file.name} ({Math.round(file.size / 1024)} KB)</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              <div style={fieldLabel}>Name (optional — defaults to filename)</div>
              <input value={name} onChange={(e) => setName(e.target.value)} style={inp} />
            </label>
            <label>
              <div style={fieldLabel}>Category</div>
              <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory | '')} style={inp}>
                <option value="">Auto-detect</option>
                {DOCUMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.th}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={fieldLabel}>Description</div>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this document is about" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={fieldLabel}>Attach to company (optional)</div>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inp}>
                <option value="">— none —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </label>
            <div style={{ gridColumn: 'span 2' }}>
              <div style={fieldLabel}>Service lines</div>
              <ServiceChipPicker selected={serviceLines} onChange={setServiceLines} available={availableServices} disabled={isCentral} />
              <div style={{ marginTop: 6, fontSize: 11, color: '#8888A0' }}>Sales reps see only documents in their assigned services. Leave empty to keep it un-tagged (only visible to admins/managers).</div>
            </div>
            {canMarkCentral && (
              <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#3B3B52' }}>
                <input type="checkbox" checked={isCentral} onChange={(e) => setIsCentral(e.target.checked)} />
                Mark as <b>central</b> — company-wide document (e.g. company registration, policy). Everyone sees it regardless of service scope.
              </label>
            )}
            <label style={{ gridColumn: 'span 2' }}>
              <div style={fieldLabel}>Version 1 note (optional)</div>
              <input value={versionNotes} onChange={(e) => setVersionNotes(e.target.value)} placeholder="e.g. Signed original" style={inp} />
            </label>
          </div>
          <div style={{ fontSize: 11.5, color: '#5C5C74', background: '#F7F8FC', borderRadius: 8, padding: '8px 12px' }}>
            PDFs are auto-parsed. Extracted fields (dates, amounts, contact, tax ID, quotation/contract no.) appear in the detail pane.
          </div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
          <button type="button" disabled={!file || busy} onClick={submit} style={{ ...btnPrimary, opacity: !file || busy ? 0.5 : 1 }}>{busy ? 'Uploading…' : 'Upload'}</button>
        </div>
      </div>
    </div>
  )
}

function ServiceChipPicker({ selected, onChange, available, disabled }: { selected: ServiceLine[]; onChange: (v: ServiceLine[]) => void; available: ServiceLine[]; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, opacity: disabled ? 0.5 : 1 }}>
      {SERVICE_LINES.map((s) => {
        const on = selected.includes(s)
        const st = SERVICE_STYLE[s]
        const canPick = available.includes(s)
        return (
          <div key={s} onClick={() => !disabled && canPick && onChange(on ? selected.filter((x) => x !== s) : [...selected, s])} title={!canPick ? 'You are not assigned to this service — cannot select' : undefined} style={{
            cursor: disabled || !canPick ? 'not-allowed' : 'pointer',
            border: `1px solid ${on ? st.fg : '#E5E7F0'}`,
            background: on ? st.bg : '#fff',
            color: on ? st.fg : (canPick ? '#5C5C74' : '#BBBBCB'),
            borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700,
          }}>{on && <span style={{ marginRight: 4 }}>✓</span>}{s}</div>
        )
      })}
    </div>
  )
}

const grid: CSSProperties = { display: 'grid', gridTemplateColumns: '2fr 110px 1.1fr 130px 50px 80px 90px 100px', gap: 10 }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const outlineBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', color: '#3B3B52', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
const miniBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, fontSize: 11.5, fontWeight: 600, padding: '4px 10px', cursor: 'pointer', color: '#3B3B52', textDecoration: 'none', display: 'inline-block' }
const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', maxWidth: 520, borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const fieldLabel: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#5C5C74', marginBottom: 6 }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
