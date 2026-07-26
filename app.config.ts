import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Fantasy Gaffer',
  slug: 'fantasy-gaffer',
  owner: 'fantasygaffers-org',
  version: '1.0.0',
  orientation: 'portrait',
  // 1024x1024, square, NO alpha — App Store Connect rejects anything else
  // (logo-mark.png is 574x401 with transparency, so it can't be the icon).
  // Regenerate: crop logo-mark.png to its bbox, scale to 74% width, centre on #00E676, flatten.
  icon: './assets/logos/icon.png',
  scheme: 'fplgafferreactnativeapp',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.fantasygaffer.app',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
    // Universal Links for the auth emails (#71). The host must serve
    // /.well-known/apple-app-site-association claiming /verify and
    // /reset-password — it does, from the fantasy-gaffer-site repo. Keep in
    // sync with AUTH_LINK_HOST in src/constants/links.ts. iOS fetches the
    // association at install time, so publishing the file has to come first.
    associatedDomains: ['applinks:fantasy-gaffer.com'],
  },
  android: {
    package: 'com.fantasygaffer.app',
    adaptiveIcon: {
      backgroundColor: '#37003C',
      foregroundImage: './assets/logos/logo-mark-light.png',
      monochromeImage: './assets/logos/logo-mark-light.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/logos/logo-mark.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#37003C',
        image: './assets/logos/logo-mark-light.png',
        imageWidth: 120,
      },
    ],
    'expo-font',
    [
      'expo-notifications',
      {
        color: '#37003C',
      },
    ],
    'expo-web-browser',
    '@react-native-community/datetimepicker',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Allow $(PRODUCT_NAME) to use Face ID to sign you in.',
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: { projectId: 'c0fe66cb-f0e7-4f6a-a0fb-2c927022a5af' },
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    fplBaseUrl: process.env.EXPO_PUBLIC_FPL_BASE_URL,
    // Mirror of src/constants/links.ts (PRIVACY_URL / TERMS_URL). Inlined rather
    // than imported: the @expo/config loader can't resolve a relative .ts import
    // here. Keep these in sync with links.ts. Consumed by store submission (#45).
    privacyPolicyUrl: 'https://fantasy-gaffer.com/privacy',
    termsUrl: 'https://fantasy-gaffer.com/terms',
  },
};

export default config;
