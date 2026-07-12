import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enqueue, list, remove } from '../offlineQueue'

describe('offlineQueue', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { localStorage.clear() })

  it('starts empty', () => {
    expect(list()).toEqual([])
  })

  it('enqueues a draft and returns it with an id + createdAt', () => {
    const d = enqueue({
      kind: 'activity',
      payload: { type: 'visit', title: 'Test', scheduledAt: new Date().toISOString(), ownerId: 'u1' },
    })
    expect(d.id).toMatch(/^draft-/)
    expect(d.createdAt).toBeTruthy()
    expect(list()).toHaveLength(1)
  })

  it('removes a draft by id', () => {
    const a = enqueue({ kind: 'activity', payload: { type: 'call', title: 'A', scheduledAt: new Date().toISOString(), ownerId: 'u1' } })
    const b = enqueue({ kind: 'activity', payload: { type: 'call', title: 'B', scheduledAt: new Date().toISOString(), ownerId: 'u1' } })
    remove(a.id)
    const remaining = list()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(b.id)
  })

  it('dispatches bluefish:offline-queue-changed on enqueue', () => {
    let count = -1
    const h = (e: Event) => { count = (e as CustomEvent<{ count: number }>).detail.count }
    window.addEventListener('bluefish:offline-queue-changed', h)
    enqueue({ kind: 'activity', payload: { type: 'task', title: 'X', scheduledAt: new Date().toISOString(), ownerId: 'u1' } })
    window.removeEventListener('bluefish:offline-queue-changed', h)
    expect(count).toBe(1)
  })
})
