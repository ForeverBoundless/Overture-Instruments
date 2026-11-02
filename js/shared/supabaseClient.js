const config = window.OVERTURE_SUPABASE_CONFIG || {};
export const supabaseConfigured = Boolean(
  typeof config.url === 'string'
  && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url.trim())
  && typeof config.anonKey === 'string'
  && config.anonKey.trim().length > 20
);

export let supabase = null;
let clientPromise = null;

export async function configureSupabase() {
  if (!supabaseConfigured) return null;
  if (supabase) return supabase;
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    // Load the SDK only when a project has actually been configured. This
    // lets the community page show setup instructions without a network
    // connection and keeps every other Overture route independent of Supabase.
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(config.url.trim(), config.anonKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: { headers: { 'x-application-name': 'overture-instruments' } },
    });
    return supabase;
  })().catch((error) => {
    clientPromise = null;
    throw error;
  });
  return clientPromise;
}

export function previewPublicUrl(path) {
  if (!supabase || !path) return null;
  const { data } = supabase.storage.from('community-previews').getPublicUrl(path);
  return data?.publicUrl || null;
}
