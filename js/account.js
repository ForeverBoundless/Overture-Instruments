import { supabaseConfigured, configureSupabase } from './shared/supabaseClient.js';

const $ = (id) => document.getElementById(id);
const state = { user: null, profile: null, avatarFile: null, removeAvatar: false, objectUrl: null };

function setStatus(text, error = false) {
  const node = $('account-status');
  node.textContent = text || '';
  node.classList.toggle('is-error', error);
}

function getReturnTo() {
  const candidate = new URLSearchParams(window.location.search).get('returnTo');
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return null;
  try {
    const parsed = new URL(candidate, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch { return null; }
}

function redirectAfterAuth() {
  const target = getReturnTo() || '/account';
  if (target !== '/login' && target !== '/login/') window.location.replace(target);
}

function showAuthView(view) {
  const signup = view === 'signup';
  $('account-login-view').hidden = signup;
  $('account-signup-view').hidden = !signup;
  $('account-tab-login').classList.toggle('is-active', !signup);
  $('account-tab-signup').classList.toggle('is-active', signup);
  $('account-tab-login').setAttribute('aria-selected', String(!signup));
  $('account-tab-signup').setAttribute('aria-selected', String(signup));
  $('account-auth-title').textContent = signup ? 'Create your Overture account' : 'Sign in to Overture';
  $('account-auth-description').textContent = signup
    ? 'Choose a username, then create an account with your email or Google.'
    : 'Use your email address and password, or continue with Google.';
}

function initials(value) {
  return String(value || 'OI').trim().split(/[\\s._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'OI';
}

function setAvatar(url, label) {
  const preview = $('account-avatar-preview');
  preview.replaceChildren();
  if (url) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      preview.replaceChildren();
      preview.textContent = initials(label);
    }, { once: true });
    preview.append(image);
  } else {
    const mark = document.createElement('span');
    mark.textContent = initials(label);
    preview.append(mark);
  }
}

function renderProfile() {
  const user = state.user;
  const profile = state.profile || {};
  const fallbackName = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const fallbackUsername = user.user_metadata?.user_name || user.email?.split('@')[0] || 'overture_user';
  const username = profile.username || fallbackUsername;
  const displayName = profile.display_name ?? fallbackName;
  const avatar = profile.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || '';

  $('account-username').value = username;
  $('account-display-name').value = displayName || '';
  $('account-email').value = user.email || '';
  $('account-preview-name').textContent = displayName || username;
  $('account-preview-username').textContent = `@${username}`;
  setAvatar(state.removeAvatar ? '' : avatar, displayName || username);
  $('account-profile').hidden = false;
}

async function loadProfile() {
  const { data, error } = await state.supabase.from('profiles')
    .select('id,username,display_name,avatar_url,avatar_path')
    .eq('id', state.user.id)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    state.profile = data;
    return;
  }

  const meta = state.user.user_metadata || {};
  const base = String(meta.user_name || meta.preferred_username || state.user.email?.split('@')[0] || 'overture_user')
    .toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16) || 'overture_user';
  const username = `${base}_${state.user.id.slice(0, 6)}`;
  const { data: created, error: createError } = await state.supabase.from('profiles')
    .insert({ id: state.user.id, username, display_name: meta.full_name || meta.name || null })
    .select('id,username,display_name,avatar_url,avatar_path').single();
  if (createError) throw createError;
  state.profile = created;
}

