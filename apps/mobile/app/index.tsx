import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';

/**
 * Entry point — delegates to the auth gate in _layout.tsx.
 * The redirect here is a fallback for the initial render before
 * the auth check in _layout completes.
 */
export default function Index() {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) return null;

  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
