/* Persistent shared light/dark theme for Overture site pages and creative tools.
   Emulator HTML documents intentionally do not load this script. */
(() => {
  'use strict';
  const KEY = 'overture-theme';
  const ICON_SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2.2v2.1M12 19.7v2.1M4.98 4.98l1.48 1.48M17.54 17.54l1.48 1.48M2.2 12h2.1M19.7 12h2.1M4.98 19.02l1.48-1.48M17.54 6.46l1.48-1.48"></path></svg>';
  const ICON_MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.2 8.2 0 0 1 8.9 3.8 8.7 8.7 0 1 0 20.2 15.1Z"></path><path d="M16.6 3.2v3.2M15 4.8h3.2"></path></svg>';
  let toggle = null;
  let observer = null;

  const getTheme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

  const setTheme = (theme, persist = false) => {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta && document.head) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    if (meta) meta.setAttribute('content', next === 'light' ? '#e8edf3' : '#0b0e13');
    if (persist) {
      try { localStorage.setItem(KEY, next); } catch (_err) { /* Keep this session usable if storage is blocked. */ }
    }
    if (toggle) {
      const target = next === 'light' ? 'dark' : 'light';
      toggle.innerHTML = next === 'light' ? ICON_MOON : ICON_SUN;
      toggle.setAttribute('aria-label', `Switch to ${target} mode`);
      toggle.title = `Switch to ${target} mode`;
      toggle.setAttribute('aria-pressed', String(next === 'light'));
      toggle.dataset.mode = next;
    }
    window.dispatchEvent(new CustomEvent('overture:themechange', { detail: { theme: next } }));
  };

  const splitNavigation = (header) => {
    const nav = header.querySelector('.main-nav');
    if (!nav || nav.dataset.themeSplit === 'true') return;
    const links = Array.from(nav.children).filter((node) => node.tagName === 'A');
    if (links.length < 4) return;
    const left = document.createElement('span');
    left.className = 'site-nav-side site-nav-side--left';
    left.setAttribute('role', 'presentation');
    const right = document.createElement('span');
    right.className = 'site-nav-side site-nav-side--right';
    right.setAttribute('role', 'presentation');
    links.forEach((link, index) => (index < Math.ceil(links.length / 2) ? left : right).appendChild(link));
    nav.replaceChildren(left, right);
    nav.dataset.themeSplit = 'true';
  };

  const ensureLabNavigation = () => {
    if (!document.body?.dataset.lab || document.querySelector('.site-header')) return;
    const root = document.getElementById('lab-root');
    if (!root) return;
    const header = document.createElement('header');
    header.className = 'site-header site-theme-generated-header';
    header.innerHTML = `
      <a class="site-brand" href="/" aria-label="Overture Instruments home">
        <span class="site-brand__mark"><img src="/ui/Logos/OvertureLogo.png" alt="" width="24" height="24"></span>
        <span class="site-brand__wordmark">OVERTURE INSTRUMENTS</span>
      </a>
      <nav class="main-nav" id="main-nav" aria-label="Main navigation">
        <a href="/about">About</a><a href="/library">Instrument library</a><a href="/#omni">OMNI</a><a href="/experiments" aria-current="page">Experiments</a>
      </nav>
      <a class="header-github" href="https://github.com/ForeverBoundless/Overture-Instruments" target="_blank" rel="noopener noreferrer"><span>GitHub</span><span class="external-arrow" aria-hidden="true">↗</span></a>
      <button class="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="main-nav"><span></span><span></span></button>`;
    const nav = header.querySelector('.main-nav');
    const menu = header.querySelector('.menu-toggle');
    menu.addEventListener('click', () => {
      const opening = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(opening));
      menu.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
      nav.classList.toggle('is-open', opening);
    });
    root.classList.add('ex-page--site');
    root.before(header);
  };

  const placeToggle = () => {
    ensureLabNavigation();
    if (!toggle) return;
    const appBar = document.querySelector('.omni-topbar');
    const siteHeader = document.querySelector('.site-header');
    let parent = null;
    if (appBar) parent = appBar;
    else if (siteHeader) {
      splitNavigation(siteHeader);
      parent = siteHeader;
    }
    if (!parent) {
      if (toggle.parentElement !== document.body) document.body.appendChild(toggle);
      toggle.classList.add('site-theme-toggle--floating');
      return;
    }
    if (toggle.parentElement !== parent) parent.appendChild(toggle);
    toggle.classList.remove('site-theme-toggle--floating');
  };

  const init = () => {
    // The early <head> bootstrap sets the persisted choice before first paint.
    let saved = 'dark';
    try { saved = localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch (_err) { /* Dark is the fallback. */ }
    document.documentElement.dataset.theme = saved;
    document.documentElement.style.colorScheme = saved;

    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'site-theme-toggle';
    toggle.setAttribute('aria-label', 'Switch to light mode');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('title', 'Switch to light mode');
    toggle.innerHTML = ICON_SUN;
    toggle.addEventListener('click', () => setTheme(getTheme() === 'light' ? 'dark' : 'light', true));
    placeToggle();
    setTheme(getTheme(), false);

    if (document.body && typeof MutationObserver !== 'undefined') {
      let placementQueued = false;
      observer = new MutationObserver(() => {
        if (placementQueued) return;
        placementQueued = true;
        requestAnimationFrame(() => {
          placementQueued = false;
          if (toggle && !toggle.isConnected) document.body.appendChild(toggle);
          placeToggle();
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('pageshow', () => {
      let mode = 'dark';
      try { mode = localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch (_err) {}
      setTheme(mode, false);
      placeToggle();
    });
    window.addEventListener('storage', (event) => {
      if (event.key === KEY) setTheme(event.newValue === 'light' ? 'light' : 'dark', false);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