async function showSession(session) {
  state.user = session?.user || null;
  const isLoginPage = Boolean($('account-auth-panel'));
  const isAccountPage = Boolean($('account-profile'));

  if (!state.user) {
    if (isLoginPage) {
      $('account-auth-panel').hidden = false;
      showAuthView('login');
    } else if (isAccountPage) {
      const returnTo = window.location.pathname + window.location.search + window.location.hash;
      window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
    return;
  }

  if (isLoginPage) {
    redirectAfterAuth();
    return;
  }
  if (!isAccountPage) return;

  $('account-profile').hidden = true;
  try {
    await loadProfile();
    renderProfile();
    setStatus('');
  } catch (error) {
    setStatus(`Could not load your profile: ${error.message || error}`, true);
  }
}

function setBusy(form, busy) {
  form.querySelectorAll('button[type="submit"]').forEach(button => {
    button.disabled = busy;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.textContent = busy ? 'PLEASE WAIT…' : button.dataset.originalText;
  });
}

async function login(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  setBusy(form, true);
  try {
    const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await showSession(data.session);
    setStatus('Signed in.');
  } catch (error) {
    setStatus(error.message || 'Could not sign in. Check your details and try again.', true);
  } finally { setBusy(form, false); }
}

async function signup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const username = form.elements.username.value.trim().toLowerCase();
  const displayName = form.elements.display_name.value.trim();
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    setStatus('Usernames must be 3–24 characters and contain only letters, numbers, or underscores.', true);
    return;
  }
  if (password.length < 8) {
    setStatus('Use a password with at least 8 characters.', true);
    return;
  }

  setBusy(form, true);
  try {
    const redirectTo = new URL('/account', window.location.origin);
    const returnTo = getReturnTo();
    if (returnTo) redirectTo.searchParams.set('returnTo', returnTo);
    const { data, error } = await state.supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: displayName || null },
        emailRedirectTo: redirectTo.href,
      },
    });
    if (error) throw error;
    if (data.session) {
      await showSession(data.session);
      redirectAfterAuth();
      setStatus('Your Overture account has been created.');
    } else {
      setStatus('Account created. Check your email to confirm your address, then sign in.');
      showAuthView('login');
    }
  } catch (error) {
    setStatus(error.message || 'Could not create your account.', true);
  } finally { setBusy(form, false); }
}

async function googleSignIn() {
  const redirectTo = new URL('/account', window.location.origin);
  const returnTo = getReturnTo();
  if (returnTo) redirectTo.searchParams.set('returnTo', returnTo);
  $('account-google').disabled = true;
  try {
    const { error } = await state.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo.href },
    });
    if (error) throw error;
  } catch (error) {
    setStatus(error.message || 'Google sign-in could not be started.', true);
    $('account-google').disabled = false;
  }
}

async function requestPasswordReset() {
  const email = $('account-login-form').elements.email.value.trim();
  if (!email) {
    setStatus('Enter your email address first, then choose Forgot password.', true);
    $('account-login-form').elements.email.focus();
    return;
  }
  $('account-forgot-password').disabled = true;
  try {
    const redirectTo = new URL('/account', window.location.origin);
    const returnTo = getReturnTo();
    if (returnTo) redirectTo.searchParams.set('returnTo', returnTo);
    const { error } = await state.supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo.href });
    if (error) throw error;
    setStatus('Password reset email sent. Follow the link in your inbox to choose a new password.');
  } catch (error) {
    setStatus(error.message || 'Could not send a password reset email.', true);
  } finally { $('account-forgot-password').disabled = false; }
}

async function saveProfile(event) {
  event.preventDefault();
  const username = $('account-username').value.trim().toLowerCase();
  const displayName = $('account-display-name').value.trim();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    setStatus('Usernames must be 3–24 characters and contain only letters, numbers, or underscores.', true);
    return;
  }

  const form = event.currentTarget;
  setBusy(form, true);
  let uploadedPath = null;
  try {
    let avatarUrl = state.removeAvatar ? null : (state.profile?.avatar_url || null);
    let avatarPath = state.removeAvatar ? null : (state.profile?.avatar_path || null);

    if (state.avatarFile) {
      const file = state.avatarFile;
      const allowed = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
      const extension = allowed[file.type];
      if (!extension) throw new Error('Choose a PNG, JPG, or WebP image.');
      if (file.size > 3 * 1024 * 1024) throw new Error('Profile pictures must be 3 MB or smaller.');
      uploadedPath = `${state.user.id}/avatar.${extension}`;
      const { error: uploadError } = await state.supabase.storage.from('profile-avatars')
        .upload(uploadedPath, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      avatarPath = uploadedPath;
      const { data } = state.supabase.storage.from('profile-avatars').getPublicUrl(uploadedPath);
      avatarUrl = data.publicUrl;
    }

    const row = {
      id: state.user.id,
      username,
      display_name: displayName || null,
      avatar_url: avatarUrl,
      avatar_path: avatarPath,
    };
    const { data, error } = await state.supabase.from('profiles')
      .upsert(row, { onConflict: 'id' })
      .select('id,username,display_name,avatar_url,avatar_path').single();
    if (error) throw error;

    const oldPath = state.profile?.avatar_path;
    if (state.removeAvatar && oldPath) {
      const { error: removeError } = await state.supabase.storage.from('profile-avatars').remove([oldPath]);
      if (removeError) console.warn('The previous profile picture could not be removed:', removeError.message);
    } else if (uploadedPath && oldPath && oldPath !== uploadedPath) {
      const { error: removeError } = await state.supabase.storage.from('profile-avatars').remove([oldPath]);
      if (removeError) console.warn('The previous profile picture could not be removed:', removeError.message);
    }

    state.profile = data;
    state.avatarFile = null;
    state.removeAvatar = false;
    $('account-avatar-file').value = '';
    renderProfile();
    setStatus('Profile saved.');
    window.dispatchEvent(new CustomEvent('overture:profilechange'));
  } catch (error) {
    setStatus(error.message || 'Could not save your profile.', true);
  } finally { setBusy(form, false); }
}

