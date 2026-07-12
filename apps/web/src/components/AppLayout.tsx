import { useState, type CSSProperties } from 'react'
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
  { path: '/ai', label: 'AI Workspace', icon: icons.spark },
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
  ai: 'AI Workspace',
  mobile: 'Mobile',
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)
  const { user, logout } = useAuth()
  const topSeg = location.pathname.split('/')[1] || 'dashboard'
  const crumb = CRUMB_MAP[topSeg] || ''
  const displayName = user?.name || 'Nattaya P.'
  const displayRole = ROLE_LABELS[user?.role ?? ''] || 'Sales Manager'
  const initials = displayName.split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('')
  const doLogout = async () => { await logout(); navigate('/login') }

  return (
    <ToastProvider>
      <div style={{ width: '100vw', height: '100vh', overflow: 'auto', background: '#fff' }}>
        <div style={{ display: 'flex', minWidth: 1280, width: '100%', height: '100%', background: '#fff' }}>
          {/* SIDEBAR */}
          <div style={{ width: 230, minWidth: 230, background: '#2E1A6B', color: '#EAE7F7', display: 'flex', flexDirection: 'column', padding: '16px 12px', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 16px 8px' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <img src="/logo.jpg" alt="Bluefish" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5, letterSpacing: '.01em' }}>Bluefish CRM</div>
                <div style={{ fontSize: 11, color: '#A99FD0' }}>Sales Cloud · TH</div>
              </div>
            </div>
            {NAV.map((n) => (
              <NavLink key={n.path} to={n.path} style={({ isActive }) => sideItemStyle(isActive)}>
                <svg viewBox="0 0 24 24" width="17" height="17" style={{ flex: 'none' }}>
                  <path d={n.icon} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ flex: 1, fontSize: 13.5 }}>{n.label}</span>
                {n.badge != null && (
                  <span style={{ background: '#C0392B', color: '#fff', fontSize: 10.5, fontWeight: 700, borderRadius: 9, padding: '1px 7px' }}>{n.badge}</span>
                )}
              </NavLink>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ background: '#2A1C66', border: '1px solid #3E2E86', borderRadius: 12, padding: 12, margin: '8px 4px 4px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <svg viewBox="0 0 24 24" width="15" height="15">
                  <path d="M12 3.5l1.9 5.4 5.4 1.9-5.4 1.9L12 18.1l-1.9-5.4-5.4-1.9 5.4-1.9z" fill="#A995F5" />
                </svg>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#CDBFF9' }}>AI Lead Hunter</span>
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.5, color: '#B4ABDD' }}>12 new prospects found overnight from e-GP & business news.</div>
              <div onClick={() => navigate('/ai')} style={{ marginTop: 9, background: '#6C55E0', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, textAlign: 'center', padding: '6px 0', cursor: 'pointer' }}>Review</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 8px 4px 8px', borderTop: '1px solid #3A2A7A', marginTop: 10 }}>
              <div onClick={() => navigate('/settings')} style={{ width: 30, height: 30, borderRadius: '50%', background: '#2A6FDB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{initials}</div>
              <div onClick={() => navigate('/settings')} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                <div style={{ fontSize: 10.5, color: '#A99FD0' }}>{displayRole}</div>
              </div>
              <div
                onClick={doLogout}
                title="Sign out"
                style={{ color: '#A99FD0', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4 M10 17l-5-5 5-5 M5 12h11" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>

          {/* MAIN COLUMN */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Topbar */}
            <div style={{ height: 58, minHeight: 58, borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', position: 'relative', zIndex: 5, background: 'linear-gradient(210deg,#0557F60F,#FFFFFF)' }}>
              <div style={{ fontSize: 13, color: '#050505' }}>
                Sales <span style={{ color: '#050505' }}>/</span> <span style={{ color: '#050505', fontWeight: 600 }}>{crumb}</span>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E5E7F0', borderRadius: 9, padding: '7px 12px', width: 300 }}>
                <svg viewBox="0 0 24 24" width="15" height="15">
                  <path d={icons.search} fill="none" stroke="#5C5C74" strokeWidth={1.8} strokeLinecap="round" />
                </svg>
                <input placeholder="Search customers, deals, quotes…  ( / )" style={{ border: 'none', background: 'transparent', fontSize: 12.5, flex: 1, color: '#1E1E30', outline: 'none' }} />
              </div>
              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => setNotifOpen((v) => !v)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    border: '1px solid #E5E7F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    position: 'relative',
                    background: '#fff',
                  }}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17">
                    <path d={icons.bell} fill="none" stroke="#3B3B55" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div style={{ position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: '50%', background: '#FF5A4D', border: '1.5px solid #fff' }} />
                </div>
                {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingLeft: 4 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid #E5E7F0', color: '#2A6FDB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, background: '#EEF3FC' }}>NP</div>
              </div>
            </div>
            {/* Content */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  )
}

function sideItemStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '9px 11px',
    borderRadius: 9,
    cursor: 'pointer',
    fontWeight: active ? 700 : 500,
    color: active ? '#fff' : '#B4ABDD',
    background: active ? '#4A32A6' : 'transparent',
    textDecoration: 'none',
  }
}

function NotifPanel({ onClose: _onClose }: { onClose: () => void }) {
  const rows = [
    { c: '#6C55E0', text: (<>Quotation <b>QT-2026-0142</b> is waiting for your approval</>), sub: '10 min ago' },
    { c: '#06C755', text: (<>New LINE message from <b>คุณพิมพ์ชนก</b> (Thonburi Medical)</>), sub: '25 min ago' },
    { c: '#B4650A', text: (<>Deal <b>Cold-chain Fleet Tracking</b> idle for 9 days — auto follow-up scheduled</>), sub: '1 hr ago' },
  ]
  return (
    <div style={{ position: 'absolute', right: 0, top: 44, width: 320, background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, boxShadow: '0 12px 32px rgba(14,31,25,.14)', padding: 8, animation: 'fadeUp .18s ease' }}>
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
