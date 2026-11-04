const crypto = require('node:crypto');
const { reply, method, database, requireUser, guardMutation, text, audit, clinicianSurname, canAccessPatient } = require('./_lib/http');
const { createNotification, IN_APP } = require('./_lib/notifications');

function safeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

module.exports = async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!method(req, ['GET', 'POST', 'PATCH'], res)) return;
  if (!guardMutation(req, res)) return;
  const sql = database();

  try {
    if (req.method === 'PATCH') {
      const requested = String(req.body?.threadId || '');
      if (!requested) return reply(res, 400, { error: 'Choose a conversation.' });
      const threads = await sql`SELECT id, patient_id FROM chat_threads WHERE id = ${requested} OR patient_id = ${requested} LIMIT 1`;
      const thread = threads[0];
      if (!thread) return reply(res, 404, { error: 'Conversation not found.' });
      if (!(await canAccessPatient(sql, user, thread.patient_id))) {
        return reply(res, 403, { error: 'You do not have access to this conversation.' });
      }
      await sql`UPDATE chat_messages SET read_by = CASE WHEN ${user.sub} = ANY(read_by) THEN read_by ELSE array_append(read_by, ${user.sub}) END
        WHERE thread_id = ${thread.id} AND sender_id <> ${user.sub}`;
      await audit(sql, user.sub, 'conversation.read', 'chat_thread', thread.id);
      return reply(res, 200, { ok: true });
    }

    if (req.method === 'GET') {
      const doctorSurname = clinicianSurname(user.name);
      let threads;
      if (user.role === 'patient') {
        threads = await sql`SELECT t.id, t.patient_id, u.name AS patient_name, u.email AS patient_email, u.phone AS patient_phone,
            t.created_at, t.updated_at,
            (SELECT count(*)::int FROM chat_messages m WHERE m.thread_id = t.id AND m.sender_id <> ${user.sub} AND NOT (${user.sub} = ANY(m.read_by))) AS unread_count
          FROM chat_threads t JOIN clinic_users u ON u.id = t.patient_id
          WHERE t.patient_id = ${user.sub}`;
        if (!threads.length) {
          threads = await sql`INSERT INTO chat_threads (id, patient_id) VALUES (${crypto.randomUUID()}, ${user.sub})
            ON CONFLICT (patient_id) DO UPDATE SET updated_at = chat_threads.updated_at
            RETURNING id, patient_id, now() AS created_at, updated_at, 0 AS unread_count`;
          threads[0].patient_name = user.name;
          threads[0].patient_email = user.email || '';
          threads[0].patient_phone = '';
        }
      } else if (user.role === 'doctor') {
        threads = await sql`SELECT t.id, t.patient_id, u.name AS patient_name, u.email AS patient_email, u.phone AS patient_phone,
            t.created_at, t.updated_at,
            (SELECT count(*)::int FROM chat_messages m WHERE m.thread_id = t.id AND m.sender_id <> ${user.sub} AND NOT (${user.sub} = ANY(m.read_by))) AS unread_count
          FROM chat_threads t JOIN clinic_users u ON u.id = t.patient_id
          WHERE EXISTS (
            SELECT 1 FROM appointments a WHERE a.patient_id = t.patient_id
              AND (a.clinician_id = ${user.sub} OR (a.clinician_id IS NULL AND lower(a.dentist) LIKE ${`%${doctorSurname}%`}))
          )
          ORDER BY t.updated_at DESC`;
      } else {
        threads = await sql`SELECT t.id, t.patient_id, u.name AS patient_name, u.email AS patient_email, u.phone AS patient_phone,
            t.created_at, t.updated_at,
            (SELECT count(*)::int FROM chat_messages m WHERE m.thread_id = t.id AND m.sender_id <> ${user.sub} AND NOT (${user.sub} = ANY(m.read_by))) AS unread_count
          FROM chat_threads t JOIN clinic_users u ON u.id = t.patient_id
          ORDER BY t.updated_at DESC`;
      }

      const threadId = String(req.query?.threadId || '');
      if (!threadId) return reply(res, 200, { threads });

      let allowed = threads.find(thread => thread.id === threadId);
      if (!allowed && user.role !== 'patient') {
        const patientRows = await sql`SELECT t.id, t.patient_id, u.name AS patient_name, u.email AS patient_email, u.phone AS patient_phone,
            t.created_at, t.updated_at, 0 AS unread_count
          FROM chat_threads t JOIN clinic_users u ON u.id = t.patient_id
          WHERE t.patient_id = ${threadId} LIMIT 1`;
        if (patientRows.length && await canAccessPatient(sql, user, threadId)) allowed = patientRows[0];
      }
      if (!allowed) return reply(res, 404, { error: 'Conversation not found.' });

      const beforeDate = req.query?.before ? new Date(String(req.query.before)) : null;
      const beforeISO = beforeDate && Number.isFinite(beforeDate.getTime()) ? beforeDate.toISOString() : null;
      const limit = safeLimit(req.query?.limit);
      const rows = await sql`SELECT m.id, m.thread_id, m.sender_id, u.name AS sender_name, u.role AS sender_role,
          m.body, m.message_type, m.read_by, m.created_at,
          COALESCE(json_agg(json_build_object(
            'id', a.id, 'name', a.file_name, 'type', a.content_type, 'size', a.file_size,
            'url', '/api/attachments?id=' || a.id
          )) FILTER (WHERE a.id IS NOT NULL), '[]') AS attachments
        FROM chat_messages m
        JOIN clinic_users u ON u.id = m.sender_id
        LEFT JOIN message_attachments a ON a.message_id = m.id
        WHERE m.thread_id = ${allowed.id}
          AND (${beforeISO}::timestamptz IS NULL OR m.created_at < ${beforeISO}::timestamptz)
        GROUP BY m.id, u.name, u.role
        ORDER BY m.created_at DESC
        LIMIT ${limit + 1}`;
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit).reverse();
      const nextBefore = page.length ? new Date(page[0].created_at).toISOString() : null;
      return reply(res, 200, { thread: allowed, messages: page, hasMore, nextBefore });
    }

    // POST a message
    const body = text(req.body?.body, 8000);
    const attachmentOnly = req.body?.attachmentOnly === true;
    if (!body && !attachmentOnly) return reply(res, 400, { error: 'Write a message or attach a file before sending.' });

    let patientId = user.sub;
    if (user.role !== 'patient') {
      patientId = text(req.body?.patientId, 100);
      if (!patientId) return reply(res, 400, { error: 'Choose a patient conversation.' });
      const patient = await sql`SELECT id FROM clinic_users WHERE id = ${patientId} AND role = 'patient' AND active = true LIMIT 1`;
      if (!patient.length) return reply(res, 404, { error: 'Patient account not found.' });
      if (!(await canAccessPatient(sql, user, patientId))) {
        return reply(res, 403, { error: 'This patient is not part of your clinical caseload.' });
      }
    } else {
      const patient = await sql`SELECT id FROM clinic_users WHERE id = ${user.sub} AND role = 'patient' AND active = true LIMIT 1`;
      if (!patient.length) return reply(res, 403, { error: 'Patient account is unavailable.' });
    }

    const messageType = ['standard', 'instruction', 'medicine'].includes(req.body?.messageType) ? req.body.messageType : 'standard';
    const threadRows = await sql`INSERT INTO chat_threads (id, patient_id) VALUES (${crypto.randomUUID()}, ${patientId})
      ON CONFLICT (patient_id) DO UPDATE SET updated_at = now()
      RETURNING id`;
    const threadIdValue = threadRows[0].id;
    const messageId = crypto.randomUUID();
    const rows = await sql`INSERT INTO chat_messages (id, thread_id, sender_id, body, message_type)
      VALUES (${messageId}, ${threadIdValue}, ${user.sub}, ${body}, ${messageType})
      RETURNING id, thread_id, sender_id, body, message_type, created_at`;
    await sql`UPDATE chat_threads SET updated_at = now() WHERE id = ${threadIdValue}`;
    await audit(sql, user.sub, 'message.sent', 'chat_message', messageId, { threadId: threadIdValue, patientId });

    if (user.role === 'patient') {
      const clinicians = await sql`SELECT DISTINCT clinician_id FROM appointments
        WHERE patient_id = ${patientId} AND clinician_id IS NOT NULL AND status IN ('requested', 'confirmed', 'completed')`;
      const recipients = new Set(clinicians.map(row => row.clinician_id));
      const management = await sql`SELECT id FROM clinic_users WHERE role = 'management' AND active = true`;
      for (const row of management) recipients.add(row.id);
      for (const recipient of recipients) {
        await createNotification(sql, {
          userId: recipient,
          title: 'New patient message',
          body: `${user.name} sent a new message in the care conversation.`,
          type: 'info',
          link: '/',
          channels: [IN_APP]
        });
      }
    } else {
      await createNotification(sql, {
        userId: patientId,
        title: 'New care team message',
        body: 'Your care team sent a new message.',
        type: 'info',
        link: '/',
        channels: [IN_APP]
      });
      if (user.role === 'management') {
        const clinicians = await sql`SELECT DISTINCT clinician_id FROM appointments WHERE patient_id = ${patientId} AND clinician_id IS NOT NULL`;
        for (const row of clinicians) {
          await createNotification(sql, {
            userId: row.clinician_id,
            title: 'Care team message sent',
            body: `Management replied to a patient in your caseload.`,
            type: 'info',
            channels: [IN_APP]
          });
        }
      }
    }
    return reply(res, 201, { message: rows[0] });
  } catch (error) {
    console.error('Message API error', error);
    return reply(res, 500, { error: 'Could not load or send the message.' });
  }
};
