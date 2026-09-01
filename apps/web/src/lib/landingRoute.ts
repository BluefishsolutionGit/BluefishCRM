/**
 * Which route a user should land on right after auth (login, SSO, MFA,
 * biometric). Picks between the desktop home (`/dashboard`) and the mobile
 * home (`/m`) using both viewport width AND primary input type so a phone
 * gets `/m` immediately — no brief `/dashboard`→`/m` flash from a
 * viewport-only check kicking in one render later.
 *
 * Buckets:
 *   - PHONE  : touch-primary + width < 768   → /m
 *   - TABLET : touch-primary + width >= 768  → /dashboard (responsive desktop)
 *   - DESKTOP: mouse-primary                  → /dashboard
 *
 * Matches the breakpoints in useResponsiveRedirect (PHONE_BREAKPOINT=768).
 *
 * Caller can override with `?next=<path>` — used by biometric login for
 * deep-link return.
 */

const PHONE_WIDTH_CEILING = 768

export function preferredLandingRoute(fallback: string = '/dashboard'): string {
  if (typeof window === 'undefined') return fallback

  const width = window.innerWidth
  const touchPrimary = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches

  // Phone (touch + narrow) → /m. Tablets in portrait can still hit ~768,
  // so we require touch AND < 768. Small windows on desktop stay `/dashboard`.
  if (touchPrimary && width < PHONE_WIDTH_CEILING) return '/m'

  return fallback
}
