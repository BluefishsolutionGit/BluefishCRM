/**
 * WebAuthn client helper — pairs with the /auth/webauthn/* endpoints.
 *
 * Two flows:
 *  - `registerBiometric()`: while signed in, register the current device so
 *    future logins can use Face ID / Touch ID / Windows Hello / security key.
 *  - `loginWithBiometric(email)`: kick off an authentication ceremony,
 *    returns the accessToken on success.
 *
 * We also stash `bluefish.hasBiometric` in localStorage as a hint to the
 * login page — it can then default the "Sign in with biometric" button on
 * without needing a round-trip.
 */

import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { api, setToken, ApiError } from './api'
import type { LoginResponse } from '@bluefish/shared'

const HINT_KEY = 'bluefish.hasBiometric'
const HINT_EMAIL_KEY = 'bluefish.hasBiometricFor'

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && !!navigator.credentials
}

export function getBiometricHint(): string | null {
  if (localStorage.getItem(HINT_KEY) !== '1') return null
  return localStorage.getItem(HINT_EMAIL_KEY)
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false
  try {
    return await (PublicKeyCredential as unknown as { isUserVerifyingPlatformAuthenticatorAvailable: () => Promise<boolean> }).isUserVerifyingPlatformAuthenticatorAvailable()
  } catch { return false }
}

export async function registerBiometric(deviceLabel?: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isWebAuthnSupported()) return { ok: false, reason: 'This browser does not support WebAuthn.' }
  try {
    const options = await api.webauthnRegisterOptions()
    const attResp = await startRegistration({ optionsJSON: options })
    await api.webauthnRegisterVerify({ response: attResp, deviceLabel })
    // Remember the email so the login page can show the biometric button next time
    const me = await api.me().catch(() => null)
    if (me) {
      localStorage.setItem(HINT_KEY, '1')
      localStorage.setItem(HINT_EMAIL_KEY, me.email)
    }
    return { ok: true }
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, reason: e.message }
    // Handle user-cancellation quietly
    const msg = (e as Error).message || 'Registration failed'
    if (/NotAllowedError|user\s*(canceled|cancelled)/i.test(msg)) return { ok: false, reason: 'Cancelled by user' }
    return { ok: false, reason: msg }
  }
}

export async function loginWithBiometric(email: string): Promise<{ ok: true; accessToken: string; user: LoginResponse['user'] } | { ok: false; reason: string }> {
  if (!isWebAuthnSupported()) return { ok: false, reason: 'This browser does not support WebAuthn.' }
  try {
    const { options, hasCredentials } = await api.webauthnAuthOptions(email)
    if (!hasCredentials) return { ok: false, reason: 'No biometric credential registered for that account.' }
    const assertion = await startAuthentication({ optionsJSON: options })
    const res = await api.webauthnAuthVerify({ email, response: assertion })
    setToken(res.accessToken)
    localStorage.setItem(HINT_KEY, '1')
    localStorage.setItem(HINT_EMAIL_KEY, email)
    return { ok: true, accessToken: res.accessToken, user: res.user }
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, reason: e.message }
    const msg = (e as Error).message || 'Sign-in failed'
    if (/NotAllowedError|user\s*(canceled|cancelled)/i.test(msg)) return { ok: false, reason: 'Cancelled by user' }
    return { ok: false, reason: msg }
  }
}

export function clearBiometricHint() {
  localStorage.removeItem(HINT_KEY)
  localStorage.removeItem(HINT_EMAIL_KEY)
}
