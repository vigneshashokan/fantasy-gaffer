jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { AccessibilityInfo } from 'react-native';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { OfflineBanner } from '@/components/OfflineBanner';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('OfflineBanner announcement', () => {
  it('announces and marks a polite live region when offline', () => {
    const spy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    (useNetInfo as jest.Mock).mockReturnValue({ isConnected: false });
    const r = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <OfflineBanner />
      </SafeAreaProvider>,
    );
    const bar = r.getByTestId('offline-banner');
    expect(bar.props.accessibilityLiveRegion).toBe('polite');
    expect(spy).toHaveBeenCalledWith(
      "You're offline — showing your last saved data",
    );
  });
});
