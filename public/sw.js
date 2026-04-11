const CACHE_NAME = "springa-v4";
const API_CACHE_NAME = "springa-api-v1";
const API_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const PRECACHE = ["/icon-192.png", "/icon-512.png", "/badge-96.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Delete old static caches
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      ),
      // Clean expired API cache entries
      caches.open(API_CACHE_NAME).then(async (cache) => {
        const requests = await cache.keys();
        const now = Date.now();
        return Promise.all(
          requests.map(async (request) => {
            const response = await cache.match(request);
            if (!response) return;
            const cachedAt = response.headers.get("x-sw-cached-at");
            if (cachedAt && now - Number(cachedAt) > API_MAX_AGE_MS) {
              return cache.delete(request);
            }
          })
        );
      }),
    ])
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Network-first caching for safe API GET routes (offline fallback only)
  const CACHEABLE_PATHS = [
    "/api/settings",
    "/api/bg-cache",
    "/api/bg-patterns",
    "/api/wellness",
    "/api/run-feedback",
    "/api/prerun-carbs",
    "/api/simulate/validate",
  ];
  const cacheable =
    event.request.method === "GET" &&
    CACHEABLE_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"));

  if (cacheable) {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(API_CACHE_NAME);
            const cloned = response.clone();
            const headers = new Headers(cloned.headers);
            headers.set("x-sw-cached-at", String(Date.now()));
            const body = await cloned.arrayBuffer();
            await cache.put(
              event.request,
              new Response(body, {
                status: cloned.status,
                statusText: cloned.statusText,
                headers,
              })
            );
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (!cached) return new Response(null, { status: 504, statusText: "Offline" });
          const cachedAt = cached.headers.get("x-sw-cached-at");
          if (cachedAt && Date.now() - Number(cachedAt) > API_MAX_AGE_MS) {
            const cache = await caches.open(API_CACHE_NAME);
            await cache.delete(event.request);
            return new Response(null, { status: 504, statusText: "Offline" });
          }
          return cached;
        })
    );
    return;
  }

  // Offline navigation fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/"))
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Springa";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    data: { url: data.url || "/", ts: data.ts },
    actions: data.ts ? [{ action: "skip", title: "Skip" }] : [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // "Skip" action — POST skipped rating, no window open
  if (event.action === "skip") {
    const ts = event.notification.data?.ts;
    if (ts) {
      event.waitUntil(
        fetch("/api/run-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ts: Number(ts), rating: "skipped" }),
        })
      );
    }
    return;
  }

  // Default tap — open feedback page
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
