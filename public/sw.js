const CACHE = "cinezo-v2";
const SHELL = [
  "/", "/index.html", "/style.css", "/app.js",
  "/images/cinezo-favicon.svg", "/images/cinezo-icon.svg",
  "/images/cinezo-wordmark-dark.svg", "/images/cinezo-wordmark-light.svg",
  "/images/favicon.ico",
  "/images/4kcinezo.png",
  "/images/caramel-popcorn.webp",
  "/images/cheese-nachos.webp",
  "/images/cheese-popcorn.webp",
  "/images/cinema.webp",
  "/images/coke.webp",
  "/images/cold-coffee.webp",
  "/images/fries.webp",
  "/images/ice-cream.webp",
  "/images/pepsi.webp",
  "/images/popcorn-cola-combo.webp",
  "/images/salted-popcorn.webp",
  "/images/samosas.webp",
  "/images/veg-burger.webp",
  "/images/water-bottle.webp"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  if (!url.startsWith(self.location.origin)) return;
  if (url.includes("/api/") && !url.includes("/api/events")) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});



self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  if (!url.startsWith(self.location.origin)) return;
  if (url.includes("/api/events")) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (e.request.method === "GET" && res.ok && !url.includes("/api/")) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});

