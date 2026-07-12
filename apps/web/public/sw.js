// Bluefish CRM service worker — minimal offline shell + push handler.
// Deliberately simple: no build-time dependency on Workbox etc.

const APP_SHELL_CACHE = 'bluefish-shell-v1'
const APP_SHELL = ['/', '/manifest.webmanifest', '/logo.jpg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== APP_SHELL_CACHE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Never cache API calls — always network
  if (url.pathname.startsWith('/api')) return

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        // Cache successful navigations and static assets
        if (res.ok && (req.mode === 'navigate' || url.pathname.startsWith('/assets'))) {
          const copy = res.clone()
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(req, copy))
        }
        return res
      }).catch(() => caches.match('/'))
    })
  )
})

self.addEventListener('push', (event) => {
  const data = (() => {
    try { return event.data ? event.data.json() : {} } catch { return { title: 'Bluefish CRM', body: event.data ? event.data.text() : '' } }
  })()
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Bluefish CRM', {
      body: data.body ?? '', icon: '/logo.jpg', badge: '/logo.jpg',
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) if (c.url.includes(url) && 'focus' in c) return c.focus()
    return clients.openWindow(url)
  }))
})
