// Shared: copyright year + contact modal (footer is identical on index, library, about).
(() => { const y = document.getElementById('copyright-year'); if (y) y.textContent = String(new Date().getFullYear()); })();
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

  // Rich-text toolbar: apply formatting directly in the editor.
  const editor = form.querySelector('.contact-editor__body');

  form.querySelectorAll('.contact-toolbar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      editor.focus();

      const command = btn.dataset.command;

      if (command === 'link') {
        const url = window.prompt('Link URL', 'https://');
        if (!url) return;

        try {
          const parsed = new URL(url);
          if (!['https:', 'http:'].includes(parsed.protocol)) return;
          document.execCommand('createLink', false, parsed.href);
        } catch {
          return;
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
    });
  });

  const status = form.querySelector('.contact-status');
  const submitBtn = form.querySelector('[type="submit"]');
  const setStatus = (text, kind) => { status.textContent = text; status.dataset.kind = kind || ''; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const subject = form.elements.subject.value.trim();
    body.value = editor.innerHTML.trim();
    const msg = body.value;

    if (!editor.innerText.trim()) {
      setStatus('Please enter a message.', 'error');
      editor.focus();
      return;
    }
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
