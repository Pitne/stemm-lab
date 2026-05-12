import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useTeam } from '@/hooks/useTeam';
import { db } from '@/services/firebase';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
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

type Phase = 'rest' | 'post-jog' | 'post-jumps';

type Measurement = {
  id: number;
  phase: Phase;
  phaseLabel: string;
  player: string;
  prediction: string;
  bpm: number | null;
  breathCount: number | null;
  durationSec: number | null;
};

const PHASES: { key: Phase; label: string; emoji: string; hint: string }[] = [
  {
    key: 'rest',
    label: 'At Rest',
    emoji: '😌',
    hint: 'Sit or lie still and breathe normally',
  },
  {
    key: 'post-jog',
    label: 'After 1-min jog',
    emoji: '🏃',
    hint: 'Jog on the spot for one minute, then measure',
  },
  {
    key: 'post-jumps',
    label: 'After 100 star jumps',
    emoji: '💥',
    hint: 'Do 100 star jumps, then measure straight away',
  },
];

const DEFAULT_DURATION_SEC = 30;
const SAMPLE_INTERVAL_MS = 50;
const SMOOTH_WINDOW = 20;
const PEAK_THRESHOLD = 0.02;

const defaultMeasurement = (id: number, phase: Phase, label: string): Measurement => ({
  id,
  phase,
  phaseLabel: label,
  player: '',
  prediction: '',
  bpm: null,
  breathCount: null,
  durationSec: null,
});

const getBpmLevel = (bpm: number) => {
  if (bpm < 12) return { label: 'Low / calm', color: Colors.success };
  if (bpm < 20) return { label: 'Normal rest', color: Colors.success };
  if (bpm < 30) return { label: 'Elevated', color: Colors.warning };
  if (bpm < 50) return { label: 'Post-exercise', color: '#F97316' };
  return { label: 'Very high', color: Colors.error };
};

