import { supabaseConfigured, configureSupabase } from './supabaseClient.js';

const initials = (value) => String(value || 'OI').trim().split(/[\\s._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'OI';

function safeAvatarUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

function initialsAvatar(label) {
  const avatar = document.createElement('span');
  avatar.className = 'header-account__avatar header-account__avatar--initials';
  avatar.textContent = initials(label);
  return avatar;
}

function closeAccountMenu(wrapper, toggle) {
  wrapper.classList.remove('is-menu-open');
  toggle.setAttribute('aria-expanded', 'false');
}

function ensureAccountMenu(anchor, supabase) {
  let wrapper = anchor.parentElement?.classList.contains('header-account-wrap')
    ? anchor.parentElement
    : null;

  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'header-account-wrap';
    anchor.before(wrapper);
    wrapper.append(anchor);
  }

  let toggle = wrapper.querySelector('.header-account-menu-toggle');
  let menu = wrapper.querySelector('.header-account-menu');
  let logout = wrapper.querySelector('.header-account-logout');
  let status = wrapper.querySelector('.header-account-menu__status');

  if (!toggle || !menu || !logout || !status) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'header-account-menu-toggle';
    toggle.setAttribute('aria-label', 'Open account menu');
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');

    menu = document.createElement('div');
    menu.className = 'header-account-menu';
    menu.id = 'header-account-menu';
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'Account options');
    toggle.setAttribute('aria-controls', menu.id);
    toggle.innerHTML = '<span aria-hidden="true"></span>';

    const panel = document.createElement('div');
    panel.className = 'header-account-menu__panel';

    logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'header-account-logout';
    logout.textContent = 'LOG OUT';

    status = document.createElement('p');
    status.className = 'header-account-menu__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    panel.append(logout, status);
    menu.append(panel);
    wrapper.append(toggle, menu);

    toggle.addEventListener('click', () => {
      const open = !wrapper.classList.contains('is-menu-open');
      wrapper.classList.toggle('is-menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });

    wrapper.addEventListener('mouseenter', () => {
      toggle.setAttribute('aria-expanded', 'true');
    });
    wrapper.addEventListener('mouseleave', () => {
      if (!wrapper.matches(':focus-within')) closeAccountMenu(wrapper, toggle);
    });
    wrapper.addEventListener('focusin', () => {
      toggle.setAttribute('aria-expanded', 'true');
    });
    wrapper.addEventListener('focusout', () => {
      window.setTimeout(() => {
        if (!wrapper.matches(':focus-within')) closeAccountMenu(wrapper, toggle);
      }, 0);
    });
    wrapper.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeAccountMenu(wrapper, toggle);
        anchor.focus();
      }
    });
    document.addEventListener('pointerdown', (event) => {
      if (!wrapper.contains(event.target)) closeAccountMenu(wrapper, toggle);
    });

    logout.addEventListener('click', async () => {
      logout.disabled = true;
      logout.textContent = 'SIGNING OUT…';
      status.textContent = '';
      try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        closeAccountMenu(wrapper, toggle);
      } catch (error) {
        status.textContent = error?.message || 'Could not sign out. Please try again.';
      } finally {
        logout.disabled = false;
        logout.textContent = 'LOG OUT';
      }
    });
  }

  return { wrapper, toggle, menu, logout, status };
}

function setHeaderAccount(anchor, user, profile, supabase) {
  if (!anchor) return;
  const { wrapper, toggle, menu, logout, status } = ensureAccountMenu(anchor, supabase);
  anchor.replaceChildren();

  if (!user) {
    wrapper.classList.remove('is-signed-in', 'is-menu-open');
    toggle.hidden = true;
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    anchor.href = `/account?returnTo=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`;
    anchor.classList.remove('is-signed-in');
    const label = document.createElement('span');
    label.className = 'header-account__label';
    label.textContent = 'LOG IN';
    anchor.append(label);
    anchor.setAttribute('aria-label', 'Log in to your Overture account');
    anchor.title = 'Log in to Overture';
    return;
  }

  const username = String(
    profile?.username || user.user_metadata?.user_name || user.email?.split('@')[0] || 'Account'
  ).trim().replace(/^@+/, '') || 'Account';
  const displayName = profile?.display_name || username;
  const avatarUrl = safeAvatarUrl(
    profile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || ''
  );

  wrapper.classList.add('is-signed-in');
  toggle.hidden = false;
  menu.hidden = false;
  logout.disabled = false;
  logout.textContent = 'LOG OUT';
  status.textContent = '';
  anchor.href = '/account';
  anchor.classList.add('is-signed-in');

  if (avatarUrl) {
    const avatar = document.createElement('img');
    avatar.className = 'header-account__avatar';
    avatar.src = avatarUrl;
    avatar.alt = '';
    avatar.width = 27;
    avatar.height = 27;
    avatar.decoding = 'async';
    avatar.referrerPolicy = 'no-referrer';
    avatar.addEventListener('error', () => {
      if (avatar.isConnected) avatar.replaceWith(initialsAvatar(displayName));
    }, { once: true });
    anchor.append(avatar);
  } else {
    anchor.append(initialsAvatar(displayName));
  }

  const label = document.createElement('span');
  label.className = 'header-account__label';
  label.textContent = `@${username}`;
  label.title = `@${username}`;
  anchor.append(label);
  anchor.setAttribute('aria-label', `Account settings for @${username}`);
  anchor.title = `Account settings for @${username}`;
}

async function loadProfile(supabase, user) {
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('username,display_name,avatar_url')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    console.warn('Could not load Overture profile:', error.message);
    return null;
  }
  return data;
}

async function init() {
  if (!supabaseConfigured) return;
  let supabase;
  try {
    supabase = await configureSupabase();
  } catch (error) {
    console.warn('Overture account status is unavailable:', error.message);
    return;
  }
  if (!supabase) return;
  window.__overtureSupabase = supabase;

  let generation = 0;
  let currentSession = (await supabase.auth.getSession()).data?.session || null;
  const update = async (session) => {
    currentSession = session;
    const current = ++generation;
    const user = session?.user || null;
    const profile = user ? await loadProfile(supabase, user) : null;
    if (current !== generation) return;
    document.querySelectorAll('.header-account').forEach(anchor => {
      setHeaderAccount(anchor, user, profile, supabase);
    });
  };

  await update(currentSession);
  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => { void update(session); }, 0);
  });
  window.addEventListener('overture:profilechange', () => {
    void supabase.auth.getSession().then(({ data }) => update(data?.session || null));
  });

  // Static and dynamically inserted headers all use the same account control.
  const observer = new MutationObserver(() => {
    document.querySelectorAll('.header-account:not([data-account-ready])').forEach(anchor => {
      anchor.dataset.accountReady = 'true';
      void update(currentSession);
    });
  });
  document.querySelectorAll('.header-account').forEach(anchor => {
    anchor.dataset.accountReady = 'true';
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('pageshow', () => {
    void supabase.auth.getSession().then(({ data }) => update(data?.session || null));
  });
}

init();
