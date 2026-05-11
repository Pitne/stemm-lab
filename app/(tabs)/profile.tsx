import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useTeam } from '@/hooks/useTeam';
import { auth } from '@/services/firebase';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { signOut } from 'firebase/auth';
import { useCallback } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function ProfileScreen() {
  const { user } = useAuth();
  const { team, refresh } = useTeam();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(auth);
            router.replace('/auth/login');
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        },
      },
    ]);
  };

  const handleEditTeam = () => {
    router.push('/team-setup?edit=1');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={48} color={Colors.text} />
        </View>
        <Text style={styles.title}>Profile</Text>
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
                {team.members.length} member{team.members.length === 1 ? '' : 's'}
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

          <TouchableOpacity style={styles.editButton} onPress={handleEditTeam}>
            <Ionicons name="create-outline" size={18} color={Colors.text} />
            <Text style={styles.editButtonText}>Edit team</Text>
          </TouchableOpacity>
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

      <View style={styles.userCard}>
        <Text style={styles.userLabel}>Signed in as</Text>
        <Text style={styles.userEmail}>{user?.email ?? '—'}</Text>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color={Colors.text} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    padding: Spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.xlarge,
    fontWeight: 'bold',
    color: Colors.text,
  },
  teamCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: Spacing.md,
    width: '100%',
    marginBottom: Spacing.md,
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
    marginBottom: Spacing.md,
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
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.sm,
  },
  editButtonText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: '600',
  },
  setupCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: Spacing.md,
    width: '100%',
    marginBottom: Spacing.md,
  },
  setupCtaText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
  },
  userCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: 'center',
    width: '100%',
    marginBottom: Spacing.md,
  },
  userLabel: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    marginBottom: Spacing.xs,
  },
  userEmail: {
    fontSize: FontSizes.medium,
    color: Colors.text,
    fontWeight: 'bold',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.error,
    borderRadius: 12,
    padding: Spacing.md,
    width: '100%',
    marginTop: Spacing.sm,
  },
  signOutText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
  },
});
