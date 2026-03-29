import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  bg: '#0A0A0F',
  white: '#FFFFFF',
  muted: '#6B6B8A',
  accent: '#7C3AED',
  gold: '#F59E0B',
  border: '#2A2A3D',
} as const;

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>EUPHORIA</Text>
        <Text style={styles.tagline}>The live game show{'\n'}that plays you back.</Text>
        <Text style={styles.body}>
          Compete with thousands of players in real-time. Answer fast, survive longer, win bigger.
        </Text>
      </View>
      <View style={styles.footer}>
        <Pressable
          style={styles.ctaButton}
          onPress={() => router.replace('/(auth)/sign-in')}
          accessibilityRole="button"
          accessibilityLabel="Get started"
        >
          <Text style={styles.ctaText}>Get Started</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 28,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 5,
    color: COLORS.gold,
    marginBottom: 24,
  },
  tagline: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: -1,
    lineHeight: 46,
    marginBottom: 20,
  },
  body: {
    fontSize: 16,
    color: COLORS.muted,
    lineHeight: 24,
    maxWidth: 300,
  },
  footer: {
    paddingBottom: 12,
  },
  ctaButton: {
    height: 56,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.2,
  },
});
