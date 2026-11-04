const { reply, method, database } = require('./_lib/http');
const { deliveryConfiguration } = require('./_lib/delivery');

module.exports = async function handler(req, res) {
  if (!method(req, ['GET'], res)) return;
  const started = Date.now();
  const authConfigured = Boolean(process.env.JWT_SECRET);
  const storageConfigured = Boolean(process.env.DATABASE_URL);
  const base = {
    service: 'maison-clinic-api',
    time: new Date().toISOString(),
    storageConfigured,
    authConfigured,
    notifications: deliveryConfiguration(),
    timezone: process.env.CLINIC_TIMEZONE || 'America/New_York'
  };

  if (!storageConfigured) {
    return reply(res, 200, { ...base, ok: false, status: 'degraded', databaseReachable: false, schemaReady: false, missing: ['DATABASE_URL'] });
  }

  try {
    const sql = database();
    const checks = await sql`SELECT
      to_regclass('public.clinic_users') IS NOT NULL AS clinic_users,
      to_regclass('public.appointments') IS NOT NULL AS appointments,
      to_regclass('public.doctor_availability') IS NOT NULL AS doctor_availability,
      to_regclass('public.message_attachments') IS NOT NULL AS message_attachments,
      to_regclass('public.user_notifications') IS NOT NULL AS user_notifications,
      to_regclass('public.notification_deliveries') IS NOT NULL AS notification_deliveries,
      to_regclass('public.audit_events') IS NOT NULL AS audit_events,
      to_regclass('public.backup_runs') IS NOT NULL AS backup_runs,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'clinician_id') AS appointments_clinician_id,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'reminder_sent_at') AS appointments_reminder_sent_at,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'message_attachments' AND column_name = 'file_data') AS attachments_file_data,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_notifications' AND column_name = 'dedupe_key') AS notifications_dedupe_key`;
    const schema = checks[0] || {};
    const missing = Object.entries(schema).filter(([, present]) => !present).map(([name]) => name);

    let lastBackupAt = null;
    if (schema.backup_runs) {
      try {
        const backups = await sql`SELECT max(finished_at) AS last_backup_at FROM backup_runs WHERE status = 'completed'`;
        lastBackupAt = backups[0]?.last_backup_at || null;
      } catch (error) {
        console.error('Health backup lookup failed', error);
      }
    }

    const schemaReady = missing.length === 0;
    const ok = schemaReady && authConfigured;
    return reply(res, 200, {
      ...base,
      ok,
      status: ok ? 'ok' : 'degraded',
      databaseReachable: true,
      latencyMs: Date.now() - started,
      schemaReady,
      missing: missing.length ? missing : undefined,
      lastBackupAt,
      backupOlderThan24h: lastBackupAt ? (Date.now() - new Date(lastBackupAt).getTime()) > 24 * 60 * 60 * 1000 : true
    });
  } catch (error) {
    console.error('Health check database connection failed', error);
    return reply(res, 503, {
      ...base,
      ok: false,
      status: 'unavailable',
      databaseReachable: false,
      schemaReady: false,
      latencyMs: Date.now() - started
    });
  }
};
