import type { CreateActivityDto } from '@bluefish/shared'
import { api, ApiError } from './api'

export interface OfflineDraft {
  id: string
  kind: 'activity'
  createdAt: string
  payload: CreateActivityDto
}

const KEY = 'bluefish.offline_queue'

function read(): OfflineDraft[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as OfflineDraft[]) : []
  } catch {
    return []
  }
}

function write(items: OfflineDraft[]) {
  localStorage.setItem(KEY, JSON.stringify(items))
}

export function enqueue(draft: Omit<OfflineDraft, 'id' | 'createdAt'>): OfflineDraft {
  const id = 'draft-' + Math.random().toString(36).slice(2, 10)
  const full: OfflineDraft = { id, createdAt: new Date().toISOString(), ...draft }
  const q = read()
  q.push(full)
  write(q)
  window.dispatchEvent(new CustomEvent('bluefish:offline-queue-changed', { detail: { count: q.length } }))
  return full
}

export function list(): OfflineDraft[] {
  return read()
}

export function remove(id: string): void {
  const q = read().filter((d) => d.id !== id)
  write(q)
  window.dispatchEvent(new CustomEvent('bluefish:offline-queue-changed', { detail: { count: q.length } }))
}

export async function syncAll(): Promise<{ synced: number; failed: number }> {
  const drafts = read()
  if (drafts.length === 0) return { synced: 0, failed: 0 }
  let synced = 0, failed = 0
  const remaining: OfflineDraft[] = []
  for (const d of drafts) {
    try {
      if (d.kind === 'activity') {
        await api.createActivity(d.payload)
        synced++
      }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 403)) {
        // permanent failure — drop
        failed++
      } else {
        remaining.push(d)
      }
    }
  }
  write(remaining)
  window.dispatchEvent(new CustomEvent('bluefish:offline-queue-changed', { detail: { count: remaining.length } }))
  return { synced, failed }
}

// Auto-sync when connection returns
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void syncAll() })
}
