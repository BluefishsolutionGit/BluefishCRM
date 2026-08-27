import { useCallback, type CSSProperties } from 'react'
import { useVoiceInput } from '../lib/useVoiceInput'
import { useToast } from '../lib/ToastContext'

interface Props {
  /** Current textarea/input value; the transcript will be appended to it. */
  value: string
  onChange: (next: string) => void
  lang?: string                 // BCP-47 default 'th-TH'
  label?: string                // Aria label; also shown in tooltip
  size?: 'sm' | 'md'
  style?: CSSProperties
  disabled?: boolean
}

/**
 * Small mic button meant to sit next to a textarea or notes input.
 * Click once to start listening; click again to stop. Interim text is toasted
 * as a live indicator, and the final transcript is appended to `value` on stop.
 */
export default function VoiceInputButton({ value, onChange, lang = 'th-TH', label = 'Dictate', size = 'md', style, disabled }: Props) {
  const toast = useToast()

  const handleFinal = useCallback((full: string) => {
    if (!full.trim()) return
    // Preserve any text the user was already typing — append with a space separator.
    const next = value.trim().length > 0 ? `${value.trimEnd()} ${full}` : full
    onChange(next)
  }, [value, onChange])

  const handleError = useCallback((msg: string) => toast(msg), [toast])

  const { supported, recording, interim, toggle } = useVoiceInput({ lang, onFinal: handleFinal, onError: handleError })

  if (!supported) return null       // Hide silently on Firefox rather than showing a dead button.

  const dim = size === 'sm' ? 26 : 32
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={recording ? (interim ? `Listening: ${interim}` : 'Listening… click to stop') : label}
      aria-label={label}
      aria-pressed={recording}
      style={{
        width: dim, height: dim, borderRadius: '50%',
        border: `1.5px solid ${recording ? '#C0392B' : '#D0D0DF'}`,
        background: recording ? '#FDECEA' : '#fff',
        color: recording ? '#C0392B' : '#5C5C74',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size === 'sm' ? 13 : 15, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        flex: 'none',
        boxShadow: recording ? '0 0 0 4px rgba(192,57,43,.12)' : 'none',
        transition: 'box-shadow .15s, background .15s, border-color .15s',
        ...style,
      }}
    >
      {recording ? <PulsingDot /> : <MicIcon />}
    </button>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path fill="currentColor" d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3zm7 9a1 1 0 0 0-2 0 5 5 0 1 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.08A7 7 0 0 0 19 12z" />
    </svg>
  )
}

function PulsingDot() {
  return (
    <span
      style={{
        width: 10, height: 10, borderRadius: '50%',
        background: '#C0392B',
        boxShadow: '0 0 0 0 rgba(192,57,43,.6)',
        animation: 'voice-pulse 1.2s infinite',
      }}
    >
      <style>{`
        @keyframes voice-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(192,57,43,.55); }
          70%  { box-shadow: 0 0 0 8px rgba(192,57,43,0); }
          100% { box-shadow: 0 0 0 0 rgba(192,57,43,0); }
        }
      `}</style>
    </span>
  )
}
