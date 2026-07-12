import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { icons } from '../lib/icons'
import { ToastProvider } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

interface NavDef {
  path: string
  label: string
  icon: string
  badge?: number
}

const NAV: NavDef[] = [
  { path: '/dashboard', label: 'Home', icon: icons.home },
  { path: '/inbox', label: 'Inbox', icon: icons.inbox, badge: 3 },
  { path: '/customers', label: 'Customers', icon: icons.users },
  { path: '/leads', label: 'Leads', icon: icons.target },
  { path: '/pipeline', label: 'Pipeline', icon: icons.kanban },
  { path: '/activities', label: 'Activities', icon: icons.cal },
  { path: '/quotations', label: 'Quotations', icon: icons.doc },
  { path: '/contracts', label: 'Contracts', icon: icons.contract },
  { path: '/products', label: 'Products', icon: icons.doc },
  { path: '/documents', label: 'Documents', icon: icons.doc },
  { path: '/reports', label: 'Reports', icon: icons.kanban },
  { path: '/ai', label: 'AI', icon: icons.spark },
  { path: '/mobile', label: 'Mobile', icon: icons.phone },
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  sales_manager: 'Sales Manager',
  sales_rep: 'Sales Rep',
  legal: 'Legal Officer',
  finance: 'Finance',
  auditor: 'Auditor',
}

