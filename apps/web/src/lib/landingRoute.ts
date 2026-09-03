/**
 * Which route a user should land on right after auth (login, SSO, MFA,
 * biometric). Picks between the desktop home (`/dashboard`) and the mobile
 * home (`/m`) using three signals so the classifier is more forgiving:
 *
 *   1. `navigator.userAgent`             — is the UA a phone-class browser?
 *   2. `matchMedia('(pointer: coarse)')` — is the primary input touch?
 *   3. `window.innerWidth`               — is the viewport narrow?
 *
 * A device is treated as a phone if signal #1 (UA) says so, OR if #2+#3
 * both agree (touch + narrow viewport). Signal #1 catches phones in
 * landscape (>= 768px wide) that would otherwise fall through to the
 * desktop bucket. Signal #2+#3 covers DevTools mobile emulation where the
 * UA is still the desktop browser but pointer flips to coarse.
 *
 * Buckets:
 *   - PHONE  : signal #1 hits OR (touch + width < 768)  → /m
 *   - TABLET : big touchscreen without phone UA          → /dashboard
 *   - DESKTOP: mouse-primary                             → /dashboard
 *
 * Caller can override with `?next=<path>` — used by biometric login for
 * deep-link return.
 */

export const PHONE_WIDTH_CEILING = 768

/**
 * Heuristic UA match for phone-class browsers. iPad reports "iPad" or
 * (on iPadOS 13+) "Macintosh" with touch — we deliberately do NOT match
 * those so tablets still get the desktop layout, which reads fine at
 * 1024+ and uses the tap targets iPadOS renders large by default.
 */
export function isPhoneUserAgent(ua: string): boolean {
  return /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|IEMobile|Opera Mini/i.test(ua)
}

export function isPhoneLikeEnvironment(): boolean {
  if (typeof window === 'undefined') return false
  if (isPhoneUserAgent(navigator.userAgent ?? '')) return true
  const touchPrimary = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
  return touchPrimary && window.innerWidth < PHONE_WIDTH_CEILING
}

export function preferredLandingRoute(fallback: string = '/dashboard'): string {
  if (typeof window === 'undefined') return fallback
  return isPhoneLikeEnvironment() ? '/m' : fallback
}
