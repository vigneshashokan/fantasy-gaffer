const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockResetPasswordForEmail = jest.fn();
const mockUpdateUser = jest.fn();
const mockSignOut = jest.fn();
const mockResend = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (args: unknown) => mockSignInWithPassword(args),
      signUp: (args: unknown) => mockSignUp(args),
      resetPasswordForEmail: (email: string, options: unknown) => mockResetPasswordForEmail(email, options),
      updateUser: (args: unknown) => mockUpdateUser(args),
      signOut: (args: unknown) => mockSignOut(args),
      resend: (args: unknown) => mockResend(args),
    },
  },
}));

import { signInWithEmail, signUpWithEmail, sendPasswordReset, resetPassword, resendVerification } from '@/lib/auth/email';

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

  it('maps message-only "Invalid login credentials" (no code field) to invalid_credentials', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { status: 400, message: 'Invalid login credentials' },
    });
    const r = await signInWithEmail('a@b.co', 'wrong');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('invalid_credentials');
  });

  it('maps message-only "Invalid login credentials" case-insensitively', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { message: 'invalid login credentials' },
    });
    const r = await signInWithEmail('a@b.co', 'wrong');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('invalid_credentials');
  });
});

describe('signUpWithEmail', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
  });

  it('calls supabase with email, password, given_name+family_name metadata, and emailRedirectTo', async () => {
    mockSignUp.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    const r = await signUpWithEmail({
      email: 'ada@example.com',
      password: 'Strong1Pass',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'Strong1Pass',
      options: {
        data: { given_name: 'Ada', family_name: 'Lovelace' },
        emailRedirectTo: 'fplgafferreactnativeapp://verify',
      },
    });
    expect(r.ok).toBe(true);
  });

  it('maps user_already_exists', async () => {
    mockSignUp.mockResolvedValueOnce({
      data: null,
      error: { code: 'user_already_exists', message: 'User already registered' },
    });
    const r = await signUpWithEmail({
      email: 'a@b.co',
      password: 'Strong1Pass',
      firstName: 'A',
      lastName: 'B',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('user_already_exists');
  });

  it('maps weak_password', async () => {
    mockSignUp.mockResolvedValueOnce({
      data: null,
      error: { code: 'weak_password', message: 'Password too weak' },
    });
    const r = await signUpWithEmail({
      email: 'a@b.co',
      password: 'Strong1Pass',
      firstName: 'A',
      lastName: 'B',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('weak_password');
  });
});

describe('sendPasswordReset', () => {
  beforeEach(() => {
    mockResetPasswordForEmail.mockReset();
  });

  it('calls supabase with email + redirectTo', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const r = await sendPasswordReset('a@b.co');
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('a@b.co', {
      redirectTo: 'fplgafferreactnativeapp://reset-password',
    });
    expect(r.ok).toBe(true);
  });

  it('returns ok even when supabase returns an error (no enumeration)', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { code: 'something_bad', message: 'nope' },
    });
    const r = await sendPasswordReset('a@b.co');
    expect(r.ok).toBe(true);
  });

  it('returns ok even when supabase throws (no enumeration)', async () => {
    mockResetPasswordForEmail.mockRejectedValueOnce(new Error('boom'));
    const r = await sendPasswordReset('a@b.co');
    expect(r.ok).toBe(true);
  });
});

describe('resetPassword', () => {
  beforeEach(() => {
    mockUpdateUser.mockReset();
    mockSignOut.mockReset();
  });

  it('updates password and signs out other devices on success', async () => {
    mockUpdateUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    mockSignOut.mockResolvedValueOnce({ error: null });
    const r = await resetPassword('NewStrong1');
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewStrong1' });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(r.ok).toBe(true);
  });

  it('returns ok even if signOut others fails (best-effort)', async () => {
    mockUpdateUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    mockSignOut.mockRejectedValueOnce(new Error('boom'));
    const r = await resetPassword('NewStrong1');
    expect(r.ok).toBe(true);
  });

  it('maps weak_password from updateUser', async () => {
    mockUpdateUser.mockResolvedValueOnce({
      data: null,
      error: { code: 'weak_password', message: 'Too weak' },
    });
    const r = await resetPassword('weak');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('weak_password');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('maps expired_link / otp_expired from updateUser', async () => {
    mockUpdateUser.mockResolvedValueOnce({
      data: null,
      error: { code: 'otp_expired', message: 'Token expired' },
    });
    const r = await resetPassword('NewStrong1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('expired_link');
  });
});

describe('resendVerification', () => {
  beforeEach(() => {
    mockResend.mockReset();
  });

  it('calls supabase resend with type=signup and the email', async () => {
    mockResend.mockResolvedValueOnce({ data: {}, error: null });
    const r = await resendVerification('a@b.co');
    expect(mockResend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.co' });
    expect(r.ok).toBe(true);
  });

  it('maps over_email_send_rate_limit to rate_limited', async () => {
    mockResend.mockResolvedValueOnce({
      data: null,
      error: { code: 'over_email_send_rate_limit', message: 'Try again later' },
    });
    const r = await resendVerification('a@b.co');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('rate_limited');
  });
});
