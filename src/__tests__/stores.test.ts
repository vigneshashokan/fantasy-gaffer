jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { act } from 'react';
import { useThemeStore } from '../store/themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ paletteKey: 'classic', dark: false, pitchStyle: 'realistic' });
  });

  it('initialises with classic light realistic', () => {
    const s = useThemeStore.getState();
    expect(s.paletteKey).toBe('classic');
    expect(s.dark).toBe(false);
    expect(s.pitchStyle).toBe('realistic');
  });

  it('toggles dark mode', () => {
    act(() => useThemeStore.getState().setDark(true));
    expect(useThemeStore.getState().dark).toBe(true);
  });

  it('sets pitch style', () => {
    act(() => useThemeStore.getState().setPitchStyle('flat'));
    expect(useThemeStore.getState().pitchStyle).toBe('flat');
  });
});

