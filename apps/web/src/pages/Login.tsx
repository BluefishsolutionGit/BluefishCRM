import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { API_BASE, ApiError } from '../lib/api'
import { getBiometricHint, loginWithBiometric, isWebAuthnSupported, clearBiometricHint } from '../lib/webauthnClient'
import { preferredLandingRoute } from '../lib/landingRoute'
import './Login.css'

const RING1_ANGLES = [0, 26, 52, 77, 103, 129, 154, 180, 206, 231, 257, 283, 309, 334]
const RING1_SCALES = [0.85, 0.9, 0.8, 0.9, 0.85, 0.8, 0.9, 0.85, 0.8, 0.9, 0.85, 0.8, 0.9, 0.85]

const RING2_ANGLES = [8, 31, 53, 76, 98, 121, 143, 166, 188, 211, 233, 256, 278, 301, 323, 346]
const RING2_SCALES = [0.95, 0.85, 1, 0.9, 0.85, 1, 0.9, 0.85, 0.95, 0.9, 1, 0.85, 0.9, 0.95, 0.85, 0.9]

const RING3_ANGLES = [15, 45, 75, 105, 135, 165, 195, 225, 255, 285, 315, 345]
const RING3_SCALES = [0.75, 0.7, 0.8, 0.7, 0.75, 0.8, 0.7, 0.75, 0.8, 0.7, 0.75, 0.8]

