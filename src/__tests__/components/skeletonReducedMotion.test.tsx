jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { AccessibilityInfo } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { Skeleton } from '@/components/ui/Skeleton';

describe('<Skeleton /> reduced motion', () => {
  afterEach(() => jest.restoreAllMocks());

  it('consults the reduce-motion setting on mount', () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    render(<Skeleton testID="sk" />);
    expect(spy).toHaveBeenCalled();
  });

  it('still renders when reduce-motion is enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const r = render(<Skeleton testID="sk" />);
    await act(async () => {});
    expect(r.getByTestId('sk')).toBeTruthy();
  });
});
