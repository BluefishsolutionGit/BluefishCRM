import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ActivityDto, ExecutiveDashboardDto, ForecastDto, UserDto } from '@bluefish/shared'
import { SERVICE_LINES } from '@bluefish/shared'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { isPlatformAuthenticatorAvailable, isWebAuthnSupported, registerBiometric } from '../lib/webauthnClient'

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : n >= 1_000 ? '฿' + Math.round(n / 1e3) + 'K' : '฿' + Math.round(n)

/**
 * View scope for the home mini-dashboard.
 * - 'me'       — only the user's own deals (byRep row)
 * - 'service'  — aggregated over the user's primary service line
 * - 'all'      — org-wide (only available to service:view_all roles)
 */
type Scope = 'me' | 'service' | 'all'

export default function MobileHome() {
  const [exec, setExec] = useState<ExecutiveDashboardDto | null>(null)
  const [serviceExec, setServiceExec] = useState<ExecutiveDashboardDto | null>(null)
  const [forecast, setForecast] = useState<ForecastDto | null>(null)
  const [today, setToday] = useState<ActivityDto[]>([])
  const [salesUsers, setSalesUsers] = useState<UserDto[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioBusy, setBioBusy] = useState(false)
  const [bioDismissed, setBioDismissed] = useState(() => localStorage.getItem('bluefish.bioDismissedAt') !== null)
  const { user, hasPermission } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const canSeeAll = hasPermission('service:view_all')
  const myServices = user?.services ?? []

  const [activeService, setActiveService] = useState<string>(() => myServices[0] ?? '')

  // The rep whose numbers appear in the 'me' scope. Sales reps stay locked on
  // themselves; managers/admins can pick any rep from the picker sheet.
  const [activeRepId, setActiveRepId] = useState<string>(user?.id ?? '')

  const [scope, setScope] = useState<Scope>(() => canSeeAll ? 'all' : (myServices[0] ? 'service' : 'me'))

  useEffect(() => {
    if (!activeService && myServices[0]) setActiveService(myServices[0])
  }, [myServices, activeService])
  useEffect(() => {
    if (!activeRepId && user?.id) setActiveRepId(user.id)
  }, [user?.id, activeRepId])

  useEffect(() => {
    api.forecast().then(setForecast).catch(() => {})
    api.execDashboard().then(setExec).catch(() => {})
    if (isWebAuthnSupported()) {
      void isPlatformAuthenticatorAvailable().then(setBioAvailable)
    }
    // Managers/admins get a picker of sales reps; only fetch when we'll use it.
    if (canSeeAll) {
      api.users()
        .then((rows) => setSalesUsers(rows.filter((u) => u.role === 'sales_rep' || u.role === 'sales_manager')))
        .catch(() => setSalesUsers([]))
    }
  }, [user, canSeeAll])

  // TODAY list follows whichever rep is being viewed in 'me' scope — so a
  // manager peeking at a specific rep sees that rep's day, not their own.
  useEffect(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    const ownerId = scope === 'me' ? activeRepId : user?.id
    if (!ownerId) return
    api.activities({ from: start, to: end, ownerId }).then(setToday).catch(() => {})
  }, [user?.id, activeRepId, scope])

  // Fetch the service-filtered exec dashboard whenever the user picks a new
  // service chip; skip if scope isn't 'service' to save a network call.
  useEffect(() => {
    if (scope !== 'service' || !activeService) { setServiceExec(null); return }
    api.execDashboard({ serviceOrProduct: activeService }).then(setServiceExec).catch(() => setServiceExec(null))
  }, [scope, activeService])

  const enableBiometric = async () => {
    if (bioBusy) return
    setBioBusy(true)
    const res = await registerBiometric(`${navigator.userAgent.split(') ')[0].split(' (').pop() ?? 'this device'}`)
    setBioBusy(false)
    if (res.ok) { toast('Biometric enabled — sign in with Face/Touch next time'); setBioDismissed(true); localStorage.setItem('bluefish.bioDismissedAt', String(Date.now())) }
    else toast(res.reason)
  }
  const dismissBio = () => {
    setBioDismissed(true); localStorage.setItem('bluefish.bioDismissedAt', String(Date.now()))
  }

  // Compute what the KPI card shows for the current scope. Each scope maps to
  // a different data source; falling back to 'me' if a source hasn't loaded.
  const scoped = useMemo(() => {
    if (scope === 'all') {
      if (!forecast) return null
      const activeReps = forecast.byRep.filter((r) => r.closed + r.pipeline + r.commit + r.bestCase > 0).length
      return {
        title: 'Overall performance',
        subtitle: `Team of ${activeReps || forecast.byRep.length}`,
        closed: forecast.closed,
        pipeline: forecast.pipeline,
        weighted: forecast.weighted,
        target: forecast.quota,
        attainmentPct: forecast.attainmentPct,
      }
    }
    if (scope === 'service') {
      if (!serviceExec) return null
      // Personal target share against the service exec — until per-user targets
      // land, use total service revenue as the "reference" so the bar reads
      // as "MTD progress" not attainment.
      return {
        title: activeService,
        subtitle: 'Whole service',
        closed: serviceExec.revenueMTD,
        pipeline: serviceExec.openPipeline,
        weighted: 0,   // exec dashboard doesn't emit a weighted total; hide.
        target: serviceExec.revenueYTD,       // YTD revenue as informal reference
        attainmentPct: serviceExec.revenueYTD > 0
          ? Math.round((serviceExec.revenueMTD / (serviceExec.revenueYTD / 12)) * 100)  // this-month vs monthly avg
          : 0,
      }
    }
    // scope === 'me' — self OR any rep picked by a manager
    if (!forecast) return null
    const targetId = activeRepId || user?.id
    const rep = forecast.byRep.find((r) => r.ownerId === targetId)
    const share = forecast.byRep.length > 0 ? forecast.quota / forecast.byRep.length : 0
    const closed = rep?.closed ?? 0
    const viewingSelf = targetId === user?.id
    return {
      title: viewingSelf ? 'Your numbers' : (rep?.ownerName ?? 'Selected rep'),
      subtitle: viewingSelf ? 'Only your deals' : 'By rep',
      closed,
      pipeline: rep?.pipeline ?? 0,
      weighted: (rep?.commit ?? 0) + (rep?.bestCase ?? 0),
      target: share,
      attainmentPct: share > 0 ? Math.round((closed / share) * 100) : 0,
    }
  }, [scope, forecast, serviceExec, activeService, activeRepId, user])

  // Label for the last chip depends on role AND selection:
  //   sales rep                             → "Only me"
  //   exec viewing self                     → "Only me ▾" (picker)
  //   exec viewing another rep              → "<rep name> ▾"
  const repChipLabel = useMemo(() => {
    if (!canSeeAll) return 'Only me'
    if (activeRepId && activeRepId !== user?.id) {
      const picked = salesUsers.find((u) => u.id === activeRepId)
      return `${picked?.name ?? 'Selected rep'} ▾`
    }
    return 'Only me ▾'
  }, [canSeeAll, activeRepId, user?.id, salesUsers])

  const scopeChips = useMemo(() => {
    const out: Array<{ id: Scope; label: string; svc?: string; mine?: boolean; openPicker?: boolean }> = []
    if (canSeeAll) out.push({ id: 'all', label: 'Overall' })
    const mySet = new Set(myServices)
    for (const s of SERVICE_LINES) {
      out.push({ id: 'service', label: s, svc: s, mine: mySet.has(s) })
    }
    // Managers/admins get a picker; sales reps get a plain "Only me" that
    // clamps to their own id.
    out.push({ id: 'me', label: repChipLabel, openPicker: canSeeAll })
    return out
  }, [canSeeAll, myServices, repChipLabel])

  const isChipActive = (chip: { id: Scope; svc?: string }) => {
    if (chip.id !== scope) return false
    if (chip.id === 'service') return chip.svc === activeService
    return true
  }

  const handleRepChipClick = (openPicker?: boolean) => {
    if (openPicker) {
      setPickerOpen(true)
      return
    }
    // Sales reps land here — lock to self and switch scope.
    setActiveRepId(user?.id ?? '')
    setScope('me')
  }

  const gradient = scope === 'all'
    ? 'linear-gradient(135deg,#2E1A6B,#4A3AB8)'
    : scope === 'service'
    ? 'linear-gradient(135deg,#0E7B7B,#2AB1A8)'
    : 'linear-gradient(135deg,#2A6FDB,#4A88F0)'

  return (
    <div style={{ padding: '16px 18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: '#5C5C74' }}>
        {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })} · {today.length} activit{today.length === 1 ? 'y' : 'ies'} today
      </div>

      {/* ── Scope selector — Overall / per-service / "Only me" ── */}
      {scopeChips.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginRight: -16, paddingRight: 16 }}>
          {scopeChips.map((chip) => {
            const active = isChipActive(chip)
            return (
              <div
                key={`${chip.id}:${chip.svc ?? ''}`}
                onClick={() => {
                  if (chip.id === 'me') { handleRepChipClick(chip.openPicker); return }
                  if (chip.id === 'service' && chip.svc) setActiveService(chip.svc)
                  setScope(chip.id)
                }}
                style={{
                  flex: 'none', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: active ? '#2E1A6B' : '#fff',
                  color: active ? '#fff' : '#5C5C74',
                  border: `1px solid ${active ? 'transparent' : '#E5E7F0'}`,
                  borderRadius: 999, padding: '5px 12px', fontSize: 11.5, fontWeight: 700,
                  transition: 'all .15s',
                }}
              >
                {chip.label}
                {chip.mine && (
                  <span
                    title="Your service"
                    style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: active ? '#22C9A3' : '#2A6FDB',
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Personal / service / overall mini-dashboard ── */}
      {scoped && (
        <div style={{
          background: gradient,
          color: '#fff', borderRadius: 16, padding: '14px 16px',
          boxShadow: '0 10px 24px -12px rgba(30,20,80,.45)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.9 }}>{scoped.title}</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 10.5, opacity: 0.8 }}>{scoped.subtitle}</div>
          </div>

          {/* Attainment gauge */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 800 }}>{fmt(scoped.closed)}</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>{scope === 'service' ? 'MTD' : 'closed'}</div>
              <div style={{ flex: 1 }} />
              {scoped.target > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{scoped.attainmentPct}%</div>
                  <div style={{ fontSize: 10.5, opacity: 0.85 }}>
                    {scope === 'service' ? 'of monthly avg' : `of ${fmt(scoped.target)}`}
                  </div>
                </>
              )}
            </div>
            {scoped.target > 0 && (
              <div style={{ marginTop: 6, background: 'rgba(255,255,255,.18)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, scoped.attainmentPct))}%`,
                  height: '100%',
                  background: scoped.attainmentPct >= 100 ? '#22C9A3' : scoped.attainmentPct >= 60 ? '#F7D14A' : '#fff',
                  transition: 'width .3s',
                }} />
              </div>
            )}
          </div>

          {/* Inline stats row */}
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <MiniStat label="Pipeline" value={fmt(scoped.pipeline)} />
            {scoped.weighted > 0 && <MiniStat label="Weighted" value={fmt(scoped.weighted)} />}
            <MiniStat label="Tasks" value={String(today.length)} />
          </div>
        </div>
      )}

      {/* ── Extra org-wide cards for higher-level users ── */}
      {scope === 'all' && exec && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <FlatCard label="New leads (7d)" value={String(exec.newLeadsPeriod)} accent="#2A6FDB" />
          <FlatCard label="Deals won (MTD)" value={String(exec.dealsWonPeriod)} accent="#0E9C7E" />
          <FlatCard label="Active contracts" value={String(exec.activeContracts)} accent="#6C55E0" />
          <FlatCard label="Pending approvals" value={String(exec.pendingApprovals)} accent="#B4650A" />
        </div>
      )}

      {/* ── Service-scoped extras ── */}
      {scope === 'service' && serviceExec && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <FlatCard label="New leads (7d)" value={String(serviceExec.newLeadsPeriod)} accent="#0E9C7E" />
          <FlatCard label="Deals won (MTD)" value={String(serviceExec.dealsWonPeriod)} accent="#22C9A3" />
          <FlatCard label="Avg deal size" value={fmt(serviceExec.avgDealSize)} accent="#2A6FDB" />
          <FlatCard label="Lead conv." value={`${serviceExec.leadConversionRate}%`} accent="#B4650A" />
        </div>
      )}

      {bioAvailable && !bioDismissed && (
        <div style={{
          background: '#F4F1FD', border: '1px solid #EAE7F7', borderRadius: 12,
          padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ fontSize: 22 }}>🔐</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2E1A6B' }}>Sign in faster with Face / Touch ID</div>
            <div style={{ fontSize: 11, color: '#5B3FC4', marginTop: 2 }}>Enable biometric login on this device.</div>
          </div>
          <div onClick={enableBiometric} style={{ background: '#4A3AB8', color: '#fff', fontSize: 11.5, fontWeight: 800, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', opacity: bioBusy ? 0.6 : 1 }}>{bioBusy ? '…' : 'Enable'}</div>
          <div onClick={dismissBio} style={{ color: '#8888A0', fontSize: 14, padding: '2px 4px', cursor: 'pointer' }}>✕</div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8888A0', letterSpacing: '.06em', marginBottom: 8 }}>TODAY</div>
        {today.length === 0 && <div style={{ ...card, padding: 18, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No activities scheduled.</div>}
        {today.map((a) => (
          <div key={a.id} onClick={() => navigate(`/m/tasks/${a.id}`)} style={{ ...card, padding: '12px 14px', marginBottom: 8, cursor: 'pointer' }}>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
              <div style={{ width: 8, height: 8, borderRadius: 3, background: typeColor(a.type) }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{a.title}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#5C5C74' }}>{new Date(a.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            {a.customerName && <div style={{ fontSize: 11.5, color: '#5C5C74', marginTop: 4, paddingLeft: 17 }}>{a.customerName}</div>}
          </div>
        ))}
      </div>

      {pickerOpen && (
        <RepPickerSheet
          currentUserId={user?.id ?? ''}
          activeRepId={activeRepId}
          reps={salesUsers}
          forecast={forecast}
          onPick={(id) => {
            setActiveRepId(id)
            setScope('me')
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * Bottom-sheet list of sales reps for exec/manager users to pivot the "me"
 * scope onto any rep. Shows closed / pipeline next to each name so the
 * manager can eyeball who to drill into first.
 */
function RepPickerSheet({
  currentUserId, activeRepId, reps, forecast, onPick, onClose,
}: {
  currentUserId: string
  activeRepId: string
  reps: UserDto[]
  forecast: ForecastDto | null
  onPick: (id: string) => void
  onClose: () => void
}) {
  const byRepMap = useMemo(() => {
    const m = new Map<string, { closed: number; pipeline: number }>()
    for (const r of forecast?.byRep ?? []) m.set(r.ownerId, { closed: r.closed, pipeline: r.pipeline })
    return m
  }, [forecast])

  // Rank reps by closed desc so top performers surface first — matches how a
  // manager typically wants to scan the team.
  const ranked = useMemo(() => [...reps].sort((a, b) => {
    const A = byRepMap.get(a.id)?.closed ?? 0
    const B = byRepMap.get(b.id)?.closed ?? 0
    return B - A
  }), [reps, byRepMap])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,45,.55)', zIndex: 90, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, background: '#fff',
        borderRadius: '18px 18px 0 0', padding: '10px 16px 20px',
        maxHeight: '82vh', overflowY: 'auto',
      }}>
        <div style={{ width: 40, height: 4, background: '#D0D0DF', borderRadius: 2, margin: '4px auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, flex: 1 }}>View by sales rep</div>
          <div onClick={onClose} style={{ color: '#8888A0', fontSize: 18, cursor: 'pointer', padding: '2px 6px' }}>✕</div>
        </div>

        {/* "Myself" quick option — pins to the current viewer's id */}
        <RepRow
          name="Myself"
          hint="Only your deals"
          selected={activeRepId === currentUserId}
          accent="#2A6FDB"
          onClick={() => onPick(currentUserId)}
          numbers={byRepMap.get(currentUserId)}
        />
        <div style={{ height: 8 }} />

        {ranked.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 12.5 }}>No sales reps to show.</div>
        )}
        {ranked.map((r) => (
          <RepRow
            key={r.id}
            name={r.name}
            hint={r.role === 'sales_manager' ? 'Sales manager' : 'Sales rep'}
            selected={activeRepId === r.id && activeRepId !== currentUserId}
            accent="#5B93E6"
            onClick={() => onPick(r.id)}
            numbers={byRepMap.get(r.id)}
          />
        ))}
      </div>
    </div>
  )
}

function RepRow({ name, hint, selected, accent, numbers, onClick }: {
  name: string; hint: string; selected: boolean; accent: string
  numbers?: { closed: number; pipeline: number }
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 11, cursor: 'pointer',
        border: `1px solid ${selected ? accent : '#E5E7F0'}`,
        background: selected ? '#EEF3FC' : '#fff',
        marginBottom: 6,
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: selected ? accent : '#F2F3F9',
        color: selected ? '#fff' : '#3B3B52',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11.5, fontWeight: 800,
      }}>
        {name.split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontSize: 10.5, color: '#8888A0' }}>{hint}</div>
      </div>
      {numbers && (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 12, fontWeight: 800, color: '#0E9C7E' }}>
            {numbers.closed >= 1_000_000 ? `฿${(numbers.closed / 1e6).toFixed(1)}M` : `฿${Math.round(numbers.closed / 1e3)}K`}
          </div>
          <div style={{ fontSize: 10, color: '#5C5C74' }}>
            pipe {numbers.pipeline >= 1_000_000 ? `฿${(numbers.pipeline / 1e6).toFixed(1)}M` : `฿${Math.round(numbers.pipeline / 1e3)}K`}
          </div>
        </div>
      )}
    </div>
  )
}

function typeColor(t: string): string {
  const map: Record<string, string> = { meeting: '#2A6FDB', call: '#1F5AC2', visit: '#B4650A', demo: '#6C55E0', task: '#0E9C7E', follow_up: '#7C3AED', email: '#8888A0' }
  return map[t] ?? '#8888A0'
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9.5, opacity: 0.85, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function FlatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderLeft: `3px solid ${accent}`, borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 800, marginTop: 2, color: '#1E1E30' }}>{value}</div>
    </div>
  )
}

const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13 }
