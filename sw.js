// Fa aprire l'app anche con internet debole: prima prova la rete, se manca usa la copia salvata.
// I dati (Supabase) non passano di qui.
const CACHE = 'chiamate-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const richiesta = e.request;
  if (richiesta.method !== 'GET' || new URL(richiesta.url).origin !== location.origin) return;
  e.respondWith(
    fetch(richiesta).then(risposta => {
      const copia = risposta.clone();
      caches.open(CACHE).then(c => c.put(richiesta, copia));
      return risposta;
    }).catch(() => caches.match(richiesta, { ignoreSearch: true }))
  );
});
