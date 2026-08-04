import { getAssetStore } from '../lib/blob-site.mjs';
import { assetKeyFromRequest } from '../lib/routes.mjs';

const IMMUTABLE_CACHE = 'public, durable, max-age=31536000, s-maxage=31536000, immutable';

export default async (request) => {
  try {
    const key = assetKeyFromRequest(request.url);
    if (!key) return new Response('Bad Request', { status: 400 });

    const entry = await getAssetStore().getWithMetadata(key, {
      type: 'arrayBuffer',
      consistency: 'strong'
    });
    if (!entry) return new Response('Not Found', { status: 404 });

    return new Response(entry.data, {
      headers: {
        'content-type': String(entry.metadata?.contentType || 'application/octet-stream'),
        'cache-control': 'public, max-age=31536000, immutable',
        'netlify-cdn-cache-control': IMMUTABLE_CACHE
      }
    });
  } catch (error) {
    console.error(`Blob asset read failed: ${error.stack || error.message}`);
    return new Response('Asset unavailable', { status: 503 });
  }
};
