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
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Design = {
  id: number;
  label: string;
  prediction: string;
  displacement: number | null;
  maxAxis: 'x' | 'y' | null;
  durationMs: number;
};

const DESIGN_LABELS = [
  '4 folds + 4 pillars',
  '10 folds + 4 pillars',
  '3 folds + 6 pillars',
];

const defaultDesign = (id: number, label: string): Design => ({
  id,
  label,
  prediction: '',
  displacement: null,
  maxAxis: null,
  durationMs: 5000,
});

const VIBRATION_PATTERN = [0, 250, 100, 250, 100, 250, 100, 250];
const SAMPLE_INTERVAL_MS = 50;
const MEASURE_DURATION_MS = 5000;

const getStabilityRating = (displacement: number) => {
  if (displacement < 0.3) return { label: 'Excellent', color: Colors.success };
  if (displacement < 0.6) return { label: 'Good', color: Colors.success };
  if (displacement < 1.0) return { label: 'Average', color: Colors.warning };
  if (displacement < 1.5) return { label: 'Poor', color: '#F97316' };
  return { label: 'Failed', color: Colors.error };
};

export default function EarthquakeScreen() {
  const insets = useSafeAreaInsets();
  const [designs, setDesigns] = useState<Design[]>([
    defaultDesign(1, DESIGN_LABELS[0]),
    defaultDesign(2, DESIGN_LABELS[1]),
    defaultDesign(3, DESIGN_LABELS[2]),
  ]);
  const [activeDesign, setActiveDesign] = useState(0);

  const updateDesign = (index: number, field: keyof Design, value: any) => {
    setDesigns((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    );
  };

  const [isTesting, setIsTesting] = useState(false);
  const [liveDisplacement, setLiveDisplacement] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(MEASURE_DURATION_MS);

  const subscriptionRef = useRef<any>(null);
  const minRef = useRef({ x: Infinity, y: Infinity });
  const maxRef = useRef({ x: -Infinity, y: -Infinity });
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount: ensure no orphan vibration/listener/timers
      Vibration.cancel();
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    };
  }, []);

  const computeDisplacement = () => {
    const dx = maxRef.current.x - minRef.current.x;
    const dy = maxRef.current.y - minRef.current.y;
    const total = Math.sqrt(dx * dx + dy * dy);
    const dominantAxis: 'x' | 'y' = dx >= dy ? 'x' : 'y';
    return { total, dominantAxis };
  };

  const startTest = () => {
    minRef.current = { x: Infinity, y: Infinity };
    maxRef.current = { x: -Infinity, y: -Infinity };
    setLiveDisplacement(null);
    setRemainingMs(MEASURE_DURATION_MS);
    setIsTesting(true);

    Vibration.vibrate(VIBRATION_PATTERN, true);

    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
    subscriptionRef.current = Accelerometer.addListener(({ x, y }) => {
      if (x < minRef.current.x) minRef.current.x = x;
      if (y < minRef.current.y) minRef.current.y = y;
      if (x > maxRef.current.x) maxRef.current.x = x;
      if (y > maxRef.current.y) maxRef.current.y = y;
      const { total } = computeDisplacement();
      setLiveDisplacement(parseFloat(total.toFixed(3)));
    });

    countdownRef.current = setInterval(() => {
      setRemainingMs((prev) => Math.max(0, prev - 100));
    }, 100);

    stopTimeoutRef.current = setTimeout(() => {
      finishTest();
    }, MEASURE_DURATION_MS);
  };

  const finishTest = () => {
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

    const { total, dominantAxis } = computeDisplacement();
    const safeTotal = Number.isFinite(total) ? parseFloat(total.toFixed(3)) : 0;
    updateDesign(activeDesign, 'displacement', safeTotal);
    updateDesign(activeDesign, 'maxAxis', dominantAxis);
    setLiveDisplacement(safeTotal);
    setIsTesting(false);
    setRemainingMs(0);
  };

  const cancelTest = () => {
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
    setIsTesting(false);
    setRemainingMs(MEASURE_DURATION_MS);
    setLiveDisplacement(null);
  };

  const resetMeasurement = () => {
    cancelTest();
    updateDesign(activeDesign, 'displacement', null);
    updateDesign(activeDesign, 'maxAxis', null);
  };

  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAuth();
  const { team } = useTeam();

  const handleSave = async () => {
    const hasData = designs.some((d) => d.displacement !== null);
    if (!hasData) {
      Alert.alert(
        'No Data',
        'Please complete at least one design test before saving.'
      );
      return;
    }

    try {
      setIsSaving(true);
      const designsData = designs.map((design, index) => ({
        designNumber: index + 1,
        label: design.label,
        prediction: design.prediction,
        displacement: design.displacement,
        dominantAxis: design.maxAxis,
        stability:
          design.displacement !== null
            ? getStabilityRating(design.displacement).label
            : null,
        durationMs: design.durationMs,
      }));

      await addDoc(collection(db, 'results'), {
        activityId: 'earthquake',
        activityName: 'Earthquake-Resistant Structure',
        teamId: team?.id ?? null,
        teamName: team?.name ?? null,
        userId: user?.uid ?? null,
        designs: designsData,
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

  const activeDesignData = designs[activeDesign];
  const stability =
    activeDesignData.displacement !== null
      ? getStabilityRating(activeDesignData.displacement)
      : null;

  const bestDesignIndex = designs.reduce<number | null>((bestIdx, d, i) => {
    if (d.displacement === null) return bestIdx;
    if (bestIdx === null) return i;
    const best = designs[bestIdx].displacement;
    return best !== null && d.displacement < best ? i : bestIdx;
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
        {/* Back Button */}
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
          <Text style={styles.emoji}>🏗️</Text>
          <Text style={styles.title}>Earthquake-Resistant Structure</Text>
          <Text style={styles.subtitle}>
            Design a structure that withstands vibration
          </Text>
        </View>

        {/* Instructions */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Instructions</Text>
          <Text style={styles.infoText}>
            1. Build an anti-vibration layer with paper/cardboard folds and pillars
          </Text>
          <Text style={styles.infoText}>
            2. Place a flat cardboard platform on top
          </Text>
          <Text style={styles.infoText}>
            3. Place the phone in the centre of the platform
          </Text>
          <Text style={styles.infoText}>
            4. Tap “Start test” — the phone will vibrate for 5 seconds
          </Text>
          <Text style={styles.infoText}>
            5. Modify the structure and re-run to reduce phone movement
          </Text>
          <View style={styles.focusBadge}>
            <Text style={styles.focusText}>
              📌 Smaller displacement means the structure absorbed the shake better
            </Text>
          </View>
        </View>

        {/* Design Tabs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Designs</Text>
          <View style={styles.designTabs}>
            {designs.map((_, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.designTab,
                  activeDesign === index && styles.designTabActive,
                ]}
                onPress={() => {
                  if (isTesting) cancelTest();
                  setActiveDesign(index);
                }}
              >
                <Text
                  style={[
                    styles.designTabText,
                    activeDesign === index && styles.designTabTextActive,
                  ]}
                >
                  {`Design ${index + 1}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Active Design Card */}
        <View style={styles.designCard}>
          <Text style={styles.designTitle}>
            🏗️ Design {activeDesign + 1} — {activeDesignData.label}
          </Text>

          {/* Prediction */}
          <View style={styles.predictRow}>
            <Text style={styles.selectorLabel}>Your prediction</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. ± 1 cm"
              placeholderTextColor={Colors.textLight}
              value={activeDesignData.prediction}
              onChangeText={(val) =>
                updateDesign(activeDesign, 'prediction', val)
              }
            />
          </View>

          {/* Live measurement */}
          <View style={styles.measurementSection}>
            <Text style={styles.selectorLabel}>📐 Vibration measurement</Text>
            <Text style={styles.measurementHint}>
              Place the phone on top of the structure, then start the test.
              Phone will vibrate for 5 seconds while measuring movement.
            </Text>

            <View style={styles.displacementDisplay}>
              <Text style={styles.displacementValue}>
                {liveDisplacement !== null
                  ? `${liveDisplacement}`
                  : activeDesignData.displacement !== null
                  ? `${activeDesignData.displacement}`
                  : '—'}
              </Text>
              <Text style={styles.displacementLabel}>
                Displacement (g, peak-to-peak)
              </Text>
              {isTesting && (
                <Text style={styles.countdownText}>
                  {(remainingMs / 1000).toFixed(1)}s remaining
                </Text>
              )}
            </View>

            <View style={styles.measureButtons}>
              <TouchableOpacity
                style={[
                  styles.measureBtn,
                  isTesting && styles.measureBtnDanger,
                ]}
                onPress={isTesting ? cancelTest : startTest}
              >
                <Ionicons
                  name={isTesting ? 'stop' : 'play'}
                  size={20}
                  color={Colors.text}
                />
                <Text style={styles.measureBtnText}>
                  {isTesting ? 'Stop' : 'Start test'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.measureBtnOutline}
                onPress={resetMeasurement}
                disabled={isTesting}
              >
                <Ionicons name="refresh" size={20} color={Colors.textLight} />
                <Text style={styles.measureBtnOutlineText}>Reset</Text>
              </TouchableOpacity>
            </View>

            {/* Result */}
            {activeDesignData.displacement !== null && (
              <View style={styles.resultBlock}>
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Displacement</Text>
                  <Text style={styles.resultValue}>
                    {activeDesignData.displacement} g
                  </Text>
                </View>
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Dominant axis</Text>
                  <Text style={styles.resultValue}>
                    {activeDesignData.maxAxis?.toUpperCase() ?? '—'}
                  </Text>
                </View>
                {stability && (
                  <View
                    style={[
                      styles.stabilityBadge,
                      { borderColor: stability.color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.stabilityText,
                        { color: stability.color },
                      ]}
                    >
                      Stability: {stability.label}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>📋 Results Summary</Text>

          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1.6 }]}>Design</Text>
            <Text style={styles.tableHeaderText}>Displacement</Text>
            <Text style={styles.tableHeaderText}>Stability</Text>
          </View>

          {designs.map((design, index) => {
            const measured = design.displacement !== null;
            const isWinner = measured && bestDesignIndex === index;
            const rating = measured
              ? getStabilityRating(design.displacement as number)
              : null;
            return (
              <View
                key={index}
                style={[styles.tableRow, isWinner && styles.tableRowWinner]}
              >
                <View
                  style={{
                    flex: 1.6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {isWinner && <Text>🏆</Text>}
                  <Text style={styles.tableCell} numberOfLines={1}>
                    {`Design ${index + 1}`}
                  </Text>
                </View>
                <Text style={styles.tableCell}>
                  {measured ? `${design.displacement}` : '—'}
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

          {bestDesignIndex !== null && (
            <View style={styles.bestResultCard}>
              <Text style={styles.bestResultText}>
                🏆 Best structure is the one with the{' '}
                <Text style={{ color: Colors.success, fontWeight: 'bold' }}>
                  smallest displacement
                </Text>{' '}
                — it absorbed the vibration the most!
              </Text>
            </View>
          )}
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving || isTesting}
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
  designTabs: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  designTab: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  designTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  designTabText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    fontWeight: '600',
  },
  designTabTextActive: {
    color: Colors.text,
  },
  designCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  designTitle: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
  },
  predictRow: {
    gap: Spacing.xs,
  },
  selectorLabel: {
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
  measurementSection: {
    gap: Spacing.sm,
  },
  measurementHint: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  displacementDisplay: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  displacementValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  displacementLabel: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
  },
  countdownText: {
    fontSize: FontSizes.small,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  measureButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  measureBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    padding: Spacing.md,
  },
  measureBtnDanger: {
    backgroundColor: Colors.error,
  },
  measureBtnText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
  },
  measureBtnOutline: {
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
  measureBtnOutlineText: {
    color: Colors.textLight,
    fontSize: FontSizes.medium,
    fontWeight: '600',
  },
  resultBlock: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: Spacing.md,
    gap: Spacing.sm,
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
  stabilityBadge: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.sm,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  stabilityText: {
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
