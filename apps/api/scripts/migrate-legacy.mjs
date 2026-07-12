#!/usr/bin/env node
/*
 * Legacy → Bluefish CRM migration script.
 *
 * Reads a CSV file from the old system and posts records to the Bluefish API.
 * Supports customers and leads. --dry-run parses + validates without writing.
 * Errors are written to <input>.errors.csv for review + retry.
 *
 * Usage:
 *   node scripts/migrate-legacy.mjs --kind=customers --file=./old-customers.csv
 *   node scripts/migrate-legacy.mjs --kind=leads --file=./old-leads.csv --dry-run
 *
 * Required env: BASE_URL, EMAIL, PASSWORD (admin account with import permission).
 *
 * CSV headers expected:
 *   customers: code,name,nameTh,industry,ownerEmail,city,address,taxId,phone,terms,status
 *   leads:     name,companyName,email,phone,source,estValue,notes,ownerEmail,status
 *
 * Owner is resolved by email to a user id via /users. Skips + records rows
 * whose owner does not exist rather than aborting the whole run.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=')
  return [k, v.length ? v.join('=') : true]
}))

if (!args.kind || !args.file) {
  console.error('Usage: --kind=customers|leads --file=path.csv [--dry-run]')
  process.exit(2)
}
if (!['customers', 'leads'].includes(args.kind)) {
  console.error('kind must be customers or leads')
  process.exit(2)
}

const BASE = process.env.BASE_URL ?? 'http://localhost:4000/api'
const EMAIL = process.env.EMAIL ?? 'admin@bluefishsolution.com'
const PASSWORD = process.env.PASSWORD ?? 'demo1234'
const DRY_RUN = Boolean(args['dry-run'])

// ── minimal CSV parser (handles quoted fields with commas, doubled quotes) ──
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false, i = 0
  while (i < text.length) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue }
      if (c === '"') { inQ = false; i++; continue }
      field += c; i++; continue
    }
    if (c === '"') { inQ = true; i++; continue }
    if (c === ',') { row.push(field); field = ''; i++; continue }
    if (c === '\r') { i++; continue }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += c; i++
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status}`)
  const data = await res.json()
  if (!data.accessToken) throw new Error('login returned no token')
  return data.accessToken
}

async function fetchUserMap(token) {
  const res = await fetch(`${BASE}/users`, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`GET /users → ${res.status}`)
  const users = await res.json()
  return new Map(users.map((u) => [u.email.toLowerCase(), u.id]))
}

async function postOne(token, path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${text.slice(0, 200)}`)
  }
  return res.json()
}

function mapCustomer(row, userMap) {
  const ownerId = userMap.get((row.ownerEmail ?? '').toLowerCase())
  if (!ownerId) throw new Error(`unknown ownerEmail "${row.ownerEmail}"`)
  return {
    code: row.code, name: row.name, nameTh: row.nameTh || null,
    industry: row.industry, ownerId, city: row.city || '', address: row.address || '',
    taxId: row.taxId || '', phone: row.phone || '', terms: row.terms || 'Net 30',
    status: row.status || 'Prospect',
  }
}

function mapLead(row, userMap) {
  const ownerId = row.ownerEmail ? userMap.get(row.ownerEmail.toLowerCase()) ?? null : null
  return {
    name: row.name, companyName: row.companyName,
    email: row.email || undefined, phone: row.phone || undefined,
    source: row.source || 'legacy_import',
    estValue: row.estValue ? Number(row.estValue) : undefined,
    notes: row.notes || undefined, ownerId,
    status: row.status || 'New',
  }
}

async function main() {
  const rawText = readFileSync(args.file, 'utf-8')
  const grid = parseCsv(rawText).filter((r) => r.some((c) => c.trim() !== ''))
  if (grid.length < 2) throw new Error('CSV has no data rows')
  const header = grid[0].map((h) => h.trim())
  const rows = grid.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
  console.log(`Parsed ${rows.length} rows from ${args.file}`)

  const token = await login()
  const userMap = await fetchUserMap(token)
  console.log(`Loaded ${userMap.size} users for ownerEmail resolution`)
  if (DRY_RUN) console.log('DRY RUN — no writes will be made')

  const errors = []
  let ok = 0
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      const body = args.kind === 'customers' ? mapCustomer(row, userMap) : mapLead(row, userMap)
      if (!DRY_RUN) {
        await postOne(token, `/${args.kind}`, body)
      }
      ok++
      if (ok % 25 === 0) console.log(`  … ${ok}/${rows.length}`)
    } catch (e) {
      errors.push({ line: i + 2, row, error: e.message })
    }
  }

  console.log(`\nDone. Success ${ok}/${rows.length}. Errors ${errors.length}.`)

  if (errors.length > 0) {
    const errPath = args.file.replace(/\.csv$/i, '') + '.errors.csv'
    const cols = [...header, '__error']
    const lines = [cols.join(',')]
    for (const e of errors) {
      const vals = cols.map((c) => c === '__error' ? e.error : (e.row[c] ?? ''))
      lines.push(vals.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
    }
    writeFileSync(errPath, lines.join('\n'))
    console.log(`  errors written to ${basename(errPath)}`)
  }

  const errPct = (errors.length / rows.length) * 100
  const pass = errPct < 0.1
  console.log(`${pass ? '✅' : '❌'} error rate ${errPct.toFixed(2)}% (NFR: < 0.1%)`)
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
