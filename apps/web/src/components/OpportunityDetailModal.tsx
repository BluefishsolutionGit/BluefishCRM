import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react'
import type { ActivityDto, ActivityType, CreateActivityDto, DocumentDto, ManagerHintPriority, OpportunityDto, OpportunityStage, UpdateOpportunityDto } from '@bluefish/shared'
import { MANAGER_HINT_PRIORITIES, SERVICE_LINES } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'
import VoiceInputButton from './VoiceInputButton'
import DocumentViewer, { type ViewableVersion } from './DocumentViewer'

interface Props {
  opp: OpportunityDto | null
  onClose: () => void
  onChanged: (updated: OpportunityDto) => void
  onDeleted: (id: string) => void
}

const STAGES: OpportunityStage[] = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost']
const STAGE_COLOR: Record<OpportunityStage, string> = {
  Qualification: '#8888A0', Proposal: '#1F5AC2', Negotiation: '#B4650A', Won: '#0E9C7E', Lost: '#C0392B',
}
const ACTIVITY_TYPES: ActivityType[] = ['meeting', 'call', 'visit', 'demo', 'task', 'follow_up', 'email']
const ACT_ICON: Record<ActivityType, string> = {
  meeting: '👥', call: '📞', visit: '📍', demo: '🎥', task: '✓', follow_up: '↻', email: '✉',
}
const fmt = (n: number) => n >= 1e6 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'

