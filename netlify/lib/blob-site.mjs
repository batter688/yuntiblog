import { createHash, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { generateSite } from '../../scripts/site-generator.mjs';

export const PAGE_STORE_NAME = 'yunti-blog-pages';
export const ASSET_STORE_NAME = 'yunti-blog-assets';
export const SYNC_STORE_NAME = 'yunti-blog-sync';

const RETAINED_GENERATIONS = 3;
const LOCK_STALE_MS = 20 * 60 * 1000;

export function getPageStore() {
  return getStore({ name: PAGE_STORE_NAME, consistency: 'strong' });
}

export function getAssetStore() {
  return getStore({ name: ASSET_STORE_NAME, consistency: 'strong' });
}

export function getSyncStore() {
  return getStore({ name: SYNC_STORE_NAME, consistency: 'strong' });
}

function extensionFor(contentType, sourceUrl) {
  const knownTypes = {
    'image/avif': '.avif',
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/svg+xml': '.svg',
    'image/webp': '.webp'
  };
  const normalizedType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (knownTypes[normalizedType]) return knownTypes[normalizedType];
  try {
    const match = new URL(sourceUrl).pathname.match(/\.[a-z0-9]{1,8}$/i);
    if (match) return match[0].toLowerCase();
  } catch {
    // Ignore malformed source URLs; the fallback below is safe.
  }
  return '.bin';
}

export function createBlobAssetDownloader(assetStore) {
  return async (url) => {
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`下载 Notion 文件失败 ${response.status}: ${url}`);

    const data = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const hash = createHash('sha256').update(Buffer.from(data)).digest('hex').slice(0, 32);
    const key = `${hash}${extensionFor(contentType, url)}`;

    await assetStore.set(key, data, {
      onlyIfNew: true,
      metadata: { contentType }
    });
    return `/media/${key}`;
  };
}

async function cleanupGeneration(pageStore, generation) {
  const manifest = await pageStore.get(`${generation}/manifest.json`, {
    type: 'json',
    consistency: 'strong'
  });
  if (manifest?.paths) {
    await Promise.all(manifest.paths.map((filePath) => pageStore.delete(`${generation}/${filePath}`)));
  }
  await pageStore.delete(`${generation}/manifest.json`);
}

async function updateGenerationHistory(pageStore, generation) {
  const history = await pageStore.get('generations', {
    type: 'json',
    consistency: 'strong'
  }) || [];
  const allGenerations = [generation, ...history.filter((item) => item !== generation)];
  const retained = allGenerations.slice(0, RETAINED_GENERATIONS);
  const stale = allGenerations.slice(RETAINED_GENERATIONS);

  await pageStore.setJSON('generations', retained);
  for (const oldGeneration of stale) {
    try {
      await cleanupGeneration(pageStore, oldGeneration);
    } catch (error) {
      console.warn(`Failed to clean generation ${oldGeneration}: ${error.message}`);
    }
  }
}

export async function syncSiteToBlobs({
  pageStore = getPageStore(),
  assetStore = getAssetStore()
} = {}) {
  const generation = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const downloadAsset = createBlobAssetDownloader(assetStore);

  const result = await generateSite({
    downloadAsset,
    writePage: (filePath, content, contentType) => pageStore.set(
      `${generation}/${filePath}`,
      content,
      { metadata: { contentType } }
    )
  });

  const manifest = {
    generation,
    generatedAt: result.generatedAt,
    paths: result.paths,
    stats: result.stats
  };

  await pageStore.setJSON(`${generation}/manifest.json`, manifest);

  // The pointer is updated last, so readers never see a partially written generation.
  await pageStore.setJSON('current', {
    generation,
    generatedAt: result.generatedAt,
    stats: result.stats
  });

  await updateGenerationHistory(pageStore, generation);
  console.log(`Blob sync complete: generation ${generation}, ${result.stats.posts} posts.`);
  return manifest;
}

async function acquireLock(syncStore, lockId) {
  const lockValue = { id: lockId, acquiredAt: Date.now() };
  const created = await syncStore.setJSON('lock', lockValue, { onlyIfNew: true });
  if (created.modified) return true;

  const existing = await syncStore.getWithMetadata('lock', {
    type: 'json',
    consistency: 'strong'
  });
  const acquiredAt = Number(existing?.data?.acquiredAt || 0);
  if (!existing?.etag || Date.now() - acquiredAt < LOCK_STALE_MS) return false;

  const replaced = await syncStore.setJSON('lock', lockValue, { onlyIfMatch: existing.etag });
  return replaced.modified;
}

async function releaseLock(syncStore, lockId) {
  const current = await syncStore.get('lock', { type: 'json', consistency: 'strong' });
  if (current?.id === lockId) await syncStore.delete('lock');
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runQueuedSync({ reason = 'manual', eventId = null } = {}) {
  const syncStore = getSyncStore();
  const requestedAt = Date.now();
  await syncStore.setJSON('pending', { requestedAt, reason, eventId });

  const debounceMs = Math.max(0, Math.min(Number(process.env.SYNC_DEBOUNCE_MS || 5000), 30000));
  if (debounceMs) await delay(debounceMs);

  const lockId = randomUUID();
  if (!await acquireLock(syncStore, lockId)) {
    console.log('A Notion sync is already running; this request was merged into the pending sync.');
    return { queued: true, merged: true };
  }

  try {
    let manifest = null;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const target = await syncStore.get('pending', { type: 'json', consistency: 'strong' }) || { requestedAt };
      manifest = await syncSiteToBlobs();
      const latest = await syncStore.get('pending', { type: 'json', consistency: 'strong' }) || target;
      if (Number(latest.requestedAt || 0) <= Number(target.requestedAt || 0)) break;
      console.log('A newer Notion event arrived during sync; refreshing once more.');
    }
    return { queued: true, merged: false, manifest };
  } finally {
    await releaseLock(syncStore, lockId);
  }
}
