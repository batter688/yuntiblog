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

  // Notion sends this once when a webhook subscription is created.
  // Copy the token from the Netlify function log into
  // NOTION_WEBHOOK_VERIFICATION_TOKEN, then verify the subscription in Notion.
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

  const hook = process.env.NETLIFY_BUILD_HOOK;
  if (!hook) {
    return json({ ok: false, error: 'NETLIFY_BUILD_HOOK is not configured' }, 503);
  }

  const response = await fetch(hook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      source: 'notion-webhook',
      eventId: payload.id || null,
      eventType: payload.type || null,
      entity: payload.entity || null
    })
  });

  if (!response.ok) {
    console.error(`Netlify build hook failed: ${response.status} ${await response.text()}`);
    return json({ ok: false, error: 'Build hook request failed' }, 502);
  }

  return json({ ok: true, buildTriggered: true }, 202);
};