export default function BreathingScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { team } = useTeam();

  const [measurements, setMeasurements] = useState<Measurement[]>(() =>
    PHASES.map((p, i) => defaultMeasurement(i + 1, p.key, p.label))
  );
  const [activePhase, setActivePhase] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');

  // Initialise player selection from team
  useEffect(() => {
    if (!selectedPlayer && team?.members?.length) {
      setSelectedPlayer(team.members[0]);
    }
  }, [team, selectedPlayer]);

  const updateMeasurement = (
    index: number,
    patch: Partial<Measurement>
  ) => {
    setMeasurements((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m))
    );
  };

  // Measurement state
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [liveBpm, setLiveBpm] = useState<number | null>(null);
  const [liveBreathCount, setLiveBreathCount] = useState(0);
  const [remainingSec, setRemainingSec] = useState(DEFAULT_DURATION_SEC);

  const subscriptionRef = useRef<any>(null);
  const zBufferRef = useRef<number[]>([]);
  const stateRef = useRef<'above' | 'below'>('below');
  const breathCountRef = useRef(0);
  const startTimeRef = useRef(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
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
        'Please select which team member is being measured.'
      );
      return;
    }

    zBufferRef.current = [];
    stateRef.current = 'below';
    breathCountRef.current = 0;
    startTimeRef.current = Date.now();
    setLiveBpm(null);
    setLiveBreathCount(0);
    setRemainingSec(DEFAULT_DURATION_SEC);
    setIsMeasuring(true);

    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
    subscriptionRef.current = Accelerometer.addListener(({ z }) => {
      const buf = zBufferRef.current;
      buf.push(z);
      if (buf.length > SMOOTH_WINDOW) buf.shift();
      if (buf.length < SMOOTH_WINDOW) return;

      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;

      if (stateRef.current === 'below' && z > avg + PEAK_THRESHOLD) {
        stateRef.current = 'above';
        breathCountRef.current += 1;
        setLiveBreathCount(breathCountRef.current);

        const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
        if (elapsedSec > 1) {
          const bpm = (breathCountRef.current / elapsedSec) * 60;
          setLiveBpm(parseFloat(bpm.toFixed(1)));
        }
      } else if (stateRef.current === 'above' && z < avg - PEAK_THRESHOLD) {
        stateRef.current = 'below';
      }
    });

    countdownRef.current = setInterval(() => {
      setRemainingSec((prev) => Math.max(0, prev - 1));
    }, 1000);

    stopTimeoutRef.current = setTimeout(() => {
      finishMeasurement();
    }, DEFAULT_DURATION_SEC * 1000);
  };

  const finishMeasurement = () => {
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
    const finalBpm = parseFloat(
      ((breathCountRef.current / safeDuration) * 60).toFixed(1)
    );

    updateMeasurement(activePhase, {
      bpm: finalBpm,
      breathCount: breathCountRef.current,
      durationSec: parseFloat(safeDuration.toFixed(1)),
      player: selectedPlayer,
    });

    setLiveBpm(finalBpm);
    setIsMeasuring(false);
    setRemainingSec(0);
  };

  const stopMeasurement = () => {
    finishMeasurement();
  };

  const resetMeasurement = () => {
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
    setLiveBpm(null);
    setLiveBreathCount(0);
    setRemainingSec(DEFAULT_DURATION_SEC);
    zBufferRef.current = [];
    stateRef.current = 'below';
    breathCountRef.current = 0;
    updateMeasurement(activePhase, {
      bpm: null,
      breathCount: null,
      durationSec: null,
    });
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const hasData = measurements.some((m) => m.bpm !== null);
    if (!hasData) {
      Alert.alert(
        'No Data',
        'Complete at least one measurement before saving.'
      );
      return;
    }

    try {
      setIsSaving(true);
      const data = measurements.map((m, index) => ({
        phaseNumber: index + 1,
        phase: m.phase,
        phaseLabel: m.phaseLabel,
        player: m.player,
        prediction: m.prediction,
        bpm: m.bpm,
        breathCount: m.breathCount,
        durationSec: m.durationSec,
        level: m.bpm !== null ? getBpmLevel(m.bpm).label : null,
      }));

      await addDoc(collection(db, 'results'), {
        activityId: 'breathing',
        activityName: 'Breathing Pace Trainer',
        teamId: team?.id ?? null,
        teamName: team?.name ?? null,
        userId: user?.uid ?? null,
        measurements: data,
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

  const activeMeasurement = measurements[activePhase];
  const activePhaseSpec = PHASES[activePhase];
  const liveLevel = useMemo(
    () => (liveBpm !== null ? getBpmLevel(liveBpm) : null),
    [liveBpm]
  );

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
          <Text style={styles.emoji}>🫁</Text>
          <Text style={styles.title}>Breathing Pace Trainer</Text>
          <Text style={styles.subtitle}>
            Compare breathing rate at rest and after exercise
          </Text>
        </View>

        {/* Instructions */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Instructions</Text>
          <Text style={styles.infoText}>
            1. Sit or lie down and place the phone gently on your chest
          </Text>
          <Text style={styles.infoText}>
            2. Pick the team member who is being measured
          </Text>
          <Text style={styles.infoText}>
            3. Tap Start and breathe normally for 30 seconds
          </Text>
          <Text style={styles.infoText}>
            4. Repeat after light jogging and after star jumps
          </Text>
          <View style={styles.focusBadge}>
            <Text style={styles.focusText}>
              📌 Rotate through each team member for full results
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
                    style={[styles.playerChip, active && styles.playerChipActive]}
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

        {/* Phase tabs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Measurements</Text>
          <View style={styles.phaseTabs}>
            {PHASES.map((p, index) => (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.phaseTab,
                  activePhase === index && styles.phaseTabActive,
                ]}
                onPress={() => {
                  if (isMeasuring) stopMeasurement();
                  setActivePhase(index);
                }}
              >
                <Text style={styles.phaseEmoji}>{p.emoji}</Text>
                <Text
                  style={[
                    styles.phaseTabText,
                    activePhase === index && styles.phaseTabTextActive,
                  ]}
                  numberOfLines={2}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Active card */}
        <View style={styles.phaseCard}>
          <Text style={styles.phaseTitle}>
            {activePhaseSpec.emoji} {activePhaseSpec.label}
          </Text>
          <Text style={styles.phaseHint}>{activePhaseSpec.hint}</Text>

          {/* Prediction */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Your prediction</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 14 BPM"
              placeholderTextColor={Colors.textLight}
              value={activeMeasurement.prediction}
              onChangeText={(val) =>
                updateMeasurement(activePhase, { prediction: val })
              }
            />
          </View>

          {/* Live display */}
          <View style={styles.bpmDisplay}>
            <Text style={styles.bpmValue}>
              {liveBpm !== null
                ? liveBpm
                : activeMeasurement.bpm !== null
                ? activeMeasurement.bpm
                : '—'}
            </Text>
            <Text style={styles.bpmLabel}>Breaths per minute (BPM)</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statValueSmall}>
                  {isMeasuring ? liveBreathCount : activeMeasurement.breathCount ?? '—'}
                </Text>
                <Text style={styles.statLabelSmall}>breaths</Text>
              </View>
              <View style={styles.statBlock}>
                <Text style={styles.statValueSmall}>
                  {isMeasuring
                    ? `${remainingSec}s`
                    : activeMeasurement.durationSec !== null
                    ? `${activeMeasurement.durationSec}s`
                    : `${DEFAULT_DURATION_SEC}s`}
                </Text>
                <Text style={styles.statLabelSmall}>
                  {isMeasuring ? 'remaining' : 'duration'}
                </Text>
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
                {isMeasuring ? 'Stop' : 'Start 30s'}
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

          {/* Level badge */}
          {(liveLevel || activeMeasurement.bpm !== null) && (
            <View
              style={[
                styles.levelBadge,
                {
                  borderColor:
                    liveLevel?.color ??
                    getBpmLevel(activeMeasurement.bpm as number).color,
                },
              ]}
            >
              <Text
                style={[
                  styles.levelText,
                  {
                    color:
                      liveLevel?.color ??
                      getBpmLevel(activeMeasurement.bpm as number).color,
                  },
                ]}
              >
                {liveLevel?.label ??
                  getBpmLevel(activeMeasurement.bpm as number).label}
              </Text>
            </View>
          )}
        </View>

        {/* Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>📋 Results Summary</Text>

          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1.4 }]}>Phase</Text>
            <Text style={styles.tableHeaderText}>Player</Text>
            <Text style={styles.tableHeaderText}>BPM</Text>
            <Text style={styles.tableHeaderText}>Predicted</Text>
          </View>

          {measurements.map((m, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={{ flex: 1.4 }}>
                <Text style={styles.tableCell} numberOfLines={1}>
                  {m.phaseLabel}
                </Text>
              </View>
              <Text style={styles.tableCell} numberOfLines={1}>
                {m.player || '—'}
              </Text>
              <Text style={styles.tableCell}>
                {m.bpm !== null ? m.bpm : '—'}
              </Text>
              <Text style={styles.tableCell} numberOfLines={1}>
                {m.prediction || '—'}
              </Text>
            </View>
          ))}

          {measurements.some((m) => m.bpm !== null) && (
            <View style={styles.bestResultCard}>
              <Text style={styles.bestResultText}>
                💡 Compare your BPM at rest vs after exercise — the difference
                shows how your body responds to physical activity.
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
  phaseTabs: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  phaseTab: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    gap: 4,
  },
  phaseTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  phaseEmoji: {
    fontSize: 20,
  },
  phaseTabText: {
    fontSize: 11,
    color: Colors.textLight,
    fontWeight: '600',
    textAlign: 'center',
  },
  phaseTabTextActive: {
    color: Colors.text,
  },
  phaseCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  phaseTitle: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
  },
  phaseHint: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    fontStyle: 'italic',
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
  bpmDisplay: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  bpmValue: {
    fontSize: 64,
    fontWeight: 'bold',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  bpmLabel: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    marginTop: Spacing.sm,
  },
  statBlock: {
    alignItems: 'center',
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
  levelBadge: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  levelText: {
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
