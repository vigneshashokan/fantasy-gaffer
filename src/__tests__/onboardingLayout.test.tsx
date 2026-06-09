import React from 'react';
import { render } from '@testing-library/react-native';

const mockRedirect = jest.fn();
const mockStack = jest.fn();
let mockSession: { user: { id: string } } | null = null;
let mockProfileStatus: 'loading' | 'missing' | 'complete' = 'loading';
let mockSegments: string[] = [];

jest.mock('expo-router', () => ({
  __esModule: true,
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
  Stack: (props: unknown) => {
    mockStack(props);
    return null;
  },
  useSegments: () => mockSegments,
}));

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: unknown }) => unknown) =>
    selector({ session: mockSession }),
}));

jest.mock('@/lib/useProfileGate', () => ({
  __esModule: true,
  useProfileGate: () => ({ status: mockProfileStatus }),
}));

import OnboardingLayout from '@/app/(onboarding)/_layout';

describe('OnboardingLayout', () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    mockStack.mockReset();
    mockSession = null;
    mockProfileStatus = 'loading';
    mockSegments = [];
  });

  it('renders Stack when there is no session', () => {
    render(<OnboardingLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('redirects signed-in user with complete profile to home', () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'complete';
    mockSegments = ['(onboarding)', 'signin'];
    render(<OnboardingLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(home)/(tabs)/team');
  });

  it('keeps the user on reset-password even if their profile is complete', () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'complete';
    mockSegments = ['(onboarding)', 'reset-password'];
    render(<OnboardingLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('keeps the user on reset-password even if their profile is missing', () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'missing';
    mockSegments = ['(onboarding)', 'reset-password'];
    render(<OnboardingLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('redirects signed-in user with missing profile to complete-profile', () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'missing';
    mockSegments = ['(onboarding)', 'signin'];
    render(<OnboardingLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(onboarding)/complete-profile');
  });

  it('stays on complete-profile when already there with missing profile', () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'missing';
    mockSegments = ['(onboarding)', 'complete-profile'];
    render(<OnboardingLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });
});
