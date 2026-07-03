jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { OfflineBanner } from '@/components/OfflineBanner';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderBanner() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <OfflineBanner />
    </SafeAreaProvider>,
  );
}

describe('OfflineBanner', () => {
  beforeEach(() => (useNetInfo as jest.Mock).mockReturnValue({ isConnected: true }));

  it('shows the offline message when disconnected', () => {
    (useNetInfo as jest.Mock).mockReturnValue({ isConnected: false });
    const r = renderBanner();
    expect(r.getByText("You're offline — showing your last saved data")).toBeTruthy();
    const banner = r.getByTestId('offline-banner');
    expect(banner).toBeTruthy();
    expect(banner.props.accessibilityLiveRegion).toBe('polite');
  });

  it('renders nothing when connected', () => {
    expect(renderBanner().queryByTestId('offline-banner')).toBeNull();
  });

  it('renders nothing while connectivity is unknown (null)', () => {
    (useNetInfo as jest.Mock).mockReturnValue({ isConnected: null });
    expect(renderBanner().queryByTestId('offline-banner')).toBeNull();
  });
});
