export interface FetchJsonOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
}

const USER_AGENT = 'fantasy-gaffer/1.0 (https://github.com/vigneshashokan/fantasy-gaffer)';

export async function fetchJson<T>(
  url: string,
  opts: FetchJsonOptions = {},
): Promise<T> {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retryDelayMs = opts.retryDelayMs ?? 2_000;
  // One retry, as before. This change broadens WHICH failures are retried,
  // deliberately not how many times — that is a separate tuning decision.
  const MAX_RETRIES = 1;

  const attempt = async (): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetchFn(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  // Retries covered 5xx only, so a timeout, a dropped connection or a 429
  // failed the whole run outright even though all three are transient. Those
  // now back off too; other 4xx stay terminal, because retrying them changes
  // nothing (#177).
  const retriable = (status: number) => status >= 500 || status === 429;
  let res: Response | null = null;
  let lastErr: unknown = null;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, retryDelayMs * i));
    try {
      res = await attempt();
      lastErr = null;
      if (!retriable(res.status)) break;
    } catch (err) {
      // AbortError (our timeout) and network faults land here.
      lastErr = err;
      res = null;
    }
  }
  if (lastErr) throw lastErr;
  if (!res || !res.ok) {
    throw new Error(
      `FPL fetch failed: ${res ? `${res.status} ${res.statusText}` : 'no response'} for ${url}`,
    );
  }
  return (await res.json()) as T;
}
