// Maison Dental — Care, considered.
// Application Controller & Real-Time Prototype Orchestrator

(function () {
  'use strict';

  class MaisonApp {
    constructor() {
      if (typeof window !== 'undefined') window.maisonApp = this;
      if (typeof globalThis !== 'undefined') globalThis.maisonApp = this;

      const root = (typeof window !== 'undefined') ? window :
                   (typeof globalThis !== 'undefined') ? globalThis :
                   (typeof self !== 'undefined') ? self : this;

      if (root && root.maisonStore) {
        this.store = root.maisonStore;
      } else if (typeof MaisonState !== 'undefined') {
        this.store = new MaisonState();
        if (root) root.maisonStore = this.store;
      } else {
        this.store = { data: { currentUser: { role: 'patient', name: 'Olivia Sterling' } } };
      }

      this.currentWorkspace = (this.store.data && this.store.data.currentUser && this.store.data.currentUser.role) || 'patient';
      this.currentSection = 'overview';
      this.loginModalRole = 'patient';
      this.activeDoctorThreadId = 'thread-olivia';
      this.activeMgmtThreadId = 'thread-olivia';
      this.activePatientThreadId = 'thread-olivia';
      this.doctorMsgType = 'standard'; // 'standard' | 'instruction' | 'medicine'
      
      // File attachments staging per workspace
      this.stagedFiles = {
        patient: [],
        doctor: [],
        mgmt: []
      };

      // Message Direction (Outgoing vs Incoming) per workspace
      this.chatDirections = {
        patient: 'outgoing', // 'outgoing' | 'incoming'
        doctor: 'outgoing',
        mgmt: 'outgoing'
      };
      this.autoReplyEnabled = true;

      this.init();
    }

    init() {
      // The app starts synchronously at the end of the document. Older startup
      // code also called init() at DOMContentLoaded, which registered every
      // handler a second time and could send duplicate messages.
      if (this._initialized) return;
      this._initialized = true;

      // Initialize icons
      this.renderIcons();

      // Setup escape key listener for all modals, sidebars, and drawers
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeModals();
          this.closeNotificationsPanel();
          this.closeSidebar();
          this.closeMobileMenu();
          this.closeMobileThreads();
        }
      });

      // Bell notification button click handler
      const bellBtn = document.getElementById('notifBellBtn');
      if (bellBtn) {
        bellBtn.addEventListener('click', (e) => {
          this.handleBellClick(e);
        });
      }

      // Close notification panel, sidebar & mobile menu on outside click ("other click")
      document.addEventListener('click', (e) => {
        const attachmentButton = e.target.closest('[data-chat-attachment]');
        if (attachmentButton) {
          this.openPreview(
            attachmentButton.dataset.url,
            attachmentButton.dataset.filename,
            attachmentButton.dataset.isPdf === 'true'
          );
        }

        const panel = document.getElementById('notificationsPanel');
        const bellBtn = document.getElementById('notifBellBtn');
        if (panel && panel.classList.contains('open')) {
          if (!panel.contains(e.target) && !bellBtn.contains(e.target)) {
            this.closeNotificationsPanel();
          }
        }

        const sidebar = document.getElementById('luxurySidebar');
        const sidebarToggle = document.getElementById('sidebarToggleBtn');
        if (sidebar && sidebar.classList.contains('open')) {
          if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
            this.closeSidebar();
          }
        }

        const mobileDrawer = document.getElementById('mobileNavDrawer');
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        if (mobileDrawer && mobileDrawer.classList.contains('open')) {
          if (!mobileDrawer.contains(e.target) && (!mobileMenuBtn || !mobileMenuBtn.contains(e.target))) {
            this.closeMobileMenu();
          }
        }
      });

      // Profile button triggers login modal
      const profileBtn = document.getElementById('openLoginModalBtn');
      if (profileBtn) {
        profileBtn.addEventListener('click', () => {
          this.openLoginModal();
        });
      }

      // Reset Demo Data Button
      const resetBtn = document.getElementById('resetDemoBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          this.store.resetToDemo();
          this.showToast('Demo Environment Reset', 'Sample appointments, messages, and reviews restored.', 'info');
          this.renderAll();
        });
      }

      // Star Rating Hover & Click Setup
      this.setupStarRating();

      // Initial Render
      this.renderAll();
    }

    renderIcons() {
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }

    renderAll() {
      this.renderHeader();
      this.renderNotifications();
      this.renderPatientWorkspace();
      this.renderDoctorWorkspace();
      this.renderManagementWorkspace();
      this.renderIcons();
    }

    /* ----------------------------------------------------
       Header & Navigation
    ---------------------------------------------------- */
    renderHeader() {
      const user = this.store.data.currentUser;
      const avatarEl = document.getElementById('headerUserAvatar');
      const nameEl = document.getElementById('headerUserName');
      const badgeTextEl = document.getElementById('currentRoleBadgeText');
      const badgeShortEl = document.getElementById('currentRoleBadgeShortText');
      const navTreatment = document.getElementById('navTreatmentsLabel');

      if (avatarEl) avatarEl.src = user.avatar;
      if (nameEl) nameEl.textContent = user.name.split(',')[0];

      if (badgeTextEl) {
        if (user.role === 'patient') {
          badgeTextEl.textContent = 'Patient Portal';
          if (badgeShortEl) badgeShortEl.textContent = 'Patient';
        } else if (user.role === 'doctor') {
          badgeTextEl.textContent = 'Doctor Workspace';
          if (badgeShortEl) badgeShortEl.textContent = 'Doctor';
        } else {
          badgeTextEl.textContent = 'Management Workspace';
          if (badgeShortEl) badgeShortEl.textContent = 'Admin';
        }
      }

      // Update workspace quick bar
      document.querySelectorAll('#workspaceQuickBar .ws-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-ws') === user.role);
      });

      if (navTreatment) {
        const span = navTreatment.querySelector('span');
        if (span) {
          span.textContent = (user.role === 'patient') ? 'My Treatments' : 'Clinical Plans';
        }
      }

      // Sidebar Profile Info
      const sAvatar = document.getElementById('sidebarUserAvatar');
      const sName = document.getElementById('sidebarUserName');
      const sRole = document.getElementById('sidebarUserRoleTitle');
      const sTreatments = document.getElementById('sidebarTreatmentsLabel');
      if (sAvatar) sAvatar.src = user.avatar;
      if (sName) sName.textContent = user.name;
      if (sRole) sRole.textContent = user.title || (user.role.toUpperCase() + ' Mode');
      if (sTreatments) sTreatments.textContent = (user.role === 'patient') ? 'My Treatments' : 'Clinical Plans';

      // Unread messages indicator in nav & sidebar & mobile bottom nav
      const unreadBadge = document.getElementById('unreadNavBadge');
      const sidebarMsgBadge = document.getElementById('sidebarMsgBadge');
      const bottomUnreadBadge = document.getElementById('bottomNavMsgBadge');
      
      let totalUnread = 0;
      const threads = this.store.data.chatThreads || [];
      if (user.role === 'patient') {
        const patientThread = threads.find(t => t.id === (this.activePatientThreadId || 'thread-olivia')) || threads[0];
        totalUnread = patientThread ? (patientThread.patientUnreadCount || patientThread.unreadCount || 0) : 0;
      } else if (user.role === 'doctor') {
        totalUnread = threads.reduce((sum, t) => sum + (t.doctorUnreadCount || 0), 0);
      } else { // management
        totalUnread = threads.reduce((sum, t) => sum + (t.mgmtUnreadCount || 0), 0);
      }

      if (totalUnread > 0) {
        if (unreadBadge) { unreadBadge.style.display = 'inline-block'; unreadBadge.textContent = totalUnread; }
        if (sidebarMsgBadge) { sidebarMsgBadge.style.display = 'inline-block'; sidebarMsgBadge.textContent = totalUnread; }
        if (bottomUnreadBadge) { bottomUnreadBadge.style.display = 'flex'; bottomUnreadBadge.textContent = totalUnread; }
      } else {
        if (unreadBadge) unreadBadge.style.display = 'none';
        if (sidebarMsgBadge) sidebarMsgBadge.style.display = 'none';
        if (bottomUnreadBadge) bottomUnreadBadge.style.display = 'none';
      }
    }

    showSection(sectionKey) {
      const validSections = ['overview', 'appointments', 'treatments', 'messages', 'reviews'];
      if (!validSections.includes(sectionKey)) return;
      this.currentSection = sectionKey;

      // Update active nav button in single-line header
      document.querySelectorAll('.header-pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-nav') === sectionKey);
      });

      // Update active nav button in luxury sidebar
      document.querySelectorAll('#luxurySidebar .sidebar-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-snav') === sectionKey);
      });

      // Update mobile bottom nav
      document.querySelectorAll('#mobileBottomNav .bottom-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-bnav') === sectionKey);
      });

      // Close drawers and sidebar immediately
      this.closeNotificationsPanel();
      this.closeSidebar();
      this.closeMobileMenu();

      const scrollToElement = (target) => {
        if (!target) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        const headerHeight = 78;
        const rect = target.getBoundingClientRect();
        const targetTop = rect.top + window.pageYOffset - headerHeight;
        window.scrollTo({
          top: Math.max(0, targetTop),
          behavior: 'smooth'
        });
      };

      if (this.currentWorkspace === 'patient') {
        const sections = ['overview', 'appointments', 'treatments', 'messages', 'reviews'];
        sections.forEach(s => {
          const el = document.getElementById(`patient-section-${s}`);
          if (el) {
            el.style.display = (s === sectionKey) ? 'block' : 'none';
          }
        });

        // Always smoothly scroll to top of section for patient
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (sectionKey === 'messages') {
          setTimeout(() => this.scrollChatToBottom('patient'), 80);
        }
      } else if (this.currentWorkspace === 'doctor') {
        if (sectionKey === 'overview') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (sectionKey === 'appointments') {
          scrollToElement(document.getElementById('doctorAppointmentsCard') || document.getElementById('doctorTodayScheduleList'));
        } else if (sectionKey === 'treatments') {
          scrollToElement(document.getElementById('doctorCbctCard'));
        } else if (sectionKey === 'messages') {
          scrollToElement(document.getElementById('doctorChatCard') || document.querySelector('#workspace-doctor .chat-container'));
          setTimeout(() => this.scrollChatToBottom('doctor'), 80);
        } else if (sectionKey === 'reviews') {
          scrollToElement(document.getElementById('doctorReviewsCard') || document.getElementById('doctorReviewsGrid'));
        }
      } else if (this.currentWorkspace === 'management') {
        if (sectionKey === 'overview') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (sectionKey === 'appointments') {
          scrollToElement(document.getElementById('mgmtAppointmentQueueCard') || document.getElementById('mgmtAppointmentQueueBody'));
        } else if (sectionKey === 'treatments') {
          scrollToElement(document.getElementById('mgmtScheduleCard'));
        } else if (sectionKey === 'messages') {
          scrollToElement(document.getElementById('mgmtChatCard') || document.querySelector('#workspace-management .chat-container'));
          setTimeout(() => this.scrollChatToBottom('management'), 80);
        } else if (sectionKey === 'reviews') {
          scrollToElement(document.getElementById('mgmtReviewsCard') || document.getElementById('mgmtReviewsGrid'));
        }
      }

      this.renderIcons();
    }

    /* Helper quick navigators for sidebar features */
    navigateToShadeStudio() {
      if (this.currentWorkspace !== 'patient') {
        this.selectRole('patient');
      }
      this.showSection('overview');
      setTimeout(() => {
        const el = document.getElementById('shadeStudioCard');
        if (el) {
          const headerHeight = 78;
          const targetTop = el.getBoundingClientRect().top + window.pageYOffset - headerHeight;
          window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
        }
      }, 150);
      this.closeSidebar();
    }

    navigateToConciergePrivileges() {
      if (this.currentWorkspace !== 'patient') {
        this.selectRole('patient');
      }
      this.showSection('overview');
      setTimeout(() => {
        const el = document.getElementById('conciergePrivilegesCard');
        if (el) {
          const headerHeight = 78;
          const targetTop = el.getBoundingClientRect().top + window.pageYOffset - headerHeight;
          window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
        }
      }, 150);
      this.closeSidebar();
    }

    navigateToCbctViewer() {
      if (this.currentWorkspace !== 'doctor') {
        this.selectRole('doctor');
      }
      this.showSection('treatments');
      this.closeSidebar();
    }

    selectRole(roleKey) {
      this.currentWorkspace = roleKey;
      this.store.switchRole(roleKey);

      // Update luxury sidebar role cards
      document.querySelectorAll('#luxurySidebar .sidebar-role-card').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-srole') === roleKey);
      });

      // Update workspace quick bar
      document.querySelectorAll('#workspaceQuickBar .ws-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-ws') === roleKey);
      });

      // Close sidebar
      this.closeSidebar();

      // Show the selected workspace
      const workspaces = ['patient', 'doctor', 'management'];
      workspaces.forEach(w => {
        const el = document.getElementById(`workspace-${w}`);
        if (el) {
          el.style.display = (w === roleKey) ? 'block' : 'none';
          if (w === roleKey) {
            el.classList.add('active');
          } else {
            el.classList.remove('active');
          }
        }
      });

      // Reset to the home section on workspace change.
      this.showSection('overview');
      this.renderHeader();
      this.renderAll();

      this.showToast('Workspace Switched', `Now viewing as ${this.store.data.currentUser.name} (${this.store.data.currentUser.title})`, 'info');
    }

    /* ----------------------------------------------------
       Luxury Sidebar Drawer Controls
    ---------------------------------------------------- */
    toggleSidebar() {
      const sidebar = document.getElementById('luxurySidebar');
      const backdrop = document.getElementById('sidebarBackdrop');
      if (sidebar) sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('open');
    }

    closeSidebar() {
      const sidebar = document.getElementById('luxurySidebar');
      const backdrop = document.getElementById('sidebarBackdrop');
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
    }

    resetDemoData() {
      this.store.resetToDemo();
      this.showToast('Demo Environment Reset', 'Sample appointments, messages, and reviews restored.', 'info');
      this.renderAll();
    }

    /* ----------------------------------------------------
       Mobile Drawer & Responsive Controls
    ---------------------------------------------------- */
    toggleMobileMenu() {
      const drawer = document.getElementById('mobileNavDrawer');
      if (drawer) {
        drawer.classList.toggle('open');
      }
    }

    closeMobileMenu() {
      const drawer = document.getElementById('mobileNavDrawer');
      if (drawer) {
        drawer.classList.remove('open');
      }
    }

    toggleMobileThreads(workspaceKey) {
      let sidebar;
      if (workspaceKey === 'patient') sidebar = document.querySelector('#workspace-patient .chat-sidebar');
      else if (workspaceKey === 'doctor') sidebar = document.querySelector('#workspace-doctor .chat-sidebar');
      else if (workspaceKey === 'mgmt') sidebar = document.querySelector('#workspace-management .chat-sidebar');

      if (sidebar) {
        sidebar.classList.toggle('mobile-open');
      }
    }

    closeMobileThreads() {
      document.querySelectorAll('.chat-sidebar').forEach(s => s.classList.remove('mobile-open'));
    }

    /* ----------------------------------------------------
       Notifications Viewport Drawer
    ---------------------------------------------------- */
    handleBellClick(e) {
      if (e) e.stopPropagation();
      // Clicking the bell must smoothly scroll to top and open notifications panel
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      const panel = document.getElementById('notificationsPanel');
      if (panel) {
        panel.classList.toggle('open');
      }
    }

    closeNotificationsPanel() {
      const panel = document.getElementById('notificationsPanel');
      if (panel) {
        panel.classList.remove('open');
      }
    }

    renderNotifications() {
      const notifs = this.store.data.notifications || [];
      const listEl = document.getElementById('notificationsList');
      const badgeEl = document.getElementById('notifCountBadge');

      const unreadCount = notifs.filter(n => !n.read).length;
      if (badgeEl) {
        badgeEl.textContent = unreadCount;
        badgeEl.style.display = unreadCount > 0 ? 'flex' : 'none';
      }

      if (!listEl) return;

      if (notifs.length === 0) {
        listEl.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: #8F9E93; font-size: 0.85rem;">No notifications right now.</div>';
        return;
      }

      listEl.innerHTML = notifs.map(n => `
        <div class="notif-item ${n.read ? 'read' : ''}" onclick="window.maisonApp.markNotificationRead('${n.id}')">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem;">
            <div class="notif-item-title">${this.escapeHtml(n.title)}</div>
            <button type="button" class="notif-item-remove-btn" title="Remove notification" onclick="event.stopPropagation(); window.maisonApp.removeNotification('${n.id}')" aria-label="Remove notification">&times;</button>
          </div>
          <div class="notif-item-msg">${this.escapeHtml(n.message)}</div>
          <div class="notif-item-time">${this.escapeHtml(n.time)}</div>
        </div>
      `).join('');
    }

    removeNotification(id) {
      this.store.removeNotification(id);
      this.renderNotifications();
      this.showToast('Notification Dismissed', 'Notice removed from panel.', 'info');
    }

    clearAllNotifications() {
      this.store.clearAllNotifications();
      this.renderNotifications();
      this.showToast('Notifications Cleared', 'All notices have been cleared.', 'info');
    }

    markNotificationRead(id) {
      const item = this.store.data.notifications.find(n => n.id === id);
      if (item) {
        item.read = true;
        this.store.saveState();
        this.renderNotifications();
      }
    }

    markAllNotificationsRead() {
      this.store.markAllNotificationsRead();
      this.renderNotifications();
      this.showToast('Notifications Cleared', 'All notices marked as read.', 'info');
    }

    /* ----------------------------------------------------
       1. PATIENT PORTAL
    ---------------------------------------------------- */
    renderPatientWorkspace() {
      const appointments = this.store.data.appointments;
      const patientEmail = 'olivia@maison.demo';
      const patientApts = appointments.filter(a => a.patientEmail === patientEmail || a.patientName === 'Olivia Sterling');

      // Overview Upcoming Mini List
      const overviewListEl = document.getElementById('patientOverviewAppointmentsList');
      if (overviewListEl) {
        const upcomingApts = patientApts.slice(0, 3);
        if (upcomingApts.length === 0) {
          overviewListEl.innerHTML = '<p style="padding: 1rem 0; color: #8E9F92;">No scheduled salon appointments.</p>';
        } else {
          overviewListEl.innerHTML = upcomingApts.map(a => this.renderAppointmentItemHtml(a)).join('');
        }
      }

      // Full Appointments Section List
      const fullListEl = document.getElementById('patientFullAppointmentsList');
      if (fullListEl) {
        if (patientApts.length === 0) {
          fullListEl.innerHTML = '<p style="padding: 2rem; text-align: center; color: #8E9F92;">No appointments registered yet. Use the form below to book your consultation.</p>';
        } else {
          fullListEl.innerHTML = patientApts.map(a => this.renderAppointmentItemHtml(a)).join('');
        }
      }

      // Treatment Plan
      this.renderPatientTreatments();

      // Chat Messages & Thread
      this.renderPatientChat();

      // Reviews
      this.renderPatientReviews();
    }

    renderAppointmentItemHtml(apt) {
      const dateObj = new Date(apt.date);
      const monthStr = isNaN(dateObj) ? 'NOV' : dateObj.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      const dayStr = isNaN(dateObj) ? '12' : dateObj.getDate();
      const timeStr = isNaN(dateObj) ? '10:30 AM' : dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      
      // Status badge mapping with strict colors requested:
      // green for confirmed, amber for requested, blue for completed, teal for upcoming, purple for planned, and red for cancelled
      const statusBadgeClass = `status-${apt.status.toLowerCase()}`;
      const statusLabel = apt.status.charAt(0).toUpperCase() + apt.status.slice(1);

      return `
        <div class="appointment-item">
          <div class="appointment-left">
            <div class="appointment-date-box">
              <span class="apt-month">${monthStr}</span>
              <span class="apt-day">${dayStr}</span>
            </div>
            <div class="appointment-info">
              <h4>${this.escapeHtml(apt.service)}</h4>
              <div class="appointment-meta">
                <span><i data-lucide="clock" style="width: 13px; height: 13px;"></i> ${timeStr}</span>
                <span><i data-lucide="user-check" style="width: 13px; height: 13px;"></i> ${this.escapeHtml(apt.dentist)}</span>
                <span><i data-lucide="map-pin" style="width: 13px; height: 13px;"></i> ${this.escapeHtml(apt.room || 'Studio Suite IV')}</span>
              </div>
              ${apt.notes ? `<div style="font-size: 0.78rem; color: #7A897E; margin-top: 0.35rem; font-style: italic;">“${this.escapeHtml(apt.notes)}”</div>` : ''}
            </div>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.4rem;">
            <span class="status-badge ${statusBadgeClass}">${statusLabel}</span>
            <span style="font-size: 0.7rem; color: var(--color-ivory-muted);">Ref: #${apt.id.slice(-6)}</span>
          </div>
        </div>
      `;
    }

    renderPatientTreatments() {
      const container = document.getElementById('patientTreatmentsContainer');
      if (!container) return;

      const treatments = this.store.data.treatments || [];
      container.innerHTML = treatments.map(t => `
        <div class="treatment-card">
          <div class="card-header-flex">
            <div>
              <span class="status-badge status-upcoming" style="margin-bottom: 0.4rem;">${this.escapeHtml(t.status)}</span>
              <h3 style="font-size: 1.35rem;">${this.escapeHtml(t.title)}</h3>
              <div class="card-subtitle">Lead Clinician: ${this.escapeHtml(t.dentist)} &bull; Initiated ${this.escapeHtml(t.startDate)}</div>
            </div>
            <div style="text-align: right;">
              <span style="font-family: var(--font-serif); font-size: 1.8rem; font-weight: 600; color: var(--color-forest);">${t.progress}%</span>
              <div style="font-size: 0.72rem; color: var(--color-ivory-muted); text-transform: uppercase;">Completion</div>
            </div>
          </div>

          <p style="font-size: 0.92rem; color: #4B5A50; margin-bottom: 1rem;">${this.escapeHtml(t.description)}</p>

          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${t.progress}%;"></div>
          </div>

          <h5 style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-forest); margin-bottom: 0.75rem;">Clinical Milestones</h5>
          <ul class="milestones-list">
            ${t.milestones.map(m => `
              <li class="milestone-item ${m.completed ? 'completed' : ''}">
                <span class="milestone-dot"></span>
                <div class="milestone-label">${this.escapeHtml(m.label)}</div>
                <div class="milestone-date">${this.escapeHtml(m.date)}</div>
              </li>
            `).join('')}
          </ul>
        </div>
      `).join('');
    }

    filterChatThreads(workspaceKey, query) {
      if (!this.threadFilter) this.threadFilter = {};
      this.threadFilter[workspaceKey] = query || '';
      if (workspaceKey === 'patient') this.renderPatientChat();
      else if (workspaceKey === 'doctor') this.renderDoctorChat();
      else this.renderManagementChat();
      this.renderIcons();
    }

    getThreadPreview(thread, emptyLabel) {
      const messages = thread && Array.isArray(thread.messages) ? thread.messages : [];
      const latest = messages[messages.length - 1];
      if (!latest) return emptyLabel || 'Start consultation';
      const text = typeof latest.text === 'string' ? latest.text.trim() : '';
      const attachments = Array.isArray(latest.attachments) ? latest.attachments : [];
      return text || (attachments.length ? `${attachments.length} file(s) attached` : 'Message sent');
    }

    renderPatientChat() {
      const allThreads = this.store.data.chatThreads || [];
      let threads = allThreads;
      const query = ((this.threadFilter && this.threadFilter.patient) || '').toLowerCase().trim();
      if (query) {
        threads = threads.filter(t => 
          (t.patientName && t.patientName.toLowerCase().includes(query)) ||
          (t.messages && t.messages.some(m => m.text && m.text.toLowerCase().includes(query)))
        );
      }

      const threadListEl = document.getElementById('patientThreadList');
      const messagesAreaEl = document.getElementById('patientChatMessagesArea');
      const recipientTitleEl = document.getElementById('patientChatRecipientTitle');

      if (threadListEl) {
        if (threads.length === 0) {
          threadListEl.innerHTML = `
            <div style="padding: 1.5rem 1rem; text-align: center; color: #8F9E93; font-size: 0.8rem;">
              <i data-lucide="search-x" style="width: 20px; height: 20px; margin: 0 auto 0.4rem; display: block; opacity: 0.5;"></i>
              No consultations found matching "${this.escapeHtml(query)}"
            </div>
          `;
        } else {
          threadListEl.innerHTML = threads.map(t => {
            const unread = t.patientUnreadCount || t.unreadCount || 0;
            return `
            <div class="thread-item ${t.id === this.activePatientThreadId ? 'active' : ''}" onclick="window.maisonApp.switchChatThread('${t.id}', 'patient')">
              <img src="${t.patientAvatar}" class="user-avatar" alt="${this.escapeHtml(t.patientName)}">
              <div style="flex: 1; overflow: hidden;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                  <span style="font-size: 0.84rem; font-weight: 600; color: var(--color-forest-dark);">${this.escapeHtml(t.patientName)}</span>
                  ${unread > 0 ? `<span class="thread-unread-badge">${unread}</span>` : ''}
                </div>
                <div style="font-size: 0.72rem; color: #8F9E93; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${this.escapeHtml(this.getThreadPreview(t, 'Start consultation'))}
                </div>
              </div>
            </div>
          `;
          }).join('');
        }
      }

      const activeThread = allThreads.find(t => t.id === this.activePatientThreadId) || allThreads[0];
      if (recipientTitleEl && activeThread) {
        recipientTitleEl.innerHTML = `
          <span style="font-size: 1.05rem; font-weight: 600; color: var(--color-forest-dark);">Patient: ${this.escapeHtml(activeThread.patientName)}</span>
          <div style="font-size: 0.72rem; color: #526056; margin-top: 2px;">
            Participants: <strong>${this.escapeHtml(activeThread.patientName)}</strong> (Patient), <strong>Dr. Alistair Vance, DDS</strong>, <strong>Genevieve Laurent</strong> (Concierge)
          </div>
        `;
      }

      if (messagesAreaEl && activeThread) {
        if (!activeThread.messages || activeThread.messages.length === 0) {
          messagesAreaEl.innerHTML = `
            <div class="chat-empty-state">
              <i data-lucide="message-square"></i>
              <h4>Private Clinical Consultation</h4>
              <p>No messages yet in this consultation. Send clinical notes or attach treatment photos/PDFs below.</p>
            </div>
          `;
        } else {
          messagesAreaEl.innerHTML = activeThread.messages.map(m => this.renderMessageBubbleHtml(m, 'patient')).join('');
        }
        this.scrollChatToBottom('patient');
      }
    }

    renderMessageBubbleHtml(m, viewerRole) {
      const isSent = (m.senderRole === viewerRole);
      let specialBadge = '';

      if (m.type === 'instruction') {
        specialBadge = `<div class="instruction-tag-pill"><i data-lucide="shield-check" style="width: 12px; height: 12px;"></i> ${this.escapeHtml(m.instructionBadge || 'Clinical Care Directive')}</div>`;
      } else if (m.type === 'medicine') {
        specialBadge = `<div class="medicine-tag-pill"><i data-lucide="pill" style="width: 12px; height: 12px;"></i> ${this.escapeHtml(m.instructionBadge || 'Prescription & Care Guide')}</div>`;
      }

      let attachmentsHtml = '';
      if (Array.isArray(m.attachments) && m.attachments.length > 0) {
        attachmentsHtml = `
          <div class="attachment-previews-container">
            ${m.attachments.map(att => {
              const isPdf = !!(att.isPdf || (att.type && att.type.includes('pdf')) || (att.name && att.name.toLowerCase().endsWith('.pdf')));
              return `
                <button type="button" class="chat-attachment-chip ${isPdf ? 'pdf-chip' : 'image-chip'}" data-chat-attachment data-url="${this.escapeHtml(att.url || '')}" data-filename="${this.escapeHtml(att.name || 'attachment')}" data-is-pdf="${isPdf}" title="Click to view or download ${this.escapeHtml(att.name || 'attachment')}">
                  ${isPdf
                    ? '<i data-lucide="file-text" style="width: 18px; height: 18px; color: #DC2626; flex-shrink: 0;"></i>'
                    : `<img src="${this.escapeHtml(att.url)}" class="bubble-img-thumb" alt="${this.escapeHtml(att.name)}">`}
                  <div class="att-meta">
                    <span class="att-name">${this.escapeHtml(att.name)}</span>
                    <span class="att-size">${this.escapeHtml(att.size)}</span>
                  </div>
                  <i data-lucide="${isPdf ? 'download' : 'maximize-2'}" style="width: 13px; height: 13px; opacity: 0.7; margin-left: 0.25rem;"></i>
                </button>
              `;
            }).join('')}
          </div>
        `;
      }

      const senderTagColor = (m.senderRole === 'doctor') ? 'var(--color-gold-dark)' : (m.senderRole === 'management' ? '#10B981' : '#7A897E');

      const directionBadge = isSent
        ? `<span class="bubble-dir-badge outgoing"><i data-lucide="arrow-up-right" style="width: 10px; height: 10px;"></i> Outgoing</span>`
        : `<span class="bubble-dir-badge incoming"><i data-lucide="arrow-down-left" style="width: 10px; height: 10px;"></i> Incoming</span>`;

      // Status check & Read receipts
      let statusCheck = '';
      if (isSent) {
        let isRead = false;
        let readLabel = 'Delivered';
        if (viewerRole === 'patient') {
          isRead = !!(m.read || m.readByDoctor || m.readByMgmt);
          readLabel = isRead ? 'Read by Dr. Vance' : 'Delivered';
        } else if (viewerRole === 'doctor') {
          isRead = !!(m.read || m.readByPatient);
          readLabel = isRead ? 'Read by Patient' : 'Delivered';
        } else {
          isRead = !!(m.read || m.readByPatient || m.readByDoctor);
          readLabel = isRead ? 'Read by Recipient' : 'Delivered';
        }

        if (isRead) {
          statusCheck = `<span class="bubble-check read" title="${readLabel}" style="display:inline-flex; align-items:center; gap:2px; color:#10B981; font-size:0.68rem; font-weight:600;"><i data-lucide="check-check" style="width: 12px; height: 12px;"></i> ${readLabel}</span>`;
        } else {
          statusCheck = `<span class="bubble-check delivered" title="${readLabel}" style="display:inline-flex; align-items:center; gap:2px; color:#8F9E93; font-size:0.68rem;"><i data-lucide="check" style="width: 11px; height: 11px;"></i> ${readLabel}</span>`;
        }
      }

      return `
        <div class="message-bubble-wrapper ${isSent ? 'sent' : 'received'}">
          <div class="message-sender-tag">
            <span style="color: ${senderTagColor}; font-weight: 700;">${this.escapeHtml(m.senderName)}</span>
            ${directionBadge}
            <span style="font-size: 0.65rem; color: #A0B0A5;">&bull; ${this.escapeHtml(m.timestamp)}</span>
            ${statusCheck}
          </div>
          <div class="bubble ${m.type === 'instruction' ? 'instruction-bubble' : (m.type === 'medicine' ? 'medicine-bubble' : '')}">
            ${specialBadge}
            ${m.text ? `<div>${this.escapeHtml(m.text)}</div>` : ''}
            ${attachmentsHtml}
          </div>
        </div>
      `;
    }

    scrollChatToBottom(workspaceKey) {
      setTimeout(() => {
        let area;
        if (workspaceKey === 'patient') area = document.getElementById('patientChatMessagesArea');
        else if (workspaceKey === 'doctor') area = document.getElementById('doctorChatMessagesArea');
        else if (workspaceKey === 'mgmt' || workspaceKey === 'management') area = document.getElementById('mgmtChatMessagesArea');

        if (area) {
          area.scrollTop = area.scrollHeight;
        }
      }, 50);
    }

    scrollChatToTop(workspaceKey) {
      requestAnimationFrame(() => {
        const area = workspaceKey === 'doctor'
          ? document.getElementById('doctorChatMessagesArea')
          : document.getElementById('mgmtChatMessagesArea');
        if (area) area.scrollTop = 0;
      });
    }

    switchChatThread(threadId, workspaceKey) {
      if (workspaceKey === 'patient') {
        this.activePatientThreadId = threadId;
        this.store.markThreadRead(threadId, 'patient');
        this.renderPatientChat();
      } else if (workspaceKey === 'doctor') {
        this.activeDoctorThreadId = threadId;
        this.store.markThreadRead(threadId, 'doctor');
        this.renderDoctorChat();
      } else if (workspaceKey === 'mgmt' || workspaceKey === 'management') {
        this.activeMgmtThreadId = threadId;
        this.store.markThreadRead(threadId, 'management');
        this.renderManagementWorkspace();
      }
      this.renderHeader();
      this.closeMobileThreads();
      this.renderIcons();
      if (workspaceKey === 'doctor' || workspaceKey === 'mgmt' || workspaceKey === 'management') {
        this.scrollChatToTop(workspaceKey);
      } else {
        this.scrollChatToBottom(workspaceKey);
      }
    }

    renderPatientReviews() {
      const grid = document.getElementById('patientReviewsGrid');
      if (!grid) return;
      const reviews = this.store.data.reviews || [];
      grid.innerHTML = reviews.map(r => this.renderReviewCardHtml(r)).join('');
    }

    renderReviewCardHtml(r) {
      const stars = '&#9733;'.repeat(r.rating) + '&#9734;'.repeat(5 - r.rating);
      return `
        <div class="review-card">
          <div>
            <div class="stars-row">${stars}</div>
            <h4>${this.escapeHtml(r.title)}</h4>
            <p>“${this.escapeHtml(r.content)}”</p>
          </div>
          <div class="review-author-meta">
            <div>
              <strong>${this.escapeHtml(r.author)}</strong>
              <div style="font-size: 0.7rem; color: #8F9E93;">${this.escapeHtml(r.service)}</div>
            </div>
            <span>${this.escapeHtml(r.date)}</span>
          </div>
        </div>
      `;
    }

    /* ----------------------------------------------------
       2. DOCTOR WORKSPACE
    ---------------------------------------------------- */
    renderDoctorWorkspace() {
      const appointments = this.store.data.appointments;
      const doctorScheduleEl = document.getElementById('doctorTodayScheduleList');
      const countEl = document.getElementById('doctorTodayAppointmentsCount');

      // Filter for Dr. Vance
      const doctorApts = appointments.filter(a => a.dentist.includes('Vance'));

      if (countEl) countEl.textContent = doctorApts.length;

      if (doctorScheduleEl) {
        if (doctorApts.length === 0) {
          doctorScheduleEl.innerHTML = '<p style="color: #8E9F92; padding: 1rem 0;">No active cases today.</p>';
        } else {
          doctorScheduleEl.innerHTML = doctorApts.map(a => `
              <div class="appointment-item">
              <div class="appointment-left">
                <div class="appointment-date-box" style="background: var(--color-forest-medium);">
                  <span class="apt-month">${new Date(a.date).toLocaleString('en-US', { month: 'short' }).toUpperCase()}</span>
                  <span class="apt-day">${new Date(a.date).getDate()}</span>
                </div>
                <div class="appointment-info">
                  <h4>${this.escapeHtml(a.patientName)}</h4>
                  <div class="appointment-meta">
                    <span><i data-lucide="tag" style="width: 12px; height: 12px;"></i> ${this.escapeHtml(a.service)}</span>
                    <span><i data-lucide="map-pin" style="width: 12px; height: 12px;"></i> ${this.escapeHtml(a.room || 'Studio Suite IV')}</span>
                  </div>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="status-badge status-${a.status.toLowerCase()}">${a.status}</span>
                <button type="button" class="btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;" title="Open conversation" onclick="window.maisonApp.openPatientChatFromDoctor('${this.escapeHtml(a.patientName)}')">
                  <i data-lucide="message-square" style="width: 13px; height: 13px;"></i>
                </button>
              </div>
            </div>
          `).join('');
        }
      }

      // Patient Search Directory
      this.filterDoctorPatients('');

      // Doctor Chat & Active Thread
      this.renderDoctorChat();

      // Doctor Reviews View
      const reviewsGrid = document.getElementById('doctorReviewsGrid');
      if (reviewsGrid) {
        reviewsGrid.innerHTML = this.store.data.reviews.map(r => this.renderReviewCardHtml(r)).join('');
      }
    }

    filterDoctorPatients(query) {
      const resultsContainer = document.getElementById('doctorPatientSearchResults');
      if (!resultsContainer) return;

      const q = (query || '').toLowerCase().trim();
      const uniquePatients = [
        { name: 'Olivia Sterling', email: 'olivia@maison.demo', service: 'Handcrafted Porcelain Veneers', threadId: 'thread-olivia', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80' },
        { name: 'Alexander Hayes', email: 'alexander.hayes@demo.luxury', service: 'Bespoke Smile Architecture', threadId: 'thread-alexander', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80' },
        { name: 'Eleanor Vance-Moreau', email: 'eleanor.v@demo.luxury', service: 'Invisalign Diamond Precision', threadId: 'thread-eleanor', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80' }
      ];

      const matches = uniquePatients.filter(p => p.name.toLowerCase().includes(q) || p.service.toLowerCase().includes(q));

      if (matches.length === 0) {
        resultsContainer.innerHTML = '<div style="padding: 1rem; color: #8E9F92; font-size: 0.85rem; text-align: center;">No matching patient charts found.</div>';
        return;
      }

      resultsContainer.innerHTML = matches.map(p => `
        <div class="appointment-item" style="padding: 0.75rem 1rem; margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <img src="${p.avatar}" class="user-avatar" alt="${this.escapeHtml(p.name)}">
            <div>
              <div style="font-size: 0.88rem; font-weight: 600; color: var(--color-forest-dark);">${this.escapeHtml(p.name)}</div>
              <div style="font-size: 0.72rem; color: #7B8B80;">${this.escapeHtml(p.service)}</div>
            </div>
          </div>
          <button type="button" class="btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.74rem;" onclick="window.maisonApp.openPatientChatFromDoctor('${p.name}')">
            <span>Open Chart</span>
          </button>
        </div>
      `).join('');
      this.renderIcons();
    }

    openPatientChatFromDoctor(patientName) {
      const match = this.store.data.chatThreads.find(t => t.patientName.toLowerCase().includes(patientName.toLowerCase()));
      if (match) {
        this.activeDoctorThreadId = match.id;
        this.renderDoctorWorkspace();
        const chat = document.querySelector('#workspace-doctor .chat-container');
        if (chat) chat.scrollIntoView({ behavior: 'smooth' });
        this.showToast('Clinical Chart Opened', `Loaded live thread for ${match.patientName}`, 'info');
      }
    }

    renderDoctorChat() {
      let threads = this.store.data.chatThreads || [];
      const query = ((this.threadFilter && this.threadFilter.doctor) || '').toLowerCase().trim();
      if (query) {
        threads = threads.filter(t => 
          (t.patientName && t.patientName.toLowerCase().includes(query)) ||
          (t.messages && t.messages.some(m => m.text && m.text.toLowerCase().includes(query)))
        );
      }

      const threadListEl = document.getElementById('doctorThreadList');
      const messagesAreaEl = document.getElementById('doctorChatMessagesArea');
      const activePatientLabel = document.getElementById('doctorChatActivePatient');

      if (threadListEl) {
        if (threads.length === 0) {
          threadListEl.innerHTML = `
            <div style="padding: 1.5rem 1rem; text-align: center; color: #8F9E93; font-size: 0.8rem;">
              <i data-lucide="search-x" style="width: 20px; height: 20px; margin: 0 auto 0.4rem; display: block; opacity: 0.5;"></i>
              No consultations found matching "${this.escapeHtml(query)}"
            </div>
          `;
        } else {
          threadListEl.innerHTML = threads.map(t => {
            const unread = t.doctorUnreadCount || 0;
            return `
            <div class="thread-item ${t.id === this.activeDoctorThreadId ? 'active' : ''}" onclick="window.maisonApp.switchChatThread('${t.id}', 'doctor')">
              <img src="${t.patientAvatar}" class="user-avatar" alt="${this.escapeHtml(t.patientName)}">
              <div style="flex: 1; overflow: hidden;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                  <span style="font-size: 0.84rem; font-weight: 600; color: var(--color-forest-dark);">${this.escapeHtml(t.patientName)}</span>
                  ${unread > 0 ? `<span class="thread-unread-badge">${unread}</span>` : ''}
                </div>
                <div style="font-size: 0.72rem; color: #8F9E93; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${this.escapeHtml(this.getThreadPreview(t, 'Start consultation'))}
                </div>
              </div>
            </div>
          `;
          }).join('');
        }
      }

      const activeThread = threads.find(t => t.id === this.activeDoctorThreadId) || threads[0];
      if (activePatientLabel && activeThread) {
        activePatientLabel.innerHTML = `
          <span style="font-size: 1.05rem; font-weight: 600; color: var(--color-forest-dark);">Patient: ${this.escapeHtml(activeThread.patientName)}</span>
          <div style="font-size: 0.72rem; color: #526056; margin-top: 2px;">
            Participants: <strong>${this.escapeHtml(activeThread.patientName)}</strong> (Patient), <strong>Dr. Alistair Vance, DDS</strong>, <strong>Genevieve Laurent</strong> (Concierge)
          </div>
        `;
      }

      if (messagesAreaEl && activeThread) {
        if (!activeThread.messages || activeThread.messages.length === 0) {
          messagesAreaEl.innerHTML = `
            <div class="chat-empty-state">
              <i data-lucide="message-square"></i>
              <h4>Doctor Clinical Communication</h4>
              <p>No messages yet in this consultation. Deliver directives, prescriptions, or diagnostics below.</p>
            </div>
          `;
        } else {
          messagesAreaEl.innerHTML = activeThread.messages.map(m => this.renderMessageBubbleHtml(m, 'doctor')).join('');
        }
        this.scrollChatToBottom('doctor');
      }
    }

    setDoctorMsgType(type) {
      this.doctorMsgType = type;
      ['docTypeStandard', 'docTypeInstruction', 'docTypeMedicine'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('active');
      });

      const targetId = type === 'instruction' ? 'docTypeInstruction' : (type === 'medicine' ? 'docTypeMedicine' : 'docTypeStandard');
      const targetBtn = document.getElementById(targetId);
      if (targetBtn) targetBtn.classList.add('active');
    }

    /* ----------------------------------------------------
       3. MANAGEMENT WORKSPACE
    ---------------------------------------------------- */
    renderManagementWorkspace() {
      const appointments = this.store.data.appointments;
      const stats = this.store.data.stats;

      // Stats counters
      const totalAptsEl = document.getElementById('mgmtTotalAppointments');
      const activePtsEl = document.getElementById('mgmtActivePatients');
      const remindersEl = document.getElementById('mgmtRemindersSent');
      const satisfEl = document.getElementById('mgmtSatisfactionRate');

      if (totalAptsEl) totalAptsEl.textContent = appointments.length;
      if (activePtsEl) activePtsEl.textContent = stats.activePatients;
      if (remindersEl) remindersEl.textContent = stats.remindersSent;
      if (satisfEl) satisfEl.textContent = stats.satisfactionRate;

      // Appointment Request Queue (CRITICAL REQUIREMENT)
      // Displays requests with status 'requested'
      const queueBody = document.getElementById('mgmtAppointmentQueueBody');
      const queueCountBadge = document.getElementById('mgmtPendingQueueCount');
      const pendingRequests = appointments.filter(a => a.status === 'requested');

      if (queueCountBadge) {
        queueCountBadge.textContent = `${pendingRequests.length} Request${pendingRequests.length === 1 ? '' : 's'} Pending`;
      }

      if (queueBody) {
        if (pendingRequests.length === 0) {
          queueBody.innerHTML = `
            <tr>
              <td colspan="7" style="text-align: center; padding: 2rem; color: #8F9E93;">
                All patient appointment requests have been processed & confirmed.
              </td>
            </tr>
          `;
        } else {
          queueBody.innerHTML = pendingRequests.map(req => {
            const dateStr = new Date(req.date).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            return `
              <tr>
                <td><strong>${this.escapeHtml(req.patientName)}</strong></td>
                <td><span style="font-weight: 500;">${this.escapeHtml(req.service)}</span></td>
                <td>${this.escapeHtml(req.dentist)}</td>
                <td><span style="font-size: 0.8rem; color: var(--color-ivory-muted);">${this.escapeHtml(req.patientEmail || req.patientPhone)}</span></td>
                <td>${dateStr}</td>
                <td><span style="font-size: 0.78rem; font-style: italic;">${this.escapeHtml(req.notes || '—')}</span></td>
                <td style="text-align: right; white-space: nowrap;">
                  <div style="display:flex; justify-content:flex-end; align-items:center; gap:0.45rem;">
                  <button type="button" class="btn-success" onclick="window.maisonApp.confirmAppointment('${this.escapeHtml(req.id)}')" title="Confirm patient booking and notify client">
                    <i data-lucide="check-circle-2" style="width: 14px; height: 14px;"></i>
                    <span>Confirm</span>
                  </button>
                  <button type="button" class="appointment-cancel-btn" onclick="window.maisonApp.cancelAppointment('${this.escapeHtml(req.id)}')" title="Cancel this appointment request">
                    <i data-lucide="calendar-x" style="width:14px;height:14px;"></i><span>Cancel</span>
                  </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      // Master Appointment Schedule List
      const masterListEl = document.getElementById('mgmtMasterAppointmentList');
      if (masterListEl) {
        masterListEl.innerHTML = appointments.map(a => `
          <div class="management-appointment-row">
            ${this.renderAppointmentItemHtml(a)}
            ${!['completed', 'cancelled'].includes(String(a.status).toLowerCase()) ? `
              <button type="button" class="appointment-cancel-btn" onclick="window.maisonApp.cancelAppointment('${this.escapeHtml(a.id)}')" aria-label="Cancel appointment for ${this.escapeHtml(a.patientName)}">
                <i data-lucide="calendar-x" style="width:14px;height:14px;"></i><span>Cancel</span>
              </button>` : ''}
          </div>
        `).join('');
      }

      // Management Chat
      this.renderManagementChat();

      // Management Reviews
      const reviewsGrid = document.getElementById('mgmtReviewsGrid');
      if (reviewsGrid) {
        reviewsGrid.innerHTML = this.store.data.reviews.map(r => this.renderReviewCardHtml(r)).join('');
      }
    }

    renderManagementChat() {
      let threads = this.store.data.chatThreads || [];
      const query = ((this.threadFilter && this.threadFilter.mgmt) || '').toLowerCase().trim();
      if (query) {
        threads = threads.filter(t => 
          (t.patientName && t.patientName.toLowerCase().includes(query)) ||
          (t.messages && t.messages.some(m => m.text && m.text.toLowerCase().includes(query)))
        );
      }

      const threadListEl = document.getElementById('mgmtThreadList');
      const messagesAreaEl = document.getElementById('mgmtChatMessagesArea');
      const activeTitleEl = document.getElementById('mgmtChatActiveTitle');

      if (threadListEl) {
        if (threads.length === 0) {
          threadListEl.innerHTML = `
            <div style="padding: 1.5rem 1rem; text-align: center; color: #8F9E93; font-size: 0.8rem;">
              <i data-lucide="search-x" style="width: 20px; height: 20px; margin: 0 auto 0.4rem; display: block; opacity: 0.5;"></i>
              No consultations found matching "${this.escapeHtml(query)}"
            </div>
          `;
        } else {
          threadListEl.innerHTML = threads.map(t => {
            const unread = t.mgmtUnreadCount || 0;
            return `
            <div class="thread-item ${t.id === this.activeMgmtThreadId ? 'active' : ''}" onclick="window.maisonApp.switchChatThread('${t.id}', 'mgmt')">
              <img src="${t.patientAvatar}" class="user-avatar" alt="${this.escapeHtml(t.patientName)}">
              <div style="flex: 1; overflow: hidden;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                  <span style="font-size: 0.84rem; font-weight: 600; color: var(--color-forest-dark);">${this.escapeHtml(t.patientName)}</span>
                  ${unread > 0 ? `<span class="thread-unread-badge">${unread}</span>` : ''}
                </div>
                <div style="font-size: 0.72rem; color: #8F9E93; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${this.escapeHtml(this.getThreadPreview(t, 'Active consultation'))}
                </div>
              </div>
            </div>
          `;
          }).join('');
        }
      }

      const activeThread = threads.find(t => t.id === this.activeMgmtThreadId) || threads[0];
      if (activeTitleEl && activeThread) {
        activeTitleEl.innerHTML = `
          <span style="font-size: 1.05rem; font-weight: 600; color: var(--color-forest-dark);">Patient: ${this.escapeHtml(activeThread.patientName)}</span>
          <div style="font-size: 0.72rem; color: #526056; margin-top: 2px;">
            Participants: <strong>${this.escapeHtml(activeThread.patientName)}</strong> (Patient), <strong>Dr. Alistair Vance, DDS</strong>, <strong>Genevieve Laurent</strong> (Concierge)
          </div>
        `;
      }

      if (messagesAreaEl && activeThread) {
        if (!activeThread.messages || activeThread.messages.length === 0) {
          messagesAreaEl.innerHTML = `
            <div class="chat-empty-state">
              <i data-lucide="message-square"></i>
              <h4>Concierge & Triage Desk</h4>
              <p>No messages yet in this consultation. Coordinate reservations and care updates below.</p>
            </div>
          `;
        } else {
          messagesAreaEl.innerHTML = activeThread.messages.map(m => this.renderMessageBubbleHtml(m, 'management')).join('');
        }
        this.scrollChatToBottom('mgmt');
      }
    }

    confirmAppointment(aptId) {
      const apt = this.store.confirmAppointment(aptId);
      if (apt) {
        this.showToast('Appointment Confirmed', `Confirmed for ${apt.patientName} on ${new Date(apt.date).toLocaleDateString()}. Notification dispatched.`, 'success');
        this.renderAll();
      }
    }

    cancelAppointment(aptId) {
      const apt = this.store.cancelAppointment(aptId);
      if (!apt) {
        this.showToast('Appointment Not Cancellable', 'Completed or already cancelled appointments cannot be cancelled.', 'error');
        return;
      }
      this.showToast('Appointment Cancelled', `${apt.patientName}'s appointment has been cancelled.`, 'success');
      this.renderAll();
    }

    sendAppointmentReminders() {
      const totalSent = this.store.sendReminders();
      this.showToast('Reminders Dispatched', `Automated calendar invites and luxury SMS reminders sent to upcoming patients (Total: ${totalSent}).`, 'success');
      this.renderAll();
    }

    /* ----------------------------------------------------
       Booking Form Submission
    ---------------------------------------------------- */
    openBookModal() {
      const modal = document.getElementById('bookModal');
      if (modal) {
        modal.classList.add('active');
      }
    }

    handleBookingSubmit(event) {
      event.preventDefault();

      const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
      };

      let name, contact, service, dentist, date, notes;

      // Check if submitted from modal or inline form
      if (event.target.id === 'patientBookForm') {
        name = getVal('bookPatientName');
        contact = getVal('bookContact');
        service = getVal('bookService');
        dentist = getVal('bookDentist');
        date = getVal('bookDate');
        notes = getVal('bookNotes');
      } else {
        name = getVal('modalBookName');
        contact = getVal('modalBookContact');
        service = getVal('modalBookService');
        dentist = getVal('modalBookDentist');
        date = getVal('modalBookDate');
        notes = getVal('modalBookNotes');
      }

      if (!name || !date || !service) {
        this.showToast('Missing Details', 'Please complete the patient name, date, and service.', 'error');
        return;
      }

      const newApt = this.store.addAppointment({
        patientName: name,
        patientEmail: contact.includes('@') ? contact : 'patient@maison.demo',
        patientPhone: !contact.includes('@') ? contact : '+1 (555) 234-8901',
        service: service,
        dentist: dentist,
        date: date,
        notes: notes
      });

      this.closeModals();
      this.showToast('Reservation Requested', `Your booking for "${service}" has been queued. Management concierge will confirm shortly.`, 'success');
      
      this.renderAll();

      // Show appointments section
      this.showSection('appointments');
    }

    /* ----------------------------------------------------
       File Attachments & Chat Messaging (8 MB limit)
    ---------------------------------------------------- */
    handleFileSelect(event, workspaceKey) {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;

      const MAX_SIZE_BYTES = 8 * 1024 * 1024; // Strict 8 MB limit per file

      for (const file of files) {
        // 1. Enforce supported file format: Images (JPEG, PNG, WebP, GIF, SVG) and PDFs only
        const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

        if (!isImage && !isPdf) {
          this.showToast('Unsupported File Type', `"${file.name}" cannot be attached. Please select an image (JPEG, PNG, WebP) or PDF document.`, 'error');
          continue;
        }

        // 2. Enforce 8 MB per-file limit
        if (file.size > MAX_SIZE_BYTES) {
          const mbSize = (file.size / (1024 * 1024)).toFixed(1);
          this.showToast('File Too Large', `"${file.name}" exceeds the 8 MB limit (${mbSize} MB). Please choose a file under 8 MB.`, 'error');
          continue;
        }

        const sizeFormatted = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
        let objectUrl = '';
        try {
          if (typeof URL !== 'undefined' && URL.createObjectURL) {
            objectUrl = URL.createObjectURL(file);
          }
        } catch (e) {
          console.warn('Could not create ObjectURL:', e);
        }

        const stagedFileItem = {
          id: 'staged-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          name: file.name,
          type: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
          size: sizeFormatted,
          isPdf: isPdf,
          url: objectUrl,
          file: file
        };

        // Fallback for image preview if ObjectURL is empty
        if (!objectUrl && isImage && typeof FileReader !== 'undefined') {
          const reader = new FileReader();
          reader.onload = (e) => {
            stagedFileItem.url = e.target.result;
            this.renderStagedFiles(workspaceKey);
          };
          reader.readAsDataURL(file);
        }

        if (!this.stagedFiles[workspaceKey]) {
          this.stagedFiles[workspaceKey] = [];
        }
        this.stagedFiles[workspaceKey].push(stagedFileItem);
      }

      this.renderStagedFiles(workspaceKey);

      // Reset file input so user can attach the same file again or more files
      event.target.value = '';
    }

    renderStagedFiles(workspaceKey) {
      let trayEl;
      if (workspaceKey === 'patient') trayEl = document.getElementById('patientPendingFilesTray');
      else if (workspaceKey === 'doctor') trayEl = document.getElementById('doctorPendingFilesTray');
      else if (workspaceKey === 'mgmt' || workspaceKey === 'management') trayEl = document.getElementById('mgmtPendingFilesTray');

      if (!trayEl) return;

      const files = this.stagedFiles[workspaceKey] || [];
      if (files.length === 0) {
        trayEl.innerHTML = '';
        return;
      }

      trayEl.innerHTML = files.map((f, idx) => {
        const isPdf = !!(f.isPdf || (f.type && f.type.includes('pdf')) || f.name.toLowerCase().endsWith('.pdf'));
        const previewSrc = f.url || (isPdf ? '' : 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=150&q=80');

        return `
          <div class="staged-file-card ${isPdf ? 'pdf-staged' : 'image-staged'}">
            ${isPdf
              ? '<div class="staged-pdf-icon"><i data-lucide="file-text" style="width: 18px; height: 18px; color: #DC2626;"></i></div>'
              : `<img src="${this.escapeHtml(previewSrc)}" class="staged-img-thumb" alt="${this.escapeHtml(f.name)}">`}
            <div class="staged-file-info">
              <span class="staged-file-name" title="${this.escapeHtml(f.name)}">${this.escapeHtml(f.name)}</span>
              <span class="staged-file-size">${isPdf ? 'PDF &bull; ' : 'Image &bull; '}${this.escapeHtml(f.size)}</span>
            </div>
            <button type="button" class="remove-staged-btn" title="Remove attachment" onclick="window.maisonApp.removeStagedFile('${workspaceKey}', ${idx})" aria-label="Remove file">&times;</button>
          </div>
        `;
      }).join('');
      this.renderIcons();
    }

    removeStagedFile(workspaceKey, index) {
      if (this.stagedFiles[workspaceKey] && this.stagedFiles[workspaceKey][index]) {
        const item = this.stagedFiles[workspaceKey][index];
        if (item.url && item.url.startsWith('blob:') && typeof URL !== 'undefined' && URL.revokeObjectURL) {
          try { URL.revokeObjectURL(item.url); } catch (e) {}
        }
        this.stagedFiles[workspaceKey].splice(index, 1);
        this.renderStagedFiles(workspaceKey);
        this.showToast('File Removed', `Removed ${item.name}`, 'info');
      }
    }

    stageSampleAttachment(workspaceKey, type) {
      if (!this.stagedFiles) this.stagedFiles = { patient: [], doctor: [], mgmt: [] };
      if (!this.stagedFiles[workspaceKey]) this.stagedFiles[workspaceKey] = [];
      const timestamp = Date.now();

      if (type === 'photo') {
        const photoSamples = [
          {
            name: 'Aesthetic_Smile_Contour_Scan.jpg',
            url: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&q=80',
            size: '1.4 MB',
            type: 'image/jpeg'
          },
          {
            name: 'Ceramic_Veneer_Shade_Check.jpg',
            url: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=800&q=80',
            size: '2.1 MB',
            type: 'image/jpeg'
          },
          {
            name: 'Anterior_Prophylaxis_Review.jpg',
            url: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80',
            size: '1.8 MB',
            type: 'image/jpeg'
          }
        ];
        const sample = photoSamples[Math.floor(Math.random() * photoSamples.length)];
        this.stagedFiles[workspaceKey].push({
          id: 'stage-photo-' + timestamp,
          name: sample.name,
          size: sample.size,
          type: sample.type,
          isPdf: false,
          url: sample.url
        });
        this.renderStagedFiles(workspaceKey);
        this.showToast('Photo Attached', `Ready to send: ${sample.name}`, 'info');
      } else if (type === 'pdf') {
        const pdfSamples = [
          {
            name: 'Maison_Clinical_Directive_Veneers.pdf',
            url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80',
            size: '840 KB',
            type: 'application/pdf'
          },
          {
            name: 'Care_Instruction_Prescription_Protocol.pdf',
            url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80',
            size: '1.1 MB',
            type: 'application/pdf'
          },
          {
            name: 'Concierge_Reservation_Summary_SuiteIV.pdf',
            url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80',
            size: '620 KB',
            type: 'application/pdf'
          }
        ];
        const sample = pdfSamples[Math.floor(Math.random() * pdfSamples.length)];
        this.stagedFiles[workspaceKey].push({
          id: 'stage-pdf-' + timestamp,
          name: sample.name,
          size: sample.size,
          type: sample.type,
          isPdf: true,
          url: sample.url
        });
        this.renderStagedFiles(workspaceKey);
        this.showToast('PDF Attached', `Ready to send: ${sample.name}`, 'info');
      }
    }

    markActiveThreadAsRead(workspaceKey) {
      let threadId;
      let role = 'patient';
      if (workspaceKey === 'patient') {
        threadId = this.activePatientThreadId || 'thread-olivia';
        role = 'patient';
      } else if (workspaceKey === 'doctor') {
        threadId = this.activeDoctorThreadId || 'thread-olivia';
        role = 'doctor';
      } else {
        threadId = this.activeMgmtThreadId || 'thread-olivia';
        role = 'management';
      }

      this.store.markThreadRead(threadId, role);
      this.renderAll();
      this.showToast('Consultation Marked Read', 'All messages marked as read.', 'success');
    }

    setChatDirection(workspaceKey, direction) {
      if (!this.chatDirections) this.chatDirections = {};
      this.chatDirections[workspaceKey] = direction;

      const outgoingBtnId = `${workspaceKey}DirOutgoing`;
      const incomingBtnId = `${workspaceKey}DirIncoming`;
      const outBtn = document.getElementById(outgoingBtnId);
      const inBtn = document.getElementById(incomingBtnId);

      if (outBtn && inBtn) {
        if (direction === 'outgoing') {
          outBtn.classList.add('active');
          inBtn.classList.remove('active', 'incoming-btn-active');
        } else {
          inBtn.classList.add('active', 'incoming-btn-active');
          outBtn.classList.remove('active');
        }
      }

      // Update input placeholder and Send button title
      let inputEl, sendBtn;
      if (workspaceKey === 'patient') {
        inputEl = document.getElementById('patientMessageInput');
        sendBtn = document.getElementById('patientSendBtn');
        if (inputEl) {
          inputEl.placeholder = (direction === 'outgoing')
            ? 'Write a message to Dr. Vance or concierge (Outgoing)...'
            : 'Write an incoming note from Dr. Vance or Concierge (Incoming)...';
        }
      } else if (workspaceKey === 'doctor') {
        inputEl = document.getElementById('doctorMessageInput');
        sendBtn = document.getElementById('doctorSendBtn');
        if (inputEl) {
          inputEl.placeholder = (direction === 'outgoing')
            ? 'Send clinical note, care instruction, or prescription (Outgoing)...'
            : 'Write an incoming message from patient Olivia (Incoming)...';
        }
      } else if (workspaceKey === 'mgmt' || workspaceKey === 'management') {
        inputEl = document.getElementById('mgmtMessageInput');
        sendBtn = document.getElementById('mgmtSendBtn');
        if (inputEl) {
          inputEl.placeholder = (direction === 'outgoing')
            ? 'Send concierge notification (Outgoing)...'
            : 'Write an incoming message from patient or doctor (Incoming)...';
        }
      }

      if (sendBtn) {
        sendBtn.title = (direction === 'outgoing') ? 'Send Outgoing Message' : 'Send Incoming Message';
      }

      if (inputEl) inputEl.focus();
      this.renderIcons();
    }

    sendMessage(workspaceKey) {
      let inputEl, threadId;
      let msgType = 'standard';
      let instructionBadge = null;

      if (workspaceKey === 'patient') {
        inputEl = document.getElementById('patientMessageInput');
        threadId = this.activePatientThreadId;
      } else if (workspaceKey === 'doctor') {
        inputEl = document.getElementById('doctorMessageInput');
        threadId = this.activeDoctorThreadId;
        msgType = this.doctorMsgType;
        if (msgType === 'instruction') instructionBadge = 'Clinical Care Directive';
        if (msgType === 'medicine') instructionBadge = 'Prescription & Care Guide';
      } else if (workspaceKey === 'mgmt' || workspaceKey === 'management') {
        inputEl = document.getElementById('mgmtMessageInput');
        threadId = this.activeMgmtThreadId;
      }

      const text = inputEl ? inputEl.value.trim() : '';
      const stagedList = this.stagedFiles[workspaceKey] || [];

      const activeThread = (this.store.data.chatThreads || []).find(t => t.id === threadId);
      if (!activeThread) {
        this.showToast('Choose a patient conversation', 'Select a patient from the conversation list before sending.', 'error');
        return;
      }

      // Enforce non-empty message behavior
      if (!text && stagedList.length === 0) {
        this.showToast('Empty Message', 'Please enter a message or attach a file before sending.', 'info');
        if (inputEl) inputEl.focus();
        return;
      }

      const direction = (this.chatDirections && this.chatDirections[workspaceKey]) || 'outgoing';
      let senderRole, senderName;
      const workspaceRole = workspaceKey === 'mgmt' ? 'management' : workspaceKey;
      const otherPartyRole = workspaceRole === 'patient' ? 'doctor' : 'patient';

      const currentPatientName = activeThread.patientName || 'Patient';

      if (workspaceKey === 'patient') {
        if (direction === 'outgoing') {
          senderRole = workspaceRole;
          senderName = currentPatientName;
        } else {
          senderRole = otherPartyRole;
          senderName = 'Dr. Alistair Vance, DDS';
        }
      } else if (workspaceKey === 'doctor') {
        if (direction === 'outgoing') {
          senderRole = workspaceRole;
          senderName = 'Dr. Alistair Vance, DDS';
        } else {
          senderRole = otherPartyRole;
          senderName = currentPatientName;
        }
      } else if (workspaceKey === 'mgmt' || workspaceKey === 'management') {
        if (direction === 'outgoing') {
          senderRole = workspaceRole;
          senderName = 'Genevieve Laurent (Concierge)';
        } else {
          senderRole = otherPartyRole;
          senderName = currentPatientName;
        }
      }

      // Convert staged attachments to persistent session attachments
      const attachments = stagedList.map(staged => {
        const isPdf = !!(staged.isPdf || (staged.type && staged.type.includes('pdf')) || staged.name.toLowerCase().endsWith('.pdf'));
        const fallbackUrl = isPdf
          ? 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80'
          : 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=600&q=80';

        return {
          id: staged.id || ('att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)),
          name: staged.name,
          type: staged.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
          size: staged.size,
          isPdf: isPdf,
          url: staged.url || fallbackUrl
        };
      });

      this.store.addMessage(threadId, {
        text: text,
        senderRole: senderRole,
        senderName: senderName,
        sentFromRole: workspaceRole,
        sentDirection: direction,
        type: msgType,
        instructionBadge: instructionBadge,
        attachments: attachments
      });

      // Clear composer input and staged files
      if (inputEl) inputEl.value = '';
      this.stagedFiles[workspaceKey] = [];
      this.renderStagedFiles(workspaceKey);

      // Re-render chat across all 3 workspaces so message immediately appears in Patient, Doctor, and Management
      this.renderAll();
      this.scrollChatToBottom(workspaceKey);

      const toastLabel = (direction === 'outgoing') ? 'Outgoing Message Sent' : 'Incoming Message Received';
      this.showToast(toastLabel, `Synchronized live (${senderName}): ${text.substring(0, 45) || (attachments.length + ' file(s)')}`, 'info');

      // Check auto-reply: if outgoing message was sent, automatically generate an incoming care team reply
      if (direction === 'outgoing' && this.autoReplyEnabled) {
        this.triggerAutoCareReply(workspaceKey, threadId, text);
      }
    }

    simulateIncomingCareReply(workspaceKey) {
      let threadId, messagesAreaEl;
      let senderRole, senderName, replyText;

      const threads = this.store.data.chatThreads || [];

      if (workspaceKey === 'patient') {
        threadId = this.activePatientThreadId || 'thread-olivia';
        messagesAreaEl = document.getElementById('patientChatMessagesArea');
        senderRole = 'doctor';
        senderName = 'Dr. Alistair Vance, DDS';

        const replies = [
          'Hello Olivia, I have reviewed your latest smile contour records. The ceramic shading is progressing splendidly and Suite IV is prepared for your fitting.',
          'Good afternoon Olivia. Our concierge has verified your arrival for Thursday. Valet parking is arranged and your diagnostic study is ready for review.',
          'Care directive: Please continue with the soothing gentle rinse as prescribed. If you experience any sensitivity, let our concierge team know right away.',
          'Delighted to hear from you, Olivia. I have incorporated your canine contour preference into our master laboratory design.'
        ];
        replyText = replies[Math.floor(Math.random() * replies.length)];
      } else if (workspaceKey === 'doctor') {
        threadId = this.activeDoctorThreadId || 'thread-olivia';
        messagesAreaEl = document.getElementById('doctorChatMessagesArea');
        const activeThread = threads.find(t => t.id === threadId) || threads[0];
        senderRole = 'patient';
        senderName = activeThread ? activeThread.patientName : 'Olivia Sterling';

        const replies = [
          'Thank you Dr. Vance! The temporary veneers feel very smooth and comfortable. Looking forward to our next session.',
          'Good morning Dr. Vance, I will make sure to follow the rinse instructions twice daily as advised. Thank you!',
          'Understood, Dr. Vance. I am thrilled with the 3D preview and appreciate your meticulous attention to detail.'
        ];
        replyText = replies[Math.floor(Math.random() * replies.length)];
      } else {
        threadId = this.activeMgmtThreadId || 'thread-olivia';
        messagesAreaEl = document.getElementById('mgmtChatMessagesArea');
        const activeThread = threads.find(t => t.id === threadId) || threads[0];
        senderRole = 'patient';
        senderName = activeThread ? activeThread.patientName : 'Olivia Sterling';

        const replies = [
          'Thank you Genevieve! The appointment time and valet arrangement sound perfect. See you Thursday!',
          'Hello Genevieve, thank you for confirming. I have received the calendar invitation and care documents.'
        ];
        replyText = replies[Math.floor(Math.random() * replies.length)];
      }

      // Show typing indicator
      if (messagesAreaEl) {
        const typingEl = document.createElement('div');
        typingEl.className = 'typing-indicator-wrapper';
        typingEl.id = `${workspaceKey}TypingIndicator`;
        typingEl.innerHTML = `
          <div class="typing-dots"><span></span><span></span><span></span></div>
          <span class="typing-label">${this.escapeHtml(senderName)} is replying...</span>
        `;
        messagesAreaEl.appendChild(typingEl);
        this.scrollChatToBottom(workspaceKey);

        setTimeout(() => {
          const indicator = document.getElementById(`${workspaceKey}TypingIndicator`);
          if (indicator) indicator.remove();

          this.store.addMessage(threadId, {
            text: replyText,
            senderRole: senderRole,
            senderName: senderName,
            type: 'standard'
          });

          this.renderAll();
          this.scrollChatToBottom(workspaceKey);
          this.showToast('Incoming Message Received', `${senderName}: "${replyText.substring(0, 45)}..."`, 'info');
        }, 800);
      } else {
        this.store.addMessage(threadId, {
          text: replyText,
          senderRole: senderRole,
          senderName: senderName,
          type: 'standard'
        });
        this.renderAll();
        this.scrollChatToBottom(workspaceKey);
      }
    }

    triggerAutoCareReply(workspaceKey, threadId, originalText) {
      if (workspaceKey !== 'patient') return;

      setTimeout(() => {
        let replyText = 'Thank you for your message, Olivia. Your clinical notes are reviewed and synchronized with your aesthetic treatment roadmap.';
        const lower = (originalText || '').toLowerCase();

        if (lower.includes('?') || lower.includes('can') || lower.includes('could') || lower.includes('how')) {
          replyText = 'Delighted to assist! Yes, we have factored that into your custom ceramic shading protocol. Feel free to bring any additional reference notes to our session.';
        } else if (lower.includes('pain') || lower.includes('hurt') || lower.includes('sensitive') || lower.includes('rinse')) {
          replyText = 'Understood, Olivia. Please continue with the soothing gentle rinse twice daily. If sensitivity persists, our concierge can prioritize an interim evaluation with Dr. Vance.';
        } else if (lower.includes('time') || lower.includes('date') || lower.includes('appointment') || lower.includes('valet')) {
          replyText = 'Our concierge desk has noted this for your upcoming visit at Suite IV. Complimentary valet parking and suite preparation are confirmed.';
        }

        const messagesAreaEl = document.getElementById('patientChatMessagesArea');
        if (messagesAreaEl) {
          const typingEl = document.createElement('div');
          typingEl.className = 'typing-indicator-wrapper';
          typingEl.id = 'patientAutoTypingIndicator';
          typingEl.innerHTML = `
            <div class="typing-dots"><span></span><span></span><span></span></div>
            <span class="typing-label">Dr. Alistair Vance is replying...</span>
          `;
          messagesAreaEl.appendChild(typingEl);
          this.scrollChatToBottom('patient');

          setTimeout(() => {
            const ind = document.getElementById('patientAutoTypingIndicator');
            if (ind) ind.remove();

            this.store.addMessage(threadId, {
              text: replyText,
              senderRole: 'doctor',
              senderName: 'Dr. Alistair Vance, DDS',
              type: 'standard'
            });

            this.renderAll();
            this.scrollChatToBottom('patient');
            this.showToast('New Incoming Message', `Dr. Alistair Vance: "${replyText.substring(0, 45)}..."`, 'info');
          }, 900);
        }
      }, 1100);
    }

    /* ----------------------------------------------------
       LightBox Preview for Attachments
    ---------------------------------------------------- */
    openPreview(url, filename, isPdf) {
      const modal = document.getElementById('previewModal');
      const content = document.getElementById('previewModalContent');
      if (!modal || !content) return;

      const safeUrl = url || '#';
      const safeFilename = filename || (isPdf ? 'Maison-Dental-Report.pdf' : 'Maison-Dental-Scan.png');

      if (isPdf) {
        content.innerHTML = `
          <div style="padding: 2rem; text-align: center;">
            <div style="width: 64px; height: 64px; border-radius: 50%; background: #FEE2E2; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
              <i data-lucide="file-text" style="width: 32px; height: 32px; color: #DC2626;"></i>
            </div>
            <h4 style="font-size: 1.25rem; margin-bottom: 0.4rem; color: var(--color-forest-dark);">${this.escapeHtml(safeFilename)}</h4>
            <p style="font-size: 0.82rem; color: #6F7D73; margin-bottom: 1.75rem;">
              Clinical Diagnostic PDF Document &bull; Verified Prototype Preview
            </p>
            <div style="display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap;">
              <a href="${this.escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="display: inline-flex; align-items: center; gap: 0.4rem;">
                <i data-lucide="external-link" style="width: 15px; height: 15px;"></i>
                <span>Open Document Viewer</span>
              </a>
              <a href="${this.escapeHtml(safeUrl)}" download="${this.escapeHtml(safeFilename)}" class="btn-gold" style="display: inline-flex; align-items: center; gap: 0.4rem;">
                <i data-lucide="download" style="width: 15px; height: 15px;"></i>
                <span>Download PDF</span>
              </a>
            </div>
          </div>
        `;
      } else {
        content.innerHTML = `
          <div style="padding: 1.25rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
              <h4 style="font-size: 1.15rem; color: var(--color-forest-dark); margin: 0;">${this.escapeHtml(safeFilename)}</h4>
              <a href="${this.escapeHtml(safeUrl)}" download="${this.escapeHtml(safeFilename)}" class="btn-secondary" style="font-size: 0.78rem; padding: 0.35rem 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                <i data-lucide="download" style="width: 13px; height: 13px;"></i>
                <span>Download</span>
              </a>
            </div>
            <div style="text-align: center; background: #0E1C14; border-radius: var(--radius-md); padding: 0.5rem; overflow: hidden;">
              <img src="${this.escapeHtml(safeUrl)}" alt="${this.escapeHtml(safeFilename)}" style="max-height: 480px; max-width: 100%; border-radius: 6px; object-fit: contain;">
            </div>
            <div style="margin-top: 0.75rem; font-size: 0.75rem; color: var(--color-ivory-muted); display: flex; justify-content: space-between;">
              <span>High-resolution clinical dental record</span>
              <span>Session Prototype</span>
            </div>
          </div>
        `;
      }

      modal.classList.add('active');
      this.renderIcons();
    }

    /* ----------------------------------------------------
       Reviews Rating and Submission
    ---------------------------------------------------- */
    setupStarRating() {
      const container = document.getElementById('starInputGroup');
      if (!container) return;

      const stars = container.querySelectorAll('.star-icon');
      const hiddenInput = document.getElementById('selectedStarRating');

      stars.forEach(star => {
        star.addEventListener('click', () => {
          const rating = parseInt(star.getAttribute('data-rating'), 10);
          if (hiddenInput) hiddenInput.value = rating;

          stars.forEach(s => {
            const r = parseInt(s.getAttribute('data-rating'), 10);
            s.classList.toggle('filled', r <= rating);
          });
        });
      });
    }

    handleReviewSubmit(event) {
      event.preventDefault();
      const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
      };

      const rating = getVal('selectedStarRating') || 5;
      const author = getVal('reviewAuthorName') || 'Clinic Patron';
      const service = getVal('reviewService') || 'Bespoke Consultation';
      const title = getVal('reviewHeadline');
      const content = getVal('reviewContent');

      if (!content || !title) {
        this.showToast('Incomplete Review', 'Please include both a headline and your feedback.', 'error');
        return;
      }

      this.store.addReview({
        author: author,
        rating: rating,
        service: service,
        title: title,
        content: content
      });

      const headlineEl = document.getElementById('reviewHeadline');
      if (headlineEl) headlineEl.value = '';
      const contentEl = document.getElementById('reviewContent');
      if (contentEl) contentEl.value = '';

      this.showToast('Review Published', 'Thank you. Your review is now visible across patient, doctor, and management workspaces.', 'success');
      this.renderAll();
    }

    /* ----------------------------------------------------
       Authentication & Demo Switcher
    ---------------------------------------------------- */
    openLoginModal() {
      const modal = document.getElementById('loginModal');
      if (modal) modal.classList.add('active');
    }

    closeModals() {
      document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
      });
    }

    toggleAuthTab(tabKey) {
      const signInBtn = document.getElementById('tabSignInBtn');
      const createBtn = document.getElementById('tabCreateAccountBtn');
      const signInForm = document.getElementById('signInForm');
      const createForm = document.getElementById('createAccountForm');

      if (tabKey === 'signin') {
        signInBtn.classList.add('active');
        createBtn.classList.remove('active');
        signInForm.style.display = 'block';
        createForm.style.display = 'none';
      } else {
        createBtn.classList.add('active');
        signInBtn.classList.remove('active');
        signInForm.style.display = 'none';
        createForm.style.display = 'block';
        this.updateCreateAccountView();
      }
    }

    setLoginRole(roleKey) {
      this.loginModalRole = roleKey;
      this.selectRole(roleKey);
      this.closeModals();
    }

    updateCreateAccountView() {
      const patientFields = document.getElementById('patientSignUpFields');
      const staffNotice = document.getElementById('staffSignUpNotice');

      if (this.loginModalRole === 'patient') {
        if (patientFields) patientFields.style.display = 'block';
        if (staffNotice) staffNotice.style.display = 'none';
      } else {
        if (patientFields) patientFields.style.display = 'none';
        if (staffNotice) staffNotice.style.display = 'block';
      }
    }

    fillDemoCredentials(roleKey) {
      const emailInput = document.getElementById('loginEmail');
      const passInput = document.getElementById('loginPassword');

      if (roleKey === 'patient') {
        if (emailInput) emailInput.value = 'olivia@maison.demo';
        if (passInput) passInput.value = 'Smile2026';
      } else if (roleKey === 'doctor') {
        if (emailInput) emailInput.value = 'doctor@maison.demo';
        if (passInput) passInput.value = 'Care2026';
      } else if (roleKey === 'management') {
        if (emailInput) emailInput.value = 'admin@maison.demo';
        if (passInput) passInput.value = 'Maison2026';
      }
    }

    handleSignInSubmit(event) {
      event.preventDefault();
      this.selectRole(this.loginModalRole);
      this.closeModals();
      this.showToast('Authentication Successful', `Welcome to the ${this.loginModalRole.toUpperCase()} workspace.`, 'success');
    }

    handleCreateAccountSubmit(event) {
      event.preventDefault();
      if (this.loginModalRole !== 'patient') {
        this.showToast('Administrative Provisioning', 'Clinician and management credentials are created exclusively by Clinic Administration.', 'info');
        return;
      }

      const nameEl = document.getElementById('signupName');
      const emailEl = document.getElementById('signupEmail');
      const name = nameEl ? nameEl.value : '';
      const email = emailEl ? emailEl.value : '';

      if (!name || !email) {
        this.showToast('Incomplete Account Details', 'Please enter your full name and email address.', 'error');
        return;
      }

      // Update patient profile
      this.store.data.currentUser = {
        id: 'user-patient-custom',
        role: 'patient',
        name: name,
        email: email,
        phone: '+1 (555) 789-9921',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80',
        title: 'Registered Patient',
        memberSince: 'Today',
        smileScore: 92
      };
      this.store.saveState();

      this.selectRole('patient');
      this.closeModals();
      this.showToast('Account Created', `Welcome to Maison Dental, ${name}.`, 'success');
    }

    handleForgotPassword(event) {
      event.preventDefault();
      this.showToast('Demo Password Assistance', 'Demo credentials: Patient (Smile2026), Doctor (Care2026), Management (Maison2026).', 'info');
    }

    /* ----------------------------------------------------
       Luxury Atelier Interactive Features
    ---------------------------------------------------- */
    selectShade(shadeCode) {
      const shades = {
        'BL1': {
          title: 'BL1 — Imperial Luminescence',
          badge: 'Master Choice',
          refraction: '1.52 (Natural Enamel Match)',
          translucency: '98% Light Permeability',
          image: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=600&q=80',
          desc: 'High-translucency micro-layered feldspathic porcelain delivering radiant, camera-ready brilliance while maintaining natural organic light refraction along the incisal edge.'
        },
        'BL2': {
          title: 'BL2 — Soft Pearl Luminescent',
          badge: 'Editorial Glow',
          refraction: '1.50 (Soft Warm Permeability)',
          translucency: '94% Light Permeability',
          image: 'https://images.unsplash.com/photo-1594824813583-a9d821217e46?auto=format&fit=crop&w=600&q=80',
          desc: 'Delicate pearlescent balance with a gentle warm halo. Ideal for natural ambient lighting and subtle facial harmony with zero artificial chalkiness.'
        },
        'OM1': {
          title: 'OM1 — Natural Enamel Translucent',
          badge: 'Biological Exact',
          refraction: '1.54 (Swiss Multi-layer)',
          translucency: '89% Light Permeability',
          image: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=600&q=80',
          desc: 'Biomimetic match to youthful virgin tooth enamel. Integrates micro-mamelons and natural developmental grooves for undetectable aesthetic integration.'
        },
        'OM2': {
          title: 'OM2 — Warm Ivory Vitality',
          badge: 'Warm Harmonic',
          refraction: '1.48 (Deep Dentin Harmony)',
          translucency: '85% Light Permeability',
          image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80',
          desc: 'Gentle ivory warmth crafted for dignified facial balance, subtle warmth, and seamless adjacent biological tooth color continuity.'
        }
      };

      const selected = shades[shadeCode];
      if (!selected) return;

      // Update active chip classes
      document.querySelectorAll('.shade-option-chip').forEach(chip => {
        chip.classList.toggle('active', chip.getAttribute('data-shade') === shadeCode);
      });

      // Update display box elements
      const badgeEl = document.getElementById('shadeBadgeLabel');
      const titleEl = document.getElementById('shadeTitle');
      const descEl = document.getElementById('shadeDescription');
      const refrEl = document.getElementById('shadeRefraction');
      const translEl = document.getElementById('shadeTranslucency');
      const imgEl = document.getElementById('shadePreviewImg');

      if (badgeEl) badgeEl.textContent = selected.badge;
      if (titleEl) titleEl.textContent = selected.title;
      if (descEl) descEl.textContent = selected.desc;
      if (refrEl) refrEl.textContent = selected.refraction;
      if (translEl) translEl.textContent = selected.translucency;
      if (imgEl) imgEl.src = selected.image;

      this.showToast('Porcelain Shade Selected', `Transmitted preference ${shadeCode} to Dr. Vance's atelier try-in tray.`, 'success');
    }

    requestConciergeService(serviceName) {
      this.showToast('Sanctuary Concierge Confirmed', `Your reservation for "${serviceName}" has been logged with Genevieve Laurent at the front desk.`, 'success');
      this.store.addNotification({
        title: 'Concierge Privilege Requested',
        message: `Sanctuary service "${serviceName}" scheduled for your Studio Suite visit.`,
        type: 'reminder'
      });
      this.renderNotifications();
    }

    /* ----------------------------------------------------
       Toast Notifications
    ---------------------------------------------------- */
    showToast(title, message, type = 'info') {
      const container = document.getElementById('toastContainer');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = 'toast';

      let icon = 'info';
      if (type === 'success') icon = 'check-circle';
      else if (type === 'error') icon = 'alert-triangle';

      toast.innerHTML = `
        <i data-lucide="${icon}" style="width: 20px; height: 20px; color: var(--color-gold); flex-shrink: 0;"></i>
        <div>
          <div style="font-weight: 600; color: #FAF7F2; margin-bottom: 2px;">${this.escapeHtml(title)}</div>
          <div style="font-size: 0.8rem; color: #CAD5CD; line-height: 1.35;">${this.escapeHtml(message)}</div>
        </div>
      `;

      container.appendChild(toast);
      this.renderIcons();

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 4200);
    }

    /* ----------------------------------------------------
       Utilities
    ---------------------------------------------------- */
    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  }

  // Bulletproof Application Launcher
  function startMaisonApp() {
    const root = (typeof window !== 'undefined') ? window :
                 (typeof globalThis !== 'undefined') ? globalThis :
                 (typeof self !== 'undefined') ? self : this;
    if (!root) return null;

    if (!root.maisonStore && typeof MaisonState !== 'undefined') {
      try {
        root.maisonStore = new MaisonState();
      } catch (e) {
        console.warn('Could not auto-create store in startMaisonApp:', e);
      }
    }

    if (!root.maisonApp) {
      try {
        root.maisonApp = new MaisonApp();
      } catch (e) {
        console.error('Fatal: Failed to instantiate MaisonApp:', e);
        if (typeof document !== 'undefined') {
          const errEl = document.getElementById('maisonAppFatalError');
          const msgEl = document.getElementById('maisonAppErrorMessage');
          if (errEl) {
            errEl.style.display = 'block';
            if (msgEl) msgEl.textContent = e.message || String(e);
          }
        }
      }
    }
    return root.maisonApp;
  }

  // Export class globally
  const root = (typeof window !== 'undefined') ? window :
               (typeof globalThis !== 'undefined') ? globalThis :
               (typeof self !== 'undefined') ? self : this;
  if (root) {
    root.MaisonApp = MaisonApp;
    root.startMaisonApp = startMaisonApp;
  }

  // Synchronously initialize MaisonApp so window.maisonApp is always available
  startMaisonApp();

})();

