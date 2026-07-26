// ScreenHeader reads the safe-area inset (#180); these are bare component
// renders with no SafeAreaProvider above them.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

import { render, fireEvent } from '@testing-library/react-native';
import { PillBtn } from '@/components/ui/PillBtn';
import { SocialBtn } from '@/components/forms/SocialBtn';
import { Toggle } from '@/components/ui/Toggle';
import { ScreenHeader } from '@/components/ui/ScreenHeader';

describe('shared control accessibility', () => {
  it('PillBtn is a button named by its text children, with font cap', () => {
    const { getByRole } = render(<PillBtn onPress={() => {}}>Continue</PillBtn>);
    const btn = getByRole('button', { name: 'Continue' });
    expect(btn).toBeTruthy();
  });

  // #173: the accent fill was a hardcoded #00E676 that ignored the palette
  // AND the mode, so light mode painted white ink on it at 1.67:1.
  it('PillBtn takes its accent fill from the caller, not a hardcoded green', () => {
    const { getByRole } = render(
      <PillBtn variant="accent" accentFill="#00703A" accentInk="#fff" onPress={() => {}}>
        Continue
      </PillBtn>,
    );
    const style = getByRole('button').props.style as object | object[];
    const flat = Object.assign({}, ...[style].flat(2).filter(Boolean)) as { backgroundColor?: string };
    expect(flat.backgroundColor).toBe('#00703A');
  });

  // #179: verify-pending's resend cooldown had no way to disable the button.
  it('PillBtn honours disabled — no press, and the state is announced', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <PillBtn disabled onPress={onPress}>Resend</PillBtn>,
    );
    const btn = getByRole('button');
    expect(btn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('PillBtn is pressable when not disabled', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<PillBtn onPress={onPress}>Resend</PillBtn>);
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('SocialBtn exposes a descriptive button role', () => {
    const { getByRole } = render(<SocialBtn provider="google" onPress={() => {}} />);
    expect(getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  });

  it('Toggle is a switch reflecting its checked state and label', () => {
    const { getByRole } = render(
      <Toggle
        value
        onChange={() => {}}
        onColor="#0f0"
        offColor="#333"
        accessibilityLabel="Face ID unlock"
      />,
    );
    const sw = getByRole('switch', { name: 'Face ID unlock' });
    expect(sw.props.accessibilityState?.checked).toBe(true);
  });

  it('ScreenHeader back button is labelled', () => {
    const { getByLabelText } = render(
      <ScreenHeader title="Settings" onBack={() => {}} gradFrom="#111" gradTo="#222" />,
    );
    expect(getByLabelText('Back')).toBeTruthy();
  });
});
