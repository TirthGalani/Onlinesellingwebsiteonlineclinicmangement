const crypto = require('node:crypto');
const { reply, method, database, requireUser, guardMutation, text, audit, canAccessPatient } = require('./_lib/http');

// Vercel's JSON body limit is 4.5 MB. Base64 expands by ~33%, so the default
// decoded cap is 3 MB. Override downward with ATTACHMENT_MAX_BYTES if needed.
const HARD_MAX_BYTES = 3 * 1024 * 1024;
const MAX_BYTES = Math.min(
  Math.max(Number(process.env.ATTACHMENT_MAX_BYTES) || HARD_MAX_BYTES, 64 * 1024),
  HARD_MAX_BYTES
);
const MAX_PER_MESSAGE = 5;

function safeFileName(value) {
  const name = String(value || 'attachment')
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001F<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return name || 'attachment';
}

function sniffContentType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
      buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return 'image/png';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

function decodeBase64(value) {
  let raw = String(value || '').trim();
  if (raw.startsWith('data:')) {
    const comma = raw.indexOf(',');
    if (comma === -1) return null;
    raw = raw.slice(comma + 1);
  }
  if (!raw || raw.length > Math.ceil(MAX_BYTES * 4 / 3) + 32) return null;
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) return null;
  const buffer = Buffer.from(raw.replace(/\s+/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  return buffer;
}

module.exports = async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!method(req, ['GET', 'POST'], res)) return;
  if (!guardMutation(req, res)) return;
  const sql = database();

  try {
    if (req.method === 'GET') {
      const id = text(req.query?.id, 100);
      if (!id) return reply(res, 400, { error: 'Provide an attachment id.' });
      const rows = await sql`SELECT a.id, a.file_name, a.content_type, a.file_size, encode(a.file_data, 'base64') AS data,
          m.sender_id, t.patient_id
        FROM message_attachments a
        JOIN chat_messages m ON m.id = a.message_id
        JOIN chat_threads t ON t.id = m.thread_id
        WHERE a.id = ${id} LIMIT 1`;
      const attachment = rows[0];
      if (!attachment || !attachment.data) return reply(res, 404, { error: 'Attachment not found.' });
      if (!(await canAccessPatient(sql, user, attachment.patient_id))) {
        return reply(res, 403, { error: 'You do not have access to this attachment.' });
      }
      const buffer = Buffer.from(attachment.data, 'base64');
      const disposition = attachment.content_type === 'application/pdf' ? 'attachment' : 'inline';
      res.statusCode = 200;
      res.setHeader('Content-Type', attachment.content_type);
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Content-Disposition', `${disposition}; filename="${attachment.file_name.replace(/["\\]/g, '')}"`);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      return res.end(buffer);
    }

    const messageId = text(req.body?.messageId, 100);
    const fileName = safeFileName(req.body?.fileName);
    const buffer = decodeBase64(req.body?.dataBase64);
    if (!messageId || !buffer) {
      return reply(res, 400, {
        error: `Attach a valid image (JPEG, PNG, WebP) or PDF no larger than ${Math.round(MAX_BYTES / (1024 * 1024))} MB.`
      });
    }
    const contentType = sniffContentType(buffer);
    if (!contentType) {
      return reply(res, 415, { error: 'Only JPEG, PNG, WebP images and PDF documents are accepted.' });
    }

    const messages = await sql`SELECT m.id, m.sender_id, t.patient_id
      FROM chat_messages m JOIN chat_threads t ON t.id = m.thread_id
      WHERE m.id = ${messageId} LIMIT 1`;
    const message = messages[0];
    if (!message) return reply(res, 404, { error: 'Message not found.' });
    if (message.sender_id !== user.sub) {
      return reply(res, 403, { error: 'Only the sender can attach files to this message.' });
    }
    const counts = await sql`SELECT count(*)::int AS total FROM message_attachments WHERE message_id = ${messageId}`;
    if ((counts[0]?.total || 0) >= MAX_PER_MESSAGE) {
      return reply(res, 409, { error: `A message can have at most ${MAX_PER_MESSAGE} attachments.` });
    }

    const id = crypto.randomUUID();
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const hexData = buffer.toString("hex");
    await sql`INSERT INTO message_attachments (id, message_id, storage_key, file_name, content_type, file_size, uploaded_by, checksum, file_data)
      VALUES (${id}, ${messageId}, ${`db:${id}`}, ${fileName}, ${contentType}, ${buffer.length}, ${user.sub}, ${checksum}, decode(${hexData}, 'hex'))`;
    await audit(sql, user.sub, 'attachment.uploaded', 'message_attachment', id, {
      messageId, contentType, fileSize: buffer.length, patientId: message.patient_id
    });

    return reply(res, 201, {
      attachment: {
        id,
        messageId,
        name: fileName,
        type: contentType,
        size: buffer.length,
        url: `/api/attachments?id=${encodeURIComponent(id)}`
      }
    });
  } catch (error) {
    console.error('Attachment API error', error);
    return reply(res, 500, { error: 'Could not process the attachment.' });
  }
};
