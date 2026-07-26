// src/api/fpl-client.ts
//
// Single egress for all calls to fantasy.premierleague.com/api/*.
// When the optional fpl-proxy Edge Function lands, only the base URL here
// changes; all hooks stay the same.

import Constants from 'expo-constants';

// E2E/proxy seam: overridable via EXPO_PUBLIC_FPL_BASE_URL (forwarded through
// app.config.ts extra — app code cannot read EXPO_PUBLIC_* directly).
export const FPL_BASE: string =
  Constants.expoConfig?.extra?.fplBaseUrl ?? 'https://fantasy.premierleague.com/api';
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 300, 800]; // pre-attempt delay per attempt

export class FplFetchError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FplFetchError';
  }
}

export async function fplGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt] > 0) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      // fetch is ALWAYS driven by the internal controller. Passing the caller's
      // signal straight through meant the timeout aborted a controller nobody
      // was listening to, so a hung request never timed out at all (#178). The
      // external signal is forwarded into it instead, so both can cancel.
      const forwardAbort = () => controller.abort();
      if (signal?.aborted) controller.abort();
      else signal?.addEventListener('abort', forwardAbort, { once: true });

      const res = await fetch(`${FPL_BASE}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', forwardAbort);
      });

      if (res.ok) {
        return (await res.json()) as T;
      }

      // 4xx: do not retry. 5xx: keep looping.
      if (res.status >= 400 && res.status < 500) {
        throw new FplFetchError(`FPL ${res.status} for ${path}`, res.status);
      }

      lastErr = new FplFetchError(`FPL ${res.status} for ${path}`, res.status);
    } catch (err) {
      // A caller-requested cancellation is not a failure to retry against —
      // retrying it twice and then reporting a generic FplFetchError destroyed
      // the cancellation semantics the signal exists for (#178). A timeout
      // aborts the internal controller only, so it still falls through and
      // retries as before.
      if (signal?.aborted) throw err;
      // 4xx already thrown above. Anything else (network, timeout, parse) loops.
      if (err instanceof FplFetchError && err.status !== null && err.status < 500) {
        throw err;
      }
      lastErr = err;
    }
  }

  if (lastErr instanceof FplFetchError) throw lastErr;
  throw new FplFetchError(`FPL request failed after ${MAX_ATTEMPTS} attempts`, null, lastErr);
}
