jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

describe('supabase client singleton', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('throws when env vars are missing from expo extra', () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: {} } },
    }));

    expect(() => require('@/lib/supabase')).toThrow(/Missing EXPO_PUBLIC_SUPABASE_/);
  });

  it('creates a client when env vars are present', () => {
    const createClient = jest.fn(() => ({ from: jest.fn() }));
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        expoConfig: {
          extra: {
            supabaseUrl: 'https://test.supabase.co',
            supabaseAnonKey: 'test-anon-key',
          },
        },
      },
    }));
    jest.doMock('@supabase/supabase-js', () => ({ createClient }));

    const mod = require('@/lib/supabase');
    expect(mod.supabase).toBeDefined();
    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({
        auth: expect.objectContaining({
          storage: expect.anything(),
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        }),
      }),
    );
  });

  it('throws when only one env var is present', () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        expoConfig: {
          extra: {
            supabaseUrl: 'https://test.supabase.co',
            // supabaseAnonKey intentionally missing
          },
        },
      },
    }));
    expect(() => require('@/lib/supabase')).toThrow(/Missing EXPO_PUBLIC_SUPABASE_/);
  });
});
