const CACHE_NAME = 'olympus-pro-v3';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icona.png'
];

self.addEventListener('install', (e) => {
    // Forza il nuovo service worker a prendere il controllo immediatamente
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    // Elimina le vecchie versioni della cache
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Strategia Network-First: prova prima a scaricare i file aggiornati
    e.respondWith(
        fetch(e.request)
            .then((networkResponse) => {
                // Se ha successo, aggiorna la cache in background
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Se non c'è rete, carica la versione salvata in cache
                return caches.match(e.request);
            })
    );
});
