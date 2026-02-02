const CACHE_NAME = 'markella-v2'; // Versiyonu v2 yaptık ki taze olsun
const assets = [
  './',
  './index.html',
  // Eğer başka büyük .js veya .css dosyaların varsa isimlerini buraya ekleyebilirsin
];

// Uygulamayı telefona yükler (İnternet varken ilk açılışta)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(assets);
    })
  );
});

// İnternet yokken dosyaları hafızadan getirir
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    })
  );
});
