import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useTeam } from '@/hooks/useTeam';
import { db } from '@/services/firebase';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Phase = 'tap' | 'swap' | 'trace';

type PhaseSpec = {
  key: Phase;
  label: string;
  emoji: string;
  description: string;
  scoreUnit: string;
};

const PHASES: PhaseSpec[] = [
  {
    key: 'tap',
    label: 'Tap Reaction',
    emoji: '⚡',
    description:
      'Wait for the green flash, then tap as fast as you can. Avoid tapping early.',
    scoreUnit: 'ms',
  },
  {
    key: 'swap',
    label: 'Swap Hands',
    emoji: '🔄',
    description:
      'Same test, but use your non-dominant hand to see the difference.',
    scoreUnit: 'ms',
  },
  {
    key: 'trace',
    label: 'Trace Challenge',
    emoji: '🎯',
    description: 'Tap the 5 dots in order, quickly and accurately.',
    scoreUnit: 'pts',
  },
];

type TapTrial = {
  reactionMs: number;
  falseStart: boolean;
};

type TraceTrial = {
  totalMs: number;
  avgDistancePx: number;
  scorePts: number;
};

type PhaseResult = {
  phase: Phase;
  phaseLabel: string;
  player: string;
  prediction: string;
  tapTrials: TapTrial[];
  traceTrials: TraceTrial[];
};

const MAX_TRIALS = 5;
const TRACE_DOT_COUNT = 5;
const PLAY_AREA_HEIGHT = 260;
const DOT_RADIUS = 28;

const defaultResult = (phase: Phase, phaseLabel: string): PhaseResult => ({
  phase,
  phaseLabel,
  player: '',
  prediction: '',
  tapTrials: [],
  traceTrials: [],
});

const computeTapStats = (trials: TapTrial[]) => {
  const valid = trials.filter((t) => !t.falseStart);
  if (valid.length === 0)
    return { average: null, best: null, falseStarts: trials.length - valid.length };
  const ms = valid.map((t) => t.reactionMs);
  const average = ms.reduce((a, b) => a + b, 0) / ms.length;
  const best = Math.min(...ms);
  return {
    average: parseFloat(average.toFixed(1)),
    best,
    falseStarts: trials.length - valid.length,
  };
};

const computeTraceStats = (trials: TraceTrial[]) => {
  if (trials.length === 0) return { averageScore: null, bestScore: null };
  const scores = trials.map((t) => t.scorePts);
  const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const bestScore = Math.max(...scores);
  return {
    averageScore: parseFloat(averageScore.toFixed(1)),
    bestScore: parseFloat(bestScore.toFixed(1)),
  };
};

const getReactionRating = (ms: number) => {
  if (ms < 250) return { label: 'Lightning', color: Colors.success };
  if (ms < 350) return { label: 'Excellent', color: Colors.success };
  if (ms < 450) return { label: 'Average', color: Colors.warning };
  if (ms < 600) return { label: 'Slow', color: '#F97316' };
  return { label: 'Very slow', color: Colors.error };
};

const getTraceRating = (score: number) => {
  if (score >= 80) return { label: 'Excellent', color: Colors.success };
  if (score >= 60) return { label: 'Good', color: Colors.success };
  if (score >= 40) return { label: 'Average', color: Colors.warning };
  if (score >= 20) return { label: 'Below average', color: '#F97316' };
  return { label: 'Needs practice', color: Colors.error };
};

type TapState = 'idle' | 'waiting' | 'go' | 'falseStart' | 'done';

