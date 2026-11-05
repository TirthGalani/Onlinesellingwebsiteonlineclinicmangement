/* =============================================================
   Maison Dental — Public clinic website interactions
   ============================================================= */

(function () {
  'use strict';

  /* Replace these with the clinic's real details before publishing. */
  const CLINIC = {
    phoneDisplay: '+1 (212) 555-0199',
    phoneHref: '+12125550199',
    whatsapp: '12125550199',
    email: 'concierge@maisondental.demo',
    address: '450 Madison Avenue, New York, NY 10022'
  };

  const $ = (selector, scope) => (scope || document).querySelector(selector);
  const $$ = (selector, scope) => Array.from((scope || document).querySelectorAll(selector));

  // Shared JSON transport for the public clinic API. A non-2xx response throws with
  // the server message so each caller can show one consistent error path.
  function fetchJson(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 8000);
    return fetch(url, Object.assign({ signal: controller.signal }, options || {}))
      .then(response => response.json().catch(() => ({})).then(data => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) {
          const error = new Error(data.error || 'The clinic service is unavailable.');
          error.status = response.status;
          error.payload = data;
          throw error;
        }
        return data;
      })
      .finally(() => clearTimeout(timer));
  }

  function initIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function initYear() {
    $$('[data-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });
  }

  function initHeaderScroll() {
    const header = $('.site-header');
    if (!header) return;
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function initDrawer() {
    const drawer = $('#mobileDrawer');
    const backdrop = $('#drawerBackdrop');
    const openBtn = $('#navToggle');
    const closeBtn = $('#drawerClose');
    if (!drawer || !openBtn) return;

    let lastFocus = null;

    const open = () => {
      lastFocus = document.activeElement;
      drawer.classList.add('is-open');
      if (backdrop) backdrop.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      openBtn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('no-scroll');
      if (closeBtn) closeBtn.focus();
    };

    const close = () => {
      drawer.classList.remove('is-open');
      if (backdrop) backdrop.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      openBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('no-scroll');
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    };

    openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);
    $$('a', drawer).forEach(link => link.addEventListener('click', close));

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && drawer.classList.contains('is-open')) close();
      if (event.key === 'Tab' && drawer.classList.contains('is-open')) {
        const focusable = $$('a[href], button:not([disabled])', drawer);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  function initReveal() {
    const items = $$('.reveal');
    if (!items.length) return;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(item => item.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    items.forEach(item => observer.observe(item));
  }

  function initFaqs() {
    $$('.faq-item').forEach(item => {
      const button = $('.faq-question', item);
      if (!button) return;
      button.addEventListener('click', () => {
        const isOpen = item.classList.contains('is-open');
        const group = item.closest('.faq-list');
        if (group) {
          $$('.faq-item.is-open', group).forEach(openItem => {
            if (openItem !== item) {
              openItem.classList.remove('is-open');
              const openButton = $('.faq-question', openItem);
              if (openButton) openButton.setAttribute('aria-expanded', 'false');
            }
          });
        }
        item.classList.toggle('is-open', !isOpen);
        button.setAttribute('aria-expanded', String(!isOpen));
      });
    });
  }

  function initTabs() {
    $$('[data-tabs]').forEach(group => {
      const buttons = $$('.info-tab', group);
      const panels = $$('.info-panel', group);

      const activate = (target, focus) => {
        buttons.forEach(button => {
          const active = button.dataset.tabTarget === target;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-selected', String(active));
          button.tabIndex = active ? 0 : -1;
          if (active && focus) button.focus();
        });
        panels.forEach(panel => {
          const active = panel.id === target;
          panel.classList.toggle('is-active', active);
          panel.hidden = !active;
        });
      };

      buttons.forEach((button, index) => {
        button.addEventListener('click', () => activate(button.dataset.tabTarget, false));
        button.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          let next = index;
          if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
          if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = buttons.length - 1;
          activate(buttons[next].dataset.tabTarget, true);
        });
      });

      const initial = buttons.find(button => button.classList.contains('is-active')) || buttons[0];
      if (initial) activate(initial.dataset.tabTarget, false);

      const activateFromHash = () => {
        const target = window.location.hash.replace('#', '');
        if (!target) return;
        const button = buttons.find(item => item.dataset.tabTarget === target);
        if (!button) return;
        activate(target, false);
        window.requestAnimationFrame(() => {
          const panel = document.getElementById(target);
          if (panel) panel.scrollIntoView({ block: 'start' });
        });
      };

      activateFromHash();
      window.addEventListener('hashchange', activateFromHash);
    });

    document.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const target = link.getAttribute('href').slice(1);
      const tab = document.querySelector('.info-tab[data-tab-target="' + target + '"]');
      if (tab) tab.click();
    });
  }

  function initGallery() {
    const grid = $('#galleryGrid');
    if (!grid) return;
    const filters = $$('.gallery-filter');
    const items = $$('.gallery-item', grid);

    filters.forEach(button => {
      button.addEventListener('click', () => {
        const filter = button.dataset.filter || 'all';
        filters.forEach(other => {
          const active = other === button;
          other.classList.toggle('is-active', active);
          other.setAttribute('aria-pressed', String(active));
        });
        items.forEach(item => {
          const categories = (item.dataset.category || '').split(/\s+/);
          const show = filter === 'all' || categories.includes(filter);
          item.hidden = !show;
        });
      });
    });

    initLightbox(items);
  }

  function initLightbox(items) {
    if (!items.length) return;
    const lightbox = $('#lightbox');
    if (!lightbox) return;
    const image = $('#lightboxImage');
    const title = $('#lightboxTitle');
    const subtitle = $('#lightboxSubtitle');
    const closeBtn = $('#lightboxClose');
    const prevBtn = $('#lightboxPrev');
    const nextBtn = $('#lightboxNext');
    let current = 0;
    let lastFocus = null;

    const visibleItems = () => items.filter(item => !item.hidden);

    const render = () => {
      const list = visibleItems();
      if (!list.length) return;
      if (current < 0) current = list.length - 1;
      if (current >= list.length) current = 0;
      const item = list[current];
      const img = $('img', item);
      if (img) {
        image.src = img.dataset.full || img.src;
        image.alt = img.alt || '';
      }
      if (title) title.textContent = item.dataset.title || '';
      if (subtitle) subtitle.textContent = item.dataset.caption || '';
      const multiple = list.length > 1;
      if (prevBtn) prevBtn.hidden = !multiple;
      if (nextBtn) nextBtn.hidden = !multiple;
    };

    const open = item => {
      lastFocus = document.activeElement;
      const list = visibleItems();
      current = Math.max(0, list.indexOf(item));
      render();
      lightbox.classList.add('is-open');
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
      if (closeBtn) closeBtn.focus();
    };

    const close = () => {
      lightbox.classList.remove('is-open');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    };

    items.forEach(item => {
      item.addEventListener('click', () => open(item));
    });

    if (closeBtn) closeBtn.addEventListener('click', close);
    lightbox.addEventListener('click', event => {
      if (event.target === lightbox) close();
    });
    if (prevBtn) prevBtn.addEventListener('click', () => { current -= 1; render(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { current += 1; render(); });

    document.addEventListener('keydown', event => {
      if (!lightbox.classList.contains('is-open')) return;
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') { current -= 1; render(); }
      if (event.key === 'ArrowRight') { current += 1; render(); }
    });
  }

  function initVideoCards() {    $$('.video-card').forEach(card => {
      card.addEventListener('click', () => {
        showToast(card.dataset.videoMessage || 'Video testimonial coming soon. Patient consent is being finalised.');
      });
    });
  }

  let toastTimer = null;
  function showToast(message) {
    let toast = $('#siteToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'siteToast';
      toast.className = 'site-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 4200);
  }

  function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function setError(field, message) {
    const wrapper = field.closest('.form-field') || field.parentElement;
    const error = wrapper ? $('.field-error', wrapper) : null;
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (error) error.textContent = message || '';
  }

  /* Live booking: open slots come from the clinic API. When the API is not reachable
     the form keeps the original WhatsApp request flow so the page still works. */
  function createLiveBooking(form) {
    const state = {
      active: false,
      days: [],
      slots: [],
      selected: { date: '', start: '', time: '', clinician: '', clinicianId: '', durationMinutes: 0 },
      nodes: {
        field: $('#slotField'),
        days: $('#slotDays'),
        times: $('#slotTimes'),
        status: $('#slotStatus'),
        error: $('#slotError'),
        refresh: $('#slotRefresh'),
        manualDate: $('#manualDateField'),
        manualTime: $('#manualTimeField')
      }
    };
    if (!state.nodes.field || !state.nodes.days || !state.nodes.times) return state;

    const setBusy = message => {
      state.nodes.status.hidden = !message;
      if (message) state.nodes.status.textContent = message;
    };

    const clearError = () => {
      state.nodes.error.textContent = '';
    };

    const timeLabel = value => {
      const [hour, minute] = String(value || '00:00').split(':').map(Number);
      const suffix = hour >= 12 ? 'PM' : 'AM';
      const display = hour % 12 === 0 ? 12 : hour % 12;
      return `${display}:${String(minute).padStart(2, '0')} ${suffix}`;
    };

    const dayLabel = dateOnly => new Date(`${dateOnly}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });

    const loadSlots = dateOnly => {
      state.selected = { date: dateOnly, start: '', time: '', clinician: '', clinicianId: '', durationMinutes: 0 };
      state.nodes.times.innerHTML = '';
      setBusy('Checking open times…');
      return fetchJson(`/api/public/availability?date=${encodeURIComponent(dateOnly)}`, { headers: { Accept: 'application/json' } }, 9000)
        .then(data => {
          state.slots = Array.isArray(data.slots) ? data.slots : [];
          setBusy('');
          if (!state.slots.length) {
            const empty = document.createElement('p');
            empty.className = 'slot-empty';
            empty.textContent = 'No open times left on this day. Try another day, or call the clinic and we will look for a cancellation.';
            state.nodes.times.appendChild(empty);
            return;
          }
          state.slots.forEach(slot => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'slot-time';
            const label = document.createElement('span');
            label.textContent = timeLabel(slot.time);
            const detail = document.createElement('small');
            detail.textContent = `${slot.clinician} · ${slot.durationMinutes} min`;
            button.append(label, detail);
            button.addEventListener('click', () => {
              state.selected = {
                date: dateOnly,
                start: slot.start,
                time: slot.time,
                clinician: slot.clinician,
                clinicianId: slot.clinicianId,
                durationMinutes: slot.durationMinutes
              };
              $$('.slot-time', state.nodes.times).forEach(item => item.classList.remove('is-selected'));
              button.classList.add('is-selected');
              button.setAttribute('aria-pressed', 'true');
              clearError();
            });
            state.nodes.times.appendChild(button);
          });
        })
        .catch(error => {
          setBusy('');
          const empty = document.createElement('p');
          empty.className = 'slot-empty';
          empty.textContent = error && error.message ? error.message : 'Open times could not be loaded. Please call the clinic.';
          state.nodes.times.appendChild(empty);
        });
    };

    const selectDay = dayButton => {
      $$('.slot-day', state.nodes.days).forEach(item => {
        item.classList.remove('is-selected');
        item.setAttribute('aria-pressed', 'false');
      });
      dayButton.classList.add('is-selected');
      dayButton.setAttribute('aria-pressed', 'true');
      clearError();
      return loadSlots(dayButton.dataset.date);
    };

    return fetchJson('/api/public/availability?clinicians=1', { headers: { Accept: 'application/json' } }, 4000)
      .then(config => {
        if (!config || !Array.isArray(config.clinicians) || !config.clinicians.length) return state;
        state.active = true;
        state.nodes.field.hidden = false;
        if (state.nodes.manualDate) state.nodes.manualDate.hidden = true;
        if (state.nodes.manualTime) state.nodes.manualTime.hidden = true;

        const intro = $('#bookingIntro');
        if (intro) intro.innerHTML = 'Fields marked <span style="color: var(--blue);">*</span> are required. Choose a real open time and your appointment is confirmed instantly.';
        const footnote = $('#bookingFootnote');
        if (footnote) footnote.textContent = 'Online booking shows the clinic’s live calendar. Nothing is charged here, and you can reschedule by calling the clinic.';
        const submitLabel = $('#bookingSubmit');
        if (submitLabel) submitLabel.querySelector('span').textContent = 'Confirm My Appointment';

        setBusy('Loading the clinic calendar…');
        return fetchJson(`/api/public/availability?date=${encodeURIComponent(config.today)}&calendar=1&span=14`, { headers: { Accept: 'application/json' } }, 12000)
          .then(calendar => {
            state.days = Array.isArray(calendar.days) ? calendar.days : [];
            state.nodes.days.innerHTML = '';
            let firstOpen = null;
            state.days.forEach(day => {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'slot-day' + (day.openCount ? '' : ' is-closed');
              button.dataset.date = day.date;
              button.setAttribute('aria-pressed', 'false');
              const weekday = document.createElement('span');
              weekday.textContent = dayLabel(day.date);
              const number = document.createElement('strong');
              number.textContent = String(Number(day.date.slice(8)) || '');
              const count = document.createElement('em');
              count.textContent = day.openCount ? `${day.openCount} open` : 'Closed';
              button.append(weekday, number, count);
              button.addEventListener('click', () => {
                if (!day.openCount) return;
                selectDay(button);
              });
              if (!firstOpen && day.openCount) firstOpen = button;
              state.nodes.days.appendChild(button);
            });
            if (firstOpen) {
              selectDay(firstOpen);
            } else {
              setBusy('');
              state.nodes.times.innerHTML = '';
              const empty = document.createElement('p');
              empty.className = 'slot-empty';
              empty.textContent = 'The clinic has not published open times for the next two weeks. Please call us and we will arrange a visit.';
              state.nodes.times.appendChild(empty);
            }
            if (state.nodes.refresh) {
              state.nodes.refresh.hidden = false;
              state.nodes.refresh.addEventListener('click', () => {
                if (state.selected.date) loadSlots(state.selected.date);
              });
            }
            return state;
          });
      })
      .catch(() => state);
  }

  function completeLiveBooking(form, live) {
    const payload = {
      name: form.elements.fullName.value.trim(),
      phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      service: form.elements.service.value,
      notes: form.elements.notes.value.trim(),
      date: live.selected.date,
      time: live.selected.time,
      clinicianId: live.selected.clinicianId,
      consent: true,
      companyWebsite: form.elements.companyWebsite ? form.elements.companyWebsite.value : '',
      confirmEmail: form.elements.confirmEmail ? form.elements.confirmEmail.value : ''
    };

    const submit = $('#bookingSubmit');
    if (submit) submit.disabled = true;

    return fetchJson('/api/public/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    }, 12000)
      .then(data => {
        const appointment = data.appointment || {};
        const success = $('#bookingSuccess');
        const title = $('#bookingSuccessTitle');
        const body = $('#bookingSuccessBody');
        const reference = $('#bookingReference');
        if (title) title.textContent = 'Appointment confirmed — reference';
        if (reference) reference.textContent = appointment.reference || '—';
        if (body) {
          body.textContent = `${appointment.service} with ${appointment.clinician} on ${appointment.when}. `
            + 'The clinic has been notified. Add it to your calendar, or send the details to us on WhatsApp.';
        }
        const whatsapp = $('#bookingWhatsApp');
        if (whatsapp) {
          whatsapp.href = 'https://wa.me/' + CLINIC.whatsapp + '?text=' + encodeURIComponent(data.summary || '');
          whatsapp.hidden = false;
        }
        const calendarButton = $('#bookingCalendar');
        if (calendarButton && appointment.startsAt) {
          calendarButton.hidden = false;
          calendarButton.onclick = () => downloadIcs(appointment, payload);
        }
        if (success) {
          success.classList.add('is-visible');
          success.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        showToast('Confirmed: ' + (appointment.reference || '') + ' — see you on ' + (appointment.when || ''));
        form.reset();
        live.selected = { date: live.selected.date, start: '', time: '', clinician: '', clinicianId: '', durationMinutes: 0 };
        $$('.slot-time', live.nodes.times).forEach(item => item.classList.remove('is-selected'));
        return true;
      })
      .catch(error => {
        if (error && (error.status === 409 || error.status === 400) && error.payload && Array.isArray(error.payload.availableSlots)) {
          live.slots = error.payload.availableSlots;
          live.nodes.times.innerHTML = '';
          live.slots.forEach(slot => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'slot-time';
            const label = document.createElement('span');
            label.textContent = slot.time;
            const detail = document.createElement('small');
            detail.textContent = slot.clinician || 'Clinic team';
            button.append(label, detail);
            button.addEventListener('click', () => {
              live.selected = {
                date: live.selected.date,
                start: slot.start,
                time: slot.time,
                clinician: slot.clinician,
                clinicianId: slot.clinicianId,
                durationMinutes: slot.durationMinutes || 60
              };
              $$('.slot-time', live.nodes.times).forEach(item => item.classList.remove('is-selected'));
              button.classList.add('is-selected');
            });
            live.nodes.times.appendChild(button);
          });
        }
        if (live.nodes.error) {
          live.nodes.error.textContent = (error && error.message) || 'That time is no longer available.';
        }
        showToast((error && error.message) || 'The clinic could not confirm that time. Please try again.');
        return false;
      })
      .finally(() => {
        if (submit) submit.disabled = false;
      });
  }

  function downloadIcs(appointment, payload) {
    const pad = value => String(value).padStart(2, '0');
    const compact = iso => {
      const date = new Date(iso);
      return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
    };
    const start = new Date(appointment.startsAt);
    const end = new Date(start.getTime() + (Number(appointment.durationMinutes) || 60) * 60000);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Maison Dental//Website//EN',
      'BEGIN:VEVENT',
      `UID:${appointment.reference}@maisondental`,
      `DTSTAMP:${compact(new Date().toISOString())}`,
      `DTSTART:${compact(appointment.startsAt)}`,
      `DTEND:${compact(end.toISOString())}`,
      `SUMMARY:${appointment.service} with ${appointment.clinician}`,
      `DESCRIPTION:Reference ${appointment.reference}. Please arrive five minutes early.`,
      `LOCATION:${CLINIC.address}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `maison-dental-${appointment.reference}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Calendar file downloaded.');
  }

  /* Verified patient reviews replace the demo cards as soon as the clinic API has
     published reviews to show. Nothing is invented on the client. */
  function initLiveReviews() {
    const grid = $('#liveReviews');
    const summary = $('#liveRating');
    if (!grid || !summary) return;

    fetchJson('/api/public/reviews?limit=12', { headers: { Accept: 'application/json' } }, 7000)
      .then(data => {
        const reviews = Array.isArray(data.reviews) ? data.reviews : [];
        if (!reviews.length) return;

        grid.innerHTML = '';
        reviews.forEach(review => {
          const card = document.createElement('article');
          card.className = 'quote-card is-visible';

          const mark = document.createElement('span');
          mark.className = 'quote-mark';
          mark.setAttribute('aria-hidden', 'true');
          mark.textContent = '“';

          const stars = document.createElement('span');
          stars.className = 'stars';
          stars.setAttribute('aria-label', `${review.rating} out of 5 stars`);
          for (let index = 0; index < 5; index += 1) {
            const icon = document.createElement('i');
            icon.setAttribute('data-lucide', 'star');
            if (index >= review.rating) icon.style.opacity = '0.25';
            stars.appendChild(icon);
          }

          const quote = document.createElement('blockquote');
          quote.textContent = review.content;

          const footer = document.createElement('footer');
          const initials = document.createElement('span');
          initials.className = 'avatar-initials';
          initials.setAttribute('aria-hidden', 'true');
          initials.textContent = String(review.author || 'P').split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
          const who = document.createElement('div');
          const name = document.createElement('strong');
          name.textContent = review.author;
          const meta = document.createElement('span');
          meta.textContent = `${review.service} · Verified visit`;
          who.append(name, meta);
          footer.append(initials, who);

          card.append(mark, stars, quote, footer);
          grid.appendChild(card);
        });

        summary.innerHTML = '';
        const ratingBig = document.createElement('div');
        ratingBig.className = 'rating-big';
        const value = document.createElement('strong');
        value.textContent = String(data.summary.average);
        const outOf = document.createElement('span');
        outOf.textContent = '/ 5';
        ratingBig.append(value, outOf);

        const copy = document.createElement('div');
        copy.className = 'rating-summary-copy';
        const starsRow = document.createElement('span');
        starsRow.className = 'stars';
        starsRow.setAttribute('aria-label', `Rated ${data.summary.average} out of 5`);
        for (let index = 0; index < 5; index += 1) {
          const icon = document.createElement('i');
          icon.setAttribute('data-lucide', 'star');
          starsRow.appendChild(icon);
        }
        const note = document.createElement('p');
        note.textContent = `Based on ${data.summary.count} verified patient review${data.summary.count === 1 ? '' : 's'} from completed visits in the clinic portal.`;
        copy.append(starsRow, note);
        summary.append(ratingBig, copy);

        const disclaimer = $('#demoDisclaimer');
        if (disclaimer) disclaimer.hidden = true;
        initIcons();
      })
      .catch(() => { /* keep the demo reviews when the API is unavailable */ });
  }

  /* Consented before/after cases come from the clinic library. Placeholder panels
     stay visible until the clinic publishes real, consented photography. */
  function initLiveCases() {
    const grid = $('#liveCases');
    if (!grid) return;

    fetchJson('/api/public/cases?limit=12', { headers: { Accept: 'application/json' } }, 7000)
      .then(data => {
        const cases = Array.isArray(data.cases) ? data.cases : [];
        if (!cases.length) return;

        grid.innerHTML = '';
        cases.forEach(record => {
          const card = document.createElement('article');
          card.className = 'result-card is-visible';

          const pair = document.createElement('div');
          pair.className = 'result-pair';
          [['Before', record.beforeUrl], ['After', record.afterUrl]].forEach(([labelName, url]) => {
            const pane = document.createElement('div');
            pane.className = 'result-pane';
            const label = document.createElement('span');
            label.className = 'result-label';
            label.textContent = labelName;
            const image = document.createElement('img');
            image.src = url;
            image.alt = `${labelName} photograph for ${record.title}`;
            image.loading = 'lazy';
            pane.append(label, image);
            pair.appendChild(pane);
          });

          const body = document.createElement('div');
          body.className = 'result-body';
          const title = document.createElement('h3');
          title.textContent = record.title;
          const summary = document.createElement('p');
          summary.textContent = `${record.treatment} with ${record.clinician}. ${record.summary || ''}`.trim();
          const tag = document.createElement('span');
          tag.className = 'result-tag';
          tag.textContent = 'Consent on file';
          body.append(title, summary, tag);

          card.append(pair, body);
          grid.appendChild(card);
        });

        const policy = $('#consentPolicyText');
        if (policy) {
          policy.innerHTML = '';
          const lead = document.createElement('strong');
          lead.textContent = 'Consent policy: ';
          const text = document.createElement('span');
          text.textContent = `before/after photographs are published only with the patient's informed written consent and are never edited to exaggerate a result. ${cases.length} case${cases.length === 1 ? '' : 's'} currently shown.`;
          policy.append(lead, text);
        }
      })
      .catch(() => { /* keep the consent placeholders when the API is unavailable */ });
  }

  function initBookingForm() {
    const form = $('#bookingForm');
    if (!form) return;
    const success = $('#bookingSuccess');
    const dateField = form.elements.preferredDate;
    if (dateField) dateField.min = new Date().toISOString().split('T')[0];

    const params = new URLSearchParams(window.location.search);
    const requestedService = params.get('service');
    if (requestedService) {
      const option = Array.from(form.elements.service.options).find(item => item.value.toLowerCase() === requestedService.toLowerCase());
      if (option) form.elements.service.value = option.value;
    }

    let live = createLiveBooking(form);
    live.then(configured => { live = configured; });

    form.addEventListener('submit', event => {
      event.preventDefault();
      let valid = true;

      const name = form.elements.fullName;
      const phone = form.elements.phone;
      const email = form.elements.email;
      const service = form.elements.service;
      const date = form.elements.preferredDate;
      const time = form.elements.preferredTime;
      const consent = form.elements.consent;

      if (!name.value.trim() || name.value.trim().length < 2) {
        setError(name, 'Please enter your full name.');
        valid = false;
      } else setError(name, '');

      if (digitsOnly(phone.value).length < 7) {
        setError(phone, 'Enter a phone number with at least 7 digits.');
        valid = false;
      } else setError(phone, '');

      if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) {
        setError(email, 'Enter a valid email address.');
        valid = false;
      } else setError(email, '');

      if (!service.value) {
        setError(service, 'Choose the service you are interested in.');
        valid = false;
      } else setError(service, '');

      if (live.active) {
        if (!live.selected.start) {
          if (live.nodes.error) live.nodes.error.textContent = 'Choose an open time from the clinic calendar.';
          valid = false;
        } else if (live.nodes.error) {
          live.nodes.error.textContent = '';
        }
      } else {
        if (!date.value) {
          setError(date, 'Choose a preferred date.');
          valid = false;
        } else if (date.value < date.min) {
          setError(date, 'Please choose today or a future date.');
          valid = false;
        } else setError(date, '');

        if (!time.value) {
          setError(time, 'Choose a preferred time.');
          valid = false;
        } else setError(time, '');
      }

      if (!consent.checked) {
        setError(consent, 'Please confirm we may contact you about this request.');
        valid = false;
      } else setError(consent, '');

      if (!valid) {
        const firstInvalid = form.querySelector('[aria-invalid="true"]');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      if (live.active) {
        completeLiveBooking(form, live);
        return;
      }

      const reference = 'MD-' + date.value.replace(/-/g, '').slice(2) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      const patientType = form.elements.patientType.value || 'New patient';
      const notes = form.elements.notes.value.trim();

      const request = {
        reference,
        name: name.value.trim(),
        phone: phone.value.trim(),
        email: email.value.trim(),
        service: service.value,
        date: date.value,
        time: time.value,
        patientType,
        notes,
        createdAt: new Date().toISOString()
      };

      try {
        const existing = JSON.parse(localStorage.getItem('maison_public_requests') || '[]');
        existing.push(request);
        localStorage.setItem('maison_public_requests', JSON.stringify(existing.slice(-20)));
      } catch (error) {
        /* Local storage can be unavailable in private modes; the request still continues. */
      }

      const summary = [
        'Hello Maison Dental, I would like to request an appointment.',
        'Reference: ' + reference,
        'Name: ' + request.name,
        'Phone: ' + request.phone,
        request.email ? 'Email: ' + request.email : '',
        'Service: ' + request.service,
        'Preferred: ' + request.date + ' at ' + request.time,
        'Patient: ' + patientType,
        notes ? 'Notes: ' + notes : ''
      ].filter(Boolean).join('\n');

      const waLink = $('#bookingWhatsApp');
      if (waLink) {
        waLink.href = 'https://wa.me/' + CLINIC.whatsapp + '?text=' + encodeURIComponent(summary);
      }

      if (success) {
        const refEl = $('#bookingReference');
        if (refEl) refEl.textContent = reference;
        success.classList.add('is-visible');
        success.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      showToast('Request prepared — reference ' + reference + '. The clinic will confirm by phone or WhatsApp.');
      form.reset();
      if (dateField) dateField.min = new Date().toISOString().split('T')[0];
    });

    form.addEventListener('input', event => {
      if (event.target.matches('input, select, textarea') && event.target.getAttribute('aria-invalid') === 'true') {
        setError(event.target, '');
      }
    });
  }

  function initContactForm() {
    const form = $('#contactForm');
    if (!form) return;
    const feedback = $('#contactFeedback');

    form.addEventListener('submit', event => {
      event.preventDefault();
      let valid = true;

      const name = form.elements.name;
      const email = form.elements.email;
      const message = form.elements.message;

      if (!name.value.trim()) {
        setError(name, 'Please enter your name.');
        valid = false;
      } else setError(name, '');

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) {
        setError(email, 'Enter a valid email address.');
        valid = false;
      } else setError(email, '');

      if (!message.value.trim() || message.value.trim().length < 10) {
        setError(message, 'Please add a short message (at least 10 characters).');
        valid = false;
      } else setError(message, '');

      if (!valid) {
        const firstInvalid = form.querySelector('[aria-invalid="true"]');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      const subject = 'Website enquiry from ' + name.value.trim();
      const body = [
        'Name: ' + name.value.trim(),
        'Email: ' + email.value.trim(),
        'Phone: ' + (form.elements.phone.value.trim() || 'Not provided'),
        '',
        message.value.trim()
      ].join('\n');

      const mailto = 'mailto:' + CLINIC.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      window.location.href = mailto;

      if (feedback) {
        feedback.textContent = 'Your email app should open with the message ready to send. If it does not, please call ' + CLINIC.phoneDisplay + ' or message us on WhatsApp.';
        feedback.classList.add('is-visible');
      }
      showToast('Opening your email app with the message ready to send.');
    });
  }

  function initSmoothAnchors() {
    $$('a[href^="#"]').forEach(link => {
      link.addEventListener('click', event => {
        const targetId = link.getAttribute('href');
        if (!targetId || targetId === '#') return;
        const target = document.querySelector(targetId);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', targetId);
      });
    });
  }

  function init() {
    initIcons();
    initYear();
    initHeaderScroll();
    initDrawer();
    initReveal();
    initFaqs();
    initTabs();
    initGallery();
    initVideoCards();
    initLiveReviews();
    initLiveCases();
    initBookingForm();
    initContactForm();
    initSmoothAnchors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MaisonSite = { showToast, clinic: CLINIC };
})();
