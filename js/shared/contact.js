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
