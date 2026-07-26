// src/__tests__/api/fpl-client.test.ts
import { fplGet, FplFetchError } from '@/api/fpl-client';

describe('fpl-client', () => {
  const FAKE_URL = '/entry/12345/';

  beforeEach(() => {
    jest.resetAllMocks();
    (global as any).fetch = jest.fn();
  });

  it('hits the FPL base URL with the given path and parses JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 12345, name: 'Test Team' }),
    });

    const result = await fplGet<{ id: number; name: string }>(FAKE_URL);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://fantasy.premierleague.com/api/entry/12345/',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual({ id: 12345, name: 'Test Team' });
  });

  it('retries twice on 5xx then succeeds', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true,  status: 200, json: async () => ({ ok: 1 }) });

    const result = await fplGet<{ ok: number }>(FAKE_URL);

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ ok: 1 });
  });

  it('does not retry on 4xx — throws FplFetchError immediately', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not found' }),
    });

    await expect(fplGet(FAKE_URL)).rejects.toBeInstanceOf(FplFetchError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws FplFetchError after exhausting all 3 retries on 5xx', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    });

    await expect(fplGet(FAKE_URL)).rejects.toBeInstanceOf(FplFetchError);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('retries on network error and surfaces FplFetchError on final failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    await expect(fplGet(FAKE_URL)).rejects.toBeInstanceOf(FplFetchError);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});

describe('FPL_BASE resolution (E2E seam)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo-constants');
  });

  it('uses the production base URL when extra.fplBaseUrl is unset', () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: {} } },
    }));
    let base = '';
    jest.isolateModules(() => {
      base = require('@/api/fpl-client').FPL_BASE;
    });
    expect(base).toBe('https://fantasy.premierleague.com/api');
  });

  it('uses extra.fplBaseUrl when set', () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: { fplBaseUrl: 'http://127.0.0.1:4004' } } },
    }));
    let base = '';
    jest.isolateModules(() => {
      base = require('@/api/fpl-client').FPL_BASE;
    });
    expect(base).toBe('http://127.0.0.1:4004');
  });
});

// #178 — fetch used to receive `signal ?? controller.signal`, so whenever a
// caller supplied one the timeout aborted a controller nobody was listening to
// and a hung request never timed out at all. It also retried an external abort
// twice and reported it as a generic FplFetchError, destroying the cancellation
// semantics the signal exists for. Latent today (no caller passes one yet), but
// this is the query-cancellation seam.
describe('caller-supplied AbortSignal (#178)', () => {
  const URL_PATH = '/entry/12345/';

  beforeEach(() => {
    jest.resetAllMocks();
    (global as any).fetch = jest.fn();
  });

  it('still drives fetch from the internal controller so the timeout can bite', async () => {
    const external = new AbortController();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ ok: true }),
    });

    await fplGet(URL_PATH, external.signal);

    const passed = (global.fetch as jest.Mock).mock.calls[0][1].signal as AbortSignal;
    // Not the caller's signal — an internal one the timeout also owns.
    expect(passed).not.toBe(external.signal);
  });

  it('propagates an external abort without retrying it', async () => {
    const external = new AbortController();
    external.abort();
    (global.fetch as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Aborted'), { name: 'AbortError' }),
    );

    await expect(fplGet(URL_PATH, external.signal)).rejects.toThrow('Aborted');
    // One attempt only: a cancellation is not something to retry against.
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
  });

  it('still retries a network failure when no signal was supplied', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });

    await expect(fplGet(URL_PATH)).resolves.toEqual({ ok: true });
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(2);
  });
});
