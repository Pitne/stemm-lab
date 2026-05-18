import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useTeam } from '@/hooks/useTeam';
import { db } from '@/services/firebase';
import { scheduleChallengeNotification, sendResultsSavedNotification } from '@/services/notificationService';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
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
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Material = {
  label: string;
  stiffness: number;
};

const MATERIALS: Material[] = [
  { label: 'Thin printer paper', stiffness: 0.05 },
  { label: 'Standard card stock', stiffness: 0.20 },
  { label: 'Thin cardboard', stiffness: 0.50 },
  { label: 'Corrugated cardboard', stiffness: 2.50 },
];

const DISTANCES = ['15cm', '30cm', '45cm'];

type Design = {
  id: number;
  material: Material;
  distance: string;
  prediction: string;
  bendAngle: number | null;
  force: number | null;
};

const defaultDesign = (id: number): Design => ({
  id,
  material: MATERIALS[0],
  distance: '30cm',
  prediction: '',
  bendAngle: null,
  force: null,
});

const calculateForce = (bendAngleDegrees: number, stiffness: number) => {
  const radians = bendAngleDegrees * (Math.PI / 180);
  return stiffness * radians;
};

export default function HandFanScreen() {
  const insets = useSafeAreaInsets();
  const [designs, setDesigns] = useState<Design[]>([
    defaultDesign(1),
    defaultDesign(2),
    defaultDesign(3),
  ]);
  const [activeDesign, setActiveDesign] = useState(0);

  const updateDesign = (index: number, field: keyof Design, value: any) => {
    setDesigns((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    );
  };

  const [isMeasuring, setIsMeasuring] = useState(false);
const [liveAngle, setLiveAngle] = useState<number | null>(null);
const subscriptionRef = useRef<any>(null);

const startMeasuring = () => {
  Accelerometer.setUpdateInterval(100);
  subscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
    // Calculate tilt angle from accelerometer data
    const angle = Math.abs(
      Math.atan2(y, Math.sqrt(x * x + z * z)) * (180 / Math.PI)
    );
    setLiveAngle(parseFloat(angle.toFixed(1)));
  });
  setIsMeasuring(true);
};

const stopMeasuring = () => {
  if (subscriptionRef.current) {
    subscriptionRef.current.remove();
    subscriptionRef.current = null;
  }
  setIsMeasuring(false);

  if (liveAngle !== null) {
    const force = calculateForce(liveAngle, designs[activeDesign].material.stiffness);
    updateDesign(activeDesign, 'bendAngle', liveAngle);
    updateDesign(activeDesign, 'force', parseFloat(force.toFixed(4)));
  }
};

const resetMeasurement = () => {
  if (subscriptionRef.current) {
    subscriptionRef.current.remove();
    subscriptionRef.current = null;
  }
  setIsMeasuring(false);
  setLiveAngle(null);
  updateDesign(activeDesign, 'bendAngle', null);
  updateDesign(activeDesign, 'force', null);
};

const [isSaving, setIsSaving] = useState(false);
const { user } = useAuth();
const { team } = useTeam();

