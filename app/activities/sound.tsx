import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useTeam } from '@/hooks/useTeam';
import { db } from '@/services/firebase';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import React, { useRef, useState } from 'react';
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
import MapView, { Circle, Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Action = {
  id: number;
  label: string;
  prediction: string;
  decibels: number | null;
  latitude: number | null;
  longitude: number | null;
};

const defaultAction = (id: number, label: string): Action => ({
  id,
  label,
  prediction: '',
  decibels: null,
  latitude: null,
  longitude: null,
});

const getSoundRisk = (db: number) => {
  if (db <= 30) return { label: 'No risk', color: Colors.success };
  if (db <= 60) return { label: 'Safe', color: Colors.success };
  if (db <= 85) return { label: 'Generally safe', color: Colors.warning };
  if (db <= 90) return { label: 'Damage possible', color: Colors.warning };
  if (db <= 100) return { label: 'Damage likely', color: '#F97316' };
  if (db <= 110) return { label: 'Serious damage', color: Colors.error };
  return { label: 'Immediate damage', color: '#7F1D1D' };
};

export default function SoundScreen() {
  const insets = useSafeAreaInsets();
  const [actions, setActions] = useState<Action[]>([
    defaultAction(1, 'Action 1 (e.g. dropping a book)'),
    defaultAction(2, 'Action 2 (e.g. talking loudly)'),
    defaultAction(3, 'Action 3 (e.g. stamping feet)'),
  ]);
  const [activeAction, setActiveAction] = useState(0);

  const updateAction = (index: number, field: keyof Action, value: any) => {
    setActions((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    );
  };
 
  const [isRecording, setIsRecording] = useState(false);
const [liveDb, setLiveDb] = useState<number | null>(null);
const recordingRef = useRef<Audio.Recording | null>(null);
const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

const startMeasuring = async () => {
  try {
    const { status: audioStatus } = await Audio.requestPermissionsAsync();
    if (audioStatus !== 'granted') {
      Alert.alert('Permission Required', 'Microphone access is needed to measure sound.');
      return;
    }

    await Location.requestForegroundPermissionsAsync();

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      }
    );

    recordingRef.current = recording;
    setIsRecording(true);

    intervalRef.current = setInterval(async () => {
      if (recordingRef.current) {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording && status.metering !== undefined) {
          const db = Math.max(0, status.metering + 160);
          setLiveDb(db);
        }
      }
    }, 200);

  } catch (error) {
    console.error('Error starting measurement:', error);
    Alert.alert('Error', 'Could not start microphone. Please try again.');
  }
};

const stopMeasuring = async () => {
  try {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRecording(false);

    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;
    }

    let latitude = null;
    let longitude = null;
    try {
      const location = await Location.getCurrentPositionAsync({});
      latitude = location.coords.latitude;
      longitude = location.coords.longitude;
    } catch (e) {
      console.log('Location not available');
    }

    if (liveDb !== null) {
      updateAction(activeAction, 'decibels', liveDb);
      updateAction(activeAction, 'latitude', latitude);
      updateAction(activeAction, 'longitude', longitude);
    }

    setLiveDb(null);

  } catch (error) {
    console.error('Error stopping measurement:', error);
  }
};

const getMarkerColor = (db: number) => {
    if (db <= 60) return Colors.success;
    if (db <= 85) return Colors.warning;
    if (db <= 100) return '#F97316';
    return Colors.error;
  };
  
  const getMappedActions = () => {
    return actions.filter(
      (a) => a.decibels !== null && a.latitude !== null && a.longitude !== null
    );
  };
  
  const getMapRegion = () => {
    const mapped = getMappedActions();
    if (mapped.length === 0) return null;
    return {
      latitude: mapped[0].latitude!,
      longitude: mapped[0].longitude!,
      latitudeDelta: 0.001,
      longitudeDelta: 0.001,
    };
  };

  const [isSaving, setIsSaving] = useState(false);
const { user } = useAuth();
const { team } = useTeam();

