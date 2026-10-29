/* Launch OMNI from its homepage showcase with a short electrical transition. */
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
    const launch = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (launching) return;
      launching = true;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.body.classList.add('omni-launch-active');

      const rect = showcase.getBoundingClientRect();
      const overlay = document.createElement('div');
      overlay.className = 'omni-launch-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = '<div class="omni-launch-grid"></div><div class="omni-launch-flash"></div>';

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
        transform: 'translate3d(0,0,0) scale(1)',
        transformOrigin: 'center center'
      });
      overlay.appendChild(stage);
      document.body.appendChild(overlay);

      const showLoader = () => {
        stage.classList.add('is-disintegrating');
        overlay.classList.add('is-loading');
        window.setTimeout(() => {
          stage.remove();
          const loader = document.createElement('div');
          loader.className = 'omni-launch-loader';
          loader.innerHTML = '<img class="omni-launch-logo" src="/ui/Logos/OvertureLogo.png" alt=""><div class="omni-launch-progress" role="presentation"><span></span></div>';
          overlay.appendChild(loader);
          requestAnimationFrame(() => loader.classList.add('is-visible'));
          window.setTimeout(() => window.location.assign('/omni'), reduced ? 420 : 1380);
        }, reduced ? 80 : 360);
      };

      if (reduced) {
        overlay.classList.add('is-loading');
        stage.style.display = 'none';
        showLoader();
        return;
      }

      requestAnimationFrame(() => {
        overlay.classList.add('is-energized');
        stage.classList.add('is-energized');
      });
      window.setTimeout(() => {
        stage.classList.add('is-expanding');
        overlay.classList.add('is-expanding');
      }, 180);
      window.setTimeout(showLoader, 1260);
    };

    showcase.addEventListener('click', launch, true);
    showcase.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') launch(event);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
