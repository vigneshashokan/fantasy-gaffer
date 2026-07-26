import React from 'react';
import { Dimensions } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

// Same mock header as signupScreen.test.tsx
const mockSignUp = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  signUpWithEmail: (...args: unknown[]) => mockSignUp(...args),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    replace: (p: string) => mockReplace(p),
    back: () => mockBack(),
    push: (p: string) => mockPush(p),
  },
  useRouter: () => ({ push: (p: string) => mockPush(p) }),
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

import Signup from '@/app/(onboarding)/signup';
import Landing from '@/app/(onboarding)/index';

describe('signup legal links a11y', () => {
  it('exposes Terms and Privacy as links', () => {
    const { getByText } = render(<Signup />);
    expect(getByText('Terms of Service').props.accessibilityRole).toBe('link');
    expect(getByText('Privacy Policy').props.accessibilityRole).toBe('link');
  });
});

// #180: forgot-password's identical field announced its error; signin's and
// signup's did not.
describe('signup field errors a11y', () => {
  it('marks field validation errors as assertive live regions', () => {
    const { getAllByText, getByText } = render(<Signup />);
    fireEvent.press(getByText('Create account'));
    // "Required" fires for both name fields; the password rule is distinct.
    for (const node of getAllByText('Required')) {
      expect(node.props.accessibilityLiveRegion).toBe('assertive');
    }
    expect(getByText('At least 8 characters').props.accessibilityLiveRegion).toBe('assertive');
  });
});

// #180: the dots were reachable buttons but never said which one was current.
describe('onboarding pager dots a11y', () => {
  it('marks the current slide selected', () => {
    const { getByLabelText, getByTestId } = render(<Landing />);
    expect(getByLabelText('Go to slide 1').props.accessibilityState?.selected).toBe(true);
    expect(getByLabelText('Go to slide 2').props.accessibilityState?.selected).toBe(false);

    // Since #181 the slides live in a paged ScrollView and `onScroll` owns the
    // index — tapping a dot only calls scrollTo, and the real ScrollView then
    // reports the landed page. (Setting the index on tap as well would flash
    // the target and snap back on the scroll's first frame.) A programmatic
    // scrollTo fires no onScroll under jest, so drive the scroll directly, the
    // way the swipe test in uxPolish.test.tsx does.
    const { width, height } = Dimensions.get('window');
    fireEvent.scroll(getByTestId('onboarding-pager'), {
      nativeEvent: {
        contentOffset: { x: width * 2, y: 0 },
        contentSize: { width: width * 3, height },
        layoutMeasurement: { width, height },
      },
    });

    expect(getByLabelText('Go to slide 3').props.accessibilityState?.selected).toBe(true);
    expect(getByLabelText('Go to slide 1').props.accessibilityState?.selected).toBe(false);
  });
});
