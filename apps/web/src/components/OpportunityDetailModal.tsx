import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { ActivityDto, ActivityType, CreateActivityDto, OpportunityDto, OpportunityStage, UpdateOpportunityDto } from '@bluefish/shared'
import { SERVICE_LINES } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'
import { useAuth } from '../lib/AuthContext'

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
  const [tab, setTab] = useState<'details' | 'activities'>('details')
  const [activities, setActivities] = useState<ActivityDto[]>([])
  const [addingActivity, setAddingActivity] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<UpdateOpportunityDto>({})
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('opportunity:write')

  useEffect(() => {
    if (!opp) return
    setForm({
      title: opp.title,
      stage: opp.stage,
      value: opp.value,
      probability: opp.probability,
      closeDate: opp.closeDate ?? undefined,
      serviceOrProduct: opp.serviceOrProduct ?? undefined,
      competitor: opp.competitor ?? undefined,
      notes: opp.notes ?? undefined,
    })
    api.activities({ opportunityId: opp.id }).then(setActivities).catch(() => setActivities([]))
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
        closeDate: form.closeDate || undefined,
      }
      const updated = await api.updateOpportunity(opp.id, patch)
      toast('Saved')
      onChanged(updated)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Save failed')
    } finally { setSaving(false) }
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
          {(['details', 'activities'] as const).map((t) => (
            <div key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
              {t === 'details' ? 'Details & Notes' : `Activities (${activities.length})`}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>
          {tab === 'details' && (
            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                <Field label="Close date">
                  <input disabled={!canWrite} type="date" value={form.closeDate?.slice(0, 10) ?? ''} onChange={(e) => set('closeDate', e.target.value || undefined)} style={inp} />
                </Field>
                <Field label="Competitor">
                  <input disabled={!canWrite} value={form.competitor ?? ''} onChange={(e) => set('competitor', e.target.value)} placeholder="e.g. AlphaSoft ERP" style={inp} />
                </Field>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Notes (internal — visible on this deal only)">
                    <textarea
                      disabled={!canWrite}
                      value={form.notes ?? ''}
                      onChange={(e) => set('notes', e.target.value)}
                      rows={5}
                      placeholder="Meeting notes, next steps, decision maker, blockers…"
                      style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </Field>
                </div>
              </div>
              {opp.aiHint && (
                <div style={{ background: '#F4F1FD', border: '1px solid #DCD4F6', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#4A3AB8', display: 'flex', gap: 8 }}>
                  <span>✦</span><span><b>AI suggestion:</b> {opp.aiHint}</span>
                </div>
              )}
              {canWrite && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
                  <button type="submit" disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
              )}
            </form>
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
        <Field label="Description (optional)">
          <textarea rows={2} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Agenda, prep notes…" style={{ ...inp, resize: 'vertical' }} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
        <button type="submit" disabled={saving || !form.title.trim()} style={primaryBtn}>{saving ? 'Adding…' : 'Add activity'}</button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5C5C74', marginBottom: 4 }}>{label}</div>
      {children}
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
