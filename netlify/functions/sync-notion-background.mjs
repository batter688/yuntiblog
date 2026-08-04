import { runQueuedSync } from '../lib/blob-site.mjs';
import { isAuthorizedSyncRequest } from '../lib/sync-auth.mjs';

export default async (request) => {
  if (!isAuthorizedSyncRequest(request)) {
    console.warn('Rejected unauthorized background sync request.');
    return;
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    // A body is optional for manual synchronization.
  }

  try {
    await runQueuedSync({
      reason: payload.reason || payload.eventType || 'manual',
      eventId: payload.eventId || null
    });
  } catch (error) {
    console.error(`Background Notion sync failed: ${error.stack || error.message}`);
    throw error;
  }
};
