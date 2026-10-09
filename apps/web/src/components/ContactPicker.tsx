import { useEffect, useState, type CSSProperties } from 'react'
import type { ContactDto } from '@bluefish/shared'
import { api } from '../lib/api'

/**
 * Picks one of a customer's contacts — the person to reach out to for a deal.
 * Reloads whenever the customer changes; shows the picked contact's phone/email below.
 */
export default function ContactPicker({ customerId, value, onChange, disabled, autoSelectPrimary, style }: {
  customerId: string
  value: string | null | undefined
  onChange: (contactId: string | null) => void
  disabled?: boolean
  /** Pre-pick the customer's primary contact when nothing is selected yet (create flow). */
  autoSelectPrimary?: boolean
  style?: CSSProperties
}) {
  const [contacts, setContacts] = useState<ContactDto[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!customerId) { setContacts([]); return }
    let cancelled = false
    setLoading(true)
    api.contacts(customerId)
      .then((rows) => {
        if (cancelled) return
        setContacts(rows)
        if (autoSelectPrimary && !value) {
          const primary = rows.find((c) => c.isPrimary)
          if (primary) onChange(primary.id)
        }
      })
      .catch(() => { if (!cancelled) setContacts([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [customerId])

  const selected = contacts.find((c) => c.id === value)
  const placeholder = !customerId ? '— Select customer first —'
    : loading ? 'Loading…'
    : contacts.length === 0 ? '— No contacts for this customer —'
    : '— No contact —'

  return (
    <div>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled || !customerId || loading}
        style={style}
      >
        <option value="">{placeholder}</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}{c.position || c.role ? ` — ${c.position || c.role}` : ''}{c.isPrimary ? ' (Primary)' : ''}
          </option>
        ))}
      </select>
      {selected && (
        <div style={{ fontSize: 11.5, color: '#5C5C74', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {selected.phone && <a href={`tel:${selected.phone}`} style={{ color: 'inherit' }}>📞 {selected.phone}</a>}
          {selected.email && <a href={`mailto:${selected.email}`} style={{ color: 'inherit' }}>✉ {selected.email}</a>}
        </div>
      )}
    </div>
  )
}