const handleSave = async () => {
  const hasData = actions.some((a) => a.decibels !== null);
  if (!hasData) {
    Alert.alert('No Data', 'Please complete at least one measurement before saving.');
    return;
  }

  try {
    setIsSaving(true);
    const actionsData = actions.map((action, index) => ({
      actionNumber: index + 1,
      label: action.label,
      prediction: action.prediction,
      decibels: action.decibels,
      risk: action.decibels ? getSoundRisk(action.decibels).label : null,
      location: action.latitude && action.longitude ? {
        latitude: action.latitude,
        longitude: action.longitude,
      } : null,
    }));

    await addDoc(collection(db, 'results'), {
      activityId: 'sound',
      activityName: 'Sound Pollution Hunter',
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
      userId: user?.uid ?? null,
      actions: actionsData,
      createdAt: serverTimestamp(),
    });

    Alert.alert('✅ Saved!', 'Your results have been saved successfully.', [{ text: 'OK' }]);
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
          <Text style={styles.emoji}>🔊</Text>
          <Text style={styles.title}>Sound Pollution Hunter</Text>
          <Text style={styles.subtitle}>
            Measure and compare sound levels in different activities
          </Text>
        </View>

        {/* Instructions */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Instructions</Text>
          <Text style={styles.infoText}>1. Predict which action creates the loudest sound</Text>
          <Text style={styles.infoText}>2. Perform each action and measure the sound level</Text>
          <Text style={styles.infoText}>3. Record results and compare with your prediction</Text>
          <Text style={styles.infoText}>4. Map loud and quiet zones using GPS</Text>
          <View style={styles.focusBadge}>
            <Text style={styles.focusText}>
              📌 Should we wear ear muffs in your classroom?
            </Text>
          </View>
        </View>

        {/* Action Tabs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionTabs}>
            {actions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.actionTab,
                  activeAction === index && styles.actionTabActive,
                ]}
                onPress={() => setActiveAction(index)}
              >
                <Text style={[
                  styles.actionTabText,
                  activeAction === index && styles.actionTabTextActive,
                ]}>
                  {`Action ${index + 1}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Active Action Card */}
        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>
            {actions[activeAction].label}
          </Text>

          {/* Prediction Input */}
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Your Prediction (louder or softer than?)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. louder than talking"
              placeholderTextColor={Colors.textLight}
              value={actions[activeAction].prediction}
              onChangeText={(val) => updateAction(activeAction, 'prediction', val)}
            />
          </View>

          {/* Live dB Meter */}
<View style={styles.meterContainer}>
  {isRecording && (
    <View style={styles.liveContainer}>
      <Text style={styles.liveLabel}>🎙️ Measuring...</Text>
      <Text style={styles.liveDb}>
        {liveDb !== null ? `${liveDb.toFixed(1)} dB` : '-- dB'}
      </Text>
      {liveDb !== null && (() => {
        const risk = getSoundRisk(liveDb);
        return (
          <View style={[styles.riskBadge, { borderColor: risk.color }]}>
            <Text style={[styles.riskText, { color: risk.color }]}>
              {risk.label}
            </Text>
          </View>
        );
      })()}
    </View>
  )}

  <TouchableOpacity
    style={[
      styles.measureButton,
      isRecording && styles.measureButtonActive,
    ]}
    onPress={isRecording ? stopMeasuring : startMeasuring}
  >
    <Ionicons
      name={isRecording ? 'stop-circle' : 'mic'}
      size={28}
      color={Colors.text}
    />
    <Text style={styles.measureButtonText}>
      {isRecording ? 'Stop Measuring' : 'Start Measuring'}
    </Text>
  </TouchableOpacity>
</View>

          {/* Result if measured */}
          {actions[activeAction].decibels !== null && (
            <View style={styles.resultCard}>
              <Text style={styles.resultDb}>
                {actions[activeAction].decibels?.toFixed(1)} dB
              </Text>
              {(() => {
                const risk = getSoundRisk(actions[activeAction].decibels!);
                return (
                  <View style={[styles.riskBadge, { borderColor: risk.color }]}>
                    <Text style={[styles.riskText, { color: risk.color }]}>
                      ⚠️ {risk.label}
                    </Text>
                  </View>
                );
              })()}
            </View>
          )}
        </View>

        {/* Map Section */}
      <View style={styles.mapSection}>
        <Text style={styles.sectionTitle}>📍 Sound Zone Map</Text>

        {getMappedActions().length === 0 ? (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="map-outline" size={40} color={Colors.textLight} />
            <Text style={styles.mapPlaceholderText}>
              Complete at least one measurement to see the map
            </Text>
          </View>
        ) : (
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              region={getMapRegion()!}
              showsUserLocation
            >
              {getMappedActions().map((action, index) => (
                <React.Fragment key={index}>
                  <Marker
                    coordinate={{
                      latitude: action.latitude!,
                      longitude: action.longitude!,
                    }}
                    title={action.label}
                    description={`${action.decibels?.toFixed(1)} dB — ${getSoundRisk(action.decibels!).label}`}
                    pinColor={getMarkerColor(action.decibels!)}
                  />
                  <Circle
                    center={{
                      latitude: action.latitude!,
                      longitude: action.longitude!,
                    }}
                    radius={3}
                    fillColor={`${getMarkerColor(action.decibels!)}44`}
                    strokeColor={getMarkerColor(action.decibels!)}
                    strokeWidth={1}
                  />
                </React.Fragment>
              ))}
            </MapView>

            {/* Map Legend */}
            <View style={styles.mapLegend}>
              <Text style={styles.mapLegendTitle}>Legend</Text>
              <View style={styles.mapLegendRow}>
                <View style={[styles.mapLegendDot, { backgroundColor: Colors.success }]} />
                <Text style={styles.mapLegendText}>Safe (≤60 dB)</Text>
              </View>
              <View style={styles.mapLegendRow}>
                <View style={[styles.mapLegendDot, { backgroundColor: Colors.warning }]} />
                <Text style={styles.mapLegendText}>Caution (60–85 dB)</Text>
              </View>
              <View style={styles.mapLegendRow}>
                <View style={[styles.mapLegendDot, { backgroundColor: '#F97316' }]} />
                <Text style={styles.mapLegendText}>Danger (85–100 dB)</Text>
              </View>
              <View style={styles.mapLegendRow}>
                <View style={[styles.mapLegendDot, { backgroundColor: Colors.error }]} />
                <Text style={styles.mapLegendText}>Severe (100+ dB)</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Results Summary */}
      <View style={styles.summarySection}>
        <Text style={styles.sectionTitle}>📋 Results Summary</Text>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 2 }]}>Action</Text>
          <Text style={styles.tableHeaderText}>dB</Text>
          <Text style={styles.tableHeaderText}>Risk</Text>
          <Text style={styles.tableHeaderText}>Correct?</Text>
        </View>

        {/* Table Rows */}
        {actions.map((action, index) => {
          const measured = action.decibels !== null;
          const risk = measured ? getSoundRisk(action.decibels!) : null;
          const isLoudest = measured && actions.every((a, i) =>
            i === index || a.decibels === null || a.decibels <= action.decibels!
          );

          return (
            <View
              key={index}
              style={[
                styles.tableRow,
                isLoudest && measured && styles.tableRowWinner,
              ]}
            >
              <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {isLoudest && measured && <Text>🏆</Text>}
                <Text style={styles.tableCell} numberOfLines={1}>
                  {`Action ${index + 1}`}
                </Text>
              </View>
              <Text style={styles.tableCell}>
                {measured ? `${action.decibels?.toFixed(1)}` : '—'}
              </Text>
              <Text style={[
                styles.tableCell,
                risk ? { color: risk.color } : {},
              ]}>
                {risk ? risk.label.split(' ')[0] : '—'}
              </Text>
              <Text style={styles.tableCell}>
                {action.prediction && measured ? '✅' : '—'}
              </Text>
            </View>
          );
        })}

        {/* Ear Muff Recommendation */}
        {actions.some((a) => a.decibels !== null) && (() => {
          const maxDb = Math.max(...actions.filter(a => a.decibels !== null).map(a => a.decibels!));
          const needsEarMuffs = maxDb >= 85;
          return (
            <View style={[
              styles.recommendationCard,
              { borderColor: needsEarMuffs ? Colors.error : Colors.success }
            ]}>
              <Text style={[
                styles.recommendationText,
                { color: needsEarMuffs ? Colors.error : Colors.success }
              ]}>
                {needsEarMuffs
                  ? '⚠️ Yes — you should wear ear muffs in this environment!'
                  : '✅ No — sound levels are safe in this environment.'}
              </Text>
            </View>
          );
        })()}
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
  actionTabs: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  actionTab: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  actionTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  actionTabText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    fontWeight: '600',
  },
  actionTabTextActive: {
    color: Colors.text,
  },
  actionCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  actionTitle: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
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
  measurePlaceholder: {
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    borderRadius: 12,
  },
  measurePlaceholderText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    textAlign: 'center',
  },
  resultCard: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  resultDb: {
    fontSize: 48,
    fontWeight: 'bold',
    color: Colors.text,
  },
  riskBadge: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  riskText: {
    fontSize: FontSizes.small,
    fontWeight: 'bold',
  },
  meterContainer: {
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
  },
  liveContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: Spacing.lg,
    width: '100%',
  },
  liveLabel: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    fontWeight: '600',
  },
  liveDb: {
    fontSize: 48,
    fontWeight: 'bold',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  measureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    padding: Spacing.md,
    width: '100%',
  },
  measureButtonActive: {
    backgroundColor: Colors.error,
  },
  measureButtonText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
  },
  mapSection: {
    marginTop: Spacing.lg,
  },
  mapPlaceholder: {
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  mapPlaceholderText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
    textAlign: 'center',
  },
  mapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  map: {
    width: '100%',
    height: 300,
  },
  mapLegend: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  mapLegendTitle: {
    fontSize: FontSizes.small,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  mapLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  mapLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  mapLegendText: {
    fontSize: FontSizes.small,
    color: Colors.textLight,
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
  recommendationCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    alignItems: 'center',
  },
  recommendationText: {
    fontSize: FontSizes.small,
    fontWeight: 'bold',
    textAlign: 'center',
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