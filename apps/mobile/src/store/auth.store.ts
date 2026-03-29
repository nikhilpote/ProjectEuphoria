import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { AuthenticatedUser } from '@euphoria/types';

const SECURE_STORE_ACCESS_TOKEN_KEY = 'euphoria_access_token';
const SECURE_STORE_REFRESH_TOKEN_KEY = 'euphoria_refresh_token';

export interface UserProfile extends AuthenticatedUser {}

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  isLoading: boolean;
}

interface AuthActions {
  setAuth: (user: UserProfile, accessToken: string, refreshToken?: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  loadStoredToken: () => Promise<string | null>;
}

export type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set) => ({
  // --- State ---
  user: null,
  accessToken: null,
  isLoading: true,

  // --- Actions ---

  setAuth: async (user, accessToken, refreshToken) => {
    await SecureStore.setItemAsync(SECURE_STORE_ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) {
      await SecureStore.setItemAsync(SECURE_STORE_REFRESH_TOKEN_KEY, refreshToken);
    }
    set({ user, accessToken, isLoading: false });
  },

  clearAuth: async () => {
    await Promise.allSettled([
      SecureStore.deleteItemAsync(SECURE_STORE_ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(SECURE_STORE_REFRESH_TOKEN_KEY),
    ]);
    set({ user: null, accessToken: null, isLoading: false });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  loadStoredToken: async () => {
    try {
      const token = await SecureStore.getItemAsync(SECURE_STORE_ACCESS_TOKEN_KEY);
      return token;
    } catch {
      return null;
    }
  },
}));