export default function OpportunityDetailModal({ opp, onClose, onChanged, onDeleted }: Props) {
  const [tab, setTab] = useState<'details' | 'activities' | 'attachments'>('details')
  const [activities, setActivities] = useState<ActivityDto[]>([])
  const [attachments, setAttachments] = useState<DocumentDto[]>([])
  const [addingActivity, setAddingActivity] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<UpdateOpportunityDto>({})
  const toast = useToast()
  const { hasPermission, user } = useAuth()
  const canWrite = hasPermission('opportunity:write')
  const canEditManagerHint = user?.role === 'admin' || user?.role === 'sales_manager'

  const reloadAttachments = (id: string) =>
    api.documents({ opportunityId: id }).then(setAttachments).catch(() => setAttachments([]))

  useEffect(() => {
    if (!opp) return
    setForm({
      title: opp.title,
      stage: opp.stage,
      value: opp.value,
      probability: opp.probability,
      closeDate: opp.closeDate ?? undefined,
      bidDeadline: opp.bidDeadline ?? undefined,
      decisionDate: opp.decisionDate ?? undefined,
      serviceOrProduct: opp.serviceOrProduct ?? undefined,
      competitor: opp.competitor ?? undefined,
      managerHint: opp.managerHint ?? undefined,
      managerHintPriority: opp.managerHintPriority ?? undefined,
      notes: opp.notes ?? undefined,
    })
    api.activities({ opportunityId: opp.id }).then(setActivities).catch(() => setActivities([]))
    reloadAttachments(opp.id)
  }, [opp])

  if (!opp) return null

  const set = <K extends keyof UpdateOpportunityDto>(k: K, v: UpdateOpportunityDto[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!canWrite) return
    setSaving(true)
    try {
      const patch: UpdateOpportunityDto = {
        ...form,
        // Empty strings should clear the field (send null-equivalent by leaving undefined)
        serviceOrProduct: form.serviceOrProduct || undefined,
        competitor: form.competitor || undefined,
        notes: form.notes || undefined,
        managerHint: form.managerHint || undefined,
        managerHintPriority: form.managerHint ? (form.managerHintPriority ?? 'info') : undefined,
        closeDate: form.closeDate || undefined,
        bidDeadline: form.bidDeadline || undefined,
        decisionDate: form.decisionDate || undefined,
      }
      const updated = await api.updateOpportunity(opp.id, patch)
      toast('Saved')
      onChanged(updated)
      return true
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Save failed')
      return false
    } finally { setSaving(false) }
  }

  const saveAndClose = async (e?: FormEvent) => {
    e?.preventDefault()
    if (await save()) onClose()
  }

  const remove = async () => {
    if (!window.confirm(`Delete deal "${opp.title}"? This cannot be undone.`)) return
    try {
      await api.deleteOpportunity(opp.id)
      toast('Deal deleted')
      onDeleted(opp.id)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Delete failed')
    }
  }

  const onActivityAdded = (a: ActivityDto) => {
    setActivities((all) => [a, ...all])
    setAddingActivity(false)
    toast(`Activity added — visible on Activities page ${new Date(a.scheduledAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`)
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 22px 12px', borderBottom: '1px solid #E5E7F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: STAGE_COLOR[opp.stage], flex: 'none' }} />
            <input
              value={form.title ?? ''}
              onChange={(e) => set('title', e.target.value)}
              onBlur={() => form.title && form.title !== opp.title && save()}
              disabled={!canWrite}
              style={{ flex: 1, fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 700, border: 'none', outline: 'none', padding: 0, background: 'transparent' }}
            />
            <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 22, color: '#8888A0', padding: '0 4px' }}>×</div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12, color: '#5C5C74', alignItems: 'center' }}>
            <span><b>{opp.customerName}</b></span>
            <span>·</span>
            <span>Owner {opp.ownerName}</span>
            <span>·</span>
            <span>{fmt(opp.value)}</span>
            <span style={{ flex: 1 }} />
            {canWrite && <div onClick={remove} style={{ ...ghostBtn, color: '#C0392B', borderColor: '#F5B7B1' }}>Delete deal</div>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E5E7F0', padding: '0 22px' }}>
          {(['details', 'activities', 'attachments'] as const).map((t) => (
            <div key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
              {t === 'details' ? 'Details & Notes'
                : t === 'activities' ? `Activities (${activities.length})`
                : `Attachments (${attachments.length})`}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>
          {tab === 'details' && (
            <form onSubmit={saveAndClose} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px' }}>
                <Field label="Stage">
                  <select disabled={!canWrite} value={form.stage ?? opp.stage} onChange={(e) => set('stage', e.target.value as OpportunityStage)} style={inp}>
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Service pipeline">
                  <select disabled={!canWrite} value={form.serviceOrProduct ?? ''} onChange={(e) => set('serviceOrProduct', e.target.value || undefined)} style={inp}>
                    <option value="">— No service —</option>
                    {SERVICE_LINES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Amount (฿)">
                  <input disabled={!canWrite} type="number" min={0} value={form.value ?? 0} onChange={(e) => set('value', Number(e.target.value))} style={inp} />
                </Field>
                <Field label="Probability %">
                  <input disabled={!canWrite} type="number" min={0} max={100} value={form.probability ?? 0} onChange={(e) => set('probability', Number(e.target.value))} style={inp} />
                </Field>
                <Field label="Close date" hint="Expected close while open · actual close date once Won/Lost">
                  <input disabled={!canWrite} type="date" value={form.closeDate?.slice(0, 10) ?? ''} onChange={(e) => set('closeDate', e.target.value || undefined)} style={inp} />
                </Field>
                <Field label="Competitor">
                  <input disabled={!canWrite} value={form.competitor ?? ''} onChange={(e) => set('competitor', e.target.value)} placeholder="e.g. AlphaSoft ERP" style={inp} />
                </Field>
                <Field label="Bid deadline" hint="วันครบกำหนดยื่นข้อเสนอ / TOR submission cut-off">
                  <input disabled={!canWrite} type="date" value={form.bidDeadline?.slice(0, 10) ?? ''} onChange={(e) => set('bidDeadline', e.target.value || undefined)} style={inp} />
                </Field>
                <Field label="Decision date" hint="วันประกาศผล / award announcement">
                  <input disabled={!canWrite} type="date" value={form.decisionDate?.slice(0, 10) ?? ''} onChange={(e) => set('decisionDate', e.target.value || undefined)} style={inp} />
                </Field>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#5C5C74' }}>Notes (internal — visible on this deal only)</div>
                    <div style={{ flex: 1 }} />
                    {canWrite && (
                      <VoiceInputButton
                        value={form.notes ?? ''}
                        onChange={(next) => set('notes', next)}
                        size="sm"
                        label="Dictate deal notes"
                      />
                    )}
                  </div>
                  <textarea
                    disabled={!canWrite}
                    value={form.notes ?? ''}
                    onChange={(e) => set('notes', e.target.value)}
                    rows={5}
                    placeholder="Meeting notes, next steps, decision maker, blockers…"
                    style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
              </div>
              {canEditManagerHint ? (
                <ManagerHintEditor
                  hint={form.managerHint ?? ''}
                  priority={form.managerHintPriority ?? null}
                  onHintChange={(v) => set('managerHint', v)}
                  onPriorityChange={(p) => set('managerHintPriority', p)}
                  role={user?.role === 'admin' ? 'admin' : 'manager'}
                />
              ) : opp.managerHint ? (
                <ManagerHintDisplay hint={opp.managerHint} priority={opp.managerHintPriority} />
              ) : null}
              {canWrite && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
                  <button type="submit" disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
              )}
            </form>
          )}

          {tab === 'attachments' && (
            <OpportunityAttachments
              opp={opp}
              docs={attachments}
              canWrite={canWrite}
              onReload={() => reloadAttachments(opp.id)}
            />
          )}

          {tab === 'activities' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#5C5C74' }}>Activities linked to this deal are visible on the <b>Activities</b> page.</div>
                <div style={{ flex: 1 }} />
                {canWrite && <div onClick={() => setAddingActivity(true)} style={primaryBtn}>+ Add activity</div>}
              </div>
              {addingActivity && (
                <AddActivityForm
                  opp={opp}
                  onCancel={() => setAddingActivity(false)}
                  onCreated={onActivityAdded}
                />
              )}
              {activities.length === 0 && !addingActivity && (
                <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No activities logged for this deal yet.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activities.map((a) => (
                  <div key={a.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', border: '1px solid #E5E7F0', borderRadius: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#F1F1F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{ACT_ICON[a.type as ActivityType] ?? '•'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span>{a.title}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, background: '#F1F1F5', color: '#5C5C74', padding: '2px 6px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>{a.type}</span>
                        {a.status === 'completed' && <span style={{ fontSize: 10.5, fontWeight: 700, background: '#E5F8ED', color: '#0E6E4E', padding: '2px 6px', borderRadius: 6 }}>DONE</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#5C5C74', marginTop: 3 }}>
                        {new Date(a.scheduledAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {a.ownerName ? ` · ${a.ownerName}` : ''}
                      </div>
                      {a.description && <div style={{ fontSize: 12, color: '#3B3B52', marginTop: 6, whiteSpace: 'pre-wrap' }}>{a.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Manager suggestion — priority-driven callout ─────────────────────
// Each priority tier is a distinct visual so a rep triaging their pipeline
// can spot an urgent coach line from across the room, not read into it.
export const MANAGER_HINT_STYLE: Record<ManagerHintPriority, {
  bg: string; border: string; fg: string; accent: string; icon: string; label: string; hint: string
}> = {
  info: {
    bg: '#F4F1FD', border: '#DCD4F6', fg: '#4A3AB8', accent: '#6C55E0',
    icon: '✦', label: 'Info', hint: 'Gentle nudge — a heads-up or observation.',
  },
  watch: {
    bg: '#FEF3E2', border: '#F5D9AC', fg: '#8A4A00', accent: '#D2601A',
    icon: '⚠', label: 'Watch', hint: 'Needs attention — deadline or risk approaching.',
  },
  urgent: {
    bg: '#FDECEA', border: '#F5B7B1', fg: '#A11E10', accent: '#C0392B',
    icon: '🔥', label: 'Urgent', hint: 'Act today — deal will slip otherwise.',
  },
}

function ManagerHintEditor({ hint, priority, onHintChange, onPriorityChange, role }: {
  hint: string
  priority: ManagerHintPriority | null
  onHintChange: (v: string) => void
  onPriorityChange: (p: ManagerHintPriority) => void
  role: 'admin' | 'manager'
}) {
  const effective = priority ?? 'info'
  const tone = MANAGER_HINT_STYLE[effective]
  return (
    <div style={{ background: tone.bg, border: `1.5px solid ${tone.border}`, borderRadius: 12, padding: '12px 14px', transition: 'background .12s, border-color .12s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14 }}>{tone.icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: tone.fg, letterSpacing: '.02em' }}>Manager suggestion</span>
        <span style={{ fontSize: 10, background: '#fff', color: tone.accent, padding: '1px 7px', borderRadius: 5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', border: `1px solid ${tone.border}` }}>{role}</span>
        <div style={{ flex: 1 }} />
        <PriorityChips value={priority} onChange={onPriorityChange} />
      </div>
      <textarea
        value={hint}
        onChange={(e) => onHintChange(e.target.value)}
        rows={2}
        placeholder="Coach the deal owner — next best move, blockers to raise, timing cues…"
        style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', background: '#fff', color: tone.fg, borderColor: tone.border }}
      />
      <div style={{ fontSize: 11, color: tone.fg, opacity: 0.75, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11 }}>{tone.hint}</span>
        <div style={{ flex: 1 }} />
        <span>Visible to the deal owner on the card. Only Manager & Admin can edit.</span>
      </div>
    </div>
  )
}

function ManagerHintDisplay({ hint, priority }: { hint: string; priority: ManagerHintPriority | null }) {
  const tone = MANAGER_HINT_STYLE[priority ?? 'info']
  return (
    <div style={{
      background: tone.bg, border: `1.5px solid ${tone.border}`, borderRadius: 12,
      padding: '10px 14px', fontSize: 12.5, color: tone.fg,
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 14, lineHeight: 1.2 }}>{tone.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, fontWeight: 800 }}>
          Manager suggestion
          <span style={{ background: tone.accent, color: '#fff', fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.06em' }}>{tone.label}</span>
        </div>
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{hint}</div>
      </div>
    </div>
  )
}

function PriorityChips({ value, onChange }: { value: ManagerHintPriority | null; onChange: (p: ManagerHintPriority) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {MANAGER_HINT_PRIORITIES.map((p) => {
        const t = MANAGER_HINT_STYLE[p]
        const active = (value ?? 'info') === p
        return (
          <div
            key={p}
            onClick={() => onChange(p)}
            title={t.hint}
            style={{
              cursor: 'pointer', fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em',
              padding: '3px 9px', borderRadius: 999,
              background: active ? t.accent : '#fff',
              color: active ? '#fff' : t.accent,
              border: `1px solid ${active ? t.accent : t.border}`,
              display: 'flex', alignItems: 'center', gap: 3, textTransform: 'uppercase',
              transition: 'background .12s, color .12s',
            }}
          >
            <span style={{ fontSize: 11 }}>{t.icon}</span>{t.label}
          </div>
        )
      })}
    </div>
  )
}

function AddActivityForm({ opp, onCancel, onCreated }: { opp: OpportunityDto; onCancel: () => void; onCreated: (a: ActivityDto) => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const now = new Date(Date.now() + 60 * 60 * 1000)
  now.setSeconds(0, 0)
  const [form, setForm] = useState<CreateActivityDto>({
    type: 'meeting',
    title: '',
    description: '',
    scheduledAt: now.toISOString().slice(0, 16),
    ownerId: opp.ownerId || (user?.id ?? ''),
    customerId: opp.customerId,
    opportunityId: opp.id,
  })
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof CreateActivityDto>(k: K, v: CreateActivityDto[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const created = await api.createActivity({
        ...form,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
      })
      onCreated(created)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Add activity failed')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} style={{ border: '1px solid #B7CFF3', background: '#F4F8FE', borderRadius: 11, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#2A6FDB', marginBottom: 10 }}>New activity — will link to this deal + {opp.customerName}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '10px 12px' }}>
        <Field label="Type">
          <select value={form.type} onChange={(e) => set('type', e.target.value as ActivityType)} style={inp}>
            {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </Field>
        <Field label="Title">
          <input required autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Follow-up call with buyer" style={inp} />
        </Field>
        <Field label="When">
          <input required type="datetime-local" value={form.scheduledAt.slice(0, 16)} onChange={(e) => set('scheduledAt', e.target.value)} style={inp} />
        </Field>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5C5C74', display: 'flex', alignItems: 'center', gap: 6 }}>
          Description
          <span style={{ fontWeight: 500, color: '#8082A5' }}>(optional)</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea rows={2} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Agenda, prep notes…" style={{ ...inp, resize: 'vertical', flex: 1 }} />
          <VoiceInputButton
            value={form.description ?? ''}
            onChange={(next) => set('description', next)}
            size="sm"
            label="Dictate description"
            style={{ marginTop: 4 }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        <button type="submit" disabled={saving || !form.title.trim()} style={primaryBtn}>{saving ? 'Adding…' : 'Add activity'}</button>
      </div>
    </form>
  )
}

function OpportunityAttachments({ opp, docs, canWrite, onReload }: {
  opp: OpportunityDto; docs: DocumentDto[]; canWrite: boolean; onReload: () => void
}) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [viewing, setViewing] = useState<ViewableVersion | null>(null)

  const onFilePicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      // Scope the doc to both the opportunity and its customer — the same doc
      // then also appears in the customer's Documents list, which is what a
      // rep expects (proposal PDF is "the customer's proposal", not orphan).
      await api.uploadDocument(file, { opportunityId: opp.id, customerId: opp.customerId })
      toast('File attached'); onReload()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed')
    } finally { setUploading(false) }
  }

  const remove = async (d: DocumentDto) => {
    if (!window.confirm(`Remove "${d.name}"?`)) return
    try { await api.deleteDocument(d.id); toast('Removed'); onReload() }
    catch (err) { toast(err instanceof ApiError ? err.message : 'Delete failed') }
  }

  const openFile = (d: DocumentDto) => {
    if (d.kind === 'link' && d.url) { window.open(d.url, '_blank', 'noopener'); return }
    const cv = d.currentVersion
    if (!cv) return
    setViewing({ id: cv.id, filename: cv.filename, mimeType: cv.mimeType, sizeBytes: cv.sizeBytes, createdAt: cv.createdAt, uploadedByName: cv.uploadedByName, notes: cv.notes })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <div style={{ fontSize: 12, color: '#5C5C74' }}>Files attached here are also linked to <b>{opp.customerName}</b> and appear on the Documents page.</div>
        <div style={{ flex: 1 }} />
        {canWrite && (
          <>
            <input ref={fileInputRef} type="file" onChange={onFilePicked} style={{ display: 'none' }} />
            <div onClick={() => !uploading && fileInputRef.current?.click()} style={{ ...attachPrimaryBtn, opacity: uploading ? 0.5 : 1 }}>{uploading ? 'Uploading…' : '+ Upload file'}</div>
          </>
        )}
      </div>

      {docs.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No files attached to this deal yet.</div>}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {docs.map((d) => {
          const cv = d.currentVersion
          const sub = d.kind === 'link'
            ? d.url ?? ''
            : cv ? `${cv.filename} · ${Math.max(1, Math.round(cv.sizeBytes / 1024))} KB` : '—'
          return (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid #F2F3F9' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F1F1F5', color: '#5C5C74', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6.5 3h8l4 4v14h-12z M14 3v5h4.5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  onClick={() => openFile(d)}
                  title={d.kind === 'link' ? 'Open link' : 'Open in viewer'}
                  style={{ fontSize: 13, fontWeight: 700, color: '#2A6FDB', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >{d.name}</div>
                <div style={{ fontSize: 11, color: '#8888A0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ background: '#F2F3F9', color: '#5C5C74', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, marginRight: 6, textTransform: 'uppercase' }}>{d.category}</span>
                  {sub}
                  {' · '}{d.uploadedByName}
                  {cv ? ` · ${new Date(cv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}` : ''}
                </div>
              </div>
              {canWrite && (
                <div onClick={() => remove(d)} title="Remove" style={{ color: '#C0392B', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}>Remove</div>
              )}
            </div>
          )
        })}
      </div>

      {viewing && <DocumentViewer version={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

const attachPrimaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5C5C74', marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: '#8082A5', marginTop: 3, lineHeight: 1.35 }}>{hint}</div>}
    </div>
  )
}

function tabStyle(active: boolean): CSSProperties {
  return {
    padding: '10px 14px',
    fontSize: 12.5,
    fontWeight: active ? 700 : 500,
    color: active ? '#2A6FDB' : '#5C5C74',
    borderBottom: active ? '2.5px solid #2A6FDB' : '2.5px solid transparent',
    cursor: 'pointer',
    marginBottom: -1,
  }
}

const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,26,48,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }
const dialog: CSSProperties = { background: '#fff', width: '100%', maxWidth: 720, maxHeight: '90vh', borderRadius: 14, boxShadow: '0 30px 80px -30px rgba(30,26,48,.4)', display: 'flex', flexDirection: 'column' }
const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #E5E7F0', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const ghostBtn: CSSProperties = { background: '#fff', color: '#5C5C74', border: '1px solid #E5E7F0', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