function fishTransform(rotation: number, radius: number, scale: number): string {
  return `translate(240,234) rotate(${rotation}) translate(${radius},0) rotate(-90) scale(${scale})`
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [fEmail, setFEmail] = useState(false)
  const [fPw, setFPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [ssoConfigured, setSsoConfigured] = useState<boolean>(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login, handleSsoOutcome, refreshUser } = useAuth()
  const [bioHint, setBioHint] = useState<string | null>(() => (isWebAuthnSupported() ? getBiometricHint() : null))
  const [bioBusy, setBioBusy] = useState(false)

  const signInWithBiometric = async () => {
    if (bioBusy) return
    const target = (email && email.length > 3) ? email : bioHint
    if (!target) { setError('Enter your email first — biometric needs an account to unlock.'); return }
    setBioBusy(true); setError(null)
    const res = await loginWithBiometric(target)
    setBioBusy(false)
    if (res.ok) {
      // Refresh auth context so ProtectedRoute lets us in
      await refreshUser().catch(() => {})
      const goto = params.get('next') || preferredLandingRoute()
      navigate(goto)
    } else {
      // If the hint is stale (credential removed on server), forget it
      if (/Unknown credential|No biometric|expired/i.test(res.reason)) { clearBiometricHint(); setBioHint(null) }
      setError(res.reason)
    }
  }

  useEffect(() => {
    if (params.get('reset') === '1') setFlash('Password updated — please sign in with your new password.')
    const ssoError = params.get('sso_error')
    if (ssoError) {
      const map: Record<string, string> = {
        not_configured: 'Microsoft SSO is not configured on this server. Ask your admin to set MICROSOFT_CLIENT_ID / SECRET / TENANT_ID.',
        state_mismatch: 'Microsoft sign-in failed: security token mismatch. Please try again.',
        missing_code:   'Microsoft sign-in was cancelled or blocked. Please try again.',
        sso_failed:     'Microsoft sign-in failed. Your account may not exist in this CRM — ask your admin.',
      }
      setError(map[ssoError] ?? `Microsoft sign-in failed: ${ssoError}`)
    }
    if (window.location.hash.startsWith('#token=')) {
      const token = window.location.hash.slice('#token='.length)
      window.history.replaceState(null, '', '/login')
      handleSsoOutcome(token).then(() => navigate(preferredLandingRoute())).catch(() => setError('SSO login failed'))
    }
    fetch(`${API_BASE}/auth/sso/microsoft/status`)
      .then((r) => r.ok ? r.json() : { configured: false })
      .then((d) => setSsoConfigured(Boolean(d?.configured)))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emailBorder = fEmail ? '#2A6FDB' : '#E1E5EE'
  const pwBorder = fPw ? '#2A6FDB' : '#E1E5EE'
  const emailGlow = fEmail ? '0 0 0 4px rgba(42,111,219,.12)' : 'none'
  const pwGlow = fPw ? '0 0 0 4px rgba(42,111,219,.12)' : 'none'

  const inputRowStyle = (border: string, glow: string): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    border: `1.5px solid ${border}`,
    borderRadius: 12,
    padding: '0 14px',
    height: 50,
    marginBottom: 20,
    transition: 'border-color .15s, box-shadow .15s',
    boxShadow: glow,
  })

  const onLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const outcome = await login(email, password)
      if (outcome?.requiresMfa) {
        navigate('/login/mfa', { state: { mfaToken: outcome.mfaToken, email } })
        return
      }
      navigate(preferredLandingRoute())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed — is the API running?')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* ============ LEFT — customer-centric graphic ============ */}
        <div className="login-graphic">
          {/* corner organic blob */}
          <svg
            viewBox="0 0 220 200"
            style={{ position: 'absolute', top: -8, left: -10, width: 270, height: 'auto' }}
            aria-hidden="true"
          >
            <path
              d="M0,0 H220 C170,40 210,95 150,110 C90,125 70,60 20,90 C-10,108 0,40 0,0Z"
              fill="url(#gTop)"
            />
            <defs>
              <linearGradient id="gTop" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#2A6FDB" />
                <stop offset="1" stopColor="#5FA0F0" />
              </linearGradient>
            </defs>
          </svg>

          {/* ocean waves */}
          <svg
            viewBox="0 0 600 160"
            preserveAspectRatio="none"
            style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 150 }}
            aria-hidden="true"
          >
            <path
              d="M0,70 C100,40 200,100 300,75 C400,50 500,95 600,60 L600,160 L0,160 Z"
              fill="#1E52C0"
              opacity="0.45"
            />
            <path
              d="M0,105 C120,80 230,130 340,105 C450,82 540,120 600,100 L600,160 L0,160 Z"
              fill="#123C9B"
              opacity="0.55"
            />
          </svg>

          {/* rising bubbles */}
          <div
            style={{
              position: 'absolute',
              bottom: 110,
              left: '18%',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'rgba(255,255,255,.55)',
              animation: 'bubbleUp 5s linear infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 90,
              left: '70%',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'rgba(255,255,255,.45)',
              animation: 'bubbleUp 6.5s 1.2s linear infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 130,
              left: '46%',
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'rgba(255,255,255,.5)',
              animation: 'bubbleUp 7s 2.4s linear infinite',
            }}
          />

          {/* floating deco shapes */}
          <div
            style={{
              position: 'absolute',
              top: 64,
              right: 60,
              width: 26,
              height: 26,
              borderRadius: 8,
              background: 'linear-gradient(135deg,#5FA0F0,#2A6FDB)',
              transform: 'rotate(20deg)',
              animation: 'floaty 5s ease-in-out infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 96,
              left: 44,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'rgba(255,255,255,.5)',
              animation: 'floaty2 6s ease-in-out infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 140,
              left: 40,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#2A6FDB',
              opacity: 0.35,
              animation: 'floaty 7s ease-in-out infinite',
            }}
          />

          {/* CUSTOMER 360 constellation */}
          <svg
            viewBox="0 0 480 480"
            style={{ position: 'relative', zIndex: 2, width: '82%', maxWidth: 460, height: 'auto' }}
          >
            <defs>
              <radialGradient id="hub" cx="35%" cy="30%" r="80%">
                <stop offset="0" stopColor="#4C86E8" />
                <stop offset="1" stopColor="#2A6FDB" />
              </radialGradient>
              <filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#2A4B8F" floodOpacity="0.16" />
              </filter>
              <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#2A6FDB" />
                <stop offset="1" stopColor="#6B4FD8" />
              </linearGradient>
              <radialGradient id="waterDisc" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="#EAF4FE" />
                <stop offset="0.5" stopColor="#9CC6F4" />
                <stop offset="0.8" stopColor="#4C86E8" />
                <stop offset="1" stopColor="#4C86E8" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="bigfish" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#4C86E8" />
                <stop offset="1" stopColor="#1E52C0" />
              </linearGradient>
              <path
                id="sfish"
                d="M-6,0 C-2.5,-3.2 3,-3.2 6,0 C3,3.2 -2.5,3.2 -6,0 Z M6,0 L10.5,-3 L10.5,3 Z"
                fill="#fff"
              />
            </defs>

            {/* ground shadow */}
            <ellipse cx="240" cy="418" rx="150" ry="24" fill="#0E3E8F" opacity="0.12" />

            {/* orbit rings */}
            <circle
              cx="240"
              cy="234"
              r="132"
              fill="none"
              stroke="#2A6FDB"
              strokeOpacity="0.14"
              strokeWidth="1.5"
            />
            <circle
              cx="240"
              cy="234"
              r="100"
              fill="none"
              stroke="url(#ring)"
              strokeOpacity="0.5"
              strokeWidth="2"
              strokeDasharray="5 7"
              style={{ animation: 'spinDash 3s linear infinite' }}
            />

            {/* connectors */}
            <g
              stroke="#2A6FDB"
              strokeOpacity="0.32"
              strokeWidth="1.6"
              strokeDasharray="2 6"
              strokeLinecap="round"
            >
              <line x1="240" y1="176" x2="240" y2="120" />
              <line x1="292" y1="206" x2="360" y2="150" />
              <line x1="296" y1="268" x2="372" y2="316" />
              <line x1="184" y1="266" x2="112" y2="322" />
              <line x1="182" y1="208" x2="104" y2="164" />
            </g>

            {/* deep-water disc */}
            <circle cx="240" cy="234" r="112" fill="url(#waterDisc)" />

            {/* vortex of small white fish — 3 rings, alternating direction */}
            <g
              style={{
                transformOrigin: '240px 234px',
                animation: 'spinSchool 16s linear infinite',
              }}
              opacity="0.95"
            >
              {RING1_ANGLES.map((rot, i) => (
                <use key={i} href="#sfish" transform={fishTransform(rot, 72, RING1_SCALES[i])} />
              ))}
            </g>
            <g
              style={{
                transformOrigin: '240px 234px',
                animation: 'spinSchool 23s linear infinite',
              }}
              opacity="0.85"
            >
              {RING2_ANGLES.map((rot, i) => (
                <use key={i} href="#sfish" transform={fishTransform(rot, 86, RING2_SCALES[i])} />
              ))}
            </g>
            <g
              style={{
                transformOrigin: '240px 234px',
                animation: 'spinSchool 30s linear infinite',
              }}
              opacity="0.7"
            >
              {RING3_ANGLES.map((rot, i) => (
                <use key={i} href="#sfish" transform={fishTransform(rot, 99, RING3_SCALES[i])} />
              ))}
            </g>

            {/* big fish in the center (Bluefish.png — cropped AI-circuit fish) */}
            <g style={{ animation: 'floaty 6s ease-in-out infinite' }}>
              <image
                href="/Bluefish.png"
                x="170"
                y="188"
                width="140"
                height="93"
                preserveAspectRatio="xMidYMid meet"
              />
            </g>

            {/* TOP card: contact */}
            <g filter="url(#cardShadow)">
              <rect x="196" y="74" width="88" height="46" rx="12" fill="#fff" />
              <circle cx="220" cy="97" r="12" fill="#E8F0FD" />
              <circle cx="220" cy="93" r="4" fill="#2A6FDB" />
              <path d="M213,105 c0,-7 14,-7 14,0Z" fill="#2A6FDB" />
              <rect x="238" y="90" width="34" height="5" rx="2.5" fill="#3B3B55" />
              <rect x="238" y="100" width="24" height="4" rx="2" fill="#C4CBDA" />
            </g>

            {/* RIGHT-TOP card: chat / support */}
            <g filter="url(#cardShadow)">
              <rect x="336" y="118" width="74" height="58" rx="14" fill="#fff" />
              <rect x="352" y="134" width="42" height="7" rx="3.5" fill="#6B4FD8" />
              <rect x="352" y="147" width="30" height="6" rx="3" fill="#D9D2F5" />
              <path d="M356,166 l0,10 l12,-6 Z" fill="#6B4FD8" />
            </g>

            {/* RIGHT-BOTTOM card: deal / revenue */}
            <g filter="url(#cardShadow)">
              <rect x="332" y="298" width="82" height="52" rx="13" fill="#fff" />
              <circle cx="356" cy="324" r="14" fill="#E9F7EF" />
              <text
                x="356"
                y="329"
                textAnchor="middle"
                fontFamily="'Space Grotesk',sans-serif"
                fontWeight="700"
                fontSize="15"
                fill="#1F9D57"
              >
                $
              </text>
              <rect x="378" y="315" width="26" height="6" rx="3" fill="#3B3B55" />
              <rect x="378" y="326" width="18" height="5" rx="2.5" fill="#C4CBDA" />
            </g>

            {/* BOTTOM-LEFT card: analytics */}
            <g filter="url(#cardShadow)">
              <rect x="66" y="300" width="78" height="54" rx="13" fill="#fff" />
              <rect x="82" y="330" width="9" height="12" rx="2" fill="#7FB0F2" />
              <rect x="97" y="322" width="9" height="20" rx="2" fill="#4C86E8" />
              <rect x="112" y="314" width="9" height="28" rx="2" fill="#2A6FDB" />
              <rect x="127" y="326" width="9" height="16" rx="2" fill="#6B4FD8" />
            </g>

            {/* LEFT-TOP card: satisfaction stars */}
            <g filter="url(#cardShadow)">
              <rect x="62" y="130" width="80" height="46" rx="12" fill="#fff" />
              <g fill="#FFB020">
                <path d="M78,146 l2.4,4.9 5.4,.8 -3.9,3.8 .9,5.4 -4.8,-2.5 -4.8,2.5 .9,-5.4 -3.9,-3.8 5.4,-.8Z" />
                <path d="M100,146 l2.4,4.9 5.4,.8 -3.9,3.8 .9,5.4 -4.8,-2.5 -4.8,2.5 .9,-5.4 -3.9,-3.8 5.4,-.8Z" />
                <path d="M122,146 l2.4,4.9 5.4,.8 -3.9,3.8 .9,5.4 -4.8,-2.5 -4.8,2.5 .9,-5.4 -3.9,-3.8 5.4,-.8Z" />
              </g>
              <rect x="74" y="163" width="56" height="5" rx="2.5" fill="#C4CBDA" />
            </g>
          </svg>

          {/* caption */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 34,
              textAlign: 'center',
              zIndex: 3,
              padding: '0 40px',
            }}
          >
            <div
              style={{
                fontFamily: "'Space Grotesk',sans-serif",
                fontWeight: 700,
                fontSize: 19,
                color: '#fff',
                textShadow: '0 1px 8px rgba(14,40,110,.35)',
              }}
            >
              Every relationship, one view
            </div>
            <div
              style={{
                fontSize: 13.5,
                color: 'rgba(255,255,255,.88)',
                marginTop: 5,
                textShadow: '0 1px 6px rgba(14,40,110,.3)',
              }}
            >
              Put the customer at the center of every deal, chat, and decision.
            </div>
          </div>
        </div>

        {/* ============ RIGHT — form ============ */}
        <form className="login-form-panel" onSubmit={onLogin}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 38 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 11,
                background: '#EEF3FC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                border: '1px solid #E2E9F5',
              }}
            >
              <img
                src="/logo.jpg"
                alt="Bluefish"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <span
              style={{
                fontFamily: "'Space Grotesk',sans-serif",
                fontWeight: 700,
                fontSize: 17,
                color: '#1E1E30',
                letterSpacing: '-.2px',
              }}
            >
              Bluefish CRM
            </span>
          </div>

          <div style={{ fontSize: 14, color: '#8A8FA3', marginBottom: 4 }}>
            Login to your account
          </div>
          <h1
            style={{
              fontFamily: "'Space Grotesk',sans-serif",
              fontWeight: 700,
              fontSize: 34,
              color: '#161626',
              margin: '0 0 34px',
              letterSpacing: '-.6px',
            }}
          >
            Welcome Back!
          </h1>

          {/* email */}
          <label
            style={{
              display: 'block',
              fontSize: 12.5,
              fontWeight: 600,
              color: '#6A6F82',
              marginBottom: 7,
            }}
          >
            Email Address
          </label>
          <div style={inputRowStyle(emailBorder, emailGlow)}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2A6FDB" strokeWidth="1.8">
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="M4 7l8 6 8-6" />
            </svg>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFEmail(true)}
              onBlur={() => setFEmail(false)}
              placeholder="you@company.com"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 15,
                color: '#1E1E30',
              }}
            />
          </div>

          {/* password */}
          <label
            style={{
              display: 'block',
              fontSize: 12.5,
              fontWeight: 600,
              color: '#6A6F82',
              marginBottom: 7,
            }}
          >
            Password
          </label>
          <div style={{ ...inputRowStyle(pwBorder, pwGlow), marginBottom: 12 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2A6FDB" strokeWidth="1.8">
              <rect x="4" y="10" width="16" height="11" rx="3" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFPw(true)}
              onBlur={() => setFPw(false)}
              placeholder="••••••••"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 15,
                color: '#1E1E30',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="pw-toggle"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>

          <div style={{ textAlign: 'right', marginBottom: 26 }}>
            <Link to="/forgot-password" className="forgot-link">
              Forget Password?
            </Link>
          </div>

          {flash && (
            <div style={{ background: '#E5F8ED', color: '#0E6E4E', border: '1px solid #B5E4CB', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
              {flash}
            </div>
          )}

          {error && (
            <div style={{ background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}

          <button type="submit" className="login-submit" disabled={submitting} style={submitting ? { opacity: 0.7, cursor: 'wait' } : undefined}>
            {submitting ? 'Signing in…' : 'Login'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '24px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#E6E9F1' }} />
            <span style={{ fontSize: 13, color: '#9AA0B2' }}>Or</span>
            <div style={{ flex: 1, height: 1, background: '#E6E9F1' }} />
          </div>

          <div>
            <button
              type="button"
              className="social-btn"
              onClick={() => { window.location.href = `${API_BASE}/auth/sso/microsoft` }}
              disabled={!ssoConfigured}
              title={ssoConfigured ? undefined : 'Microsoft SSO is not configured on this server'}
              style={{ width: '100%', opacity: ssoConfigured ? 1 : 0.5, cursor: ssoConfigured ? 'pointer' : 'not-allowed' }}
            >
              <svg width="18" height="18" viewBox="0 0 23 23">
                <path fill="#f25022" d="M0 0h11v11H0z" />
                <path fill="#7fba00" d="M12 0h11v11H12z" />
                <path fill="#00a4ef" d="M0 12h11v11H0z" />
                <path fill="#ffb900" d="M12 12h11v11H12z" />
              </svg>
              Sign in with Microsoft{ssoConfigured ? '' : ' (not configured)'}
            </button>
          </div>

          {isWebAuthnSupported() && bioHint && (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="social-btn"
                onClick={signInWithBiometric}
                disabled={bioBusy}
                style={{ width: '100%', opacity: bioBusy ? 0.6 : 1, cursor: bioBusy ? 'not-allowed' : 'pointer' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 3c4 0 7 2 8 5M4 8c1-3 4-5 8-5m-8 5v5c0 5 3 8 8 8s8-3 8-8V8m-4 3v3a4 4 0 0 1-4 4 4 4 0 0 1-4-4v-3m4-1v4" fill="none" stroke="#4A3AB8" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
                {bioBusy ? 'Verifying…' : `Sign in with biometric${bioHint ? ` · ${bioHint}` : ''}`}
              </button>
            </div>
          )}

          <div
            style={{
              textAlign: 'center',
              marginTop: 30,
              fontSize: 14,
              fontWeight: 600,
              color: '#3B3B55',
            }}
          >
            Don't have an account?{' '}
            <a href="#" className="signup-link">
              Sign Up
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
