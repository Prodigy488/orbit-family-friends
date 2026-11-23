// Caches the app shell so Orbit opens offline. Chat data lives in IndexedDB, not here.
const V = 'orbit-v1'
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => c.addAll(['./', 'app.js', 'style.css', 'leaflet.css', 'manifest.webmanifest', 'icon-192.png', 'emoji/data.json']).catch(() => {}))) })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin) return
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); return r }).catch(() => caches.match(e.request)))
})
