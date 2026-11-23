/**
 * Expo inlines EXPO_PUBLIC_* variables at build time. Declare the ones the
 * app reads so TypeScript knows about `process.env` without pulling in Node types.
 */
declare const process: {
  env: {
    EXPO_PUBLIC_BACKEND_URL?: string;
    EXPO_PUBLIC_USE_MOCKS?: string;
    EXPO_PUBLIC_APP_KEY?: string;
  };
};
