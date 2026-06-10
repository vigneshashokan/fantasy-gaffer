import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'FPL Gaffer',
  slug: 'fpl-gaffer-react-native-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/logos/logo-mark.png',
  scheme: 'fplgafferreactnativeapp',
  userInterfaceStyle: 'automatic',
  ios: {
    icon: './assets/logos/logo-mark.png',
  },
  android: {
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
    'expo-web-browser',
    '@react-native-community/datetimepicker',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Allow $(PRODUCT_NAME) to use Face ID to sign you in.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default config;
