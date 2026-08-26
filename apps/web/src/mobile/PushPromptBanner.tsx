/**
 * Small prompt shown once per session (unless dismissed) asking the user to
 * enable push notifications. Lives inside MobileShell.
 *
 * Rules:
 *  - Hidden if browser doesn't support push
 *  - Hidden if already subscribed (device holds a subscription)
 *  - Hidden if permission is denied — user has to reset that in browser settings
 *  - Auto-hides for a week after dismiss
 */

import { useEffect, useState, type CSSProperties } from 'react'
import { getPushStatus, isPushSubscribed, subscribePush } from '../lib/pushClient'

const DISMISS_KEY = 'bluefish.pushPromptDismissedAt'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

export default function PushPromptBanner({ onToast }: { onToast?: (m: string) => void }) {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const status = getPushStatus()
      if (status === 'unsupported' || status === 'denied') return
      // Snoozed?
      const raw = localStorage.getItem(DISMISS_KEY)
      if (raw && Date.now() - Number(raw) < DISMISS_TTL_MS) return
      const already = status === 'granted' && await isPushSubscribed()
      if (!cancelled && !already) setVisible(true)
    })()
    return () => { cancelled = true }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  const enable = async () => {
    setBusy(true)
    const res = await subscribePush()
    setBusy(false)
    if (res.ok) { onToast?.('Push notifications enabled'); setVisible(false) }
    else onToast?.(res.reason)
  }

  if (!visible) return null

  return (
    <div style={banner}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>Turn on push notifications</div>
        <div style={{ fontSize: 11, color: '#CDBFF9', marginTop: 2 }}>Get pinged for approvals, overdue tasks and new chats.</div>
      </div>
      <div onClick={enable} style={{ ...primaryPill, opacity: busy ? 0.6 : 1 }}>{busy ? '…' : 'Enable'}</div>
      <div onClick={dismiss} style={dismissBtn}>✕</div>
    </div>
  )
}

const banner: CSSProperties = {
  margin: '10px 12px 0', padding: '10px 12px',
  background: '#4A3AB8', color: '#fff', borderRadius: 12,
  display: 'flex', alignItems: 'center', gap: 10,
  boxShadow: '0 4px 12px rgba(74,58,184,.24)',
}
const primaryPill: CSSProperties = {
  background: '#fff', color: '#4A3AB8', fontSize: 12, fontWeight: 800,
  padding: '6px 12px', borderRadius: 999, cursor: 'pointer', flex: 'none',
}
const dismissBtn: CSSProperties = {
  color: '#CDBFF9', fontSize: 14, padding: '4px 6px', cursor: 'pointer', flex: 'none',
}
