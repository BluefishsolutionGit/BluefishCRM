/**
 * Full-screen document viewer. Renders images inline, PDFs in an iframe, and
 * everything else as a fallback card with a download link.
 *
 * Works on both desktop and the /m mobile shell — same component, same overlay.
 */

import { useEffect, type CSSProperties } from 'react'
import { api } from '../lib/api'

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
const link: CSSProperties = { color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', padding: '6px 10px', border: '1px solid rgba(255,255,255,.35)', borderRadius: 8 }

export default function DocumentViewer({ version, title, onClose }: DocumentViewerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const url = api.documentDownloadUrl(version.id)
  const mime = version.mimeType || ''
  const isImage = mime.startsWith('image/')
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(version.filename)
  const isText = mime.startsWith('text/') || /\.(txt|md|log|json|csv)$/i.test(version.filename)

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
        <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={link}>Open ↗</a>
      </div>

      <div style={stage} onClick={(e) => e.stopPropagation()}>
        {isImage ? (
          <img
            src={url}
            alt={version.filename}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}
          />
        ) : isPdf ? (
          <iframe title={version.filename} src={url} style={{ width: '100%', height: '100%', border: 'none' }} />
        ) : isText ? (
          <iframe title={version.filename} src={url} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
            <div style={{ fontSize: 42 }}>📄</div>
            <div style={{ fontSize: 14, fontWeight: 700, textAlign: 'center' }}>Preview not supported</div>
            <div style={{ fontSize: 12, color: '#5C5C74', textAlign: 'center' }}>{mime || 'unknown mime'} · {formatBytes(version.sizeBytes)}</div>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ background: '#2A6FDB', color: '#fff', padding: '10px 16px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
              Download
            </a>
          </div>
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
