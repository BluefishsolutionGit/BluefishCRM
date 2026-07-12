import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { OpportunityDto } from '@bluefish/shared'
import { api } from '../lib/api'

const STAGE_COLOR: Record<string, string> = { qualification: '#2A6FDB', discovery: '#1F5AC2', proposal: '#B4650A', negotiation: '#6C55E0', closed_won: '#0E9C7E', closed_lost: '#8888A0' }

const fmt = (n: number) => n >= 1_000_000 ? '฿' + (n / 1e6).toFixed(1) + 'M' : '฿' + Math.round(n / 1e3) + 'K'

export default function MobileOpportunities() {
  const [rows, setRows] = useState<OpportunityDto[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { api.opportunities().then((r) => { setRows(r); setLoading(false) }).catch(() => setLoading(false)) }, [])

  const grouped = rows.reduce<Record<string, OpportunityDto[]>>((acc, o) => {
    (acc[o.stage] ??= []).push(o)
    return acc
  }, {})
  const stages = ['qualification', 'discovery', 'proposal', 'negotiation', 'closed_won']

  return (
    <div style={{ padding: '16px 18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 19, fontWeight: 700 }}>Deals</div>
        <div style={{ fontSize: 12, color: '#5C5C74' }}>{rows.length}</div>
      </div>
      {loading && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {stages.map((s) => (
        (grouped[s] ?? []).length > 0 && (
          <div key={s}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: STAGE_COLOR[s] }} />
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#5C5C74' }}>{s.replace('_', ' ').toUpperCase()}</div>
              <div style={{ fontSize: 11, color: '#8888A0' }}>· {grouped[s].length}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {grouped[s].map((o) => (
                <div
                  key={o.id}
                  onClick={() => navigate('/pipeline')}
                  style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 11, padding: '10px 12px', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{o.title}</div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center' }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#1E1E30' }}>{fmt(o.value)}</div>
                    <div style={{ fontSize: 11, color: '#5C5C74' }}>· {o.probability}%</div>
                    <div style={{ flex: 1 }} />
                    <div style={{ fontSize: 10.5, color: '#8888A0' }}>{o.customerName ?? ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ))}
    </div>
  )
}
