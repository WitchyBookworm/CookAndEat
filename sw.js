// Service Worker: App-Dateien offline verfügbar machen (Network-first,
// damit Updates sofort ankommen; ohne Netz aus dem Cache).
const CACHE = 'cookandeat-v1';
const DATEIEN = ['./', 'index.html', 'manifest.webmanifest', 'src/app.js', 'src/planner.js', 'src/shopping.js', 'src/store.js', 'src/firebase-config.js', 'src/styles.css', 'src/data/gerichte.json', 'icons/icon-192.png'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN))));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const kopie = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopie));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
