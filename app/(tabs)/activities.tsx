import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

export default function ActivitiesScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="flask-outline" size={64} color={Colors.primary} />
      <Text style={styles.title}>Activities</Text>
      <Text style={styles.subtitle}>
        The full list of 7 STEM activities will appear here.
      </Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Coming soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
  },
  title: {
    fontSize: FontSizes.xlarge,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: Spacing.md,
  },
  subtitle: {
    fontSize: FontSizes.medium,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  badge: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 999,
  },
  badgeText: {
    color: Colors.textLight,
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
});
