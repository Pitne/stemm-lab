import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useTeam } from '@/hooks/useTeam';
import { db } from '@/services/firebase';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type GradeLevel = 'primary' | 'highschool';

type Attempt = {
  id: number;
  prediction: string;
  dropHeight: string;
  dropTime: string;
  mass: string;
  contactTime: string;
};

const defaultAttempt = (id: number): Attempt => ({
  id,
  prediction: '',
  dropHeight: '',
  dropTime: '',
  mass: '',
  contactTime: '',
});

export default function ParachuteScreen() {
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('primary');
  const [attempts, setAttempts] = useState<Attempt[]>([
    defaultAttempt(1),
    defaultAttempt(2),
    defaultAttempt(3),
  ]);
  const [activeAttempt, setActiveAttempt] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const insets = useSafeAreaInsets();
  const updateAttempt = (index: number, field: keyof Attempt, value: string) => {
    setAttempts((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    );
  };

  const startTimer = () => {
    setElapsed(0);
    setIsRunning(true);
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => prev + 10);
    }, 10);
  };

  const stopTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
    const seconds = (elapsed / 1000).toFixed(2);
    updateAttempt(activeAttempt, 'dropTime', seconds);
  };

  const resetTimer = (clearSaved = false) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
    setElapsed(0);
    if (clearSaved) {
      updateAttempt(activeAttempt, 'dropTime', '');
    }
  };

  const formatTime = (dropTime: string) => {
    if (isRunning) {
      const ms = elapsed % 1000;
      const s = Math.floor(elapsed / 1000);
      return `${String(s).padStart(2, '0')}.${String(Math.floor(ms / 10)).padStart(2, '0')}s`;
    }
    return dropTime ? `${dropTime}s` : '00.00s';
  };
  const calculate = (attempt: Attempt) => {
    const height = parseFloat(attempt.dropHeight);
    const time = parseFloat(attempt.dropTime);
    const mass = parseFloat(attempt.mass);
    const contactTime = parseFloat(attempt.contactTime);
  
    if (!height || !time) return null;
  
    const finalVelocity = height / time;
  
    if (gradeLevel === 'primary') {
      return { finalVelocity: finalVelocity.toFixed(2) };
    }
  
    if (!mass || !contactTime) return { finalVelocity: finalVelocity.toFixed(2) };
  
    const acceleration = finalVelocity / time;
    const netForce = mass * acceleration;
    const weight = mass * 9.8;
    const dragForce = weight - netForce;
    const gForce = (finalVelocity / contactTime) / 9.8;
  
    const getGForceRisk = (g: number) => {
      if (g <= 5) return { label: 'Safe', color: Colors.success };
      if (g <= 10) return { label: 'Possible bruising', color: Colors.warning };
      if (g <= 30) return { label: 'Serious injury possible', color: '#F97316' };
      if (g <= 50) return { label: 'High injury risk', color: Colors.error };
      return { label: 'Life-threatening', color: '#7F1D1D' };
    };
  
    return {
      finalVelocity: finalVelocity.toFixed(2),
      acceleration: acceleration.toFixed(2),
      netForce: netForce.toFixed(2),
      weight: weight.toFixed(2),
      dragForce: dragForce.toFixed(2),
      gForce: gForce.toFixed(2),
      gForceRisk: getGForceRisk(gForce),
    };
  };

  const { user } = useAuth();
const { team } = useTeam();
const [isSaving, setIsSaving] = useState(false);
const [saved, setSaved] = useState(false);

