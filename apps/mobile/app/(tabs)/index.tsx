import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';
import { getShows, type ShowSummary } from '@/api/shows.api';

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = {
  bg: '#0A0A0F',
  surface: '#13131A',
  border: '#2A2A3D',
  accent: '#7C3AED',
  accentGlow: '#A855F7',
  gold: '#F59E0B',
  white: '#FFFFFF',
  offWhite: '#E8E8F0',
  muted: '#6B6B8A',
  green: '#10B981',
  blue: '#3B82F6',
} as const;

const POLL_INTERVAL_MS = 15_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function getCountdownMs(show: ShowSummary, now: number): number {
  const scheduledMs = new Date(show.scheduledAt).getTime();
  if (show.status === 'lobby') {
    // Time until show starts (end of lobby)
    return scheduledMs + show.lobbyDurationMs - now;
  }
  // Time until lobby opens
  return scheduledMs - now;
}

// ─── Show Card ────────────────────────────────────────────────────────────────

interface ShowCardProps {
  show: ShowSummary;
  now: number;
  onEnter: (showId: string) => void;
}

function ShowCard({ show, now, onEnter }: ShowCardProps) {
  const scheduledMs = new Date(show.scheduledAt).getTime();
  const isLobby = show.status === 'lobby';
  const isScheduled = show.status === 'scheduled';
  const countdownMs = getCountdownMs(show, now);
  const canEnter = isLobby || (isScheduled && scheduledMs <= now);

  return (
    <View style={styles.card}>
      {/* Card header row */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardCategory}>LIVE SHOW</Text>
        {isLobby && (
          <View style={styles.lobbyBadge}>
            <View style={styles.lobbyBadgeDot} />
            <Text style={styles.lobbyBadgeText}>LOBBY</Text>
          </View>
        )}
      </View>

      {/* Title */}
      <Text style={styles.cardTitle}>{show.title}</Text>

      {/* Meta row */}
      <Text style={styles.cardMeta}>
        {show.roundCount != null ? `${show.roundCount} round${show.roundCount !== 1 ? 's' : ''}` : '—'}
        {show.playerCount > 0 ? `  ·  ${show.playerCount} player${show.playerCount !== 1 ? 's' : ''}` : ''}
      </Text>

      {/* Divider */}
      <View style={styles.cardDivider} />

      {/* Countdown + Enter row */}
      <View style={styles.cardFooter}>
        <View style={styles.countdownBlock}>
          <Text style={styles.countdownLabel}>
            {isLobby ? 'Show starts in' : 'Starts in'}
          </Text>
          <Text style={[styles.countdownValue, isLobby && styles.countdownValueLobby]}>
            {countdownMs > 0 ? formatCountdown(countdownMs) : isLobby ? 'Starting soon' : 'Now'}
          </Text>
          {isLobby && (
            <Text style={styles.lobbyOpenText}>Lobby open</Text>
          )}
        </View>

        <Pressable
          style={[styles.enterButton, !canEnter && styles.enterButtonDisabled]}
          onPress={() => canEnter && onEnter(show.id)}
          disabled={!canEnter}
          accessibilityRole="button"
          accessibilityLabel={`Enter ${show.title}`}
          accessibilityState={{ disabled: !canEnter }}
        >
          <Text style={[styles.enterButtonText, !canEnter && styles.enterButtonTextDisabled]}>
            ENTER
          </Text>
          <Text style={[styles.enterButtonArrow, !canEnter && styles.enterButtonTextDisabled]}>
            →
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [shows, setShows] = useState<ShowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const fetchShows = useCallback(async (silent = false) => {
    try {
      const all = await getShows();
      const active = all.filter(
        (s) => s.status === 'scheduled' || s.status === 'lobby',
      );
      // Sort: lobby first, then by scheduledAt ascending
      active.sort((a, b) => {
        if (a.status === 'lobby' && b.status !== 'lobby') return -1;
        if (b.status === 'lobby' && a.status !== 'lobby') return 1;
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      });
      setShows(active);
    } catch {
      // Silently ignore poll failures — stale data is fine
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load + 15s polling
  useEffect(() => {
    fetchShows(false);
    const poll = setInterval(() => fetchShows(true), POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [fetchShows]);

  // 1-second clock tick for countdown
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const handleEnter = (showId: string) => {
    router.push(`/show/${showId}`);
  };

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
          <Pressable
            onPress={clearAuth}
            accessibilityLabel="Sign out"
            accessibilityRole="button"
          >
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Shows section */}
        <View style={styles.showsSection}>
          <View style={styles.showsSectionHeader}>
            <View style={styles.liveDot} />
            <Text style={styles.showsSectionTitle}>UPCOMING SHOWS</Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={COLORS.accent} size="small" />
              <Text style={styles.loadingText}>Loading shows…</Text>
            </View>
          ) : shows.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No upcoming shows</Text>
              <Text style={styles.emptySubtitle}>Check back soon for the next live game.</Text>
            </View>
          ) : (
            shows.map((show) => (
              <ShowCard
                key={show.id}
                show={show}
                now={now}
                onEnter={handleEnter}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // Header
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

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 24,
  },

  // Shows section
  showsSection: {
    gap: 12,
  },
  showsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.green,
  },
  showsSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.green,
    letterSpacing: 2,
  },

  // Loading / empty states
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.muted,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.offWhite,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
  },

  // Show card
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 2,
  },
  lobbyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  lobbyBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.blue,
  },
  lobbyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.blue,
    letterSpacing: 1.5,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: -0.3,
  },
  cardMeta: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '500',
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },

  // Countdown
  countdownBlock: {
    gap: 2,
  },
  countdownLabel: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  countdownValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.offWhite,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  countdownValueLobby: {
    color: COLORS.blue,
  },
  lobbyOpenText: {
    fontSize: 11,
    color: COLORS.green,
    fontWeight: '600',
  },

  // Enter button
  enterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  enterButtonDisabled: {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.2)',
  },
  enterButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 1.5,
  },
  enterButtonArrow: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
  enterButtonTextDisabled: {
    color: 'rgba(124, 58, 237, 0.4)',
  },
});
