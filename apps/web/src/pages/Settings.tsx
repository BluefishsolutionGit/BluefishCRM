import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../lib/AuthContext'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import type { CalendarAccountDto, ChannelIntegrationDto, CreateUserDto, RoleDto, UpdateUserDto, UserDto } from '@bluefish/shared'
import { SERVICE_LINES } from '@bluefish/shared'
import MasterData from './MasterData'

const ROLES_WITH_VIEW_ALL = new Set(['admin', 'sales_manager', 'auditor'])

type Tab = 'profile' | 'security' | 'integrations' | 'users' | 'matrix' | 'master-data'

export default function Settings() {
  const { user, hasPermission } = useAuth()
  const toast = useToast()
  const canManageUsers = hasPermission('user:manage')
  const [tab, setTab] = useState<Tab>('profile')

  const tabs: { id: Tab; label: string; visible: boolean }[] = [
    { id: 'profile',      label: 'Profile',         visible: true },
    { id: 'security',     label: 'Security',        visible: true },
    { id: 'integrations', label: 'Integrations',    visible: true },
    { id: 'users',        label: 'User Management', visible: canManageUsers },
    { id: 'master-data',  label: 'Master Data',     visible: canManageUsers },
    { id: 'matrix',       label: 'Role Matrix',     visible: true },
  ]

  useEffect(() => {
    // Handle the redirect back from Microsoft OAuth (see calendar-sync.controller.ts).
    const params = new URLSearchParams(window.location.search)
    const calendar = params.get('calendar')
    if (!calendar) return
    if (calendar === 'connected') {
      toast(`Microsoft calendar connected${params.get('email') ? ` (${params.get('email')})` : ''}`)
    } else if (calendar === 'error') {
      toast(`Calendar connect failed: ${params.get('reason') ?? 'unknown'}`)
    }
    setTab('integrations')
    // Strip the query string so a refresh doesn't fire the toast again
    window.history.replaceState({}, '', window.location.pathname)
  }, [toast])

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px' }}>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Settings</div>
      <div style={{ color: '#8082A5', fontSize: 13, marginBottom: 18 }}>
        Manage your profile, credentials, workspace users, and role permissions.
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E5E7F0', marginBottom: 22 }}>
        {tabs.filter((t) => t.visible).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              color: tab === t.id ? '#2A6FDB' : '#5C5C74',
              borderBottom: tab === t.id ? '2px solid #2A6FDB' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
          <div style={card}>
            <div style={cardTitle}>Profile</div>
            <div style={{ padding: '10px 20px 18px', color: '#5C5C74', fontSize: 13 }}>
              <div style={{ marginBottom: 6 }}><b style={{ color: '#3B3B52' }}>Name:</b> {user?.name}</div>
              <div style={{ marginBottom: 6 }}><b style={{ color: '#3B3B52' }}>Email:</b> {user?.email}</div>
              <div style={{ marginBottom: 6 }}><b style={{ color: '#3B3B52' }}>Role:</b> {user?.role}</div>
              {user?.department && <div style={{ marginBottom: 6 }}><b style={{ color: '#3B3B52' }}>Department:</b> {user.department}</div>}
              {user?.services && user.services.length > 0 && (
                <div style={{ marginBottom: 6 }}><b style={{ color: '#3B3B52' }}>Services:</b> {user.services.join(', ')}</div>
              )}
              <TimezoneField />
            </div>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
          <ChangePasswordCard onDone={() => toast('Password updated')} />
          <MfaCard onToast={toast} />
        </div>
      )}

      {tab === 'integrations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, alignItems: 'start' }}>
            <CalendarSyncCard onToast={toast} />
            {canManageUsers && <SalesTargetsCard onToast={toast} />}
          </div>
          {canManageUsers && <InboxChannelsSection onToast={toast} />}
        </div>
      )}

      {tab === 'users' && canManageUsers && (
        <UserManagementSection onToast={toast} />
      )}

      {tab === 'master-data' && canManageUsers && <MasterData onToast={toast} />}

      {tab === 'matrix' && <RoleMatrixSection />}
    </div>
  )
}

