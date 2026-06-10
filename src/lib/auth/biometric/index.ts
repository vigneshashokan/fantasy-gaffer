export {
  enable,
  disable,
  attemptUnlock,
  persistCurrentSession,
  BIOMETRIC_ENABLED_KEY,
} from './enrollment';
export type { BiometricErrorKind, Result } from './enrollment';
export { isSupported, supportedTypes } from './capability';
export type { BiometricKind } from './capability';