const handleSave = async () => {
  const hasData = designs.some((d) => d.bendAngle !== null);
  if (!hasData) {
    Alert.alert('No Data', 'Please complete at least one measurement before saving.');
    return;
  }

  try {
    setIsSaving(true);
    const designsData = designs.map((design, index) => ({
      designNumber: index + 1,
      material: design.material.label,
      stiffness: design.material.stiffness,
      distance: design.distance,
      prediction: design.prediction,
      bendAngle: design.bendAngle,
      force: design.force,
    }));

    await addDoc(collection(db, 'results'), {
      activityId: 'handfan',
      activityName: 'Hand Fan Challenge',
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
      userId: user?.uid ?? null,
      designs: designsData,
      createdAt: serverTimestamp(),
    });

    Alert.alert('✅ Saved!', 'Your results have been saved successfully.', [{ text: 'OK' }]);
    await sendResultsSavedNotification(
      'Hand Fan Challenge',
      team?.name ?? 'Your team'
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
          <Text style={styles.emoji}>🌬️</Text>
          <Text style={styles.title}>Hand Fan Challenge</Text>
          <Text style={styles.subtitle}>
            Test how air movement affects flexible materials
          </Text>
        </View>
        
        {/* Challenge Timer */}
<TouchableOpacity
  style={styles.challengeTimer}
  onPress={async () => {
    const id = await scheduleChallengeNotification(
      'Hand Fan Challenge',
      20
    );
    if (id) {
      Alert.alert(
        '⏰ Challenge Started!',
        'You will be notified in 20 minutes when your challenge time is up!',
        [{ text: 'OK' }]
      );
    }
  }}
>
  <Ionicons name="timer-outline" size={20} color={Colors.text} />
  <Text style={styles.challengeTimerText}>Start 20 min Challenge</Text>
</TouchableOpacity>

        {/* Instructions */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Instructions</Text>
          <Text style={styles.infoText}>1. Stand paper upright on a table</Text>
          <Text style={styles.infoText}>2. Place phone flat against the paper</Text>
          <Text style={styles.infoText}>3. Fan air from the selected distance</Text>
          <Text style={styles.infoText}>4. Measure the bend angle using the app</Text>
          <Text style={styles.infoText}>5. Repeat with different designs and distances</Text>
          <View style={styles.focusBadge}>
            <Text style={styles.focusText}>
              📌 Which fan design makes the paper move the most?
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
                onPress={() => setActiveDesign(index)}
              >
                <Text style={[
                  styles.designTabText,
                  activeDesign === index && styles.designTabTextActive,
                ]}>
                  {`Design ${index + 1}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Active Design Card */}
        <View style={styles.designCard}>
          <Text style={styles.designTitle}>
            🌬️ Design {activeDesign + 1}
          </Text>

          {/* Material Selector */}
          <View style={styles.selectorSection}>
            <Text style={styles.selectorLabel}>Material</Text>
            <View style={styles.selectorGrid}>
              {MATERIALS.map((mat, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.selectorOption,
                    designs[activeDesign].material.label === mat.label &&
                      styles.selectorOptionActive,
                  ]}
                  onPress={() => updateDesign(activeDesign, 'material', mat)}
                >
                  <Text style={[
                    styles.selectorOptionText,
                    designs[activeDesign].material.label === mat.label &&
                      styles.selectorOptionTextActive,
                  ]}>
                    {mat.label}
                  </Text>
                  <Text style={styles.selectorOptionSub}>
                    k = {mat.stiffness}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Distance Selector */}
          <View style={styles.selectorSection}>
            <Text style={styles.selectorLabel}>Fan Distance</Text>
            <View style={styles.distanceRow}>
              {DISTANCES.map((dist) => (
                <TouchableOpacity
                  key={dist}
                  style={[
                    styles.distanceOption,
                    designs[activeDesign].distance === dist &&
                      styles.distanceOptionActive,
                  ]}
                  onPress={() => updateDesign(activeDesign, 'distance', dist)}
                >
                  <Text style={[
                    styles.distanceOptionText,
                    designs[activeDesign].distance === dist &&
                      styles.distanceOptionTextActive,
                  ]}>
                    {dist}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Accelerometer */}
          <View style={styles.accelerometerSection}>
            <Text style={styles.selectorLabel}>📐 Bend Angle Measurement</Text>
            <Text style={styles.accelerometerHint}>
              Place the phone flat against the paper, then fan air at it from {designs[activeDesign].distance} away
            </Text>

            {/* Live Angle Display */}
            <View style={styles.angleDisplay}>
              <Text style={styles.angleValue}>
                {isMeasuring
                  ? liveAngle !== null ? `${liveAngle}°` : '--°'
                  : designs[activeDesign].bendAngle !== null
                  ? `${designs[activeDesign].bendAngle}°`
                  : '--°'}
              </Text>
              <Text style={styles.angleLabel}>Bend Angle</Text>
            </View>

            {/* Measure Buttons */}
            <View style={styles.measureButtons}>
              <TouchableOpacity
                style={[
                  styles.measureBtn,
                  isMeasuring && styles.measureBtnDanger,
                ]}
                onPress={isMeasuring ? stopMeasuring : startMeasuring}
              >
                <Ionicons
                  name={isMeasuring ? 'stop' : 'radio-button-on'}
                  size={20}
                  color={Colors.text}
                />
                <Text style={styles.measureBtnText}>
                  {isMeasuring ? 'Lock Angle' : 'Start Measuring'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.measureBtnOutline}
                onPress={resetMeasurement}
                disabled={isMeasuring}
              >
                <Ionicons name="refresh" size={20} color={Colors.textLight} />
                <Text style={styles.measureBtnOutlineText}>Reset</Text>
              </TouchableOpacity>
            </View>

            {/* Force Result */}
            {designs[activeDesign].bendAngle !== null && (
              <View style={styles.forceResult}>
                <View style={styles.forceRow}>
                  <Text style={styles.forceLabel}>Bend Angle</Text>
                  <Text style={styles.forceValue}>
                    {designs[activeDesign].bendAngle}°
                  </Text>
                </View>
                <View style={styles.forceRow}>
                  <Text style={styles.forceLabel}>Stiffness (k)</Text>
                  <Text style={styles.forceValue}>
                    {designs[activeDesign].material.stiffness} N/rad
                  </Text>
                </View>
                <View style={styles.forceRow}>
                  <Text style={styles.forceLabel}>Estimated Force</Text>
                  <Text style={[styles.forceValue, { color: Colors.primary }]}>
                    {designs[activeDesign].force} N
                  </Text>
                </View>
              </View>
            )}
          </View>

        </View>

        {/* Results Summary */}
      <View style={styles.summarySection}>
        <Text style={styles.sectionTitle}>📋 Results Summary</Text>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Design</Text>
          <Text style={styles.tableHeaderText}>Material</Text>
          <Text style={styles.tableHeaderText}>Angle</Text>
          <Text style={styles.tableHeaderText}>Force (N)</Text>
        </View>

        {/* Table Rows */}
        {designs.map((design, index) => {
          const measured = design.bendAngle !== null;
          const isBest = measured && designs.every((d, i) =>
            i === index || d.bendAngle === null || d.bendAngle <= design.bendAngle!
          );

          return (
            <View
              key={index}
              style={[
                styles.tableRow,
                isBest && measured && styles.tableRowWinner,
              ]}
            >
              <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {isBest && measured && <Text>🏆</Text>}
                <Text style={styles.tableCell}>
                  {`Design ${index + 1}`}
                </Text>
              </View>
              <Text style={styles.tableCell} numberOfLines={1}>
                {design.material.label.split(' ')[0]}
              </Text>
              <Text style={styles.tableCell}>
                {measured ? `${design.bendAngle}°` : '—'}
              </Text>
              <Text style={styles.tableCell}>
                {design.force !== null ? `${design.force}` : '—'}
              </Text>
            </View>
          );
        })}

        {/* Best Design Callout */}
        {designs.some((d) => d.bendAngle !== null) && (
          <View style={styles.bestResultCard}>
            <Text style={styles.bestResultText}>
              🏆 Best fan design is the one with the{' '}
              <Text style={{ color: Colors.primary, fontWeight: 'bold' }}>
                largest bend angle
              </Text>{' '}
              — it moved the paper the most!
            </Text>
          </View>
        )}
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
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
  selectorSection: {
    gap: Spacing.sm,
  },
  selectorLabel: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    fontWeight: '600',
  },
  selectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  selectorOption: {
    flex: 1,
    minWidth: '45%',
    padding: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
  },
  selectorOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  selectorOptionText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    fontWeight: '600',
    textAlign: 'center',
  },
  selectorOptionTextActive: {
    color: Colors.text,
  },
  selectorOptionSub: {
    fontSize: 10,
    color: Colors.textLight,
    marginTop: 2,
  },
  distanceRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  distanceOption: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
  },
  distanceOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  distanceOptionText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    fontWeight: '600',
  },
  distanceOptionTextActive: {
    color: Colors.text,
  },
  accelerometerPlaceholder: {
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    borderRadius: 12,
  },
  accelerometerPlaceholderText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    textAlign: 'center',
  },
  accelerometerSection: {
    gap: Spacing.sm,
  },
  accelerometerHint: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  angleDisplay: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  angleValue: {
    fontSize: 56,
    fontWeight: 'bold',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  angleLabel: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
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
  forceResult: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  forceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forceLabel: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
  },
  forceValue: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
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
    borderColor: Colors.primary,
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
  challengeTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  challengeTimerText: {
    color: Colors.text,
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
});