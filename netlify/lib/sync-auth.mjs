import { timingSafeEqual } from 'node:crypto';

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAuthorizedSyncRequest(request) {
  const expected = process.env.SYNC_TOKEN;
  const authorization = request.headers.get('authorization') || '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  return Boolean(expected && provided && safeEqual(provided, expected));
}
