import { createHmac, timingSafeEqual } from 'node:crypto';

const json = (body, status = 200) => Response.json(body, { status });

function signaturesMatch(rawBody, signature, verificationToken) {
  if (!signature?.startsWith('sha256=')) return false;
  const calculated = `sha256=${createHmac('sha256', verificationToken).update(rawBody).digest('hex')}`;
  const receivedBuffer = Buffer.from(signature);
  const calculatedBuffer = Buffer.from(calculated);
  return receivedBuffer.length === calculatedBuffer.length
    && timingSafeEqual(receivedBuffer, calculatedBuffer);
}

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST' }
    });
  }

  const rawBody = await request.text();
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  if (payload.verification_token) {
    console.log(`NOTION_WEBHOOK_VERIFICATION_TOKEN=${payload.verification_token}`);
    return json({ ok: true, verification_token: payload.verification_token });
  }

  const verificationToken = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN
    || process.env.NOTION_WEBHOOK_TOKEN;
  if (!verificationToken) {
    return json({ ok: false, error: 'Webhook verification token is not configured' }, 503);
  }

  const signature = request.headers.get('x-notion-signature');
  if (!signaturesMatch(rawBody, signature, verificationToken)) {
    return json({ ok: false, error: 'Invalid webhook signature' }, 401);
  }

  const syncToken = process.env.SYNC_TOKEN;
  if (!syncToken) {
    return json({ ok: false, error: 'SYNC_TOKEN is not configured' }, 503);
  }

  const syncUrl = new URL('/api/sync-notion', request.url);
  const response = await fetch(syncUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${syncToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      reason: payload.type || 'notion-webhook',
      eventId: payload.id || null
    })
  });

  if (!response.ok) {
    console.error(`Failed to queue Notion sync: ${response.status} ${await response.text()}`);
    return json({ ok: false, error: 'Failed to queue Notion sync' }, 502);
  }

  return json({ ok: true, syncQueued: true }, 202);
};
