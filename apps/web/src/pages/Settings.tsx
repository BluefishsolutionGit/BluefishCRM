import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../lib/AuthContext'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'

export default function Settings() {
  const { user } = useAuth()
  const toast = useToast()

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px' }}>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 600, marginBottom: 20 }}>Settings</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={card}>
          <div style={cardTitle}>Profile</div>
          <div style={{ padding: '10px 20px 18px', color: '#5C5C74', fontSize: 13 }}>
            <div style={{ marginBottom: 6 }}><b style={{ color: '#3B3B52' }}>Name:</b> {user?.name}</div>
            <div style={{ marginBottom: 6 }}><b style={{ color: '#3B3B52' }}>Email:</b> {user?.email}</div>
            <div><b style={{ color: '#3B3B52' }}>Role:</b> {user?.role}</div>
          </div>
        </div>

        <ChangePasswordCard onDone={() => toast('Password updated')} />
        <MfaCard onToast={toast} />
      </div>
    </div>
  )
}

function ChangePasswordCard({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (next !== confirm) { setErr('New passwords do not match'); return }
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setCurrent(''); setNext(''); setConfirm('')
      onDone()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Change failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={card}>
      <div style={cardTitle}>Change password</div>
      <form onSubmit={submit} style={{ padding: '10px 20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required style={inputStyle} />
        <input type="password" placeholder="New password (≥ 8 chars, upper/lower/digit)" value={next} onChange={(e) => setNext(e.target.value)} required style={inputStyle} />
        <input type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required style={inputStyle} />
        {err && <div style={errBox}>{err}</div>}
        <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : 'Update password'}</button>
      </form>
    </div>
  )
}

function MfaCard({ onToast }: { onToast: (msg: string) => void }) {
  const { user } = useAuth()
  const [status, setStatus] = useState<'unknown' | 'enabled' | 'disabled'>('unknown')
  const [setup, setSetup] = useState<{ secret: string; otpauth: string; qr?: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api.me().then((u) => setStatus((u as unknown as { mfaEnabled?: boolean }).mfaEnabled ? 'enabled' : 'disabled')).catch(() => setStatus('disabled'))
  }, [user])

  const startSetup = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await api.mfaSetup()
      const QRCode = (await import('qrcode')).default
      const qr = await QRCode.toDataURL(res.otpauth)
      setSetup({ ...res, qr })
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Setup failed')
    } finally { setBusy(false) }
  }

  const verify = async () => {
    setBusy(true); setErr(null)
    try {
      await api.mfaVerify(code)
      setSetup(null); setCode(''); setStatus('enabled')
      onToast('MFA enabled — you will be asked for a code next login')
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Invalid code')
    } finally { setBusy(false) }
  }

  const disable = async () => {
    if (!window.confirm('Disable MFA?')) return
    setBusy(true); setErr(null)
    try {
      await api.mfaDisable(code)
      setCode(''); setStatus('disabled')
      onToast('MFA disabled')
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Invalid code')
    } finally { setBusy(false) }
  }

  return (
    <div style={card}>
      <div style={cardTitle}>Multi-factor authentication (TOTP)</div>
      <div style={{ padding: '10px 20px 18px' }}>
        {status === 'enabled' && !setup && (
          <>
            <div style={{ color: '#0E9C7E', fontSize: 13, marginBottom: 12 }}>✓ MFA is active on this account</div>
            <input placeholder="6-digit code to confirm disable" value={code} onChange={(e) => setCode(e.target.value)} style={inputStyle} />
            <button onClick={disable} disabled={busy || code.length !== 6} style={{ ...dangerBtn, marginTop: 10, opacity: busy || code.length !== 6 ? 0.5 : 1 }}>Disable MFA</button>
          </>
        )}
        {status !== 'enabled' && !setup && (
          <>
            <div style={{ color: '#5C5C74', fontSize: 13, marginBottom: 12 }}>MFA is not enabled. Use an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password) to protect your account.</div>
            <button onClick={startSetup} disabled={busy} style={primaryBtn}>{busy ? '…' : 'Set up MFA'}</button>
          </>
        )}
        {setup && (
          <>
            <div style={{ fontSize: 13, color: '#5C5C74', marginBottom: 10 }}>Scan this QR in your authenticator app, then enter the 6-digit code.</div>
            {setup.qr && <img src={setup.qr} alt="MFA QR" style={{ width: 180, height: 180, display: 'block', margin: '0 auto 10px' }} />}
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#5C5C74', wordBreak: 'break-all', marginBottom: 10 }}>Secret: {setup.secret}</div>
            <input placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={verify} disabled={busy || code.length !== 6} style={{ ...primaryBtn, flex: 1, opacity: busy || code.length !== 6 ? 0.5 : 1 }}>{busy ? '…' : 'Verify & enable'}</button>
              <button onClick={() => { setSetup(null); setCode('') }} style={ghostBtn}>Cancel</button>
            </div>
          </>
        )}
        {err && <div style={{ ...errBox, marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  )
}

const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14 }
const cardTitle: CSSProperties = { padding: '16px 20px', borderBottom: '1px solid #F2F3F9', fontSize: 14, fontWeight: 700 }
const inputStyle: CSSProperties = { border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const dangerBtn: CSSProperties = { background: '#fff', color: '#C0392B', border: '1px solid #E5B4AC', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const ghostBtn: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const errBox: CSSProperties = { background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }
