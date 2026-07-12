import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { authFormCard, authInput, authPrimaryBtn, authPage } from './authStyles'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await api.forgotPassword(email)
      setSent(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Request failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={authPage}>
      <div style={authFormCard}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Reset your password</div>
        <div style={{ fontSize: 13, color: '#5C5C74', marginBottom: 22 }}>
          Enter your email address. If an account exists, we'll send a reset link (valid for 1 hour).
        </div>

        {sent ? (
          <>
            <div style={{ background: '#E5F8ED', color: '#0E6E4E', border: '1px solid #B5E4CB', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
              If <b>{email}</b> is registered, a reset link has been sent. Check your inbox (in dev, check the API log).
            </div>
            <Link to="/login" style={{ fontWeight: 600, color: '#2A6FDB' }}>← Back to login</Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <input type="email" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} style={authInput} />
            {error && <div style={{ marginTop: 12, background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>{error}</div>}
            <button type="submit" disabled={busy} style={{ ...authPrimaryBtn, marginTop: 16, opacity: busy ? 0.7 : 1 }}>{busy ? 'Sending…' : 'Send reset link'}</button>
            <div style={{ marginTop: 14, fontSize: 13 }}><Link to="/login" style={{ color: '#2A6FDB', fontWeight: 600 }}>← Back to login</Link></div>
          </form>
        )}
      </div>
    </div>
  )
}
