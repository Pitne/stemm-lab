import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { useTeam } from '@/hooks/useTeam';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type QuickStartActivity = {
  id: string;
  emoji: string;
  name: string;
  description: string;
  route: string;
};

const QUICK_START_ACTIVITIES: QuickStartActivity[] = [
  {
    id: 'earthquake',
    emoji: '🌍',
    name: 'Earthquake',
    description: 'Measure shaking with the gyroscope',
    route: '/activities/earthquake',
  },
  {
    id: 'reaction',
    emoji: '⚡',
    name: 'Reaction Game',
    description: 'Test how fast you can tap',
    route: '/activities/reaction',
  },
  {
    id: 'breathing',
    emoji: '🫁',
    name: 'Breathing',
    description: 'Track chest movement & breaths',
    route: '/activities/breathing',
  },
];

export default function HomeScreen() {
  const { team, refresh } = useTeam();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const completedCount = 0;
  const totalCount = 7;
  const bestScore = '—';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.welcome}>
        <Text style={styles.emoji}>🔬</Text>
        <Text style={styles.title}>Welcome to STEMM Lab</Text>
        <Text style={styles.subtitle}>
          Explore science through your phone&apos;s sensors
        </Text>
      </View>

      {team ? (
        <View style={styles.teamCard}>
          <View style={styles.teamHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.teamLabel}>Your team</Text>
              <Text style={styles.teamName}>{team.name}</Text>
            </View>
            <View style={styles.discPill}>
              <Text style={styles.discPillText}>#{team.discriminator}</Text>
            </View>
          </View>
          <View style={styles.teamMetaRow}>
            <View style={styles.teamMetaItem}>
              <Ionicons
                name="school-outline"
                size={16}
                color={Colors.textLight}
              />
              <Text style={styles.teamMetaText}>Grade {team.grade}</Text>
            </View>
            <View style={styles.teamMetaItem}>
              <Ionicons
                name="people-outline"
                size={16}
                color={Colors.textLight}
              />
              <Text style={styles.teamMetaText}>
                {team.members.length} member
                {team.members.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
          {team.members.length > 0 && (
            <View style={styles.memberList}>
              {team.members.map((m, idx) => (
                <Text key={idx} style={styles.memberPill}>
                  {m}
                </Text>
              ))}
            </View>
          )}
        </View>
      ) : (
        <TouchableOpacity
          style={styles.setupCta}
          onPress={() => router.push('/team-setup')}
        >
          <Ionicons name="add-circle-outline" size={20} color={Colors.text} />
          <Text style={styles.setupCtaText}>Set up your team</Text>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Achievements</Text>
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Ionicons
              name="checkmark-done-outline"
              size={20}
              color={Colors.secondary}
            />
            <View style={styles.statTextWrap}>
              <Text style={styles.statLabel}>Activities completed</Text>
              <Text style={styles.statValue}>
                {completedCount} / {totalCount}
              </Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons
              name="star-outline"
              size={20}
              color={Colors.warning}
            />
            <View style={styles.statTextWrap}>
              <Text style={styles.statLabel}>Best score</Text>
              <Text style={styles.statValue}>{bestScore}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Quick Start</Text>
          <TouchableOpacity onPress={() => router.push('/activities' as any)}>
            <Text style={styles.sectionLink}>View all</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.quickList}>
          {QUICK_START_ACTIVITIES.map((act) => (
            <TouchableOpacity
              key={act.id}
              style={styles.quickCard}
              onPress={() => router.push(act.route as any)}
            >
              <Text style={styles.quickEmoji}>{act.emoji}</Text>
              <View style={styles.quickTextWrap}>
                <Text style={styles.quickName}>{act.name}</Text>
                <Text style={styles.quickDesc}>{act.description}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={Colors.textLight}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.adBanner}>
        <Ionicons name="megaphone-outline" size={18} color={Colors.textLight} />
        <Text style={styles.adText}>Ad banner — coming soon</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    padding: Spacing.lg,
  },
  welcome: {
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
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSizes.medium,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 4,
  },
  teamCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  teamLabel: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    marginBottom: 2,
  },
  teamName: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: Colors.text,
  },
  discPill: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  discPillText: {
    color: Colors.text,
    fontSize: FontSizes.small,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  teamMetaRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  teamMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  teamMetaText: {
    color: Colors.textLight,
    fontSize: FontSizes.small,
  },
  memberList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  memberPill: {
    backgroundColor: Colors.surfaceAlt,
    color: Colors.text,
    fontSize: FontSizes.small,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  setupCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  setupCtaText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  sectionLink: {
    fontSize: FontSizes.small,
    color: Colors.primary,
    fontWeight: '600',
  },
  statsCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statTextWrap: {
    flex: 1,
  },
  statLabel: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
  },
  statValue: {
    fontSize: FontSizes.medium,
    color: Colors.text,
    fontWeight: 'bold',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },
  quickList: {
    gap: Spacing.sm,
  },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
  },
  quickEmoji: {
    fontSize: 28,
  },
  quickTextWrap: {
    flex: 1,
  },
  quickName: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
  },
  quickDesc: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    marginTop: 2,
  },
  adBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
  },
  adText: {
    color: Colors.textLight,
    fontSize: FontSizes.small,
    fontStyle: 'italic',
  },
});
