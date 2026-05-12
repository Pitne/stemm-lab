import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useTeam } from '@/hooks/useTeam';
import { db } from '@/services/firebase';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Attempt = {
  id: number;
  player: string;
  movementType: string;
  prediction: string;
  smoothnessScore: number | null;
  meanJerk: number | null;
  maxJerk: number | null;
  durationSec: number | null;
};

const MEASURE_DURATION_SEC = 10;
const SAMPLE_INTERVAL_MS = 50;
const JERK_VIBRATION_THRESHOLD = 3.0;
const VIBRATION_COOLDOWN_MS = 300;

const defaultAttempt = (id: number): Attempt => ({
  id,
  player: '',
  movementType: '',
  prediction: '',
  smoothnessScore: null,
  meanJerk: null,
  maxJerk: null,
  durationSec: null,
});

const getSmoothnessRating = (score: number) => {
  if (score >= 80) return { label: 'Excellent', color: Colors.success };
  if (score >= 60) return { label: 'Good', color: Colors.success };
  if (score >= 40) return { label: 'Average', color: Colors.warning };
  if (score >= 20) return { label: 'Jerky', color: '#F97316' };
  return { label: 'Very jerky', color: Colors.error };
};

export default function PerformanceScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { team } = useTeam();

  const [attempts, setAttempts] = useState<Attempt[]>([
    defaultAttempt(1),
    defaultAttempt(2),
    defaultAttempt(3),
  ]);
  const [activeAttempt, setActiveAttempt] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [vibrationFeedback, setVibrationFeedback] = useState(true);

  useEffect(() => {
    if (!selectedPlayer && team?.members?.length) {
      setSelectedPlayer(team.members[0]);
    }
  }, [team, selectedPlayer]);

  const updateAttempt = (index: number, patch: Partial<Attempt>) => {
    setAttempts((prev) =>
      prev.map((a, i) => (i === index ? { ...a, ...patch } : a))
    );
  };

  // Live measurement state
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [liveSmoothness, setLiveSmoothness] = useState<number | null>(null);
  const [liveJerk, setLiveJerk] = useState<number>(0);
  const [remainingSec, setRemainingSec] = useState(MEASURE_DURATION_SEC);

  const subscriptionRef = useRef<any>(null);
  const prevARef = useRef<{ x: number; y: number; z: number; t: number } | null>(
    null
  );
  const jerkSumRef = useRef(0);
  const jerkMaxRef = useRef(0);
  const jerkCountRef = useRef(0);
  const lastVibrationRef = useRef(0);
  const startTimeRef = useRef(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibrationEnabledRef = useRef(true);

  // Keep ref in sync with state so listener always reads the latest value
  useEffect(() => {
    vibrationEnabledRef.current = vibrationFeedback;
  }, [vibrationFeedback]);

  useEffect(() => {
    return () => {
      Vibration.cancel();
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    };
  }, []);

  const startMeasurement = () => {
    if (!selectedPlayer) {
      Alert.alert(
        'Pick a player',
        'Please select which team member is performing.'
      );
      return;
    }

    prevARef.current = null;
    jerkSumRef.current = 0;
    jerkMaxRef.current = 0;
    jerkCountRef.current = 0;
    lastVibrationRef.current = 0;
    startTimeRef.current = Date.now();
    setLiveSmoothness(null);
    setLiveJerk(0);
    setRemainingSec(MEASURE_DURATION_SEC);
    setIsMeasuring(true);

    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
    subscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
      const now = Date.now();
      const prev = prevARef.current;
      if (prev) {
        const dt = (now - prev.t) / 1000;
        if (dt > 0) {
          const dax = (x - prev.x) / dt;
          const day = (y - prev.y) / dt;
          const daz = (z - prev.z) / dt;
          const jerkMag = Math.sqrt(dax * dax + day * day + daz * daz);
          jerkSumRef.current += jerkMag;
          jerkCountRef.current += 1;
          if (jerkMag > jerkMaxRef.current) jerkMaxRef.current = jerkMag;

          setLiveJerk(parseFloat(jerkMag.toFixed(2)));

          const meanJerk = jerkSumRef.current / jerkCountRef.current;
          const smoothness = Math.max(
            0,
            Math.min(100, 100 - meanJerk * 20)
          );
          setLiveSmoothness(parseFloat(smoothness.toFixed(1)));

          if (
            vibrationEnabledRef.current &&
            jerkMag > JERK_VIBRATION_THRESHOLD &&
            now - lastVibrationRef.current > VIBRATION_COOLDOWN_MS
          ) {
            Vibration.vibrate(80);
            lastVibrationRef.current = now;
          }
        }
      }
      prevARef.current = { x, y, z, t: now };
    });

    countdownRef.current = setInterval(() => {
      setRemainingSec((prev) => Math.max(0, prev - 1));
    }, 1000);

    stopTimeoutRef.current = setTimeout(() => {
      finishMeasurement();
    }, MEASURE_DURATION_SEC * 1000);
  };

  const finishMeasurement = () => {
    Vibration.cancel();
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }

    const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
    const safeDuration = Math.max(1, elapsedSec);
    const meanJerk =
      jerkCountRef.current > 0
        ? jerkSumRef.current / jerkCountRef.current
        : 0;
    const smoothness = Math.max(
      0,
      Math.min(100, 100 - meanJerk * 20)
    );

    updateAttempt(activeAttempt, {
      smoothnessScore: parseFloat(smoothness.toFixed(1)),
      meanJerk: parseFloat(meanJerk.toFixed(3)),
      maxJerk: parseFloat(jerkMaxRef.current.toFixed(3)),
      durationSec: parseFloat(safeDuration.toFixed(1)),
      player: selectedPlayer,
    });

    setLiveSmoothness(parseFloat(smoothness.toFixed(1)));
    setIsMeasuring(false);
    setRemainingSec(0);
  };

  const stopMeasurement = () => finishMeasurement();

  const resetMeasurement = () => {
    Vibration.cancel();
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    setIsMeasuring(false);
    setLiveSmoothness(null);
    setLiveJerk(0);
    setRemainingSec(MEASURE_DURATION_SEC);
    prevARef.current = null;
    jerkSumRef.current = 0;
    jerkMaxRef.current = 0;
    jerkCountRef.current = 0;
    updateAttempt(activeAttempt, {
      smoothnessScore: null,
      meanJerk: null,
      maxJerk: null,
      durationSec: null,
    });
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const hasData = attempts.some((a) => a.smoothnessScore !== null);
    if (!hasData) {
      Alert.alert(
        'No Data',
        'Complete at least one attempt before saving.'
      );
      return;
    }

    try {
      setIsSaving(true);
      const data = attempts.map((a, index) => ({
        attemptNumber: index + 1,
        player: a.player,
        movementType: a.movementType,
        prediction: a.prediction,
        smoothnessScore: a.smoothnessScore,
        meanJerk: a.meanJerk,
        maxJerk: a.maxJerk,
        durationSec: a.durationSec,
        rating:
          a.smoothnessScore !== null
            ? getSmoothnessRating(a.smoothnessScore).label
            : null,
      }));

      await addDoc(collection(db, 'results'), {
        activityId: 'performance',
        activityName: 'Human Performance Lab',
        teamId: team?.id ?? null,
        teamName: team?.name ?? null,
        userId: user?.uid ?? null,
        vibrationFeedbackUsed: vibrationFeedback,
        attempts: data,
        createdAt: serverTimestamp(),
      });

      Alert.alert('Saved', 'Your results have been saved successfully.', [
        { text: 'OK' },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save results. Please try again.');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const activeAttemptData = attempts[activeAttempt];
  const liveRating =
    liveSmoothness !== null ? getSmoothnessRating(liveSmoothness) : null;
  const savedRating =
    activeAttemptData.smoothnessScore !== null
      ? getSmoothnessRating(activeAttemptData.smoothnessScore)
      : null;

  const bestAttemptIndex = attempts.reduce<number | null>((bestIdx, a, i) => {
    if (a.smoothnessScore === null) return bestIdx;
    if (bestIdx === null) return i;
    const best = attempts[bestIdx].smoothnessScore;
    return best !== null && a.smoothnessScore > best ? i : bestIdx;
  }, null);

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
        {/* Back */}
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
          <Text style={styles.emoji}>🤸</Text>
          <Text style={styles.title}>Human Performance Lab</Text>
          <Text style={styles.subtitle}>
            Measure movement speed, smoothness and coordination
          </Text>
        </View>

        {/* Instructions */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Instructions</Text>
          <Text style={styles.infoText}>
            1. Pick the team member who is performing
          </Text>
          <Text style={styles.infoText}>
            2. Hold the phone firmly in one hand
          </Text>
          <Text style={styles.infoText}>
            3. Tap Start, then perform a controlled stretch / arm movement
          </Text>
          <Text style={styles.infoText}>
            4. The app measures jerk (changes in acceleration) and scores smoothness
          </Text>
          <Text style={styles.infoText}>
            5. Try again with vibration feedback on/off
          </Text>
          <View style={styles.focusBadge}>
            <Text style={styles.focusText}>
              📌 Smoother movements get a higher score
            </Text>
          </View>
        </View>

        {/* Player picker */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Player</Text>
          {team && team.members.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.playerScroll}
            >
              {team.members.map((member) => {
                const active = selectedPlayer === member;
                return (
                  <TouchableOpacity
                    key={member}
                    onPress={() => setSelectedPlayer(member)}
                    style={[
                      styles.playerChip,
                      active && styles.playerChipActive,
                    ]}
                  >
                    <Ionicons
                      name="person-circle-outline"
                      size={16}
                      color={active ? Colors.text : Colors.textLight}
                    />
                    <Text
                      style={[
                        styles.playerChipText,
                        active && styles.playerChipTextActive,
                      ]}
                    >
                      {member}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.noTeamText}>
              No team members yet. Set up a team first.
            </Text>
          )}
        </View>

        {/* Vibration feedback toggle */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Vibration feedback</Text>
            <Text style={styles.toggleHint}>
              Phone buzzes when movement is too jerky
            </Text>
          </View>
          <Switch
            value={vibrationFeedback}
            onValueChange={setVibrationFeedback}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={Colors.text}
          />
        </View>

        {/* Attempt tabs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attempts</Text>
          <View style={styles.attemptTabs}>
            {attempts.map((_, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.attemptTab,
                  activeAttempt === index && styles.attemptTabActive,
                ]}
                onPress={() => {
                  if (isMeasuring) stopMeasurement();
                  setActiveAttempt(index);
                }}
              >
                <Text
                  style={[
                    styles.attemptTabText,
                    activeAttempt === index && styles.attemptTabTextActive,
                  ]}
                >
                  {`Attempt ${index + 1}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Active card */}
        <View style={styles.attemptCard}>
          <Text style={styles.attemptTitle}>
            🤸 Attempt {activeAttempt + 1}
          </Text>

          {/* Movement type */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Movement type</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Side stretch, Arm circle, Slow reach"
              placeholderTextColor={Colors.textLight}
              value={activeAttemptData.movementType}
              onChangeText={(val) =>
                updateAttempt(activeAttempt, { movementType: val })
              }
            />
          </View>

          {/* Prediction */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Your prediction</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Smooth — score 80+"
              placeholderTextColor={Colors.textLight}
              value={activeAttemptData.prediction}
              onChangeText={(val) =>
                updateAttempt(activeAttempt, { prediction: val })
              }
            />
          </View>

          {/* Live display */}
          <View style={styles.scoreDisplay}>
            <Text style={styles.scoreValue}>
              {liveSmoothness !== null
                ? liveSmoothness
                : activeAttemptData.smoothnessScore !== null
                ? activeAttemptData.smoothnessScore
                : '—'}
            </Text>
            <Text style={styles.scoreLabel}>Smoothness score / 100</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statValueSmall}>
                  {isMeasuring
                    ? liveJerk
                    : activeAttemptData.meanJerk ?? '—'}
                </Text>
                <Text style={styles.statLabelSmall}>
                  {isMeasuring ? 'live jerk' : 'mean jerk'}
                </Text>
              </View>
              <View style={styles.statBlock}>
                <Text style={styles.statValueSmall}>
                  {isMeasuring
                    ? `${remainingSec}s`
                    : activeAttemptData.durationSec !== null
                    ? `${activeAttemptData.durationSec}s`
                    : `${MEASURE_DURATION_SEC}s`}
                </Text>
                <Text style={styles.statLabelSmall}>
                  {isMeasuring ? 'remaining' : 'duration'}
                </Text>
              </View>
              <View style={styles.statBlock}>
                <Text style={styles.statValueSmall}>
                  {activeAttemptData.maxJerk ?? '—'}
                </Text>
                <Text style={styles.statLabelSmall}>max jerk</Text>
              </View>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                isMeasuring && styles.actionBtnDanger,
              ]}
              onPress={isMeasuring ? stopMeasurement : startMeasurement}
            >
              <Ionicons
                name={isMeasuring ? 'stop' : 'play'}
                size={20}
                color={Colors.text}
              />
              <Text style={styles.actionBtnText}>
                {isMeasuring
                  ? 'Stop'
                  : `Start ${MEASURE_DURATION_SEC}s`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtnOutline}
              onPress={resetMeasurement}
              disabled={isMeasuring}
            >
              <Ionicons name="refresh" size={20} color={Colors.textLight} />
              <Text style={styles.actionBtnOutlineText}>Reset</Text>
            </TouchableOpacity>
          </View>

          {(liveRating || savedRating) && (
            <View
              style={[
                styles.ratingBadge,
                { borderColor: (liveRating ?? savedRating)!.color },
              ]}
            >
              <Text
                style={[
                  styles.ratingText,
                  { color: (liveRating ?? savedRating)!.color },
                ]}
              >
                Smoothness: {(liveRating ?? savedRating)!.label}
              </Text>
            </View>
          )}
        </View>

        {/* Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>📋 Results Summary</Text>

          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1.4 }]}>Attempt</Text>
            <Text style={styles.tableHeaderText}>Player</Text>
            <Text style={styles.tableHeaderText}>Score</Text>
            <Text style={styles.tableHeaderText}>Rating</Text>
          </View>

          {attempts.map((a, index) => {
            const measured = a.smoothnessScore !== null;
            const rating = measured
              ? getSmoothnessRating(a.smoothnessScore as number)
              : null;
            const isWinner = measured && bestAttemptIndex === index;
            return (
              <View
                key={index}
                style={[
                  styles.tableRow,
                  isWinner && styles.tableRowWinner,
                ]}
              >
                <View
                  style={{
                    flex: 1.4,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {isWinner && <Text>🏆</Text>}
                  <Text style={styles.tableCell} numberOfLines={1}>
                    {`Attempt ${index + 1}`}
                  </Text>
                </View>
                <Text style={styles.tableCell} numberOfLines={1}>
                  {a.player || '—'}
                </Text>
                <Text style={styles.tableCell}>
                  {measured ? a.smoothnessScore : '—'}
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    rating && { color: rating.color, fontWeight: 'bold' },
                  ]}
                  numberOfLines={1}
                >
                  {rating ? rating.label : '—'}
                </Text>
              </View>
            );
          })}

          {bestAttemptIndex !== null && (
            <View style={styles.bestResultCard}>
              <Text style={styles.bestResultText}>
                🏆 Best attempt had the{' '}
                <Text style={{ color: Colors.success, fontWeight: 'bold' }}>
                  highest smoothness score
                </Text>{' '}
                — smoother movement = better coordination.
              </Text>
            </View>
          )}
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving || isMeasuring}
        >
          {isSaving ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <>
              <Ionicons
                name="cloud-upload-outline"
                size={20}
                color={Colors.text}
              />
              <Text style={styles.saveButtonText}>Save Results</Text>
            </>
          )}
        </TouchableOpacity>
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
  backRow: {
    width: '100%',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
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
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSizes.medium,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 4,
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
  section: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  playerScroll: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  playerChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  playerChipText: {
    color: Colors.textLight,
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  playerChipTextActive: {
    color: Colors.text,
  },
  noTeamText: {
    color: Colors.textLight,
    fontSize: FontSizes.small,
    fontStyle: 'italic',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  toggleLabel: {
    fontSize: FontSizes.medium,
    color: Colors.text,
    fontWeight: '600',
  },
  toggleHint: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    marginTop: 2,
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
    gap: Spacing.md,
  },
  attemptTitle: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
  },
  fieldGroup: {
    gap: Spacing.xs,
  },
  fieldLabel: {
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
  scoreDisplay: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: 'bold',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  scoreLabel: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.sm,
  },
  statBlock: {
    alignItems: 'center',
    minWidth: 64,
  },
  statValueSmall: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  statLabelSmall: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 2,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    padding: Spacing.md,
  },
  actionBtnDanger: {
    backgroundColor: Colors.error,
  },
  actionBtnText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
  },
  actionBtnOutline: {
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
  actionBtnOutlineText: {
    color: Colors.textLight,
    fontSize: FontSizes.medium,
    fontWeight: '600',
  },
  ratingBadge: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  ratingText: {
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
