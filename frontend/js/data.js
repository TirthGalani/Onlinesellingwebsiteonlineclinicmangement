// Maison Dental — Care, considered.
// Shared Initial Mock Data & Persistence Engine

const MAISON_STORAGE_KEY = 'maison_dental_state_v2';

const INITIAL_STATE = {
  currentUser: {
    id: 'user-patient-1',
    role: 'patient', // 'patient' | 'doctor' | 'management'
    name: 'Olivia Sterling',
    email: 'olivia@maison.demo',
    phone: '+1 (555) 234-8901',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    title: 'Private Patient',
    memberSince: 'March 2023',
    smileScore: 94
  },
  roles: {
    patient: {
      id: 'user-patient-1',
      role: 'patient',
      name: 'Olivia Sterling',
      email: 'olivia@maison.demo',
      phone: '+1 (555) 234-8901',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      title: 'Private Patient',
      memberSince: 'March 2023',
      smileScore: 94
    },
    doctor: {
      id: 'user-doctor-1',
      role: 'doctor',
      name: 'Dr. Alistair Vance, DDS',
      email: 'doctor@maison.demo',
      phone: '+1 (555) 789-0123',
      avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=300&q=80',
      title: 'Lead Cosmetic Dentist & Veneer Specialist',
      clinicRoom: 'Studio Suite IV',
      license: 'NY-DDS-847291'
    },
    management: {
      id: 'user-mgmt-1',
      role: 'management',
      name: 'Genevieve Laurent',
      email: 'admin@maison.demo',
      phone: '+1 (555) 901-4567',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
      title: 'Director of Clinic Operations',
      department: 'Care Coordination & Concierge'
    }
  },
  dentists: [
    { id: 'dr-vance', name: 'Dr. Alistair Vance, DDS', specialty: 'Cosmetic Dentistry & Veneers', avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=200&q=80' },
    { id: 'dr-camille', name: 'Dr. Camille Fontaine, DMD', specialty: 'Orthodontics & Clear Aligners', avatar: 'https://images.unsplash.com/photo-1594824813583-a9d821217e46?auto=format&fit=crop&w=200&q=80' },
    { id: 'dr-julian', name: 'Dr. Julian Thorne, BDS', specialty: 'Gentle Root Canal & Preventive Care', avatar: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=200&q=80' }
  ],
  services: [
    'Custom Porcelain Veneers',
    'Cosmetic Smile Consultation & Design',
    'Gentle Teeth Cleaning & Polishing',
    '3D Digital Dental Scan',
    'Clear Aligners Consultation (Invisalign)',
    'Gentle Gum Health & Laser Care',
    'Tooth-Colored Ceramic Inlay & Crown'
  ],
  appointments: [
    {
      id: 'apt-101',
      patientName: 'Olivia Sterling',
      patientEmail: 'olivia@maison.demo',
      patientPhone: '+1 (555) 234-8901',
      service: 'Custom Porcelain Veneers',
      dentist: 'Dr. Alistair Vance, DDS',
      date: '2026-11-12T10:30',
      status: 'confirmed', // confirmed | requested | completed | upcoming | planned | cancelled
      notes: 'Final shade matching and trial fitting for upper front teeth (teeth 6 to 11).',
      room: 'Studio Suite IV'
    },
    {
      id: 'apt-102',
      patientName: 'Olivia Sterling',
      patientEmail: 'olivia@maison.demo',
      patientPhone: '+1 (555) 234-8901',
      service: '3D Digital Dental Scan',
      dentist: 'Dr. Julian Thorne, BDS',
      date: '2026-11-28T14:00',
      status: 'upcoming',
      notes: 'Follow-up 3D digital scan to verify lower teeth alignment.',
      room: 'Imaging Suite B'
    },
    {
      id: 'apt-103',
      patientName: 'Alexander Hayes',
      patientEmail: 'alexander.hayes@demo.luxury',
      patientPhone: '+1 (555) 431-7720',
      service: 'Cosmetic Smile Consultation & Design',
      dentist: 'Dr. Alistair Vance, DDS',
      date: '2026-11-14T11:00',
      status: 'requested',
      notes: 'Consultation on gentle porcelain veneers for a natural, bright smile.',
      room: 'Private Salon II'
    },
    {
      id: 'apt-104',
      patientName: 'Eleanor Vance-Moreau',
      patientEmail: 'eleanor.v@demo.luxury',
      patientPhone: '+1 (555) 991-2309',
      service: 'Clear Aligners Consultation (Invisalign)',
      dentist: 'Dr. Camille Fontaine, DMD',
      date: '2026-11-15T15:30',
      status: 'requested',
      notes: 'Digital check-up for clear aligner progress and bite comfort.',
      room: 'Orthodontic Studio'
    },
    {
      id: 'apt-105',
      patientName: 'Olivia Sterling',
      patientEmail: 'olivia@maison.demo',
      patientPhone: '+1 (555) 234-8901',
      service: 'Gentle Teeth Cleaning & Polishing',
      dentist: 'Dr. Alistair Vance, DDS',
      date: '2026-10-18T09:15',
      status: 'completed',
      notes: 'Annual routine dental check-up, gentle cleaning, and enamel polish.',
      room: 'Atelier I'
    },
    {
      id: 'apt-106',
      patientName: 'Julian Roth',
      patientEmail: 'julian.roth@demo.luxury',
      patientPhone: '+1 (555) 678-1244',
      service: 'Tooth-Colored Ceramic Inlay & Crown',
      dentist: 'Dr. Julian Thorne, BDS',
      date: '2026-12-05T13:00',
      status: 'planned',
      notes: 'Custom tooth-colored ceramic restoration for lower molar.',
      room: 'Studio Suite III'
    },
    {
      id: 'apt-107',
      patientName: 'Marcus Dupont',
      patientEmail: 'marcus.dupont@demo.luxury',
      patientPhone: '+1 (555) 321-9988',
      service: 'Gentle Gum Health & Laser Care',
      dentist: 'Dr. Camille Fontaine, DMD',
      date: '2026-10-29T16:00',
      status: 'cancelled',
      notes: 'Routine visit rescheduled per patient travel request.',
      room: 'Consultation Suite I'
    }
  ],
  treatments: [
    {
      id: 'trt-01',
      patientId: 'user-patient-1',
      title: 'Custom Porcelain Veneers (Stage 2 of 3)',
      status: 'In Progress — 75%',
      progress: 75,
      dentist: 'Dr. Alistair Vance, DDS',
      startDate: 'Sep 2026',
      estimatedCompletion: 'Dec 2026',
      description: 'Ultra-thin handcrafted porcelain veneers on front upper teeth (6 through 11), crafted for a bright, balanced, and natural smile.',
      milestones: [
        { label: 'Digital 3D Smile Preview & Design', completed: true, date: 'Sep 12, 2026' },
        { label: 'Gentle Tooth Preparation & Temporary Veneers', completed: true, date: 'Oct 04, 2026' },
        { label: 'Veneer Fitting & Natural Color Matching', completed: false, date: 'Nov 12, 2026 (Scheduled)' },
        { label: 'Final Veneer Placement & Gentle Polish', completed: false, date: 'Nov 24, 2026' }
      ]
    },
    {
      id: 'trt-02',
      patientId: 'user-patient-1',
      title: 'Preventive Dental Cleaning & Enamel Polish',
      status: 'Completed',
      progress: 100,
      dentist: 'Dr. Julian Thorne, BDS',
      startDate: 'Oct 2026',
      estimatedCompletion: 'Oct 2026',
      description: 'Comfortable warm-water cleaning to remove plaque and protect sensitive gums and tooth enamel.',
      milestones: [
        { label: 'Gentle Plaque & Tartar Removal', completed: true, date: 'Oct 18, 2026' },
        { label: 'Warm-Water Polish for Enamel Protection', completed: true, date: 'Oct 18, 2026' },
        { label: 'Protective Fluoride Enamel Glaze', completed: true, date: 'Oct 18, 2026' }
      ]
    }
  ],
  chatThreads: [
    {
      id: 'thread-olivia',
      patientId: 'user-patient-1',
      patientName: 'Olivia Sterling',
      patientAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      lastUpdated: '10 mins ago',
      unreadCount: 1,
      patientUnreadCount: 1,
      doctorUnreadCount: 0,
      mgmtUnreadCount: 0,
      messages: [
        {
          id: 'msg-1',
          senderRole: 'patient',
          senderName: 'Olivia Sterling',
          timestamp: 'Yesterday at 3:14 PM',
          text: 'Good afternoon Dr. Vance and team. I looked over the 3D smile preview you sent. The front teeth look wonderful! Can we soften the edges of the canine teeth slightly for a smoother look?',
          type: 'standard',
          attachments: []
        },
        {
          id: 'msg-2',
          senderRole: 'doctor',
          senderName: 'Dr. Alistair Vance, DDS',
          timestamp: 'Yesterday at 4:32 PM',
          text: 'Hello Olivia. Delighted to hear that! Yes, we can easily round the edges of the canines slightly for a softer, natural contour. I have attached the updated 3D design below.',
          type: 'instruction',
          instructionBadge: 'Doctor Care Instruction',
          attachments: [
            {
              name: 'Canine-Contour-Revision-3D.png',
              type: 'image/png',
              size: '2.4 MB',
              url: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=600&q=80'
            }
          ]
        },
        {
          id: 'msg-3',
          senderRole: 'management',
          senderName: 'Genevieve Laurent (Concierge)',
          timestamp: 'Today at 09:15 AM',
          text: 'Good morning Olivia. We have confirmed your appointment on Thursday, Nov 12 at 10:30 AM in Suite IV. Your custom veneer try-in set has arrived from our Swiss laboratory. Complimentary valet parking is arranged for your arrival.',
          type: 'standard',
          attachments: []
        },
        {
          id: 'msg-4',
          senderRole: 'doctor',
          senderName: 'Dr. Alistair Vance, DDS',
          timestamp: 'Today at 11:20 AM',
          text: 'Pre-Visit Care Guidance: Please begin using the prescribed soothing oral rinse 48 hours before your fitting appointment, twice daily after meals.',
          type: 'medicine',
          instructionBadge: 'Medicine & Visit Preparation',
          attachments: [
            {
              name: 'Maison-Gentle-Rinse-Instructions.pdf',
              type: 'application/pdf',
              size: '1.1 MB',
              url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80'
            }
          ]
        }
      ]
    },
    {
      id: 'thread-alexander',
      patientId: 'user-patient-2',
      patientName: 'Alexander Hayes',
      patientAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      lastUpdated: '2 hours ago',
      unreadCount: 0,
      patientUnreadCount: 0,
      doctorUnreadCount: 0,
      mgmtUnreadCount: 0,
      messages: [
        {
          id: 'msg-ah-1',
          senderRole: 'patient',
          senderName: 'Alexander Hayes',
          timestamp: 'Today at 8:00 AM',
          text: 'Hello, looking forward to meeting Dr. Vance regarding natural smile alignment before my public keynote.',
          type: 'standard',
          attachments: []
        },
        {
          id: 'msg-ah-2',
          senderRole: 'management',
          senderName: 'Genevieve Laurent',
          timestamp: 'Today at 9:00 AM',
          text: 'Welcome Alexander. We have received your booking request for November 14. We will confirm your suite appointment shortly.',
          type: 'standard',
          attachments: []
        }
      ]
    },
    {
      id: 'thread-eleanor',
      patientId: 'user-patient-3',
      patientName: 'Eleanor Vance-Moreau',
      patientAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
      lastUpdated: 'Yesterday',
      unreadCount: 0,
      patientUnreadCount: 0,
      doctorUnreadCount: 0,
      mgmtUnreadCount: 0,
      messages: [
        {
          id: 'msg-ev-1',
          senderRole: 'patient',
          senderName: 'Eleanor Vance-Moreau',
          timestamp: 'Yesterday at 2:00 PM',
          text: 'Can I upload my previous dental scan from London before my assessment?',
          type: 'standard',
          attachments: []
        },
        {
          id: 'msg-ev-2',
          senderRole: 'doctor',
          senderName: 'Dr. Camille Fontaine, DMD',
          timestamp: 'Yesterday at 3:15 PM',
          text: 'Yes please Eleanor, you can attach any high-resolution PDF or image files directly into this chat.',
          type: 'instruction',
          instructionBadge: 'Orthodontic Prep',
          attachments: []
        }
      ]
    }
  ],
  reviews: [
    {
      id: 'rev-1',
      author: 'Olivia Sterling',
      authorRole: 'Verified Patient',
      rating: 5,
      date: 'October 22, 2026',
      service: 'Custom Porcelain Veneers',
      title: 'A transformative, calm and comfortable experience',
      content: 'Maison Dental redefines dental visits into genuine comfort and care. Dr. Vance took time to explain every step, and the porcelain veneers look completely natural and bright. I felt zero pain or anxiety throughout the entire treatment.'
    },
    {
      id: 'rev-2',
      author: 'Lord Harrison Sterling',
      authorRole: 'Verified Patient',
      rating: 5,
      date: 'October 15, 2026',
      service: 'Gentle Teeth Cleaning & Polishing',
      title: 'Gentle care and wonderful staff',
      content: 'The level of care and attention to detail is unmatched. The treatment rooms are quiet and comfortable, and the team makes you feel at home immediately.'
    },
    {
      id: 'rev-3',
      author: 'Sophia Chen-Valois',
      authorRole: 'Verified Patient',
      rating: 5,
      date: 'September 28, 2026',
      service: 'Clear Aligners Consultation (Invisalign)',
      title: 'Clear explanations and friendly doctors',
      content: 'Dr. Fontaine explained how clear aligners work in simple, plain language. The care team chat is quick and helpful whenever I have questions.'
    }
  ],
  notifications: [
    {
      id: 'notif-1',
      title: 'Appointment Confirmed',
      message: 'Your veneer try-in appointment on Nov 12 at 10:30 AM in Suite IV has been confirmed.',
      time: '15 mins ago',
      type: 'success',
      read: false
    },
    {
      id: 'notif-2',
      title: 'Doctor Instruction Received',
      message: 'Dr. Alistair Vance shared the updated 3D smile design and pre-visit gentle oral rinse guidance.',
      time: '2 hours ago',
      type: 'info',
      read: false
    },
    {
      id: 'notif-3',
      title: 'Visit Reminder: Valet Parking',
      message: 'Complimentary valet service is ready at 450 Madison Avenue for your upcoming visit.',
      time: '1 day ago',
      type: 'reminder',
      read: true
    }
  ],
  stats: {
    totalAppointments: 48,
    activePatients: 134,
    remindersSent: 28,
    satisfactionRate: '99.4%'
  }
};

class MaisonState {
  constructor() {
    if (typeof window !== 'undefined') window.maisonStore = this;
    if (typeof globalThis !== 'undefined') globalThis.maisonStore = this;
    this.data = this.loadState();
  }

  _getStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const testKey = '__maison_quota_test__';
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
        return window.localStorage;
      }
    } catch (e) {
      // Storage access blocked or restricted (e.g. private browsing or sandboxed iframe)
    }

    if (!MaisonState._memoryStore) {
      MaisonState._memoryStore = {};
    }
    return {
      getItem: (k) => MaisonState._memoryStore[k] || null,
      setItem: (k, v) => { MaisonState._memoryStore[k] = String(v); },
      removeItem: (k) => { delete MaisonState._memoryStore[k]; }
    };
  }

  loadState() {
    try {
      const storage = this._getStorage();
      const stored = storage.getItem(MAISON_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.currentUser && parsed.roles && Array.isArray(parsed.appointments)) {
          // Merge with initial state defaults so any new collections are never undefined
          return Object.assign({}, JSON.parse(JSON.stringify(INITIAL_STATE)), parsed);
        }
      }
    } catch (e) {
      console.warn('Could not read state from storage:', e);
    }
    const fresh = JSON.parse(JSON.stringify(INITIAL_STATE));
    this.saveState(fresh);
    return fresh;
  }

  saveState(stateToSave) {
    try {
      const storage = this._getStorage();
      const raw = stateToSave || this.data;
      
      // Sanitize payload to protect localStorage quota:
      // Strip heavy binary base64 strings (> 32 KB) while preserving all metadata
      const cleanJson = JSON.stringify(raw, (key, value) => {
        if (typeof value === 'string' && value.startsWith('data:') && value.length > 32768) {
          return ''; // Strip huge base64 payload to prevent QuotaExceededError; memory/Blob URL handles active session
        }
        return value;
      });

      storage.setItem(MAISON_STORAGE_KEY, cleanJson);
    } catch (e) {
      console.warn('Could not persist to storage (using in-memory state):', e);
    }
  }

  resetToDemo() {
    this.data = JSON.parse(JSON.stringify(INITIAL_STATE));
    this.saveState(this.data);
    return this.data;
  }

  switchRole(roleKey) {
    if (this.data.roles[roleKey]) {
      this.data.currentUser = JSON.parse(JSON.stringify(this.data.roles[roleKey]));
      this.saveState();
      return this.data.currentUser;
    }
    return null;
  }

  addAppointment(aptData) {
    const newApt = {
      id: 'apt-' + Date.now(),
      patientName: aptData.patientName,
      patientEmail: aptData.patientEmail,
      patientPhone: aptData.patientPhone || '+1 (555) 000-0000',
      service: aptData.service,
      dentist: aptData.dentist,
      date: aptData.date,
      status: 'requested', // initially requested until confirmed by management
      notes: aptData.notes || '',
      room: 'Studio Suite TBD'
    };

    this.data.appointments.unshift(newApt);

    // Also create a notification for patient and management
    this.addNotification({
      title: 'Appointment Request Submitted',
      message: `Your appointment for "${newApt.service}" on ${new Date(newApt.date).toLocaleDateString()} has been routed to clinic concierge.`,
      type: 'info'
    });

    this.saveState();
    return newApt;
  }

  confirmAppointment(aptId) {
    const apt = this.data.appointments.find(a => a.id === aptId);
    if (apt) {
      apt.status = 'confirmed';
      apt.confirmedAt = new Date().toISOString();

      this.addNotification({
        title: 'Appointment Confirmed',
        message: `Appointment for ${apt.patientName} (${apt.service}) on ${new Date(apt.date).toLocaleString()} has been confirmed.`,
        type: 'success'
      });

      this.saveState();
      return apt;
    }
    return null;
  }

  cancelAppointment(aptId) {
    const apt = this.data.appointments.find(a => a.id === aptId);
    if (!apt || apt.status === 'completed' || apt.status === 'cancelled') return null;
    apt.status = 'cancelled';
    apt.cancelledAt = new Date().toISOString();
    this.addNotification({
      title: 'Appointment Cancelled',
      message: `${apt.patientName}'s ${apt.service} appointment has been cancelled by clinic management.`,
      type: 'info'
    });
    this.saveState();
    return apt;
  }

  sendReminders() {
    this.data.stats.remindersSent = (this.data.stats.remindersSent || 0) + 4;
    this.addNotification({
      title: 'Concierge Reminders Dispatched',
      message: `Automated calendar invitations & SMS reminder packets successfully delivered to 4 upcoming patients.`,
      type: 'reminder'
    });
    this.saveState();
    return this.data.stats.remindersSent;
  }

  addReview(reviewData) {
    const newReview = {
      id: 'rev-' + Date.now(),
      author: reviewData.author || this.data.currentUser.name,
      authorRole: 'Verified Patient',
      rating: Number(reviewData.rating) || 5,
      date: 'Today, ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      service: reviewData.service || 'Comprehensive Aesthetic Care',
      title: reviewData.title || 'Exceptional experience',
      content: reviewData.content
    };
    this.data.reviews.unshift(newReview);
    this.addNotification({
      title: 'New Patient Review Published',
      message: `${newReview.author} rated their visit ${'★'.repeat(newReview.rating)}: "${newReview.title}"`,
      type: 'success'
    });
    this.saveState();
    return newReview;
  }

  addMessage(threadId, messageData) {
    let thread = this.data.chatThreads.find(t => t.id === threadId);
    if (!thread) {
      // Find or default to first thread
      thread = this.data.chatThreads[0];
    }

    const timeFormatted = 'Today at ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    const senderRole = messageData.senderRole || this.data.currentUser.role;
    const senderName = messageData.senderName || this.data.currentUser.name;

    const newMsg = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      senderRole: senderRole,
      senderName: senderName,
      sentFromRole: messageData.sentFromRole || senderRole,
      sentDirection: messageData.sentDirection || 'outgoing',
      timestamp: timeFormatted,
      text: messageData.text || '',
      type: messageData.type || 'standard', // 'standard' | 'instruction' | 'medicine'
      instructionBadge: messageData.instructionBadge || (messageData.type === 'medicine' ? 'Prescription & Care Guide' : (messageData.type === 'instruction' ? 'Clinical Care Directive' : null)),
      attachments: (messageData.attachments || []).map(att => ({
        id: att.id || ('att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)),
        name: att.name || 'Attachment',
        type: att.type || (att.isPdf ? 'application/pdf' : 'image/jpeg'),
        size: att.size || '1.0 MB',
        isPdf: !!(att.isPdf || (att.type && att.type.includes('pdf')) || (att.name && att.name.toLowerCase().endsWith('.pdf'))),
        url: att.url || ''
      }))
    };

    thread.messages.push(newMsg);
    thread.lastUpdated = 'Just now';

    // Track unread counts per recipient role
    if (senderRole === 'patient') {
      thread.doctorUnreadCount = (thread.doctorUnreadCount || 0) + 1;
      thread.mgmtUnreadCount = (thread.mgmtUnreadCount || 0) + 1;
    } else if (senderRole === 'doctor') {
      thread.unreadCount = (thread.unreadCount || 0) + 1;
      thread.patientUnreadCount = (thread.patientUnreadCount || 0) + 1;
      thread.mgmtUnreadCount = (thread.mgmtUnreadCount || 0) + 1;
    } else if (senderRole === 'management') {
      thread.unreadCount = (thread.unreadCount || 0) + 1;
      thread.patientUnreadCount = (thread.patientUnreadCount || 0) + 1;
      thread.doctorUnreadCount = (thread.doctorUnreadCount || 0) + 1;
    }

    this.addNotification({
      title: `New message from ${senderName}`,
      message: newMsg.text ? (newMsg.text.length > 60 ? newMsg.text.substring(0, 60) + '...' : newMsg.text) : 'Attached ' + newMsg.attachments.length + ' file(s)',
      type: 'info'
    });

    this.saveState();
    return newMsg;
  }

  markThreadRead(threadId, role = 'patient') {
    let thread = this.data.chatThreads.find(t => t.id === threadId);
    if (!thread) thread = this.data.chatThreads[0];
    if (thread) {
      if (role === 'patient') {
        thread.unreadCount = 0;
        thread.patientUnreadCount = 0;
        if (thread.messages) {
          thread.messages.forEach(m => {
            if (m.senderRole !== 'patient') m.readByPatient = true;
          });
        }
      } else if (role === 'doctor') {
        thread.doctorUnreadCount = 0;
        if (thread.messages) {
          thread.messages.forEach(m => {
            if (m.senderRole !== 'doctor') m.readByDoctor = true;
          });
        }
      } else if (role === 'management' || role === 'mgmt') {
        thread.mgmtUnreadCount = 0;
        if (thread.messages) {
          thread.messages.forEach(m => {
            if (m.senderRole !== 'management') m.readByMgmt = true;
          });
        }
      }
      this.saveState();
    }
    return thread;
  }

  addNotification(notif) {
    const item = {
      id: 'notif-' + Date.now(),
      title: notif.title,
      message: notif.message,
      time: 'Just now',
      type: notif.type || 'info',
      read: false
    };
    this.data.notifications.unshift(item);
    if (this.data.notifications.length > 25) {
      this.data.notifications.pop();
    }
    this.saveState();
    return item;
  }

  markAllNotificationsRead() {
    this.data.notifications.forEach(n => n.read = true);
    this.saveState();
  }

  removeNotification(id) {
    this.data.notifications = (this.data.notifications || []).filter(n => n.id !== id);
    this.saveState();
    return this.data.notifications;
  }

  clearAllNotifications() {
    this.data.notifications = [];
    this.saveState();
    return this.data.notifications;
  }
}

// Bulletproof Global Mounting
(function () {
  const rootScope = (typeof window !== 'undefined') ? window :
                    (typeof globalThis !== 'undefined') ? globalThis :
                    (typeof self !== 'undefined') ? self : this;

  if (rootScope) {
    rootScope.MaisonState = MaisonState;
    if (!rootScope.maisonStore) {
      try {
        rootScope.maisonStore = new MaisonState();
      } catch (err) {
        console.error('Failed to create maisonStore:', err);
        rootScope.maisonStore = {
          data: JSON.parse(JSON.stringify(INITIAL_STATE)),
          resetToDemo: function() { this.data = JSON.parse(JSON.stringify(INITIAL_STATE)); return this.data; },
          switchRole: function(r) { if (this.data.roles && this.data.roles[r]) this.data.currentUser = this.data.roles[r]; return this.data.currentUser; }
        };
      }
    }
  }
})();


