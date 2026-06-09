const mockSetItem = jest.fn();
const mockGetItem = jest.fn();
const mockDeleteItem = jest.fn();

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  setItemAsync: (k: string, v: string) => mockSetItem(k, v),
  getItemAsync: (k: string) => mockGetItem(k),
  deleteItemAsync: (k: string) => mockDeleteItem(k),
}));

import {
  saveSession,
  loadSession,
  clearSession,
} from '@/lib/auth/biometric/storage';

const SLOT = 'fpl_gaffer_biometric_session';

describe('saveSession', () => {
  beforeEach(() => {
    mockSetItem.mockReset();
  });

  it('writes a JSON-serialised session to the single slot', async () => {
    mockSetItem.mockResolvedValueOnce(undefined);
    await saveSession({ access_token: 'a', refresh_token: 'r', user_id: 'u1' });
    expect(mockSetItem).toHaveBeenCalledWith(
      SLOT,
      JSON.stringify({ access_token: 'a', refresh_token: 'r', user_id: 'u1' }),
    );
  });
});

describe('loadSession', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
  });

  it('returns parsed payload when slot is populated', async () => {
    mockGetItem.mockResolvedValueOnce(
      JSON.stringify({ access_token: 'a', refresh_token: 'r', user_id: 'u1' }),
    );
    expect(await loadSession()).toEqual({
      access_token: 'a',
      refresh_token: 'r',
      user_id: 'u1',
    });
  });

  it('returns null when slot is empty', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    expect(await loadSession()).toBeNull();
  });

  it('returns null when stored value is not valid JSON', async () => {
    mockGetItem.mockResolvedValueOnce('not-json{');
    expect(await loadSession()).toBeNull();
  });

  it('returns null when parsed value is missing required fields', async () => {
    mockGetItem.mockResolvedValueOnce(JSON.stringify({ access_token: 'a' }));
    expect(await loadSession()).toBeNull();
  });

  it('returns null when SecureStore throws', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('boom'));
    expect(await loadSession()).toBeNull();
  });
});

describe('clearSession', () => {
  beforeEach(() => {
    mockDeleteItem.mockReset();
  });

  it('deletes the slot', async () => {
    mockDeleteItem.mockResolvedValueOnce(undefined);
    await clearSession();
    expect(mockDeleteItem).toHaveBeenCalledWith(SLOT);
  });

  it('does not throw when SecureStore rejects', async () => {
    mockDeleteItem.mockRejectedValueOnce(new Error('boom'));
    await expect(clearSession()).resolves.toBeUndefined();
  });
});
