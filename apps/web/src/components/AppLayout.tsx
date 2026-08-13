import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { GlobalSearchResultDto } from '@bluefish/shared'
import { api } from '../lib/api'
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
  { path: '/audit', label: 'Audit', icon: icons.check },
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
  audit: 'Audit trail',
  settings: 'Settings',
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const refreshUnreadCount = () => api.notifications().then((rows) => setUnreadCount(rows.filter((r) => r.unread).length)).catch(() => {})
  useEffect(() => {
    refreshUnreadCount()
    const iv = setInterval(refreshUnreadCount, 60_000)
    return () => clearInterval(iv)
  }, [])
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

            <GlobalSearch />


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
                {unreadCount > 0 && (
                  <div style={{ position: 'absolute', top: -2, right: -2, background: '#FF5A4D', color: '#fff', fontSize: 9.5, fontWeight: 800, borderRadius: 999, padding: unreadCount > 9 ? '1px 5px' : '1px 4px', border: '1.5px solid #2E1A6B', minWidth: 16, textAlign: 'center', lineHeight: 1.3 }}>{unreadCount > 99 ? '99+' : unreadCount}</div>
                )}
              </div>
              {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} onChange={refreshUnreadCount} />}
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

const TONE_COLOR: Record<string, string> = { ok: '#06C755', warn: '#B4650A', bad: '#C0392B', info: '#6C55E0' }

