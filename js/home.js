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

  // THE IDEA: a tiny, self-contained liquid particle field. It comes in from
  // the left, settles into a slow current, and accepts stone-drop ripples.
  const mission = document.getElementById('mission');
  const fluidCanvas = mission?.querySelector('.idea-fluid');

  if (mission && fluidCanvas && !reduceMotion.matches) {
    const context = fluidCanvas.getContext('2d', { alpha: true });
    const colors = ['255,183,94', '125,228,255', '130,230,168'];
    const particles = [];
    const ripples = [];
    let width = 0;
    let height = 0;
    let active = false;
    let frame = 0;
    let start = performance.now();

    const resizeFluid = () => {
      const bounds = mission.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, Math.floor(bounds.width));
      height = Math.max(1, Math.floor(bounds.height));
      fluidCanvas.width = Math.floor(width * scale);
      fluidCanvas.height = Math.floor(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      const count = Math.round(Math.min(500, Math.max(180, width * height / 1800)));
      particles.length = 0;
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const spread = Math.sqrt(Math.random());
        particles.push({
          x: -width * (.35 + Math.random() * .9),
          y: height * (.18 + Math.random() * .67),
          targetX: width * (.66 + Math.cos(angle) * spread * .43),
          targetY: height * (.54 + Math.sin(angle) * spread * .31),
          phase: Math.random() * Math.PI * 2,
          speed: .35 + Math.random() * .65,
          size: .55 + Math.random() * 1.45,
          color: Math.floor(Math.random() * colors.length)
        });
      }
    };

    const dropRipple = (event) => {
      if (event.target.closest('a, button')) return;
      const bounds = mission.getBoundingClientRect();
      ripples.push({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, born: performance.now() });
      if (ripples.length > 5) ripples.shift();
    };

    const drawFluid = (now) => {
      if (!active) return;
      const elapsed = now - start;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';

      particles.forEach((particle, index) => {
        const enter = Math.min(1, Math.max(0, (elapsed - index * 5) / 1180));
        const ease = 1 - Math.pow(1 - enter, 3);
        const orbit = elapsed * .00035 * particle.speed + particle.phase;
        const swirlX = Math.cos(orbit * 1.8) * (10 + particle.speed * 7);
        const swirlY = Math.sin(orbit * 2.4) * (8 + particle.speed * 6);
        let x = particle.x + (particle.targetX - particle.x) * ease + swirlX;
        let y = particle.y + (particle.targetY - particle.y) * ease + swirlY;
        let pushX = 0;
        let pushY = 0;
        ripples.forEach((ripple) => {
          const age = (now - ripple.born) / 1000;
          const dx = x - ripple.x;
          const dy = y - ripple.y;
          const distance = Math.hypot(dx, dy) || 1;
          const wave = Math.sin(distance * .09 - age * 13) * Math.exp(-Math.abs(distance - age * 165) / 48) * Math.max(0, 1 - age / 1.7);
          pushX += dx / distance * wave * 13;
          pushY += dy / distance * wave * 13;
        });
        x += pushX;
        y += pushY;
        const pulse = .5 + .5 * Math.sin(elapsed * .002 + particle.phase * 2);
        const alpha = (.08 + pulse * .28) * ease;
        context.fillStyle = `rgba(${colors[particle.color]},${alpha})`;
        context.beginPath();
        context.arc(x, y, particle.size * (.7 + pulse * .55), 0, Math.PI * 2);
        context.fill();
      });

      ripples.forEach((ripple) => {
        const age = (now - ripple.born) / 1000;
        if (age >= 1.8) return;
        context.strokeStyle = `rgba(125,228,255,${(1 - age / 1.8) * .2})`;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(ripple.x, ripple.y, 10 + age * 102, 0, Math.PI * 2);
        context.stroke();
      });
      while (ripples[0] && now - ripples[0].born > 1800) ripples.shift();
      context.globalCompositeOperation = 'source-over';
      frame = requestAnimationFrame(drawFluid);
    };

    const fluidObserver = new IntersectionObserver((entries) => {
      active = entries[0].isIntersecting;
      if (active && !frame) {
        start = performance.now();
        mission.classList.add('is-fluid-ready');
        frame = requestAnimationFrame(drawFluid);
      }
      if (!active && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }, { threshold: .08 });

    resizeFluid();
    new ResizeObserver(resizeFluid).observe(mission);
    mission.addEventListener('pointerdown', dropRipple);
    fluidObserver.observe(mission);
  }
})();
