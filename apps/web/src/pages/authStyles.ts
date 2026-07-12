import type { CSSProperties } from 'react'

export const authPage: CSSProperties = {
  width: '100vw',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'radial-gradient(1200px 700px at 20% 10%,#F4F8FF,#E7EDF8 70%)',
  padding: 28,
}
export const authFormCard: CSSProperties = {
  width: '100%',
  maxWidth: 460,
  background: '#fff',
  borderRadius: 20,
  boxShadow: '0 30px 80px -30px rgba(30,26,48,.35)',
  padding: '44px 46px',
}
export const authInput: CSSProperties = {
  width: '100%',
  border: '1.5px solid #E1E5EE',
  borderRadius: 12,
  padding: '13px 14px',
  fontSize: 15,
  color: '#1E1E30',
  outline: 'none',
}
export const authPrimaryBtn: CSSProperties = {
  width: '100%',
  height: 52,
  border: 'none',
  borderRadius: 13,
  background: 'linear-gradient(135deg,#2A6FDB,#4C86E8)',
  color: '#fff',
  fontFamily: "'Space Grotesk', sans-serif",
  fontWeight: 600,
  fontSize: 16,
  cursor: 'pointer',
  boxShadow: '0 12px 24px -8px rgba(42,111,219,.6)',
}
