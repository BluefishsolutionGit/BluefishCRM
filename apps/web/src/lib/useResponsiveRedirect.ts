/**
 * Viewport-based route redirection between the desktop shell and the /m
 * mobile shell.
 *
 * Rules on every navigation:
 *   - Viewport `<  768` (phone) + on a desktop route with a mobile twin
 *     → replace with the mobile route (query + hash preserved).
 *   - Viewport `>= 1024` (desktop) + on a /m route with a desktop twin
 *     → replace with the desktop route.
 *   - Tablet range (768–1023): no forced switch — whichever layout the
 *     user landed on stays. Reads well on both.
 *
 * Runs only on `location` change, not on resize — bouncing a user out of
 * their current view because they resized the window would be jarring.
 * A dev who wants to preview the mobile shell on a wide screen can just
 * use DevTools mobile emulation; that changes `innerWidth` before the
 * next route change and behaves exactly like a real phone.
 *
 * Auth routes (/login, /forgot-password, /reset-password) are always
 * left alone — those templates handle their own responsive layout.
 */

import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

type PathMapper = [RegExp, (match: RegExpMatchArray) => string]

// Desktop → mobile. Routes not listed here (Settings, Products, MasterData,
// AuditLog) don't have a mobile counterpart — they stay put and rely on
// device-level pinch-zoom.
const DESKTOP_TO_MOBILE: PathMapper[] = [
  [/^\/dashboard\/?$/,               () => '/m'],
  [/^\/customers(\/.*)?$/,           (m) => `/m/customers${m[1] ?? ''}`],
  [/^\/leads(\/.*)?$/,               (m) => `/m/leads${m[1] ?? ''}`],
  [/^\/pipeline(\/.*)?$/,            (m) => `/m/opportunities${m[1] ?? ''}`],
  [/^\/activities(\/.*)?$/,          (m) => `/m/tasks${m[1] ?? ''}`],
  [/^\/quotations(\/.*)?$/,          (m) => `/m/quotations${m[1] ?? ''}`],
  [/^\/contracts(\/.*)?$/,           (m) => `/m/contracts${m[1] ?? ''}`],
  [/^\/documents(\/.*)?$/,           (m) => `/m/documents${m[1] ?? ''}`],
  [/^\/inbox(\/.*)?$/,               (m) => `/m/inbox${m[1] ?? ''}`],
  [/^\/reports\/?$/,                 () => '/m/reports'],
  [/^\/ai\/?$/,                      () => '/m/ai'],
]

// Mobile → desktop. Mirror of the above; /m/nearby and /m/more have no
// desktop equivalent so they stay.
const MOBILE_TO_DESKTOP: PathMapper[] = [
  [/^\/m\/?$/,                       () => '/dashboard'],
  [/^\/m\/customers(\/.*)?$/,        (m) => `/customers${m[1] ?? ''}`],
  [/^\/m\/leads(\/.*)?$/,            (m) => `/leads${m[1] ?? ''}`],
  [/^\/m\/opportunities(\/.*)?$/,    (m) => `/pipeline${m[1] ?? ''}`],
  [/^\/m\/tasks(\/.*)?$/,            (m) => `/activities${m[1] ?? ''}`],
  [/^\/m\/quotations(\/.*)?$/,       (m) => `/quotations${m[1] ?? ''}`],
  [/^\/m\/contracts(\/.*)?$/,        (m) => `/contracts${m[1] ?? ''}`],
  [/^\/m\/documents(\/.*)?$/,        (m) => `/documents${m[1] ?? ''}`],
  [/^\/m\/inbox(\/.*)?$/,            (m) => `/inbox${m[1] ?? ''}`],
  [/^\/m\/reports\/?$/,              () => '/reports'],
  [/^\/m\/ai\/?$/,                   () => '/ai'],
]

const PHONE_BREAKPOINT = 768
const DESKTOP_BREAKPOINT = 1024

export function useResponsiveRedirect(): void {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const path = location.pathname
    // Auth screens have their own layouts; never override.
    if (path.startsWith('/login') || path.startsWith('/forgot-password') || path.startsWith('/reset-password')) return

    const width = window.innerWidth
    const touchPrimary = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches

    // Phone: touch-primary AND narrow. A dev shrinking their desktop browser
    // to 400px shouldn't get punted to /m — they don't have a phone in hand.
    // DevTools mobile emulation flips pointer to coarse, so it still works.
    // Anything ≥ 1024 (desktop OR tablet in landscape) uses the desktop shell.
    // 768–1023 range (tablet portrait / narrow browser) is left alone.
    let rules: PathMapper[] | null = null
    if (touchPrimary && width < PHONE_BREAKPOINT) rules = DESKTOP_TO_MOBILE
    else if (width >= DESKTOP_BREAKPOINT) rules = MOBILE_TO_DESKTOP

    if (!rules) return

    for (const [pat, mapper] of rules) {
      const m = path.match(pat)
      if (!m) continue
      const target = mapper(m) + location.search + location.hash
      if (target !== path + location.search + location.hash) {
        navigate(target, { replace: true })
      }
      return
    }
  }, [location, navigate])
}
