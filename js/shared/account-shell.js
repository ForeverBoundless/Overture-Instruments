import { supabaseConfigured, configureSupabase } from './supabaseClient.js';

const initials = (value) => String(value || 'OI').trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'OI';

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

function setHeaderAccount(anchor, user, profile) {
  if (!anchor) return;

  anchor.replaceChildren();
  if (!user) {
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

async function loadProfile(user) {
  if (!user) return null;
  const { data, error } = await window.__overtureSupabase
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
  try { supabase = await configureSupabase(); }
  catch (error) {
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
    const profile = user ? await loadProfile(user) : null;
    if (current !== generation) return;
    document.querySelectorAll('.header-account').forEach(anchor => setHeaderAccount(anchor, user, profile));
  };

  await update(currentSession);
  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => { void update(session); }, 0);
  });
  window.addEventListener('overture:profilechange', () => {
    void supabase.auth.getSession().then(({ data }) => update(data?.session || null));
  });

  const observer = new MutationObserver(() => {
    document.querySelectorAll('.header-account:not([data-account-ready])').forEach(anchor => {
      anchor.dataset.accountReady = 'true';
      void update(currentSession);
    });
  });
  document.querySelectorAll('.header-account').forEach(anchor => { anchor.dataset.accountReady = 'true'; });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pageshow', () => { void supabase.auth.getSession().then(({ data }) => update(data?.session || null)); });
}

init();
