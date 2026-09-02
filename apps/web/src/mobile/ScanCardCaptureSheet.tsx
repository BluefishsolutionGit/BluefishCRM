/**
 * Business card capture — three modes:
 *
 *   1. Photo (front + optional back)
 *      Uses the OS camera via <input capture=environment>. Vision AI
 *      or Tesseract on the server extracts fields.
 *
 *   2. Paste text
 *      For users who already OCR'd the card with Google Lens, iOS Live
 *      Text, Samsung Bixby, etc. — they copy the text and paste it here.
 *      Server runs the regex-based field extractor only (no vision AI),
 *      giving Google-grade OCR quality on Thai cards for free.
 *
 * The mode tabs sit at the top of the sheet; only the active mode's UI
 * shows below. Submit button is context-aware.
 */

import { useRef, useState, type ChangeEvent, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import { Sheet } from './MobileDetails'

type Mode = 'photo' | 'text'

interface Props {
  onCancel: () => void
  onSubmitPhoto: (front: File, back: File | null) => void
  onSubmitText: (text: string) => void
  submitting: boolean
}

export default function ScanCardCaptureSheet({ onCancel, onSubmitPhoto, onSubmitText, submitting }: Props) {
  const [mode, setMode] = useState<Mode>('photo')
  const [front, setFront] = useState<File | null>(null)
  const [back, setBack] = useState<File | null>(null)
  const [frontUrl, setFrontUrl] = useState<string | null>(null)
  const [backUrl, setBackUrl] = useState<string | null>(null)
  const [text, setText] = useState('')
  const frontInputRef = useRef<HTMLInputElement | null>(null)
  const backInputRef = useRef<HTMLInputElement | null>(null)

  const pick = (setFile: Dispatch<SetStateAction<File | null>>, setUrl: Dispatch<SetStateAction<string | null>>) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] ?? null
      e.target.value = ''
      setFile(f)
      setUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null })
    }

  const submit = () => {
    if (submitting) return
    if (mode === 'photo') {
      if (!front) return
      onSubmitPhoto(front, back)
    } else {
      const t = text.trim()
      if (t.length < 3) return
      onSubmitText(t)
    }
  }

  const submitLabel = mode === 'photo'
    ? (submitting ? 'Scanning…' : back ? 'Scan both sides' : 'Scan front only')
    : (submitting ? 'Parsing…' : 'Parse text')

  const canSubmit = mode === 'photo' ? !!front : text.trim().length >= 3

  return (
    <Sheet onClose={onCancel} title="Scan business card">
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: '#F1F1F7', borderRadius: 10, padding: 4 }}>
        <ModeTab active={mode === 'photo'} onClick={() => setMode('photo')} icon="📷" label="Photo" />
        <ModeTab active={mode === 'text'}  onClick={() => setMode('text')}  icon="📋" label="Paste text" />
      </div>

      {mode === 'photo' ? (
        <>
          <div style={{ fontSize: 12.5, color: '#5C5C74', marginBottom: 14, lineHeight: 1.5 }}>
            Front is required. Add the back too if the card has info there — the AI will merge both sides.
          </div>

          <input ref={frontInputRef} type="file" accept="image/*" capture="environment"
            onChange={pick(setFront, setFrontUrl)} style={{ display: 'none' }} />
          <input ref={backInputRef} type="file" accept="image/*" capture="environment"
            onChange={pick(setBack, setBackUrl)} style={{ display: 'none' }} />

          <Slot
            label="Front"
            required
            previewUrl={frontUrl}
            onCapture={() => frontInputRef.current?.click()}
            onClear={() => { setFront(null); if (frontUrl) URL.revokeObjectURL(frontUrl); setFrontUrl(null) }}
          />

          <Slot
            label="Back"
            hint="Optional — capture only if the card has content on both sides"
            previewUrl={backUrl}
            disabled={!front}
            onCapture={() => backInputRef.current?.click()}
            onClear={() => { setBack(null); if (backUrl) URL.revokeObjectURL(backUrl); setBackUrl(null) }}
          />
        </>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: '#5C5C74', marginBottom: 12, lineHeight: 1.5 }}>
            Open Google Lens (or your phone's Live Text) on the card,
            select the text, copy it, then paste below. Fields will be
            extracted automatically — no image upload needed.
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Somchai Chareonkul\nHead of IT Operations\nSiam Solutions Co., Ltd.\n...`}
            rows={9}
            style={{
              width: '100%', boxSizing: 'border-box',
              border: '1.5px solid #D0D0DF', borderRadius: 10,
              padding: 12, fontSize: 13.5, fontFamily: 'inherit',
              outline: 'none', resize: 'vertical', lineHeight: 1.5,
              marginBottom: 8,
            }}
          />
          {text.trim().length > 0 && (
            <div style={{ fontSize: 11, color: '#8888A0', marginBottom: 4 }}>
              {text.trim().split(/\s+/).length} words · {text.split('\n').filter(Boolean).length} lines
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || submitting}
          style={{ ...primaryBtn, opacity: !canSubmit || submitting ? 0.5 : 1, flex: 1 }}
        >
          {submitLabel}
        </button>
      </div>
    </Sheet>
  )
}

function ModeTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 12px', borderRadius: 8,
        border: 'none', cursor: 'pointer',
        background: active ? '#fff' : 'transparent',
        color: active ? '#2A6FDB' : '#5C5C74',
        fontWeight: active ? 800 : 600,
        fontSize: 12.5,
        boxShadow: active ? '0 2px 6px rgba(14,31,25,.08)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}
    >
      <span>{icon}</span>{label}
    </button>
  )
}

function Slot({ label, hint, required, previewUrl, disabled, onCapture, onClear }: {
  label: string
  hint?: string
  required?: boolean
  previewUrl: string | null
  disabled?: boolean
  onCapture: () => void
  onClear: () => void
}) {
  return (
    <div style={{
      border: `1.5px dashed ${previewUrl ? '#2A6FDB' : '#D0D0DF'}`,
      borderRadius: 12, padding: 12, marginBottom: 12,
      background: previewUrl ? '#EEF0FA' : disabled ? '#F7F8FC' : '#fff',
      opacity: disabled ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: previewUrl ? 10 : 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>
          {label} {required && <span style={{ color: '#C0392B' }}>*</span>}
          {previewUrl && <span style={{ marginLeft: 6, color: '#2A6FDB', fontSize: 11 }}>✓ Captured</span>}
        </div>
        {previewUrl && (
          <button type="button" onClick={onClear} style={miniBtn} title="Remove">✕</button>
        )}
      </div>
      {hint && !previewUrl && <div style={{ fontSize: 10.5, color: '#8888A0', marginBottom: 8 }}>{hint}</div>}
      {previewUrl ? (
        <img src={previewUrl} alt={label} style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 8, background: '#fff' }} />
      ) : (
        <button
          type="button"
          onClick={onCapture}
          disabled={disabled}
          style={{
            width: '100%', padding: '18px 12px', borderRadius: 10,
            border: '1px solid #E5E7F0', background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 13.5, fontWeight: 700, color: disabled ? '#B4B4C4' : '#2A6FDB',
          }}
        >
          <span style={{ fontSize: 20 }}>📷</span>
          {previewUrl ? 'Retake' : `Capture ${label.toLowerCase()}`}
        </button>
      )}
    </div>
  )
}

const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }
const ghostBtn: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 10, padding: '12px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }
const miniBtn: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 6, width: 26, height: 26, fontSize: 12, color: '#5C5C74', cursor: 'pointer' }
