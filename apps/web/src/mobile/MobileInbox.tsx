/**
 * Mobile Inbox — omnichannel thread list + chat.
 *
 * Backend already unifies LINE / LINE OA / Messenger / Instagram / WhatsApp /
 * Email into `InboxThreadDto` + `InboxMessageDto`. This screen is a
 * chat-app-shaped mobile view over that: threads on the list page, bubbles on
 * the detail page, quick actions (mark read, assign, link to customer) at the
 * top.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { CustomerDto, InboxChannel, InboxMessageDto, InboxThreadDto, UserDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { Sheet } from './MobileDetails'

const CHANNEL_STYLE: Record<InboxChannel, { bg: string; fg: string; short: string }> = {
  LINE:        { bg: '#E5F8ED', fg: '#0E9C7E', short: 'LINE' },
  'LINE OA':   { bg: '#E5F8ED', fg: '#0E6E4E', short: 'OA' },
  Messenger:   { bg: '#E4EDFC', fg: '#2A6FDB', short: 'FB' },
  Instagram:   { bg: '#FCE9F2', fg: '#D6337A', short: 'IG' },
  WhatsApp:    { bg: '#DCF6DE', fg: '#128C7E', short: 'WA' },
  Email:       { bg: '#F1F1F5', fg: '#5C5C74', short: '✉' },
}
const CHANNELS: InboxChannel[] = ['LINE', 'LINE OA', 'Messenger', 'Instagram', 'WhatsApp', 'Email']

const backBtn: CSSProperties = { fontSize: 14, color: '#2A6FDB', cursor: 'pointer' }
const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '14px 16px' }
const inp: CSSProperties = { width: '100%', border: '1px solid #D0D0DF', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }

// ═══════════════════════════════════════════════════════════════════════
// Thread list
// ═══════════════════════════════════════════════════════════════════════
export default function MobileInbox() {
  const [threads, setThreads] = useState<InboxThreadDto[]>([])
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState<InboxChannel | 'all'>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.inboxThreads().then((r) => { setThreads(r); setLoading(false) }).catch(() => setLoading(false))
    const iv = setInterval(() => api.inboxThreads().then(setThreads).catch(() => {}), 30_000)
    return () => clearInterval(iv)
  }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return threads.filter((t) => {
      if (channel !== 'all' && t.channel !== channel) return false
      if (unreadOnly && t.unread === 0) return false
      if (term && !(
        t.name.toLowerCase().includes(term) ||
        (t.companyName ?? '').toLowerCase().includes(term) ||
        (t.latestMessage?.text ?? '').toLowerCase().includes(term)
      )) return false
      return true
    })
  }, [threads, channel, unreadOnly, q])

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0)

  return (
    <div style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 19, fontWeight: 700 }}>Inbox</div>
        {totalUnread > 0 && (
          <span style={{ background: '#C0392B', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999 }}>{totalUnread} unread</span>
        )}
      </div>

      <input placeholder="Search name, company, message…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inp, padding: '10px 12px' }} />

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginRight: -16, paddingRight: 16 }}>
        <div onClick={() => { setChannel('all'); setUnreadOnly(false) }} style={chip(channel === 'all' && !unreadOnly, '#3B3B52')}>All</div>
        <div onClick={() => setUnreadOnly((v) => !v)} style={chip(unreadOnly, '#C0392B')}>Unread{totalUnread > 0 ? ` · ${totalUnread}` : ''}</div>
        {CHANNELS.map((c) => (
          <div key={c} onClick={() => setChannel(c === channel ? 'all' : c)} style={chip(channel === c, CHANNEL_STYLE[c].fg)}>{c}</div>
        ))}
      </div>

      {loading && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {!loading && filtered.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No threads match.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map((t) => <ThreadRow key={t.id} thread={t} onOpen={() => navigate(`/m/inbox/${t.id}`)} />)}
      </div>
    </div>
  )
}

function ThreadRow({ thread, onOpen }: { thread: InboxThreadDto; onOpen: () => void }) {
  const ch = CHANNEL_STYLE[thread.channel]
  return (
    <div onClick={onOpen} style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '11px 13px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: ch.bg, color: ch.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flex: 'none' }}>
        {ch.short}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{thread.name}</div>
          <div style={{ fontSize: 10.5, color: '#8888A0', flex: 'none' }}>{timeAgo(thread.lastMessageAt)}</div>
        </div>
        {thread.companyName && <div style={{ fontSize: 11, color: '#5C5C74', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{thread.companyName}</div>}
        {thread.latestMessage && (
          <div style={{
            fontSize: 12, color: thread.unread > 0 ? '#1E1E30' : '#8888A0',
            fontWeight: thread.unread > 0 ? 600 : 400,
            marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {thread.latestMessage.direction === 'out' ? '↩ ' : ''}{thread.latestMessage.text}
          </div>
        )}
      </div>
      {thread.unread > 0 && (
        <div style={{ flex: 'none', background: '#2A6FDB', color: '#fff', fontSize: 10, fontWeight: 800, minWidth: 20, height: 20, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
          {thread.unread > 99 ? '99+' : thread.unread}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Chat view
// ═══════════════════════════════════════════════════════════════════════
export function MobileInboxThread() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const [thread, setThread] = useState<InboxThreadDto | null>(null)
  const [messages, setMessages] = useState<InboxMessageDto[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const reload = useCallback(async () => {
    if (!id) return
    try {
      const [t, msgs] = await Promise.all([api.inboxThread(id), api.inboxMessages(id)])
      setThread(t); setMessages(msgs)
      if (t.unread > 0) api.markInboxRead(id).catch(() => {})
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
  }, [id, toast])

  useEffect(() => { void reload() }, [reload])

  // Poll for new messages while the chat is open
  useEffect(() => {
    if (!id) return
    const iv = setInterval(() => { api.inboxMessages(id).then(setMessages).catch(() => {}) }, 15_000)
    return () => clearInterval(iv)
  }, [id])

  // Autoscroll on new message
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages.length])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || sending || !id) return
    setSending(true)
    const body = text.trim()
    setText('')
    try {
      const created = await api.sendInboxMessage(id, body)
      setMessages((m) => [...m, created])
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed to send'); setText(body) }
    finally { setSending(false) }
  }

  const assignSelf = async () => {
    if (!id || !user) return
    try { setThread(await api.assignInboxThread(id, user.id)); toast('Assigned to you') }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
  }

  if (!thread) return <div style={{ padding: 16, color: '#8888A0' }}>Loading…</div>

  const ch = CHANNEL_STYLE[thread.channel]
  const grouped = groupByDay(messages)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 68px - 128px)' }}>
      {/* Sticky header */}
      <div style={{ padding: '10px 16px 8px', background: '#F4F6F1', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #E5E7F0' }}>
        <div onClick={() => navigate(-1)} style={backBtn}>‹</div>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: ch.bg, color: ch.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flex: 'none' }}>{ch.short}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{thread.name}</div>
          <div style={{ fontSize: 10.5, color: '#5C5C74' }}>
            {thread.channel}
            {thread.customerName ? ` · ${thread.customerName}` : ' · unlinked'}
            {thread.ownerName ? ` · ${thread.ownerName}` : ''}
          </div>
        </div>
        {(!thread.ownerId || thread.ownerId !== user?.id) && (
          <div onClick={assignSelf} title="Take this thread" style={{ fontSize: 11, color: '#2A6FDB', fontWeight: 700, cursor: 'pointer', flex: 'none' }}>Take</div>
        )}
        <div onClick={() => setLinkOpen(true)} title="Link to customer" style={{ fontSize: 11, color: '#5C5C74', fontWeight: 700, cursor: 'pointer', flex: 'none', marginLeft: 8 }}>
          {thread.customerId ? '⛓ Change' : '🔗 Link'}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 12px 4px', background: '#F7F8FC' }}>
        {grouped.map(({ day, list }) => (
          <div key={day}>
            <div style={{ textAlign: 'center', fontSize: 10.5, color: '#8888A0', fontWeight: 700, margin: '10px 0', letterSpacing: '.06em' }}>{day}</div>
            {list.map((m) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'out' ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
                <div style={{
                  maxWidth: '75%',
                  background: m.direction === 'out' ? '#2A6FDB' : '#fff',
                  color: m.direction === 'out' ? '#fff' : '#1E1E30',
                  border: m.direction === 'out' ? 'none' : '1px solid #E5E7F0',
                  borderRadius: 14,
                  borderBottomRightRadius: m.direction === 'out' ? 4 : 14,
                  borderBottomLeftRadius: m.direction === 'in' ? 4 : 14,
                  padding: '8px 12px',
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>{m.text}</div>
              </div>
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form onSubmit={send} style={{ padding: 10, display: 'flex', gap: 8, background: '#fff', borderTop: '1px solid #E5E7F0' }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Reply on ${thread.channel}…`}
          style={{ ...inp, flex: 1 }}
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          style={{
            background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 10,
            padding: '0 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
            opacity: sending || !text.trim() ? 0.5 : 1,
          }}
        >{sending ? '…' : 'Send'}</button>
      </form>

      {linkOpen && <LinkCustomerSheet threadId={thread.id} currentCustomerId={thread.customerId} onClose={() => setLinkOpen(false)} onLinked={() => { setLinkOpen(false); void reload() }} />}
    </div>
  )
}

function LinkCustomerSheet({ threadId, currentCustomerId, onClose, onLinked }: { threadId: string; currentCustomerId: string | null; onClose: () => void; onLinked: () => void }) {
  const toast = useToast()
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.customers().then(setCustomers).catch(() => setCustomers([])) }, [])
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return customers.filter((c) => !term || c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term))
  }, [customers, q])
  const link = async (customerId: string) => {
    if (busy) return
    setBusy(true)
    try { await api.linkInboxThread(threadId, customerId); toast('Linked'); onLinked() }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Failed') }
    finally { setBusy(false) }
  }
  return (
    <Sheet onClose={onClose} title="Link to customer">
      <input placeholder="Search customer…" value={q} onChange={(e) => setQ(e.target.value)} style={inp} />
      <div style={{ marginTop: 10, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map((c) => (
          <div key={c.id} onClick={() => link(c.id)} style={{ padding: '10px 12px', background: c.id === currentCustomerId ? '#EEF0FA' : '#fff', border: '1px solid #E5E7F0', borderRadius: 10, cursor: 'pointer', display: 'flex', gap: 8 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#5C5C74', flex: 'none' }}>{c.code}</div>
            <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
            {c.id === currentCustomerId && <div style={{ fontSize: 10.5, color: '#2A6FDB', fontWeight: 700 }}>Linked</div>}
          </div>
        ))}
      </div>
    </Sheet>
  )
}

// ── Utilities ─────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d`
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function groupByDay(msgs: InboxMessageDto[]): Array<{ day: string; list: InboxMessageDto[] }> {
  const out: Array<{ day: string; list: InboxMessageDto[] }> = []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const dayKey = (d: Date) => {
    const dc = new Date(d); dc.setHours(0, 0, 0, 0)
    if (dc.getTime() === today.getTime()) return 'TODAY'
    if (dc.getTime() === yesterday.getTime()) return 'YESTERDAY'
    return dc.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
  }
  for (const m of msgs) {
    const label = dayKey(new Date(m.sentAt))
    const last = out[out.length - 1]
    if (last && last.day === label) last.list.push(m)
    else out.push({ day: label, list: [m] })
  }
  return out
}

const chip = (on: boolean, color: string): CSSProperties => ({
  cursor: 'pointer', flex: 'none',
  border: `1px solid ${on ? color : '#E5E7F0'}`,
  background: on ? color + '15' : '#fff',
  color: on ? color : '#5C5C74',
  borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700,
})
