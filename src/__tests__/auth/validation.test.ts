import {
  emailSchema,
  passwordSchema,
  signUpSchema,
  resetPasswordSchema,
} from '@/lib/auth/validation';

describe('emailSchema', () => {
  it('accepts a valid email and lowercases + trims', () => {
    const r = emailSchema.safeParse('  USER@Example.COM  ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('user@example.com');
  });

  it('rejects an invalid email', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a strong password', () => {
    expect(passwordSchema.safeParse('Strong1Pass').success).toBe(true);
  });

  it('rejects under 8 chars', () => {
    const r = passwordSchema.safeParse('Aa1');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('At least 8 characters');
  });

  it('rejects missing uppercase', () => {
    const r = passwordSchema.safeParse('alllower1');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('One uppercase letter');
  });

  it('rejects missing lowercase', () => {
    const r = passwordSchema.safeParse('ALLUPPER1');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('One lowercase letter');
  });

  it('rejects missing digit', () => {
    const r = passwordSchema.safeParse('NoDigitsHere');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('One number');
  });
});

describe('signUpSchema', () => {
  const valid = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'Strong1Pass',
    confirmPassword: 'Strong1Pass',
  };

  it('accepts a valid payload', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty firstName', () => {
    expect(signUpSchema.safeParse({ ...valid, firstName: '  ' }).success).toBe(false);
  });

  it('rejects mismatched confirmPassword with field-targeted issue', () => {
    const r = signUpSchema.safeParse({ ...valid, confirmPassword: 'Different1' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === 'confirmPassword');
      expect(issue?.message).toBe('Passwords do not match');
    }
  });
});

describe('resetPasswordSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      resetPasswordSchema.safeParse({
        password: 'Strong1Pass',
        confirmPassword: 'Strong1Pass',
      }).success,
    ).toBe(true);
  });

  it('rejects mismatched confirmPassword', () => {
    const r = resetPasswordSchema.safeParse({
      password: 'Strong1Pass',
      confirmPassword: 'Different1',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === 'confirmPassword');
      expect(issue?.message).toBe('Passwords do not match');
    }
  });
});
