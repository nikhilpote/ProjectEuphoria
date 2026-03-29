import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  Platform,
  Easing,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as AppleAuthentication from 'expo-apple-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginWithApple, createGuestAccount, ApiRequestError } from '@/api/auth.api';
import { useAuthStore } from '@/store/auth.store';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const COLORS = {
  bg: '#0A0A0F',
  surface: '#13131A',
  surfaceHigh: '#1C1C27',
  border: '#2A2A3D',
  accent: '#7C3AED',       // electric violet
  accentGlow: '#A855F7',
  gold: '#F59E0B',
  white: '#FFFFFF',
  offWhite: '#E8E8F0',
  muted: '#6B6B8A',
  error: '#EF4444',
  googleBlue: '#4285F4',
  appleDark: '#1C1C1E',
} as const;

// ---------------------------------------------------------------------------
// Error toast
// ---------------------------------------------------------------------------
function ErrorToast({ message }: { message: string }) {
  const opacity = useRef(new Animated.Value(0)).current;

  const show = useCallback(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [opacity]);

  // Trigger on mount
  useState(() => {
    show();
  });

  return (
    <Animated.View style={[styles.toast, { opacity }]}>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Google button (custom — Google's own style guidelines)
// ---------------------------------------------------------------------------
function GoogleSignInButton({
  onPress,
  loading,
}: {
  onPress: () => void;
  loading: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={loading}
      accessibilityLabel="Continue with Google"
      accessibilityRole="button"
    >
      <Animated.View style={[styles.googleButton, { transform: [{ scale }] }]}>
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <>
            {/* Google G SVG rendered as inline unicode approximation with coloured circle */}
            <View style={styles.googleIconContainer}>
              <Text style={styles.googleIconText}>G</Text>
            </View>
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Decorative wordmark
// ---------------------------------------------------------------------------
function EuphoriaWordmark() {
  return (
    <View style={styles.wordmarkContainer}>
      {/* Glow circle behind the E */}
      <View style={styles.glowCircle} />
      <Text style={styles.wordmark}>EUPHORIA</Text>
      <View style={styles.taglineRow}>
        <View style={styles.taglineLine} />
        <Text style={styles.tagline}>Play. Survive. Win.</Text>
        <View style={styles.taglineLine} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
type AuthProvider = 'apple' | 'google' | 'guest' | null;

export default function SignInScreen() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [loadingProvider, setLoadingProvider] = useState<AuthProvider>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);

  const buttonFadeIn = useRef(new Animated.Value(0)).current;

  // Animate buttons in on mount
  useState(() => {
    Animated.timing(buttonFadeIn, {
      toValue: 1,
      duration: 600,
      delay: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  });

  const showError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setErrorKey((k) => k + 1);
  }, []);

  const handleAuthSuccess = useCallback(
    async (user: Parameters<typeof setAuth>[0], accessToken: string, refreshToken: string) => {
      await setAuth(user, accessToken, refreshToken);
      router.replace('/(tabs)');
    },
    [setAuth, router],
  );

  // Apple Sign In
  const handleAppleSignIn = useCallback(async () => {
    setLoadingProvider('apple');
    setErrorMessage(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('No identity token received from Apple');
      }

      const { user, tokens } = await loginWithApple(credential.identityToken);
      await handleAuthSuccess(user, tokens.accessToken, tokens.refreshToken);
    } catch (err) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === 'ERR_REQUEST_CANCELED'
      ) {
        // User dismissed the dialog — not an error
        return;
      }
      const message =
        err instanceof ApiRequestError
          ? err.message
          : 'Apple sign in failed. Please try again.';
      showError(message);
    } finally {
      setLoadingProvider(null);
    }
  }, [handleAuthSuccess, showError]);

  // Google Sign In — requires native build (not available in Expo Go)
  const handleGoogleSignIn = useCallback(async () => {
    showError('Google sign in coming soon. Use Guest for now.');
  }, [showError]);

  // Guest
  const handleGuestSignIn = useCallback(async () => {
    setLoadingProvider('guest');
    setErrorMessage(null);
    try {
      const { user, tokens } = await createGuestAccount();
      await handleAuthSuccess(user, tokens.accessToken, tokens.refreshToken);
    } catch (err) {
      console.error('[Guest] Error:', err);
      const message =
        err instanceof ApiRequestError
          ? err.message
          : `Network error: ${err instanceof Error ? err.message : String(err)}`;
      showError(message);
    } finally {
      setLoadingProvider(null);
    }
  }, [handleAuthSuccess, showError]);

  const isAnyLoading = loadingProvider !== null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Background radial glow */}
      <View style={styles.bgGlow} pointerEvents="none" />

      {/* Header area — wordmark */}
      <View style={styles.header}>
        <EuphoriaWordmark />
      </View>

      {/* Bottom card */}
      <Animated.View style={[styles.card, { opacity: buttonFadeIn }]}>
        <Text style={styles.cardTitle}>Get started</Text>
        <Text style={styles.cardSubtitle}>
          Sign in to join live shows, collect coins, and compete.
        </Text>

        <View style={styles.buttons}>
          {/* Apple Sign In — must use Apple's component on iOS */}
          {Platform.OS === 'ios' && (
            <View style={styles.appleButtonWrapper}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={14}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
              {loadingProvider === 'apple' && (
                <View style={styles.appleLoadingOverlay}>
                  <ActivityIndicator size="small" color={COLORS.appleDark} />
                </View>
              )}
            </View>
          )}

          {/* Google Sign In */}
          <GoogleSignInButton
            onPress={handleGoogleSignIn}
            loading={loadingProvider === 'google'}
          />

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Guest */}
          <Pressable
            onPress={handleGuestSignIn}
            disabled={isAnyLoading}
            accessibilityLabel="Continue as guest"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.guestButton,
              pressed && styles.guestButtonPressed,
              isAnyLoading && styles.guestButtonDisabled,
            ]}
          >
            {loadingProvider === 'guest' ? (
              <ActivityIndicator size="small" color={COLORS.muted} />
            ) : (
              <Text style={styles.guestButtonText}>Continue as Guest</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.legalText}>
          By continuing, you agree to our{' '}
          <Text style={styles.legalLink}>Terms of Service</Text> and{' '}
          <Text style={styles.legalLink}>Privacy Policy</Text>.
        </Text>
      </Animated.View>

      {/* Error toast */}
      {errorMessage && <ErrorToast key={errorKey} message={errorMessage} />}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  bgGlow: {
    position: 'absolute',
    top: -120,
    left: '50%',
    marginLeft: -200,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: COLORS.accent,
    opacity: 0.12,
    // React Native doesn't support CSS blur, but the soft circle creates a glow effect
  },

  // Header / wordmark
  header: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
  },
  wordmarkContainer: {
    alignItems: 'center',
  },
  glowCircle: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.accent,
    opacity: 0.15,
    top: -30,
  },
  wordmark: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 8,
    color: COLORS.white,
    textAlign: 'center',
    // Subtle text shadow for depth
    textShadowColor: COLORS.accentGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
  },
  taglineLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    maxWidth: 40,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 2.5,
    color: COLORS.gold,
    textTransform: 'uppercase',
  },

  // Bottom card
  card: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 20,
    marginBottom: 28,
  },
  buttons: {
    gap: 12,
  },

  // Apple
  appleButtonWrapper: {
    position: 'relative',
    height: 52,
  },
  appleButton: {
    width: '100%',
    height: 52,
  },
  appleLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Google
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceHigh,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  googleIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.googleBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
    lineHeight: 15,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.offWhite,
    letterSpacing: 0.1,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '500',
  },

  // Guest
  guestButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  guestButtonPressed: {
    backgroundColor: COLORS.surfaceHigh,
  },
  guestButtonDisabled: {
    opacity: 0.5,
  },
  guestButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.muted,
    textDecorationLine: 'underline',
    textDecorationColor: COLORS.border,
  },

  // Legal
  legalText: {
    fontSize: 11,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 16,
  },
  legalLink: {
    color: COLORS.accentGlow,
    textDecorationLine: 'underline',
  },

  // Toast
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    backgroundColor: COLORS.error,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
