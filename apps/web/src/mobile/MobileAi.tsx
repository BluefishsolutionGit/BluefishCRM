/**
 * Mobile AI Workspace — one-tap agents for field usage.
 *
 * The AI module already exposes `aiAgents`, `aiRun`, and `aiRuns`. This is a
 * lightweight mobile front-door: pick an agent, run it, view the summary +
 * results in a bottom sheet. Agents that need input (customer / query) get a
 * simple sheet form; the rest fire immediately.
 */

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AiAgentDto, AiRunDto, CustomerDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { Sheet } from './MobileDetails'

const backBtn: CSSProperties = { fontSize: 14, color: '#2A6FDB', cursor: 'pointer' }
const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '14px 16px' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const outlineBtn: CSSProperties = { background: '#fff', color: '#3B3B52', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const inp: CSSProperties = { width: '100%', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }
const sectionLabel: CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', color: '#8888A0', textTransform: 'uppercase', margin: '4px 0 6px' }

const CATEGORY_ORDER = ['assistant', 'insight', 'lead', 'automation', 'other']
const AGENT_ICON: Record<string, string> = {
  sales_assistant: '💼',
  forecast_assistant: '📈',
  meeting_assistant: '🗒',
  document_assistant: '📄',
  lead_hunter: '🎯',
  lead_scoring: '🧭',
}

export default function MobileAi() {
  const [agents, setAgents] = useState<AiAgentDto[]>([])
  const [recent, setRecent] = useState<AiRunDto[]>([])
  const [loading, setLoading] = useState(true)
  const [runAgent, setRunAgent] = useState<AiAgentDto | null>(null)
  const [viewRun, setViewRun] = useState<AiRunDto | null>(null)
  const [running, setRunning] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      api.aiAgents().catch(() => []),
      api.aiRuns({ limit: 5 }).catch(() => []),
    ]).then(([a, r]) => { setAgents(a); setRecent(r); setLoading(false) })
      .catch((e) => { toast(e instanceof ApiError ? e.message : 'Failed'); setLoading(false) })
  }, [toast])

  const grouped = useMemo(() => {
    const by = new Map<string, AiAgentDto[]>()
    for (const a of agents) {
      if (!a.enabled) continue
      const key = CATEGORY_ORDER.includes(a.category) ? a.category : 'other'
      const list = by.get(key) ?? []; list.push(a); by.set(key, list)
    }
    return CATEGORY_ORDER
      .map((k) => ({ category: k, list: by.get(k) ?? [] }))
      .filter((g) => g.list.length > 0)
  }, [agents])

  const runNow = async (agent: AiAgentDto, input: Record<string, unknown> = {}) => {
    setRunning(true)
    try {
      const run = await api.aiRun(agent.key, input)
      setViewRun(run); setRunAgent(null)
      const runs = await api.aiRuns({ limit: 5 }).catch(() => [])
      setRecent(runs)
      toast(`${agent.name} finished (${run.status})`)
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Run failed') }
    finally { setRunning(false) }
  }

  return (
    <div style={{ padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <div onClick={() => navigate(-1)} style={backBtn}>‹ Back</div>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 800, textAlign: 'center' }}>AI Workspace</div>
        <div style={{ width: 44 }} />
      </div>

      {loading && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}

      {grouped.map(({ category, list }) => (
        <div key={category} style={card}>
          <div style={sectionLabel}>{category}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map((a) => (
              <div key={a.key} onClick={() => a.needsInput === 'none' ? void runNow(a) : setRunAgent(a)} style={{ padding: '10px 12px', border: '1px solid #EEF0FA', borderRadius: 11, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start', background: '#F7F8FC' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: '#EAE7F7', color: '#4A3AB8', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{AGENT_ICON[a.key] ?? '✨'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: '#5C5C74', marginTop: 2, lineHeight: 1.35 }}>{a.description}</div>
                  {a.needsInput !== 'none' && (
                    <div style={{ fontSize: 10.5, color: '#4A3AB8', marginTop: 4, fontWeight: 700 }}>Needs {a.needsInput}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {recent.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>Recent runs</div>
          {recent.map((r) => (
            <div key={r.id} onClick={() => setViewRun(r)} style={{ padding: '8px 0', borderTop: '1px solid #F1F1F5', display: 'flex', gap: 8, cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{r.agentKey}</div>
                <div style={{ fontSize: 10.5, color: '#8888A0' }}>{new Date(r.startedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {r.userName ?? '—'}</div>
              </div>
              <span style={{ background: r.status === 'complete' ? '#E5F8ED' : r.status === 'error' ? '#FDECEA' : '#F1F1F5', color: r.status === 'complete' ? '#0E6E4E' : r.status === 'error' ? '#C0392B' : '#5C5C74', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, alignSelf: 'center' }}>{r.status}</span>
            </div>
          ))}
        </div>
      )}

      {runAgent && (
        <RunAgentSheet agent={runAgent} onClose={() => setRunAgent(null)} onRun={runNow} busy={running} />
      )}
      {viewRun && (
        <RunResultSheet run={viewRun} onClose={() => setViewRun(null)} />
      )}
    </div>
  )
}

function RunAgentSheet({ agent, onClose, onRun, busy }: { agent: AiAgentDto; onClose: () => void; onRun: (a: AiAgentDto, input: Record<string, unknown>) => void; busy: boolean }) {
  const [customerId, setCustomerId] = useState('')
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [query, setQuery] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    if (agent.needsInput === 'customer') api.customers().then(setCustomers).catch(() => setCustomers([]))
  }, [agent.needsInput])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const input: Record<string, unknown> = {}
    if (agent.needsInput === 'customer') input.customerId = customerId
    else if (agent.needsInput === 'query')     input.query = query
    else if (agent.needsInput === 'transcript') input.text = text
    onRun(agent, input)
  }

  const disabled = busy
    || (agent.needsInput === 'customer' && !customerId)
    || (agent.needsInput === 'query' && !query.trim())
    || (agent.needsInput === 'transcript' && !text.trim())

  return (
    <Sheet onClose={onClose} title={`Run · ${agent.name}`}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11.5, color: '#5C5C74' }}>{agent.description}</div>

        {agent.needsInput === 'customer' && (
          <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inp}>
            <option value="">Select customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        )}
        {agent.needsInput === 'query' && (
          <input required placeholder="What do you want to know?" value={query} onChange={(e) => setQuery(e.target.value)} style={inp} />
        )}
        {agent.needsInput === 'transcript' && (
          <textarea required rows={5} placeholder="Paste transcript or notes here…" value={text} onChange={(e) => setText(e.target.value)} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
        )}
        {agent.needsInput === 'document' && (
          <div style={{ fontSize: 12, color: '#B4650A', background: '#FEF3E2', border: '1px solid #F0BA95', borderRadius: 8, padding: '8px 10px' }}>
            This agent works on a Document — open the doc detail page and trigger it from there.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{ ...outlineBtn, flex: 1 }}>Cancel</button>
          <button type="submit" disabled={disabled} style={{ ...primaryBtn, flex: 1, opacity: disabled ? 0.5 : 1 }}>{busy ? 'Running…' : 'Run'}</button>
        </div>
      </form>
    </Sheet>
  )
}

function RunResultSheet({ run, onClose }: { run: AiRunDto; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} title={`Result · ${run.agentKey}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11.5, color: '#5C5C74' }}>
          {new Date(run.startedAt).toLocaleString('en-GB')}
          {run.completedAt ? ` · finished in ${Math.max(1, Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000))}s` : ''}
          {' · '}
          <span style={{ color: run.status === 'complete' ? '#0E6E4E' : run.status === 'error' ? '#C0392B' : '#5C5C74', fontWeight: 700 }}>{run.status}</span>
          {' · '}${run.costUsd.toFixed(3)}
        </div>

        {run.error && (
          <div style={{ background: '#FDECEA', color: '#C0392B', border: '1px solid #F5B7B1', borderRadius: 10, padding: '10px 12px', fontSize: 12.5 }}>{run.error}</div>
        )}

        {run.summary && (
          <div style={{ background: '#F7F8FC', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#3B3B52', whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>
            {run.summary}
          </div>
        )}

        {run.results.length > 0 && (
          <div>
            <div style={sectionLabel}>Extracted ({run.results.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {run.results.map((r) => (
                <div key={r.id} style={{ background: '#fff', border: '1px solid #EEF0FA', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: '#EAE7F7', color: '#4A3AB8', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, textTransform: 'uppercase' }}>{r.kind}</span>
                    <div style={{ fontSize: 12.5, fontWeight: 700, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                  </div>
                  <pre style={{ marginTop: 6, fontSize: 11, background: '#F7F8FC', color: '#3B3B52', borderRadius: 7, padding: '6px 8px', maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(r.payload, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
