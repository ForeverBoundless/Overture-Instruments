/* Shared: copyright year + contact modal. */

(() => {
  const updateCopyrightYear = () => {
    const year = document.getElementById('copyright-year');
    if (year) year.textContent = String(new Date().getFullYear());
  };

  updateCopyrightYear();

  // Contact modal
  (() => {
    let observer = null;

    function initializeContact() {
      updateCopyrightYear();

      const modal = document.getElementById('contact-modal');
      const form = document.getElementById('contact-form');
      const openBtn = document.getElementById('contact-open');

      // The library page inserts its footer from an HTML template.
      // Wait for that template to be inserted before initializing.
      if (!modal || !form || !openBtn) {
        if (!observer && document.body) {
          observer = new MutationObserver(() => {
            if (
              document.getElementById('contact-modal') &&
              document.getElementById('contact-form') &&
              document.getElementById('contact-open')
            ) {
              observer.disconnect();
              observer = null;
              initializeContact();
            }
          });

          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
        }
        return;
      }

      // Prevent duplicate event listeners.
      if (form.dataset.contactInitialized === 'true') return;
      form.dataset.contactInitialized = 'true';

      const editor = form.querySelector('.contact-editor__body');
      const body = form.elements.body;
      const status = form.querySelector('.contact-status');
      const submitBtn = form.querySelector('[type="submit"]');

      if (!editor || !body || !status || !submitBtn) {
        console.error('Contact form is missing a required element.');
        return;
      }

      let lastFocus = null;
      let emailjsInitialized = false;
      let lockedScrollY = 0;
      let savedBodyStyles = null;

      const setStatus = (message, kind = '') => {
        status.textContent = message;
        status.dataset.kind = kind;
      };

      // Fix the body in place instead of toggling overflow alone. Some browsers
      // jump the document to scrollY=0 when overflow is hidden and a modal field
      // receives focus. A fixed body preserves the visible background position.
      const lockBackgroundScroll = () => {
        const bodyEl = document.body;
        lockedScrollY = window.scrollY || window.pageYOffset || 0;
        savedBodyStyles = {
          position: bodyEl.style.position,
          top: bodyEl.style.top,
          left: bodyEl.style.left,
          right: bodyEl.style.right,
          width: bodyEl.style.width,
          overflow: bodyEl.style.overflow,
          paddingRight: bodyEl.style.paddingRight
        };

        const scrollbarGap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
        bodyEl.style.position = 'fixed';
        bodyEl.style.top = `-${lockedScrollY}px`;
        bodyEl.style.left = '0';
        bodyEl.style.right = '0';
        bodyEl.style.width = 'auto';
        bodyEl.style.overflow = 'hidden';
        if (scrollbarGap) bodyEl.style.paddingRight = `${scrollbarGap}px`;
      };

      const unlockBackgroundScroll = () => {
        if (!savedBodyStyles) return;
        const bodyEl = document.body;
        const restore = savedBodyStyles;
        bodyEl.style.position = restore.position;
        bodyEl.style.top = restore.top;
        bodyEl.style.left = restore.left;
        bodyEl.style.right = restore.right;
        bodyEl.style.width = restore.width;
        bodyEl.style.overflow = restore.overflow;
        bodyEl.style.paddingRight = restore.paddingRight;
        savedBodyStyles = null;

        // Restore the same document position, and avoid focus restoration
        // causing another browser-managed scroll adjustment.
        window.scrollTo(0, lockedScrollY);
      };

      const open = () => {
        if (!modal.hidden) return;
        lastFocus = document.activeElement;
        lockBackgroundScroll();
        modal.hidden = false;
        form.elements.name.focus({ preventScroll: true });
      };

      const close = () => {
        if (modal.hidden) return;
        modal.hidden = true;
        unlockBackgroundScroll();
        if (lastFocus && typeof lastFocus.focus === 'function') {
          lastFocus.focus({ preventScroll: true });
        }
      };

      openBtn.addEventListener('click', open);

      modal.querySelectorAll('[data-contact-close]').forEach((el) => {
        el.addEventListener('click', close);
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.hidden) close();
      });

      // Load a browser library only when it is actually needed.
      function loadScript(src, globalName) {
        if (window[globalName]) return Promise.resolve();

        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = src;
          script.async = true;

          script.onload = () => {
            if (window[globalName]) {
              resolve();
            } else {
              reject(new Error(`${globalName} failed to initialize.`));
            }
          };

          script.onerror = () => {
            reject(new Error(`Could not load ${globalName}.`));
          };

          document.head.appendChild(script);
        });
      }

      async function ensureEmailLibraries() {
        await Promise.all([
          loadScript(
            'https://cdn.jsdelivr.net/npm/@emailjs/browser@5/dist/email.min.js',
            'emailjs'
          ),
          loadScript(
            'https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js',
            'DOMPurify'
          )
        ]);

        if (!emailjsInitialized) {
          window.emailjs.init({
            publicKey: 'hxa_TW_2onJtOeAdl'
          });
          emailjsInitialized = true;
        }
      }

      // Rich-text toolbar. Prevent mouse clicks from discarding
      // the current text selection before the formatting is applied.
      const toolbarButtons = form.querySelectorAll(
        '.contact-toolbar button'
      );

      toolbarButtons.forEach((btn) => {
        btn.addEventListener('mousedown', (event) => {
          event.preventDefault();
        });

        btn.addEventListener('click', () => {
          editor.focus();

          const command = btn.dataset.command;

          if (command === 'link') {
            const url = window.prompt('Link URL', 'https://');
            if (!url) return;

            try {
              const parsed = new URL(url.trim());

              if (!['https:', 'http:'].includes(parsed.protocol)) {
                setStatus('Please enter a valid HTTP or HTTPS link.', 'error');
                return;
              }

              document.execCommand('createLink', false, parsed.href);
            } catch {
              setStatus('Please enter a valid link.', 'error');
            }

            return;
          }

          const commands = {
            bold: ['bold'],
            italic: ['italic'],
            code: ['formatBlock', 'pre'],
            heading: ['formatBlock', 'h3'],
            bullets: ['insertUnorderedList'],
            numbered: ['insertOrderedList'],
            quote: ['formatBlock', 'blockquote']
          };

          const action = commands[command];

          if (action) {
            document.execCommand(action[0], false, action[1] || null);
          }

          setStatus('');
        });
      });

      // Send the formatted message through EmailJS.
      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const name = form.elements.name.value.trim();
        const subject = form.elements.subject.value.trim();
        const messageText = editor.innerText.trim();

        // Honeypot field for basic bot filtering.
        if (form.elements._honey.value) return;

        if (!subject) {
          setStatus('Please enter a subject.', 'error');
          form.elements.subject.focus();
          return;
        }

        if (!messageText) {
          setStatus('Please enter a message.', 'error');
          editor.focus();
          return;
        }

        submitBtn.disabled = true;
        setStatus('Sending…', 'pending');

        try {
          await ensureEmailLibraries();

          // Strip unsafe HTML while preserving the supported formatting.
          const messageHtml = window.DOMPurify.sanitize(
            editor.innerHTML.trim(),
            {
              ALLOWED_TAGS: [
                'p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u',
                'h3', 'pre', 'code', 'ul', 'ol', 'li',
                'blockquote', 'a'
              ],
              ALLOWED_ATTR: ['href', 'title']
            }
          );

          // Keep the hidden field synchronized with the editor.
          body.value = messageHtml;

          await window.emailjs.send(
            'service_vob5pka',
            'template_7rlel0k',
            {
              name: name || 'Anonymous',
              subject: subject,
              message_html: messageHtml
            }
          );

          setStatus('Message sent. Thanks!', 'ok');

          form.reset();
          editor.innerHTML = '';
          body.value = '';

          window.setTimeout(() => {
            close();
            setStatus('');
          }, 1400);
        } catch (error) {
          console.error('Contact form submission failed:', error);
          setStatus(
            'Could not send. Please try again later.',
            'error'
          );
        } finally {
          submitBtn.disabled = false;
        }
      });
    }

    initializeContact();
  })();
})();