/* ═══════════════════════ Timezone field ═══════════════════════ */

const TIMEZONE_OPTIONS = [
  'Asia/Bangkok', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Ho_Chi_Minh',
  'Asia/Jakarta', 'Asia/Manila', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Shanghai',
  'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC',
]

function TimezoneField() {
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const current = user?.timezone ?? 'Asia/Bangkok'

  const save = async (tz: string) => {
    if (tz === current) return
    setSaving(true)
    try {
      await api.updateSelf({ timezone: tz })
      await refreshUser()
      toast(`Timezone set to ${tz}`)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to update timezone')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <b style={{ color: '#3B3B52' }}>Timezone:</b>
      <select
        value={current}
        disabled={saving}
        onChange={(e) => save(e.target.value)}
        style={{ ...inputStyle, padding: '5px 10px', fontSize: 12.5 }}
        title="Applied when pushing your activities to Outlook"
      >
        {TIMEZONE_OPTIONS.includes(current) ? null : <option value={current}>{current}</option>}
        {TIMEZONE_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
      </select>
      {saving && <span style={{ fontSize: 11, color: '#8082A5' }}>Saving…</span>}
    </div>
  )
}

/* ═══════════════════════ Annual sales targets (per service line) ═══════════════════════ */

const SERVICE_COLORS: Record<string, string> = { Box: '#2A6FDB', '3S': '#0E9C7E', '3D': '#B4650A', 'AI&RPA': '#6C55E0' }

function SalesTargetsCard({ onToast }: { onToast: (msg: string) => void }) {
  const [year] = useState(String(new Date().getFullYear()))
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [initial, setInitial] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.salesTargets(year).then((rows) => {
      const map: Record<string, number> = {}
      for (const s of SERVICE_LINES) map[s] = 0
      for (const r of rows) map[r.service] = r.amount
      setTargets(map); setInitial({ ...map })
    }).catch(() => {})
  }, [year])

  const dirty = SERVICE_LINES.some((s) => (targets[s] ?? 0) !== (initial[s] ?? 0))

  const save = async () => {
    setSaving(true)
    try {
      const changed = SERVICE_LINES.filter((s) => (targets[s] ?? 0) !== (initial[s] ?? 0))
      await Promise.all(changed.map((s) => api.setSalesTarget(s, year, targets[s] ?? 0)))
      setInitial({ ...targets })
      onToast(`Sales targets saved for ${year}`)
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Failed to save targets')
    } finally { setSaving(false) }
  }

  return (
    <div style={card}>
      <div style={cardTitle}>Annual sales targets — {year}</div>
      <div style={{ padding: '14px 20px 18px', fontSize: 13, color: '#3B3B52' }}>
        <div style={{ color: '#5C5C74', marginBottom: 12, lineHeight: 1.55 }}>
          Set the ฿ target per service line for {year}. The Home dashboard shows attainment
          (won / target) per service.
        </div>
        {SERVICE_LINES.map((s) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: SERVICE_COLORS[s], flex: 'none' }} />
            <span style={{ width: 72, fontWeight: 700 }}>{s}</span>
            <input type="number" min={0} step={100000}
              value={targets[s] ?? 0}
              onChange={(e) => setTargets({ ...targets, [s]: Math.max(0, Number(e.target.value) || 0) })}
              style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: 12.5 }} />
            <span style={{ fontSize: 11, color: '#8082A5', width: 30 }}>฿</span>
          </div>
        ))}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={save} disabled={!dirty || saving}
            style={{ ...primaryBtn, padding: '7px 16px', opacity: !dirty || saving ? 0.5 : 1, cursor: !dirty || saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save targets'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════ Calendar Sync (M365) ═══════════════════════ */

function CalendarSyncCard({ onToast }: { onToast: (msg: string) => void }) {
  const [accounts, setAccounts] = useState<CalendarAccountDto[] | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const reload = async () => {
    try {
      const [list, status] = await Promise.all([api.calendarAccounts(), api.calendarMicrosoftStatus()])
      setAccounts(list); setConfigured(status.configured)
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Failed to load calendar accounts')
    }
  }
  useEffect(() => { reload() }, [])

  const connect = async () => {
    setConnecting(true)
    try {
      const { url } = await api.calendarMicrosoftAuthorizeUrl()
      window.location.href = url
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Cannot start Microsoft consent flow')
      setConnecting(false)
    }
  }

  const connectStub = async () => {
    setConnecting(true)
    try {
      // Dev stub — bypasses OAuth so users can preview the sync UX end-to-end without
      // real Microsoft credentials. Backend rejects any non-"dev_stub" access token here.
      const stubId = `dev-stub-${Date.now()}`
      await api.linkCalendar({ provider: 'microsoft', externalId: stubId, email: 'demo@bluefishsolution.com', accessToken: 'dev_stub_token' })
      onToast('Dev stub account connected — click Sync now to import sample events')
      await reload()
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Stub connect failed')
    } finally { setConnecting(false) }
  }

  const syncNow = async (id: string) => {
    setBusyId(id)
    try {
      const res = await api.syncCalendar(id)
      onToast(`Imported ${res.imported} · skipped ${res.skipped}${res.errors.length ? ` · ${res.errors.length} error(s)` : ''}`)
      await reload()
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Sync failed')
    } finally { setBusyId(null) }
  }

  const disconnect = async (id: string, email: string) => {
    if (!window.confirm(`Disconnect ${email}? Activities already imported will remain.`)) return
    setBusyId(id)
    try {
      await api.disconnectCalendar(id)
      onToast('Calendar disconnected')
      await reload()
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Disconnect failed')
    } finally { setBusyId(null) }
  }

  return (
    <div style={card}>
      <div style={cardTitle}>Calendar sync — Microsoft 365</div>
      <div style={{ padding: '14px 20px 18px', fontSize: 13, color: '#3B3B52' }}>
        <div style={{ color: '#5C5C74', marginBottom: 12, lineHeight: 1.55 }}>
          Connect your Outlook calendar so meetings appear as Activities in the CRM. Runs pull the next 60 days.
          Two-way sync (CRM → Outlook) is not enabled in this build.
        </div>

        {configured === false && (
          <div style={{ background: '#FEF3E2', border: '1px solid #F0BA95', color: '#B4650A', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, marginBottom: 12 }}>
            Microsoft OAuth isn't configured on this server. Set <code>MICROSOFT_CLIENT_ID</code>, <code>SECRET</code>, and <code>TENANT_ID</code> in <code>apps/api/.env</code> to enable real connect. For preview, use the dev stub below.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={connect}
            disabled={!configured || connecting}
            style={{ ...primaryBtn, opacity: !configured || connecting ? 0.5 : 1, cursor: !configured || connecting ? 'not-allowed' : 'pointer' }}
            title={!configured ? 'Microsoft OAuth not configured' : 'Redirects to Microsoft consent screen'}
          >
            {connecting ? 'Redirecting…' : '+ Connect Microsoft 365'}
          </button>
          {configured === false && (
            <button
              type="button"
              onClick={connectStub}
              disabled={connecting}
              style={{ ...ghostBtn, opacity: connecting ? 0.5 : 1 }}
              title="Insert a stub account so the sync flow can be exercised without real credentials"
            >
              Connect (dev stub)
            </button>
          )}
        </div>

        {accounts === null && <div style={{ color: '#8082A5', fontSize: 12 }}>Loading…</div>}
        {accounts && accounts.length === 0 && (
          <div style={{ fontSize: 12.5, color: '#8082A5' }}>No connected accounts yet.</div>
        )}
        {accounts && accounts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accounts.map((a) => (
              <div key={a.id} style={{ border: '1px solid #E5E7F0', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ background: '#DDEAFB', color: '#1F5AC2', borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: 0.3 }}>{a.provider}</span>
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 180 }}>{a.email}</span>
                <span style={{ fontSize: 11, color: '#8082A5' }}>
                  {a.lastSyncedAt ? `synced ${new Date(a.lastSyncedAt).toLocaleString()}` : 'never synced'}
                </span>
                <button
                  type="button" onClick={() => syncNow(a.id)} disabled={busyId === a.id}
                  style={{ ...ghostBtn, padding: '6px 12px', fontSize: 12, opacity: busyId === a.id ? 0.5 : 1 }}
                >
                  {busyId === a.id ? 'Working…' : 'Sync now'}
                </button>
                <button
                  type="button" onClick={() => disconnect(a.id, a.email)} disabled={busyId === a.id}
                  style={{ background: 'transparent', border: 'none', color: '#C0392B', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: busyId === a.id ? 0.5 : 1 }}
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════ User Management ═══════════════════════ */

function UserManagementSection({ onToast }: { onToast: (msg: string) => void }) {
  const [users, setUsers] = useState<UserDto[]>([])
  const [roles, setRoles] = useState<RoleDto[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [editing, setEditing] = useState<UserDto | null>(null)

  const reload = async () => {
    setLoading(true); setErr(null)
    try {
      const [us, rs] = await Promise.all([api.users(), api.roles()])
      setUsers(us)
      setRoles(rs)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load users')
    } finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const grouped = useMemo(() => {
    const byDept = new Map<string, UserDto[]>()
    for (const u of users) {
      const key = u.department || 'Unassigned'
      if (!byDept.has(key)) byDept.set(key, [])
      byDept.get(key)!.push(u)
    }
    return [...byDept.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [users])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <div style={{ ...cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Users ({users.length})</span>
          <button style={primaryBtn} onClick={() => setShowInvite(true)}>+ Invite user</button>
        </div>
        {loading && <div style={{ padding: 20, color: '#8082A5' }}>Loading users…</div>}
        {err && <div style={{ ...errBox, margin: 16 }}>{err}</div>}
        {!loading && !err && (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Department</th>
                  <th style={thStyle}>Services</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {grouped.flatMap(([dept, rows]) => [
                  <tr key={`h-${dept}`}>
                    <td colSpan={7} style={{ background: '#F7F8FC', padding: '6px 14px', fontSize: 11, fontWeight: 700, color: '#5C5C74', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {dept}
                    </td>
                  </tr>,
                  ...rows.map((u) => (
                    <tr key={u.id} style={{ opacity: u.isActive === false ? 0.55 : 1 }}>
                      <td style={tdStyle}>{u.name}</td>
                      <td style={tdStyle}>{u.email}</td>
                      <td style={tdStyle}><RoleBadge role={u.role} /></td>
                      <td style={tdStyle}>{u.department ?? '—'}</td>
                      <td style={tdStyle}>
                        {ROLES_WITH_VIEW_ALL.has(u.role) ? (
                          <span title="Role has service:view_all — sees all services regardless of picker" style={{ background: '#E5F9F1', color: '#0E9C7E', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>
                            sees all
                          </span>
                        ) : u.services && u.services.length > 0 ? (
                          u.services.map((s) => <ServiceChip key={s} name={s} />)
                        ) : (
                          <span title="No services assigned — this rep will see nothing" style={{ background: '#FDECEA', color: '#C0392B', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>
                            none
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                          background: u.isActive === false ? '#FDECEA' : '#E5F9F1',
                          color:      u.isActive === false ? '#C0392B' : '#0E9C7E',
                        }}>{u.isActive === false ? 'Inactive' : 'Active'}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button style={linkBtn} onClick={() => setEditing(u)}>Edit</button>
                      </td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showInvite && (
        <InviteUserModal
          roles={roles}
          onClose={() => setShowInvite(false)}
          onCreated={() => { setShowInvite(false); onToast('User invited'); reload() }}
        />
      )}
      {editing && (
        <EditUserModal
          user={editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); onToast(msg); reload() }}
        />
      )}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, [string, string]> = {
    admin:         ['#EEE7FF', '#6C55E0'],
    sales_manager: ['#E7F0FF', '#2A6FDB'],
    sales_rep:     ['#E5F9F1', '#0E9C7E'],
    legal:         ['#FFF3E5', '#B4650A'],
    finance:       ['#FEEEEE', '#C0392B'],
    auditor:       ['#F0F0F5', '#5C5C74'],
    viewer:        ['#F0F0F5', '#8082A5'],
  }
  const [bg, fg] = colors[role] ?? ['#F0F0F5', '#5C5C74']
  return (
    <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8 }}>
      {role}
    </span>
  )
}

function ServiceScopeHint({ role }: { role?: string }) {
  if (!role) return null
  const seeAll = ROLES_WITH_VIEW_ALL.has(role)
  return (
    <div style={{ marginTop: 6, fontSize: 11, color: seeAll ? '#0E9C7E' : '#8888A0', lineHeight: 1.35 }}>
      {seeAll
        ? `Role "${role}" already has service:view_all — the picker is informational only; this user sees every service.`
        : 'Sales rep will only see customers, opportunities, leads, quotations and contracts that fall inside these services. Leave empty and they see nothing.'}
    </div>
  )
}

function ServiceChip({ name }: { name: string }) {
  const colors: Record<string, [string, string]> = {
    'Box':   ['#E7F0FF', '#2A6FDB'],
    '3S':    ['#E5F9F1', '#0E9C7E'],
    '3D':    ['#FFF3E5', '#B4650A'],
    'AI&RPA':['#EEE7FF', '#6C55E0'],
  }
  const [bg, fg] = colors[name] ?? ['#F0F0F5', '#5C5C74']
  return (
    <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 7, marginRight: 4 }}>
      {name}
    </span>
  )
}

function ServiceCheckboxes({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {SERVICE_LINES.map((s) => {
        const on = selected.includes(s)
        return (
          <label key={s} style={{
            cursor: 'pointer', border: `1px solid ${on ? '#2A6FDB' : '#E5E7F0'}`,
            background: on ? '#E7F0FF' : '#fff', color: on ? '#2A6FDB' : '#5C5C74',
            padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <input
              type="checkbox" checked={on}
              onChange={() => onChange(on ? selected.filter((x) => x !== s) : [...selected, s])}
              style={{ margin: 0 }}
            />
            {s}
          </label>
        )
      })}
    </div>
  )
}

function InviteUserModal({ roles, onClose, onCreated }: { roles: RoleDto[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<CreateUserDto>({ email: '', name: '', role: 'viewer', password: '', department: '', services: [] })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      await api.createUser({ ...form, department: form.department || null })
      onCreated()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to invite user')
    } finally { setBusy(false) }
  }

  return (
    <ModalShell title="Invite user" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Name">
          <input required style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <input required type="email" style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Role">
          <select style={inputStyle} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roles.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <input style={inputStyle} value={form.department ?? ''} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </Field>
        <Field label="Services / Products">
          <ServiceCheckboxes selected={form.services ?? []} onChange={(next) => setForm({ ...form, services: next })} />
          <ServiceScopeHint role={form.role} />
        </Field>
        <Field label="Initial password (≥ 8 chars, upper/lower/digit)">
          <input required type="text" style={inputStyle} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {err && <div style={errBox}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? 'Inviting…' : 'Invite user'}</button>
          <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
        </div>
      </form>
    </ModalShell>
  )
}

function EditUserModal({ user, roles, onClose, onSaved }: { user: UserDto; roles: RoleDto[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const { user: me } = useAuth()
  const isSelf = me?.id === user.id
  const [form, setForm] = useState<UpdateUserDto>({
    name: user.name, role: user.role,
    department: user.department ?? '',
    services: user.services ?? [],
    isActive: user.isActive ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pwd, setPwd] = useState('')

  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      await api.updateUser(user.id, { ...form, department: form.department || null })
      onSaved('User updated')
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to update user')
    } finally { setBusy(false) }
  }

  const resetPwd = async () => {
    if (pwd.length < 8) { setErr('Password must be at least 8 chars'); return }
    setBusy(true); setErr(null)
    try {
      await api.adminResetPassword(user.id, pwd)
      setPwd('')
      onSaved(`Password reset for ${user.email}`)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Reset failed')
    } finally { setBusy(false) }
  }

  const deactivate = async () => {
    if (!window.confirm(`Deactivate ${user.name}? They will not be able to sign in.`)) return
    setBusy(true); setErr(null)
    try {
      await api.deactivateUser(user.id)
      onSaved(`${user.name} deactivated`)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Deactivation failed')
    } finally { setBusy(false) }
  }

  return (
    <ModalShell title={`Edit — ${user.name}`} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Name">
          <input required style={inputStyle} value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email"><input disabled style={{ ...inputStyle, background: '#F7F8FC' }} value={user.email} /></Field>
        <Field label="Role">
          <select style={inputStyle} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roles.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <input style={inputStyle} value={form.department ?? ''} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </Field>
        <Field label="Services / Products">
          <ServiceCheckboxes selected={form.services ?? []} onChange={(next) => setForm({ ...form, services: next })} />
          <ServiceScopeHint role={form.role} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3B3B52' }}>
          <input type="checkbox" checked={form.isActive ?? true} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} disabled={isSelf} />
          Active {isSelf && <span style={{ color: '#8082A5', fontSize: 11 }}>(cannot deactivate yourself)</span>}
        </label>
        {err && <div style={errBox}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save changes'}</button>
          <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
        </div>
      </form>

      <div style={{ height: 1, background: '#F2F3F9', margin: '16px 0' }} />

      <div style={{ fontSize: 13, fontWeight: 700, color: '#3B3B52', marginBottom: 8 }}>Reset password</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="text" placeholder="New password" value={pwd} onChange={(e) => setPwd(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <button type="button" onClick={resetPwd} disabled={busy || pwd.length < 8} style={{ ...primaryBtn, opacity: busy || pwd.length < 8 ? 0.5 : 1 }}>Reset</button>
      </div>

      {!isSelf && (
        <>
          <div style={{ height: 1, background: '#F2F3F9', margin: '16px 0' }} />
          <button type="button" onClick={deactivate} disabled={busy} style={dangerBtn}>Deactivate user</button>
        </>
      )}
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,45,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ width: 480, maxWidth: '100%', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F2F3F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: '#8082A5' }}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#5C5C74', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span>
      {children}
    </label>
  )
}

/* ═══════════════════════ Role Matrix ═══════════════════════ */

function RoleMatrixSection() {
  const [roles, setRoles] = useState<RoleDto[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api.roles()
      .then(setRoles)
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Failed to load roles'))
      .finally(() => setLoading(false))
  }, [])

  const allPerms = useMemo(() => {
    const set = new Set<string>()
    roles.forEach((r) => r.permissions.forEach((p) => set.add(p)))
    return [...set].sort()
  }, [roles])

  const groupedPerms = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const p of allPerms) {
      const entity = p.split(':')[0]
      if (!groups.has(entity)) groups.set(entity, [])
      groups.get(entity)!.push(p)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [allPerms])

  if (loading) return <div style={{ color: '#8082A5', padding: 12 }}>Loading role matrix…</div>
  if (err) return <div style={errBox}>{err}</div>

  return (
    <div style={{ ...card, maxWidth: '80%' }}>
      <div style={cardTitle}>Role × Permission Matrix</div>
      <div style={{ padding: 16, fontSize: 12, color: '#5C5C74' }}>
        Each column is a role that can be assigned to a user. A ✓ means the role grants that permission.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ ...tableStyle, minWidth: 576 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, minWidth: 200 }}>Permission</th>
              {roles.map((r) => (
                <th key={r.name} style={{ ...thStyle, textAlign: 'center', verticalAlign: 'top' }}>
                  <div>{r.name}</div>
                  <div style={{
                    fontWeight: 400, fontSize: 10, color: '#8082A5',
                    whiteSpace: 'normal', lineHeight: 1.25,
                    maxWidth: 90, margin: '2px auto 0',
                    display: '-webkit-box', WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 2, overflow: 'hidden',
                    textTransform: 'none', letterSpacing: 0,
                  }}>
                    {r.description}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedPerms.flatMap(([entity, perms]) => [
              <tr key={`ge-${entity}`}>
                <td colSpan={roles.length + 1} style={{ background: '#F7F8FC', padding: '6px 14px', fontSize: 11, fontWeight: 700, color: '#5C5C74', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {entity}
                </td>
              </tr>,
              ...perms.map((perm) => (
                <tr key={perm}>
                  <td style={{ ...tdStyle, fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif", fontSize: 14, fontWeight: 500 }}>{perm}</td>
                  {roles.map((r) => (
                    <td key={r.name} style={{ ...tdStyle, textAlign: 'center', color: r.permissions.includes(perm) ? '#0E9C7E' : '#D5D8E6', fontWeight: 700 }}>
                      {r.permissions.includes(perm) ? '✓' : '·'}
                    </td>
                  ))}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ═══════════════════════ Existing security cards ═══════════════════════ */

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

/* ═══════════════════════ Inbox channels section ═══════════════════════ */

const CHANNEL_META: Record<string, { color: string; description: string }> = {
  'LINE OA':  { color: '#06C755', description: 'Bluefish official LINE Business channel' },
  Messenger:  { color: '#0084FF', description: 'Facebook Page Messenger integration' },
  Website:    { color: '#2A6FDB', description: 'Contact form on www.bluefishsolution.com' },
  Email:      { color: '#5C5C74', description: 'Inbound email parse (Postmark / SendGrid)' },
}

function InboxChannelsSection({ onToast }: { onToast: (m: string) => void }) {
  const [rows, setRows] = useState<ChannelIntegrationDto[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api.channelIntegrations())
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Failed to load channels')
    } finally { setLoading(false) }
  }, [onToast])

  useEffect(() => { void reload() }, [reload])

  return (
    <div style={card}>
      <div style={cardTitle}>Inbox channels</div>
      <div style={{ padding: '4px 20px 6px', color: '#5C5C74', fontSize: 12.5 }}>
        Configure the credentials for each Inbox channel. Secrets are encrypted at rest;
        rotate anytime — the change takes effect on the next incoming message.
      </div>
      {loading && <div style={{ padding: 16, color: '#8888A0', fontSize: 12.5 }}>Loading…</div>}
      {!loading && (
        <div style={{ padding: '4px 20px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          {rows.map((row) => (
            <ChannelIntegrationCard key={row.channel} row={row} onSaved={reload} onToast={onToast} />
          ))}
        </div>
      )}
    </div>
  )
}

function ChannelIntegrationCard({ row, onSaved, onToast }: {
  row: ChannelIntegrationDto
  onSaved: () => void
  onToast: (m: string) => void
}) {
  const [editing, setEditing] = useState(false)
  // Empty strings until edited — the UI never receives real secret values back
  // from the server, so a save only replaces fields the user touches.
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const meta = CHANNEL_META[row.channel] ?? { color: '#5C5C74', description: '' }
  const connected = row.hasCredentials && row.isActive
  const statusColor = connected ? '#0E9C7E' : row.hasCredentials ? '#B4650A' : '#8888A0'
  const statusLabel = connected ? 'Connected' : row.hasCredentials ? 'Disabled' : 'Not configured'

  const startEdit = () => {
    setValues({})     // fresh — user only fills what they want to change
    setEditing(true)
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      await api.upsertChannelIntegration(row.channel, { values })
      onToast(`${row.channel} saved`)
      setEditing(false)
      setValues({})
      onSaved()
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const toggleActive = async () => {
    try {
      await api.upsertChannelIntegration(row.channel, { values: {}, isActive: !row.isActive })
      onToast(`${row.channel} ${!row.isActive ? 'enabled' : 'disabled'}`)
      onSaved()
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Toggle failed')
    }
  }

  const disconnect = async () => {
    if (!row.hasCredentials) return
    if (!window.confirm(`Remove ${row.channel} credentials?`)) return
    try {
      await api.deleteChannelIntegration(row.channel)
      onToast(`${row.channel} disconnected`)
      onSaved()
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Delete failed')
    }
  }

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(row.webhookUrl); onToast('Webhook URL copied') }
    catch { onToast(`URL: ${row.webhookUrl}`) }
  }

  return (
    <div style={{
      border: '1px solid #E5E7F0', borderRadius: 12, background: '#fff',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid #F2F3F9', background: hexToRgbaLocal(meta.color, 0.06),
      }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: meta.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
          {row.channel === 'LINE OA' ? 'L' : row.channel === 'Messenger' ? 'M' : row.channel === 'Website' ? 'W' : '✉'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{row.channel}</div>
          <div style={{ fontSize: 10.5, color: '#8082A5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {meta.description}
          </div>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 10.5, fontWeight: 700, color: statusColor,
          padding: '3px 10px', borderRadius: 999,
          background: hexToRgbaLocal(statusColor, 0.12),
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
          {statusLabel}
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#5C5C74', letterSpacing: '.03em', textTransform: 'uppercase', marginBottom: 4 }}>Webhook URL</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <code style={{ flex: 1, background: '#F7F8FC', border: '1px solid #E5E7F0', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: '#3B3B52', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.webhookUrl}</code>
            <button type="button" onClick={copyUrl} style={ghostBtnSm}>Copy</button>
          </div>
        </div>

        {row.fields.map((f) => (
          <div key={f.key}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#5C5C74', letterSpacing: '.03em', textTransform: 'uppercase', marginBottom: 4 }}>
              {f.label}{f.required ? ' *' : ''}
            </div>
            {editing ? (
              <input
                type={f.type === 'secret' ? 'password' : 'text'}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={row.maskedValues[f.key] || (f.hint ?? '')}
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              />
            ) : (
              <div style={{ fontSize: 12.5, color: row.maskedValues[f.key] ? '#3B3B52' : '#8082A5', fontFamily: f.type === 'secret' ? "'IBM Plex Mono', monospace" : 'inherit' }}>
                {row.maskedValues[f.key] || <em>not set</em>}
              </div>
            )}
            {f.hint && editing && (
              <div style={{ fontSize: 10.5, color: '#8082A5', marginTop: 3 }}>{f.hint}</div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {editing ? (
            <>
              <button type="button" onClick={save} disabled={saving} style={{ ...primaryBtnSm, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setValues({}) }} style={ghostBtnSm}>Cancel</button>
            </>
          ) : (
            <>
              <button type="button" onClick={startEdit} style={primaryBtnSm}>
                {row.hasCredentials ? 'Rotate / Edit' : 'Configure'}
              </button>
              {row.hasCredentials && (
                <button type="button" onClick={toggleActive} style={ghostBtnSm}>
                  {row.isActive ? 'Disable' : 'Enable'}
                </button>
              )}
              {row.hasCredentials && (
                <button type="button" onClick={disconnect} style={dangerBtnSm}>Disconnect</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function hexToRgbaLocal(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const primaryBtnSm: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const ghostBtnSm: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
const dangerBtnSm: CSSProperties = { background: '#fff', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }

/* ═══════════════════════ styles ═══════════════════════ */

const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14 }
const cardTitle: CSSProperties = { padding: '16px 20px', borderBottom: '1px solid #F2F3F9', fontSize: 14, fontWeight: 700 }
const inputStyle: CSSProperties = { border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const dangerBtn: CSSProperties = { background: '#fff', color: '#C0392B', border: '1px solid #E5B4AC', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const ghostBtn: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const linkBtn: CSSProperties = { background: 'transparent', border: 'none', color: '#2A6FDB', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }
const errBox: CSSProperties = { background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }
const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const thStyle: CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#5C5C74', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 14px', borderBottom: '1px solid #F2F3F9', background: '#fff' }
const tdStyle: CSSProperties = { padding: '10px 14px', borderBottom: '1px solid #F5F6FB', color: '#3B3B52' }
