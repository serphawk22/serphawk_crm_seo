const CACHE_NAME = "serphawk-crm-v4";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Basic core assets to cache
      return cache.addAll(["/manifest.json"]);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Never serve cached authenticated pages or API data, including while offline.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  
  event.respondWith(
    fetch(event.request).catch(() => {
      return Promise.resolve().then(() => {
        return new Response("Network error", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      });
    })
  );
});
