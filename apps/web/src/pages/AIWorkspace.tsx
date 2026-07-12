import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { AiAgentDto, AiCostSummaryDto, AiResultDto, AiRunDto, CustomerDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

type TabKey = 'run' | 'queue' | 'runs' | 'cost'

const AGENT_HELP: Record<string, string> = {
  none: 'No input needed — the agent scans its own sources.',
  customer: 'Pick a customer to brief the agent.',
  document: 'Paste document text (or upload via Documents page first).',
  transcript: 'Paste raw meeting transcript.',
  query: 'Free-form query.',
}

export default function AIWorkspace() {
  const [agents, setAgents] = useState<AiAgentDto[]>([])
  const [selectedKey, setSelectedKey] = useState<string>('lead_hunter')
  const [tab, setTab] = useState<TabKey>('run')
  const toast = useToast()

  useEffect(() => { api.aiAgents().then(setAgents).catch((e) => toast(e instanceof ApiError ? e.message : 'Failed')) }, [])

  const selected = agents.find((a) => a.key === selectedKey) ?? null

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', background: '#fff' }}>
      <div style={{ width: 270, minWidth: 270, borderRight: '1px solid #E5E7F0', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 9, overflow: 'auto' }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 600, padding: '0 4px 6px' }}>AI Workspace</div>
        {agents.map((a) => (
          <div key={a.key} onClick={() => setSelectedKey(a.key)} style={{ border: selectedKey === a.key ? '1.5px solid #6C55E0' : '1px solid #E5E7F0', background: selectedKey === a.key ? '#FBFAFF' : '#fff', borderRadius: 12, padding: '12px 13px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 3.5l1.9 5.4 5.4 1.9-5.4 1.9L12 18.1l-1.9-5.4-5.4-1.9 5.4-1.9z" fill="#6C55E0" /></svg>
              <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{a.name}</div>
              <span style={{ background: '#F4F1FD', color: '#4A3AB8', borderRadius: 6, fontSize: 10, fontWeight: 700, padding: '2px 7px' }}>v{a.latestPromptVersion}</span>
            </div>
            <div style={{ fontSize: 11.5, color: '#5C5C74', marginTop: 4, lineHeight: 1.45 }}>{a.description}</div>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: '#8888A0', lineHeight: 1.5, padding: '0 4px' }}>Every run is versioned + logged. Results wait in the review queue until you accept or reject.</div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#F7F8FC' }}>
        <div style={{ height: 56, borderBottom: '1px solid #E5E7F0', background: '#fff', display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{selected?.name ?? 'Select an agent'}</div>
          <div style={{ display: 'flex', background: '#F2F3F9', borderRadius: 9, padding: 3, gap: 2 }}>
            {(['run', 'queue', 'runs', 'cost'] as TabKey[]).map((t) => (
              <div key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
                {t === 'run' ? 'Run' : t === 'queue' ? 'Review queue' : t === 'runs' ? 'History' : 'Cost'}
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {tab === 'run' && selected && <RunTab agent={selected} onToast={toast} />}
          {tab === 'queue' && <QueueTab onToast={toast} />}
          {tab === 'runs' && <RunsTab onToast={toast} />}
          {tab === 'cost' && <CostTab onToast={toast} />}
        </div>
      </div>
    </div>
  )
}

function RunTab({ agent, onToast }: { agent: AiAgentDto; onToast: (m: string) => void }) {
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [customerId, setCustomerId] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AiRunDto | null>(null)
  const [isDryRun, setIsDryRun] = useState(false)

  useEffect(() => {
    if (agent.needsInput === 'customer') api.customers().then(setCustomers).catch(() => {})
  }, [agent])

  const run = async () => {
    if (busy) return
    setBusy(true); setResult(null)
    try {
      let input: Record<string, unknown> = {}
      if (agent.needsInput === 'customer') input = { customerId }
      if (agent.needsInput === 'document') input = { text }
      if (agent.needsInput === 'transcript') input = { transcript: text }
      const run = await api.aiRun(agent.key, input, isDryRun)
      setResult(run)
      if (run.status === 'error') onToast(run.error ?? 'Agent errored')
      else onToast(`Run complete — ${run.results.length} results ready for review`)
    } catch (e) {
      onToast(e instanceof ApiError ? e.message : 'Run failed')
    } finally { setBusy(false) }
  }

  const canRun = (() => {
    if (agent.needsInput === 'customer') return !!customerId
    if (agent.needsInput === 'document' || agent.needsInput === 'transcript') return text.length > 20
    return true
  })()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      <div style={card}>
        <div style={cardTitle}>Input</div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#5C5C74' }}>{AGENT_HELP[agent.needsInput] ?? 'Input required'}</div>
          {agent.needsInput === 'customer' && (
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inp}>
              <option value="">— select customer —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          )}
          {(agent.needsInput === 'document' || agent.needsInput === 'transcript') && (
            <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={agent.needsInput === 'transcript' ? 'Paste meeting transcript…' : 'Paste document text…'} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5C5C74' }}>
            <input type="checkbox" checked={isDryRun} onChange={(e) => setIsDryRun(e.target.checked)} /> Dry run (deterministic fallback — no LLM call, no cost)
          </label>
          <div onClick={run} style={{ ...primaryBtn, opacity: !canRun || busy ? 0.5 : 1, textAlign: 'center' }}>{busy ? 'Running…' : '▶ Run agent'}</div>
        </div>
      </div>

      <div style={card}>
        <div style={cardTitle}>Latest run</div>
        <div style={{ padding: '14px 18px', fontSize: 12.5, color: '#5C5C74' }}>
          {!result && <div style={{ color: '#8888A0' }}>Run the agent to see results.</div>}
          {result && (
            <>
              <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={statusPill(result.status)}>{result.status}</span>
                <span style={mutedPill}>{result.model ?? '—'}</span>
                <span style={mutedPill}>{result.tokensIn}→{result.tokensOut} tokens</span>
                <span style={mutedPill}>${result.costUsd.toFixed(4)}</span>
                {result.isDryRun && <span style={{ ...mutedPill, background: '#FEF3E2', color: '#B4650A' }}>dry-run</span>}
              </div>
              {result.summary && <div style={{ marginBottom: 10 }}><b>Summary:</b> {result.summary}</div>}
              {result.error && <div style={{ color: '#C0392B', marginBottom: 10 }}>{result.error}</div>}
              {result.results.map((r) => (
                <div key={r.id} style={{ padding: '10px 12px', background: '#F7F8FC', borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{r.title}</div>
                  <pre style={{ fontSize: 11, color: '#3B3B52', whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(r.payload, null, 2)}</pre>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function QueueTab({ onToast }: { onToast: (m: string) => void }) {
  const [items, setItems] = useState<AiResultDto[]>([])
  const { hasPermission } = useAuth()
  const canReview = hasPermission('lead:write')

  const reload = async () => { try { setItems(await api.aiReviewQueue()) } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const decide = async (r: AiResultDto, decision: 'accept' | 'reject') => {
    try {
      const upd = await api.aiReview(r.id, decision)
      onToast(decision === 'accept' ? (upd.createdCrmId ? `Created ${upd.createdCrmType}` : 'Accepted (advisory)') : 'Rejected')
      reload()
    } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') }
  }

  return (
    <div style={card}>
      <div style={cardTitle}>{items.length} pending items — human in the loop</div>
      <div style={{ padding: 0 }}>
        {items.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Queue is empty.</div>}
        {items.map((r) => (
          <div key={r.id} style={{ padding: '14px 18px', borderTop: '1px solid #F2F3F9', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ background: '#F4F1FD', color: '#4A3AB8', borderRadius: 6, fontSize: 10, fontWeight: 700, padding: '2px 7px', textTransform: 'uppercase' }}>{r.kind}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{r.title}</span>
              </div>
              <pre style={{ fontSize: 11.5, color: '#5C5C74', margin: 0, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{JSON.stringify(r.payload, null, 2)}</pre>
            </div>
            {canReview && (
              <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                <div onClick={() => decide(r, 'accept')} style={{ background: '#0E9C7E', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>Accept</div>
                <div onClick={() => decide(r, 'reject')} style={{ border: '1px solid #F5B7B1', color: '#C0392B', borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>Reject</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function RunsTab({ onToast }: { onToast: (m: string) => void }) {
  const [runs, setRuns] = useState<AiRunDto[]>([])
  const reload = async () => { try { setRuns(await api.aiRuns({ limit: 40 })) } catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed') } }
  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  return (
    <div style={card}>
      <div style={cardTitle}>Last {runs.length} runs</div>
      <div style={{ ...runsGrid, padding: '11px 18px', borderBottom: '1px solid #E5E7F0', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8888A0' }}>
        <div>When</div><div>Agent</div><div>User</div><div>Status</div><div>Results</div><div>Tokens</div><div style={{ textAlign: 'right' }}>Cost</div>
      </div>
      {runs.map((r) => (
        <div key={r.id} style={{ ...runsGrid, padding: '11px 18px', borderBottom: '1px solid #F2F3F9', alignItems: 'center', fontSize: 12.5 }}>
          <div style={{ color: '#5C5C74' }}>{new Date(r.startedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          <div style={{ fontWeight: 600 }}>{r.agentKey}</div>
          <div>{r.userName ?? '—'}</div>
          <div><span style={statusPill(r.status)}>{r.status}</span> {r.isDryRun && <span style={{ ...mutedPill, background: '#FEF3E2', color: '#B4650A', marginLeft: 4 }}>dry</span>}</div>
          <div>{r.results.length}</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.tokensIn}→{r.tokensOut}</div>
          <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>${r.costUsd.toFixed(4)}</div>
        </div>
      ))}
    </div>
  )
}

function CostTab({ onToast }: { onToast: (m: string) => void }) {
  const [data, setData] = useState<AiCostSummaryDto | null>(null)
  useEffect(() => { api.aiCost().then(setData).catch((e) => onToast(e instanceof ApiError ? e.message : 'Failed')) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  const totalCost = data?.totalCostUsd ?? 0
  const maxDay = useMemo(() => Math.max(1, ...(data?.byDay ?? []).map((d) => d.costUsd)), [data])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
      <div style={card}>
        <div style={cardTitle}>Total spend</div>
        <div style={{ padding: '14px 18px' }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 28, fontWeight: 700 }}>${totalCost.toFixed(4)}</div>
          <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 6 }}>{data?.totalRuns ?? 0} runs · {data?.totalTokensIn ?? 0}→{data?.totalTokensOut ?? 0} tokens</div>
        </div>
      </div>
      <div style={card}>
        <div style={cardTitle}>By agent</div>
        <div style={{ padding: '10px 18px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(data?.byAgent ?? []).map((a) => (
            <div key={a.agentKey} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
              <div style={{ flex: 1 }}>{a.agentKey}</div>
              <div style={{ color: '#8888A0' }}>{a.runs} runs</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", width: 80, textAlign: 'right' }}>${a.costUsd.toFixed(4)}</div>
            </div>
          ))}
          {(data?.byAgent ?? []).length === 0 && <div style={{ fontSize: 12, color: '#8888A0' }}>No runs yet.</div>}
        </div>
      </div>
      <div style={card}>
        <div style={cardTitle}>By day</div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(data?.byDay ?? []).map((d) => (
            <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <div style={{ width: 90, color: '#5C5C74' }}>{d.date}</div>
              <div style={{ flex: 1, height: 8, background: '#F2F3F9', borderRadius: 4 }}>
                <div style={{ width: `${(d.costUsd / maxDay) * 100}%`, height: '100%', background: '#6C55E0', borderRadius: 4 }} />
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", width: 70, textAlign: 'right' }}>${d.costUsd.toFixed(4)}</div>
            </div>
          ))}
          {(data?.byDay ?? []).length === 0 && <div style={{ fontSize: 12, color: '#8888A0' }}>No runs yet.</div>}
        </div>
      </div>
    </div>
  )
}

// ─── styles ───
function tabStyle(active: boolean): CSSProperties {
  return { borderRadius: 7, fontSize: 12, fontWeight: 600, padding: '5px 13px', cursor: 'pointer', background: active ? '#fff' : 'transparent', color: active ? '#2A6FDB' : '#5C5C74', boxShadow: active ? '0 1px 2px rgba(14,31,25,.06)' : 'none' }
}
function statusPill(status: string): CSSProperties {
  const map: Record<string, [string, string]> = { complete: ['#E5F8ED', '#0E6E4E'], running: ['#EEF3FC', '#2A6FDB'], error: ['#FDECEA', '#C0392B'], pending: ['#F2F3F9', '#5C5C74'] }
  const [bg, fg] = map[status] ?? ['#F2F3F9', '#5C5C74']
  return { background: bg, color: fg, borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '2px 7px', textTransform: 'uppercase' }
}
const mutedPill: CSSProperties = { background: '#F2F3F9', color: '#5C5C74', borderRadius: 5, fontSize: 10.5, fontWeight: 600, padding: '2px 7px' }
const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 14, overflow: 'hidden' }
const cardTitle: CSSProperties = { padding: '14px 18px', borderBottom: '1px solid #F2F3F9', fontSize: 13, fontWeight: 700 }
const primaryBtn: CSSProperties = { background: '#6C55E0', color: '#fff', borderRadius: 9, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const inp: CSSProperties = { border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const runsGrid: CSSProperties = { display: 'grid', gridTemplateColumns: '150px 160px 130px 120px 80px 130px 100px', gap: 10 }
