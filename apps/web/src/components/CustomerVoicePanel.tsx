import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { CustomerVoiceDto, VoiceKind, VoiceSource } from '@bluefish/shared'
import { VOICE_KINDS, VOICE_SOURCES } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'

/**
 * Voice tab for the Customer detail page. Lists feedback logged against
 * this customer with a "+ Log feedback" modal for adding new items.
 * See requirements/add_customervoice.md for the data model & scope.
 */
export default function CustomerVoicePanel({ customerId, customerName, canWrite, onToast }: {
  customerId: string
  customerName: string
  canWrite: boolean
  onToast: (m: string) => void
}) {
  const [rows, setRows] = useState<CustomerVoiceDto[]>([])
  const [loading, setLoading] = useState(true)
  const [kindFilter, setKindFilter] = useState<VoiceKind | 'all'>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerVoiceDto | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try { setRows(await api.customerVoices({ customerId })) }
    catch (e) { onToast(e instanceof ApiError ? e.message : 'Failed to load voices') }
    finally { setLoading(false) }
  }, [customerId, onToast])

  useEffect(() => { void reload() }, [reload])

  const visible = kindFilter === 'all' ? rows : rows.filter((r) => r.kind === kindFilter)

  const remove = async (v: CustomerVoiceDto) => {
    if (!window.confirm('Delete this voice item?')) return
    try {
      await api.deleteCustomerVoice(v.id)
      onToast('Deleted')
      void reload()
    } catch (e) { onToast(e instanceof ApiError ? e.message : 'Delete failed') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 700 }}>
          Customer voice
        </div>
        <div style={{ fontSize: 12, color: '#8888A0' }}>
          {rows.length} record{rows.length === 1 ? '' : 's'}
        </div>
        <div style={{ flex: 1 }} />

        {/* Kind filter chips */}
        <div style={{ display: 'inline-flex', gap: 4 }}>
          {(['all', ...VOICE_KINDS] as const).map((k) => {
            const on = kindFilter === k
            const meta = k === 'all' ? { label: 'All', color: '#5C5C74' } : KIND_META[k]
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                style={{
                  background: on ? meta.color : '#fff',
                  color: on ? '#fff' : meta.color,
                  border: `1px solid ${on ? meta.color : '#E5E7F0'}`,
                  borderRadius: 999, padding: '4px 10px',
                  fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >{meta.label}</button>
            )
          })}
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => { setEditing(null); setFormOpen(true) }}
            style={primaryBtn}
          >+ Log feedback</button>
        )}
      </div>

      {loading && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}

      {!loading && visible.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', color: '#8888A0', fontSize: 13, background: '#F7F8FC', borderRadius: 12 }}>
          {rows.length === 0 ? 'No feedback logged yet.' : 'No records match this filter.'}
        </div>
      )}

      {visible.map((v) => (
        <VoiceRow
          key={v.id}
          voice={v}
          canWrite={canWrite}
          onEdit={() => { setEditing(v); setFormOpen(true) }}
          onDelete={() => void remove(v)}
        />
      ))}

      {formOpen && (
        <VoiceFormModal
          customerId={customerId}
          customerName={customerName}
          initial={editing}
          onClose={() => { setFormOpen(false); setEditing(null) }}
          onSaved={() => { setFormOpen(false); setEditing(null); void reload() }}
          onToast={onToast}
        />
      )}
    </div>
  )
}

const KIND_META: Record<VoiceKind, { label: string; color: string; icon: string }> = {
  praise:     { label: 'Praise',     color: '#0E9C7E', icon: '👍' },
  complaint:  { label: 'Complaint',  color: '#C0392B', icon: '⚠️' },
  suggestion: { label: 'Suggestion', color: '#B4650A', icon: '💡' },
  nps:        { label: 'NPS',        color: '#2A6FDB', icon: '📊' },
  csat:       { label: 'CSAT',       color: '#6C55E0', icon: '⭐' },
}

