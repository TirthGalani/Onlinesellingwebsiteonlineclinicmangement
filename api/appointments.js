const crypto = require('node:crypto');
const { reply, method, database, requireUser, guardMutation, text, audit, clinicianSurname } = require('./_lib/http');
const {
  clinicTimeZone,
  parseAppointmentDate,
  resolveClinician,
  availabilityForBooking,
  findConflict,
  canAccessAppointment,
  fetchAppointment
} = require('./_lib/appointments');
const { createNotification, IN_APP, EMAIL, SMS } = require('./_lib/notifications');

function formatWhen(value) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: clinicTimeZone(),
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(new Date(value));
}

async function notifyAppointmentStaff(sql, appointment, title, body, dedupePrefix, skipUserId = null) {
  const recipients = new Set();
  if (appointment.clinician_id) recipients.add(appointment.clinician_id);
  const management = await sql`SELECT id FROM clinic_users WHERE role = 'management' AND active = true`;
  for (const row of management) recipients.add(row.id);
  for (const userId of recipients) {
    if (userId === skipUserId) continue;
    await createNotification(sql, {
      userId,
      title,
      body,
      type: 'info',
      link: '/',
      channels: [IN_APP],
      dedupeKey: dedupePrefix ? `${dedupePrefix}:${userId}` : null
    });
  }
}

