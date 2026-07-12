import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import type { ReportDefinitionDto, ReportFormat, ReportKey, ReportResultDto, ReportScheduleDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'

const FORMATS: ReportFormat[] = ['xlsx', 'pdf', 'docx']

export default function Reports() {
  const [defs, setDefs] = useState<ReportDefinitionDto[]>([])
  const [selectedKey, setSelectedKey] = useState<ReportKey | null>(null)
  const [tab, setTab] = useState<'run' | 'schedules'>('run')
  const toast = useToast()

  useEffect(() => {
    api.reports().then((r) => { setDefs(r); if (r[0]) setSelectedKey(r[0].key) }).catch((e) => toast(e instanceof ApiError ? e.message : 'Failed'))
  }, [])

  const selected = defs.find((d) => d.key === selectedKey)

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', background: '#F7F8FC' }}>
      <div style={{ width: 240, minWidth: 240, background: '#fff', borderRight: '1px solid #E5E7F0', padding: '18px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 600, padding: '0 8px 12px' }}>Reports</div>
        {defs.map((d) => (
          <div key={d.key} onClick={() => setSelectedKey(d.key)} style={sideItem(selectedKey === d.key)}>
            {d.name}
          </div>
        ))}
        <div style={{ marginTop: 12, padding: '0 8px' }}>
          <div onClick={() => setTab('schedules')} style={sideItem(tab === 'schedules')}>⏰ Scheduled reports</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '22px 24px' }}>
        {tab === 'run' && selected && <RunTab def={selected} onToast={toast} />}
        {tab === 'schedules' && <SchedulesTab defs={defs} onToast={toast} />}
        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <span onClick={() => setTab(tab === 'run' ? 'schedules' : 'run')} style={{ color: '#2A6FDB', fontSize: 12, cursor: 'pointer' }}>
            Switch to {tab === 'run' ? 'Scheduled reports' : 'Run report'}
          </span>
        </div>
      </div>
    </div>
  )
}

