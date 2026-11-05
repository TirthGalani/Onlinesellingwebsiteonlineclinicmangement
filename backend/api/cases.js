// Management endpoint for before/after smile cases.
// Publishing requires a recorded consent date and both photographs; withdrawing
// consent unpublishes the case immediately and keeps the audit trail.
const crypto = require('node:crypto');
const { reply, method, database, requireUser, guardMutation, text, audit } = require('./_lib/http');

const HARD_MAX_BYTES = 3 * 1024 * 1024;
const MAX_BYTES = Math.min(Math.max(Number(process.env.ATTACHMENT_MAX_BYTES) || HARD_MAX_BYTES, 64 * 1024), HARD_MAX_BYTES);
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sniffContentType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
      buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return 'image/png';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function decodeImage(value) {
  let raw = String(value || '').trim();
  if (!raw) return { buffer: null, reason: '' };
  if (raw.startsWith('data:')) {
    const comma = raw.indexOf(',');
    if (comma === -1) return { buffer: null, reason: 'Image data is malformed.' };
    raw = raw.slice(comma + 1);
  }
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) return { buffer: null, reason: 'Image data is malformed.' };
  const buffer = Buffer.from(raw.replace(/\s+/g, ''), 'base64');
  if (!buffer.length) return { buffer: null, reason: 'Choose a photograph.' };
  if (buffer.length > MAX_BYTES) return { buffer: null, reason: `Each photograph must be under ${Math.round(MAX_BYTES / 1024 / 1024)} MB.` };
  const contentType = sniffContentType(buffer);
  if (!contentType || !IMAGE_TYPES.includes(contentType)) return { buffer: null, reason: 'Use a JPEG, PNG or WEBP photograph.' };
  return { buffer, contentType, reason: '' };
}

function shape(row) {
  return {
    id: row.id,
    title: row.title,
    treatment: row.treatment,
    summary: row.summary,
    clinician: row.clinician || '',
    clinicianId: row.clinician_id || '',
    consentName: row.consent_name || '',
    consentReference: row.consent_reference || '',
    consentConfirmedAt: row.consent_confirmed_at || null,
    hasBefore: Boolean(row.has_before),
    hasAfter: Boolean(row.has_after),
    published: Boolean(row.published),
    created: row.created_at
  };
}

