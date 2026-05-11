import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Activity = {
  id: string;
  emoji: string;
  name: string;
  description: string;
  sensor: string;
  route: string;
};

type ActivitySection = {
  title: string;
  caption: string;
  items: Activity[];
};

const SECTIONS: ActivitySection[] = [
  {
    title: 'Engineering Challenges',
    caption: 'Physics, forces, materials and structures',
    items: [
      {
        id: 'parachute',
        emoji: '🪂',
        name: 'Parachute Drop',
        description: 'Test drag force and landing speed',
        sensor: 'Timer + force calculations',
        route: '/activities/parachute',
      },
      {
        id: 'sound',
        emoji: '🔊',
        name: 'Sound Pollution Hunter',
        description: 'Map noise levels in your space',
        sensor: 'Microphone + GPS + Map',
        route: '/activities/sound',
      },
      {
        id: 'handfan',
        emoji: '🌬️',
        name: 'Hand Fan Challenge',
        description: 'Measure paper bending from air movement',
        sensor: 'Accelerometer (tilt)',
        route: '/activities/handfan',
      },
      {
        id: 'earthquake',
        emoji: '🏗️',
        name: 'Earthquake-Resistant Structure',
        description: 'Build a structure that absorbs vibration',
        sensor: 'Vibration + Accelerometer',
        route: '/activities/earthquake',
      },
    ],
  },
  {
    title: 'Health & Medical Sciences',
    caption: 'Bodies, movement, reaction and breathing',
    items: [
      {
        id: 'performance',
        emoji: '🤸',
        name: 'Human Performance Lab',
        description: 'Measure movement speed and smoothness',
        sensor: 'Accelerometer (jerk)',
        route: '/activities/performance',
      },
      {
        id: 'reaction',
        emoji: '⚡',
        name: 'Reaction Board Challenge',
        description: 'Test how fast you can tap and trace',
        sensor: 'Touch timing',
        route: '/activities/reaction',
      },
      {
        id: 'breathing',
        emoji: '🫁',
        name: 'Breathing Pace Trainer',
        description: 'Track breaths per minute before/after exercise',
        sensor: 'Accelerometer (chest)',
        route: '/activities/breathing',
      },
    ],
  },
];

export default function ActivitiesScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.emoji}>🧪</Text>
        <Text style={styles.title}>Activities</Text>
        <Text style={styles.subtitle}>
          7 hands-on STEMM experiments using your phone&apos;s sensors
        </Text>
      </View>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionCaption}>{section.caption}</Text>

          <View style={styles.list}>
            {section.items.map((activity) => (
              <TouchableOpacity
                key={activity.id}
                style={styles.card}
                onPress={() => router.push(activity.route as any)}
                activeOpacity={0.8}
              >
                <Text style={styles.cardEmoji}>{activity.emoji}</Text>
                <View style={styles.cardTextWrap}>
                  <Text style={styles.cardName}>{activity.name}</Text>
                  <Text style={styles.cardDesc}>{activity.description}</Text>
                  <View style={styles.sensorPill}>
                    <Ionicons
                      name="hardware-chip-outline"
                      size={12}
                      color={Colors.textLight}
                    />
                    <Text style={styles.sensorText}>{activity.sensor}</Text>
                  </View>
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
      ))}
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
    fontSize: 48,
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: FontSizes.xlarge,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: Spacing.md,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: Colors.text,
  },
  sectionCaption: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    marginTop: 2,
    marginBottom: Spacing.sm,
  },
  list: {
    gap: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
  },
  cardEmoji: {
    fontSize: 32,
  },
  cardTextWrap: {
    flex: 1,
    gap: 4,
  },
  cardName: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
  },
  cardDesc: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
  },
  sensorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 2,
  },
  sensorText: {
    fontSize: 11,
    color: Colors.textLight,
    fontWeight: '600',
  },
});
