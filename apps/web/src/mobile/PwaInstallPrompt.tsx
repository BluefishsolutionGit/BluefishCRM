/**
 * Small, dismissable install banner shown on mobile.
 *
 * Two paths, one component:
 *  - Chrome/Android → captures `beforeinstallprompt`, triggers `prompt()` on
 *    tap.
 *  - iOS Safari → BIP never fires; show a short "Share → Add to Home Screen"
 *    tip instead.
 *
 * Nothing renders when the app is already running standalone. Dismissals are
 * remembered in localStorage so the banner doesn't nag on every session.
 */

import { useEffect, useState, type CSSProperties } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'bluefish.pwaInstallDismissedAt'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // hide for a week after dismiss

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari uses navigator.standalone; other browsers use the media query.
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
}

function isRecentlyDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY)
  if (!raw) return false
  const t = Number(raw)
  if (!Number.isFinite(t)) return false
  return Date.now() - t < DISMISS_TTL_MS
}

export default function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosTip, setShowIosTip] = useState(false)
  const [dismissed, setDismissed] = useState(() => isRecentlyDismissed() || isStandalone())

  useEffect(() => {
    if (dismissed) return
    const onBIP = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBIP)

    // iOS detection — no BIP fires there
    const ua = navigator.userAgent
    const iOS = /iP(hone|ad|od)/.test(ua) && !/(CriOS|FxiOS|EdgiOS)/.test(ua)
    if (iOS && !isStandalone()) setShowIosTip(true)

    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [dismissed])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true); setDeferred(null); setShowIosTip(false)
  }

  const install = async () => {
    if (!deferred) return
    try {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') dismiss()
      setDeferred(null)
    } catch { /* user cancelled or SW not ready */ }
  }

  if (dismissed) return null
  if (!deferred && !showIosTip) return null

  return (
    <div style={banner}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>Install Bluefish CRM</div>
        <div style={{ fontSize: 11, color: '#CDBFF9', marginTop: 2 }}>
          {deferred
            ? 'Faster launch, works offline, push-ready.'
            : "iOS: tap the Share icon, then 'Add to Home Screen'."}
        </div>
      </div>
      {deferred && <div onClick={install} style={installBtn}>Install</div>}
      <div onClick={dismiss} style={dismissBtn} aria-label="Dismiss">✕</div>
    </div>
  )
}

const banner: CSSProperties = {
  margin: '10px 12px 0', padding: '10px 12px',
  background: '#2E1A6B', color: '#fff', borderRadius: 12,
  display: 'flex', alignItems: 'center', gap: 10,
  boxShadow: '0 4px 12px rgba(46,26,107,.24)',
}
const installBtn: CSSProperties = {
  background: '#fff', color: '#2E1A6B', fontSize: 12, fontWeight: 800,
  padding: '6px 12px', borderRadius: 999, cursor: 'pointer', flex: 'none',
}
const dismissBtn: CSSProperties = {
  color: '#CDBFF9', fontSize: 14, padding: '4px 6px', cursor: 'pointer', flex: 'none',
}
