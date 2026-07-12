import { useEffect, useState, type CSSProperties, type ChangeEvent } from 'react'
import type { CustomerDto, DocumentCategory, DocumentDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

const CATEGORIES: DocumentCategory[] = ['tor', 'contract', 'quotation', 'invoice', 'boq', 'brochure', 'other']

const CAT_STYLE: Record<string, { bg: string; fg: string }> = {
  tor: { bg: '#F4F1FD', fg: '#4A3AB8' },
  contract: { bg: '#E4EDFC', fg: '#2A6FDB' },
  quotation: { bg: '#E7EDF9', fg: '#1F5AC2' },
  invoice: { bg: '#E5F8ED', fg: '#0E6E4E' },
  boq: { bg: '#F7EBD9', fg: '#B4650A' },
  brochure: { bg: '#FCE9F2', fg: '#D6337A' },
  other: { bg: '#F2F3F9', fg: '#5C5C74' },
}

export default function Documents() {
  const [documents, setDocuments] = useState<DocumentDto[]>([])
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selected, setSelected] = useState<DocumentDto | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('')
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('customer:write')

  const reload = async () => {
    setLoading(true)
    try {
      const [docs, cs] = await Promise.all([
        api.documents(filterCategory ? { category: filterCategory } : {}),
        customers.length ? Promise.resolve(customers) : api.customers(),
      ])
      setDocuments(docs)
      if (!customers.length) setCustomers(cs)
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterCategory])

  const del = async (d: DocumentDto) => {
    if (!window.confirm(`Delete "${d.name}"? All versions are removed.`)) return
    try { await api.deleteDocument(d.id); toast('Deleted'); reload() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Delete failed') }
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px', animation: 'fadeUp .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 600 }}>Documents</div>
        <div style={{ background: '#F2F3F9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#5C5C74', padding: '4px 10px' }}>{documents.length} files</div>
        <div style={{ flex: 1 }} />
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ border: '1px solid #E5E7F0', background: '#fff', borderRadius: 9, padding: '8px 12px', fontSize: 12.5 }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {canWrite && <div onClick={() => setUploadOpen(true)} style={primaryBtn}>+ Upload document</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1.5fr 1fr' : '1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ ...grid, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8888A0' }}>
            <div>Name</div><div>Category</div><div>Customer</div><div>v</div><div>Size</div><div>Uploaded</div><div />
          </div>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
          {!loading && documents.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No documents yet.</div>}
          {documents.map((d) => {
            const cat = CAT_STYLE[d.category] ?? CAT_STYLE.other
            const cv = d.currentVersion
            return (
              <div key={d.id} onClick={() => setSelected(d)} style={{ ...grid, padding: '12px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', cursor: 'pointer', background: selected?.id === d.id ? '#F7F8FC' : 'transparent' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" style={{ flex: 'none' }}><path d="M6.5 3h8l4 4v14h-12z M14 3v5h4.5" fill="none" stroke="#5C5C74" strokeWidth={1.7} strokeLinejoin="round" /></svg>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                    {cv?.extraction?.status === 'ready' && cv.extraction.classification !== 'other' && (
                      <span style={{ fontSize: 10, color: '#4A3AB8', background: '#F4F1FD', borderRadius: 5, padding: '1px 6px', marginTop: 2, display: 'inline-block' }}>✦ OCR extracted</span>
                    )}
                  </div>
                </div>
                <div><span style={{ background: cat.bg, color: cat.fg, borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', textTransform: 'uppercase' }}>{d.category}</span></div>
                <div style={{ fontSize: 12, color: '#5C5C74', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.customerName ?? '—'}</div>
                <div style={{ fontSize: 12, color: '#5C5C74' }}>v{cv?.versionNo ?? '—'}</div>
                <div style={{ fontSize: 12, color: '#5C5C74' }}>{cv ? Math.max(1, Math.round(cv.sizeBytes / 1024)) + ' KB' : '—'}</div>
                <div style={{ fontSize: 12, color: '#5C5C74' }}>{cv ? new Date(cv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</div>
                <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                  {cv && <a href={api.documentDownloadUrl(cv.id)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={miniBtn}>Download</a>}
                  {canWrite && <div onClick={(e) => { e.stopPropagation(); del(d) }} style={{ ...miniBtn, color: '#C0392B' }}>×</div>}
                </div>
              </div>
            )
          })}
        </div>

        {selected && <DocumentDetailPanel document={selected} onClose={() => setSelected(null)} customers={customers} canWrite={canWrite} onReload={reload} />}
      </div>

      {uploadOpen && <UploadModal customers={customers} onClose={() => setUploadOpen(false)} onDone={() => { setUploadOpen(false); reload() }} />}
    </div>
  )
}

function DocumentDetailPanel({ document, onClose, customers, canWrite, onReload }: { document: DocumentDto; onClose: () => void; customers: CustomerDto[]; canWrite: boolean; onReload: () => void }) {
  const toast = useToast()
  const cv = document.currentVersion
  const extraction = cv?.extraction
  const customer = customers.find((c) => c.id === document.customerId)

  const uploadNewVersion = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try { await api.uploadDocumentVersion(document.id, file); toast('New version uploaded'); onReload() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Upload failed') }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, position: 'sticky', top: 0 }}>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid #F2F3F9', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{document.name}</div>
        <div onClick={onClose} style={{ cursor: 'pointer', color: '#8888A0', fontSize: 18 }}>×</div>
      </div>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
        <div><b style={{ color: '#8888A0' }}>Category:</b> {document.category}</div>
        {customer && <div><b style={{ color: '#8888A0' }}>Customer:</b> {customer.name}</div>}
        <div><b style={{ color: '#8888A0' }}>Uploaded by:</b> {document.uploadedByName}</div>
        <div><b style={{ color: '#8888A0' }}>Versions:</b> {document.versions.length}</div>
        {cv && <div><b style={{ color: '#8888A0' }}>Current file:</b> {cv.filename} ({Math.max(1, Math.round(cv.sizeBytes / 1024))} KB)</div>}
        {cv && <a href={api.documentDownloadUrl(cv.id)} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, textAlign: 'center', textDecoration: 'none', display: 'inline-block' }}>Download current version</a>}
        {canWrite && (
          <label style={{ ...outlineBtn, textAlign: 'center', cursor: 'pointer', display: 'inline-block' }}>
            Upload new version
            <input type="file" onChange={uploadNewVersion} style={{ display: 'none' }} />
          </label>
        )}

        {extraction && extraction.status === 'ready' && (
          <>
            <div style={{ marginTop: 10, borderTop: '1px solid #F2F3F9', paddingTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase', marginBottom: 8 }}>AI extraction</div>
              {extraction.classification && extraction.classification !== 'other' && (
                <div style={{ marginBottom: 6 }}><b style={{ color: '#8888A0' }}>Classification:</b> {extraction.classification}</div>
              )}
              {extraction.fields && Object.keys(extraction.fields).length > 0 ? (
                <div style={{ background: '#F4F1FD', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(extraction.fields).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                      <span style={{ color: '#4A3AB8', fontWeight: 700, minWidth: 100, textTransform: 'capitalize' }}>{k}</span>
                      <span>{String(v)}</span>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontSize: 12, color: '#8888A0' }}>No fields auto-detected.</div>}
              {extraction.extractedText && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ fontSize: 12, color: '#5C5C74', cursor: 'pointer' }}>Show extracted text (first 800 chars)</summary>
                  <pre style={{ fontSize: 11, color: '#3B3B52', background: '#F7F8FC', borderRadius: 8, padding: 10, marginTop: 6, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{extraction.extractedText.slice(0, 800)}</pre>
                </details>
              )}
            </div>
          </>
        )}
        {extraction && extraction.status === 'error' && (
          <div style={{ background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>Extraction failed</div>
        )}
      </div>
    </div>
  )
}

function UploadModal({ customers, onClose, onDone }: { customers: CustomerDto[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [category, setCategory] = useState<DocumentCategory | ''>('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!file) return
    setBusy(true)
    try {
      await api.uploadDocument(file, {
        customerId: customerId || undefined,
        category: category || undefined,
      })
      toast('Document uploaded — OCR ready')
      onDone()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Upload failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, flex: 1 }}>Upload document</div>
          <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0' }}>×</div>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1.5px dashed #D0D0DF', borderRadius: 12, padding: 14 }}>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && <div style={{ fontSize: 12.5, color: '#5C5C74' }}>{file.name} ({Math.round(file.size / 1024)} KB)</div>}
          </div>
          <label>
            <div style={fieldLabel}>Attach to customer (optional)</div>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inp}>
              <option value="">— none —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          <label>
            <div style={fieldLabel}>Category (auto-detected if blank)</div>
            <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory | '')} style={inp}>
              <option value="">Auto-detect</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
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

const grid: CSSProperties = { display: 'grid', gridTemplateColumns: '2fr 130px 1.3fr 60px 100px 100px 140px', gap: 10 }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const outlineBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', color: '#3B3B52', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
const miniBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, fontSize: 11.5, fontWeight: 600, padding: '5px 11px', cursor: 'pointer', color: '#3B3B52', textDecoration: 'none' }
const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', maxWidth: 520, borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const fieldLabel: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#5C5C74', marginBottom: 6 }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
