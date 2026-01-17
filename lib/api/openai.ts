/**
 * OpenAI API client for Telofy AI features
 */

import OpenAI from 'openai';
import type {
  AIContext,
  AIObjectiveAnalysis,
  AITaskPlan,
  Objective,
  Task
} from '../types';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
});

/**
 * Custom error for rate limiting
 */
export class RateLimitError extends Error {
  retryAfter: number;
  
  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Delay helper
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute an OpenAI API call with retry logic for rate limits
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000 } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check for quota/billing errors - don't retry these
      const isQuotaError = 
        error?.error?.code === 'insufficient_quota' ||
        error?.message?.toLowerCase().includes('quota') ||
        error?.message?.toLowerCase().includes('billing');

      if (isQuotaError) {
        throw error;
      }

      // Check if it's a rate limit error (429)
      const isRateLimit = 
        error?.status === 429 || 
        error?.error?.code === 'rate_limit_exceeded' ||
        error?.message?.includes('429') ||
        error?.message?.toLowerCase().includes('rate limit');

      if (!isRateLimit || attempt === maxRetries) {
        // Not a rate limit error or we've exhausted retries
        throw error;
      }

      // Parse retry-after header if available, otherwise use exponential backoff
      const retryAfter = error?.headers?.['retry-after'];
      const waitTime = retryAfter 
        ? parseInt(retryAfter, 10) * 1000 
        : baseDelay * Math.pow(2, attempt);

      console.log(`Rate limited. Retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
      await delay(waitTime);
    }
  }

  throw lastError;
}

// System prompt for Telofy's AI personality
const SYSTEM_PROMPT = `You are Telofy, an AI execution system focused on turning user intentions into completed outcomes. Your role is to:

1. Understand user objectives deeply and break them into actionable components
2. Create structured plans with pillars (sub-areas), metrics (measurables), and rituals (recurring actions)
3. Generate realistic, time-bound tasks based on available time
4. Detect deviations from the plan and suggest corrections
5. Maintain accountability without being aggressive or condescending

Communication style:
- Be direct and status-oriented
- Use language like "on track", "deviation detected", "recalibrating"
- Avoid cheerleading, motivational clichés, or excessive encouragement
- Be helpful and supportive, but not a "buddy app"
- Sound like a system that ensures execution, not a coach that motivates

You understand various objective domains:
- Career: promotions, skill development, networking, visibility
- Fitness: strength, cardio, flexibility, nutrition, recovery
- Health: sleep, stress, nutrition, medical
- Spiritual: practice, community, service, study
- Social: networking, events, relationships, communication
- Dating: meeting people, presentation, confidence, experiences
- Style: wardrobe, grooming, personal brand
- Learning: skills, certifications, projects, practice
- Financial: saving, investing, debt, income
- Creative: projects, skills, portfolio, practice`;

/**
 * Analyze a user's natural language objective and create structured breakdown
 */
export async function analyzeObjective(userInput: string): Promise<AIObjectiveAnalysis> {
  const prompt = `Analyze this user's objective and create a structured execution plan:

"${userInput}"

Create:
1. A clear, concise name for the objective (max 30 chars)
2. The most appropriate category
3. An expanded description
4. A specific, measurable target outcome
5. 2-4 pillars (sub-areas of focus) with relative weights (must sum to 1.0)
6. 2-5 key metrics to track progress (with units and targets)
7. 3-6 recurring rituals/habits that drive progress (with frequency and time estimates)
8. Suggested daily time commitment in minutes

Categories: career, fitness, health, spiritual, social, dating, style, learning, financial, creative, custom

Respond in JSON:
{
  "name": "Short objective name",
  "category": "category",
  "description": "Expanded description of what user wants to achieve",
  "targetOutcome": "Specific measurable outcome with timeline",
  "suggestedPillars": [
    { "name": "Pillar name", "description": "What this covers", "weight": 0.4 }
  ],
  "suggestedMetrics": [
    { 
      "name": "Metric name", 
      "unit": "lbs/hours/count/etc", 
      "type": "number",
      "target": 100,
      "targetDirection": "increase",
      "source": "manual",
      "pillarId": null
    }
  ],
  "suggestedRituals": [
    {
      "name": "Ritual name",
      "description": "What to do",
      "frequency": "daily|weekly|monthly",
      "timesPerPeriod": 4,
      "estimatedMinutes": 30,
      "pillarId": null
    }
  ],
  "suggestedDailyMinutes": 60,
  "clarifyingQuestions": ["Optional questions if input is vague"]
}`;

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  return JSON.parse(content) as AIObjectiveAnalysis;
}

/**
 * Refine an objective based on follow-up answers
 */
export async function refineObjective(
  originalInput: string,
  previousAnalysis: AIObjectiveAnalysis,
  followUpAnswers: Record<string, string>
): Promise<AIObjectiveAnalysis> {
  const prompt = `The user provided this objective:
"${originalInput}"

You previously analyzed it and had some clarifying questions. Here are their answers:
${Object.entries(followUpAnswers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n')}

Based on this additional context, refine the objective analysis.

Previous analysis for reference:
${JSON.stringify(previousAnalysis, null, 2)}

Provide an updated analysis in the same JSON format, but with no clarifyingQuestions this time.`;

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  return JSON.parse(content) as AIObjectiveAnalysis;
}

/**
 * Generate a task plan for an objective
 */
export async function generateTaskPlan(
  objective: Objective,
  availableTimeBlocks: { start: string; end: string }[],
  existingTasks: Task[] = [],
  focusPillarId?: string
): Promise<AITaskPlan> {
  const prompt = `
Objective: ${objective.name}
Category: ${objective.category}
Description: ${objective.description}
Target Outcome: ${objective.targetOutcome}
Daily Commitment: ${objective.timeframe.dailyCommitmentMinutes} minutes

Pillars:
${objective.pillars.map((p) => `- ${p.name} (${Math.round(p.weight * 100)}% weight, ${p.progress}% progress)`).join('\n')}

Active Rituals:
${objective.rituals.map((r) => `- ${r.name}: ${r.timesPerPeriod}x/${r.frequency}, ~${r.estimatedMinutes}min each`).join('\n')}

Current Metrics:
${objective.metrics.map((m) => `- ${m.name}: ${m.current ?? 'not tracked'} ${m.unit} (target: ${m.target ?? 'none'})`).join('\n')}

Available time blocks today:
${availableTimeBlocks.length > 0 ? availableTimeBlocks.map((b) => `- ${b.start} to ${b.end}`).join('\n') : 'No blocks defined - assume flexible schedule'}

Existing scheduled tasks:
${existingTasks.length > 0 ? existingTasks.map((t) => `- ${t.title} at ${new Date(t.scheduledAt).toLocaleTimeString()}`).join('\n') : 'None'}

${focusPillarId ? `Focus on pillar: ${objective.pillars.find((p) => p.id === focusPillarId)?.name}` : ''}

Generate a practical task plan for today that:
1. Fits within the available time
2. Prioritizes rituals that are due
3. Balances pillars based on their weights and current progress
4. Totals approximately ${objective.timeframe.dailyCommitmentMinutes} minutes
5. Includes specific, actionable tasks with context on why they matter

Respond in JSON:
{
  "tasks": [
    {
      "objectiveId": "${objective.id}",
      "pillarId": "pillar-id or null",
      "ritualId": "ritual-id or null",
      "title": "Task name",
      "description": "Brief description",
      "scheduledAt": "ISO timestamp",
      "durationMinutes": 30,
      "whyItMatters": "Brief context on how this advances the objective"
    }
  ],
  "reasoning": "Brief explanation of the plan",
  "adjustments": "Any notes about adjustments made"
}`;

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  return JSON.parse(content) as AITaskPlan;
}

/**
 * Analyze a deviation and suggest a course correction
 */
export async function analyzeDeviation(
  context: AIContext,
  deviationType: string
): Promise<string> {
  const prompt = `
A deviation has been detected in the user's execution.

Objective: ${context.objective.name}
Category: ${context.objective.category}
Deviation type: ${deviationType}

Recent task history:
${context.recentTasks.map((t) => `- ${t.title}: ${t.status}`).join('\n')}

Recent deviations:
${context.recentDeviations.map((d) => `- ${d.type} at ${new Date(d.detectedAt).toLocaleTimeString()}`).join('\n')}

${context.userFeedback ? `User feedback: ${context.userFeedback}` : ''}

Provide a brief, actionable response (max 100 words):
1. Acknowledge the deviation factually (no judgment)
2. Assess impact on objective progress
3. Suggest a specific adjustment
4. Provide one actionable next step

Sound like a system reporting status, not a coach lecturing.`;

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    })
  );

  return response.choices[0]?.message?.content ?? 'Unable to analyze deviation.';
}

/**
 * Generate a daily status summary
 */
export async function generateDailySummary(
  objective: Objective,
  completedTasks: Task[],
  skippedTasks: Task[],
  ritualsCompleted: number,
  ritualsTotal: number
): Promise<string> {
  const totalTasks = completedTasks.length + skippedTasks.length;
  const completionRate = totalTasks > 0 ? completedTasks.length / totalTasks : 0;
  const ritualRate = ritualsTotal > 0 ? ritualsCompleted / ritualsTotal : 0;

  const prompt = `
Generate a brief end-of-day status report (max 50 words).

Objective: ${objective.name}
Tasks: ${completedTasks.length}/${totalTasks} completed (${Math.round(completionRate * 100)}%)
Rituals: ${ritualsCompleted}/${ritualsTotal} completed (${Math.round(ritualRate * 100)}%)

Completed tasks:
${completedTasks.map((t) => `- ${t.title}`).join('\n') || 'None'}

Skipped tasks:
${skippedTasks.map((t) => `- ${t.title}${t.skippedReason ? ` (${t.skippedReason})` : ''}`).join('\n') || 'None'}

Be factual. Note progress. If there are concerns, mention them briefly. Sound like a system status report.`;

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 100,
    })
  );

  return response.choices[0]?.message?.content ?? 'Daily summary unavailable.';
}

/**
 * Get a motivational nudge when user is considering skipping
 */
export async function getSkipIntervention(
  task: Task,
  objective: Objective
): Promise<string> {
  const prompt = `
The user is about to skip this task:
"${task.title}"

Objective: ${objective.name}
Context: ${task.whyItMatters || 'Part of their daily execution'}

Write a brief (max 30 words) intervention. Not motivational fluff - remind them factually why this matters and what's at stake. Be direct but not harsh.`;

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 60,
    })
  );

  return response.choices[0]?.message?.content ?? 'This task supports your objective.';
}
