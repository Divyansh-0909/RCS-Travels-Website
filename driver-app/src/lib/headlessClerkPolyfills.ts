import 'react-native-url-polyfill/auto';
import * as ExpoCrypto from 'expo-crypto';

/**
 * Clerk's Expo package installs URL on native, but a TaskManager wake is not a
 * browser and React Native does not provide `window.location`. Clerk's
 * development-session bootstrap still uses `window.location.href` while
 * loading a headless instance, before we can ask it for a session token.
 *
 * Give that code a neutral URL-shaped base. This is not an API or redirect
 * destination; it is only the browser location Clerk expects while composing
 * its own request URLs. A URL instance supplies the href/origin/search fields
 * without adding browser navigation behavior to the background task.
 */
type NativeRuntime = {
  window?: NativeRuntime;
  location?: URL;
  isSecureContext?: boolean;
  addEventListener?: (type: string, listener: (...args: unknown[]) => void) => void;
  removeEventListener?: (type: string, listener: (...args: unknown[]) => void) => void;
  dispatchEvent?: (event: unknown) => boolean;
  crypto?: {
    getRandomValues?: typeof ExpoCrypto.getRandomValues;
    randomUUID?: typeof ExpoCrypto.randomUUID;
    subtle?: {
      digest(
        algorithm: string | { name: string },
        data: BufferSource,
      ): Promise<ArrayBuffer>;
    };
  };
};

const runtime = globalThis as unknown as NativeRuntime;
const nativeWindow = runtime.window ?? runtime;

if (!runtime.window) {
  runtime.window = nativeWindow;
}

if (!nativeWindow.location) {
  Object.defineProperty(nativeWindow, 'location', {
    configurable: true,
    enumerable: true,
    value: new URL('https://react-native-fake-base-url/'),
  });
}

// Clerk hashes the publishable key before it creates its native cookie names.
// Its headless bundle calls the Web Crypto API directly, while Hermes only has
// React Native's partial crypto global. Expo Crypto provides the same native
// digest operation, so expose the Web-compatible surface before Clerk imports.
const cryptoBridge = runtime.crypto ?? {};

if (!cryptoBridge.getRandomValues) {
  cryptoBridge.getRandomValues = ExpoCrypto.getRandomValues;
}

if (!cryptoBridge.randomUUID) {
  cryptoBridge.randomUUID = ExpoCrypto.randomUUID;
}

if (!cryptoBridge.subtle) {
  cryptoBridge.subtle = {
    digest(algorithm, data) {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      return ExpoCrypto.digest(
        name.toUpperCase() as ExpoCrypto.CryptoDigestAlgorithm,
        data,
      );
    },
  };
}

if (!runtime.crypto) {
  Object.defineProperty(runtime, 'crypto', {
    configurable: true,
    enumerable: true,
    value: cryptoBridge,
  });
}

if (nativeWindow.isSecureContext === undefined) {
  nativeWindow.isSecureContext = true;
}

// Clerk's browser auth-cookie service subscribes to `window.focus` even in its
// headless build. A TaskManager runtime has no window lifecycle: it is already
// awake solely because Android delivered work. No-op listeners are therefore
// the native equivalent and prevent construction from failing before Clerk can
// hydrate the cached session.
if (!nativeWindow.addEventListener) {
  nativeWindow.addEventListener = () => {};
}

if (!nativeWindow.removeEventListener) {
  nativeWindow.removeEventListener = () => {};
}

if (!nativeWindow.dispatchEvent) {
  nativeWindow.dispatchEvent = () => true;
}
