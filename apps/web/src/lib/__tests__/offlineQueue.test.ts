import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enqueue, list, remove, count } from '../offlineQueue'

// jsdom does not provide IndexedDB. Once `fake-indexeddb` is added to devDeps,
// swap this `describe.skip` for `describe` and `import 'fake-indexeddb/auto'` above.
describe.skip('offlineQueue (IndexedDB)', () => {
  beforeEach(async () => {
    for (const d of await list()) await remove(d.id)
  })
  afterEach(async () => {
    for (const d of await list()) await remove(d.id)
  })

  it('starts empty', async () => {
    expect(await list()).toEqual([])
    expect(await count()).toBe(0)
  })

  it('enqueues a draft and returns it with an id + createdAt', async () => {
    const d = await enqueue({
      kind: 'activity',
      label: 'GPS check-in',
      payload: { type: 'visit', title: 'Test', scheduledAt: new Date().toISOString(), ownerId: 'u1' },
    })
    expect(d.id).toMatch(/^draft-/)
    expect(d.createdAt).toBeTruthy()
    expect(d.retries).toBe(0)
    expect(await list()).toHaveLength(1)
  })

  it('removes a draft by id', async () => {
    const a = await enqueue({ kind: 'activity', label: 'A', payload: { type: 'call', title: 'A', scheduledAt: new Date().toISOString(), ownerId: 'u1' } })
    const b = await enqueue({ kind: 'activity', label: 'B', payload: { type: 'call', title: 'B', scheduledAt: new Date().toISOString(), ownerId: 'u1' } })
    await remove(a.id)
    const remaining = await list()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(b.id)
  })

  it('dispatches bluefish:offline-queue-changed on enqueue', async () => {
    let count = -1
    const h = (e: Event) => { count = (e as CustomEvent<{ count: number }>).detail.count }
    window.addEventListener('bluefish:offline-queue-changed', h)
    await enqueue({ kind: 'activity', label: 'X', payload: { type: 'task', title: 'X', scheduledAt: new Date().toISOString(), ownerId: 'u1' } })
    window.removeEventListener('bluefish:offline-queue-changed', h)
    expect(count).toBe(1)
  })
})
