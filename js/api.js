/* Clinic API client.
 * The renderers were written against the localStorage view-models in data.js, so this
 * layer converts the database rows into exactly those shapes instead of rewriting
 * every renderer. All calls are same-origin and send the HttpOnly session cookie. */
(function (rootScope) {
  'use strict';

  const ROLE_AVATARS = {
    patient: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    doctor: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=300&q=80',
    management: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80'
  };

  const ROLE_TITLES = {
    patient: 'Private Patient',
    doctor: 'Lead Prosthodontist',
    management: 'Clinical Operations Director'
  };

  class ApiError extends Error {
    constructor(message, status, payload) {
      super(message);
      this.status = status;
      this.payload = payload || {};
    }
  }

  async function request(path, options) {
    const settings = options || {};
    const init = {
      method: settings.method || 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    };
    if (settings.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(settings.body);
    }
    if (settings.headers) Object.assign(init.headers, settings.headers);

    let response;
    try {
      response = await fetch(path, init);
    } catch (networkError) {
      throw new ApiError('The clinic service is unreachable. Check your connection.', 0, {});
    }

    const isFile = settings.raw === true;
    if (isFile) {
      if (!response.ok) throw new ApiError('Could not load that file.', response.status, {});
      return response;
    }

    let payload = {};
    if (response.status !== 204) {
      const textBody = await response.text();
      try { payload = textBody ? JSON.parse(textBody) : {}; } catch { payload = { error: textBody.slice(0, 200) }; }
    }
    if (!response.ok) {
      throw new ApiError(payload.error || 'The request could not be completed.', response.status, payload);
    }
    return payload;
  }

  function query(params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    }
    const encoded = search.toString();
    return encoded ? `?${encoded}` : '';
  }

  function toTime(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function toDateLabel(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diff)) return '';
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    return toDateLabel(iso);
  }

  function toAppointment(row) {
    return {
      id: row.id,
      patientId: row.patient_id,
      patientName: row.patient_name,
      patientEmail: row.patient_email || '',
      patientPhone: row.patient_phone || '',
      service: row.service,
      dentist: row.dentist,
      clinicianId: row.clinician_id || '',
      room: row.room || 'Clinic suite',
      durationMinutes: row.duration_minutes || 60,
      status: row.status,
      notes: row.notes || '',
      date: row.appointment_at,
      created: row.created_at,
      reminderSentAt: row.reminder_sent_at || null,
      confirmedAt: row.status === 'confirmed' ? row.updated_at : null,
      cancelledAt: row.status === 'cancelled' ? row.updated_at : null,
      dayLabel: toDateLabel(row.appointment_at).split(',').slice(0, 2).join(',').replace(/^\w+ \d+, /, ''),
      time: toTime(row.appointment_at)
    };
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  }

  function toMessage(row) {
    const attachments = Array.isArray(row.attachments) ? row.attachments.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      size: typeof item.size === 'string' ? item.size : formatBytes(item.size),
      isPdf: item.type === 'application/pdf',
      url: item.url
    })) : [];
    const readBy = row.read_by || row.readBy || [];
    return {
      id: row.id,
      senderRole: row.sender_role || row.senderRole,
      senderName: row.sender_name || row.senderName,
      senderId: row.sender_id || row.senderId,
      timestamp: relativeTime(row.created_at),
      createdAt: row.created_at,
      text: row.body !== undefined ? row.body : (row.text || ''),
      type: row.message_type || row.type || 'standard',
      instructionBadge: (row.message_type || row.type) === 'instruction' ? 'Care Instruction' : '',
      attachments,
      readBy,
      // The API only exposes which member ids have opened the message, so the receipt
      // is reported as "read" rather than attributed to a named clinician.
      read: readBy.length > 0
    };
  }

  function toThread(row, messages) {
    return {
      id: row.id,
      patientId: row.patient_id,
      patientName: row.patient_name || 'Patient',
      patientEmail: row.patient_email || '',
      patientPhone: row.patient_phone || '',
      patientAvatar: ROLE_AVATARS.patient,
      lastUpdated: row.updated_at,
      unreadCount: Number(row.unread_count) || 0,
      messages: messages || []
    };
  }

  function toNotification(row) {
    return {
      id: row.id,
      title: row.title,
      message: row.message || row.body || '',
      time: relativeTime(row.created_at),
      type: row.type || 'info',
      read: Boolean(row.read_at),
      link: row.link_url || '',
      deliverySummary: row.delivery_summary || '',
      deliveries: Array.isArray(row.deliveries) ? row.deliveries : []
    };
  }

  function toTreatment(row) {
    return {
      id: row.id,
      patientId: row.patient_id,
      patientName: row.patient_name || '',
      title: row.title,
      status: row.status,
      progress: row.progress || 0,
      dentist: row.clinician_name || '',
      clinicianId: row.clinician_id,
      startDate: toDateLabel(row.created_at),
      estimatedCompletion: toDateLabel(row.updated_at),
      description: row.description || '',
      milestones: Array.isArray(row.milestones) ? row.milestones : []
    };
  }

  function toReview(row) {
    return {
      id: row.id,
      author: row.author || 'Verified Patient',
      authorRole: 'patient',
      rating: row.rating,
      date: toDateLabel(row.created_at),
      service: row.service || '',
      title: row.title,
      content: row.content
    };
  }

  function toUser(row) {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone || '',
      role: row.role,
      title: ROLE_TITLES[row.role] || 'Clinic Team',
      avatar: ROLE_AVATARS[row.role] || ROLE_AVATARS.patient,
      memberSince: toDateLabel(row.created_at),
      active: row.active !== false,
      appointmentCount: Number(row.appointment_count) || 0,
      lastVisit: row.last_visit ? toDateLabel(row.last_visit) : ''
    };
  }

  function toSlot(row) {
    return {
      id: row.id,
      clinicianId: row.clinician_id,
      weekday: Number(row.weekday),
      startTime: row.start_time,
      endTime: row.end_time,
      slotMinutes: row.slot_minutes,
      room: row.room || '',
      active: row.active !== false
    };
  }

  const api = {
    ApiError,
    request,
    ROLE_AVATARS,

    async session() {
      const payload = await request('/api/auth/me');
      return payload.user ? toUser(payload.user) : null;
    },

    async login(email, password) {
      const payload = await request('/api/auth/login', { method: 'POST', body: { email, password } });
      return toUser(payload.user);
    },

    async register(profile) {
      const payload = await request('/api/auth/register', { method: 'POST', body: profile });
      return toUser(payload.user);
    },

    async logout() {
      return request('/api/auth/logout', { method: 'POST', body: {} });
    },

    /* Everything the workspace needs on first paint. Named to stay out of the way of
     * POST /api/bootstrap, which is the one-time management account setup endpoint. */
    async workspace() {
      const [appointments, threadPage, notifications, treatments, reviews] = await Promise.all([
        request('/api/appointments'),
        request('/api/messages'),
        request('/api/notifications'),
        request('/api/treatments'),
        request('/api/reviews')
      ]);
      return {
        appointments: (appointments.appointments || []).map(toAppointment),
        threads: (threadPage.threads || []).map(thread => toThread(thread)),
        notifications: (notifications.notifications || []).map(toNotification),
        treatments: (treatments.treatments || []).map(toTreatment),
        reviews: (reviews.reviews || []).map(toReview)
      };
    },

    async threadMessages(threadId) {
      const payload = await request(`/api/messages${query({ threadId })}`);
      return {
        thread: toThread(payload.thread),
        messages: (payload.messages || []).map(toMessage),
        hasMore: Boolean(payload.hasMore),
        nextBefore: payload.nextBefore
      };
    },

    async createAppointment(input) {
      const payload = await request('/api/appointments', { method: 'POST', body: input });
      return toAppointment(payload.appointment);
    },

    async updateAppointment(input) {
      const payload = await request('/api/appointments', { method: 'PATCH', body: input });
      return toAppointment(payload.appointment);
    },

    async sendMessage(input) {
      const payload = await request('/api/messages', { method: 'POST', body: input });
      return toMessage(payload.message);
    },

    async markThreadRead(conversationId) {
      return request('/api/messages', { method: 'PATCH', body: { threadId: conversationId } });
    },

    async uploadAttachment(messageId, fileName, dataBase64) {
      const payload = await request('/api/attachments', { method: 'POST', body: { messageId, fileName, dataBase64 } });
      const item = payload.attachment || {};
      return {
        id: item.id,
        name: item.name,
        type: item.type,
        size: formatBytes(item.size),
        isPdf: item.type === 'application/pdf',
        url: item.url
      };
    },

    async markNotificationRead(id) {
      return request(`/api/notifications${query({ id })}`, { method: 'PATCH', body: {} });
    },

    async clearNotification(id) {
      return request(`/api/notifications${query({ id })}`, { method: 'DELETE' });
    },

    async markAllNotificationsRead() {
      return request('/api/notifications', { method: 'PATCH', body: {} });
    },

    async clearAllNotifications() {
      return request('/api/notifications', { method: 'DELETE' });
    },

    async notifications() {
      const payload = await request('/api/notifications');
      return (payload.notifications || []).map(toNotification);
    },

    async addReview(input) {
      const payload = await request('/api/reviews', { method: 'POST', body: input });
      return toReview(payload.review);
    },

    async createTreatmentPlan(input) {
      const payload = await request('/api/treatments', { method: 'POST', body: input });
      return toTreatment(payload.treatment);
    },

    async updateTreatmentPlan(input) {
      const payload = await request('/api/treatments', { method: 'PATCH', body: input });
      return toTreatment(payload.treatment);
    },

    /* GET /api/availability?clinicians=1 returns only {id, name, email} — the database has
     * no specialty column, so the view-model fills a neutral label instead of inventing one. */
    async clinicians() {
      const payload = await request('/api/availability?clinicians=1');
      return (payload.clinicians || []).map(row => ({
        id: row.id,
        name: row.name,
        specialty: 'Dental Care',
        avatar: ROLE_AVATARS.doctor
      }));
    },

    /* Slots for one clinician on one calendar day: {start, end, label, available, room}. */
    async availableSlots(clinicianId, date) {
      const payload = await request(`/api/availability${query({ clinicianId, date })}`);
      return {
        clinician: payload.clinician || null,
        date: payload.date,
        timezone: payload.timezone,
        availabilityConfigured: Boolean(payload.availabilityConfigured),
        slots: (payload.slots || []).map(slot => ({
          start: slot.start,
          end: slot.end,
          label: slot.label,
          available: slot.available !== false,
          room: slot.room || ''
        }))
      };
    },

    /* Staff-only: the weekly rules that generate those slots. */
    async availabilityRules(clinicianId) {
      const payload = await request(`/api/availability${query({ clinicianId })}`);
      return (payload.rules || []).map(toSlot);
    },

    async saveAvailability(input) {
      const payload = await request('/api/availability', { method: 'POST', body: input });
      return toSlot(payload.rule || {});
    },

    async deleteAvailability(id) {
      return request(`/api/availability${query({ id })}`, { method: 'DELETE' });
    },

    async patients(search) {
      const payload = await request(`/api/users${query({ q: search })}`);
      return (payload.users || []).map(toUser);
    },

    /* GET /api/users only lists patients (staff-only), so the clinician roster comes
     * from the availability endpoint that already exposes active doctors. */
    async staff() {
      return this.clinicians();
    },

    async createStaffAccount(input) {
      const payload = await request('/api/users', { method: 'POST', body: input });
      return toUser(payload.user);
    },

    async runReminders(secret) {
      return request(`/api/reminders${query({ secret })}`);
    },

    async triggerAppointmentReminder(appointmentId) {
      const payload = await request('/api/reminders', { method: 'POST', body: { appointmentId } });
      return payload;
    },

    async auditLog(params) {
      const payload = await request(`/api/audit${query(params)}`);
      return payload.events || [];
    },

    async health() {
      return request('/api/health');
    }
  };

  rootScope.maisonApi = api;
  rootScope.maisonApiFormat = { toAppointment, toMessage, toThread, toNotification, toTreatment, toReview, toUser, relativeTime, toDateLabel, toTime };
})(window);
