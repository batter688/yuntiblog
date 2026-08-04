import { isAuthorizedSyncRequest } from '../lib/sync-auth.mjs';

const json = (body, status = 200) => Response.json(body, { status });

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST' }
    });
  }
  if (!isAuthorizedSyncRequest(request)) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const rawBody = await request.text();
  const backgroundUrl = new URL('/.netlify/functions/sync-notion-background', request.url);
  const response = await fetch(backgroundUrl, {
    method: 'POST',
    headers: {
      authorization: request.headers.get('authorization'),
      'content-type': 'application/json'
    },
    body: rawBody || JSON.stringify({ reason: 'manual' })
  });

  if (response.status !== 202 && !response.ok) {
    console.error(`Failed to enqueue background sync: ${response.status} ${await response.text()}`);
    return json({ ok: false, error: 'Failed to enqueue background sync' }, 502);
  }

  return json({ ok: true, syncQueued: true }, 202);
};
