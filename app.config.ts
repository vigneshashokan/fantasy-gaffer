import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Fantasy Gaffer',
  slug: 'fantasy-gaffer',
  owner: 'fantasygaffers-org',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/logos/logo-mark.png',
  scheme: 'fplgafferreactnativeapp',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.fantasygaffer.app',
    icon: './assets/logos/logo-mark.png',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
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
  },
};

export default config;
