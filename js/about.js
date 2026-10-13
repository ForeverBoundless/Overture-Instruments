(() => {
  'use strict';

  const year = document.getElementById('copyright-year');
  if (year) year.textContent = String(new Date().getFullYear());

  // Reveal sections as they enter the viewport, without hiding content if unsupported.
  const revealItems = document.querySelectorAll('.about-reveal');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -24px 0px'
    });

    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  // Mobile navigation follows the same behaviour as the homepage.
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
      menuToggle.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
      nav.classList.toggle('is-open', opening);
    });

    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });

    document.addEventListener('click', (event) => {
      if (!nav.classList.contains('is-open')) return;
      if (nav.contains(event.target) || menuToggle.contains(event.target)) return;
      closeMenu();
    });
  }

  // Independent, reusable carousels. Each one owns its own index and controls.
  document.querySelectorAll('[data-carousel]').forEach((carousel) => {
    const track = carousel.querySelector('[data-carousel-track]');
    const slides = Array.from(carousel.querySelectorAll('[data-slide]'));
    const previous = carousel.querySelector('[data-carousel-prev]');
    const next = carousel.querySelector('[data-carousel-next]');
    const dots = Array.from(carousel.querySelectorAll('[data-carousel-dot]'));
    const currentReadout = carousel.querySelector('[data-carousel-current]');
    const totalReadout = carousel.querySelector('[data-carousel-total]');

    if (!track || slides.length === 0) return;

    let currentIndex = 0;
    let touchStartX = null;
    let touchStartY = null;

    if (totalReadout) totalReadout.textContent = String(slides.length).padStart(2, '0');

    const showSlide = (requestedIndex) => {
      currentIndex = (requestedIndex + slides.length) % slides.length;
      track.style.transform = `translateX(-${currentIndex * 100}%)`;

      slides.forEach((slide, index) => {
        slide.setAttribute('aria-hidden', String(index !== currentIndex));
      });

      dots.forEach((dot, index) => {
        if (index === currentIndex) {
          dot.setAttribute('aria-current', 'true');
        } else {
          dot.removeAttribute('aria-current');
        }
      });

      if (currentReadout) currentReadout.textContent = String(currentIndex + 1).padStart(2, '0');
    };

    previous?.addEventListener('click', () => showSlide(currentIndex - 1));
    next?.addEventListener('click', () => showSlide(currentIndex + 1));

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const index = Number(dot.dataset.carouselDot);
        if (Number.isInteger(index)) showSlide(index);
      });
    });

    // Allow a simple left/right swipe on touchscreens without hijacking vertical scrolling.
    track.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }, { passive: true });

    track.addEventListener('touchend', (event) => {
      if (touchStartX === null || touchStartY === null) return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        showSlide(currentIndex + (deltaX < 0 ? 1 : -1));
      }

      touchStartX = null;
      touchStartY = null;
    }, { passive: true });

    showSlide(0);
  });

  // Smoothly update the top progress line.
  const progressBar = document.getElementById('scroll-progress-bar');
  let progressScheduled = false;

  const updateProgress = () => {
    if (!progressBar) return;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
    progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
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
