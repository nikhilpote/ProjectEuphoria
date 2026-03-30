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
    return scheduledMs + show.lobbyDurationMs - now;
  }
  return scheduledMs - now;
}

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
      <View style={styles.cardHeader}>
        <Text style={styles.cardCategory}>LIVE SHOW</Text>
        {isLobby && (
          <View style={styles.lobbyBadge}>
            <View style={styles.lobbyBadgeDot} />
            <Text style={styles.lobbyBadgeText}>LOBBY</Text>
          </View>
        )}
      </View>

      <Text style={styles.cardTitle}>{show.title}</Text>

      <Text style={styles.cardMeta}>
        {show.roundCount != null ? `${show.roundCount} round${show.roundCount !== 1 ? 's' : ''}` : '—'}
        {show.playerCount > 0 ? `  ·  ${show.playerCount} player${show.playerCount !== 1 ? 's' : ''}` : ''}
      </Text>

      <View style={styles.cardDivider} />

      <View style={styles.cardFooter}>
        <View style={styles.countdownBlock}>
          <Text style={styles.countdownLabel}>
            {isLobby ? 'Show starts in' : 'Starts in'}
          </Text>
          <Text style={[styles.countdownValue, isLobby && styles.countdownValueLobby]}>
            {countdownMs > 0 ? formatCountdown(countdownMs) : isLobby ? 'Starting soon' : 'Now'}
          </Text>
          {isLobby && <Text style={styles.lobbyOpenText}>Lobby open</Text>}
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

export default function LiveScreen() {
  const router = useRouter();
  const [shows, setShows] = useState<ShowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const fetchShows = useCallback(async (silent = false) => {
    try {
      const all = await getShows();
      const active = all.filter(
        (s) => s.status === 'scheduled' || s.status === 'lobby',
      );
      active.sort((a, b) => {
        if (a.status === 'lobby' && b.status !== 'lobby') return -1;
        if (b.status === 'lobby' && a.status !== 'lobby') return 1;
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      });
      setShows(active);
    } catch {
      // Silently ignore poll failures
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShows(false);
    const poll = setInterval(() => fetchShows(true), POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [fetchShows]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with back arrow */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Live Shows</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
              <Text style={styles.emptyTitle}>No upcoming shows</Text>
              <Text style={styles.emptySubtitle}>Check back soon for the next live game.</Text>
            </View>
          ) : (
            shows.map((show) => (
              <ShowCard
                key={show.id}
                show={show}
                now={now}
                onEnter={(id) => router.push(`/show/${id}`)}
              />
            ))
          )}
        </View>
      </ScrollView>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 18,
    color: COLORS.white,
    lineHeight: 20,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  headerRight: {
    width: 36,
  },

  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 24,
  },

  showsSection: { gap: 12 },
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
  countdownBlock: { gap: 2 },
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
  countdownValueLobby: { color: COLORS.blue },
  lobbyOpenText: {
    fontSize: 11,
    color: COLORS.green,
    fontWeight: '600',
  },
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
  enterButtonTextDisabled: { color: 'rgba(124, 58, 237, 0.4)' },
});