export default function ReactionScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { team } = useTeam();

  const [results, setResults] = useState<PhaseResult[]>(() =>
    PHASES.map((p) => defaultResult(p.key, p.label))
  );
  const [activePhaseIdx, setActivePhaseIdx] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');

  useEffect(() => {
    if (!selectedPlayer && team?.members?.length) {
      setSelectedPlayer(team.members[0]);
    }
  }, [team, selectedPlayer]);

  const updateResult = (phase: Phase, patch: Partial<PhaseResult>) => {
    setResults((prev) =>
      prev.map((r) => (r.phase === phase ? { ...r, ...patch } : r))
    );
  };

  // -------- Tap / Swap phase state --------
  const [tapState, setTapState] = useState<TapState>('idle');
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  const goAtRef = useRef(0);
  const goTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------- Trace phase state --------
  const [tracePositions, setTracePositions] = useState<
    { x: number; y: number }[]
  >([]);
  const [traceIndex, setTraceIndex] = useState(0);
  const [traceStartedAt, setTraceStartedAt] = useState(0);
  const [traceDistances, setTraceDistances] = useState<number[]>([]);
  const [traceActive, setTraceActive] = useState(false);
  const [playAreaSize, setPlayAreaSize] = useState({
    width: 0,
    height: PLAY_AREA_HEIGHT,
  });

  // Cleanup
  useEffect(() => {
    return () => {
      if (goTimeoutRef.current) clearTimeout(goTimeoutRef.current);
    };
  }, []);

  const activePhase = PHASES[activePhaseIdx];
  const activeResult = results[activePhaseIdx];
  const isTouchTapMode = activePhase.key === 'tap' || activePhase.key === 'swap';

  // -------- Tap logic --------
  const startTapTrial = () => {
    if (!selectedPlayer) {
      Alert.alert(
        'Pick a player',
        'Please select which team member is performing.'
      );
      return;
    }
    if (activeResult.tapTrials.length >= MAX_TRIALS) {
      Alert.alert(
        'Trial limit',
        `Maximum ${MAX_TRIALS} trials. Reset to start over.`
      );
      return;
    }
    setLastReactionMs(null);
    setTapState('waiting');
    const delay = 1000 + Math.random() * 4000;
    goTimeoutRef.current = setTimeout(() => {
      goAtRef.current = Date.now();
      setTapState('go');
    }, delay);
  };

  const handleTapPress = () => {
    if (tapState === 'waiting') {
      if (goTimeoutRef.current) clearTimeout(goTimeoutRef.current);
      setTapState('falseStart');
      setLastReactionMs(null);
      const trials: TapTrial[] = [
        ...activeResult.tapTrials,
        { reactionMs: 0, falseStart: true },
      ];
      updateResult(activePhase.key, {
        tapTrials: trials,
        player: selectedPlayer,
      });
    } else if (tapState === 'go') {
      const reactionMs = Date.now() - goAtRef.current;
      setLastReactionMs(reactionMs);
      setTapState('done');
      const trials: TapTrial[] = [
        ...activeResult.tapTrials,
        { reactionMs, falseStart: false },
      ];
      updateResult(activePhase.key, {
        tapTrials: trials,
        player: selectedPlayer,
      });
    }
  };

  const resetTapPhase = () => {
    if (goTimeoutRef.current) clearTimeout(goTimeoutRef.current);
    setTapState('idle');
    setLastReactionMs(null);
    updateResult(activePhase.key, { tapTrials: [] });
  };

  // -------- Trace logic --------
  const onPlayAreaLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setPlayAreaSize({ width, height });
  };

  const generateTracePositions = () => {
    const { width, height } = playAreaSize;
    const positions: { x: number; y: number }[] = [];
    const margin = DOT_RADIUS + 8;
    for (let i = 0; i < TRACE_DOT_COUNT; i += 1) {
      positions.push({
        x: margin + Math.random() * Math.max(1, width - 2 * margin),
        y: margin + Math.random() * Math.max(1, height - 2 * margin),
      });
    }
    return positions;
  };

  const startTraceTrial = () => {
    if (!selectedPlayer) {
      Alert.alert(
        'Pick a player',
        'Please select which team member is performing.'
      );
      return;
    }
    if (activeResult.traceTrials.length >= MAX_TRIALS) {
      Alert.alert(
        'Trial limit',
        `Maximum ${MAX_TRIALS} trials. Reset to start over.`
      );
      return;
    }
    if (playAreaSize.width === 0) return;
    setTracePositions(generateTracePositions());
    setTraceIndex(0);
    setTraceDistances([]);
    setTraceStartedAt(Date.now());
    setTraceActive(true);
  };

  const handleTraceDotPress = (
    dotIndex: number,
    tapX: number,
    tapY: number
  ) => {
    if (!traceActive || dotIndex !== traceIndex) return;
    const dot = tracePositions[dotIndex];
    const dist = Math.sqrt((tapX - dot.x) ** 2 + (tapY - dot.y) ** 2);
    const newDistances = [...traceDistances, dist];
    setTraceDistances(newDistances);

    if (dotIndex === TRACE_DOT_COUNT - 1) {
      // Complete
      const totalMs = Date.now() - traceStartedAt;
      const avgDistancePx =
        newDistances.reduce((a, b) => a + b, 0) / newDistances.length;
      const timeScore = Math.max(0, 100 - (totalMs / 1000) * 8);
      const accuracyScore = Math.max(0, 100 - avgDistancePx * 2);
      const scorePts = parseFloat(
        ((timeScore + accuracyScore) / 2).toFixed(1)
      );
      const trial: TraceTrial = {
        totalMs,
        avgDistancePx: parseFloat(avgDistancePx.toFixed(1)),
        scorePts,
      };
      const trials = [...activeResult.traceTrials, trial];
      updateResult('trace', { traceTrials: trials, player: selectedPlayer });
      setTraceActive(false);
    } else {
      setTraceIndex(dotIndex + 1);
    }
  };

  const resetTracePhase = () => {
    setTraceActive(false);
    setTraceIndex(0);
    setTraceDistances([]);
    setTracePositions([]);
    updateResult('trace', { traceTrials: [] });
  };

  // -------- Save --------
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const hasData = results.some(
      (r) => r.tapTrials.length > 0 || r.traceTrials.length > 0
    );
    if (!hasData) {
      Alert.alert(
        'No Data',
        'Complete at least one trial before saving.'
      );
      return;
    }

    try {
      setIsSaving(true);
      const data = results.map((r) => {
        if (r.phase === 'trace') {
          const stats = computeTraceStats(r.traceTrials);
          return {
            phase: r.phase,
            phaseLabel: r.phaseLabel,
            player: r.player,
            prediction: r.prediction,
            trials: r.traceTrials,
            averageScore: stats.averageScore,
            bestScore: stats.bestScore,
            trialCount: r.traceTrials.length,
          };
        }
        const stats = computeTapStats(r.tapTrials);
        return {
          phase: r.phase,
          phaseLabel: r.phaseLabel,
          player: r.player,
          prediction: r.prediction,
          trials: r.tapTrials,
          averageMs: stats.average,
          bestMs: stats.best,
          falseStarts: stats.falseStarts,
          trialCount: r.tapTrials.length,
          rating:
            stats.average !== null
              ? getReactionRating(stats.average).label
              : null,
        };
      });

      await addDoc(collection(db, 'results'), {
        activityId: 'reaction',
        activityName: 'Reaction Board Challenge',
        teamId: team?.id ?? null,
        teamName: team?.name ?? null,
        userId: user?.uid ?? null,
        phases: data,
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

  // -------- Derived display values --------
  const tapStats = computeTapStats(activeResult.tapTrials);
  const traceStats = computeTraceStats(activeResult.traceTrials);

  const tapBackground = {
    idle: Colors.surfaceAlt,
    waiting: Colors.error,
    go: Colors.success,
    falseStart: Colors.warning,
    done: Colors.surfaceAlt,
  }[tapState];

  const tapMessage = {
    idle: 'Press Start, then wait...',
    waiting: 'Wait for green...',
    go: 'TAP NOW!',
    falseStart: 'Too soon! Try again',
    done:
      lastReactionMs !== null
        ? `${lastReactionMs} ms`
        : 'Done',
  }[tapState];

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
          <Text style={styles.emoji}>⚡</Text>
          <Text style={styles.title}>Reaction Board Challenge</Text>
          <Text style={styles.subtitle}>
            Test reaction time, coordination and accuracy
          </Text>
        </View>

        {/* Instructions */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Instructions</Text>
          <Text style={styles.infoText}>
            1. Pick the team member who is playing
          </Text>
          <Text style={styles.infoText}>
            2. Choose a phase: Tap, Swap Hands, or Trace
          </Text>
          <Text style={styles.infoText}>
            3. Take up to {MAX_TRIALS} trials per phase — average is recorded
          </Text>
          <Text style={styles.infoText}>
            4. Rotate through team members and save your results
          </Text>
          <View style={styles.focusBadge}>
            <Text style={styles.focusText}>
              📌 Lower ms = faster reaction. Higher pts = better tracing.
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

        {/* Phase tabs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Phases</Text>
          <View style={styles.phaseTabs}>
            {PHASES.map((p, index) => (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.phaseTab,
                  activePhaseIdx === index && styles.phaseTabActive,
                ]}
                onPress={() => {
                  if (goTimeoutRef.current) clearTimeout(goTimeoutRef.current);
                  setTapState('idle');
                  setLastReactionMs(null);
                  setTraceActive(false);
                  setActivePhaseIdx(index);
                }}
              >
                <Text style={styles.phaseEmoji}>{p.emoji}</Text>
                <Text
                  style={[
                    styles.phaseTabText,
                    activePhaseIdx === index && styles.phaseTabTextActive,
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
            {activePhase.emoji} {activePhase.label}
          </Text>
          <Text style={styles.phaseHint}>{activePhase.description}</Text>

          {/* Prediction */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Your prediction</Text>
            <TextInput
              style={styles.input}
              placeholder={
                isTouchTapMode
                  ? 'e.g. 300 ms'
                  : 'e.g. 70 pts (fast + accurate)'
              }
              placeholderTextColor={Colors.textLight}
              value={activeResult.prediction}
              onChangeText={(val) =>
                updateResult(activePhase.key, { prediction: val })
              }
            />
          </View>

          {/* Play area */}
          {isTouchTapMode ? (
            <Pressable
              style={[
                styles.playArea,
                { backgroundColor: tapBackground, minHeight: PLAY_AREA_HEIGHT },
              ]}
              onPress={
                tapState === 'idle' || tapState === 'done' || tapState === 'falseStart'
                  ? startTapTrial
                  : handleTapPress
              }
            >
              <Text style={styles.tapMessage}>{tapMessage}</Text>
              <Text style={styles.tapSub}>
                {tapState === 'idle' || tapState === 'done' || tapState === 'falseStart'
                  ? `Tap here to ${
                      activeResult.tapTrials.length === 0 ? 'start' : 'try again'
                    } (${activeResult.tapTrials.length}/${MAX_TRIALS})`
                  : ' '}
              </Text>
            </Pressable>
          ) : (
            <View
              style={[styles.playArea, { padding: 0 }]}
              onLayout={onPlayAreaLayout}
            >
              {!traceActive && tracePositions.length === 0 && (
                <View style={styles.traceIdle}>
                  <Text style={styles.tapMessage}>
                    🎯 Tap Start, then hit the 5 dots in order
                  </Text>
                  <Text style={styles.tapSub}>
                    {`${activeResult.traceTrials.length}/${MAX_TRIALS} trials`}
                  </Text>
                </View>
              )}
              {tracePositions.map((pos, i) => {
                const isCurrent = traceActive && i === traceIndex;
                const isDone = traceActive && i < traceIndex;
                return (
                  <Pressable
                    key={i}
                    onPress={(e) => {
                      const { locationX, locationY } = e.nativeEvent;
                      handleTraceDotPress(
                        i,
                        pos.x + (locationX - DOT_RADIUS),
                        pos.y + (locationY - DOT_RADIUS)
                      );
                    }}
                    style={[
                      styles.traceDot,
                      {
                        left: pos.x - DOT_RADIUS,
                        top: pos.y - DOT_RADIUS,
                        backgroundColor: isDone
                          ? Colors.success
                          : isCurrent
                          ? Colors.primary
                          : Colors.surface,
                        borderColor: isCurrent ? Colors.text : Colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.traceDotNumber}>{i + 1}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={
                isTouchTapMode ? startTapTrial : startTraceTrial
              }
              disabled={
                isTouchTapMode
                  ? tapState === 'waiting' || tapState === 'go'
                  : traceActive
              }
            >
              <Ionicons name="play" size={20} color={Colors.text} />
              <Text style={styles.actionBtnText}>
                {isTouchTapMode ? 'Start Trial' : 'Start Trace'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtnOutline}
              onPress={isTouchTapMode ? resetTapPhase : resetTracePhase}
            >
              <Ionicons name="refresh" size={20} color={Colors.textLight} />
              <Text style={styles.actionBtnOutlineText}>Reset</Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            {isTouchTapMode ? (
              <>
                <View style={styles.statBlock}>
                  <Text style={styles.statValue}>
                    {tapStats.average ?? '—'}
                  </Text>
                  <Text style={styles.statLabel}>avg ms</Text>
                </View>
                <View style={styles.statBlock}>
                  <Text style={styles.statValue}>
                    {tapStats.best ?? '—'}
                  </Text>
                  <Text style={styles.statLabel}>best ms</Text>
                </View>
                <View style={styles.statBlock}>
                  <Text style={styles.statValue}>
                    {activeResult.tapTrials.length}
                  </Text>
                  <Text style={styles.statLabel}>trials</Text>
                </View>
                <View style={styles.statBlock}>
                  <Text style={styles.statValue}>
                    {tapStats.falseStarts}
                  </Text>
                  <Text style={styles.statLabel}>false starts</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.statBlock}>
                  <Text style={styles.statValue}>
                    {traceStats.averageScore ?? '—'}
                  </Text>
                  <Text style={styles.statLabel}>avg pts</Text>
                </View>
                <View style={styles.statBlock}>
                  <Text style={styles.statValue}>
                    {traceStats.bestScore ?? '—'}
                  </Text>
                  <Text style={styles.statLabel}>best pts</Text>
                </View>
                <View style={styles.statBlock}>
                  <Text style={styles.statValue}>
                    {activeResult.traceTrials.length}
                  </Text>
                  <Text style={styles.statLabel}>trials</Text>
                </View>
              </>
            )}
          </View>

          {/* Rating badge */}
          {isTouchTapMode && tapStats.average !== null && (
            <View
              style={[
                styles.ratingBadge,
                {
                  borderColor: getReactionRating(tapStats.average).color,
                },
              ]}
            >
              <Text
                style={[
                  styles.ratingText,
                  { color: getReactionRating(tapStats.average).color },
                ]}
              >
                {getReactionRating(tapStats.average).label}
              </Text>
            </View>
          )}
          {!isTouchTapMode && traceStats.averageScore !== null && (
            <View
              style={[
                styles.ratingBadge,
                {
                  borderColor: getTraceRating(traceStats.averageScore).color,
                },
              ]}
            >
              <Text
                style={[
                  styles.ratingText,
                  { color: getTraceRating(traceStats.averageScore).color },
                ]}
              >
                {getTraceRating(traceStats.averageScore).label}
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
            <Text style={styles.tableHeaderText}>Avg</Text>
            <Text style={styles.tableHeaderText}>Best</Text>
          </View>

          {results.map((r) => {
            if (r.phase === 'trace') {
              const stats = computeTraceStats(r.traceTrials);
              return (
                <View key={r.phase} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 1.4 }]} numberOfLines={1}>
                    {r.phaseLabel}
                  </Text>
                  <Text style={styles.tableCell} numberOfLines={1}>
                    {r.player || '—'}
                  </Text>
                  <Text style={styles.tableCell}>
                    {stats.averageScore !== null
                      ? `${stats.averageScore} pts`
                      : '—'}
                  </Text>
                  <Text style={styles.tableCell}>
                    {stats.bestScore !== null
                      ? `${stats.bestScore} pts`
                      : '—'}
                  </Text>
                </View>
              );
            }
            const stats = computeTapStats(r.tapTrials);
            return (
              <View key={r.phase} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1.4 }]} numberOfLines={1}>
                  {r.phaseLabel}
                </Text>
                <Text style={styles.tableCell} numberOfLines={1}>
                  {r.player || '—'}
                </Text>
                <Text style={styles.tableCell}>
                  {stats.average !== null ? `${stats.average} ms` : '—'}
                </Text>
                <Text style={styles.tableCell}>
                  {stats.best !== null ? `${stats.best} ms` : '—'}
                </Text>
              </View>
            );
          })}

          {results.some(
            (r) => r.tapTrials.length > 0 || r.traceTrials.length > 0
          ) && (
            <View style={styles.bestResultCard}>
              <Text style={styles.bestResultText}>
                💡 Compare dominant vs non-dominant hand — and see how trace
                accuracy improves with practice.
              </Text>
            </View>
          )}
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
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
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl },
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
  header: { alignItems: 'center', marginBottom: Spacing.lg },
  emoji: { fontSize: 56, marginBottom: Spacing.xs },
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
  infoText: { fontSize: FontSizes.small, color: Colors.textLight },
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
  section: { marginBottom: Spacing.md },
  sectionTitle: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  playerScroll: { gap: Spacing.sm, paddingVertical: Spacing.xs },
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
  playerChipTextActive: { color: Colors.text },
  noTeamText: {
    color: Colors.textLight,
    fontSize: FontSizes.small,
    fontStyle: 'italic',
  },
  phaseTabs: { flexDirection: 'row', gap: Spacing.xs },
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
  phaseEmoji: { fontSize: 20 },
  phaseTabText: {
    fontSize: 11,
    color: Colors.textLight,
    fontWeight: '600',
    textAlign: 'center',
  },
  phaseTabTextActive: { color: Colors.text },
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
  fieldGroup: { gap: Spacing.xs },
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
  playArea: {
    minHeight: PLAY_AREA_HEIGHT,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  tapMessage: {
    fontSize: FontSizes.xlarge,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
  },
  tapSub: {
    fontSize: FontSizes.small,
    color: Colors.text,
    opacity: 0.85,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  traceIdle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  traceDot: {
    position: 'absolute',
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  traceDotNumber: {
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
    color: Colors.text,
  },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: Spacing.md,
  },
  statBlock: { alignItems: 'center', minWidth: 60 },
  statValue: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 2,
    textAlign: 'center',
  },
  ratingBadge: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  ratingText: { fontSize: FontSizes.small, fontWeight: 'bold' },
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
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    color: Colors.text,
    fontSize: FontSizes.medium,
    fontWeight: 'bold',
  },
});
