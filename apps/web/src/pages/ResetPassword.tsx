import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { authFormCard, authInput, authPrimaryBtn, authPage } from './authStyles'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) setError('Missing reset token. Use the link from the email.')
  }, [token])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setBusy(true); setError(null)
    try {
      await api.resetPassword(token, password)
      navigate('/login?reset=1', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Reset failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={authPage}>
      <div style={authFormCard}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Choose a new password</div>
        <div style={{ fontSize: 13, color: '#5C5C74', marginBottom: 22 }}>Password must be at least 8 characters and include upper, lower and a digit.</div>
        <form onSubmit={submit}>
          <input type="password" placeholder="New password" required value={password} onChange={(e) => setPassword(e.target.value)} style={authInput} />
          <input type="password" placeholder="Confirm password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ ...authInput, marginTop: 10 }} />
          {error && <div style={{ marginTop: 12, background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={busy || !token} style={{ ...authPrimaryBtn, marginTop: 16, opacity: busy || !token ? 0.5 : 1 }}>{busy ? 'Updating…' : 'Reset password'}</button>
          <div style={{ marginTop: 14, fontSize: 13 }}><Link to="/login" style={{ color: '#2A6FDB', fontWeight: 600 }}>← Back to login</Link></div>
        </form>
      </div>
    </div>
  )
}
