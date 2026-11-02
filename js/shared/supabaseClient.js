import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.OVERTURE_SUPABASE_CONFIG || {};
export const supabaseConfigured = Boolean(
  typeof config.url === 'string'
  && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url.trim())
  && typeof config.anonKey === 'string'
  && config.anonKey.trim().length > 20
);

export const supabase = supabaseConfigured
  ? createClient(config.url.trim(), config.anonKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: { headers: { 'x-application-name': 'overture-instruments' } },
    })
  : null;

export function previewPublicUrl(path) {
  if (!supabase || !path) return null;
  const { data } = supabase.storage.from('community-previews').getPublicUrl(path);
  return data?.publicUrl || null;
}
