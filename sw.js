const CACHE = "scheda-v6";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
// Network first so updates arrive, cache as fallback so the app opens offline at the gym.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

// ---------- Rest timer notifications ----------
// The page sends the end time; while the app is not on screen this keeps a countdown
// notification up to date and announces when the rest is over.
let restToken = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mmss = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
const clock = t => new Date(t).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
async function appVisible() {
  const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return cs.some(c => c.visibilityState === "visible");
}
async function closeRest() { (await self.registration.getNotifications({ tag: "rest" })).forEach(n => n.close()); }
async function runRest(token, end, label) {
  let shown = null;
  while (token === restToken) {
    const left = Math.ceil((end - Date.now()) / 1000);
    if (left <= 0) break;
    if (await appVisible()) { if (shown !== null) { await closeRest(); shown = null; } }
    else {
      const step = Math.ceil(left / 5) * 5;
      if (step !== shown) {
        shown = step;
        await self.registration.showNotification("Recupero: " + mmss(step), {
          tag: "rest", body: label + " · finisce alle " + clock(end), silent: true, renotify: false,
          icon: "icon-192.png", badge: "icon-192.png", timestamp: end, data: { end }
        });
      }
    }
    await sleep(Math.min(1000, Math.max(50, end - Date.now())));
  }
  if (token !== restToken) return;
  if (await appVisible()) return closeRest();
  await self.registration.showNotification("Recupero finito", {
    tag: "rest", body: "Puoi fare la prossima serie: " + label, renotify: true, silent: false,
    vibrate: [300, 150, 300, 150, 300], icon: "icon-192.png", badge: "icon-192.png"
  });
}
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "rest-start") { const t = ++restToken; e.waitUntil(runRest(t, d.end, d.label || "")); }
  else if (d.type === "rest-cancel") { restToken++; e.waitUntil(closeRest()); }
  else if (d.type === "visibility") e.waitUntil(sleep(300));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow("./")));
});
