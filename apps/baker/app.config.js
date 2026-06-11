// apps/baker/app.config.js
//
// Dinamik Expo konfigürasyonu. APP_ENV env değişkeniyle staging/production seçimi.
// Detay: docs/staging-workflow.md ve docs/superpowers/specs/2026-06-10-staging-environment-design.md

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
    name: 'Pastacım Pro' + env.nameSuffix,
    slug: 'pastacim-baker',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'pastacim-pro' + env.schemeSuffix,
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.pastacim.baker' + env.bundleSuffix,
      usesAppleSignIn: true,
      config: {
        usesNonExemptEncryption: false,
      },
      entitlements: {
        'aps-environment': 'production',
        'keychain-access-groups': ['$(AppIdentifierPrefix)$(CFBundleIdentifier)'],
        'com.apple.developer.applesignin': ['Default'],
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
      package: 'com.pastacim.baker' + env.bundleSuffix,
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
      'expo-apple-authentication',
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
          color: '#9F7AEA',
          sounds: [],
        },
      ],
    ],
    updates: {
      url: 'https://u.expo.dev/c8d3415d-5bce-4b61-95eb-fa4134a91fe7',
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
        projectId: 'c8d3415d-5bce-4b61-95eb-fa4134a91fe7',
      },
      router: {
        origin: false,
      },
      supabaseUrl: env.supabaseUrl,
      supabaseAnonKey: env.supabaseAnonKey,
      googlePlacesApiKey: 'AIzaSyCunYQzVUP2Ue8HraYn-PIpx6jvpSSC4Zo',
      appEnv: ENV,
    },
    owner: 'anzelpatisserie',
  },
};