module.exports = async function handler(req, res) {
  const user = requireUser(req, res, ['management']);
  if (!user) return;
  if (!method(req, ['GET', 'POST', 'PATCH', 'DELETE'], res)) return;
  if (!guardMutation(req, res)) return;
  const sql = database();

  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT c.id, c.title, c.treatment, c.summary, c.consent_name, c.consent_reference,
          c.consent_confirmed_at, c.published, c.created_at, c.clinician_id,
          (c.before_data IS NOT NULL) AS has_before, (c.after_data IS NOT NULL) AS has_after, u.name AS clinician
        FROM smile_cases c LEFT JOIN clinic_users u ON u.id = c.clinician_id
        ORDER BY c.created_at DESC LIMIT 200`;
      return reply(res, 200, { cases: rows.map(shape) });
    }

    const id = text(req.body?.id || req.query?.id, 64);

    if (req.method === 'DELETE') {
      if (!ID_RE.test(id)) return reply(res, 400, { error: 'Provide a valid case id.' });
      const existing = await sql`SELECT id, published FROM smile_cases WHERE id = ${id} LIMIT 1`;
      if (!existing.length) return reply(res, 404, { error: 'Smile case not found.' });
      await sql`DELETE FROM smile_cases WHERE id = ${id}`;
      await audit(sql, user.sub, 'smileCase.deleted', 'smile_case', id, { wasPublished: Boolean(existing[0].published) });
      return reply(res, 200, { ok: true });
    }

    if (req.method === 'PATCH') {
      if (!ID_RE.test(id)) return reply(res, 400, { error: 'Provide a valid case id.' });
      const existing = await sql`SELECT * FROM smile_cases WHERE id = ${id} LIMIT 1`;
      if (!existing.length) return reply(res, 404, { error: 'Smile case not found.' });

      if (req.body?.withdrawConsent === true) {
        await sql`UPDATE smile_cases SET published = false, consent_reference = ${`${existing[0].consent_reference} (consent withdrawn)`.slice(0, 120)}, updated_at = now() WHERE id = ${id}`;
        await audit(sql, user.sub, 'smileCase.consentWithdrawn', 'smile_case', id, {});
        return reply(res, 200, { ok: true, published: false });
      }

      const published = req.body?.published === undefined ? existing[0].published : Boolean(req.body.published);
      if (published && (!existing[0].before_data || !existing[0].after_data || !existing[0].consent_confirmed_at)) {
        return reply(res, 409, { error: 'A case can only be published with both photographs and a recorded consent date.' });
      }

      const title = text(req.body?.title, 160) || existing[0].title;
      const treatment = text(req.body?.treatment, 120) || existing[0].treatment;
      const summary = req.body?.summary === undefined ? existing[0].summary : text(req.body.summary, 600);
      const consentName = req.body?.consentName === undefined ? existing[0].consent_name : text(req.body.consentName, 120);
      const consentReference = req.body?.consentReference === undefined ? existing[0].consent_reference : text(req.body.consentReference, 120);
      const consentDate = req.body?.consentConfirmedAt === undefined
        ? existing[0].consent_confirmed_at
        : (DATE_RE.test(String(req.body.consentConfirmedAt)) ? String(req.body.consentConfirmedAt) : null);

      await sql`UPDATE smile_cases SET title = ${title}, treatment = ${treatment}, summary = ${summary},
        consent_name = ${consentName}, consent_reference = ${consentReference}, consent_confirmed_at = ${consentDate},
        published = ${published}, updated_at = now() WHERE id = ${id}`;
      await audit(sql, user.sub, 'smileCase.updated', 'smile_case', id, { published });
      return reply(res, 200, { ok: true, published });
    }

    const title = text(req.body?.title, 160);
    const treatment = text(req.body?.treatment, 120);
    const summary = text(req.body?.summary, 600);
    const clinicianId = text(req.body?.clinicianId, 100);
    const consentName = text(req.body?.consentName, 120);
    const consentReference = text(req.body?.consentReference, 120);
    const consentConfirmedAt = text(req.body?.consentConfirmedAt, 10);
    const wantsPublished = req.body?.published === true || String(req.body?.published) === 'true';

    if (title.length < 3 || treatment.length < 2) return reply(res, 400, { error: 'Add a case title and the treatment type.' });
    if (consentConfirmedAt && !DATE_RE.test(consentConfirmedAt)) return reply(res, 400, { error: 'Consent date must use YYYY-MM-DD.' });

    const before = decodeImage(req.body?.beforeImage);
    const after = decodeImage(req.body?.afterImage);
    if (before.reason) return reply(res, 400, { error: `Before photograph: ${before.reason}` });
    if (after.reason) return reply(res, 400, { error: `After photograph: ${after.reason}` });
    if (!before.buffer || !after.buffer) return reply(res, 400, { error: 'Upload both the before and the after photograph.' });

    const publishable = Boolean(consentConfirmedAt);
    if (wantsPublished && !publishable) {
      return reply(res, 409, { error: 'A case can only be published with both photographs and a recorded consent date.' });
    }

    if (clinicianId) {
      const clinician = await sql`SELECT id FROM clinic_users WHERE id = ${clinicianId} AND active = true LIMIT 1`;
      if (!clinician.length) return reply(res, 400, { error: 'Choose an active clinician.' });
    }

    const newId = crypto.randomUUID();
    const published = wantsPublished && publishable;
    await sql`INSERT INTO smile_cases
      (id, title, treatment, summary, clinician_id, before_data, before_type, after_data, after_type,
       consent_name, consent_reference, consent_confirmed_at, published)
      VALUES (${newId}, ${title}, ${treatment}, ${summary}, ${clinicianId || null},
       decode(${before.buffer.toString('hex')}, 'hex'), ${before.contentType},
       decode(${after.buffer.toString('hex')}, 'hex'), ${after.contentType},
       ${consentName}, ${consentReference}, ${consentConfirmedAt || null}, ${published})`;

    await audit(sql, user.sub, 'smileCase.created', 'smile_case', newId, {
      published, hasConsent: Boolean(consentConfirmedAt)
    });
    return reply(res, 201, { case: { id: newId, title, treatment, published } });
  } catch (error) {
    console.error('Smile case API error', error);
    return reply(res, 500, { error: 'The smile case could not be saved.' });
  }
};
