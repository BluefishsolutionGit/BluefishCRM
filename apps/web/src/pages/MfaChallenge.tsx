import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { ApiError } from '../lib/api'
import { authFormCard, authInput, authPrimaryBtn, authPage } from './authStyles'

interface State { mfaToken?: string; email?: string }

export default function MfaChallenge() {
  const { state } = useLocation() as { state: State | null }
  const navigate = useNavigate()
  const { verifyMfa } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!state?.mfaToken) return (
    <div style={authPage}>
      <div style={authFormCard}>
        <div style={{ marginBottom: 12 }}>MFA session expired.</div>
        <Link to="/login" style={{ color: '#2A6FDB', fontWeight: 600 }}>← Back to login</Link>
      </div>
    </div>
  )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      await verifyMfa(state.mfaToken!, code)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'MFA verification failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={authPage}>
      <div style={authFormCard}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Two-factor code</div>
        <div style={{ fontSize: 13, color: '#5C5C74', marginBottom: 22 }}>
          Enter the 6-digit code from your authenticator app{state.email && <> for <b>{state.email}</b></>}.
        </div>
        <form onSubmit={submit}>
          <input
            autoFocus inputMode="numeric" pattern="\d{6}" required
            placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={{ ...authInput, textAlign: 'center', letterSpacing: 6, fontFamily: "'IBM Plex Mono', monospace" }}
          />
          {error && <div style={{ marginTop: 12, background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={busy || code.length !== 6} style={{ ...authPrimaryBtn, marginTop: 16, opacity: busy || code.length !== 6 ? 0.5 : 1 }}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
          <div style={{ marginTop: 14, fontSize: 13 }}><Link to="/login" style={{ color: '#2A6FDB', fontWeight: 600 }}>← Back to login</Link></div>
        </form>
      </div>
    </div>
  )
}
