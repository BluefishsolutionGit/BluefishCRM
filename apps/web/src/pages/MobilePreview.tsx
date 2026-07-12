import type { CSSProperties, ReactNode } from 'react'

export default function MobilePreview() {
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px', animation: 'fadeUp .3s ease' }}>
      <div style={{ marginBottom: 6, fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 600 }}>Mobile companion</div>
      <div style={{ fontSize: 13, color: '#5C5C74', marginBottom: 20 }}>
        Responsive web + Android/iOS apps · camera card scan, GPS check-in, voice notes, offline drafts, push notifications
      </div>
      <div style={{ display: 'flex', gap: 44, justifyContent: 'center', alignItems: 'flex-start', zoom: 0.78 }}>
        <IOSFrame>
          <div style={{ height: '100%', background: '#F4F6F1', display: 'flex', flexDirection: 'column', fontFamily: "'IBM Plex Sans Thai', sans-serif" }}>
            <div style={{ padding: '16px 18px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 19, fontWeight: 700 }}>Hi, Nattaya</div>
                  <div style={{ fontSize: 12, color: '#5C5C74' }}>Tue 7 Jul · 3 activities today</div>
                </div>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#2A6FDB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>NP</div>
              </div>
              <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
                <div style={{ flex: 1, background: '#2E1A6B', color: '#fff', borderRadius: 13, padding: '12px 13px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: '#A99FD0' }}>PIPELINE</div>
                  <div style={{ fontFamily: "'Space Grotesk'", fontSize: 19, fontWeight: 700, marginTop: 2 }}>฿31.6M</div>
                </div>
                <div style={miniCard}>
                  <div style={miniLabel}>MTD</div>
                  <div style={miniValue}>฿9.4M</div>
                </div>
                <div style={miniCard}>
                  <div style={miniLabel}>TASKS</div>
                  <div style={miniValue}>5</div>
                </div>
              </div>
            </div>
            <div style={{ background: '#F7EBD9', margin: '4px 18px 0', borderRadius: 11, padding: '9px 13px', display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#B4650A' }} />
              <div style={{ fontSize: 11.5, color: '#7A5210', fontWeight: 600 }}>Offline — 2 drafts will sync when connected</div>
            </div>
            <div style={{ padding: '14px 18px', flex: 1, overflow: 'auto' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#8888A0', letterSpacing: '.06em', marginBottom: 8 }}>TODAY</div>
              <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '13px 14px', marginBottom: 9 }}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 3, background: '#B4650A' }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>Site visit — Siam Precision</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#5C5C74' }}>09:30</div>
                </div>
                <div style={{ fontSize: 11.5, color: '#5C5C74', margin: '5px 0 9px', paddingLeft: 17 }}>Bangpoo Industrial Estate, Samut Prakan</div>
                <div style={{ display: 'flex', gap: 8, paddingLeft: 17 }}>
                  <div style={{ background: '#2A6FDB', color: '#fff', borderRadius: 8, fontSize: 11.5, fontWeight: 700, padding: '7px 13px' }}>📍 GPS check-in</div>
                  <div style={{ border: '1px solid #E5E7F0', borderRadius: 8, fontSize: 11.5, fontWeight: 700, padding: '7px 13px', background: '#fff' }}>Voice note</div>
                </div>
              </div>
              <div style={activityCard}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 3, background: '#6C55E0' }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>Demo — Siam Data Center</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#5C5C74' }}>14:00</div>
                </div>
              </div>
              <div style={{ ...activityCard, marginBottom: 0 }}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 3, background: '#1F5AC2' }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>Call — Krungthep Foods</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#5C5C74' }}>16:30</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
                <div style={dashedTile}>📷 Scan business card</div>
                <div style={dashedTile}>🎙 Log voice note</div>
              </div>
            </div>
            <MobileTabs activeIdx={0} />
          </div>
        </IOSFrame>
        <IOSFrame>
          <div style={{ height: '100%', background: '#F4F6F1', display: 'flex', flexDirection: 'column', fontFamily: "'IBM Plex Sans Thai', sans-serif", position: 'relative' }}>
            <div style={{ margin: '10px 14px 0', background: '#2E1A6B', borderRadius: 15, padding: '11px 14px', display: 'flex', gap: 10, alignItems: 'center', color: '#fff', boxShadow: '0 8px 22px rgba(14,31,25,.25)' }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: '#06C755', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>L</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>LINE · คุณพิมพ์ชนก อารีย์</div>
                <div style={{ fontSize: 11, color: '#B4ABDD', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ขอใบเสนอราคาเวอร์ชันล่าสุดค่ะ</div>
              </div>
              <div style={{ fontSize: 10, color: '#A99FD0' }}>now</div>
            </div>
            <div style={{ padding: '16px 18px 8px' }}>
              <div style={{ fontSize: 19, fontWeight: 700 }}>Pipeline</div>
              <div style={{ fontSize: 12, color: '#5C5C74' }}>Q3 · ฿31.6M open</div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '6px 18px 80px' }}>
              <div style={groupLabel}>NEGOTIATION · ฿9.8M</div>
              <PipeCard title="Factory Automation Phase 2" sub="Siam Precision · ฿4.2M · 70%" />
              <PipeCard title="Solar PPA — Rooftop 2MW" sub="Lanna Solar · ฿5.6M · 80%" />
              <div style={{ ...groupLabel, marginTop: 12 }}>PROPOSAL · ฿16.8M</div>
              <PipeCard title="Hospital ERP Integration" sub="Thonburi Medical · ฿7.8M · 55%">
                <div style={{ marginTop: 8, background: '#F4F1FD', borderRadius: 8, padding: '6px 9px', fontSize: 10.5, color: '#4A3AB8', fontWeight: 600 }}>
                  ✦ Quote viewed 3× today — follow up before 16:00
                </div>
              </PipeCard>
              <PipeCard title="Water Treatment SCADA" sub="EastWater · ฿3.0M · 60%" />
              <PipeCard title="Data Center Fit-out" sub="Siam Data Center · ฿6.0M · 45%" />
            </div>
            <div style={{ position: 'absolute', right: 18, bottom: 86, width: 52, height: 52, borderRadius: '50%', background: '#2A6FDB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, boxShadow: '0 10px 22px rgba(11,107,83,.4)' }}>+</div>
            <MobileTabs activeIdx={3} />
          </div>
        </IOSFrame>
      </div>
    </div>
  )
}

function IOSFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 393,
        height: 852,
        borderRadius: 44,
        background: '#111',
        padding: 12,
        boxShadow: '0 30px 80px -20px rgba(30,26,48,.35)',
        flex: 'none',
      }}
    >
      <div style={{ width: '100%', height: '100%', borderRadius: 32, background: '#fff', overflow: 'hidden', position: 'relative' }}>
        {children}
      </div>
    </div>
  )
}

function PipeCard({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '13px 14px', marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: '#5C5C74', marginTop: 2 }}>{sub}</div>
      {children}
    </div>
  )
}

