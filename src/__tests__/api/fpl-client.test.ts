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