module.exports = async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!method(req, ['GET', 'POST', 'PATCH'], res)) return;
  if (!guardMutation(req, res)) return;
  const sql = database();

  try {
    if (req.method === 'GET') {
      const allowedStatuses = ['requested', 'confirmed', 'completed', 'cancelled'];
      const status = allowedStatuses.includes(text(req.query?.status, 20)) ? text(req.query?.status, 20) : null;
      const fromDate = req.query?.from ? new Date(String(req.query.from)) : null;
      const toDate = req.query?.to ? new Date(String(req.query.to)) : null;
      const fromISO = fromDate && Number.isFinite(fromDate.getTime()) ? fromDate.toISOString() : null;
      const toISO = toDate && Number.isFinite(toDate.getTime()) ? toDate.toISOString() : null;
      const q = text(req.query?.q, 120);
      const like = q ? `%${q}%` : null;
      const patientId = user.role === 'patient' ? null : text(req.query?.patientId, 100) || null;
      const doctorSurname = clinicianSurname(user.name);

      const rows = await sql`SELECT a.*, u.email AS patient_email, u.phone AS patient_phone, c.name AS clinician_name
        FROM appointments a
        JOIN clinic_users u ON u.id = a.patient_id
        LEFT JOIN clinic_users c ON c.id = a.clinician_id
        WHERE (${user.role} <> 'patient' OR a.patient_id = ${user.sub})
          AND (${user.role} <> 'doctor' OR a.clinician_id = ${user.sub} OR (a.clinician_id IS NULL AND lower(a.dentist) LIKE ${`%${doctorSurname}%`}))
          AND (${status}::text IS NULL OR a.status = ${status}::text)
          AND (${patientId}::text IS NULL OR a.patient_id = ${patientId}::text)
          AND (${fromISO}::timestamptz IS NULL OR a.appointment_at >= ${fromISO}::timestamptz)
          AND (${toISO}::timestamptz IS NULL OR a.appointment_at <= ${toISO}::timestamptz)
          AND (${like}::text IS NULL OR a.patient_name ILIKE ${like} OR a.service ILIKE ${like} OR a.dentist ILIKE ${like} OR u.email ILIKE ${like})
        ORDER BY a.appointment_at ASC
        LIMIT 500`;
      return reply(res, 200, { appointments: rows });
    }

    if (req.method === 'POST') {
      if (!['patient', 'management'].includes(user.role)) {
        return reply(res, 403, { error: 'Only patients or management may create appointments.' });
      }
      const service = text(req.body?.service, 160);
      const notes = text(req.body?.notes, 2000);
      const requestedRoom = text(req.body?.room, 120);
      const clinicianId = text(req.body?.clinicianId, 100);
      const dentistName = text(req.body?.dentist, 120);
      const when = parseAppointmentDate(req.body?.date);
      if (!service || !when) {
        return reply(res, 400, { error: 'Provide a service and a future appointment time.' });
      }

      let patient;
      if (user.role === 'management') {
        const patientId = text(req.body?.patientId, 100);
        if (!patientId) return reply(res, 400, { error: 'Choose the patient for this appointment.' });
        const rows = await sql`SELECT id, name, email, phone FROM clinic_users WHERE id = ${patientId} AND role = 'patient' AND active = true LIMIT 1`;
        patient = rows[0];
        if (!patient) return reply(res, 404, { error: 'Patient account not found.' });
      } else {
        const rows = await sql`SELECT id, name, email, phone FROM clinic_users WHERE id = ${user.sub} AND role = 'patient' AND active = true LIMIT 1`;
        patient = rows[0];
        if (!patient) return reply(res, 403, { error: 'Patient account is unavailable.' });
      }

      const clinician = await resolveClinician(sql, { clinicianId, dentist: dentistName });
      if (!clinician) return reply(res, 400, { error: 'Choose an active clinician before booking.' });

      const availability = await availabilityForBooking(sql, { clinician, date: when });
      if (!availability.allowed) {
        return reply(res, 409, {
          error: availability.reason,
          availableSlots: availability.availableSlots,
          code: 'slot_unavailable'
        });
      }
      const conflict = await findConflict(sql, {
        clinicianId: clinician.id,
        dentist: clinician.name,
        start: when,
        durationMinutes: availability.durationMinutes
      });
      if (conflict) {
        return reply(res, 409, { error: 'That clinician and time are already booked.', code: 'slot_taken' });
      }

      const id = crypto.randomUUID();
      const statusValue = user.role === 'management' ? 'confirmed' : 'requested';
      const rows = await sql`INSERT INTO appointments
        (id, patient_id, patient_name, service, dentist, clinician_id, appointment_at, status, notes, room, duration_minutes, created_by)
        VALUES (${id}, ${patient.id}, ${patient.name}, ${service}, ${clinician.name}, ${clinician.id}, ${when.toISOString()}, ${statusValue}, ${notes}, ${requestedRoom || availability.room || 'Clinic suite'}, ${availability.durationMinutes}, ${user.sub})
        RETURNING *`;
      const appointment = await fetchAppointment(sql, rows[0].id);

      await audit(sql, user.sub, 'appointment.requested', 'appointment', id, {
        patientId: patient.id, service, clinicianId: clinician.id, appointmentAt: when.toISOString(), status: statusValue
      });

      await createNotification(sql, {
        userId: patient.id,
        title: statusValue === 'confirmed' ? 'Appointment confirmed' : 'Appointment request received',
        body: `${service} with ${clinician.name} on ${formatWhen(when)} is ${statusValue === 'confirmed' ? 'confirmed' : 'awaiting clinic confirmation'}.`,
        type: statusValue === 'confirmed' ? 'success' : 'info',
        link: '/',
        channels: [IN_APP, EMAIL, SMS],
        dedupeKey: `appointment-created:${id}`
      });
      await notifyAppointmentStaff(
        sql,
        appointment,
        statusValue === 'confirmed' ? 'New appointment booked' : 'New appointment request',
        `${patient.name} · ${service} · ${formatWhen(when)}.`,
        `appointment-staff-created:${id}`,
        user.sub
      );
      return reply(res, 201, { appointment });
    }

    // PATCH: status changes and reschedules
    const id = text(req.body?.id, 100);
    if (!id) return reply(res, 400, { error: 'Provide an appointment id.' });
    const existing = await fetchAppointment(sql, id);
    if (!existing) return reply(res, 404, { error: 'Appointment not found.' });
    if (!canAccessAppointment(existing, user)) return reply(res, 403, { error: 'You do not have access to this appointment.' });

    const newDate = req.body?.date ? parseAppointmentDate(req.body.date) : null;
    const rescheduleReason = text(req.body?.rescheduleReason, 500);
    if (req.body?.date && !newDate) return reply(res, 400, { error: 'Choose a valid future appointment time.' });

    if (newDate) {
      if (!['requested', 'confirmed'].includes(existing.status)) {
        return reply(res, 409, { error: 'Completed or cancelled appointments cannot be rescheduled.' });
      }
      if (user.role === 'patient' && new Date(existing.appointment_at).getTime() <= Date.now()) {
        return reply(res, 409, { error: 'Past appointments cannot be rescheduled.' });
      }
      const clinician = await resolveClinician(sql, {
        clinicianId: text(req.body?.clinicianId, 100) || existing.clinician_id,
        dentist: text(req.body?.dentist, 120) || existing.dentist
      });
      if (!clinician) return reply(res, 400, { error: 'Choose an active clinician.' });
      const availability = await availabilityForBooking(sql, { clinician, date: newDate });
      if (!availability.allowed) {
        return reply(res, 409, { error: availability.reason, availableSlots: availability.availableSlots, code: 'slot_unavailable' });
      }
      const conflict = await findConflict(sql, {
        clinicianId: clinician.id,
        dentist: clinician.name,
        start: newDate,
        durationMinutes: availability.durationMinutes,
        excludeId: id
      });
      if (conflict) return reply(res, 409, { error: 'That clinician and time are already booked.', code: 'slot_taken' });
      const nextStatus = user.role === 'patient' ? 'requested' : existing.status;
      const room = text(req.body?.room, 120) || availability.room || existing.room || 'Clinic suite';
      await sql`UPDATE appointments SET appointment_at = ${newDate.toISOString()}, clinician_id = ${clinician.id}, dentist = ${clinician.name},
        room = ${room}, duration_minutes = ${availability.durationMinutes}, status = ${nextStatus},
        rescheduled_from = ${existing.appointment_at}, updated_at = now()
        WHERE id = ${id}`;
      await audit(sql, user.sub, 'appointment.rescheduled', 'appointment', id, {
        from: existing.appointment_at, to: newDate.toISOString(), clinicianId: clinician.id, status: nextStatus, reason: rescheduleReason
      });
      if (user.role !== 'patient') {
        await createNotification(sql, {
          userId: existing.patient_id,
          title: 'Appointment rescheduled',
          body: `${existing.service} is now scheduled for ${formatWhen(newDate)} with ${clinician.name}.`,
          type: 'info',
          link: '/',
          channels: [IN_APP, EMAIL, SMS],
          dedupeKey: `appointment-rescheduled:${id}:${newDate.toISOString()}`
        });
      }
      await notifyAppointmentStaff(
        sql,
        { ...existing, clinician_id: clinician.id },
        'Appointment rescheduled',
        `${existing.patient_name} · ${existing.service} moved to ${formatWhen(newDate)}.`,
        `appointment-staff-rescheduled:${id}:${newDate.toISOString()}`,
        user.sub
      );
      const updated = await fetchAppointment(sql, id);
      return reply(res, 200, { appointment: updated });
    }

    const requestedStatus = text(req.body?.status, 20);
    if (!['confirmed', 'completed', 'cancelled'].includes(requestedStatus)) {
      return reply(res, 400, { error: 'Provide a valid status or a new appointment time.' });
    }
    if (user.role === 'patient' && requestedStatus !== 'cancelled') {
      return reply(res, 403, { error: 'Patients may only cancel their own appointment.' });
    }
    if (existing.status === 'cancelled') return reply(res, 409, { error: 'This appointment is already cancelled.' });
    if (existing.status === 'completed' && requestedStatus !== 'completed') {
      return reply(res, 409, { error: 'Completed appointments cannot be changed.' });
    }
    if (requestedStatus === 'completed' && new Date(existing.appointment_at).getTime() > Date.now()) {
      return reply(res, 409, { error: 'A future appointment cannot be marked completed.' });
    }
    if (requestedStatus === 'cancelled' && user.role === 'patient' && new Date(existing.appointment_at).getTime() <= Date.now()) {
      return reply(res, 409, { error: 'Past appointments cannot be cancelled.' });
    }
    if (requestedStatus === 'confirmed' && existing.status === 'completed') {
      return reply(res, 409, { error: 'Completed appointments cannot be reconfirmed.' });
    }

    const reason = text(req.body?.cancellationReason, 500);
    await sql`UPDATE appointments SET status = ${requestedStatus}, cancellation_reason = ${requestedStatus === 'cancelled' ? reason : ''}, updated_at = now() WHERE id = ${id}`;
    await audit(sql, user.sub, `appointment.${requestedStatus}`, 'appointment', id, { reason, previousStatus: existing.status });

    if (user.role !== 'patient') {
      await createNotification(sql, {
        userId: existing.patient_id,
        title: `Appointment ${requestedStatus}`,
        body: `${existing.service} on ${formatWhen(existing.appointment_at)} is now ${requestedStatus}.${reason ? ` Reason: ${reason}` : ''}`,
        type: requestedStatus === 'confirmed' ? 'success' : 'info',
        link: '/',
        channels: [IN_APP, EMAIL, SMS],
        dedupeKey: `appointment-status:${id}:${requestedStatus}`
      });
    }
    await notifyAppointmentStaff(
      sql,
      existing,
      `Appointment ${requestedStatus}`,
      `${existing.patient_name} · ${existing.service} · ${formatWhen(existing.appointment_at)}.`,
      `appointment-staff-status:${id}:${requestedStatus}`,
      user.sub
    );
    const updated = await fetchAppointment(sql, id);
    return reply(res, 200, { appointment: updated });
  } catch (error) {
    if (error.code === '23505') return reply(res, 409, { error: 'That clinician and appointment time are already booked.' });
    console.error('Appointment API error', error);
    return reply(res, 500, { error: 'Could not process the appointment.' });
  }
};
