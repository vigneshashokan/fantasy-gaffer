export interface FetchJsonOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
}

const USER_AGENT = 'fpl-gaffer/1.0 (https://github.com/vigneshashokan/fpl-gaffer-react-native-app)';

export async function fetchJson<T>(
  url: string,
  opts: FetchJsonOptions = {},
): Promise<T> {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retryDelayMs = opts.retryDelayMs ?? 2_000;

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

  let res = await attempt();
  if (res.status >= 500 && res.status < 600) {
    await new Promise((r) => setTimeout(r, retryDelayMs));
    res = await attempt();
  }
  if (!res.ok) {
    throw new Error(`FPL fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as T;
}
