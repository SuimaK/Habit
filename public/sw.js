/*
 * Работа без интернета. Страница — сначала из сети (чтобы приходили обновления), без сети — из кэша.
 * Файлы сборки (с хешем в имени) — из кэша, а при первом запросе кладутся в кэш.
 * После каждой свежей загрузки страницы из кэша убираются файлы старых сборок.
 */
const CACHE = 'habits-v3'
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './icon.svg']
const MATCH = { ignoreVary: true }

/** Файлы сборки, на которые ссылается страница. */
const assetsOf = (html) => [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => new URL('./' + m[1], self.registration.scope).href)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (c) => {
        // cache: 'reload' — мимо HTTP-кэша браузера, чтобы не взять устаревшую страницу.
        await c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))
        const html = await (await c.match('./index.html', MATCH)).text()
        await c.addAll(assetsOf(html).map((u) => new Request(u, { cache: 'reload' })))
      })
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Убрать из кэша файлы сборки, на которые новая страница уже не ссылается. */
async function prune(html) {
  const keep = new Set(assetsOf(html))
  if (!keep.size) return
  const c = await caches.open(CACHE)
  for (const req of await c.keys()) if (req.url.includes('/assets/') && !keep.has(req.url)) await c.delete(req)
}

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
const fromCache = () => caches.match('./index.html', MATCH).then((r) => r || caches.match('./', MATCH))

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      Promise.race([fetch(req, { cache: 'no-cache' }), timeout(4000)])
        .then(async (res) => {
          // Сервер ответил ошибкой (например, во время выкладки) — показываем сохранённую версию.
          if (!res.ok) return (await fromCache()) || res
          const copy = res.clone()
          event.waitUntil(
            copy.text().then(async (html) => {
              const c = await caches.open(CACHE)
              await c.put('./index.html', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
              await prune(html)
            }),
          )
          return res
        })
        .catch(async () => (await fromCache()) || Response.error()),
    )
    return
  }

  event.respondWith(
    caches.match(req, MATCH).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && url.pathname.includes('/assets/')) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
