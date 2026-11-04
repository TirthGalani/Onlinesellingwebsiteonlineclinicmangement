const crypto = require('node:crypto');
const { sendEmail, sendSms } = require('./delivery');

const IN_APP = 'in_app';
const EMAIL = 'email';
const SMS = 'sms';

function appUrl(link) {
  const base = String(process.env.APP_ORIGIN || '').replace(/\/+$/, '');
  if (!link) return base || '';
  if (/^https?:\/\//i.test(link)) return link;
  return base ? `${base}${link.startsWith('/') ? '' : '/'}${link}` : link;
}

function shortBody(title, body) {
  return `${title}\n${body}`.replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000);
}

async function recordDelivery(sql, notificationId, channel, recipient, result) {
  const id = crypto.randomUUID();
  try {
    await sql`INSERT INTO notification_deliveries (id, notification_id, channel, recipient, status, provider, provider_message_id, error) VALUES (${id}, ${notificationId}, ${channel}, ${recipient || ''}, ${result.status}, ${result.provider || ''}, ${result.providerMessageId || null}, ${result.error || ''})`;
  } catch (error) {
    console.error('Could not record notification delivery', error);
  }
  return {
    id,
    channel,
    status: result.status,
    provider: result.provider || '',
    error: result.error || '',
    providerMessageId: result.providerMessageId || ''
  };
}

/**
 * Persist an in-app notification and (optionally) deliver it by email/SMS.
 * Returns { notification, deliveries }. If dedupeKey already exists, notification is null.
 */
async function createNotification(sql, {
  userId,
  title,
  body,
  type = 'info',
  link = '',
  channels = [IN_APP],
  dedupeKey = null
}) {
  const id = crypto.randomUUID();
  const safeTitle = String(title || 'Clinic notification').slice(0, 180);
  const safeBody = String(body || '').slice(0, 2000);
  const requested = Array.from(new Set(channels.filter(channel => [IN_APP, EMAIL, SMS].includes(channel))));

  let rows;
  if (dedupeKey) {
    rows = await sql`INSERT INTO user_notifications (id, user_id, title, body, notification_type, link_url, dedupe_key)
      VALUES (${id}, ${userId}, ${safeTitle}, ${safeBody}, ${type}, ${link}, ${dedupeKey})
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      RETURNING id, title, body, notification_type, link_url, created_at`;
  } else {
    rows = await sql`INSERT INTO user_notifications (id, user_id, title, body, notification_type, link_url)
      VALUES (${id}, ${userId}, ${safeTitle}, ${safeBody}, ${type}, ${link})
      RETURNING id, title, body, notification_type, link_url, created_at`;
  }
  if (!rows.length) return { notification: null, deliveries: [] };

  const notification = rows[0];
  const deliveries = [];
  const wantsEmail = requested.includes(EMAIL);
  const wantsSms = requested.includes(SMS);

  if (wantsEmail || wantsSms) {
    const users = await sql`SELECT email, phone FROM clinic_users WHERE id = ${userId} LIMIT 1`;
    const account = users[0] || {};
    if (wantsEmail) {
      const text = shortBody(safeTitle, `${safeBody}${link ? `\n\n${appUrl(link)}` : ''}`);
      const result = await sendEmail({ to: account.email, subject: `${safeTitle} — Maison Dental`, text, html: null });
      deliveries.push(await recordDelivery(sql, notification.id, EMAIL, account.email, result));
    }
    if (wantsSms) {
      const result = await sendSms({ to: account.phone, body: `${safeTitle}: ${safeBody}` });
      deliveries.push(await recordDelivery(sql, notification.id, SMS, account.phone, result));
    }
  }

  const summary = deliveries.map(item => `${item.channel}:${item.status}`).join(', ').slice(0, 200);
  if (summary) {
    try {
      await sql`UPDATE user_notifications SET delivery_summary = ${summary} WHERE id = ${notification.id}`;
    } catch (error) {
      console.error('Could not update notification delivery summary', error);
    }
  }

  return { notification, deliveries };
}

async function notifyStaff(sql, { roles = ['management', 'doctor'], title, body, type = 'info', link = '', dedupeKeyPrefix = null }) {
  const staff = await sql`SELECT id FROM clinic_users WHERE role = ANY(${roles}) AND active = true`;
  const results = [];
  for (const person of staff) {
    const result = await createNotification(sql, {
      userId: person.id,
      title,
      body,
      type,
      link,
      channels: [IN_APP],
      dedupeKey: dedupeKeyPrefix ? `${dedupeKeyPrefix}:${person.id}` : null
    });
    results.push(result);
  }
  return results;
}

// Retry provider failures a bounded number of times. Skipped deliveries are not
// retried because they usually mean the provider or a contact detail is missing.
async function retryFailedDeliveries(sql, limit = 20) {
  const rows = await sql`SELECT d.id, d.channel, d.recipient, d.attempts, n.title, n.body
    FROM notification_deliveries d
    JOIN user_notifications n ON n.id = d.notification_id
    WHERE d.status = 'failed' AND d.attempts < 3 AND d.updated_at > now() - interval '24 hours'
    ORDER BY d.updated_at ASC
    LIMIT ${limit}`;
  const summary = { retried: 0, sent: 0, failed: 0 };
  for (const row of rows) {
    summary.retried += 1;
    const result = row.channel === EMAIL
      ? await sendEmail({ to: row.recipient, subject: `${row.title} — Maison Dental`, text: `${row.title}\n${row.body}`, html: null })
      : await sendSms({ to: row.recipient, body: `${row.title}: ${row.body}` });
    if (result.status === 'sent') summary.sent += 1;
    else summary.failed += 1;
    try {
      await sql`UPDATE notification_deliveries
        SET status = ${result.status}, provider = ${result.provider || ''}, provider_message_id = ${result.providerMessageId || null},
            error = ${result.error || ''}, attempts = attempts + 1, updated_at = now()
        WHERE id = ${row.id}`;
    } catch (error) {
      console.error('Could not update retried delivery', error);
    }
  }
  return summary;
}

module.exports = { createNotification, notifyStaff, retryFailedDeliveries, IN_APP, EMAIL, SMS };
