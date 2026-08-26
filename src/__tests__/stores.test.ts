jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { act } from 'react';
import { Appearance } from 'react-native';
import { useThemeStore, migrateThemeState } from '../store/themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ paletteKey: 'classic', scheme: 'light', dark: false, pitchStyle: 'realistic' });
  });

  it('initialises with classic light realistic', () => {
    const s = useThemeStore.getState();
    expect(s.paletteKey).toBe('classic');
    expect(s.dark).toBe(false);
    expect(s.pitchStyle).toBe('realistic');
  });

  it('resolves an explicit choice to that theme, device be damned', () => {
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');
    act(() => useThemeStore.getState().setScheme('dark'));
    expect(useThemeStore.getState()).toMatchObject({ scheme: 'dark', dark: true });
  });

  it('resolves System off the device appearance', () => {
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');
    act(() => useThemeStore.getState().setScheme('system'));
    expect(useThemeStore.getState()).toMatchObject({ scheme: 'system', dark: true });

    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');
    act(() => useThemeStore.getState().setScheme('system'));
    expect(useThemeStore.getState().dark).toBe(false);
  });

  // Without this an existing user's explicit choice merges to the 'system'
  // default on first launch after the update, and their app silently starts
  // following the OS instead.
  it('reads a pre-scheme blob\'s dark flag back as an explicit choice', () => {
    expect(migrateThemeState({ dark: true, paletteKey: 'pitch' }, 0).scheme).toBe('dark');
    expect(migrateThemeState({ dark: false, paletteKey: 'pitch' }, 0).scheme).toBe('light');
    expect(migrateThemeState({ dark: true, scheme: 'system' }, 1).scheme).toBe('system');
  });

  it('sets pitch style', () => {
    act(() => useThemeStore.getState().setPitchStyle('flat'));
    expect(useThemeStore.getState().pitchStyle).toBe('flat');
  });
});

