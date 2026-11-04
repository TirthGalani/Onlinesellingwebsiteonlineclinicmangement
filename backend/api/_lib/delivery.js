// Provider-agnostic notification delivery.
// Email: Resend (https://resend.com) via RESEND_API_KEY + MAIL_FROM.
// SMS:   Twilio (https://twilio.com) via TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER.
// Both providers are called over HTTPS so the project needs no extra runtime dependency.
// Delivery failures never throw: they are recorded and surfaced as delivery status.

const REQUEST_TIMEOUT_MS = 8000;

function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM && process.env.NOTIFICATIONS_EMAIL_ENABLED !== 'false');
}

function smsConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER &&
    process.env.NOTIFICATIONS_SMS_ENABLED !== 'false'
  );
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cleanError(value) {
  return String(value || 'Delivery failed.').replace(/\s+/g, ' ').trim().slice(0, 400);
}

async function requestJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    if (!response.ok) {
      return {
        ok: false,
        error: cleanError(body.message || body.error || raw || `Provider returned HTTP ${response.status}.`),
        retryable: response.status >= 500 || response.status === 429
      };
    }
    return { ok: true, body };
  } catch (error) {
    return {
      ok: false,
      error: error && error.name === 'AbortError' ? 'Delivery provider timed out.' : cleanError(error && error.message),
      retryable: true
    };
  } finally {
    clearTimeout(timer);
  }
}

async function sendEmail({ to, subject, text, html }) {
  if (!emailConfigured()) {
    return { status: 'skipped', provider: '', providerMessageId: '', error: 'Email delivery is not configured.' };
  }
  if (!to) {
    return { status: 'skipped', provider: 'resend', providerMessageId: '', error: 'No email address on the account.' };
  }
  const result = await requestJson(String(process.env.RESEND_API_URL || 'https://api.resend.com/emails'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [to],
      subject: String(subject || 'Maison Dental').slice(0, 180),
      text: String(text || '').slice(0, 20000),
      html: html || `<div style="font-family:Arial,sans-serif;line-height:1.6">${String(text || '').split('\n').map(line => `<p>${escapeHtml(line)}</p>`).join('')}</div>`
    })
  });
  if (!result.ok) return { status: 'failed', provider: 'resend', providerMessageId: '', error: result.error };
  return { status: 'sent', provider: 'resend', providerMessageId: String(result.body.id || ''), error: '' };
}

async function sendSms({ to, body }) {
  if (!smsConfigured()) {
    return { status: 'skipped', provider: '', providerMessageId: '', error: 'SMS delivery is not configured.' };
  }
  if (!to) {
    return { status: 'skipped', provider: 'twilio', providerMessageId: '', error: 'No phone number on the account.' };
  }
  const normalized = String(to).replace(/[^\d+]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    return { status: 'skipped', provider: 'twilio', providerMessageId: '', error: 'Phone number is not in E.164 format (for example +12125550199).' };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const form = new URLSearchParams({
    To: normalized,
    From: process.env.TWILIO_FROM_NUMBER,
    Body: String(body || '').slice(0, 320)
  });
  const result = await requestJson(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });
  if (!result.ok) return { status: 'failed', provider: 'twilio', providerMessageId: '', error: result.error };
  return { status: 'sent', provider: 'twilio', providerMessageId: String(result.body.sid || ''), error: '' };
}

function deliveryConfiguration() {
  return {
    email: emailConfigured() ? 'configured' : 'not_configured',
    sms: smsConfigured() ? 'configured' : 'not_configured'
  };
}

module.exports = { sendEmail, sendSms, emailConfigured, smsConfigured, deliveryConfiguration };
