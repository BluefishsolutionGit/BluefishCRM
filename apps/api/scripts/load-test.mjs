#!/usr/bin/env node
/*
 * Load test — hits critical read paths with N concurrent users, asserts p95 < 3s.
 *
 * Zero-dep: uses fetch + Promise.allSettled. Not as sophisticated as k6 or
 * autocannon, but adequate for our NFR gate (50 users, < 3s p95).
 *
 * Usage:
 *   BASE_URL=http://localhost:4000/api \
 *   EMAIL=admin@bluefishsolution.com PASSWORD=demo1234 \
 *   USERS=50 DURATION_SEC=30 P95_TARGET_MS=3000 \
 *   node scripts/load-test.mjs
 *
 * Note: start the API with `THROTTLE_DISABLE=1` for load testing — otherwise
 * the built-in per-IP rate limit (default 1000/min) will 429 the test itself.
 *
 * Exit code 0 if p95 <= target, 1 otherwise (CI-friendly).
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:4000/api'
const EMAIL = process.env.EMAIL ?? 'admin@bluefishsolution.com'
const PASSWORD = process.env.PASSWORD ?? 'demo1234'
const USERS = Number(process.env.USERS ?? 50)
const DURATION_SEC = Number(process.env.DURATION_SEC ?? 30)
const P95_TARGET_MS = Number(process.env.P95_TARGET_MS ?? 3000)

const SCENARIOS = [
  { name: 'dashboard.executive', path: '/dashboards/executive' },
  { name: 'dashboard.sales', path: '/dashboards/sales' },
  { name: 'dashboard.pipeline', path: '/dashboards/pipeline' },
  { name: 'customers.list', path: '/customers' },
  { name: 'leads.list', path: '/leads' },
  { name: 'opportunities.list', path: '/opportunities' },
  { name: 'activities.list', path: '/activities' },
  { name: 'contracts.list', path: '/contracts' },
  { name: 'quotations.list', path: '/quotations' },
]

const results = new Map()
for (const s of SCENARIOS) results.set(s.name, { count: 0, errors: 0, samples: [] })

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status}`)
  const data = await res.json()
  if (!data.accessToken) throw new Error(`login returned no token — MFA challenge? ${JSON.stringify(data)}`)
  return data.accessToken
}

const statusTally = new Map()

async function hit(token, scenario) {
  const start = Date.now()
  try {
    const res = await fetch(BASE + scenario.path, { headers: { authorization: `Bearer ${token}` } })
    await res.arrayBuffer()
    const elapsed = Date.now() - start
    const r = results.get(scenario.name)
    r.count++
    r.samples.push(elapsed)
    statusTally.set(res.status, (statusTally.get(res.status) ?? 0) + 1)
    if (!res.ok) r.errors++
  } catch (e) {
    const r = results.get(scenario.name)
    r.count++
    r.errors++
    r.samples.push(Date.now() - start)
    statusTally.set('EXC:' + (e.code ?? e.message?.slice(0, 40)), (statusTally.get('EXC:' + (e.code ?? e.message?.slice(0, 40))) ?? 0) + 1)
  }
}

function percentile(samples, p) {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)))
  return sorted[idx]
}

async function virtualUser(token, endAt) {
  while (Date.now() < endAt) {
    const scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)]
    await hit(token, scenario)
  }
}

async function main() {
  console.log(`— Bluefish CRM load test`)
  console.log(`  base = ${BASE}`)
  console.log(`  ${USERS} concurrent users for ${DURATION_SEC}s, p95 target ${P95_TARGET_MS}ms`)
  console.log('')

  console.log('Logging in as admin…')
  const token = await login()
  console.log('  ✓ token acquired')

  console.log(`Warming up…`)
  await Promise.all(SCENARIOS.map((s) => hit(token, s)))
  for (const r of results.values()) { r.count = 0; r.errors = 0; r.samples = [] }

  console.log(`Starting ${USERS} virtual users…`)
  const endAt = Date.now() + DURATION_SEC * 1000
  await Promise.all(Array.from({ length: USERS }, () => virtualUser(token, endAt)))

  const all = []
  let totalReq = 0, totalErr = 0
  console.log('\n── per-scenario ──')
  console.log('scenario                       req    err    p50     p95     p99')
  for (const [name, r] of results) {
    totalReq += r.count
    totalErr += r.errors
    all.push(...r.samples)
    console.log(
      `${name.padEnd(30)} ${String(r.count).padStart(5)}  ${String(r.errors).padStart(5)}   ` +
        `${String(percentile(r.samples, 0.5)).padStart(5)}ms  ${String(percentile(r.samples, 0.95)).padStart(5)}ms  ${String(percentile(r.samples, 0.99)).padStart(5)}ms`
    )
  }

  const overallP50 = percentile(all, 0.5)
  const overallP95 = percentile(all, 0.95)
  const overallP99 = percentile(all, 0.99)
  const rps = totalReq / DURATION_SEC
  console.log('\n── overall ──')
  console.log(`  requests   ${totalReq}`)
  console.log(`  errors     ${totalErr} (${((totalErr / Math.max(totalReq, 1)) * 100).toFixed(2)}%)`)
  console.log(`  RPS        ${rps.toFixed(1)}`)
  console.log(`  p50        ${overallP50}ms`)
  console.log(`  p95        ${overallP95}ms`)
  console.log(`  p99        ${overallP99}ms`)

  console.log('\n── status tally ──')
  for (const [k, v] of statusTally) console.log(`  ${k}: ${v}`)

  const errorPct = (totalErr / Math.max(totalReq, 1)) * 100
  const pass = overallP95 <= P95_TARGET_MS && errorPct < 1
  console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'} — p95 ${overallP95}ms vs target ${P95_TARGET_MS}ms, errors ${errorPct.toFixed(2)}%`)
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
