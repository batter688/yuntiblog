import { getPageStore } from '../lib/blob-site.mjs';
import { contentTypeFromMetadata, routeToBlobPath } from '../lib/routes.mjs';

const PAGE_CACHE = 'public, durable, s-maxage=60, stale-while-revalidate=300';

function serviceUnavailable(message) {
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>内容正在同步</title><body><main style="max-width:680px;margin:15vh auto;padding:24px;font-family:system-ui"><h1>内容正在同步</h1><p>${message}</p><p>请稍后刷新页面。</p></main></body></html>`, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export default async (request) => {
  try {
    const url = new URL(request.url);
    const filePath = routeToBlobPath(url.searchParams.get('path') || url.pathname);
    if (!filePath) return new Response('Bad Request', { status: 400 });

    const store = getPageStore();
    const current = await store.get('current', {
      type: 'json',
      consistency: 'strong'
    });
    if (!current?.generation) {
      return serviceUnavailable('网站已部署，但还没有完成第一次 Notion → Blobs 同步。');
    }

    const key = `${current.generation}/${filePath}`;
    const entry = await store.getWithMetadata(key, {
      type: 'text',
      consistency: 'strong'
    });

    if (entry) {
      return new Response(entry.data, {
        status: 200,
        headers: {
          'content-type': contentTypeFromMetadata(entry.metadata, filePath),
          'cache-control': 'public, max-age=0, must-revalidate',
          'netlify-cdn-cache-control': PAGE_CACHE,
          'x-yunti-generation': current.generation
        }
      });
    }

    const notFound = await store.getWithMetadata(`${current.generation}/404.html`, {
      type: 'text',
      consistency: 'strong'
    });
    return new Response(notFound?.data || 'Not Found', {
      status: 404,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-yunti-generation': current.generation
      }
    });
  } catch (error) {
    console.error(`Dynamic page read failed: ${error.stack || error.message}`);
    return serviceUnavailable('动态内容存储暂时不可用。');
  }
};
