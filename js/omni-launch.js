/* Launch OMNI from its homepage showcase with an electric-blue kaleidoscope transition. */
(() => {
  const init = () => {
    const showcase = document.querySelector('.omni-patch-showcase');
    if (!showcase || showcase.dataset.omniLaunchReady === 'true') return;
    showcase.dataset.omniLaunchReady = 'true';
    showcase.setAttribute('role', 'button');
    showcase.setAttribute('tabindex', '0');
    showcase.setAttribute('aria-label', 'Launch the OMNI modular synthesis workspace');
    showcase.setAttribute('aria-keyshortcuts', 'Enter Space');

    let launching = false;
    const resetLaunchState = () => {
      document.querySelectorAll('.omni-launch-overlay').forEach((overlay) => overlay.remove());
      document.body.classList.remove('omni-launch-active');
      launching = false;
    };

    // Browsers may restore this page from the back-forward cache with its old
    // transition DOM intact. Always clear that state when the page is shown.
    window.addEventListener('pageshow', resetLaunchState);

    const launch = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (launching) return;
      launching = true;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Make the current history entry the intended return destination before
      // navigating away. Back from /omni therefore returns to /#omni.
      try {
        window.history.replaceState(window.history.state, '', '/#omni');
      } catch (_err) {
        // The animation still works if history replacement is restricted.
      }

      document.body.classList.add('omni-launch-active');
      const rect = showcase.getBoundingClientRect();
      const overlay = document.createElement('div');
      overlay.className = 'omni-launch-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = '<div class="omni-launch-kaleido omni-launch-kaleido--one"></div><div class="omni-launch-kaleido omni-launch-kaleido--two"></div><div class="omni-launch-kaleido omni-launch-kaleido--three"></div><div class="omni-launch-electric-grid"></div><div class="omni-launch-flash"></div>';

      // Keep the clicked artwork at its original dimensions. The full-screen
      // kaleidoscope is an independent overlay; the artwork only translates
      // toward the viewport centre and never grows or reflows.
      const stage = showcase.cloneNode(true);
      stage.classList.remove('reveal');
      stage.removeAttribute('data-tilt');
      stage.classList.add('omni-launch-stage');
      stage.removeAttribute('role');
      stage.removeAttribute('tabindex');
      stage.removeAttribute('aria-label');
      stage.querySelectorAll('a,button,input,select,[tabindex]').forEach((node) => {
        if (node.matches('a')) {
          const label = document.createElement('span');
          label.className = node.className;
          label.innerHTML = node.innerHTML;
          node.replaceWith(label);
        } else {
          node.removeAttribute('tabindex');
        }
      });
      Object.assign(stage.style, {
        left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px`,
        margin: '0', position: 'fixed', zIndex: '2',
        transform: 'translate3d(0px, 0px, 0px)', transformOrigin: 'center center'
      });
      overlay.appendChild(stage);
      document.body.appendChild(overlay);

      const showLoader = () => {
        stage.classList.add('is-dissolving');
        overlay.classList.add('is-loading');
        window.setTimeout(() => {
          stage.remove();
          const loader = document.createElement('div');
          loader.className = 'omni-launch-loader';
          loader.innerHTML = '<img class="omni-launch-logo" src="/ui/Logos/OvertureLogo.png" alt=""><div class="omni-launch-progress" role="presentation"><span></span></div>';
          overlay.appendChild(loader);
          requestAnimationFrame(() => loader.classList.add('is-visible'));
          window.setTimeout(() => window.location.assign('/omni'), reduced ? 420 : 1420);
        }, reduced ? 40 : 300);
      };

      if (reduced) {
        overlay.classList.add('is-loading');
        stage.style.opacity = '0';
        showLoader();
        return;
      }

      requestAnimationFrame(() => {
        overlay.classList.add('is-energized');
        stage.classList.add('is-energized');
      });
      const panX = window.innerWidth / 2 - (rect.left + rect.width / 2);
      const panY = window.innerHeight / 2 - (rect.top + rect.height / 2);
      window.setTimeout(() => {
        overlay.classList.add('is-kaleidoscope');
        stage.classList.add('is-overloaded');
        // Glide the unchanged artwork into the centre while the kaleidoscope
        // takes over the screen. Its width and height are deliberately fixed.
        stage.style.transform = `translate3d(${panX}px, ${panY}px, 0px)`;
      }, 140);
      window.setTimeout(showLoader, 1510);
    };

    showcase.addEventListener('click', launch, true);
    showcase.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') launch(event);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
