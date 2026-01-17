import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { analyzeObjective } from '@/lib/api/openai';
import { useObjectiveStore } from '@/lib/store';
import { generateId } from '@/lib/utils/id';
import { CATEGORY_CONFIG, type AIObjectiveAnalysis, type Objective } from '@/lib/types';

type Step = 'input' | 'analyzing' | 'review' | 'saving';

export default function CreateObjectiveScreen() {
  const router = useRouter();
  const addObjective = useObjectiveStore((s) => s.addObjective);

  const [step, setStep] = useState<Step>('input');
  const [userInput, setUserInput] = useState('');
  const [analysis, setAnalysis] = useState<AIObjectiveAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (userInput.trim().length < 10) {
      setError('Please describe your objective in more detail.');
      return;
    }

    setError(null);
    setStep('analyzing');

    try {
      const result = await analyzeObjective(userInput);
      setAnalysis(result);
      setStep('review');
    } catch (err: any) {
      console.error('Analysis failed:', err);
      
      // Check for quota/billing issues (also returns 429)
      const isQuotaError = 
        err?.error?.code === 'insufficient_quota' ||
        err?.message?.toLowerCase().includes('quota') ||
        err?.message?.toLowerCase().includes('billing');
      
      // Check for rate limit error
      const isRateLimit = 
        err?.status === 429 || 
        err?.message?.includes('429') ||
        err?.message?.toLowerCase().includes('rate limit');
      
      if (isQuotaError) {
        setError('API quota exceeded. Please check your OpenAI billing settings.');
      } else if (isRateLimit) {
        setError('Service temporarily unavailable. Please wait a moment and try again.');
      } else {
        setError('Failed to analyze objective. Please try again.');
      }
      setStep('input');
    }
  };

  const handleSave = () => {
    if (!analysis) return;

    setStep('saving');

    const now = new Date();
    const objective: Objective = {
      id: generateId(),
      name: analysis.name,
      category: analysis.category,
      description: analysis.description,
      targetOutcome: analysis.targetOutcome,
      pillars: analysis.suggestedPillars.map((p) => ({
        ...p,
        id: generateId(),
        progress: 0,
      })),
      metrics: analysis.suggestedMetrics.map((m) => ({
        ...m,
        id: generateId(),
        history: [],
        current: undefined,
      })),
      rituals: analysis.suggestedRituals.map((r) => ({
        ...r,
        id: generateId(),
        currentStreak: 0,
        longestStreak: 0,
        completionsThisPeriod: 0,
        completionHistory: [],
      })),
      timeframe: {
        startDate: now,
        dailyCommitmentMinutes: analysis.suggestedDailyMinutes,
      },
      status: 'on_track',
      priority: 1,
      isPaused: false,
      createdAt: now,
      updatedAt: now,
    };

    addObjective(objective);
    router.replace('/(tabs)/objective');
  };

  const categoryConfig = analysis ? CATEGORY_CONFIG[analysis.category] : null;

  return (
    <SafeAreaView className="flex-1 bg-telofy-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-telofy-border">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <FontAwesome name="arrow-left" size={20} color="#fafafa" />
          </Pressable>
          <Text className="text-telofy-text text-lg font-semibold">
            {step === 'input' && 'New Objective'}
            {step === 'analyzing' && 'Analyzing...'}
            {step === 'review' && 'Review Plan'}
            {step === 'saving' && 'Creating...'}
          </Text>
          <View className="w-8" />
        </View>

        <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
          {/* Step: Input */}
          {step === 'input' && (
            <View className="py-6">
              <Text className="text-telofy-text text-2xl font-bold mb-2">
                What do you want to achieve?
              </Text>
              <Text className="text-telofy-text-secondary mb-6">
                Describe your goal in your own words. Be specific about outcomes, not just activities.
              </Text>

              <TextInput
                className="text-telofy-text text-base p-4 rounded-xl bg-telofy-surface border border-telofy-border min-h-[140px] mb-4"
                placeholder="e.g., I want to get promoted to senior engineer within the next year. I need to improve my visibility, lead more projects, and develop my technical skills..."
                placeholderTextColor="#52525b"
                multiline
                textAlignVertical="top"
                value={userInput}
                onChangeText={setUserInput}
                autoFocus
              />

              {error && (
                <View className="bg-telofy-error/10 border border-telofy-error rounded-xl p-4 mb-4">
                  <Text className="text-telofy-error">{error}</Text>
                </View>
              )}

              {/* Examples */}
              <Text className="text-telofy-text-secondary text-sm mb-3 mt-4">
                EXAMPLE OBJECTIVES
              </Text>
              {[
                'Get jacked — I want to build muscle and lose fat over the next 6 months',
                'Advance my career — get promoted to senior level within 12 months',
                'Improve my social life — meet more people, host events, be more outgoing',
                'Level up my style — build a wardrobe that projects confidence',
              ].map((example, i) => (
                <Pressable
                  key={i}
                  className="p-4 rounded-xl bg-telofy-surface border border-telofy-border mb-3 active:opacity-80"
                  onPress={() => setUserInput(example)}
                >
                  <Text className="text-telofy-text-secondary">{example}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Step: Analyzing */}
          {step === 'analyzing' && (
            <View className="py-20 items-center">
              <ActivityIndicator size="large" color="#22c55e" />
              <Text className="text-telofy-text text-lg mt-6 mb-2">
                Analyzing your objective...
              </Text>
              <Text className="text-telofy-text-secondary text-center px-8">
                Creating pillars, metrics, and rituals to help you execute.
              </Text>
            </View>
          )}

          {/* Step: Review */}
          {step === 'review' && analysis && (
            <View className="py-6">
              {/* Objective Header */}
              <View className="rounded-2xl p-5 bg-telofy-surface border border-telofy-border mb-6">
                <View className="flex-row items-center mb-3">
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: `${categoryConfig?.color}20` }}
                  >
                    <FontAwesome
                      name={categoryConfig?.icon as any}
                      size={18}
                      color={categoryConfig?.color}
                    />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-telofy-text-secondary text-xs tracking-wide">
                      {categoryConfig?.label.toUpperCase()}
                    </Text>
                    <Text className="text-telofy-text text-xl font-bold">
                      {analysis.name}
                    </Text>
                  </View>
                </View>
                <Text className="text-telofy-text-secondary mb-4">
                  {analysis.description}
                </Text>
                <View className="bg-telofy-bg rounded-xl p-3">
                  <Text className="text-telofy-text-secondary text-xs mb-1">
                    TARGET OUTCOME
                  </Text>
                  <Text className="text-telofy-text">{analysis.targetOutcome}</Text>
                </View>
              </View>

              {/* Pillars */}
              <Text className="text-telofy-text-secondary text-sm mb-3 tracking-wide">
                PILLARS OF FOCUS
              </Text>
              <View className="rounded-2xl bg-telofy-surface border border-telofy-border mb-6 overflow-hidden">
                {analysis.suggestedPillars.map((pillar, i) => (
                  <View
                    key={i}
                    className={`p-4 ${i > 0 ? 'border-t border-telofy-border' : ''}`}
                  >
                    <View className="flex-row items-center justify-between mb-1">
                      <Text className="text-telofy-text font-medium">{pillar.name}</Text>
                      <Text className="text-telofy-accent text-sm">
                        {Math.round(pillar.weight * 100)}%
                      </Text>
                    </View>
                    {pillar.description && (
                      <Text className="text-telofy-text-secondary text-sm">
                        {pillar.description}
                      </Text>
                    )}
                  </View>
                ))}
              </View>

              {/* Metrics */}
              <Text className="text-telofy-text-secondary text-sm mb-3 tracking-wide">
                KEY METRICS
              </Text>
              <View className="rounded-2xl bg-telofy-surface border border-telofy-border mb-6 overflow-hidden">
                {analysis.suggestedMetrics.map((metric, i) => (
                  <View
                    key={i}
                    className={`p-4 flex-row items-center justify-between ${i > 0 ? 'border-t border-telofy-border' : ''}`}
                  >
                    <Text className="text-telofy-text flex-1">{metric.name}</Text>
                    <Text className="text-telofy-text-secondary">
                      {metric.target} {metric.unit}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Rituals */}
              <Text className="text-telofy-text-secondary text-sm mb-3 tracking-wide">
                RECURRING RITUALS
              </Text>
              <View className="rounded-2xl bg-telofy-surface border border-telofy-border mb-6 overflow-hidden">
                {analysis.suggestedRituals.map((ritual, i) => (
                  <View
                    key={i}
                    className={`p-4 ${i > 0 ? 'border-t border-telofy-border' : ''}`}
                  >
                    <View className="flex-row items-center justify-between mb-1">
                      <Text className="text-telofy-text font-medium flex-1">
                        {ritual.name}
                      </Text>
                      <Text className="text-telofy-accent text-sm">
                        {ritual.timesPerPeriod}x/{ritual.frequency}
                      </Text>
                    </View>
                    <Text className="text-telofy-text-secondary text-sm">
                      ~{ritual.estimatedMinutes} min each
                    </Text>
                  </View>
                ))}
              </View>

              {/* Time Commitment */}
              <View className="rounded-2xl p-5 bg-telofy-surface border border-telofy-border mb-6">
                <Text className="text-telofy-text-secondary text-sm mb-2">
                  DAILY TIME COMMITMENT
                </Text>
                <Text className="text-telofy-text text-3xl font-bold">
                  {analysis.suggestedDailyMinutes} min
                </Text>
                <Text className="text-telofy-text-secondary text-sm mt-1">
                  per day on average
                </Text>
              </View>

              {/* Clarifying Questions */}
              {analysis.clarifyingQuestions && analysis.clarifyingQuestions.length > 0 && (
                <View className="rounded-2xl p-5 bg-telofy-warning/10 border border-telofy-warning mb-6">
                  <Text className="text-telofy-warning font-medium mb-2">
                    Some things to consider:
                  </Text>
                  {analysis.clarifyingQuestions.map((q, i) => (
                    <Text key={i} className="text-telofy-text-secondary mb-1">
                      • {q}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Step: Saving */}
          {step === 'saving' && (
            <View className="py-20 items-center">
              <ActivityIndicator size="large" color="#22c55e" />
              <Text className="text-telofy-text text-lg mt-6">
                Creating your objective...
              </Text>
            </View>
          )}

          <View className="h-32" />
        </ScrollView>

        {/* Bottom Actions */}
        {step === 'input' && (
          <View className="px-5 py-4 border-t border-telofy-border">
            <Pressable
              className={`rounded-xl py-4 items-center ${
                userInput.trim().length >= 10 ? 'bg-telofy-accent' : 'bg-telofy-muted'
              }`}
              onPress={handleAnalyze}
              disabled={userInput.trim().length < 10}
            >
              <Text
                className={`font-semibold ${
                  userInput.trim().length >= 10 ? 'text-telofy-bg' : 'text-telofy-text-secondary'
                }`}
              >
                Analyze Objective
              </Text>
            </Pressable>
          </View>
        )}

        {step === 'review' && (
          <View className="px-5 py-4 border-t border-telofy-border">
            <View className="flex-row gap-3">
              <Pressable
                className="flex-1 rounded-xl py-4 items-center bg-telofy-surface border border-telofy-border"
                onPress={() => setStep('input')}
              >
                <Text className="text-telofy-text font-semibold">Edit Input</Text>
              </Pressable>
              <Pressable
                className="flex-1 rounded-xl py-4 items-center bg-telofy-accent"
                onPress={handleSave}
              >
                <Text className="text-telofy-bg font-semibold">Create Objective</Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
