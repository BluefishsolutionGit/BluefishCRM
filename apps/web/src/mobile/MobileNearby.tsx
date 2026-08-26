/**
 * Nearby / trip planner.
 *
 * Bluefish doesn't have geocoded lat/lng per customer — but our GPS check-in
 * flow (MobileHome) stamps coordinates into the activity description. This
 * screen parses those out, groups them by customer, and sorts by distance
 * from the phone's current position. Each row has a "Directions" button
 * that hands off to Google Maps (or Apple Maps on iOS).
 *
 * Reusing existing data instead of adding a schema field keeps this pass
 * cheap; a future pass can add geocoded columns + a real map library.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ActivityDto } from '@bluefish/shared'
import { api, ApiError } from '../lib/api'
import { useToast } from '../lib/ToastContext'

const backBtn: CSSProperties = { fontSize: 14, color: '#2A6FDB', cursor: 'pointer' }
const card: CSSProperties = { background: '#fff', border: '1px solid #E5E7F0', borderRadius: 13, padding: '14px 16px' }
const primaryBtn: CSSProperties = { background: '#2A6FDB', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }

interface Spot {
  lat: number
  lng: number
  customerId: string | null
  customerName: string
  activityTitle: string
  lastVisitedAt: string
  activityId: string
}

/** Matches "Location: 13.75630, 100.50180" (whatever the check-in wrote). */
const LOC_RE = /(?:Location|Coord(?:s|inates)?)\s*:?\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/i

function parseCoord(desc: string | null): { lat: number; lng: number } | null {
  if (!desc) return null
  const m = desc.match(LOC_RE)
  if (!m) return null
  const lat = Number(m[1]); const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const isIOS = /iP(hone|ad|od)/.test(typeof navigator === 'undefined' ? '' : navigator.userAgent)
const directionsUrl = (lat: number, lng: number) => isIOS
  ? `https://maps.apple.com/?daddr=${lat},${lng}`
  : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`

export default function MobileNearby() {
  const [activities, setActivities] = useState<ActivityDto[]>([])
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null)
  const [locErr, setLocErr] = useState<string | null>(null)
  const toast = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    // 60-day rolling window of activities so trip planning uses fresh data
    const from = new Date(); from.setDate(from.getDate() - 60)
    const to = new Date(); to.setDate(to.getDate() + 7)
    api.activities({ from, to })
      .then((rows) => { setActivities(rows); setLoading(false) })
      .catch((e) => { toast(e instanceof ApiError ? e.message : 'Failed'); setLoading(false) })
  }, [toast])

  useEffect(() => {
    if (!navigator.geolocation) { setLocErr('Geolocation not available'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setLocErr(err.message),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }, [])

  const spots: Spot[] = useMemo(() => {
    const raw: Spot[] = []
    for (const a of activities) {
      const c = parseCoord(a.description)
      if (!c) continue
      raw.push({
        ...c,
        customerId: a.customerId ?? null,
        customerName: a.customerName ?? '—',
        activityTitle: a.title,
        lastVisitedAt: a.scheduledAt,
        activityId: a.id,
      })
    }
    // De-dup by customer keeping the most recent point
    const byKey = new Map<string, Spot>()
    for (const s of raw.sort((a, b) => b.lastVisitedAt.localeCompare(a.lastVisitedAt))) {
      const key = s.customerId ?? `activity:${s.activityId}`
      if (!byKey.has(key)) byKey.set(key, s)
    }
    return [...byKey.values()]
  }, [activities])

  const sorted = useMemo(() => {
    if (!origin) return spots
    return [...spots].sort((a, b) => haversineKm(origin, a) - haversineKm(origin, b))
  }, [spots, origin])

  return (
    <div style={{ padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <div onClick={() => navigate(-1)} style={backBtn}>‹ Back</div>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 800, textAlign: 'center' }}>Nearby</div>
        <div style={{ width: 44 }} />
      </div>

      {origin ? (
        <div style={{ ...card, background: '#E5F8ED', borderColor: '#B5E4CB', color: '#0E6E4E', fontSize: 12 }}>
          📍 Anchor: {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)} — sorting by distance.
        </div>
      ) : locErr ? (
        <div style={{ ...card, background: '#FEF3E2', borderColor: '#F0BA95', color: '#B4650A', fontSize: 12 }}>
          {locErr} — showing customers in most-recent order.
        </div>
      ) : (
        <div style={{ ...card, color: '#8888A0', fontSize: 12 }}>Locating your device…</div>
      )}

      <div style={{ ...card, fontSize: 11.5, color: '#5C5C74' }}>
        Locations are collected from your <b>GPS Check-in</b> activities on Home. Every check-in tags the visited customer's coordinates so this screen can plan your next trip.
      </div>

      {loading && <div style={{ padding: 16, textAlign: 'center', color: '#8888A0', fontSize: 13 }}>Loading…</div>}
      {!loading && sorted.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: '#8888A0', fontSize: 13, padding: 24 }}>
          No GPS check-ins yet. Tap <b>📍 Check-in</b> on Home during a customer visit — they show up here afterwards.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map((s) => {
          const km = origin ? haversineKm(origin, s) : null
          return (
            <div key={s.customerId ?? s.activityId} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  onClick={() => s.customerId && navigate(`/m/customers/${s.customerId}`)}
                  style={{ flex: 1, minWidth: 0, cursor: s.customerId ? 'pointer' : 'default' }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.customerName}</div>
                  <div style={{ fontSize: 11, color: '#5C5C74', marginTop: 2 }}>
                    {s.activityTitle}
                    <span style={{ color: '#8888A0' }}> · {new Date(s.lastVisitedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  {km != null && (
                    <div style={{ fontFamily: "'Space Grotesk'", fontSize: 14, fontWeight: 800, color: km < 5 ? '#0E6E4E' : km < 20 ? '#3B3B52' : '#5C5C74' }}>
                      {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}
                    </div>
                  )}
                  <a href={directionsUrl(s.lat, s.lng)} target="_blank" rel="noopener noreferrer" style={primaryBtn}>Directions</a>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
