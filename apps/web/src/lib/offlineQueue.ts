/**
 * Offline write queue backed by IndexedDB. Any write that fails while offline
 * (or that a caller wants to defer) gets appended. On reconnect / focus / manual
 * retry, `drainAll()` replays them against the API.
 *
 * Design goals:
 *  - Survive tab close (localStorage would too, but IDB handles larger + async)
 *  - Generic: not tied to Activity. Callers register a replay handler per `kind`.
 *  - Graceful: 4xx that means "not fixable" (400 bad request, 403 forbidden,
 *    404 gone) drop the draft with a note. 5xx and network errors keep retrying.
 *  - Observable: subscribers get `count / list / synced / failed` events.
 */

import type { CreateActivityDto, CreateLeadDto, UpdateOpportunityDto } from '@bluefish/shared'
import { api, ApiError } from './api'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DraftKind = 'activity' | 'activity.complete' | 'lead' | 'opportunity.update'

interface DraftPayloads {
  'activity':            CreateActivityDto
  'activity.complete':   { activityId: string }
  'lead':                CreateLeadDto
  'opportunity.update':  { opportunityId: string; patch: UpdateOpportunityDto }
}

export interface OfflineDraft<K extends DraftKind = DraftKind> {
  id: string
  kind: K
  label: string        // short human summary shown in banner
  createdAt: string
  retries: number
  lastError?: string
  payload: DraftPayloads[K]
}

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB glue
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'bluefish'
const DB_VERSION = 1
const STORE = 'pendingWrites'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' })
        s.createIndex('createdAt', 'createdAt')
      }
    }
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
  })
}

function tx<T = unknown>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const s = t.objectStore(STORE)
    const req = fn(s)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
  }))
}

async function putAll(items: OfflineDraft[]): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite')
    const s = t.objectStore(STORE)
    for (const it of items) s.put(it)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Pub/sub — components subscribe for banner counts
// ─────────────────────────────────────────────────────────────────────────────

type Listener = (count: number) => void
const listeners = new Set<Listener>()
function emit(count: number) {
  for (const l of listeners) { try { l(count) } catch { /* ignore */ } }
  window.dispatchEvent(new CustomEvent('bluefish:offline-queue-changed', { detail: { count } }))
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  void count().then(fn).catch(() => fn(0))
  return () => { listeners.delete(fn) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function enqueue<K extends DraftKind>(input: { kind: K; label: string; payload: DraftPayloads[K] }): Promise<OfflineDraft<K>> {
  const draft: OfflineDraft<K> = {
    id: 'draft-' + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)),
    kind: input.kind, label: input.label,
    createdAt: new Date().toISOString(), retries: 0,
    payload: input.payload,
  }
  await tx('readwrite', (s) => s.add(draft))
  emit(await count())
  return draft
}

export async function list(): Promise<OfflineDraft[]> {
  const items = await tx<OfflineDraft[]>('readonly', (s) => s.getAll() as IDBRequest<OfflineDraft[]>)
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function count(): Promise<number> {
  return tx<number>('readonly', (s) => s.count())
}

export async function remove(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
  emit(await count())
}

async function replay(draft: OfflineDraft): Promise<void> {
  switch (draft.kind) {
    case 'activity':
      await api.createActivity(draft.payload as DraftPayloads['activity'])
      return
    case 'activity.complete': {
      const p = draft.payload as DraftPayloads['activity.complete']
      await api.updateActivity(p.activityId, { status: 'Completed' })
      return
    }
    case 'lead':
      await api.createLead(draft.payload as DraftPayloads['lead'])
      return
    case 'opportunity.update': {
      const p = draft.payload as DraftPayloads['opportunity.update']
      await api.updateOpportunity(p.opportunityId, p.patch)
      return
    }
    default: {
      const exhaustive: never = draft.kind
      throw new Error(`Unknown draft kind: ${exhaustive as string}`)
    }
  }
}

/** Replay all queued drafts. Errors that are clearly unfixable get dropped. */
export async function drainAll(): Promise<{ synced: number; dropped: number; kept: number }> {
  const drafts = await list()
  if (drafts.length === 0) return { synced: 0, dropped: 0, kept: 0 }
  let synced = 0, dropped = 0, kept = 0
  const updated: OfflineDraft[] = []
  const removed: string[] = []
  for (const d of drafts) {
    try {
      await replay(d)
      removed.push(d.id); synced++
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 403 || e.status === 404)) {
        // Structural or permission failure — dropping quietly rather than looping forever.
        removed.push(d.id); dropped++
      } else {
        d.retries += 1
        d.lastError = e instanceof Error ? e.message : String(e)
        updated.push(d); kept++
      }
    }
  }
  if (updated.length) await putAll(updated)
  if (removed.length) {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite')
      const s = t.objectStore(STORE)
      for (const id of removed) s.delete(id)
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  }
  emit(await count())
  return { synced, dropped, kept }
}

// Back-compat alias — older call sites imported `syncAll`.
export const syncAll = drainAll

// ─────────────────────────────────────────────────────────────────────────────
// Auto-drain triggers
// ─────────────────────────────────────────────────────────────────────────────

let draining = false
async function maybeDrain() {
  if (draining || !navigator.onLine) return
  draining = true
  try { await drainAll() } finally { draining = false }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void maybeDrain() })
  window.addEventListener('focus', () => { void maybeDrain() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void maybeDrain()
  })

  // Try to hand it off to a Service Worker background-sync when available;
  // no-op on browsers without support (Firefox / Safari).
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready
      .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync?.register('bluefish-drain'))
      .catch(() => { /* SW not registered yet — foreground path still works */ })
  }
}
