import { Share } from 'react-native';

const mockCanOpenURL = jest.fn();
const mockOpenURL = jest.fn();

jest.mock('expo-linking', () => ({
  canOpenURL: (u: string) => mockCanOpenURL(u),
  openURL: (u: string) => mockOpenURL(u),
}));

import { shareApp, sendFeedback } from '@/lib/external';
import { APP_STORE_URL, FEEDBACK_EMAIL } from '@/constants/links';

let shareSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
});

afterEach(() => shareSpy.mockRestore());

describe('shareApp', () => {
  it('shares the store URL', async () => {
    await shareApp();
    expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: APP_STORE_URL }),
    );
  });
});

describe('sendFeedback', () => {
  it('opens a mailto URL when supported', async () => {
    mockCanOpenURL.mockResolvedValueOnce(true);
    mockOpenURL.mockResolvedValueOnce(undefined);
    const r = await sendFeedback();
    expect(r).toEqual({ ok: true });
    expect(mockOpenURL).toHaveBeenCalledWith(
      expect.stringContaining(`mailto:${FEEDBACK_EMAIL}`),
    );
  });

  it('returns ok:false and does not open when unsupported', async () => {
    mockCanOpenURL.mockResolvedValueOnce(false);
    const r = await sendFeedback();
    expect(r).toEqual({ ok: false });
    expect(mockOpenURL).not.toHaveBeenCalled();
  });
});
