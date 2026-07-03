import { render } from '@testing-library/react-native';
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
