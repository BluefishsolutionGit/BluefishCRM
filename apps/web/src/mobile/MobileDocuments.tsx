/**
 * Mobile Documents — list + detail with camera-friendly upload.
 *
 * Field use case: field engineer / sales rep needs to snap a photo of a
 * signed doc / delivery slip / invoice at the customer site and attach it
 * to a contract or customer.
 *
 * Notes on camera:
 *  - <input type="file" accept="image/*,application/pdf" capture="environment">
 *    On iOS/Android this opens the rear camera first when the user chooses
 *    "Camera", otherwise the file picker.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DOCUMENT_CATEGORIES, SERVICE_LINES, type DocumentCategory, type DocumentDto, type ServiceLine } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { Sheet } from './MobileDetails'
import DocumentViewer, { type ViewableVersion } from '../components/DocumentViewer'

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
const QUICK_CATS: DocumentCategory[] = ['contract', 'amendment', 'invoice', 'receipt', 'certificate', 'other']

const backBtn: CSSProperties = { fontSize: 14, color: '#2A6FDB', cursor: 'pointer' }
const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '14px 16px' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const outlineBtn: CSSProperties = { background: '#fff', color: '#3B3B52', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const sectionLabel: CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', color: '#8888A0', textTransform: 'uppercase', margin: '4px 0 6px' }
const inp: CSSProperties = { width: '100%', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }
const formatBytes = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`

// ═══════════════════════════════════════════════════════════════════════
// List
// ═══════════════════════════════════════════════════════════════════════
export default function MobileDocuments() {
  const [rows, setRows] = useState<DocumentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState<DocumentCategory | 'all'>('all')
  const [centralOnly, setCentralOnly] = useState(false)
  const [uploadOpen, setUploadOpen] = useState<false | 'default' | 'central'>(false)
  const [viewing, setViewing] = useState<ViewableVersion | null>(null)
  const navigate = useNavigate()
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('customer:write')
  const canMarkCentral = hasPermission('service:view_all')

  const reload = () => {
    setLoading(true)
    return api.documents({ q: q.trim() || undefined })
      .then((r) => { setRows(r); setLoading(false) })
      .catch((e) => { toast(e instanceof ApiError ? e.message : 'Failed'); setLoading(false) })
  }
  useEffect(() => { const h = setTimeout(() => void reload(), 250); return () => clearTimeout(h) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [q])
  useEffect(() => { void reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const central = useMemo(() => rows.filter((d) => d.isCentral), [rows])
  const filtered = useMemo(() => rows.filter((d) => {
    if (centralOnly && !d.isCentral) return false
    if (catFilter !== 'all' && d.category !== catFilter) return false
    return true
  }), [rows, catFilter, centralOnly])

  return (
    <div style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 19, fontWeight: 700 }}>Documents</div>
        <div style={{ fontSize: 12, color: '#5C5C74' }}>{rows.length}</div>
      </div>

      {/* Pinned: Company Documents card — always visible, cues to shared docs. */}
      <div
        onClick={() => setCentralOnly((v) => !v)}
        style={{
          background: centralOnly
            ? 'linear-gradient(135deg, #EAE7F7, #F4F1FD)'
            : 'linear-gradient(135deg, #F4F1FD, #FBFAFE)',
          border: `1px solid ${centralOnly ? '#B7A8ED' : '#EAE7F7'}`,
          borderRadius: 13, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
        }}
      >
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#4A3AB8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M4 20V8l8-5 8 5v12M9 20v-6h6v6M9 10h.01M13 10h.01M13 14h.01M9 14h.01"
                  fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2E1A6B' }}>Company Documents</div>
          <div style={{ fontSize: 11, color: '#5B3FC4', marginTop: 2 }}>Registration · policies · shared assets</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#4A3AB8' }}>{central.length}</div>
        {canWrite && canMarkCentral && (
          <div
            onClick={(e) => { e.stopPropagation(); setUploadOpen('central') }}
            title="Upload company document"
            style={{ width: 26, height: 26, borderRadius: 7, background: '#4A3AB8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontSize: 16 }}
          >+</div>
        )}
      </div>

      <input
        placeholder="Search documents…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ ...inp, padding: '10px 12px' }}
      />

      {/* Category filter chips */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginRight: -16, paddingRight: 16 }}>
        <div onClick={() => setCatFilter('all')} style={chip(catFilter === 'all', '#3B3B52')}>All</div>
        {QUICK_CATS.map((c) => (
          <div key={c} onClick={() => setCatFilter(c === catFilter ? 'all' : c)} style={chip(catFilter === c, CAT_STYLE[c].fg)}>{DOCUMENT_CATEGORIES.find((x) => x.id === c)?.label ?? c}</div>
        ))}
      </div>

      {loading && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {!loading && filtered.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No documents.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((d) => (
          <DocRow
            key={d.id}
            doc={d}
            onOpen={() => navigate(`/m/documents/${d.id}`)}
            onQuickView={d.currentVersion ? () => setViewing({
              id: d.currentVersion!.id, filename: d.currentVersion!.filename,
              mimeType: d.currentVersion!.mimeType, sizeBytes: d.currentVersion!.sizeBytes,
              createdAt: d.currentVersion!.createdAt, uploadedByName: d.currentVersion!.uploadedByName,
              notes: d.currentVersion!.notes,
            }) : undefined}
          />
        ))}
      </div>

      {viewing && <DocumentViewer version={viewing} onClose={() => setViewing(null)} />}

      {canWrite && (
        <div
          onClick={() => setUploadOpen('default')}
          style={{
            position: 'fixed', bottom: 86, right: 'calc(50% - 240px + 20px)',
            width: 54, height: 54, borderRadius: '50%',
            background: '#2A6FDB', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(42,111,219,.4)',
            cursor: 'pointer', zIndex: 10,
          }}
          aria-label="Upload document"
        >
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M23 19V7l-7-4-3 2-3-2-7 4v12l7-4 3 2 3-2 7 4z M12 22V4"
                  fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {uploadOpen && (
        <UploadSheet
          defaultCentral={uploadOpen === 'central'}
          canMarkCentral={canMarkCentral}
          onClose={() => setUploadOpen(false)}
          onDone={() => { setUploadOpen(false); void reload() }}
        />
      )}
    </div>
  )
}

function DocRow({ doc, onOpen, onQuickView }: { doc: DocumentDto; onOpen: () => void; onQuickView?: () => void }) {
  const cat = CAT_STYLE[doc.category] ?? CAT_STYLE.other
  const cv = doc.currentVersion
  return (
    <div onClick={onOpen} style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '11px 13px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ background: cat.bg, color: cat.fg, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, textTransform: 'uppercase' }}>{doc.category}</span>
        {doc.isCentral && <span style={{ background: '#F4F1FD', color: '#4A3AB8', fontSize: 9.5, fontWeight: 800, padding: '2px 6px', borderRadius: 999, textTransform: 'uppercase' }}>central</span>}
        {doc.kind === 'link' && <span style={{ background: '#EEF0FA', color: '#4A3AB8', fontSize: 9.5, fontWeight: 800, padding: '2px 6px', borderRadius: 999, textTransform: 'uppercase' }}>link</span>}
        <div style={{ flex: 1 }} />
        {cv && <div style={{ fontSize: 10.5, color: '#8888A0' }}>v{cv.versionNo} · {formatBytes(cv.sizeBytes)}</div>}
        {onQuickView && cv && doc.kind === 'file' && (
          <div onClick={(e) => { e.stopPropagation(); onQuickView() }} title="Quick view" style={{ marginLeft: 4, width: 24, height: 24, borderRadius: 6, border: '1px solid #E5E7F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#2A6FDB' }}>👁</div>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
      <div style={{ fontSize: 11, color: '#5C5C74', marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span>{doc.customerName ?? '—'}</span>
        <span style={{ flex: 1 }} />
        <span>{cv ? new Date(cv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}</span>
      </div>
      {(doc.serviceLines ?? []).length > 0 && (
        <div style={{ display: 'flex', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
          {doc.serviceLines.map((s) => <span key={s} style={{ background: '#EEF0FA', color: '#2A6FDB', fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 5 }}>{s}</span>)}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Detail
// ═══════════════════════════════════════════════════════════════════════
export function MobileDocumentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('customer:write')
  const [d, setD] = useState<DocumentDto | null>(null)
  const [viewing, setViewing] = useState<ViewableVersion | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const reload = useCallback(async () => {
    if (!id) return
    try { setD(await api.document(id)) }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
  }, [id, toast])
  useEffect(() => { void reload() }, [reload])

  const onFilePicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !d) return
    const notes = window.prompt('Version note (what changed)?') ?? undefined
    try { await api.uploadDocumentVersion(d.id, file, { notes }); toast('Uploaded'); void reload() }
    catch (err) { toast(err instanceof ApiError ? err.message : 'Failed') }
  }

  const remove = async () => {
    if (!d) return
    if (!window.confirm(`Delete "${d.name}"? All versions are removed.`)) return
    try { await api.deleteDocument(d.id); toast('Deleted'); navigate(-1) }
    catch (err) { toast(err instanceof ApiError ? err.message : 'Failed') }
  }

  if (!d) return <div style={{ padding: 16, color: '#8888A0' }}>Loading…</div>

  const cat = CAT_STYLE[d.category] ?? CAT_STYLE.other
  const cv = d.currentVersion

  return (
    <div style={{ padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'sticky', top: 0, background: '#F4F6F1', paddingBottom: 8, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <div onClick={() => navigate(-1)} style={backBtn}>‹ Back</div>
          <div style={{ flex: 1 }} />
          {canWrite && <div onClick={remove} style={{ ...backBtn, color: '#C0392B', fontSize: 12 }}>Delete</div>}
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ background: cat.bg, color: cat.fg, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, textTransform: 'uppercase' }}>{d.category}</span>
          {d.isCentral && <span style={{ background: '#F4F1FD', color: '#4A3AB8', fontSize: 9.5, fontWeight: 800, padding: '2px 6px', borderRadius: 999, textTransform: 'uppercase' }}>central</span>}
          {d.kind === 'link' && <span style={{ background: '#EEF0FA', color: '#4A3AB8', fontSize: 9.5, fontWeight: 800, padding: '2px 6px', borderRadius: 999, textTransform: 'uppercase' }}>link</span>}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 8 }}>{d.name}</div>
        {d.description && <div style={{ fontSize: 12.5, color: '#3B3B52', marginTop: 6, background: '#F7F8FC', borderRadius: 8, padding: '8px 10px' }}>{d.description}</div>}
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
          {d.customerName && <div><div style={{ color: '#8888A0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em' }}>Company</div><div style={{ marginTop: 2 }}>{d.customerName}</div></div>}
          <div><div style={{ color: '#8888A0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em' }}>Uploaded by</div><div style={{ marginTop: 2 }}>{d.uploadedByName}</div></div>
        </div>
        {(d.serviceLines ?? []).length > 0 && (
          <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
            {d.serviceLines.map((s) => <span key={s} style={{ background: '#EEF0FA', color: '#2A6FDB', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{s}</span>)}
          </div>
        )}
      </div>

      {cv && (
        <div style={card}>
          <div style={sectionLabel}>Current version</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ background: '#EEF0FA', color: '#2A6FDB', fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 6 }}>v{cv.versionNo}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cv.filename}</div>
              <div style={{ fontSize: 10.5, color: '#8888A0' }}>{formatBytes(cv.sizeBytes)} · {new Date(cv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</div>
            </div>
          </div>
          {cv.notes && <div style={{ marginTop: 8, fontSize: 11.5, color: '#5C5C74', background: '#F7F8FC', borderRadius: 8, padding: '6px 10px' }}>{cv.notes}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <div onClick={() => setViewing({ id: cv.id, filename: cv.filename, mimeType: cv.mimeType, sizeBytes: cv.sizeBytes, createdAt: cv.createdAt, uploadedByName: cv.uploadedByName, notes: cv.notes })} style={{ ...primaryBtn, flex: 1, textAlign: 'center' }}>👁 View</div>
            <a href={api.documentDownloadUrl(cv.id)} target="_blank" rel="noopener noreferrer" style={{ ...outlineBtn, flex: 1, textAlign: 'center', textDecoration: 'none' }}>↓ Download</a>
          </div>
        </div>
      )}

      {canWrite && d.kind === 'file' && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={onFilePicked}
            style={{ display: 'none' }}
          />
          <div onClick={() => fileRef.current?.click()} style={{ ...outlineBtn, textAlign: 'center' }}>
            📷 / 📄 Upload new version
          </div>
        </>
      )}

      {d.versions.length > 1 && (
        <div style={card}>
          <div style={sectionLabel}>Version history ({d.versions.length})</div>
          {d.versions.map((v) => (
            <div
              key={v.id}
              onClick={() => setViewing({ id: v.id, filename: v.filename, mimeType: cv?.mimeType ?? 'application/octet-stream', sizeBytes: v.sizeBytes, createdAt: v.createdAt, uploadedByName: v.uploadedByName, notes: v.notes })}
              style={{ padding: '7px 0', borderTop: '1px solid #F1F1F5', display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}
            >
              <span style={{ background: v.id === cv?.id ? '#0E9C7E' : '#F2F3F9', color: v.id === cv?.id ? '#fff' : '#5C5C74', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5 }}>v{v.versionNo}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.filename}</div>
                <div style={{ fontSize: 10.5, color: '#8888A0' }}>{new Date(v.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })} · {v.uploadedByName} · {formatBytes(v.sizeBytes)}</div>
                {v.notes && <div style={{ marginTop: 3, fontSize: 11, color: '#5C5C74' }}>{v.notes}</div>}
              </div>
              <a href={api.documentDownloadUrl(v.id)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, color: '#2A6FDB', textDecoration: 'none', flex: 'none' }}>↓</a>
            </div>
          ))}
        </div>
      )}

      {viewing && <DocumentViewer version={viewing} title={d.name} onClose={() => setViewing(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Upload sheet (camera-friendly)
// ═══════════════════════════════════════════════════════════════════════
function UploadSheet({ defaultCentral, canMarkCentral, onClose, onDone }: {
  defaultCentral?: boolean; canMarkCentral: boolean; onClose: () => void; onDone: () => void
}) {
  const toast = useToast()
  const { user, hasPermission } = useAuth()
  const canSeeAll = hasPermission('service:view_all')
  const availableServices = (canSeeAll ? SERVICE_LINES : (user?.services ?? [])) as ServiceLine[]

  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<DocumentCategory>('other')
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([])
  const [isCentral, setIsCentral] = useState(!!(defaultCentral && canMarkCentral))
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)

  const submit = async () => {
    if (!file) return
    setBusy(true)
    try {
      await api.uploadDocument(file, {
        name: name.trim() || undefined,
        category,
        serviceLines: serviceLines.length ? serviceLines : undefined,
        isCentral: isCentral || undefined,
      })
      toast('Uploaded')
      onDone()
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed') }
    finally { setBusy(false) }
  }

  return (
    <Sheet onClose={onClose} title="Upload document">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Source pickers */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ display: 'none' }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <div onClick={() => cameraRef.current?.click()} style={{ ...primaryBtn, flex: 1, textAlign: 'center' }}>📷 Take photo</div>
          <div onClick={() => fileRef.current?.click()} style={{ ...outlineBtn, flex: 1, textAlign: 'center' }}>📄 Choose file</div>
        </div>

        {file && (
          <div style={{ background: '#F7F8FC', borderRadius: 10, padding: '10px 12px', fontSize: 12.5 }}>
            <b>{file.name}</b> ({Math.round(file.size / 1024)} KB)
          </div>
        )}

        <input placeholder="Name (optional — defaults to filename)" value={name} onChange={(e) => setName(e.target.value)} style={inp} />

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5C5C74', marginBottom: 5 }}>Category</div>
          <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)} style={inp}>
            {DOCUMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.th}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5C5C74', marginBottom: 5 }}>Service lines</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SERVICE_LINES.map((s) => {
              const on = serviceLines.includes(s)
              const canPick = availableServices.includes(s)
              return (
                <div
                  key={s}
                  onClick={() => canPick && !isCentral && setServiceLines(on ? serviceLines.filter((x) => x !== s) : [...serviceLines, s])}
                  style={{
                    cursor: canPick && !isCentral ? 'pointer' : 'not-allowed',
                    border: `1px solid ${on ? '#2A6FDB' : '#E5E7F0'}`,
                    background: on ? '#EEF0FA' : '#fff',
                    color: on ? '#2A6FDB' : (canPick ? '#5C5C74' : '#BBBBCB'),
                    borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700,
                    opacity: isCentral ? 0.4 : 1,
                  }}
                >{s}</div>
              )
            })}
          </div>
        </div>

        {canMarkCentral && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#3B3B52' }}>
            <input type="checkbox" checked={isCentral} onChange={(e) => setIsCentral(e.target.checked)} />
            Mark as <b>central</b> — visible to everyone
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button type="button" onClick={onClose} style={{ ...outlineBtn, flex: 1 }}>Cancel</button>
          <button type="button" onClick={submit} disabled={!file || busy} style={{ ...primaryBtn, flex: 1, opacity: !file || busy ? 0.5 : 1 }}>{busy ? 'Uploading…' : 'Upload'}</button>
        </div>
      </div>
    </Sheet>
  )
}

const chip = (on: boolean, color: string): CSSProperties => ({
  cursor: 'pointer', flex: 'none',
  border: `1px solid ${on ? color : '#E5E7F0'}`,
  background: on ? color + '15' : '#fff',
  color: on ? color : '#5C5C74',
  borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700,
})
