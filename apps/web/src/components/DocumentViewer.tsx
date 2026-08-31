/**
 * Full-screen document viewer. Renders images inline, PDFs in an iframe, and
 * everything else as a fallback card with a download link.
 *
 * We fetch the file via authenticated `documentVersionBlob` and expose it to
 * the <iframe>/<img> as a same-origin `blob:` URL. Reasons:
 *   1. Helmet's default X-Frame-Options: SAMEORIGIN blocks the API origin
 *      (localhost:4000) from being framed inside the web app (localhost:5173).
 *   2. The download endpoint requires a Bearer JWT which cannot be attached to
 *      a raw <iframe src> or <img src>.
 *   3. The endpoint sets Content-Disposition: attachment — with a blob URL we
 *      override that and render inline.
 *
 * Works on both desktop and the /m mobile shell — same component, same overlay.
 */

import { useEffect, useState, type CSSProperties } from 'react'
import { api, ApiError } from '../lib/api'

export interface ViewableVersion {
  id: string
  filename: string
  mimeType: string
  sizeBytes?: number
  createdAt?: string
  uploadedByName?: string
  notes?: string | null
}

export interface DocumentViewerProps {
  version: ViewableVersion
  title?: string
  onClose: () => void
}

const formatBytes = (b?: number) => b == null ? '' : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`

const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,18,30,.88)',
  zIndex: 400, display: 'flex', flexDirection: 'column',
}
const bar: CSSProperties = {
  padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff',
}
const stage: CSSProperties = {
  flex: 1, minHeight: 0, margin: '0 12px 12px', background: '#fff',
  borderRadius: 12, overflow: 'hidden', position: 'relative',
}
const link: CSSProperties = { color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', padding: '6px 10px', border: '1px solid rgba(255,255,255,.35)', borderRadius: 8, cursor: 'pointer' }

export default function DocumentViewer({ version, title, onClose }: DocumentViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let revoked = false
    let created: string | null = null
    setBlobUrl(null); setError(null)
    api.documentVersionBlob(version.id)
      .then((blob) => {
        if (revoked) return
        // The download endpoint sends Content-Disposition: attachment. Wrapping
        // the blob with an explicit MIME lets the browser render inline.
        const typed = version.mimeType && blob.type !== version.mimeType ? blob.slice(0, blob.size, version.mimeType) : blob
        created = URL.createObjectURL(typed)
        setBlobUrl(created)
      })
      .catch((e) => { if (!revoked) setError(e instanceof ApiError ? e.message : 'Failed to load file') })
    return () => {
      revoked = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [version.id, version.mimeType])

  const mime = version.mimeType || ''
  const isImage = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(version.filename)
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(version.filename)
  const isText = mime.startsWith('text/') || /\.(txt|md|log|json|csv)$/i.test(version.filename)
  const openInNewTab = () => { if (blobUrl) window.open(blobUrl, '_blank', 'noopener') }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={bar} onClick={(e) => e.stopPropagation()}>
        <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700, padding: '4px 8px' }} title="Close">✕</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title ?? version.filename}</div>
          <div style={{ fontSize: 10.5, color: '#CFCFDD' }}>
            {version.filename}
            {version.sizeBytes ? ` · ${formatBytes(version.sizeBytes)}` : ''}
            {version.uploadedByName ? ` · ${version.uploadedByName}` : ''}
            {version.createdAt ? ` · ${new Date(version.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}` : ''}
          </div>
        </div>
        <div onClick={openInNewTab} style={{ ...link, opacity: blobUrl ? 1 : 0.4 }}>Open ↗</div>
      </div>

      <div style={stage} onClick={(e) => e.stopPropagation()}>
        {error ? (
          <FallbackCard title="Couldn't load" subtitle={error} mime={mime} size={version.sizeBytes} />
        ) : !blobUrl ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>
        ) : isImage ? (
          <img
            src={blobUrl}
            alt={version.filename}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}
          />
        ) : isPdf ? (
          <iframe title={version.filename} src={blobUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
        ) : isText ? (
          <iframe title={version.filename} src={blobUrl} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
        ) : (
          <FallbackCard title="Preview not supported" mime={mime} size={version.sizeBytes} blobUrl={blobUrl} filename={version.filename} />
        )}

        {/* Optional caption from version notes */}
        {version.notes && (
          <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, background: 'rgba(15,18,30,.75)', color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 11.5 }}>
            {version.notes}
          </div>
        )}
      </div>
    </div>
  )
}

function FallbackCard({ title, subtitle, mime, size, blobUrl, filename }: {
  title: string; subtitle?: string; mime: string; size?: number
  blobUrl?: string; filename?: string
}) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <div style={{ fontSize: 42 }}>📄</div>
      <div style={{ fontSize: 14, fontWeight: 700, textAlign: 'center' }}>{title}</div>
      <div style={{ fontSize: 12, color: '#5C5C74', textAlign: 'center' }}>{subtitle ?? `${mime || 'unknown mime'} · ${formatBytes(size)}`}</div>
      {blobUrl && filename && (
        <a href={blobUrl} download={filename} style={{ background: '#2A6FDB', color: '#fff', padding: '10px 16px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
          Download
        </a>
      )}
    </div>
  )
}