async function changePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const password = form.elements.password.value;
  const confirm = form.elements.confirm.value;
  if (password.length < 8) {
    setStatus('Use a password with at least 8 characters.', true);
    return;
  }
  if (password !== confirm) {
    setStatus('The passwords do not match.', true);
    return;
  }
  setBusy(form, true);
  try {
    const { error } = await state.supabase.auth.updateUser({ password });
    if (error) throw error;
    form.reset();
    setStatus('Password updated.');
  } catch (error) {
    setStatus(error.message || 'Could not update the password.', true);
  } finally { setBusy(form, false); }
}

async function signOut() {
  $('account-signout').disabled = true;
  try {
    const { error } = await state.supabase.auth.signOut();
    if (error) throw error;
    state.profile = null;
    state.user = null;
    state.avatarFile = null;
    window.dispatchEvent(new CustomEvent('overture:profilechange'));
    window.location.replace('/login');
  } catch (error) {
    setStatus(error.message || 'Could not sign out.', true);
  } finally {
    if ($('account-signout')) $('account-signout').disabled = false;
  }
}

function previewAvatar() {
  const file = $('account-avatar-file').files?.[0];
  if (!file) return;
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type) || file.size > 3 * 1024 * 1024) {
    setStatus('Choose a PNG, JPG, or WebP image smaller than 3 MB.', true);
    $('account-avatar-file').value = '';
    return;
  }
  state.avatarFile = file;
  state.removeAvatar = false;
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);
  setAvatar(state.objectUrl, $('account-display-name').value || $('account-username').value);
}

function removeAvatar() {
  state.avatarFile = null;
  state.removeAvatar = true;
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null;
  $('account-avatar-file').value = '';
  setAvatar('', $('account-display-name').value || $('account-username').value);
}

async function initialise() {
  if (!supabaseConfigured) {
    setStatus('Overture Accounts are not connected yet. Check the Supabase configuration.', true);
    return;
  }

  try {
    state.supabase = await configureSupabase();
    if (!state.supabase) throw new Error('Supabase is not configured.');

    if ($('account-auth-panel')) {
      $('account-tab-login').addEventListener('click', () => showAuthView('login'));
      $('account-tab-signup').addEventListener('click', () => showAuthView('signup'));
      $('account-login-form').addEventListener('submit', login);
      $('account-signup-form').addEventListener('submit', signup);
      $('account-google').addEventListener('click', googleSignIn);
      $('account-forgot-password').addEventListener('click', requestPasswordReset);
    }

    if ($('account-profile')) {
      $('account-profile-form').addEventListener('submit', saveProfile);
      $('account-password-form').addEventListener('submit', changePassword);
      $('account-signout').addEventListener('click', signOut);
      $('account-avatar-file').addEventListener('change', previewAvatar);
      $('account-remove-avatar').addEventListener('click', removeAvatar);
    }

    const { data, error } = await state.supabase.auth.getSession();
    if (error) throw error;
    await showSession(data.session);
    state.supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => { void showSession(session); }, 0);
    });
  } catch (error) {
    setStatus(error.message || 'Could not connect to Overture Accounts.', true);
  }
}

initialise();
