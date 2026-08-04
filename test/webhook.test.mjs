import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import handler from '../netlify/functions/notion-webhook.mjs';

test('Notion webhook accepts verification requests without triggering sync', async () => {
  const response = await handler(new Request('https://example.netlify.app/api/notion-webhook', {
    method: 'POST',
    body: JSON.stringify({ verification_token: 'verify-me' })
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).verification_token, 'verify-me');
});

test('Notion webhook validates signatures and queues a sync', async () => {
  const originalFetch = globalThis.fetch;
  const originalVerificationToken = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN;
  const originalSyncToken = process.env.SYNC_TOKEN;

  process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN = 'notion-secret';
  process.env.SYNC_TOKEN = 'sync-secret';
  let queuedRequest;
  globalThis.fetch = async (request, options) => {
    queuedRequest = { request: String(request), options };
    return Response.json({ ok: true }, { status: 202 });
  };

  try {
    const body = JSON.stringify({ id: 'event-1', type: 'page.content_updated' });
    const signature = `sha256=${createHmac('sha256', 'notion-secret').update(body).digest('hex')}`;
    const response = await handler(new Request('https://example.netlify.app/api/notion-webhook', {
      method: 'POST',
      headers: { 'x-notion-signature': signature },
      body
    }));

    assert.equal(response.status, 202);
    assert.equal(queuedRequest.request, 'https://example.netlify.app/api/sync-notion');
    assert.equal(queuedRequest.options.headers.authorization, 'Bearer sync-secret');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalVerificationToken === undefined) delete process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN;
    else process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN = originalVerificationToken;
    if (originalSyncToken === undefined) delete process.env.SYNC_TOKEN;
    else process.env.SYNC_TOKEN = originalSyncToken;
  }
});

test('Notion webhook rejects an invalid signature', async () => {
  const originalVerificationToken = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN;
  process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN = 'notion-secret';
  try {
    const response = await handler(new Request('https://example.netlify.app/api/notion-webhook', {
      method: 'POST',
      headers: { 'x-notion-signature': 'sha256=invalid' },
      body: JSON.stringify({ id: 'event-1' })
    }));
    assert.equal(response.status, 401);
  } finally {
    if (originalVerificationToken === undefined) delete process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN;
    else process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN = originalVerificationToken;
  }
});
