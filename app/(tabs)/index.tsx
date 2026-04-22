import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to STEMM Lab 🔬</Text>
      <Text style={styles.subtitle}>Select an activity to get started</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.md,
  },
  title: {
    fontSize: FontSizes.xlarge,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.medium,
    color: Colors.textLight,
  },
});