const handleSave = async () => {
  const hasData = attempts.some((a) => a.dropTime);
  if (!hasData) {
    Alert.alert('No Data', 'Please complete at least one attempt before saving.');
    return;
  }

  try {
    setIsSaving(true);
    const resultsData = attempts.map((attempt, index) => {
      const results = calculate(attempt);
      return {
        attemptNumber: index,
        label: index === 0 ? 'Baseline' : `Attempt ${index}`,
        dropHeight: attempt.dropHeight,
        dropTime: attempt.dropTime,
        mass: attempt.mass,
        contactTime: attempt.contactTime,
        prediction: attempt.prediction,
        calculations: results,
      };
    });

    await addDoc(collection(db, 'results'), {
      activityId: 'parachute',
      activityName: 'Parachute Drop Challenge',
      gradeLevel,
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
      userId: user?.uid ?? null,
      attempts: resultsData,
      createdAt: serverTimestamp(),
    });

    setSaved(true);
    Alert.alert(
      '✅ Saved!',
      'Your results have been saved to the leaderboard.',
      [{ text: 'OK' }]
    );
  } catch (error: any) {
    Alert.alert('Error', 'Failed to save results. Please try again.');
    console.error(error);
  } finally {
    setIsSaving(false);
  }
};
  return (
    <KeyboardAvoidingView
  style={{ flex: 1, backgroundColor: Colors.background }}
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >

        {/* Back Button Row */}
      <View style={[styles.backRow, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>🪂</Text>
        <Text style={styles.title}>Parachute Drop Challenge</Text>
        <Text style={styles.subtitle}>
          Design and test a parachute to slow a toy's fall
        </Text>
      </View>

        {/* Grade Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Your Level</Text>
          <View style={styles.gradeRow}>
            <TouchableOpacity
              style={[styles.gradeButton, gradeLevel === 'primary' && styles.gradeButtonActive]}
              onPress={() => setGradeLevel('primary')}
            >
              <Text style={[styles.gradeButtonText, gradeLevel === 'primary' && styles.gradeButtonTextActive]}>
                🎒 Primary School
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.gradeButton, gradeLevel === 'highschool' && styles.gradeButtonActive]}
              onPress={() => setGradeLevel('highschool')}
            >
              <Text style={[styles.gradeButtonText, gradeLevel === 'highschool' && styles.gradeButtonTextActive]}>
                🎓 High School
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Instructions</Text>
          <Text style={styles.infoText}>1. Drop toy without parachute (baseline)</Text>
          <Text style={styles.infoText}>2. Build a parachute using materials</Text>
          <Text style={styles.infoText}>3. Drop from the same height and record</Text>
          <Text style={styles.infoText}>4. Redesign and test up to 3 prototypes</Text>
          {gradeLevel === 'primary' ? (
            <View style={styles.focusBadge}>
              <Text style={styles.focusText}>
                📌 Primary focus: Measure time + calculate final speed
              </Text>
            </View>
          ) : (
            <View style={styles.focusBadge}>
              <Text style={styles.focusText}>
                📌 High School focus: Forces, acceleration, drag + g-force
              </Text>
            </View>
          )}
        </View>

        {/* Attempt Tabs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attempts</Text>
          <View style={styles.attemptTabs}>
            {attempts.map((_, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.attemptTab, activeAttempt === index && styles.attemptTabActive]}
                onPress={() => {
                    resetTimer(false);
                    setActiveAttempt(index);
                  }}
              >
                <Text style={[styles.attemptTabText, activeAttempt === index && styles.attemptTabTextActive]}>
                  {index === 0 ? 'Baseline' : `Attempt ${index}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Active Attempt Card */}
        <View style={styles.attemptCard}>
          <Text style={styles.attemptTitle}>
            {activeAttempt === 0
              ? '🔴 Baseline — No Parachute'
              : `🟢 Attempt ${activeAttempt} — With Parachute`}
          </Text>

          {/* Timer */}
          <View style={styles.timerContainer}>
            <Text style={styles.timerDisplay}>
              {formatTime(attempts[activeAttempt].dropTime)}
            </Text>
            <View style={styles.timerButtons}>
              <TouchableOpacity
                style={[styles.timerBtn, isRunning && styles.timerBtnDanger]}
                onPress={isRunning ? stopTimer : startTimer}
              >
                <Ionicons
                  name={isRunning ? 'stop' : 'play'}
                  size={20}
                  color={Colors.text}
                />
                <Text style={styles.timerBtnText}>
                  {isRunning ? 'Stop' : 'Start'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.timerBtnOutline}
                onPress={() => resetTimer(true)}
                disabled={isRunning}
>
                <Ionicons name="refresh" size={20} color={Colors.textLight} />
                <Text style={styles.timerBtnOutlineText}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Input Section */}
          <View style={styles.inputSection}>
            <Text style={styles.inputSectionTitle}>📏 Measurements</Text>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Drop Height (m)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1.0"
                placeholderTextColor={Colors.textLight}
                keyboardType="decimal-pad"
                value={attempts[activeAttempt].dropHeight}
                onChangeText={(val) => updateAttempt(activeAttempt, 'dropHeight', val)}
              />
            </View>

            {gradeLevel === 'highschool' && (
              <>
                <View style={styles.inputRow}>
                  <Text style={styles.inputLabel}>Mass of Toy (kg)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 0.20"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="decimal-pad"
                    value={attempts[activeAttempt].mass}
                    onChangeText={(val) => updateAttempt(activeAttempt, 'mass', val)}
                  />
                </View>

                <View style={styles.inputRow}>
                  <Text style={styles.inputLabel}>Contact Time (s)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 0.05"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="decimal-pad"
                    value={attempts[activeAttempt].contactTime}
                    onChangeText={(val) => updateAttempt(activeAttempt, 'contactTime', val)}
                  />
                </View>
              </>
            )}

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Your Prediction</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 0.5s"
                placeholderTextColor={Colors.textLight}
                value={attempts[activeAttempt].prediction}
                onChangeText={(val) => updateAttempt(activeAttempt, 'prediction', val)}
              />
            </View>
          </View>
            {/* Results */}
            {(() => {
            const results = calculate(attempts[activeAttempt]);
            if (!results) return null;
            return (
              <View style={styles.resultsSection}>
                <Text style={styles.resultsSectionTitle}>📊 Results</Text>

                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Final Velocity</Text>
                  <Text style={styles.resultValue}>{results.finalVelocity} m/s</Text>
                </View>

                {gradeLevel === 'highschool' && results.acceleration && (
                  <>
                    <View style={styles.resultDivider} />
                    <View style={styles.resultRow}>
                      <Text style={styles.resultLabel}>Acceleration</Text>
                      <Text style={styles.resultValue}>{results.acceleration} m/s²</Text>
                    </View>
                    <View style={styles.resultRow}>
                      <Text style={styles.resultLabel}>Weight</Text>
                      <Text style={styles.resultValue}>{results.weight} N</Text>
                    </View>
                    <View style={styles.resultRow}>
                      <Text style={styles.resultLabel}>Net Force</Text>
                      <Text style={styles.resultValue}>{results.netForce} N</Text>
                    </View>
                    <View style={styles.resultRow}>
                      <Text style={styles.resultLabel}>Drag Force</Text>
                      <Text style={styles.resultValue}>{results.dragForce} N</Text>
                    </View>
                    <View style={styles.resultDivider} />
                    <View style={styles.resultRow}>
                      <Text style={styles.resultLabel}>G-Force</Text>
                      <Text style={styles.resultValue}>{results.gForce} g</Text>
                    </View>
                    {results.gForceRisk && (
                      <View style={[styles.gForceRiskBadge, { borderColor: results.gForceRisk.color }]}>
                        <Text style={[styles.gForceRiskText, { color: results.gForceRisk.color }]}>
                          ⚠️ {results.gForceRisk.label}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })()}

        </View>

        {/* Summary Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.summarySectionTitle}>📋 All Attempts Summary</Text>

        {/* Save Button */}
      <TouchableOpacity
        style={[
          styles.saveButton,
          isSaving && styles.saveButtonDisabled,
        ]}
        onPress={handleSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color={Colors.text} />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={20} color={Colors.text} />
            <Text style={styles.saveButtonText}>Save Results</Text>
          </>
        )}
      </TouchableOpacity>

        {/* Table Rows */}
        {attempts.map((attempt, index) => {
          const results = calculate(attempt);
          const isBest = attempts.reduce((bestIdx, a, i) => {
            const t = parseFloat(a.dropTime);
            const bestT = parseFloat(attempts[bestIdx].dropTime);
            return t > bestT && index !== 0 ? i : bestIdx;
          }, 1);
          const isWinner = index === isBest && index !== 0 && attempt.dropTime;

          return (
            <View
              key={index}
              style={[
                styles.tableRow,
                isWinner && styles.tableRowWinner,
              ]}
            >
              <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {isWinner && <Text>🏆</Text>}
                <Text style={styles.tableCell}>
                  {index === 0 ? 'Baseline' : `Attempt ${index}`}
                </Text>
              </View>
              <Text style={styles.tableCell}>
                {attempt.dropTime ? `${attempt.dropTime}s` : '—'}
              </Text>
              <Text style={styles.tableCell}>
                {results ? `${results.finalVelocity}` : '—'}
              </Text>
              <Text style={styles.tableCell}>
                {attempt.prediction ? attempt.prediction : '—'}
              </Text>
            </View>
          );
        })}

        {/* Best Result Callout */}
        {attempts.some((a, i) => i !== 0 && a.dropTime) && (
          <View style={styles.bestResultCard}>
            <Text style={styles.bestResultText}>
              🏆 Best parachute design is the one with the{' '}
              <Text style={{ color: Colors.success, fontWeight: 'bold' }}>
                longest drop time
              </Text>{' '}
              — it slowed the fall the most!
            </Text>
          </View>
        )}
      </View>

      </ScrollView>
    </KeyboardAvoidingView>
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
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
  section: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  gradeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  gradeButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  gradeButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  gradeButtonText: {
    color: Colors.textLight,
    fontSize: FontSizes.medium,
    fontWeight: '600',
  },
  gradeButtonTextActive: {
    color: Colors.text,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  infoTitle: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  infoText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
  },
  focusBadge: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 8,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
  },
  focusText: {
    fontSize: FontSizes.small,
    color: Colors.secondary,
    fontWeight: '600',
  },
  attemptTabs: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  attemptTab: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  attemptTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  attemptTabText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    fontWeight: '600',
  },
  attemptTabTextActive: {
    color: Colors.text,
  },
  attemptCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.md,
  },
  attemptTitle: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
  },
  timerContainer: {
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
  },
  timerDisplay: {
    fontSize: 48,
    fontWeight: 'bold',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  timerButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
  },
  timerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    padding: Spacing.md,
  },
  timerBtnDanger: {
    backgroundColor: Colors.error,
  },
  timerBtnText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
  },
  timerBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
  },
  timerBtnOutlineText: {
    color: Colors.textLight,
    fontSize: FontSizes.medium,
    fontWeight: '600',
  },
  inputSection: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  inputSectionTitle: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  inputRow: {
    gap: Spacing.xs,
  },
  inputLabel: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: Spacing.md,
    fontSize: FontSizes.medium,
    color: Colors.text,
  },
  resultsSection: {
    width: '100%',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  resultsSectionTitle: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
  },
  resultValue: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
  },
  resultDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  gForceRiskBadge: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.sm,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  gForceRiskText: {
    fontSize: FontSizes.small,
    fontWeight: 'bold',
  },
  summarySection: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  summarySectionTitle: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  tableHeaderText: {
    flex: 1,
    fontSize: FontSizes.small,
    fontWeight: 'bold',
    color: Colors.textLight,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderRadius: 8,
    paddingHorizontal: Spacing.xs,
  },
  tableRowWinner: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  tableCell: {
    flex: 1,
    fontSize: FontSizes.small,
    color: Colors.text,
    textAlign: 'center',
  },
  bestResultCard: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 8,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  bestResultText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    lineHeight: 20,
  },
  backRow: {
    width: '100%',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
  },
});