export const APP_VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';
/** Differs for every build (scripts/build.mjs): clicking an updated favorite replaces a panel left by an older build. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
export const STORAGE_VERSION = 1;
export const BOOKMARKLET_LIMIT = 2_000_000;
