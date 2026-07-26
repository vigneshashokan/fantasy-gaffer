// src/lib/auth/authErrorBoundary.tsx
//
// Side-effect component (renders null). Subscribes to the global
// QueryCache; on an expired-JWT error from Supabase, attempts a session
// refresh, and on failure signs out. Existing useProfileGate handles routing.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// PostgREST reports an expired/invalid JWT as `code: 'PGRST301'` on a 401
// response, but the error object supabase-js surfaces (PostgrestError:
// message/details/hint/code) carries NO `.status` field. The previous
// `err.status === 401` test therefore never matched a Supabase error and
// this boundary was inert. Worse, the only errors that do reach this cache
// with a `.status` are FplFetchError from the public FPL API — for which
// refreshing or dropping the Supabase session is plainly the wrong
// response. Matching the PostgREST code fixes both halves at once.
const JWT_EXPIRED_CODE = 'PGRST301';

let inFlight = false;

async function handle401() {
  if (inFlight) return;
  inFlight = true;
  try {
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      await supabase.auth.signOut();
    }
  } finally {
    inFlight = false;
  }
}

export function AuthErrorBoundary() {
  const client = useQueryClient();
  useEffect(() => {
    const unsub = client.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      const err = event.query.state.error as { code?: string } | null;
      if (err?.code === JWT_EXPIRED_CODE) void handle401();
    });
    return () => unsub();
  }, [client]);
  return null;
}