function VoiceRow({ voice, canWrite, onEdit, onDelete }: {
  voice: CustomerVoiceDto
  canWrite: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = KIND_META[voice.kind]
  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E7F0', borderRadius: 12,
      padding: '12px 14px', borderLeft: `3px solid ${meta.color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{meta.icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color: meta.color,
          background: meta.color + '15', padding: '2px 7px', borderRadius: 999,
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>{meta.label}</span>
        {voice.rating !== null && (
          <span style={{
            fontSize: 11, fontWeight: 800, color: '#1E1E30',
            fontFamily: "'Space Grotesk'",
          }}>{voice.rating}{voice.kind === 'nps' ? '/10' : voice.kind === 'csat' ? '/5' : ''}</span>
        )}
        {voice.topic && (
          <span style={{
            fontSize: 10, color: '#5C5C74',
            background: '#F2F3F9', padding: '2px 7px', borderRadius: 999,
          }}>#{voice.topic}</span>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 10.5, color: '#8888A0' }}>
          {voice.authorName} · {new Date(voice.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
        </div>
        {canWrite && (
          <>
            <button type="button" onClick={onEdit} style={ghostBtnSm}>Edit</button>
            <button type="button" onClick={onDelete} style={{ ...ghostBtnSm, color: '#C0392B' }}>Delete</button>
          </>
        )}
      </div>
      <div style={{ fontSize: 13, color: '#3B3B52', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{voice.text}</div>
      {(voice.source || voice.opportunityTitle) && (
        <div style={{ marginTop: 6, fontSize: 10.5, color: '#8888A0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {voice.source && <span>Source: <b style={{ color: '#5C5C74', textTransform: 'capitalize' }}>{voice.source}</b></span>}
          {voice.opportunityTitle && <span>Deal: <b style={{ color: '#5C5C74' }}>{voice.opportunityTitle}</b></span>}
        </div>
      )}
    </div>
  )
}

function VoiceFormModal({ customerId, customerName, initial, onClose, onSaved, onToast }: {
  customerId: string
  customerName: string
  initial: CustomerVoiceDto | null
  onClose: () => void
  onSaved: () => void
  onToast: (m: string) => void
}) {
  const [kind, setKind] = useState<VoiceKind>(initial?.kind ?? 'praise')
  const [rating, setRating] = useState<string>(initial?.rating != null ? String(initial.rating) : '')
  const [text, setText] = useState(initial?.text ?? '')
  const [source, setSource] = useState<VoiceSource | ''>(initial?.source ?? '')
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [saving, setSaving] = useState(false)

  const needsRating = kind === 'nps' || kind === 'csat'
  const ratingMin = kind === 'nps' ? 0 : 1
  const ratingMax = kind === 'nps' ? 10 : 5

  const save = async () => {
    if (saving) return
    if (!text.trim()) { onToast('Text is required'); return }
    if (needsRating && !rating) { onToast(`Rating (${ratingMin}-${ratingMax}) is required for ${kind.toUpperCase()}`); return }
    const ratingNum = needsRating ? Number(rating) : null
    if (needsRating && (Number.isNaN(ratingNum!) || ratingNum! < ratingMin || ratingNum! > ratingMax)) {
      onToast(`Rating must be ${ratingMin}-${ratingMax}`); return
    }
    setSaving(true)
    try {
      const payload = {
        kind,
        text: text.trim(),
        rating: needsRating ? ratingNum : null,
        source: source || null,
        topic: topic.trim() || undefined,
      }
      if (initial) {
        await api.updateCustomerVoice(initial.id, payload)
        onToast('Updated')
      } else {
        await api.createCustomerVoice({ customerId, ...payload })
        onToast('Logged')
      }
      onSaved()
    } catch (e) { onToast(e instanceof ApiError ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 520, maxHeight: '85vh', borderRadius: 14, overflow: 'auto', padding: '18px 22px' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{initial ? 'Edit feedback' : 'Log feedback'}</div>
        <div style={{ fontSize: 12, color: '#5C5C74', marginTop: 2, marginBottom: 14 }}>For {customerName}</div>

        <div style={fieldLabel}>Kind</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {VOICE_KINDS.map((k) => {
            const on = kind === k
            const meta = KIND_META[k]
            return (
              <button
                key={k}
                type="button"
                onClick={() => { setKind(k); if (k !== 'nps' && k !== 'csat') setRating('') }}
                style={{
                  background: on ? meta.color : '#fff',
                  color: on ? '#fff' : meta.color,
                  border: `1px solid ${on ? meta.color : '#E5E7F0'}`,
                  borderRadius: 8, padding: '6px 12px',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <span>{meta.icon}</span>{meta.label}
              </button>
            )
          })}
        </div>

        {needsRating && (
          <>
            <div style={fieldLabel}>Rating ({ratingMin}-{ratingMax})</div>
            <input
              type="number"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              min={ratingMin}
              max={ratingMax}
              style={{ ...inp, marginBottom: 12 }}
            />
          </>
        )}

        <div style={fieldLabel}>Feedback text *</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="What did the customer say?"
          style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={fieldLabel}>Source</div>
            <select value={source} onChange={(e) => setSource(e.target.value as VoiceSource | '')} style={inp}>
              <option value="">(unspecified)</option>
              {VOICE_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Topic</div>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="pricing / support / onboarding"
              style={inp}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : (initial ? 'Save' : 'Log feedback')}
          </button>
        </div>
      </div>
    </div>
  )
}

const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none' }
const ghostBtn: CSSProperties = { background: '#fff', color: '#3B3B52', border: '1px solid #E5E7F0', borderRadius: 9, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
const ghostBtnSm: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 6, padding: '3px 8px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }
const inp: CSSProperties = { width: '100%', border: '1px solid #E5E7F0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const fieldLabel: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#8888A0', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }
