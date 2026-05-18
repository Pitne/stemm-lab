import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { getLeaderboard, LeaderboardEntry } from '@/services/leaderboardService';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const ACTIVITY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'parachute', label: '🪂 Parachute' },
  { id: 'sound', label: '🔊 Sound' },
  { id: 'handfan', label: '🌬️ Fan' },
];

const getActivityEmoji = (activityId: string) => {
  switch (activityId) {
    case 'parachute': return '🪂';
    case 'sound': return '🔊';
    case 'handfan': return '🌬️';
    case 'earthquake': return '🏗️';
    case 'performance': return '🏃';
    case 'reaction': return '⚡';
    case 'breathing': return '🫁';
    default: return '🔬';
  }
};

export default function LeaderboardScreen() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  const fetchLeaderboard = async () => {
    const data = await getLeaderboard();
    setEntries(data);
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchLeaderboard();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchLeaderboard();
  };

  const filteredEntries = entries.filter((e) =>
    activeFilter === 'all' ? true : e.activityId === activeFilter
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>🏆</Text>
        <Text style={styles.title}>Leaderboard</Text>
        <Text style={styles.subtitle}>Top teams across all activities</Text>
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {ACTIVITY_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            style={[
              styles.filterTab,
              activeFilter === filter.id && styles.filterTabActive,
            ]}
            onPress={() => setActiveFilter(filter.id)}
          >
            <Text style={[
              styles.filterTabText,
              activeFilter === filter.id && styles.filterTabTextActive,
            ]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Loading */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading leaderboard...</Text>
        </View>
      ) : filteredEntries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="trophy-outline" size={64} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>No results yet</Text>
          <Text style={styles.emptySubtitle}>
            Complete an activity to appear on the leaderboard!
          </Text>
        </View>
      ) : (
        <View style={styles.entriesList}>
          {filteredEntries.map((entry, index) => (
            <View
              key={entry.id}
              style={[
                styles.entryCard,
                index === 0 && styles.entryCardGold,
                index === 1 && styles.entryCardSilver,
                index === 2 && styles.entryCardBronze,
              ]}
            >
              {/* Rank */}
              <View style={styles.rankContainer}>
                <Text style={styles.rankText}>
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </Text>
              </View>

              {/* Team Info */}
              <View style={styles.entryInfo}>
                <Text style={styles.teamName} numberOfLines={1}>
                  {entry.teamName}
                </Text>
                <View style={styles.activityBadge}>
                  <Text style={styles.activityBadgeText}>
                    {getActivityEmoji(entry.activityId)} {entry.activityName}
                  </Text>
                </View>
              </View>

              {/* Score */}
              <View style={styles.scoreContainer}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={styles.scoreText}>Done</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Pull to refresh hint */}
      {!loading && filteredEntries.length > 0 && (
        <Text style={styles.refreshHint}>Pull down to refresh</Text>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  emoji: {
    fontSize: 56,
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: FontSizes.xlarge,
    fontWeight: 'bold',
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSizes.medium,
    color: Colors.textLight,
    marginTop: 4,
  },
  filterScroll: {
    marginBottom: Spacing.lg,
  },
  filterContent: {
    gap: Spacing.xs,
    paddingRight: Spacing.md,
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterTabText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: Colors.text,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  loadingText: {
    fontSize: FontSizes.medium,
    color: Colors.textLight,
  },
  emptyContainer: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: Colors.text,
  },
  emptySubtitle: {
    fontSize: FontSizes.medium,
    color: Colors.textLight,
    textAlign: 'center',
  },
  entriesList: {
    gap: Spacing.sm,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  entryCardGold: {
    borderColor: '#F59E0B',
    backgroundColor: '#1A1500',
  },
  entryCardSilver: {
    borderColor: '#9CA3AF',
    backgroundColor: '#141414',
  },
  entryCardBronze: {
    borderColor: '#B45309',
    backgroundColor: '#1A0F00',
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
  },
  rankText: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: Colors.text,
  },
  entryInfo: {
    flex: 1,
    gap: 4,
  },
  teamName: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
  },
  activityBadge: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 6,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  activityBadgeText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
  },
  scoreContainer: {
    alignItems: 'center',
    gap: 2,
  },
  scoreText: {
    fontSize: FontSizes.small,
    color: Colors.success,
    fontWeight: '600',
  },
  refreshHint: {
    textAlign: 'center',
    fontSize: FontSizes.small,
    color: Colors.textLight,
    marginTop: Spacing.lg,
  },
});