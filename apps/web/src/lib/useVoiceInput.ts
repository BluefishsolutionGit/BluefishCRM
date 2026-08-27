import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Wraps the browser Web Speech API into a hook usable from both mobile and desktop.
 *
 * - Auto-stops after `maxMs` (default 20 s) so a forgotten hot mic can't drain the tab.
 * - Streams both interim + final transcript segments so the caller can render live text.
 * - On explicit stop() or auto-timeout, fires `onFinal(fullTranscript)` and clears state.
 *
 * Works on: Chromium desktop/mobile, Safari 14.5+ / iOS Safari, Edge.
 * Does NOT work on: Firefox, older iOS. Callers should hide the button when `supported === false`.
 */

interface UseVoiceInputOptions {
  lang?: string           // BCP-47 e.g. 'th-TH' or 'en-US'
  maxMs?: number
  onFinal?: (transcript: string) => void
  onError?: (message: string) => void
}

interface UseVoiceInputReturn {
  supported: boolean
  recording: boolean
  interim: string           // live interim segment (shown while user is speaking)
  transcript: string        // final segments accumulated during the session
  start: () => void
  stop: () => void
  toggle: () => void
}

function getCtor(): typeof SpeechRecognition | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: typeof SpeechRecognition
    webkitSpeechRecognition?: typeof SpeechRecognition
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useVoiceInput({ lang = 'th-TH', maxMs = 20_000, onFinal, onError }: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const Ctor = getCtor()
  const supported = Ctor !== null

  const [recording, setRecording] = useState(false)
  const [interim, setInterim] = useState('')
  const [transcript, setTranscript] = useState('')

  const recRef = useRef<SpeechRecognition | null>(null)
  const timerRef = useRef<number | null>(null)
  const finalRef = useRef('')            // Accumulator survives React re-renders during a session.
  const onFinalRef = useRef(onFinal)
  const onErrorRef = useRef(onError)

  // Keep the latest callback refs without forcing new SpeechRecognition instances.
  useEffect(() => { onFinalRef.current = onFinal }, [onFinal])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    recRef.current = null
  }, [])

  const stop = useCallback(() => {
    const rec = recRef.current
    if (!rec) return
    try { rec.stop() } catch { /* already stopped */ }
  }, [])

  const start = useCallback(() => {
    if (!Ctor) {
      onErrorRef.current?.('Voice-to-text not supported on this browser')
      return
    }
    if (recRef.current) return           // Already running — noop.
    finalRef.current = ''
    setInterim('')
    setTranscript('')

    const rec: SpeechRecognition = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true            // Stream partials so we can render live.
    rec.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          finalRef.current += (finalRef.current ? ' ' : '') + chunk
        } else {
          live += chunk
        }
      }
      setInterim(live)
      setTranscript(finalRef.current)
    }
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      const msg = e.error === 'not-allowed'
        ? 'Microphone permission denied'
        : e.error === 'no-speech'
        ? 'No speech detected — try again'
        : `Voice error: ${e.error}`
      onErrorRef.current?.(msg)
    }
    rec.onend = () => {
      setRecording(false)
      setInterim('')
      const full = finalRef.current.trim()
      cleanup()
      if (full) onFinalRef.current?.(full)
    }

    recRef.current = rec
    try {
      rec.start()
      setRecording(true)
      timerRef.current = window.setTimeout(() => stop(), maxMs)
    } catch (err) {
      onErrorRef.current?.(err instanceof Error ? err.message : 'Failed to start voice')
      cleanup()
      setRecording(false)
    }
  }, [Ctor, lang, maxMs, stop, cleanup])

  const toggle = useCallback(() => {
    if (recording) stop()
    else start()
  }, [recording, start, stop])

  // Best-effort cleanup on unmount so the mic releases even if the caller unmounts mid-record.
  useEffect(() => () => {
    const rec = recRef.current
    if (rec) { try { rec.stop() } catch { /* noop */ } }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  return { supported, recording, interim, transcript, start, stop, toggle }
}

export function isVoiceSupported(): boolean {
  return getCtor() !== null
}