const CRUMB_MAP: Record<string, string> = {
  dashboard: 'Home',
  inbox: 'Omnichannel Inbox',
  customers: 'Customers',
  leads: 'Leads',
  pipeline: 'Pipeline',
  activities: 'Activities',
  quotations: 'Quotations',
  contracts: 'Contract Management',
  products: 'Products',
  documents: 'Documents',
  reports: 'Reports',
  ai: 'AI Workspace',
  mobile: 'Mobile',
  settings: 'Settings',
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null)
  const { user, logout } = useAuth()
  const topSeg = location.pathname.split('/')[1] || 'dashboard'
  const crumb = CRUMB_MAP[topSeg] || ''
  const displayName = user?.name || 'Nattaya P.'
  const displayRole = ROLE_LABELS[user?.role ?? ''] || 'Sales Manager'
  const initials = displayName.split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('')
  const doLogout = async () => { await logout(); navigate('/login') }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <ToastProvider>
      <div style={{ width: '100vw', height: '100vh', overflow: 'auto', background: '#fff' }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 1280, width: '100%', minHeight: '100%', background: '#fff' }}>
          {/* ROW 1 — Brand + search + notif + user */}
          <div
            style={{
              height: 56,
              minHeight: 56,
              background: '#2E1A6B',
              color: '#EAE7F7',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '0 20px',
              position: 'relative',
              zIndex: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <img src="/logo.jpg" alt="Bluefish" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: '.01em' }}>Bluefish CRM</div>
                <div style={{ fontSize: 10.5, color: '#A99FD0' }}>Sales Cloud · TH</div>
              </div>
            </div>

            <div style={{ fontSize: 12.5, color: '#CDBFF9', paddingLeft: 22, borderLeft: '1px solid #3E2E86', marginLeft: 8 }}>
              Sales <span style={{ color: '#A99FD0' }}>/</span>{' '}
              <span style={{ color: '#fff', fontWeight: 600 }}>{crumb}</span>
            </div>

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#3A2A7A', border: '1px solid #4A3AB8', borderRadius: 9, padding: '7px 12px', width: 320 }}>
              <svg viewBox="0 0 24 24" width="15" height="15">
                <path d={icons.search} fill="none" stroke="#CDBFF9" strokeWidth={1.8} strokeLinecap="round" />
              </svg>
              <input
                placeholder="Search customers, deals, quotes…  ( / )"
                style={{ border: 'none', background: 'transparent', fontSize: 12.5, flex: 1, color: '#fff', outline: 'none' }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <div
                onClick={() => setNotifOpen((v) => !v)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  border: '1px solid #4A3AB8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  background: '#3A2A7A',
                }}
              >
                <svg viewBox="0 0 24 24" width="17" height="17">
                  <path d={icons.bell} fill="none" stroke="#EAE7F7" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div style={{ position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: '50%', background: '#FF5A4D', border: '1.5px solid #2E1A6B' }} />
              </div>
              {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} />}
            </div>

            <div ref={userMenuRef} style={{ position: 'relative' }}>
              <div
                onClick={() => setUserMenuOpen((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 10px 4px 4px', borderRadius: 999, cursor: 'pointer', border: '1px solid #4A3AB8', background: '#3A2A7A' }}
              >
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#2A6FDB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                  {initials}
                </div>
                <div style={{ minWidth: 0, maxWidth: 150 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                  <div style={{ fontSize: 10.5, color: '#A99FD0' }}>{displayRole}</div>
                </div>
                <svg viewBox="0 0 24 24" width="12" height="12" style={{ color: '#CDBFF9', flex: 'none' }}>
                  <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {userMenuOpen && (
                <div style={{ position: 'absolute', right: 0, top: 46, width: 200, background: '#fff', color: '#1E1E30', border: '1px solid #E5E7F0', borderRadius: 11, boxShadow: '0 12px 32px rgba(14,31,25,.14)', padding: 6, zIndex: 20 }}>
                  <div style={menuItem} onClick={() => { setUserMenuOpen(false); navigate('/settings') }}>
                    <svg viewBox="0 0 24 24" width="15" height="15"><path d={icons.settings} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Settings
                  </div>
                  <div style={{ ...menuItem, color: '#C0392B' }} onClick={doLogout}>
                    <svg viewBox="0 0 24 24" width="15" height="15">
                      <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4 M10 17l-5-5 5-5 M5 12h11" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Sign out
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ROW 2 — Primary nav */}
          <div
            style={{
              height: 48,
              minHeight: 48,
              background: '#fff',
              borderBottom: '1px solid #E5E7F0',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '0 12px',
              overflowX: 'auto',
              position: 'relative',
              zIndex: 5,
            }}
          >
            {NAV.map((n) => (
              <NavLink key={n.path} to={n.path} style={({ isActive }) => topNavItem(isActive)}>
                <svg viewBox="0 0 24 24" width="15" height="15" style={{ flex: 'none' }}>
                  <path d={n.icon} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 13 }}>{n.label}</span>
                {n.badge != null && (
                  <span style={{ background: '#C0392B', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '1px 6px', marginLeft: 2 }}>{n.badge}</span>
                )}
              </NavLink>
            ))}
          </div>

          {/* CONTENT */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Outlet />
          </div>
        </div>
      </div>
    </ToastProvider>
  )
}

function topNavItem(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: active ? 700 : 500,
    color: active ? '#2E1A6B' : '#5C5C74',
    background: active ? '#EEF0FA' : 'transparent',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    borderBottom: active ? '2px solid #2E1A6B' : '2px solid transparent',
    marginBottom: -1,
  }
}

const menuItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '9px 12px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
}

function NotifPanel({ onClose: _onClose }: { onClose: () => void }) {
  const rows = [
    { c: '#6C55E0', text: (<>Quotation <b>QT-2026-0142</b> is waiting for your approval</>), sub: '10 min ago' },
    { c: '#06C755', text: (<>New LINE message from <b>คุณพิมพ์ชนก</b> (Thonburi Medical)</>), sub: '25 min ago' },
    { c: '#B4650A', text: (<>Deal <b>Cold-chain Fleet Tracking</b> idle for 9 days — auto follow-up scheduled</>), sub: '1 hr ago' },
  ]
  return (
    <div style={{ position: 'absolute', right: 0, top: 44, width: 320, background: '#fff', color: '#1E1E30', border: '1px solid #E5E7F0', borderRadius: 13, boxShadow: '0 12px 32px rgba(14,31,25,.14)', padding: 8, zIndex: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, padding: '6px 10px', color: '#5C5C74', textTransform: 'uppercase', letterSpacing: '.06em' }}>Notifications</div>
      {rows.map((r, i) => (
        <div key={i} style={{ padding: '9px 10px', borderRadius: 9, display: 'flex', gap: 9, cursor: 'pointer' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.c, marginTop: 5, flex: 'none' }} />
          <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
            {r.text}
            <div style={{ color: '#8888A0', fontSize: 11 }}>{r.sub}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
