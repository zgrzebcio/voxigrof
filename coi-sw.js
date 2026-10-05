/* voxiGrof — cross-origin isolation (0.8386, MultithreadPlan C10).

   Shared memory (SharedArrayBuffer) is only given to a page served with two headers:
     Cross-Origin-Opener-Policy: same-origin   and   Cross-Origin-Embedder-Policy: require-corp
   GitHub Pages cannot send headers, so this file does it from the inside: loaded as a plain script by index.html it
   registers ITSELF as a service worker, and the worker adds the two headers to every response from this site. The first
   visit loads once without them (the worker is not there yet) and reloads itself once; every visit after that is
   isolated from the start. Responses from other sites (three.js from jsDelivr) pass untouched: they are fetched with
   CORS, which require-corp accepts.

   If anything goes wrong the game simply runs as before, without shared memory (SHARED_OK false in 00-config).
   To switch it off for good: set COI_ON to false and publish; the next visit unregisters the worker and reloads. */
const COI_ON = true;

if (typeof window === 'undefined') {
  /* ---- the service worker ---- */
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', (e) => {
    const r = e.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;   // a devtools quirk: leave it to the browser
    let sameSite = false;
    try { sameSite = new URL(r.url).origin === self.location.origin; } catch {}
    if (!sameSite) return;                                                  // other sites: the browser fetches as usual
    e.respondWith(fetch(r).then((res) => {
      if (!res || res.status === 0 || res.type === 'opaque' || res.type === 'opaqueredirect') return res;
      const h = new Headers(res.headers);
      h.set('Cross-Origin-Embedder-Policy', 'require-corp');
      h.set('Cross-Origin-Opener-Policy', 'same-origin');
      h.set('Cross-Origin-Resource-Policy', 'same-origin');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }));
  });
} else (() => {
  /* ---- the page ---- */
  const sw = navigator.serviceWorker;
  if (!sw) return;
  const mine = (reg) => reg.active && /coi-sw\.js$/.test(reg.active.scriptURL);
  if (!COI_ON) {                                          // switched off: take the worker away again, once
    sw.getRegistrations().then((rs) => {
      const gone = rs.filter(mine);
      if (!gone.length) return;
      Promise.all(gone.map((r) => r.unregister())).then(() => { if (window.crossOriginIsolated) location.reload(); });
    }).catch(() => {});
    return;
  }
  const KEY = 'vg_coiReload';
  if (window.crossOriginIsolated) { try { sessionStorage.removeItem(KEY); } catch {} return; }   // already isolated
  if (!window.isSecureContext) return;                    // file:// or plain http to another machine: no workers there
  // one reload per tab at most: if the browser still will not isolate the page, the game runs without shared memory
  const reloadOnce = () => {
    try { if (sessionStorage.getItem(KEY)) return; sessionStorage.setItem(KEY, '1'); } catch { return; }
    location.reload();
  };
  sw.register(document.currentScript.src).then(() => {
    if (sw.controller) reloadOnce();                      // controlled already, yet loaded without the headers
    else sw.addEventListener('controllerchange', reloadOnce);
  }).catch(() => {});
})();
