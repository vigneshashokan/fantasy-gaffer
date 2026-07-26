// Shared-secret gate for the cron-invoked functions.
//
// These deploy with --no-verify-jwt, and simply re-enabling JWT verification
// would not help: the anon key ships inside the app bundle, so any user of the
// app could still invoke them. The only thing that distinguishes our pg_cron
// scheduler from a stranger who read the key out of the bundle is a secret the
// client never sees.
//
// Seed the SAME value in two places per environment:
//   supabase secrets set INGEST_SHARED_SECRET=<value>              -- function side
//   select vault.create_secret('<value>', 'ingest_shared_secret'); -- cron side
//
// Fails CLOSED. An unset secret rejects every request rather than quietly
// degrading back to an open endpoint, which is the failure mode that would go
// unnoticed. 503 rather than 401 so a misconfiguration is distinguishable from
// a rejected caller in the logs.
//
// NOTE: duplicated in the sibling function directory. Supabase bundles each
// function independently, so they cannot share a module — same constraint that
// keeps feature-spec.ts duplicated.

const HEADER = 'x-ingest-secret';

// Length is allowed to leak; the comparison itself does not short-circuit.
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** Returns a rejection Response, or null when the caller is authorized. */
export function authorize(
  req: Request,
  secret: string | undefined = Deno.env.get('INGEST_SHARED_SECRET'),
): Response | null {
  if (!secret) {
    console.error('[auth] INGEST_SHARED_SECRET is unset — refusing all requests');
    return Response.json({ ok: false, error: 'server misconfigured' }, { status: 503 });
  }
  const supplied = req.headers.get(HEADER);
  if (!supplied || !timingSafeEqual(supplied, secret)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
