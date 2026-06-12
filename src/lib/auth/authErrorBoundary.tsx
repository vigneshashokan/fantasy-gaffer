// src/lib/auth/authErrorBoundary.tsx
//
// Side-effect component (renders null). Subscribes to the global
// QueryCache; on supabase-js 401 errors, attempts a session refresh,
// and on failure signs out. Existing useProfileGate handles routing.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

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
      const err = event.query.state.error as { status?: number } | null;
      if (err?.status === 401) void handle401();
    });
    return () => unsub();
  }, [client]);
  return null;
}
