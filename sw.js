const CACHE_NAME = 'kinh-chanh-tinh-tan-smart-v8';

// Chỉ đưa các file cốt lõi chắc chắn tồn tại vào danh sách cài đặt ban đầu.
// Các cặp file .mp3 và .srt/.txt sẽ được tự động lưu vào Cache ngay khi người dùng chọn bài!
const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './IPA.txt'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Lưu từng file độc lập để tránh lỗi 1 file thiếu làm hỏng toàn bộ Service Worker
            for (const asset of CORE_ASSETS) {
                try {
                    await cache.add(asset);
                } catch (err) {
                    console.warn('Bỏ qua file chưa tồn tại khi cài đặt:', asset);
                }
            }
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Chỉ xử lý các yêu cầu GET
    if (event.request.method !== 'GET') return;

    const reqUrl = new URL(event.request.url);
    const lowerPath = reqUrl.pathname.toLowerCase();

    // 1. Với yêu cầu quét danh sách file từ GitHub API:
    // Ưu tiên lấy mạng (Network-First) và lưu vào Cache theo URL gốc (bỏ ?t=...) để khi Offline vẫn có danh sách bài
    if (reqUrl.hostname === 'api.github.com') {
        const cleanApiUrl = reqUrl.origin + reqUrl.pathname;
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(cleanApiUrl, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => caches.match(cleanApiUrl))
        );
        return;
    }

    // 2. Với file âm thanh (.mp3):
    // Ưu tiên lấy từ bộ nhớ máy (Cache-First). Nếu chưa có trong máy, tải từ mạng và TỰ ĐỘNG LƯU vào Cache cho lần sau.
    if (lowerPath.endsWith('.mp3')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(event.request, { ignoreSearch: true });
                if (cachedResponse) {
                    return cachedResponse;
                }
                try {
                    // Tải file MP3 hoàn chỉnh (status 200) để lưu vào Cache chạy Offline
                    const networkResponse = await fetch(event.request.url);
                    if (networkResponse && networkResponse.status === 200) {
                        cache.put(event.request.url, networkResponse.clone());
                    }
                    return networkResponse;
                } catch (err) {
                    return fetch(event.request);
                }
            })
        );
        return;
    }

    // 3. Với file code (index.html), từ điển (IPA.txt) và phụ đề (.srt, .txt):
    // Có mạng là tải bản mới nhất về và cập nhật bộ nhớ (Network-First), mất mạng thì lấy từ Cache.
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request, { ignoreSearch: true });
            })
    );
});
