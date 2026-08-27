import { useEffect, useState, type CSSProperties } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { count as countDrafts, drainAll, subscribe as subscribeQueue } from '../lib/offlineQueue'
import PwaInstallPrompt from './PwaInstallPrompt'
import PushPromptBanner from './PushPromptBanner'
import { ToastProvider } from '../lib/ToastContext'

const TABS = [
  { path: '/m', label: 'Home', d: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { path: '/m/leads', label: 'Leads', d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z' },
  { path: '/m/opportunities', label: 'Pipeline', d: 'M4 4h4.5v16H4z M9.75 4h4.5v11h-4.5z M15.5 4H20v8h-4.5z' },
  { path: '/m/customers', label: 'Customers', d: 'M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c0-3.3 2.7-6 6-6s6 2.7 6 6' },
  { path: '/m/tasks', label: 'Tasks', d: 'M4 6.5h16V20H4z M4 11h16 M8.5 3.5v5 M15.5 3.5v5' },
  { path: '/m/more', label: 'More', d: 'M5 12a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z M12 12a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z M19 12a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z' },
]

// Pages surfaced by tapping "Bluefish CRM" — everything not on the bottom nav.
const MENU_LINKS: { path: string; label: string; icon: string }[] = [
  { path: '/m', label: 'Home', icon: '🏠' },
  { path: '/m/leads', label: 'Leads', icon: '🎯' },
  { path: '/m/opportunities', label: 'Pipeline', icon: '📊' },
  { path: '/m/customers', label: 'Customers', icon: '👥' },
  { path: '/m/contracts', label: 'Contracts', icon: '📃' },
  { path: '/m/quotations', label: 'Quotations', icon: '📄' },
  { path: '/m/documents', label: 'Documents', icon: '📁' },
  { path: '/m/tasks', label: 'Tasks', icon: '✅' },
  { path: '/m/inbox', label: 'Inbox', icon: '💬' },
  { path: '/m/reports', label: 'Reports', icon: '📈' },
  { path: '/m/nearby', label: 'Nearby', icon: '🗺' },
  { path: '/m/ai', label: 'AI Workspace', icon: '✨' },
  { path: '/m/more', label: 'Quick Actions', icon: '⚡' },
]

export default function MobileShell() {
  const { user, logout, hasPermission } = useAuth()
  const navigate = useNavigate()
  const [online, setOnline] = useState<boolean>(navigator.onLine)
  const [draftCount, setDraftCount] = useState<number>(0)
  const [syncing, setSyncing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    void countDrafts().then(setDraftCount).catch(() => setDraftCount(0))
    const unsub = subscribeQueue(setDraftCount)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      unsub()
    }
  }, [])

  const canSeeAll = hasPermission('service:view_all')
  const services = user?.services ?? []
  const syncNow = async () => {
    if (syncing) return
    setSyncing(true)
    try { await drainAll() } finally { setSyncing(false) }
  }

  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const initials = (user?.name ?? 'U').split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase()

  return (
    <ToastProvider>
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#F4F6F1', paddingBottom: 68, boxShadow: '0 0 40px rgba(30,26,48,.06)' }}>
      <div style={{ padding: '14px 16px 12px', background: '#fff', borderBottom: '1px solid #E5E7F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.jpg" alt="Bluefish" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'cover', flex: 'none' }} />

          {/* Combined bar: system name → Hi, User → initials */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              onClick={() => setMenuOpen(true)}
              style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
              title="Menu"
            >
              Bluefish CRM
              <span style={{ marginLeft: 4, fontSize: 10, color: '#8888A0' }}>▾</span>
            </div>
            <div style={{ width: 4, height: 4, borderRadius: 2, background: '#D0D0DF', flex: 'none' }} />
            <div style={{ fontSize: 12.5, color: '#3B3B52', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              Hi, <span style={{ fontWeight: 700 }}>{firstName}</span>
            </div>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2A6FDB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flex: 'none' }}>
              {initials}
            </div>
          </div>

          <div onClick={() => { logout(); navigate('/login') }} style={{ fontSize: 11, color: '#8888A0', cursor: 'pointer', flex: 'none' }}>Sign out</div>
        </div>

        {/* Service-scope chip — only shown for reps without view_all */}
        {!canSeeAll && user && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: '#8888A0', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Scope</span>
            {services.length === 0 ? (
              <span style={{ background: '#FDECEA', color: '#C0392B', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>no services — you will see nothing scoped</span>
            ) : services.map((s) => (
              <span key={s} style={{ background: '#EEF0FA', color: '#2A6FDB', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{s}</span>
            ))}
          </div>
        )}

        {(!online || draftCount > 0) && (
          <div style={{ marginTop: 10, background: online ? '#E4EDFC' : '#F7EBD9', border: '1px solid ' + (online ? '#B7CFF3' : '#F0BA95'), color: online ? '#2A6FDB' : '#7A5210', borderRadius: 10, padding: '8px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1 }}>
              {online
                ? `${draftCount} draft${draftCount === 1 ? '' : 's'} pending sync`
                : `Offline — ${draftCount} draft${draftCount === 1 ? '' : 's'} will sync when connected`}
            </span>
            {online && draftCount > 0 && (
              <span onClick={syncNow} style={{ color: '#fff', background: '#2A6FDB', padding: '3px 10px', borderRadius: 999, textDecoration: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </span>
            )}
          </div>
        )}
      </div>

      <PwaInstallPrompt />
      <PushPromptBanner />

      <div style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </div>

      {menuOpen && (
        <MenuDrawer onClose={() => setMenuOpen(false)} onGo={(p) => { setMenuOpen(false); navigate(p) }} />
      )}

      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: '#fff', borderTop: '1px solid #E5E7F0', display: 'flex', padding: '8px 6px 10px', boxShadow: '0 -4px 16px rgba(14,31,25,.05)' }}>
        {TABS.map((t) => (
          <NavLink key={t.path} to={t.path} end={t.path === '/m'} style={({ isActive }) => tabItem(isActive)}>
            {({ isActive }) => (
              <>
                <svg viewBox="0 0 24 24" width="20" height="20"><path d={t.d} fill="none" stroke={isActive ? '#2A6FDB' : '#8888A0'} strokeWidth={1.9} strokeLinejoin="round" strokeLinecap="round" /></svg>
                <div style={{ fontSize: 9.5, fontWeight: isActive ? 700 : 600, color: isActive ? '#2A6FDB' : '#8888A0' }}>{t.label}</div>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
    </ToastProvider>
  )
}

function MenuDrawer({ onClose, onGo }: { onClose: () => void; onGo: (path: string) => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,20,32,.35)',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        zIndex: 90,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: '#fff',
          borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
          padding: '14px 16px 18px', boxShadow: '0 12px 30px rgba(20,20,32,.18)',
          animation: 'slideDown .18s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ flex: 1, fontFamily: "'Space Grotesk'", fontSize: 14, fontWeight: 800 }}>All pages</div>
          <div onClick={onClose} style={{ color: '#8888A0', fontSize: 18, padding: '2px 6px', cursor: 'pointer' }}>✕</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {MENU_LINKS.map((m) => (
            <div key={m.path} onClick={() => onGo(m.path)} style={menuTile}>
              <div style={{ fontSize: 20 }}>{m.icon}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#3B3B52', marginTop: 4 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function tabItem(_active: boolean): CSSProperties {
  return { flex: 1, textAlign: 'center', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }
}

const menuTile: CSSProperties = {
  background: '#F7F8FC', border: '1px solid #E5E7F0', borderRadius: 12,
  padding: '12px 6px', textAlign: 'center', cursor: 'pointer',
}
