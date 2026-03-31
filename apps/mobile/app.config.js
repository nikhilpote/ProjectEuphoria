/**
 * Dynamic Expo config — reads environment variables at build time.
 *
 * Usage:
 *   Dev (local):     npx expo start                          (uses defaults)
 *   Preview build:   API_URL=https://api.xyz.com eas build --profile preview
 *   Production:      API_URL=https://api.xyz.com eas build --profile production
 */

const IS_PROD = process.env.APP_ENV === 'production';
const API_URL = process.env.API_URL ?? 'http://192.168.0.121:3000';

module.exports = {
  expo: {
    name: IS_PROD ? 'Euphoria' : 'Euphoria (Dev)',
    slug: 'euphoria',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'euphoria',
    userInterfaceStyle: 'dark',

    splash: {
      image: './assets/images/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#0A0A0F',
    },

    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.euphoria.app',
      usesAppleSignIn: true,
      infoPlist: {
        NSMicrophoneUsageDescription: 'Euphoria uses audio for live shows.',
        NSCameraUsageDescription: 'Euphoria may use camera for profile photos.',
      },
    },

    android: {
      package: 'com.euphoria.app',
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#0A0A0F',
      },
      // Allow HTTP in dev builds (local API); prod builds use HTTPS so this is safe
      usesCleartextTraffic: !IS_PROD,
      permissions: [
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
      ],
    },

    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },

    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-apple-authentication',
      [
        'expo-av',
        {
          microphonePermission: false, // video playback only, no recording
        },
      ],
    ],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      apiUrl: `${API_URL}/api/v1`,
      socketUrl: API_URL,
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? 'YOUR_EAS_PROJECT_ID',
      },
    },
  },
};