function MobileTabs({ activeIdx }: { activeIdx: number }) {
  const tabs = [
    { label: 'Home', d: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
    { label: 'Customers', d: 'M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c0-3.3 2.7-6 6-6s6 2.7 6 6' },
    { label: 'Leads', d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z' },
    { label: 'Deals', d: 'M4 4h4.5v16H4z M9.75 4h4.5v11h-4.5z M15.5 4H20v8h-4.5z' },
    { label: 'Tasks', d: 'M4 6.5h16V20H4z M4 11h16 M8.5 3.5v5 M15.5 3.5v5' },
  ]
  return (
    <div style={{ background: '#fff', borderTop: '1px solid #E5E7F0', display: 'flex', padding: '10px 6px 6px', position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      {tabs.map((t, i) => {
        const isActive = i === activeIdx
        const color = isActive ? '#2A6FDB' : '#8888A0'
        const weight = isActive ? 700 : 600
        return (
          <div key={t.label} style={{ flex: 1, textAlign: 'center', color }}>
            <svg viewBox="0 0 24 24" width="19" height="19">
              <path d={t.d} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" />
            </svg>
            <div style={{ fontSize: 9.5, fontWeight: weight }}>{t.label}</div>
          </div>
        )
      })}
    </div>
  )
}

const miniCard: CSSProperties = { flex: 1, background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '12px 13px' }
const miniLabel: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: '#8888A0' }
const miniValue: CSSProperties = { fontFamily: "'Space Grotesk'", fontSize: 19, fontWeight: 700, marginTop: 2 }
const activityCard: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '13px 14px', marginBottom: 9 }
const dashedTile: CSSProperties = { flex: 1, border: '1.5px dashed #D0D0DF', borderRadius: 13, padding: 12, textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: '#5C5C74' }
const groupLabel: CSSProperties = { fontSize: 11, fontWeight: 700, color: '#8888A0', letterSpacing: '.06em', margin: '8px 0 7px' }
