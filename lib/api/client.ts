/**
 * Telofy API Client
 * 
 * Handles communication with the Telofy backend API.
 * Configure API_URL in your environment.
 */

// TODO: Update this to your production URL when deployed
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

interface ApiError {
  error: string;
}

class TelofyApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let response: Response;
    try {
      response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });
    } catch (error) {
      // Network error - server might be down or unreachable
      throw new Error('Unable to connect to server. Please check your internet connection.');
    }

    // Try to parse JSON response
    let data: any;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } catch (parseError) {
        throw new Error('Server returned an invalid response. Please try again.');
      }
    } else {
      // Non-JSON response (might be HTML error page)
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `Server error: ${response.status}`);
      }
      data = { message: text };
    }

    if (!response.ok) {
      // Extract error message from various response formats
      const errorMessage = 
        data?.error || 
        data?.message || 
        data?.errors?.[0]?.message ||
        `Request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    return data as T;
  }

  // ============================================
  // AUTH
  // ============================================

  async signUp(email: string, password: string, name: string) {
    return this.request<{ token: string; user: User }>('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  }

  async signIn(email: string, password: string) {
    return this.request<{ token: string; user: User }>('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async signOut() {
    return this.request<{ success: boolean }>('/api/auth/sign-out', {
      method: 'POST',
    });
  }

  // ============================================
  // OBJECTIVES
  // ============================================

  async getObjectives() {
    return this.request<{ objectives: Objective[] }>('/api/objectives');
  }

  async getObjective(id: string) {
    return this.request<{ objective: ObjectiveDetail }>(`/api/objectives/${id}`);
  }

  async createObjective(data: CreateObjectiveData) {
    return this.request<{ objective: Objective }>('/api/objectives', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateObjective(id: string, data: Partial<Objective>) {
    return this.request<{ objective: Objective }>(`/api/objectives/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteObjective(id: string) {
    return this.request<{ success: boolean }>(`/api/objectives/${id}`, {
      method: 'DELETE',
    });
  }

  // ============================================
  // TASKS
  // ============================================

  async getTasks(date?: string, objectiveId?: string) {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (objectiveId) params.set('objectiveId', objectiveId);
    
    const query = params.toString();
    return this.request<{ tasks: Task[] }>(`/api/tasks${query ? `?${query}` : ''}`);
  }

  async createTask(data: CreateTaskData) {
    return this.request<{ task: Task }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTask(id: string, data: Partial<Task>) {
    return this.request<{ task: Task }>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async completeTask(id: string) {
    return this.updateTask(id, { status: 'completed' });
  }

  async skipTask(id: string, reason?: string) {
    return this.updateTask(id, { status: 'skipped', skippedReason: reason });
  }

  async deleteTask(id: string) {
    return this.request<{ success: boolean }>(`/api/tasks/${id}`, {
      method: 'DELETE',
    });
  }

  // ============================================
  // METRICS
  // ============================================

  async getMetricEntries(metricId: string) {
    return this.request<{ entries: MetricEntry[] }>(`/api/metrics/${metricId}/entries`);
  }

  async addMetricEntry(metricId: string, value: number, note?: string) {
    return this.request<{ entry: MetricEntry }>(`/api/metrics/${metricId}/entries`, {
      method: 'POST',
      body: JSON.stringify({ value, note }),
    });
  }

  // ============================================
  // RITUALS
  // ============================================

  async completeRitual(ritualId: string, note?: string) {
    return this.request<{ completion: RitualCompletion; streak: number }>(
      `/api/rituals/${ritualId}/completions`,
      {
        method: 'POST',
        body: JSON.stringify({ note }),
      }
    );
  }
}

// Export singleton instance
export const api = new TelofyApiClient();

// ============================================
// TYPES
// ============================================

export interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
  timezone?: string;
  onboardingCompleted?: boolean;
}

export interface Objective {
  id: string;
  userId: string;
  name: string;
  category: string;
  description?: string;
  targetOutcome?: string;
  startDate: string;
  endDate?: string;
  dailyCommitmentMinutes?: number;
  status: 'on_track' | 'deviation_detected' | 'paused' | 'completed';
  priority?: number;
  isPaused?: boolean;
  createdAt: string;
  updatedAt: string;
  pillars?: Pillar[];
  metrics?: Metric[];
  rituals?: Ritual[];
}

export interface ObjectiveDetail extends Objective {
  tasks?: Task[];
}

export interface Pillar {
  id: string;
  objectiveId: string;
  name: string;
  description?: string;
  weight: number;
  progress: number;
}

export interface Metric {
  id: string;
  objectiveId: string;
  pillarId?: string;
  name: string;
  unit: string;
  type: 'number' | 'boolean' | 'duration' | 'rating';
  target?: number;
  targetDirection?: 'increase' | 'decrease' | 'maintain';
  current?: number;
  source: string;
  entries?: MetricEntry[];
}

export interface MetricEntry {
  id: string;
  metricId: string;
  value: number;
  note?: string;
  recordedAt: string;
}

export interface Ritual {
  id: string;
  objectiveId: string;
  pillarId?: string;
  name: string;
  description?: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  daysOfWeek?: number[];
  timesPerPeriod: number;
  estimatedMinutes?: number;
  currentStreak: number;
  longestStreak: number;
  completions?: RitualCompletion[];
}

export interface RitualCompletion {
  id: string;
  ritualId: string;
  completedAt: string;
  note?: string;
}

export interface Task {
  id: string;
  userId: string;
  objectiveId: string;
  pillarId?: string;
  ritualId?: string;
  title: string;
  description?: string;
  whyItMatters?: string;
  scheduledAt: string;
  durationMinutes: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completedAt?: string;
  skippedReason?: string;
}

export interface CreateObjectiveData {
  name: string;
  category: string;
  description?: string;
  targetOutcome?: string;
  endDate?: string;
  dailyCommitmentMinutes?: number;
  pillars?: Omit<Pillar, 'id' | 'objectiveId'>[];
  metrics?: Omit<Metric, 'id' | 'objectiveId' | 'entries'>[];
  rituals?: Omit<Ritual, 'id' | 'objectiveId' | 'currentStreak' | 'longestStreak' | 'completions'>[];
}

export interface CreateTaskData {
  objectiveId: string;
  pillarId?: string;
  ritualId?: string;
  title: string;
  description?: string;
  whyItMatters?: string;
  scheduledAt: string;
  durationMinutes?: number;
}
