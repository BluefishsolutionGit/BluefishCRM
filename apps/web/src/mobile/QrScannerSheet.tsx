/**
 * QR / barcode scanner using the browser BarcodeDetector API.
 *
 * Support (as of ~2026):
 *  - Chromium desktop + Android → native, fast
 *  - Safari iOS 17+          → native
 *  - Firefox                 → no BarcodeDetector; component shows a friendly
 *                              fallback tip and closes.
 *
 * The scanner opens the rear camera, runs a 4-fps detection loop on the video
 * frame, and calls `onResult` with the first decoded value.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react'

type BarcodeFormat =
  | 'qr_code' | 'code_128' | 'code_39' | 'ean_13' | 'ean_8'
  | 'itf' | 'upc_a' | 'upc_e' | 'data_matrix' | 'pdf417' | 'aztec'

interface DetectedBarcode { rawValue: string; format: BarcodeFormat }
interface BarcodeDetectorCtor {
  new (init?: { formats?: BarcodeFormat[] }): { detect(image: CanvasImageSource): Promise<DetectedBarcode[]> }
  getSupportedFormats?(): Promise<string[]>
}

const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window

export default function QrScannerSheet({ onResult, onClose, label = 'Scan QR / barcode' }: {
  onResult: (value: string, format: string) => void
  onClose: () => void
  label?: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supported) { setError('This browser does not support in-app barcode scanning. Use Chrome on Android or Safari 17+.'); return }
    let stream: MediaStream | null = null
    let raf = 0
    let cancelled = false
    const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector
    const detector = new Detector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix'] })

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        const v = videoRef.current!
        v.srcObject = stream
        await v.play()
        setReady(true)
        tick()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Camera unavailable')
      }
    }

    let last = 0
    const tick = async () => {
      const v = videoRef.current
      if (!v || cancelled) return
      const now = performance.now()
      if (now - last > 250) {                    // ~4 fps is plenty for QR
        last = now
        try {
          const codes = await detector.detect(v)
          if (codes.length > 0) {
            const c = codes[0]
            cancelled = true
            stream?.getTracks().forEach((t) => t.stop())
            onResult(c.rawValue, c.format)
            return
          }
        } catch { /* swallow — image not ready etc */ }
      }
      raf = requestAnimationFrame(tick)
    }
    void start()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onResult])

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={header} onClick={(e) => e.stopPropagation()}>
        <div onClick={onClose} style={{ color: '#fff', fontSize: 15, padding: '4px 8px', cursor: 'pointer' }}>✕</div>
        <div style={{ flex: 1, textAlign: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>{label}</div>
        <div style={{ width: 30 }} />
      </div>
      <div style={stage} onClick={(e) => e.stopPropagation()}>
        {error ? (
          <div style={{ padding: 24, color: '#fff', textAlign: 'center' }}>
            <div style={{ fontSize: 42 }}>📷</div>
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700 }}>Scanner unavailable</div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#CDBFF9' }}>{error}</div>
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={reticle} />
            {!ready && <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 12 }}>Starting camera…</div>}
          </>
        )}
      </div>
      <div style={{ padding: '10px 16px', color: '#CDBFF9', fontSize: 11, textAlign: 'center' }}>
        Aim at the QR / barcode. Auto-closes when it detects a code.
      </div>
    </div>
  )
}

const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: '#0F121E', zIndex: 500, display: 'flex', flexDirection: 'column' }
const header: CSSProperties = { padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }
const stage: CSSProperties = { flex: 1, minHeight: 0, position: 'relative', background: '#000', margin: '0 12px', borderRadius: 12, overflow: 'hidden' }
const reticle: CSSProperties = {
  position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
  width: 220, height: 220, border: '3px solid rgba(255,255,255,.85)', borderRadius: 22,
  boxShadow: '0 0 0 9999px rgba(15,18,30,.55)',
}
