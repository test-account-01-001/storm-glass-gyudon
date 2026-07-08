/*
 * ストーム牛丼グラス Service Worker
 *
 * 運用ルール（引き継ぎ仕様書10章）:
 *   index.htmlを更新したら CACHE_VERSION を必ず上げること。
 *   上げないと利用者に旧版が配信され続ける。
 *
 * 方針:
 *   - 静的ファイル: インストール時にプリキャッシュ → キャッシュ優先
 *   - index.html（ナビゲーション）: ネット優先 → 失敗時キャッシュ（更新を届きやすく）
 *   - 天気API（Open-Meteo）: ネット優先 → 失敗時キャッシュ（オフラインで前回値を表示）
 */

const CACHE_VERSION = "v0.9-1";
const CACHE_NAME = `storm-gyudon-${CACHE_VERSION}`;

const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./assets/btn-minimal.png",
  "./assets/btn-refresh.png",
  "./assets/btn-pattern.png",
  "./assets/btn-undo.png",
  "./assets/btn-egg.png",
  "./assets/wx-clear.png",
  "./assets/wx-cloudy.png",
  "./assets/wx-rain.png",
  "./assets/wx-wind.png",
  "./assets/wx-snow.png",
  THREE_CDN,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 天気API・グルメニュースAPI: ネット優先＋成功時キャッシュ、失敗時は前回キャッシュ
  if (url.hostname.endsWith("open-meteo.com") || url.hostname.endsWith("rss2json.com")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // ページ本体: ネット優先（CACHE_VERSION更新に加えて最新を届きやすくする）
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // その他（静的ファイル・CDN）: キャッシュ優先＋未キャッシュはネットから取得して保存
  event.respondWith(cacheFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok && (url_isCacheable(request.url))) cache.put(request, res.clone());
  return res;
}

function url_isCacheable(u) {
  return u.startsWith(self.location.origin) || u.startsWith("https://cdnjs.cloudflare.com/");
}
