import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { CustomerDto, InboxChannel, InboxMessageDto, InboxThreadDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { chStyle } from '../lib/styleUtils'
import { useToast } from '../lib/ToastContext'

const QUICK_REPLIES = [
  'เดี๋ยวส่งใบเสนอราคาให้ภายในบ่ายนี้นะคะ',
  'สะดวกนัดเดโม่วันไหนคะ',
  'ขอบคุณที่สนใจค่ะ ขอเบอร์ติดต่อกลับได้ไหมคะ',
]

const CHANNEL_FILTERS: Array<{ label: string; value: InboxChannel | 'all'; color: string }> = [
  { label: 'All', value: 'all', color: '#2E1A6B' },
  { label: 'LINE', value: 'LINE OA', color: '#06C755' },
  { label: 'FB', value: 'Messenger', color: '#0084FF' },
  { label: 'IG', value: 'Instagram', color: '#D6337A' },
]

function chInitial(channel: string) {
  return channel === 'Messenger' ? 'M' : channel === 'Instagram' ? 'IG' : 'L'
}

function timeShort(iso: string) {
  const d = new Date(iso), now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function Inbox() {
  const [threads, setThreads] = useState<InboxThreadDto[]>([])
  const [channelFilter, setChannelFilter] = useState<InboxChannel | 'all'>('all')
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<InboxMessageDto[]>([])
  const [composer, setComposer] = useState('')
  const [sending, setSending] = useState(false)
  const [customers, setCustomers] = useState<CustomerDto[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const toast = useToast()

  const refreshThreads = () => api.inboxThreads().then((t) => {
    setThreads(t)
    if (!threadId && t.length > 0) setThreadId(t[0].id)
  }).catch((e) => toast(e instanceof ApiError ? e.message : 'Load failed'))

  useEffect(() => {
    refreshThreads()
    const iv = setInterval(refreshThreads, 15_000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!threadId) { setMessages([]); return }
    api.inboxMessages(threadId).then((m) => {
      setMessages(m)
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 30)
    }).catch(() => {})
    api.markInboxRead(threadId).then((updated) => {
      setThreads((prev) => prev.map((t) => t.id === updated.id ? updated : t))
    }).catch(() => {})
  }, [threadId])

  const activeThread = useMemo(() => threads.find((t) => t.id === threadId) ?? null, [threads, threadId])

  const filtered = useMemo(() => {
    if (channelFilter === 'all') return threads
    return threads.filter((t) => t.channel === channelFilter)
  }, [threads, channelFilter])

  const send = async () => {
    if (!composer.trim() || !activeThread) return
    setSending(true)
    try {
      const msg = await api.sendInboxMessage(activeThread.id, composer.trim())
      setMessages((prev) => [...prev, msg])
      setComposer('')
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 30)
      refreshThreads()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Send failed')
    } finally { setSending(false) }
  }

  const assign = async () => {
    if (!activeThread) return
    try {
      const updated = await api.assignInboxThread(activeThread.id, null)
      setThreads((prev) => prev.map((t) => t.id === updated.id ? updated : t))
      toast('Assigned to me — refresh queue')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Assign failed')
    }
  }

  const link = async (customerId: string) => {
    if (!activeThread) return
    try {
      const updated = await api.linkInboxThread(activeThread.id, customerId)
      setThreads((prev) => prev.map((t) => t.id === updated.id ? updated : t))
      setLinkOpen(false)
      toast('Linked to customer')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Link failed')
    }
  }

  const openLink = async () => {
    if (customers.length === 0) {
      try { setCustomers(await api.customers()) } catch { toast('Load customers failed'); return }
    }
    setLinkOpen(true)
  }

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', background: '#fff' }}>
      {/* Thread list */}
      <div style={{ width: 300, minWidth: 300, borderRight: '1px solid #E5E7F0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 16px 10px' }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 600, marginBottom: 10 }}>Inbox</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CHANNEL_FILTERS.map((f) => {
              const count = f.value === 'all' ? threads.length : threads.filter((t) => t.channel === f.value).length
              const active = channelFilter === f.value
              return (
                <div
                  key={f.value}
                  onClick={() => setChannelFilter(f.value)}
                  style={{ background: active ? '#2E1A6B' : 'transparent', border: '1px solid ' + (active ? '#2E1A6B' : '#E5E7F0'), color: active ? '#fff' : f.color, borderRadius: 8, fontSize: 11.5, fontWeight: 600, padding: '5px 10px', cursor: 'pointer' }}
                >
                  {f.label} {count}
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 12 }}>No conversations. Wire a channel webhook in <b>Integrations</b>.</div>
          )}
          {filtered.map((t) => (
            <div
              key={t.id}
              onClick={() => setThreadId(t.id)}
              style={{ display: 'flex', gap: 10, padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #F2F3F9', background: threadId === t.id ? '#EEF0FA' : 'transparent' }}
            >
              <div style={chStyle(t.channel)}>{chInitial(t.channel)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div style={{ fontSize: 10.5, color: '#8888A0' }}>{timeShort(t.lastMessageAt)}</div>
                </div>
                <div style={{ fontSize: 11.5, color: '#5C5C74', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{t.latestMessage?.text ?? ''}</div>
                <div style={{ fontSize: 10.5, color: '#8888A0', marginTop: 2 }}>{t.customerName ?? t.companyName ?? '—'}</div>
              </div>
              {t.unread > 0 && <div style={{ background: '#2A6FDB', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '1px 6px', alignSelf: 'center' }}>{t.unread}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#F7F8FC' }}>
        {activeThread ? (
          <>
            <div style={{ height: 56, borderBottom: '1px solid #E5E7F0', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px' }}>
              <div style={chStyle(activeThread.channel)}>{chInitial(activeThread.channel)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{activeThread.name}</div>
                <div style={{ fontSize: 11, color: '#5C5C74' }}>{activeThread.channel} · {activeThread.customerName ?? activeThread.companyName ?? 'Unlinked'}</div>
              </div>
              <div onClick={assign} style={outlineSmall}>Take</div>
              <div onClick={openLink} style={outlineSmall}>{activeThread.customerId ? 'Re-link' : 'Link customer'}</div>
            </div>
            <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 && (
                <div style={{ color: '#8888A0', fontSize: 12, textAlign: 'center', padding: 30 }}>No messages yet.</div>
              )}
              {messages.map((m) => {
                const out = m.direction === 'out'
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start' }}>
                    <div
                      style={{
                        background: out ? '#2A6FDB' : '#fff', color: out ? '#fff' : '#1E1E30',
                        border: out ? 'none' : '1px solid #E5E7F0',
                        borderRadius: out ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        padding: '10px 14px', fontSize: 13, lineHeight: 1.55, maxWidth: '62%',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {m.text}
                      <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4, textAlign: out ? 'right' : 'left' }}>{timeShort(m.sentAt)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 22px 10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <svg viewBox="0 0 24 24" width="13" height="13">
                <path d="M12 3.5l1.9 5.4 5.4 1.9-5.4 1.9L12 18.1l-1.9-5.4-5.4-1.9 5.4-1.9z" fill="#6C55E0" />
              </svg>
              {QUICK_REPLIES.map((q) => (
                <div key={q} onClick={() => setComposer(q)} style={{ background: '#F4F1FD', border: '1px solid #DCD4F6', color: '#4A3AB8', borderRadius: 16, fontSize: 12, fontWeight: 600, padding: '5px 12px', cursor: 'pointer' }}>{q}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '0 22px 18px' }}>
              <input
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send() }}
                placeholder="Reply to customer…"
                style={{ flex: 1, border: '1px solid #E5E7F0', borderRadius: 11, padding: '11px 14px', fontSize: 13, background: '#fff', outline: 'none' }}
              />
              <div
                onClick={send}
                style={{ background: sending || !composer.trim() ? '#B7CFF3' : '#2A6FDB', color: '#fff', borderRadius: 11, padding: '11px 20px', fontSize: 13, fontWeight: 700, cursor: sending ? 'default' : 'pointer' }}
              >
                {sending ? '…' : 'Send'}
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8888A0' }}>
            Select a conversation
          </div>
        )}
      </div>

      {/* Right rail */}
      {activeThread && (
        <div style={{ width: 296, minWidth: 296, borderLeft: '1px solid #E5E7F0', overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: '#fff' }}>
          <div style={sectionLabel}>Customer context</div>
          <div style={{ border: '1px solid #E5E7F0', borderRadius: 12, padding: 13 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{activeThread.name}</div>
            <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 2 }}>
              {activeThread.customerName ?? activeThread.companyName ?? 'Unlinked to CRM'}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
              {activeThread.tag && <div style={{ background: '#E4EDFC', color: '#2A6FDB', borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '3px 8px' }}>{activeThread.tag}</div>}
              <div style={{ background: '#F2F3F9', color: '#5C5C74', borderRadius: 6, fontSize: 10.5, fontWeight: 700, padding: '3px 8px' }}>
                Owner: {activeThread.ownerName ?? 'Unassigned'}
              </div>
            </div>
          </div>
          <div style={{ border: '1px solid #E5E7F0', borderRadius: 12, padding: 13 }}>
            <div style={{ ...sectionLabel, marginBottom: 7 }}>Metadata</div>
            <MetaRow label="Channel" value={activeThread.channel} />
            <MetaRow label="External ID" value={activeThread.externalId.slice(0, 20) + (activeThread.externalId.length > 20 ? '…' : '')} />
            <MetaRow label="Since" value={new Date(activeThread.createdAt).toLocaleDateString('en-GB')} />
            <MetaRow label="Last msg" value={timeShort(activeThread.lastMessageAt)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div onClick={() => toast('Feature TBD — convert thread to lead')} style={{ flex: 1, border: '1px solid #E5E7F0', borderRadius: 9, fontSize: 12, fontWeight: 700, padding: '8px 0', textAlign: 'center', cursor: 'pointer' }}>Create lead</div>
            <div onClick={() => toast('Feature TBD — new quotation')} style={{ flex: 1, background: '#2A6FDB', color: '#fff', borderRadius: 9, fontSize: 12, fontWeight: 700, padding: '8px 0', textAlign: 'center', cursor: 'pointer' }}>New quotation</div>
          </div>
        </div>
      )}

      {linkOpen && (
        <LinkModal
          customers={customers}
          onClose={() => setLinkOpen(false)}
          onPick={link}
        />
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', fontSize: 11.5, padding: '3px 0' }}>
      <div style={{ width: 84, color: '#8888A0' }}>{label}</div>
      <div style={{ flex: 1, color: '#1E1E30', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function LinkModal({ customers, onClose, onPick }: { customers: CustomerDto[]; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState('')
  const shown = customers.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 360, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 14, borderBottom: '1px solid #E5E7F0' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Link to customer</div>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company…" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #D0D0DF', borderRadius: 10, fontSize: 13 }} />
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {shown.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#8888A0', fontSize: 12 }}>No matches.</div>}
          {shown.map((c) => (
            <div key={c.id} onClick={() => onPick(c.id)} style={{ padding: '10px 14px', borderBottom: '1px solid #F2F3F9', cursor: 'pointer' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: '#5C5C74' }}>{c.industry || '—'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const outlineSmall: CSSProperties = { border: '1px solid #E5E7F0', borderRadius: 8, fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer', background: '#fff' }
const sectionLabel: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8888A0' }
