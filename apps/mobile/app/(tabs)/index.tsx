import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';

const COLORS = {
  bg: '#0A0A0F',
  surface: '#13131A',
  border: '#2A2A3D',
  accent: '#7C3AED',
  accentDim: 'rgba(124,58,237,0.12)',
  accentBorder: 'rgba(124,58,237,0.3)',
  blue: '#3B82F6',
  blueDim: 'rgba(59,130,246,0.12)',
  blueBorder: 'rgba(59,130,246,0.3)',
  gold: '#F59E0B',
  white: '#FFFFFF',
  offWhite: '#E8E8F0',
  muted: '#6B6B8A',
} as const;

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>EUPHORIA</Text>
        <View style={styles.headerRight}>
          {user && (
            <View style={styles.coinBadge}>
              <Text style={styles.coinIcon}>◈</Text>
              <Text style={styles.coinBalance}>{user.coinBalance.toLocaleString()}</Text>
            </View>
          )}
          <Pressable onPress={clearAuth} accessibilityLabel="Sign out">
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>What do you want{'\n'}to play?</Text>
          <Text style={styles.heroSub}>Choose a mode to get started</Text>
        </View>

        {/* Live Shows button */}
        <Pressable
          style={({ pressed }) => [styles.modeCard, styles.modeCardLive, pressed && styles.modeCardPressed]}
          onPress={() => router.push('/(tabs)/live')}
          accessibilityRole="button"
          accessibilityLabel="Live Shows"
        >
          <View style={styles.modeCardInner}>
            <View style={styles.modeBadgeLive}>
              <View style={styles.liveDot} />
              <Text style={styles.modeBadgeText}>LIVE</Text>
            </View>
            <Text style={styles.modeTitle}>Live Shows</Text>
            <Text style={styles.modeSub}>Compete in real-time game shows with players worldwide</Text>
          </View>
          <Text style={styles.modeArrow}>→</Text>
        </Pressable>

        {/* PlayClips button */}
        <Pressable
          style={({ pressed }) => [styles.modeCard, styles.modeCardPlay, pressed && styles.modeCardPressed]}
          onPress={() => router.push('/(tabs)/playclips')}
          accessibilityRole="button"
          accessibilityLabel="PlayClips"
        >
          <View style={styles.modeCardInner}>
            <View style={styles.modeBadgePlay}>
              <Text style={styles.modeBadgeText}>ON DEMAND</Text>
            </View>
            <Text style={styles.modeTitle}>PlayClips</Text>
            <Text style={styles.modeSub}>Play curated game clips from past shows, anytime</Text>
          </View>
          <Text style={styles.modeArrow}>→</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  wordmark: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 4,
    color: COLORS.white,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1C1505',
    borderWidth: 1,
    borderColor: '#3D2D00',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  coinIcon: {
    fontSize: 13,
    color: COLORS.gold,
  },
  coinBalance: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gold,
  },
  signOut: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '500',
  },

  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    gap: 16,
  },

  heroText: {
    gap: 6,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  heroSub: {
    fontSize: 15,
    color: COLORS.muted,
    fontWeight: '500',
  },

  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    gap: 12,
  },
  modeCardLive: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accentBorder,
  },
  modeCardPlay: {
    backgroundColor: COLORS.blueDim,
    borderColor: COLORS.blueBorder,
  },
  modeCardPressed: {
    opacity: 0.75,
  },
  modeCardInner: {
    flex: 1,
    gap: 6,
  },

  modeBadgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(124,58,237,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  modeBadgePlay: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(59,130,246,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  modeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 1.5,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },

  modeTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: -0.3,
  },
  modeSub: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: '500',
    lineHeight: 20,
  },

  modeArrow: {
    fontSize: 22,
    color: COLORS.muted,
    fontWeight: '300',
  },
});
