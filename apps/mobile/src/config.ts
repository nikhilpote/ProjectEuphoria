/**
 * Central app configuration.
 *
 * API_URL is read from app.config.js `extra.apiUrl` at build time.
 * Change it there (or via APP_ENV + API_URL env vars when running eas build).
 *
 * Never hardcode IPs here — set API_URL when building:
 *   API_URL=https://api.euphoria.gg npx eas build --profile production
 */

import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as {
  apiUrl?: string;
  socketUrl?: string;
} | undefined;

/** REST API base URL — includes /api/v1 suffix */
export const API_BASE_URL: string =
  extra?.apiUrl ?? 'http://172.20.10.3:3000/api/v1';

/** WebSocket server base URL — no path suffix */
export const SOCKET_URL: string =
  extra?.socketUrl ?? 'http://172.20.10.3:3000';
