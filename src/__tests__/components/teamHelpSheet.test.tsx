import { render, fireEvent } from '@testing-library/react-native';
import { TeamHelpSheet } from '@/components/connect-team/TeamHelpSheet';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('<TeamHelpSheet />', () => {
  it('renders nothing when not visible', () => {
    const { queryByText } = render(
      <TeamHelpSheet visible={false} onClose={() => {}} />,
    );
    expect(queryByText(/My Team/)).toBeNull();
  });

  it('renders the three help lines when visible', () => {
    const { getByText } = render(
      <TeamHelpSheet visible={true} onClose={() => {}} />,
    );
    expect(getByText(/Open the official FPL app/)).toBeTruthy();
    expect(getByText(/My Team/)).toBeTruthy();
    expect(getByText(/Settings/)).toBeTruthy();
  });

  it('fires onClose when the Got it button is tapped', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <TeamHelpSheet visible={true} onClose={onClose} />,
    );
    fireEvent.press(getByText('Got it'));
    expect(onClose).toHaveBeenCalled();
  });
});