function RunTab({ def, onToast }: { def: ReportDefinitionDto; onToast: (m: string) => void }) {
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ReportResultDto | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setFilters({}); setResult(null) }, [def.key])

  const run = async () => {
    setBusy(true)
    try { setResult(await api.runReport(def.key, filters)); onToast(`Report ready`) }
    catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  const download = async (format: ReportFormat) => {
    try { await api.exportReport(def.key, format, filters); onToast(`Downloaded ${format.toUpperCase()}`) }
    catch (e) { onToast(e instanceof ApiError ? e.message : 'Export failed') }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 20, fontWeight: 600 }}>{def.name}</div>
          <div style={{ fontSize: 12.5, color: '#5C5C74', marginTop: 3 }}>{def.description}</div>
        </div>
        <div style={{ flex: 1 }} />
        <div onClick={run} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>{busy ? 'Running…' : '▶ Run report'}</div>
        {FORMATS.map((f) => (
          <div key={f} onClick={() => download(f)} style={outlineBtn}>Export {f.toUpperCase()}</div>
        ))}
      </div>

      {def.filters.length > 0 && (
        <div style={{ ...card, padding: '14px 18px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {def.filters.map((f) => (
            <div key={f.key} style={{ minWidth: 200 }}>
              <div style={fieldLabel}>{f.label}</div>
              {f.type === 'select' && f.options ? (
                <select value={filters[f.key] ?? ''} onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })} style={inp}>
                  <option value="">All</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === 'date' ? (
                <input type="date" value={filters[f.key] ?? ''} onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })} style={inp} />
              ) : (
                <input value={filters[f.key] ?? ''} onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })} placeholder={f.label} style={inp} />
              )}
            </div>
          ))}
        </div>
      )}

      {result && (
        <>
          {result.totals && (
            <div style={{ ...card, padding: '12px 18px', marginBottom: 14, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {Object.entries(result.totals).map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: '#8888A0', letterSpacing: '.06em', textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700 }}>{typeof v === 'number' ? v.toLocaleString('en-US') : v}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: '#F7F8FC' }}>
                  {def.columns.map((c) => (
                    <th key={c.key} style={{ textAlign: c.type === 'currency' || c.type === 'number' ? 'right' : 'left', padding: '11px 14px', fontSize: 10.5, color: '#8888A0', letterSpacing: '.06em', textTransform: 'uppercase', borderBottom: '1px solid #E5E7F0' }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #F2F3F9' }}>
                    {def.columns.map((c) => {
                      const v = r.values[c.key]
                      const display = c.type === 'currency' && typeof v === 'number' ? '฿' + v.toLocaleString('en-US')
                        : c.type === 'number' && typeof v === 'number' ? v.toLocaleString('en-US')
                        : v ?? ''
                      return (
                        <td key={c.key} style={{ padding: '10px 14px', textAlign: c.type === 'currency' || c.type === 'number' ? 'right' : 'left', fontFamily: c.type === 'currency' || c.type === 'number' ? "'IBM Plex Mono', monospace" : 'inherit' }}>
                          {display}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr><td colSpan={def.columns.length} style={{ padding: 24, textAlign: 'center', color: '#8888A0' }}>No rows.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, fontSize: 11.5, color: '#8888A0' }}>{result.rows.length} rows · generated {new Date(result.generatedAt).toLocaleString()}</div>
        </>
      )}

      {!result && <div style={{ ...card, padding: 40, textAlign: 'center', color: '#8888A0' }}>Set filters (optional) and run.</div>}
    </>
  )
}

function SchedulesTab({ defs, onToast }: { defs: ReportDefinitionDto[]; onToast: (m: string) => void }) {
  const [rows, setRows] = useState<ReportScheduleDto[]>([])
  const [showNew, setShowNew] = useState(false)

  const reload = async () => { try { setRows(await api.reportSchedules()) } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const toggle = async (s: ReportScheduleDto) => { try { const upd = await api.toggleReportSchedule(s.id, !s.isActive); onToast(upd.isActive ? 'Enabled' : 'Disabled'); reload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }
  const del = async (id: string) => { if (!window.confirm('Delete schedule?')) return; try { await api.deleteReportSchedule(id); onToast('Deleted'); reload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }
  const runNow = async (id: string) => { try { const r = await api.runScheduleNow(id); onToast(`Sent to ${r.recipients} recipients (${Math.round(r.bytes / 1024)} KB)`); reload() } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 20, fontWeight: 600 }}>Scheduled reports</div>
          <div style={{ fontSize: 12.5, color: '#5C5C74', marginTop: 3 }}>Cron-based delivery. In dev the email attachment is logged to the API console.</div>
        </div>
        <div style={{ flex: 1 }} />
        <div onClick={() => setShowNew(true)} style={primaryBtn}>+ New schedule</div>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {rows.map((s) => (
          <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '180px 160px 90px 1.5fr 100px 130px 160px', gap: 10, padding: '12px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', fontSize: 12.5 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{s.reportKey}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{s.cron}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase' }}>{s.format}</div>
            <div>{s.recipients.join(', ')}</div>
            <div><span style={{ background: s.isActive ? '#E5F8ED' : '#F2F3F9', color: s.isActive ? '#0E6E4E' : '#8888A0', borderRadius: 5, fontSize: 10.5, fontWeight: 700, padding: '3px 8px' }}>{s.isActive ? 'ACTIVE' : 'PAUSED'}</span></div>
            <div style={{ fontSize: 11, color: '#8888A0' }}>{s.lastRunAt ? `Ran ${new Date(s.lastRunAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'never'}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <div onClick={() => runNow(s.id)} style={miniBtn}>Run now</div>
              <div onClick={() => toggle(s)} style={miniBtn}>{s.isActive ? 'Pause' : 'Enable'}</div>
              <div onClick={() => del(s.id)} style={{ ...miniBtn, color: '#C0392B' }}>×</div>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No schedules yet.</div>}
      </div>

      {showNew && <NewScheduleModal defs={defs} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); reload() }} />}
    </>
  )
}

function NewScheduleModal({ defs, onClose, onCreated }: { defs: ReportDefinitionDto[]; onClose: () => void; onCreated: () => void }) {
  const [reportKey, setReportKey] = useState<ReportKey>(defs[0]?.key ?? 'lead_conversion')
  const [cron, setCron] = useState('0 8 * * 1')
  const [format, setFormat] = useState<ReportFormat>('xlsx')
  const [recipients, setRecipients] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      await api.createReportSchedule({ reportKey, cron, format, recipients: recipients.split(',').map((s) => s.trim()).filter(Boolean) })
      toast('Schedule created')
      onCreated()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed')
    } finally { setBusy(false) }
  }

  const cronPresets = useMemo(() => [
    { label: 'Every Monday 08:00', value: '0 8 * * 1' },
    { label: 'Daily 06:00', value: '0 6 * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'First of month 06:00', value: '0 6 1 * *' },
    { label: 'Every minute (test)', value: '* * * * *' },
  ], [])

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7F0', display: 'flex', alignItems: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, flex: 1 }}>New scheduled report</div>
            <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#8888A0' }}>×</div>
          </div>
          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={fieldLabel}>Report</div>
              <select value={reportKey} onChange={(e) => setReportKey(e.target.value as ReportKey)} style={inp}>
                {defs.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={fieldLabel}>Cron (minute hour dom month dow)</div>
              <input value={cron} onChange={(e) => setCron(e.target.value)} required style={{ ...inp, fontFamily: "'IBM Plex Mono', monospace" }} />
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cronPresets.map((p) => <div key={p.value} onClick={() => setCron(p.value)} style={{ background: '#F2F3F9', color: '#3B3B52', borderRadius: 6, fontSize: 11, padding: '4px 9px', cursor: 'pointer' }}>{p.label}</div>)}
              </div>
            </label>
            <label>
              <div style={fieldLabel}>Format</div>
              <select value={format} onChange={(e) => setFormat(e.target.value as ReportFormat)} style={inp}>
                {FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={fieldLabel}>Recipients (comma-separated emails)</div>
              <input value={recipients} onChange={(e) => setRecipients(e.target.value)} required placeholder="team@bluefishsolution.com" style={inp} />
            </label>
          </div>
          {error && <div style={{ margin: '0 22px 12px', background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>{error}</div>}
          <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
            <button type="submit" disabled={busy || !recipients} style={{ ...btnPrimary, opacity: busy || !recipients ? 0.5 : 1 }}>{busy ? 'Creating…' : 'Create schedule'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function sideItem(active: boolean): CSSProperties {
  return { padding: '9px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#2A6FDB' : '#5C5C74', background: active ? '#EEF0FA' : 'transparent' }
}
const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14 }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-block' }
const outlineBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', color: '#3B3B52', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-block' }
const miniBtn: CSSProperties = { border: '1px solid #E5E7F0', background: '#fff', borderRadius: 8, fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: 'pointer', color: '#3B3B52' }
const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', maxWidth: 540, borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)' }
const fieldLabel: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#5C5C74', marginBottom: 6 }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const btnPrimary: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
