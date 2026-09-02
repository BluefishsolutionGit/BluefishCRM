/**
 * Two-side business card capture — Front is required, Back is optional.
 *
 * Why the sheet not just a bare `<input capture>`:
 *   - The old flow (direct `input.click()`) worked for one photo only and
 *     tapped the OS camera; on iOS Safari that's a modal you can't reopen
 *     to add a second side.
 *   - Cards often carry the Thai company registration + extra phones on
 *     the back; a rep who only shoots the front loses that data.
 *   - A dedicated sheet gives the user a clear front/back tray, a
 *     retake affordance, and a single Scan button that submits both.
 *
 * Camera trigger uses `<input type="file" accept="image/*" capture="environment">` —
 * safest cross-browser choice; on iOS/Android it opens the rear camera app.
 * We avoid `getUserMedia` because that pulls in an in-app viewfinder plus
 * permissions ask, worse UX for a field rep.
 */

import { useRef, useState, type ChangeEvent, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import { Sheet } from './MobileDetails'

interface Props {
  onCancel: () => void
  onSubmit: (front: File, back: File | null) => void
  submitting: boolean
}

export default function ScanCardCaptureSheet({ onCancel, onSubmit, submitting }: Props) {
  const [front, setFront] = useState<File | null>(null)
  const [back, setBack] = useState<File | null>(null)
  const [frontUrl, setFrontUrl] = useState<string | null>(null)
  const [backUrl, setBackUrl] = useState<string | null>(null)
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
    if (!front || submitting) return
    onSubmit(front, back)
  }

  return (
    <Sheet onClose={onCancel} title="Scan business card">
      <div style={{ fontSize: 12.5, color: '#5C5C74', marginBottom: 14, lineHeight: 1.5 }}>
        Front is required. Add the back too if the card has info there —
        the AI will merge both sides.
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

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        <button
          type="button"
          onClick={submit}
          disabled={!front || submitting}
          style={{ ...primaryBtn, opacity: !front || submitting ? 0.5 : 1, flex: 1 }}
        >
          {submitting ? 'Scanning…' : back ? 'Scan both sides' : 'Scan front only'}
        </button>
      </div>
    </Sheet>
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
