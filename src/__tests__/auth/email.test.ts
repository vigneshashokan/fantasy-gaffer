const mockSignInWithPassword = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (args: unknown) => mockSignInWithPassword(args),
    },
  },
}));

import { signInWithEmail } from '@/lib/auth/email';

describe('signInWithEmail', () => {
  beforeEach(() => {
    mockSignInWithPassword.mockReset();
  });

  it('calls supabase with email + password and returns ok on success', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    const r = await signInWithEmail('a@b.co', 'Secret123');
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'Secret123' });
    expect(r.ok).toBe(true);
  });

  it('maps Invalid login credentials to invalid_credentials', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });
    const r = await signInWithEmail('a@b.co', 'wrong');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('invalid_credentials');
  });

  it('maps email_not_confirmed', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    });
    const r = await signInWithEmail('a@b.co', 'Secret123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('email_not_confirmed');
  });

  it('maps 429 / over_request_rate_limit to rate_limited', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { status: 429, message: 'Too many requests' },
    });
    const r = await signInWithEmail('a@b.co', 'Secret123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('rate_limited');
  });

  it('maps thrown network errors to network', async () => {
    mockSignInWithPassword.mockRejectedValueOnce(new TypeError('Network request failed'));
    const r = await signInWithEmail('a@b.co', 'Secret123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('network');
  });

  it('falls back to unknown for unmapped Supabase errors', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: 'some_other_code', message: '???' },
    });
    const r = await signInWithEmail('a@b.co', 'Secret123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unknown');
  });
});
