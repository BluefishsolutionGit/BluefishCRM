import { useState, type CSSProperties, type ChangeEvent } from 'react'
import type { ImportResultDto } from '@bluefish/shared'
import { api, ApiError, API_BASE } from '../lib/api'

interface Props { open: boolean; onClose: () => void; onImported: () => void }

export default function ImportCustomersModal({ open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResultDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setFile(f ?? null)
    setResult(null); setError(null)
  }

  const submit = async () => {
    if (!file) return
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await api.importCustomers(file)
      setResult(r)
      if (r.imported > 0) onImported()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Import failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, flex: 1 }}>Import customers from Excel</div>
          <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0', padding: 4 }}>×</div>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <div style={{ fontSize: 13, color: '#5C5C74', marginBottom: 14 }}>
            Upload an .xlsx file with these columns: Code, Name, Name (TH), Industry, Status, Owner Email, City, Address, Tax ID, Phone, Terms, Open Value.
          </div>
          <a href={`${API_BASE}/customers/import-template`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: '#2A6FDB', marginBottom: 16 }}>
            ↓ Download template
          </a>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1.5px dashed #D0D0DF', borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <input type="file" accept=".xlsx,.xls" onChange={pickFile} />
            {file && <div style={{ fontSize: 12.5, color: '#5C5C74' }}>{file.name} ({Math.round(file.size / 1024)} KB)</div>}
          </div>

          {error && <div style={{ background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{error}</div>}

          {result && (
            <div style={{ background: '#F7F8FC', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 12 }}>
              <div><b>Imported:</b> {result.imported} · <b>Skipped:</b> {result.skipped}</div>
              {result.errors.length > 0 && (
                <div style={{ marginTop: 10, maxHeight: 180, overflow: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: '#8888A0' }}>
                        <th style={{ textAlign: 'left', padding: 4 }}>Row</th>
                        <th style={{ textAlign: 'left', padding: 4 }}>Field</th>
                        <th style={{ textAlign: 'left', padding: 4 }}>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #E5E7F0' }}>
                          <td style={{ padding: 4 }}>{e.row}</td>
                          <td style={{ padding: 4 }}>{e.field ?? '—'}</td>
                          <td style={{ padding: 4, color: '#C0392B' }}>{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnGhost}>Close</button>
          <button type="button" disabled={!file || busy} onClick={submit} style={{ ...btnPrimary, opacity: !file || busy ? 0.5 : 1 }}>
            {busy ? 'Importing…' : 'Upload & import'}
          </button>
        </div>
      </div>
    </div>
  )
}

const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', maxWidth: 640, borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
