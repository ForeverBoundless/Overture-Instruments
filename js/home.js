(() => {
  'use strict';

  const year = document.getElementById('copyright-year');
  if (year) year.textContent = String(new Date().getFullYear());

  // Staggered reveal on scroll, with a graceful fallback for older browsers.
  const revealItems = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -25px 0px'
    });

    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  // Deep links (#omni etc.): the browser scrolls before fonts/images settle, so
  // re-align to the target once layout is final. Instant on load, smooth after.
  const scrollToHash = (smooth) => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    const top = id === 'top' ? 0 : target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  };

  if (window.location.hash) {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    document.documentElement.style.scrollBehavior = 'auto';
    const settle = () => scrollToHash(false);
    settle();
    requestAnimationFrame(settle);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
    window.addEventListener('load', () => {
      settle();
      setTimeout(() => { settle(); document.documentElement.style.scrollBehavior = ''; }, 150);
    }, { once: true });
  }

  window.addEventListener('hashchange', () => scrollToHash(true));

  // Hero responds gently to pointer movement without shifting page layout.
  const hero = document.querySelector('.hero');
  const heroMark = document.querySelector('.hero-mark-wrap');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (hero && heroMark && finePointer.matches && !reduceMotion.matches) {
    hero.addEventListener('pointermove', (event) => {
      const bounds = hero.getBoundingClientRect();

      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;

      heroMark.style.setProperty('--mx', `${(x * 13).toFixed(2)}px`);
      heroMark.style.setProperty('--my', `${(y * 10).toFixed(2)}px`);

      hero.style.setProperty('--pointer-x', `${(x + 0.5) * 100}%`);
      hero.style.setProperty('--pointer-y', `${(y + 0.5) * 100}%`);
    }, { passive: true });

    hero.addEventListener('pointerleave', () => {
      heroMark.style.setProperty('--mx', '0px');
      heroMark.style.setProperty('--my', '0px');
    });
  }

  // Lightweight 3D tilt for feature panels. It is intentionally subtle.
  const tiltPanels = document.querySelectorAll('[data-tilt]');

  if (finePointer.matches && !reduceMotion.matches) {
    tiltPanels.forEach((panel) => {
      panel.addEventListener('pointermove', (event) => {
        const rect = panel.getBoundingClientRect();

        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;

        const rotateY = (x - 0.5) * 2.3;
        const rotateX = (0.5 - y) * 2.1;

        panel.style.transform =
          `perspective(1100px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
      }, { passive: true });

      panel.addEventListener('pointerleave', () => {
        panel.style.transform = '';
      });
    });
  }

  // Mobile navigation toggle.
  const nav = document.getElementById('main-nav');
  const menuToggle = document.querySelector('.menu-toggle');

  const closeMenu = () => {
    if (!nav || !menuToggle) return;

    nav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation');
  };

  if (nav && menuToggle) {
    menuToggle.addEventListener('click', () => {
      const opening = menuToggle.getAttribute('aria-expanded') !== 'true';

      menuToggle.setAttribute('aria-expanded', String(opening));
      menuToggle.setAttribute(
        'aria-label',
        opening ? 'Close navigation' : 'Open navigation'
      );

      nav.classList.toggle('is-open', opening);
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });

    document.addEventListener('click', (event) => {
      if (!nav.classList.contains('is-open')) return;

      if (nav.contains(event.target) || menuToggle.contains(event.target)) {
        return;
      }

      closeMenu();
    });
  }

  // The About destination is a future page, while OMNI and Experiments are in development.
  // Temporary buttons show an inline status instead of navigating nowhere.
  const toast = document.getElementById('site-toast');
  let toastTimer = 0;

  const showToast = (message) => {
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('is-visible');

    window.clearTimeout(toastTimer);

    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 3400);
  };

  document.querySelectorAll('[data-coming-soon]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      showToast(
        link.getAttribute('data-coming-soon') ||
        'This section is coming soon.'
      );
    });
  });

  // Smoothly update the small progress line at the very top of the page.
  const progressBar = document.getElementById('scroll-progress-bar');
  let progressScheduled = false;

  const updateProgress = () => {
    if (!progressBar) return;

    const scrollable =
      document.documentElement.scrollHeight - window.innerHeight;

    const progress = scrollable > 0
      ? (window.scrollY / scrollable) * 100
      : 0;

    progressBar.style.width =
      `${Math.min(100, Math.max(0, progress))}%`;

    progressScheduled = false;
  };

  window.addEventListener('scroll', () => {
    if (progressScheduled) return;

    progressScheduled = true;
    window.requestAnimationFrame(updateProgress);
  }, { passive: true });

  window.addEventListener('resize', updateProgress, { passive: true });

  updateProgress();
})();
// Contact modal
(() => {
  const modal = document.getElementById('contact-modal');
  const form = document.getElementById('contact-form');
  const openBtn = document.getElementById('contact-open');
  if (!modal || !form || !openBtn) return;

  const body = form.elements.body;
  let lastFocus = null;

  const open = () => { lastFocus = document.activeElement; modal.hidden = false; document.body.style.overflow = 'hidden'; form.elements.name.focus(); };
  const close = () => { modal.hidden = true; document.body.style.overflow = ''; if (lastFocus) lastFocus.focus(); };

  openBtn.addEventListener('click', open);
  modal.querySelectorAll('[data-contact-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  // Markup toolbar: wrap selection or prefix selected lines.
  const edit = (fn) => {
    const { selectionStart: s, selectionEnd: e, value: v } = body;
    const { text, cursor } = fn(v.slice(s, e), v, s, e);
    body.value = v.slice(0, s) + text + v.slice(e);
    body.focus();
    body.setSelectionRange(cursor[0], cursor[1]);
  };

  form.querySelectorAll('.contact-toolbar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.wrap !== undefined) {
        const w = btn.dataset.wrap;
        edit((sel, v, s) => ({ text: w + (sel || 'text') + w, cursor: [s + w.length, s + w.length + (sel || 'text').length] }));
      } else if (btn.dataset.prefix !== undefined) {
        const p = btn.dataset.prefix;
        edit((sel, v, s) => {
          const lineStart = v.lastIndexOf('\n', s - 1) + 1;
          const block = v.slice(lineStart, s) + sel;
          const text = block.split('\n').map((l) => p + l).join('\n');
          return { text: text.slice(s - lineStart), cursor: [s + p.length, s + p.length + text.length - block.length - p.length + sel.length] };
        });
      } else if (btn.dataset.link !== undefined) {
        const url = window.prompt('Link URL', 'https://');
        if (!url) return;
        edit((sel, v, s) => { const t = `[${sel || 'link text'}](${url})`; return { text: t, cursor: [s + 1, s + 1 + (sel || 'link text').length] }; });
      }
    });
  });

  const status = form.querySelector('.contact-status');
  const submitBtn = form.querySelector('[type="submit"]');
  const setStatus = (text, kind) => { status.textContent = text; status.dataset.kind = kind || ''; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const subject = form.elements.subject.value.trim();
    const msg = body.value.trim();
    if (form.elements._honey.value) return; // bot

    submitBtn.disabled = true;
    setStatus('Sending…', 'pending');
    try {
      const res = await fetch('https://formsubmit.co/ajax/michael.carpiano@smus.ca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: name || 'Anonymous', _subject: subject, subject, message: msg, _template: 'box', _captcha: 'false' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || String(data.success) !== 'true') throw new Error(data.message || 'Send failed');
      setStatus('Message sent. Thanks!', 'ok');
      form.reset();
      setTimeout(() => { close(); setStatus(''); }, 1400);
    } catch (err) {
      setStatus('Could not send. Please try again later.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
