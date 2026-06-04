import { useAuthStore } from '@/store/authStore';

describe('authStore', () => {
  beforeEach(() => useAuthStore.setState({ signedIn: false }));

  it('initial state is signed out', () => {
    expect(useAuthStore.getState().signedIn).toBe(false);
  });

  it('signIn flips state to true', () => {
    useAuthStore.getState().signIn();
    expect(useAuthStore.getState().signedIn).toBe(true);
  });

  it('signOut flips state back to false', () => {
    useAuthStore.getState().signIn();
    useAuthStore.getState().signOut();
    expect(useAuthStore.getState().signedIn).toBe(false);
  });
});
