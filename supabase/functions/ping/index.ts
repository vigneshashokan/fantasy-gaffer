import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve(() =>
  new Response(
    JSON.stringify({ status: 'ok', ts: new Date().toISOString() }),
    { headers: { 'Content-Type': 'application/json' } },
  ),
);