function NotifPanel({ onClose, onChange }: { onClose: () => void; onChange?: () => void }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<import('@bluefish/shared').NotificationDto[] | null>(null)

  const reload = () => api.notifications().then(setRows).catch(() => setRows([]))
  useEffect(() => { reload() }, [])

  const timeAgo = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime()
    const abs = Math.abs(diff)
    const min = Math.round(abs / 60000)
    const hr = Math.round(abs / 3600000)
    const d = Math.round(abs / 86400000)
    const sign = diff < 0 ? 'in ' : ''
    const suffix = diff < 0 ? '' : ' ago'
    if (abs < 60000) return diff < 0 ? 'in a moment' : 'just now'
    if (min < 60) return `${sign}${min} min${suffix}`
    if (hr < 24) return `${sign}${hr} hr${suffix}`
    return `${sign}${d} d${suffix}`
  }

  const go = async (row: import('@bluefish/shared').NotificationDto) => {
    // Mark read optimistically so the badge decrement is instant, then navigate.
    if (row.unread) {
      setRows((cur) => cur?.map((r) => (r.id === row.id ? { ...r, unread: false } : r)) ?? cur)
      api.markNotificationRead(row.id).then(() => onChange?.()).catch(() => reload())
    }
    onClose(); navigate(row.link)
  }

  const markAll = async () => {
    if (!rows || rows.every((r) => !r.unread)) return
    setRows((cur) => cur?.map((r) => ({ ...r, unread: false })) ?? cur)
    try { await api.markAllNotificationsRead(); onChange?.() }
    catch { reload() }
  }

  const dismissOne = (row: import('@bluefish/shared').NotificationDto, e: React.MouseEvent) => {
    e.stopPropagation()  // don't trigger the row's onClick navigation
    if (!row.unread) return
    setRows((cur) => cur?.map((r) => (r.id === row.id ? { ...r, unread: false } : r)) ?? cur)
    api.markNotificationRead(row.id).then(() => onChange?.()).catch(() => reload())
  }

  const unreadCount = rows?.filter((r) => r.unread).length ?? 0

  return (
    <div style={{ position: 'absolute', right: 0, top: 44, width: 340, background: '#fff', color: '#1E1E30', border: '1px solid #E5E7F0', borderRadius: 13, boxShadow: '0 12px 32px rgba(14,31,25,.14)', padding: 8, zIndex: 20, maxHeight: 460, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5C5C74', textTransform: 'uppercase', letterSpacing: '.06em', flex: 1 }}>Notifications</div>
        {unreadCount > 0 && (
          <button type="button" onClick={markAll} style={{ background: 'transparent', border: 'none', fontSize: 11, fontWeight: 600, color: '#2A6FDB', cursor: 'pointer', padding: '2px 4px' }}>Mark all read</button>
        )}
      </div>
      {rows === null && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 12 }}>Loading…</div>}
      {rows?.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 12 }}>You're all caught up.</div>}
      {rows?.map((r) => (
        <div key={r.id} onClick={() => go(r)} style={{ padding: '9px 10px', borderRadius: 9, display: 'flex', gap: 9, cursor: 'pointer', background: r.unread ? '#F7FAFF' : 'transparent', opacity: r.unread ? 1 : 0.6, alignItems: 'flex-start' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: TONE_COLOR[r.tone] ?? '#8888A0', marginTop: 5, flex: 'none' }} />
          <div style={{ fontSize: 12.5, lineHeight: 1.45, minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: r.unread ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
            <div style={{ color: '#8888A0', fontSize: 11, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub} · {timeAgo(r.at)}</div>
          </div>
          {r.unread && (
            <button type="button" onClick={(e) => dismissOne(r, e)} title="Dismiss"
              style={{ background: 'transparent', border: 'none', color: '#8082A5', fontSize: 15, lineHeight: 1, padding: '0 4px', cursor: 'pointer', alignSelf: 'center' }}>×</button>
          )}
        </div>
      ))}
    </div>
  )
}

function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<GlobalSearchResultDto | null>(null)
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return }
    setLoading(true)
    const t = setTimeout(() => {
      api.globalSearch(q.trim())
        .then((r) => { setResults(r); setOpen(true) })
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const go = (path: string) => { setOpen(false); setQ(''); setResults(null); navigate(path) }

  const totalHits = results ? results.customers.length + results.leads.length + results.opportunities.length + results.quotations.length + results.contracts.length : 0

  return (
    <div ref={rootRef} style={{ position: 'relative', width: 320 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#3A2A7A', border: '1px solid #4A3AB8', borderRadius: 9, padding: '7px 12px' }}>
        <svg viewBox="0 0 24 24" width="15" height="15">
          <path d={icons.search} fill="none" stroke="#CDBFF9" strokeWidth={1.8} strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.trim().length >= 2 && setOpen(true)}
          placeholder="Search customers, deals, quotes…"
          style={{ border: 'none', background: 'transparent', fontSize: 12.5, flex: 1, color: '#fff', outline: 'none' }}
        />
        {loading && <span style={{ fontSize: 10, color: '#CDBFF9' }}>…</span>}
      </div>
      {open && results && (
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, background: '#fff', color: '#1E1E30', border: '1px solid #E5E7F0', borderRadius: 11, boxShadow: '0 12px 32px rgba(14,31,25,.14)', padding: 6, zIndex: 30, maxHeight: 480, overflow: 'auto' }}>
          {totalHits === 0 && <div style={{ padding: 14, fontSize: 12, color: '#8888A0', textAlign: 'center' }}>No matches for "{results.query}"</div>}

          <SearchGroup label="Customers" items={results.customers.map((c) => ({ id: c.id, primary: c.name, secondary: `${c.code} · ${c.industry}`, path: `/customers/${c.id}` }))} onPick={go} color="#2A6FDB" />
          <SearchGroup label="Leads" items={results.leads.map((l) => ({ id: l.id, primary: l.name, secondary: `${l.companyName} · ${l.status} · score ${l.score}`, path: `/leads` }))} onPick={go} color="#B4650A" />
          <SearchGroup label="Opportunities" items={results.opportunities.map((o) => ({ id: o.id, primary: o.title, secondary: `${o.customerName} · ${o.stage} · ฿${(o.value / 1e6).toFixed(1)}M`, path: `/pipeline` }))} onPick={go} color="#6C55E0" />
          <SearchGroup label="Quotations" items={results.quotations.map((q2) => ({ id: q2.id, primary: q2.no, secondary: `${q2.customerName} · ${q2.status}`, path: `/quotations/${q2.id}` }))} onPick={go} color="#7C3AED" />
          <SearchGroup label="Contracts" items={results.contracts.map((c) => ({ id: c.id, primary: c.no, secondary: `${c.customerName} · ${c.status}`, path: `/contracts` }))} onPick={go} color="#2E1A6B" />
        </div>
      )}
    </div>
  )
}

function SearchGroup({ label, items, onPick, color }: { label: string; items: Array<{ id: string; primary: string; secondary: string; path: string }>; onPick: (p: string) => void; color: string }) {
  if (items.length === 0) return null
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', color: '#8888A0', textTransform: 'uppercase', padding: '6px 10px' }}>{label}</div>
      {items.map((it) => (
        <div key={it.id} onClick={() => onPick(it.path)} style={{ display: 'flex', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', alignItems: 'center' }} className="search-hit">
          <div style={{ width: 4, height: 24, borderRadius: 2, background: color, flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.primary}</div>
            <div style={{ fontSize: 10.5, color: '#8888A0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.secondary}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
