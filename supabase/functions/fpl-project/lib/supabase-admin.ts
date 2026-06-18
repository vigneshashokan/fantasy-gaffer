import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
