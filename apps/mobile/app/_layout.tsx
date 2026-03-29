import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { getMe } from '@/api/auth.api';

// Keep the splash screen visible while we check stored tokens
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// ---------------------------------------------------------------------------
// Auth gate — runs after auth state is resolved, redirects accordingly
// ---------------------------------------------------------------------------

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { user, isLoading, setAuth, clearAuth, loadStoredToken, setLoading } = useAuthStore();

  useEffect(() => {
    async function bootstrap() {
      try {
        const storedToken = await loadStoredToken();

        if (!storedToken) {
          await clearAuth();
          return;
        }

        // Validate the stored token against the API
        const profile = await getMe(storedToken);
        await setAuth(profile, storedToken);
      } catch {
        // Token invalid or network error — clear and send to sign-in
        await clearAuth();
      } finally {
        await SplashScreen.hideAsync();
      }
    }

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments, router]);

  if (isLoading) {
    // Splash screen is still visible at this point — show nothing underneath
    return <View style={styles.splash} />;
  }

  return <Slot />;
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <AuthGate />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
});
