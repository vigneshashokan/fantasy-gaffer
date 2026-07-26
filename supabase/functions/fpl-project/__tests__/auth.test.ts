import { assertEquals } from '@std/assert';
import { authorize } from '../lib/auth.ts';

const SECRET = 'correct-horse-battery-staple';
const withHeader = (v: string) =>
  new Request('http://x/', { headers: { 'x-ingest-secret': v } });

Deno.test('authorize: accepts the matching secret', () => {
  assertEquals(authorize(withHeader(SECRET), SECRET), null);
});

Deno.test('authorize: rejects a wrong secret with 401', () => {
  const res = authorize(withHeader('nope'), SECRET);
  assertEquals(res?.status, 401);
});

Deno.test('authorize: rejects a missing header with 401', () => {
  const res = authorize(new Request('http://x/'), SECRET);
  assertEquals(res?.status, 401);
});

// A prefix must not pass. The comparison is length-checked first and then
// non-short-circuiting, so this also pins that it does not accept a truncation.
Deno.test('authorize: rejects a prefix of the secret', () => {
  const res = authorize(withHeader(SECRET.slice(0, -1)), SECRET);
  assertEquals(res?.status, 401);
});

// Fails CLOSED. An unset secret must reject everything rather than quietly
// reverting to an open endpoint — that is the failure mode nobody would notice.
// 503 rather than 401 so a misconfiguration is distinguishable in the logs.
Deno.test('authorize: refuses everything when the secret is unset', () => {
  assertEquals(authorize(withHeader('anything'), undefined)?.status, 503);
  assertEquals(authorize(withHeader('anything'), '')?.status, 503);
});
