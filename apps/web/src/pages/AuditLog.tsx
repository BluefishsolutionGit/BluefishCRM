import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { AuditLogDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

const ENTITY_COLORS: Record<string, string> = {
  customer: '#2A6FDB', contact: '#1F5AC2', lead: '#B4650A',
  opportunity: '#6C55E0', activity: '#0E9C7E', quotation: '#7C3AED',
  contract: '#2E1A6B', document: '#8888A0', user: '#C0392B',
  thread: '#06C755', competitor: '#D2601A', competitor_contract: '#D2601A',
  competitor_contracts: '#D2601A', quotation_line: '#7C3AED',
}

const ACTION_COLOR = (a: string): string => {
  if (a.endsWith('.delete') || a.includes('.reject')) return '#C0392B'
  if (a.endsWith('.create') || a.endsWith('.push') || a.endsWith('.send')) return '#0E9C7E'
  if (a.endsWith('.update') || a.endsWith('.status_change')) return '#B4650A'
  if (a.includes('.approve')) return '#5B3FC4'
  return '#5C5C74'
}

export default function AuditLog() {
  const [rows, setRows] = useState<AuditLogDto[]>([])
  const [loading, setLoading] = useState(true)
  const [entity, setEntity] = useState<string>('')
  const [actionFilter, setActionFilter] = useState<string>('')
  const [userFilter, setUserFilter] = useState<string>('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const toast = useToast()
  const { hasPermission } = useAuth()

  const canRead = hasPermission('audit:read')

  const load = () => {
    setLoading(true)
    api.auditLogs({ entity: entity || undefined, limit: 200 })
      .then(setRows)
      .catch((e) => toast(e instanceof ApiError ? e.message : 'Load failed'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (canRead) load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entity, canRead])

  const filtered = useMemo(() => rows.filter((r) => {
    if (actionFilter && !r.action.toLowerCase().includes(actionFilter.toLowerCase())) return false
    if (userFilter && !(r.user?.name.toLowerCase().includes(userFilter.toLowerCase()) || r.user?.email.toLowerCase().includes(userFilter.toLowerCase()))) return false
    return true
  }), [rows, actionFilter, userFilter])

  const entityOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => { if (r.entity) set.add(r.entity) })
    return Array.from(set).sort()
  }, [rows])

  if (!canRead) {
    return <div style={{ padding: 40, color: '#C0392B', fontSize: 14 }}>You do not have permission to view the audit trail.</div>
  }

  return (
    <div style={{ padding: '22px 24px', height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 20, fontWeight: 700, flex: 1 }}>Audit trail</div>
        <div style={{ fontSize: 12, color: '#5C5C74' }}>{filtered.length} events · latest first</div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={entity} onChange={(e) => setEntity(e.target.value)} style={inp}>
          <option value="">All entities</option>
          {entityOptions.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <input placeholder="Filter by action (e.g. approve, delete)" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={inp} />
        <input placeholder="Filter by user name / email" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} style={inp} />
        <div onClick={load} style={{ ...btn, background: '#2A6FDB', color: '#fff' }}>Refresh</div>
      </div>

      {loading && <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {!loading && filtered.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No audit events match.</div>}

      <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ ...gridHead, padding: '10px 14px', borderBottom: '1px solid #E5E7F0', background: '#FAFBFD' }}>
          <div>When</div><div>User</div><div>Entity</div><div>Action</div><div>Entity ID</div><div>IP</div>
        </div>
        {filtered.map((r) => {
          const open = expanded === r.id
          return (
            <div key={r.id} style={{ borderBottom: '1px solid #F1F1F5' }}>
              <div onClick={() => setExpanded(open ? null : r.id)} style={{ ...gridRow, padding: '10px 14px', cursor: 'pointer' }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#5C5C74' }}>{new Date(r.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                <div style={{ fontSize: 12.5 }}>{r.user?.name ?? <span style={{ color: '#8888A0', fontStyle: 'italic' }}>system</span>}</div>
                <div>
                  {r.entity ? (
                    <span style={{ background: '#F1F1F5', color: ENTITY_COLORS[r.entity] ?? '#5C5C74', padding: '2px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 700 }}>{r.entity}</span>
                  ) : <span style={{ color: '#8888A0' }}>—</span>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: ACTION_COLOR(r.action) }}>{r.action}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: '#8888A0' }}>{r.entityId?.slice(-8) ?? '—'}</div>
                <div style={{ fontSize: 11, color: '#8888A0' }}>{r.ip ?? '—'}</div>
              </div>
              {open && (
                <div style={{ padding: '10px 14px 14px 14px', background: '#FAFBFD', borderTop: '1px solid #F2F3F9' }}>
                  <div style={{ fontSize: 11, color: '#8888A0', marginBottom: 6 }}>User Agent: {r.userAgent ?? '—'}</div>
                  {r.metadata != null && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#5C5C74', marginBottom: 4 }}>Metadata</div>
                      <pre style={jsonBox}>{JSON.stringify(r.metadata, null, 2)}</pre>
                    </div>
                  )}
                  {r.before != null && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#C0392B', marginBottom: 4 }}>Before</div>
                      <pre style={jsonBox}>{JSON.stringify(r.before, null, 2)}</pre>
                    </div>
                  )}
                  {r.after != null && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#0E9C7E', marginBottom: 4 }}>After</div>
                      <pre style={jsonBox}>{JSON.stringify(r.after, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const gridHead: CSSProperties = { display: 'grid', gridTemplateColumns: '140px 1fr 130px 200px 100px 110px', gap: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0', textTransform: 'uppercase' }
const gridRow: CSSProperties = { display: 'grid', gridTemplateColumns: '140px 1fr 130px 200px 100px 110px', gap: 10, alignItems: 'center' }
const inp: CSSProperties = { border: '1px solid #E5E7F0', borderRadius: 9, padding: '7px 11px', fontSize: 12.5, outline: 'none', minWidth: 180, background: '#fff' }
const btn: CSSProperties = { padding: '7px 13px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const jsonBox: CSSProperties = { margin: 0, padding: '8px 10px', background: '#fff', border: '1px solid #E5E7F0', borderRadius: 8, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", overflow: 'auto', maxHeight: 240 }
