import { useState, type CSSProperties, type ChangeEvent } from 'react'
import type { ImportResultDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import ImportResultSection from './ImportResultSection'

interface Props { open: boolean; onClose: () => void; onImported: () => void }

export default function ImportCustomersModal({ open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResultDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [templateBusy, setTemplateBusy] = useState(false)

  if (!open) return null

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setFile(f ?? null)
    setResult(null); setError(null)
  }

  const downloadTemplate = async () => {
    setTemplateBusy(true); setError(null)
    try {
      await api.downloadCustomersTemplate()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Download failed')
    } finally { setTemplateBusy(false) }
  }

  const submit = async () => {
    if (!file) return
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await api.importCustomers(file)
      setResult(r)
      if (r.imported > 0 || (r.contactsImported ?? 0) > 0) onImported()
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
            Upload an .xlsx file with these columns (<b>*</b> = required): Code *, Name *, Name (TH), Industry *, Status, Owner Email *, City *, Address *, Tax ID *, Phone *, Terms, Open Value.
            <br />
            The template also includes an optional <b>contacts</b> sheet — one row per contact, linked back by Customer Code, so a
            customer can have any number of contacts (or none). Leave it blank to skip.
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            disabled={templateBusy}
            style={{ display: 'inline-block', background: 'none', border: 'none', padding: 0, cursor: templateBusy ? 'default' : 'pointer', fontSize: 12.5, fontWeight: 700, color: '#2A6FDB', marginBottom: 16, opacity: templateBusy ? 0.6 : 1 }}
          >
            {templateBusy ? 'Downloading…' : '↓ Download template'}
          </button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1.5px dashed #D0D0DF', borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <input type="file" accept=".xlsx,.xls" onChange={pickFile} />
            {file && <div style={{ fontSize: 12.5, color: '#5C5C74' }}>{file.name} ({Math.round(file.size / 1024)} KB)</div>}
          </div>

          {error && <div style={{ background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{error}</div>}

          {result && (() => {
            // The API tags contacts-sheet errors with a "[Contacts]" prefix; split on it so each
            // sheet gets its own summary and error list.
            const contactErrors = result.errors
              .filter((e) => e.message.startsWith(CONTACTS_PREFIX))
              .map((e) => ({ ...e, message: e.message.slice(CONTACTS_PREFIX.length).trim() }))
            const customerErrors = result.errors.filter((e) => !e.message.startsWith(CONTACTS_PREFIX))
            const hasContacts = (result.contactsImported ?? 0) > 0 || (result.contactsSkipped ?? 0) > 0 || contactErrors.length > 0
            return (
              <>
                <ImportResultSection title="Customers" sheet="customers" imported={result.imported} skipped={result.skipped} errors={customerErrors} />
                {hasContacts && (
                  <ImportResultSection title="Contacts" sheet="contacts" imported={result.contactsImported ?? 0} skipped={result.contactsSkipped ?? 0} errors={contactErrors} />
                )}
              </>
            )
          })()}
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

const CONTACTS_PREFIX = '[Contacts]'

const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', maxWidth: 640, borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
