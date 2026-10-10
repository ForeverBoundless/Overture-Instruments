(() => {
  'use strict';

  // Change this one path if your existing instrument launcher has a different filename.
  const LIBRARY_URL = './html/library.html';

  const libraryLinks = document.querySelectorAll('a[href="./html/launcher.html"]');
  libraryLinks.forEach((link) => link.setAttribute('href', LIBRARY_URL));

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