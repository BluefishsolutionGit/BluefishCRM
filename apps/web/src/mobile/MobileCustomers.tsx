import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CustomerDto } from '@bluefish/shared'
import { api } from '../lib/api'

export default function MobileCustomers() {
  const [rows, setRows] = useState<CustomerDto[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { api.customers().then((r) => { setRows(r); setLoading(false) }).catch(() => setLoading(false)) }, [])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((c) => c.name.toLowerCase().includes(query) || (c.industry ?? '').toLowerCase().includes(query))
  }, [rows, q])

  return (
    <div style={{ padding: '16px 18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 19, fontWeight: 700 }}>Customers</div>
      <input
        placeholder="Search company or industry…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ padding: '10px 12px', border: '1px solid #D0D0DF', borderRadius: 11, fontSize: 14, outline: 'none' }}
      />
      {loading && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {!loading && filtered.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No customers.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((c) => (
          <div
            key={c.id}
            onClick={() => navigate(`/m/customers/${c.id}`)}
            style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '12px 14px', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#EEF2FF', color: '#2E1A6B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                {c.name.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 11.5, color: '#5C5C74', marginTop: 2 }}>{c.industry || '—'} · {c.city || '—'}</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, background: c.status === 'Active' ? '#E5F8ED' : '#F1F1F5', color: c.status === 'Active' ? '#0E6E4E' : '#5C5C74', padding: '3px 7px', borderRadius: 999 }}>
                {c.status.toUpperCase()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
