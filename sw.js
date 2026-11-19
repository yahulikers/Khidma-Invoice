const V = 'khidma-invoice-v2';
const FILES = ['./','index.html','manifest.webmanifest','css/app.css','css/invoice.css','js/app.js','js/logo-data.js','config.js','vendor/supabase.js','vendor/html2canvas.min.js','vendor/jspdf.umd.min.js',
'assets/logo.png','assets/logo-emblem.png','assets/icon-192.png','assets/icon-512.png','assets/apple-touch-icon.png','assets/favicon.png',
'fonts/dejavu-sans.woff2','fonts/dejavu-sans-bold.woff2','fonts/dejavu-sans-oblique.woff2','fonts/liberation-sans.woff2','fonts/liberation-sans-bold.woff2',
'fonts/plus-jakarta-sans-latin-400-normal.woff2','fonts/plus-jakarta-sans-latin-600-normal.woff2','fonts/plus-jakarta-sans-latin-700-normal.woff2','fonts/plus-jakarta-sans-latin-800-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
