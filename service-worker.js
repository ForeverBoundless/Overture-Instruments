const CACHE = 'overture-shell-v2';
const APP_SHELL = [
  '/', '/index.html', '/about', '/about.html', '/library', '/library.html', '/omni', '/omni.html',
  '/experiments', '/experiments.html',
  '/experiments/beats-lab', '/experiments/envelope-lab', '/experiments/filter-lab', '/experiments/fm-lab',
  '/experiments/harmonics-lab', '/experiments/modulation-lab', '/experiments/oscillator-lab', '/experiments/space-lab',
  '/html/korg-ms-20', '/html/little-phatty', '/html/nord-c2d', '/html/prophet10',
  '/html/roland-juno-106', '/html/roland-tr-808', '/html/sub37', '/html/yamaha-dx7',
  '/css/home.css', '/css/library.css', '/css/omni.css', '/css/keyboard.css', '/css/site-theme.css', '/css/site-theme-polish.css',
  '/js/home.js', '/js/library.js', '/js/omni.js', '/js/omni/graph.js', '/js/omni/modules.js',
  '/js/shared/pwa.js', '/js/shared/audioRecorder.js', '/js/shared/midiRecorder.js', '/ui/Logos/OvertureLogo.png'
];

self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(APP_SHELL.map((asset) => cache.add(asset).catch(() => undefined)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('overture-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); } return response; }).catch(() => caches.match(request).then((hit) => hit || caches.match('/index.html'))));
    return;
  }
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((response) => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); } return response; })));
});
