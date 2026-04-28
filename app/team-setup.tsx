import { Colors, FontSizes, Spacing } from '@/constants/theme';
import {
  isDiscriminatorTaken,
  saveTeam,
  updateTeam,
} from '@/services/database';
import { useTeam } from '@/hooks/useTeam';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const GRADES = [6, 7, 8, 9, 10, 11, 12];
const DISCRIMINATOR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DISCRIMINATOR_LENGTH = 4;
const MAX_MEMBERS = 6;

function generateDiscriminator(length = DISCRIMINATOR_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += DISCRIMINATOR_ALPHABET.charAt(
      Math.floor(Math.random() * DISCRIMINATOR_ALPHABET.length)
    );
  }
  return out;
}

export default function TeamSetupScreen() {
  const params = useLocalSearchParams<{ edit?: string }>();
  const isEditMode = params.edit === '1';
  const { team, loading: teamLoading, refresh } = useTeam();

  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>(['']);
  const [grade, setGrade] = useState<number | null>(null);
  const [discriminator, setDiscriminator] = useState<string>(
    generateDiscriminator()
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (teamLoading) return;
    if (isEditMode && team) {
      setName(team.name);
      setMembers(team.members.length > 0 ? team.members : ['']);
      setGrade(team.grade);
      setDiscriminator(team.discriminator);
    }
  }, [isEditMode, team, teamLoading]);

  const trimmedMembers = useMemo(
    () => members.map((m) => m.trim()).filter((m) => m.length > 0),
    [members]
  );

  const handleAddMember = () => {
    if (members.length >= MAX_MEMBERS) {
      Alert.alert('Limit reached', `A team can have at most ${MAX_MEMBERS} members.`);
      return;
    }
    setMembers((prev) => [...prev, '']);
  };

  const handleRemoveMember = (index: number) => {
    setMembers((prev) => {
      if (prev.length <= 1) return [''];
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleMemberChange = (index: number, value: string) => {
    setMembers((prev) => prev.map((m, i) => (i === index ? value : m)));
  };

  const handleRegenerateDiscriminator = () => {
    setDiscriminator(generateDiscriminator());
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Team name is required.';
    if (name.trim().length < 2) return 'Team name must be at least 2 characters.';
    if (trimmedMembers.length === 0) return 'Add at least one member.';
    if (grade === null) return 'Please select a grade.';
    if (!/^[A-Z0-9]{3,6}$/.test(discriminator)) {
      return 'Discriminator must be 3–6 uppercase letters or digits.';
    }
    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      Alert.alert('Invalid input', error);
      return;
    }

    try {
      setSubmitting(true);

      const isSameDiscriminator =
        isEditMode && team && team.discriminator === discriminator;

      if (!isSameDiscriminator) {
        const taken = await isDiscriminatorTaken(discriminator);
        if (taken) {
          Alert.alert(
            'Discriminator taken',
            'That code is already used by another team. Please regenerate or choose a different one.'
          );
          return;
        }
      }

      if (isEditMode && team?.id) {
        await updateTeam(team.id, {
          name: name.trim(),
          members: trimmedMembers,
          grade: grade as number,
          discriminator,
        });
      } else {
        await saveTeam({
          name: name.trim(),
          members: trimmedMembers,
          grade: grade as number,
          discriminator,
        });
      }

      await refresh();
      router.replace('/(tabs)');
    } catch (err: any) {
      console.error('Team save error:', err);
      Alert.alert('Error', err?.message ?? 'Could not save team.');
    } finally {
      setSubmitting(false);
    }
  };

  if (teamLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.emoji}>👥</Text>
          <Text style={styles.title}>
            {isEditMode ? 'Edit Team' : 'Set Up Your Team'}
          </Text>
          <Text style={styles.subtitle}>
            Tell us about your team before we begin the activities.
          </Text>
        </View>

        {/* Team name */}
        <View style={styles.field}>
          <Text style={styles.label}>Team name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. The Curious Coders"
            placeholderTextColor={Colors.textLight}
            value={name}
            onChangeText={setName}
            maxLength={40}
          />
        </View>

        {/* Members */}
        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Members</Text>
            <Text style={styles.labelHint}>
              {trimmedMembers.length}/{MAX_MEMBERS}
            </Text>
          </View>

          {members.map((member, index) => (
            <View key={index} style={styles.memberRow}>
              <TextInput
                style={[styles.input, styles.memberInput]}
                placeholder={`Member ${index + 1} name`}
                placeholderTextColor={Colors.textLight}
                value={member}
                onChangeText={(value) => handleMemberChange(index, value)}
                maxLength={40}
              />
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => handleRemoveMember(index)}
                accessibilityLabel="Remove member"
              >
                <Ionicons
                  name="close-circle"
                  size={26}
                  color={Colors.textLight}
                />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={styles.addMemberButton}
            onPress={handleAddMember}
            disabled={members.length >= MAX_MEMBERS}
          >
            <Ionicons
              name="add-circle-outline"
              size={20}
              color={
                members.length >= MAX_MEMBERS ? Colors.textLight : Colors.primary
              }
            />
            <Text
              style={[
                styles.addMemberText,
                members.length >= MAX_MEMBERS && { color: Colors.textLight },
              ]}
            >
              Add member
            </Text>
          </TouchableOpacity>
        </View>

        {/* Grade */}
        <View style={styles.field}>
          <Text style={styles.label}>Grade</Text>
          <View style={styles.gradeGrid}>
            {GRADES.map((g) => {
              const selected = grade === g;
              return (
                <TouchableOpacity
                  key={g}
                  style={[styles.gradeChip, selected && styles.gradeChipSelected]}
                  onPress={() => setGrade(g)}
                >
                  <Text
                    style={[
                      styles.gradeChipText,
                      selected && styles.gradeChipTextSelected,
                    ]}
                  >
                    {g}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Discriminator */}
        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Team code</Text>
            <Text style={styles.labelHint}>Unique identifier</Text>
          </View>
          <View style={styles.discRow}>
            <TextInput
              style={[styles.input, styles.discInput]}
              value={discriminator}
              onChangeText={(v) =>
                setDiscriminator(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
              }
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity
              style={styles.regenButton}
              onPress={handleRegenerateDiscriminator}
            >
              <Ionicons name="refresh" size={18} color={Colors.text} />
              <Text style={styles.regenText}>New</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.helperText}>
            Used to tell teams apart on the leaderboard.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <Text style={styles.submitText}>
              {isEditMode ? 'Save changes' : 'Create team'}
            </Text>
          )}
        </TouchableOpacity>

        {isEditMode && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
            disabled={submitting}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xl * 2,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  emoji: {
    fontSize: 56,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.xxlarge,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSizes.medium,
    color: Colors.textLight,
    textAlign: 'center',
  },
  field: {
    marginBottom: Spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: FontSizes.medium,
    color: Colors.text,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  labelHint: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    fontSize: FontSizes.medium,
    color: Colors.text,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  memberInput: {
    flex: 1,
  },
  iconButton: {
    padding: Spacing.xs,
  },
  addMemberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  addMemberText: {
    color: Colors.primary,
    fontSize: FontSizes.medium,
    fontWeight: '600',
  },
  gradeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  gradeChip: {
    minWidth: 56,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  gradeChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  gradeChipText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: '600',
  },
  gradeChipTextSelected: {
    color: Colors.text,
  },
  discRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  discInput: {
    flex: 1,
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    letterSpacing: 4,
    textAlign: 'center',
  },
  regenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  regenText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: '600',
  },
  helperText: {
    marginTop: Spacing.xs,
    color: Colors.textLight,
    fontSize: FontSizes.small,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
  },
  cancelButton: {
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  cancelText: {
    color: Colors.textLight,
    fontSize: FontSizes.medium,
  },
});
