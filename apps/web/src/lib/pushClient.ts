/**
 * Web-push client helper.
 *
 *  - `getPushStatus()` returns 'granted' | 'denied' | 'default' | 'unsupported'
 *  - `subscribePush()` asks permission, subscribes via SW, and POSTs the
 *    endpoint + keys to the API.
 *  - `unsubscribePush()` reverses it.
 *
 * All work is idempotent — calling subscribe twice from the same device is
 * safe (server upserts the row by endpoint).
 */

import { api } from './api'

const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

export type PushStatus = 'granted' | 'denied' | 'default' | 'unsupported'

export function getPushStatus(): PushStatus {
  if (!supported) return 'unsupported'
  return Notification.permission as PushStatus
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const b64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Ask permission (if needed) and register the current device with the server. */
export async function subscribePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!supported) return { ok: false, reason: 'This browser does not support push notifications.' }

  // Permission
  let perm: NotificationPermission = Notification.permission
  if (perm === 'default') {
    perm = await Notification.requestPermission()
  }
  if (perm !== 'granted') return { ok: false, reason: 'Notification permission was not granted.' }

  // VAPID key
  const { publicKey } = await api.pushPublicKey().catch(() => ({ publicKey: null }))
  if (!publicKey) return { ok: false, reason: 'Server VAPID key not configured.' }

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // Cast: TS 5+ requires the Uint8Array's buffer to be ArrayBuffer (not
    // ArrayBufferLike). Ours always is — runtime cost zero.
    applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
  })

  const raw = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
    return { ok: false, reason: 'Browser did not return a complete subscription.' }
  }
  try {
    await api.pushSubscribe({
      endpoint: raw.endpoint,
      keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
      userAgent: navigator.userAgent,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Failed to save subscription.' }
  }
}

export async function unsubscribePush(): Promise<void> {
  if (!supported) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  try { await sub.unsubscribe() } catch { /* ignore */ }
  try { await api.pushUnsubscribe(endpoint) } catch { /* ignore — server has its own cleanup */ }
}

/** For UI: does the browser currently hold a subscription for this device? */
export async function isPushSubscribed(): Promise<boolean> {
  if (!supported) return false
  try {
    const reg = await navigator.serviceWorker.ready
    return !!(await reg.pushManager.getSubscription())
  } catch { return false }
}
