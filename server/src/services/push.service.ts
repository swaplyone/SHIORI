import webpush from 'web-push';
import { queryAll, runQuery, queryOne } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BCYFALdhPss9Rws8SinANLesKxrZjhNZtFLmqtzvBs40a2i70aMa3GbkpCNcy9hzRSTQB8pcSw5hGQOJwM60qco';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'u1JFVhwjdWazOhQeuFt83Dcx8StSpoj5xoQIprS4jCc';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:notifications@swaplyone.in';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
}

/**
 * Saves or updates a browser PushSubscription for a user
 */
export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string
): Promise<void> {
  if (!subscription || !subscription.endpoint || !subscription.keys) return;

  const existing = await queryOne('SELECT id FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint]);

  if (existing) {
    await runQuery(`
      UPDATE push_subscriptions
      SET user_id = ?, p256dh = ?, auth = ?, user_agent = ?, updated_at = datetime('now')
      WHERE endpoint = ?
    `, [userId, subscription.keys.p256dh, subscription.keys.auth, userAgent || null, subscription.endpoint]);
  } else {
    await runQuery(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [uuidv4(), userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent || null]);
  }
}

/**
 * Removes a PushSubscription when the client unsubscribes
 */
export async function removePushSubscription(endpoint: string): Promise<void> {
  await runQuery('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
}

/**
 * Sends a real Web Push notification to all active devices of a user.
 * This delivers even if the mobile phone is locked and the browser is closed.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    const subs = await queryAll<{
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }>('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', [userId]);

    if (!subs || subs.length === 0) {
      return;
    }

    const pushPayloadString = JSON.stringify({
      title: payload.title || 'SHIORI Notification',
      body: payload.body || 'New engineering update in SHIORI',
      icon: payload.icon || '/icons/icon-192.png',
      badge: payload.badge || '/icons/icon-192.png',
      tag: payload.tag || `shiori-${Date.now()}`,
      url: payload.url || '/',
      ...payload.data
    });

    const sendPromises = subs.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushSubscription, pushPayloadString, {
          TTL: 86400, // 24 hours queueing
          urgency: 'high'
        });
      } catch (err: any) {
        // If subscription is expired or unsubscribed, remove it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await runQuery('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        } else {
          console.warn('[WEB-PUSH ERROR]', err.statusCode || err.message);
        }
      }
    });

    await Promise.all(sendPromises);
  } catch (error: any) {
    console.error('[PUSH SERVICE DISPATCH ERROR]', error.message);
  }
}
