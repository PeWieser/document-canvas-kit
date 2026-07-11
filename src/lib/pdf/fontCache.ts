// Offline-first font caching using the browser Cache Storage API.
// Falls back gracefully (returns null / no-op) where `caches` is unavailable
// (e.g. SSR or insecure contexts).

const CACHE_NAME = "pdfstudio-fonts-v1";

function cacheAvailable(): boolean {
  return typeof caches !== "undefined";
}

export async function getCachedFont(key: string): Promise<ArrayBuffer | null> {
  if (!cacheAvailable()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(key);
    return response ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function setCachedFont(key: string, data: ArrayBuffer): Promise<void> {
  if (!cacheAvailable()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(key, new Response(data));
  } catch {
    /* quota / private mode – ignore */
  }
}
