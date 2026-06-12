jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import { render } from '@testing-library/react-native';
import { Skeleton } from '@/components/ui/Skeleton';

describe('<Skeleton />', () => {
  it('renders with the requested height', () => {
    const { getByTestId } = render(<Skeleton height={64} testID="sk" />);
    const el = getByTestId('sk');
    const flat = Array.isArray(el.props.style)
      ? Object.assign({}, ...el.props.style.filter(Boolean))
      : (el.props.style ?? {});
    expect(flat.height).toBe(64);
  });

  it('defaults to a sensible height when none is provided', () => {
    const { getByTestId } = render(<Skeleton testID="sk" />);
    const el = getByTestId('sk');
    const flat = Array.isArray(el.props.style)
      ? Object.assign({}, ...el.props.style.filter(Boolean))
      : (el.props.style ?? {});
    expect(flat.height).toBeGreaterThan(0);
  });
});
