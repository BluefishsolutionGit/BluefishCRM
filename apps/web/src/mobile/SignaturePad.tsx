/**
 * Reusable signature pad — canvas with pointer events (touch + mouse + pen).
 *
 * Exposes a bottom sheet with:
 *  - Canvas that fills the sheet horizontally
 *  - Clear + Save buttons
 *  - Passes a PNG File (data URL blob) via `onSigned`
 */

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Sheet } from './MobileDetails'

const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const outlineBtn: CSSProperties = { background: '#fff', color: '#3B3B52', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

export default function SignaturePad({ title = 'Signature required', onClose, onSigned }: {
  title?: string
  onClose: () => void
  onSigned: (file: File, dataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const drawing = useRef(false)
  const lastPt = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  // Match backing store to CSS size × DPR so lines stay crisp
  useEffect(() => {
    const c = canvasRef.current, w = wrapRef.current
    if (!c || !w) return
    const resize = () => {
      const rect = w.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      c.width  = rect.width * dpr
      c.height = 200 * dpr
      c.style.width  = rect.width + 'px'
      c.style.height = '200px'
      const ctx = c.getContext('2d')!
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#1E1E30'
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, rect.width, 200)
      setEmpty(true)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(w)
    return () => ro.disconnect()
  }, [])

  const relPoint = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    lastPt.current = relPoint(e)
  }
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const pt = relPoint(e)
    const ctx = canvasRef.current!.getContext('2d')!
    if (lastPt.current) {
      ctx.beginPath()
      ctx.moveTo(lastPt.current.x, lastPt.current.y)
      ctx.lineTo(pt.x, pt.y)
      ctx.stroke()
    }
    lastPt.current = pt
    if (empty) setEmpty(false)
  }
  const onUp = () => { drawing.current = false; lastPt.current = null }

  const clear = () => {
    const c = canvasRef.current!
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    setEmpty(true)
  }

  const save = async () => {
    const c = canvasRef.current!
    const blob: Blob = await new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/png'))
    const file = new File([blob], `signature-${Date.now()}.png`, { type: 'image/png' })
    const dataUrl = c.toDataURL('image/png')
    onSigned(file, dataUrl)
  }

  return (
    <Sheet onClose={onClose} title={title}>
      <div style={{ fontSize: 11.5, color: '#5C5C74', marginBottom: 8 }}>Sign below with your finger or stylus.</div>
      <div ref={wrapRef} style={{ background: '#fff', border: '1.5px dashed #B7A8ED', borderRadius: 10, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
        />
        {empty && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#BBBBCB', fontSize: 12.5, pointerEvents: 'none' }}>× your signature here</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" onClick={clear} disabled={empty} style={{ ...outlineBtn, flex: 1, opacity: empty ? 0.5 : 1 }}>Clear</button>
        <button type="button" onClick={onClose} style={{ ...outlineBtn, flex: 1 }}>Cancel</button>
        <button type="button" onClick={save} disabled={empty} style={{ ...primaryBtn, flex: 1, opacity: empty ? 0.5 : 1 }}>Save signature</button>
      </div>
    </Sheet>
  )
}
