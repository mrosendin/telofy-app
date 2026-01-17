import { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useObjectiveStore, useTaskStore } from '@/lib/store';
import { generateTaskPlan } from '@/lib/api/openai';
import { generateId } from '@/lib/utils/id';
import { CATEGORY_CONFIG, type Metric, type Ritual, type Task } from '@/lib/types';

type ModalType = 'metric' | 'ritual' | null;

export default function ObjectiveDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const objective = useObjectiveStore((s) => s.objectives.find((o) => o.id === id));
  const addMetricDataPoint = useObjectiveStore((s) => s.addMetricDataPoint);
  const completeRitual = useObjectiveStore((s) => s.completeRitual);
  const updateObjective = useObjectiveStore((s) => s.updateObjective);
  const tasks = useTaskStore((s) => s.tasks);
  const addTasks = useTaskStore((s) => s.addTasks);
  
  // Memoize today's tasks to avoid infinite loop
  const todaysTasks = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return tasks.filter(
      (t) =>
        t.objectiveId === id &&
        new Date(t.scheduledAt).toISOString().split('T')[0] === today
    );
  }, [tasks, id]);

  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedMetric, setSelectedMetric] = useState<Metric | null>(null);
  const [selectedRitual, setSelectedRitual] = useState<Ritual | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [note, setNote] = useState('');
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);

  if (!objective) {
    return (
      <SafeAreaView className="flex-1 bg-telofy-bg items-center justify-center">
        <Text className="text-telofy-text">Objective not found</Text>
      </SafeAreaView>
    );
  }

  const categoryConfig = CATEGORY_CONFIG[objective.category];
  const overallProgress = objective.pillars.length > 0
    ? objective.pillars.reduce((sum, p) => sum + p.progress * p.weight, 0)
    : 0;

  const handleLogMetric = (metric: Metric) => {
    setSelectedMetric(metric);
    setInputValue(metric.current?.toString() ?? '');
    setNote('');
    setModalType('metric');
  };

  const handleCompleteRitual = (ritual: Ritual) => {
    setSelectedRitual(ritual);
    setNote('');
    setModalType('ritual');
  };

  const submitMetric = () => {
    if (!selectedMetric || !inputValue) return;
    const value = parseFloat(inputValue);
    if (isNaN(value)) return;
    
    addMetricDataPoint(objective.id, selectedMetric.id, value, note || undefined);
    setModalType(null);
    setSelectedMetric(null);
  };

  const submitRitual = () => {
    if (!selectedRitual) return;
    completeRitual(objective.id, selectedRitual.id, note || undefined);
    setModalType(null);
    setSelectedRitual(null);
  };

  const handleGenerateTasks = async () => {
    setIsGeneratingTasks(true);
    try {
      const plan = await generateTaskPlan(objective, [], todaysTasks);
      const tasks: Task[] = plan.tasks.map((t) => ({
        ...t,
        id: generateId(),
        status: 'pending' as const,
        scheduledAt: new Date(t.scheduledAt),
      }));
      addTasks(tasks);
      router.push('/(tabs)/tasks');
    } catch (error) {
      console.error('Failed to generate tasks:', error);
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  const handlePauseResume = () => {
    updateObjective(objective.id, { isPaused: !objective.isPaused });
  };

  const isRitualCompletedToday = (ritual: Ritual) => {
    if (!ritual.lastCompletedAt) return false;
    return new Date(ritual.lastCompletedAt).toDateString() === new Date().toDateString();
  };

  return (
    <SafeAreaView className="flex-1 bg-telofy-bg">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4 border-b border-telofy-border">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <FontAwesome name="arrow-left" size={20} color="#fafafa" />
        </Pressable>
        <Text className="text-telofy-text text-lg font-semibold flex-1 text-center">
          {objective.name}
        </Text>
        <Pressable onPress={handlePauseResume} className="p-2 -mr-2">
          <FontAwesome
            name={objective.isPaused ? 'play' : 'pause'}
            size={18}
            color={objective.isPaused ? '#22c55e' : '#52525b'}
          />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-5 pt-4">
        {/* Overview Card */}
        <View className="rounded-2xl p-5 bg-telofy-surface border border-telofy-border mb-6">
          <View className="flex-row items-center mb-4">
            <View
              className="w-14 h-14 rounded-full items-center justify-center"
              style={{ backgroundColor: `${categoryConfig.color}20` }}
            >
              <FontAwesome name={categoryConfig.icon as any} size={24} color={categoryConfig.color} />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-telofy-text-secondary text-xs tracking-wide">
                {categoryConfig.label.toUpperCase()}
              </Text>
              <Text className="text-telofy-text text-xl font-bold">{objective.name}</Text>
              {objective.isPaused && (
                <Text className="text-telofy-muted text-sm">Paused</Text>
              )}
            </View>
          </View>
          
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-telofy-text-secondary">Overall Progress</Text>
              <Text className="text-telofy-accent font-bold">{Math.round(overallProgress)}%</Text>
            </View>
            <View className="h-3 bg-telofy-bg rounded-full overflow-hidden">
              <View
                className="h-full bg-telofy-accent rounded-full"
                style={{ width: `${overallProgress}%` }}
              />
            </View>
          </View>

          <Text className="text-telofy-text-secondary text-sm">{objective.targetOutcome}</Text>
        </View>

        {/* Generate Tasks Button */}
        <Pressable
          className={`rounded-2xl p-5 mb-6 flex-row items-center justify-center ${
            isGeneratingTasks ? 'bg-telofy-muted/20' : 'bg-telofy-accent'
          }`}
          onPress={handleGenerateTasks}
          disabled={isGeneratingTasks || objective.isPaused}
        >
          {isGeneratingTasks ? (
            <>
              <ActivityIndicator color="#0a0a0b" size="small" />
              <Text className="text-telofy-bg font-semibold ml-3">Generating Tasks...</Text>
            </>
          ) : (
            <>
              <FontAwesome name="magic" size={18} color="#0a0a0b" />
              <Text className="text-telofy-bg font-semibold ml-3">Generate Today's Tasks</Text>
            </>
          )}
        </Pressable>

        {/* Pillars */}
        <Text className="text-telofy-text-secondary text-sm mb-3 tracking-wide">
          PILLARS ({objective.pillars.length})
        </Text>
        <View className="rounded-2xl bg-telofy-surface border border-telofy-border mb-6 overflow-hidden">
          {objective.pillars.map((pillar, i) => (
            <View
              key={pillar.id}
              className={`p-4 ${i > 0 ? 'border-t border-telofy-border' : ''}`}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-telofy-text font-medium flex-1">{pillar.name}</Text>
                <Text className="text-telofy-accent font-semibold">{Math.round(pillar.progress)}%</Text>
              </View>
              <View className="h-2 bg-telofy-bg rounded-full overflow-hidden">
                <View
                  className="h-full bg-telofy-accent/70 rounded-full"
                  style={{ width: `${pillar.progress}%` }}
                />
              </View>
              <Text className="text-telofy-text-secondary text-xs mt-1">
                {Math.round(pillar.weight * 100)}% weight
              </Text>
            </View>
          ))}
        </View>

        {/* Metrics */}
        <Text className="text-telofy-text-secondary text-sm mb-3 tracking-wide">
          METRICS ({objective.metrics.length})
        </Text>
        <View className="rounded-2xl bg-telofy-surface border border-telofy-border mb-6 overflow-hidden">
          {objective.metrics.map((metric, i) => (
            <Pressable
              key={metric.id}
              className={`p-4 flex-row items-center ${i > 0 ? 'border-t border-telofy-border' : ''} active:opacity-80`}
              onPress={() => handleLogMetric(metric)}
            >
              <View className="flex-1">
                <Text className="text-telofy-text font-medium">{metric.name}</Text>
                <View className="flex-row items-baseline mt-1">
                  <Text className="text-telofy-text text-2xl font-bold">
                    {metric.current ?? '—'}
                  </Text>
                  <Text className="text-telofy-text-secondary ml-1">{metric.unit}</Text>
                  {metric.target && (
                    <Text className="text-telofy-text-secondary ml-2">/ {metric.target}</Text>
                  )}
                </View>
                <Text className="text-telofy-text-secondary text-xs mt-1">
                  {metric.history.length} entries
                </Text>
              </View>
              <FontAwesome name="plus-circle" size={24} color="#22c55e" />
            </Pressable>
          ))}
        </View>

        {/* Rituals */}
        <Text className="text-telofy-text-secondary text-sm mb-3 tracking-wide">
          RITUALS ({objective.rituals.length})
        </Text>
        <View className="rounded-2xl bg-telofy-surface border border-telofy-border mb-6 overflow-hidden">
          {objective.rituals.map((ritual, i) => {
            const completedToday = isRitualCompletedToday(ritual);
            return (
              <Pressable
                key={ritual.id}
                className={`p-4 flex-row items-center ${i > 0 ? 'border-t border-telofy-border' : ''} active:opacity-80`}
                onPress={() => !completedToday && handleCompleteRitual(ritual)}
                disabled={completedToday}
              >
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className={`font-medium ${completedToday ? 'text-telofy-accent' : 'text-telofy-text'}`}>
                      {ritual.name}
                    </Text>
                    {completedToday && (
                      <FontAwesome name="check" size={12} color="#22c55e" style={{ marginLeft: 8 }} />
                    )}
                  </View>
                  <Text className="text-telofy-text-secondary text-sm mt-1">
                    {ritual.timesPerPeriod}x/{ritual.frequency} • ~{ritual.estimatedMinutes} min
                  </Text>
                  <View className="flex-row items-center mt-2">
                    <FontAwesome name="fire" size={12} color="#f59e0b" />
                    <Text className="text-telofy-warning text-xs ml-1">
                      {ritual.currentStreak} day streak
                    </Text>
                    <Text className="text-telofy-text-secondary text-xs ml-2">
                      (best: {ritual.longestStreak})
                    </Text>
                  </View>
                </View>
                {!completedToday && (
                  <View className="w-10 h-10 rounded-full border-2 border-telofy-accent items-center justify-center">
                    <FontAwesome name="check" size={16} color="#22c55e" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Today's Tasks */}
        {todaysTasks.length > 0 && (
          <>
            <Text className="text-telofy-text-secondary text-sm mb-3 tracking-wide">
              TODAY'S TASKS ({todaysTasks.length})
            </Text>
            <View className="rounded-2xl bg-telofy-surface border border-telofy-border mb-6 overflow-hidden">
              {todaysTasks.slice(0, 5).map((task, i) => (
                <View
                  key={task.id}
                  className={`p-4 flex-row items-center ${i > 0 ? 'border-t border-telofy-border' : ''}`}
                >
                  <View
                    className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                      task.status === 'completed'
                        ? 'bg-telofy-accent border-telofy-accent'
                        : task.status === 'skipped'
                        ? 'bg-telofy-muted/20 border-telofy-muted'
                        : 'border-telofy-border'
                    }`}
                  >
                    {task.status === 'completed' && (
                      <FontAwesome name="check" size={12} color="#0a0a0b" />
                    )}
                    {task.status === 'skipped' && (
                      <FontAwesome name="times" size={12} color="#52525b" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text
                      className={`font-medium ${
                        task.status === 'completed' || task.status === 'skipped'
                          ? 'text-telofy-text-secondary line-through'
                          : 'text-telofy-text'
                      }`}
                    >
                      {task.title}
                    </Text>
                    <Text className="text-telofy-text-secondary text-xs">
                      {new Date(task.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {' • '}{task.durationMinutes} min
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <View className="h-8" />
      </ScrollView>

      {/* Metric Input Modal */}
      <Modal visible={modalType === 'metric'} transparent animationType="slide">
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-telofy-surface rounded-t-3xl p-6">
            <Text className="text-telofy-text text-xl font-bold mb-2">
              Log {selectedMetric?.name}
            </Text>
            <Text className="text-telofy-text-secondary mb-6">
              Enter current value in {selectedMetric?.unit}
            </Text>

            <TextInput
              className="text-telofy-text text-3xl font-bold p-4 rounded-xl bg-telofy-bg border border-telofy-border text-center mb-4"
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType="numeric"
              autoFocus
              placeholder="0"
              placeholderTextColor="#52525b"
            />

            <TextInput
              className="text-telofy-text p-4 rounded-xl bg-telofy-bg border border-telofy-border mb-6"
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor="#52525b"
            />

            <View className="flex-row gap-3">
              <Pressable
                className="flex-1 rounded-xl py-4 items-center bg-telofy-bg border border-telofy-border"
                onPress={() => setModalType(null)}
              >
                <Text className="text-telofy-text font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                className="flex-1 rounded-xl py-4 items-center bg-telofy-accent"
                onPress={submitMetric}
              >
                <Text className="text-telofy-bg font-semibold">Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ritual Completion Modal */}
      <Modal visible={modalType === 'ritual'} transparent animationType="slide">
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-telofy-surface rounded-t-3xl p-6">
            <View className="items-center mb-6">
              <View className="w-20 h-20 rounded-full bg-telofy-accent/20 items-center justify-center mb-4">
                <FontAwesome name="check" size={40} color="#22c55e" />
              </View>
              <Text className="text-telofy-text text-xl font-bold">
                Complete {selectedRitual?.name}?
              </Text>
              <Text className="text-telofy-text-secondary mt-1">
                Current streak: {selectedRitual?.currentStreak} days
              </Text>
            </View>

            <TextInput
              className="text-telofy-text p-4 rounded-xl bg-telofy-bg border border-telofy-border mb-6"
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor="#52525b"
            />

            <View className="flex-row gap-3">
              <Pressable
                className="flex-1 rounded-xl py-4 items-center bg-telofy-bg border border-telofy-border"
                onPress={() => setModalType(null)}
              >
                <Text className="text-telofy-text font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                className="flex-1 rounded-xl py-4 items-center bg-telofy-accent"
                onPress={submitRitual}
              >
                <Text className="text-telofy-bg font-semibold">Complete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
