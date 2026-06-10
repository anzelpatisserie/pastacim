// apps/customer/app.config.js
//
// Dinamik Expo konfigürasyonu. APP_ENV env değişkeniyle staging/production seçimi.
// Detay: docs/staging-workflow.md ve docs/superpowers/specs/2026-06-10-staging-environment-design.md
//
// Lokal: APP_ENV=staging npx expo start
// EAS:   eas.json içindeki profile env bloğu APP_ENV'i set eder.

const ENV = process.env.APP_ENV ?? 'production';

const envs = {
  staging: {
    nameSuffix: ' (Staging)',
    bundleSuffix: '.staging',
    schemeSuffix: '-staging',
    // TODO: Task 1'den (staging Supabase projesi) sonra doldur:
    supabaseUrl: process.env.STAGING_SUPABASE_URL ?? 'https://REPLACE_ME.supabase.co',
    supabaseAnonKey: process.env.STAGING_SUPABASE_ANON_KEY ?? 'sb_publishable_REPLACE_ME',
    channel: 'staging',
  },
  production: {
    nameSuffix: '',
    bundleSuffix: '',
    schemeSuffix: '',
    supabaseUrl: 'https://lvrbzhziayegyinkcuka.supabase.co',
    supabaseAnonKey: 'sb_publishable_GRPzr4yIvnC54VpN6G7K3A_awa6OyWp',
    channel: 'production',
  },
};

const env = envs[ENV];
if (!env) throw new Error(`Unknown APP_ENV: ${ENV}`);

module.exports = {
  expo: {
    name: 'Pastacım' + env.nameSuffix,
    slug: 'pastacim-customer',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'pastacim' + env.schemeSuffix,
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.pastacim.customer' + env.bundleSuffix,
      buildNumber: '1',
      entitlements: {
        'aps-environment': 'production',
        'keychain-access-groups': ['$(AppIdentifierPrefix)$(CFBundleIdentifier)'],
      },
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
        NSLocationWhenInUseUsageDescription:
          'Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.',
        NSLocationAlwaysUsageDescription:
          'Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.',
        NSCameraUsageDescription:
          'Geri bildirim ekran görüntüsü veya fotoğraf için kamera erişimi gerekir.',
        NSPhotoLibraryUsageDescription:
          'Sipariş veya dükkan görseli seçmek için fotoğraflarınıza erişim gerekir.',
        NSMicrophoneUsageDescription:
          'Uygulama mikrofon kullanmamaktadır; sistem gerekliliği nedeniyle beyan edilmiştir.',
        NSMotionUsageDescription:
          'Uygulama hareket sensörü kullanmamaktadır; sistem gerekliliği nedeniyle beyan edilmiştir.',
        LSApplicationQueriesSchemes: ['message', 'googlegmail'],
      },
    },
    android: {
      package: 'com.pastacim.customer' + env.bundleSuffix,
      versionCode: 1,
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        backgroundColor: '#000000',
        foregroundImage: './assets/images/android-icon-foreground.png',
      },
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
    },
    plugins: [
      'expo-router',
      'expo-location',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          resizeMode: 'cover',
          backgroundColor: '#8B1A3D',
        },
      ],
      'expo-secure-store',
      [
        'expo-notifications',
        {
          icon: './assets/images/icon.png',
          color: '#D4526E',
          sounds: [],
        },
      ],
    ],
    updates: {
      url: 'https://u.expo.dev/d513dbc9-8da6-4051-995f-6a7a40b37586',
      enabled: true,
      fallbackToCacheTimeout: 0,
      checkAutomatically: 'ON_LOAD',
      requestHeaders: {
        'expo-channel-name': env.channel,
      },
    },
    runtimeVersion: '1.0.0',
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: 'd513dbc9-8da6-4051-995f-6a7a40b37586',
      },
      router: {
        origin: false,
      },
      supabaseUrl: env.supabaseUrl,
      supabaseAnonKey: env.supabaseAnonKey,
      appEnv: ENV,
    },
    owner: 'anzelpatisserie',
  },
};
