/* ============================================================
   מיכאל בלוך — CRM  |  Service Worker
   מעטפת האפליקציה נשמרת במטמון → טעינה מיידית.
   קריאות Supabase לעולם אינן נשמרות במטמון.
   ============================================================ */

const VERSION = 'mb-crm-v1';
const SHELL   = `${VERSION}-shell`;
const IMAGES  = `${VERSION}-img`;

const SHELL_FILES = [
  '/',
  '/index.html',
  '/manager.css',
  '/manager.js',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
];

/* ── התקנה ── */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      // addAll נכשל כולו אם קובץ אחד חסר — לכן שומרים אחד-אחד
      .then((c) => Promise.allSettled(SHELL_FILES.map((f) => c.add(f))))
      .then(() => self.skipWaiting())
  );
});

/* ── ניקוי גרסאות ישנות ── */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── אסטרטגיות ── */
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Supabase (REST / Auth / Realtime / Storage) → תמיד מהרשת, בלי מטמון
  if (/supabase\.(co|in)$/.test(url.hostname) || url.protocol === 'wss:') return;

  // OneSignal (SDK, API, worker) → תמיד מהרשת; ה-SW שלו מנוהל בנפרד ב-/push/
  if (/onesignal\.com$/.test(url.hostname) || url.pathname.startsWith('/push/')) return;

  // ניווט → network-first, נסיגה למעטפת השמורה במצב לא-מקוון
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(SHELL).then((c) => c.put('/index.html', res.clone()));
          return res;
        })
        .catch(async () =>
          (await caches.match('/index.html')) ?? Response.error()
        )
    );
    return;
  }

  // תמונות (Supabase Storage / Uploadcare) → cache-first
  if (request.destination === 'image' && url.origin !== self.location.origin) {
    e.respondWith(
      caches.open(IMAGES).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // נכסים מקומיים + מודול supabase-js מ-CDN → stale-while-revalidate
  e.respondWith(
    caches.open(SHELL).then(async (cache) => {
      const hit = await cache.match(request);
      const net = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit ?? net;
    })
  );
});
