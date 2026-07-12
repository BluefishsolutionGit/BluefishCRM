import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LeadDto } from '@bluefish/shared'
import { api } from '../lib/api'

const STATUS_COLOR: Record<string, string> = { New: '#2A6FDB', Contacted: '#B4650A', Qualified: '#0E9C7E', 'AI Sourced': '#6C55E0', Converted: '#0E9C7E', Lost: '#8888A0' }

export default function MobileLeads() {
  const [rows, setRows] = useState<LeadDto[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { api.leads().then((r) => { setRows(r); setLoading(false) }).catch(() => setLoading(false)) }, [])

  return (
    <div style={{ padding: '16px 18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 19, fontWeight: 700 }}>Leads</div>
        <div style={{ fontSize: 12, color: '#5C5C74' }}>{rows.length}</div>
      </div>
      {loading && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {!loading && rows.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>No leads.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((l) => (
          <div
            key={l.id}
            onClick={() => navigate('/leads')}
            style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '12px 14px', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{l.name}</div>
              <div style={{ fontSize: 10, fontWeight: 700, background: '#F1F1F5', color: STATUS_COLOR[l.status] ?? '#5C5C74', padding: '3px 7px', borderRadius: 999 }}>
                {l.status.toUpperCase()}
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: '#5C5C74', marginTop: 4 }}>
              {l.companyName ?? '—'} · Score {l.score}
            </div>
            {l.email && <div style={{ fontSize: 11, color: '#8888A0', marginTop: 2 }}>{l.email}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
