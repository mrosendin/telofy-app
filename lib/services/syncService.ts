/**
 * Sync Service
 * Handles syncing local data with the backend API
 */

import { api } from '../api/client';
import { useObjectiveStore, useTaskStore } from '../store';
import { useAuthStore } from '../hooks/useAuth';
import { generateId } from '../utils/id';
import type { Objective, Task } from '../types';

// Helper to check if a string is a valid UUID
const isValidUUID = (id: string) => 
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// Store mapping of local IDs to server IDs (declared at module level)
const idMapping = new Map<string, string>();

/**
 * Map pillars and rituals between local and remote objectives by name
 */
function mapPillarsAndRituals(local: Objective, remote: any) {
  // Map pillars by name
  for (const localPillar of local.pillars) {
    const remotePillar = remote.pillars?.find(
      (rp: any) => rp.name.toLowerCase() === localPillar.name.toLowerCase()
    );
    if (remotePillar) {
      idMapping.set(localPillar.id, remotePillar.id);
    }
  }
  
  // Map metrics by name
  for (const localMetric of local.metrics) {
    const remoteMetric = remote.metrics?.find(
      (rm: any) => rm.name.toLowerCase() === localMetric.name.toLowerCase()
    );
    if (remoteMetric) {
      idMapping.set(localMetric.id, remoteMetric.id);
    }
  }
  
  // Map rituals by name
  for (const localRitual of local.rituals) {
    const remoteRitual = remote.rituals?.find(
      (rr: any) => rr.name.toLowerCase() === localRitual.name.toLowerCase()
    );
    if (remoteRitual) {
      idMapping.set(localRitual.id, remoteRitual.id);
    }
  }
}

// ============================================
// SYNC STATUS
// ============================================

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSyncAt: Date | null;
  error: string | null;
}

let syncState: SyncState = {
  status: 'idle',
  lastSyncAt: null,
  error: null,
};

const listeners: Set<(state: SyncState) => void> = new Set();

function notifyListeners() {
  listeners.forEach((listener) => listener(syncState));
}

export function subscribeSyncState(listener: (state: SyncState) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSyncState() {
  return syncState;
}

// ============================================
// SYNC OPERATIONS
// ============================================

/**
 * Sync all data with the backend
 */
export async function syncAll(): Promise<{ success: boolean; error?: string }> {
  const { isAuthenticated } = useAuthStore.getState();
  
  if (!isAuthenticated) {
    return { success: false, error: 'Not authenticated' };
  }

  syncState = { ...syncState, status: 'syncing', error: null };
  notifyListeners();

  let errors: string[] = [];

  try {
    // Sync objectives first - this builds the ID mapping
    const objResult = await syncObjectives();
    if (objResult.errors.length > 0) {
      errors = errors.concat(objResult.errors);
    }
    
    // Then sync tasks using the ID mapping
    const taskResult = await syncTasks();
    if (taskResult.errors.length > 0) {
      errors = errors.concat(taskResult.errors);
    }

    syncState = {
      status: errors.length > 0 ? 'error' : 'success',
      lastSyncAt: new Date(),
      error: errors.length > 0 ? `${errors.length} item(s) failed to sync` : null,
    };
    notifyListeners();

    if (errors.length > 0) {
      console.warn('[SyncService] Sync completed with errors:', errors);
      return { 
        success: false, 
        error: `${errors.length} item(s) failed to sync. Check console for details.` 
      };
    } else {
      console.log('[SyncService] Sync completed successfully');
      return { success: true };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    syncState = {
      ...syncState,
      status: 'error',
      error: message,
    };
    notifyListeners();

    console.error('[SyncService] Sync failed:', error);
    return { success: false, error: message };
  }
}

/**
 * Sync objectives with the backend
 */
async function syncObjectives(): Promise<{ errors: string[] }> {
  const localObjectives = useObjectiveStore.getState().objectives;
  const { addObjective } = useObjectiveStore.getState();
  const errors: string[] = [];

  // Get remote objectives
  const { objectives: remoteObjectives } = await api.getObjectives();

  // Build mapping from name to remote ID (for matching)
  // Also check if any remote objectives match local ones by name
  const remoteByName = new Map(remoteObjectives.map((o) => [o.name.toLowerCase(), o]));
  const remoteMap = new Map(remoteObjectives.map((o) => [o.id, o]));
  const localMap = new Map(localObjectives.map((o) => [o.id, o]));

  // Upload new local objectives (those not in remote)
  for (const local of localObjectives) {
    // Check if already synced by ID
    if (remoteMap.has(local.id)) {
      const remote = remoteMap.get(local.id)!;
      idMapping.set(local.id, local.id);
      // Also map pillars and rituals by matching names
      mapPillarsAndRituals(local, remote);
      continue;
    }
    
    // Check if exists by name (previously synced but with different ID)
    const existingByName = remoteByName.get(local.name.toLowerCase());
    if (existingByName) {
      console.log(`[SyncService] Found matching objective by name: ${local.name} -> ${existingByName.id}`);
      idMapping.set(local.id, existingByName.id);
      // Also map pillars and rituals by matching names
      mapPillarsAndRituals(local, existingByName);
      continue;
    }

    // Generate new UUID if objective ID isn't already a valid UUID
    const objectiveId = isValidUUID(local.id) ? local.id : generateId();
    
    // Pre-generate UUID mappings for pillars, metrics, and rituals
    const pillarMappings = local.pillars.map((p) => ({
      localId: p.id,
      serverId: isValidUUID(p.id) ? p.id : generateId(),
    }));
    const metricMappings = local.metrics.map((m) => ({
      localId: m.id,
      serverId: isValidUUID(m.id) ? m.id : generateId(),
    }));
    const ritualMappings = local.rituals.map((r) => ({
      localId: r.id,
      serverId: isValidUUID(r.id) ? r.id : generateId(),
    }));
    
    console.log(`[SyncService] Uploading new objective: ${local.name} (id: ${objectiveId})`);
    
    try {
      const result = await api.createObjective({
        id: objectiveId, // Use valid UUID
        name: local.name,
        category: local.category,
        description: local.description,
        targetOutcome: local.targetOutcome,
        endDate: local.timeframe.endDate?.toISOString(),
        dailyCommitmentMinutes: local.timeframe.dailyCommitmentMinutes,
        pillars: local.pillars.map((p, i) => ({
          id: pillarMappings[i].serverId,
          name: p.name,
          description: p.description,
          weight: p.weight,
          progress: p.progress,
        })),
        metrics: local.metrics.map((m, i) => ({
          id: metricMappings[i].serverId,
          name: m.name,
          unit: m.unit,
          type: m.type,
          target: m.target,
          targetDirection: m.targetDirection,
          current: m.current,
          source: m.source,
          pillarId: m.pillarId ? pillarMappings.find(pm => pm.localId === m.pillarId)?.serverId : undefined,
        })),
        rituals: local.rituals.map((r, i) => ({
          id: ritualMappings[i].serverId,
          name: r.name,
          description: r.description,
          frequency: r.frequency,
          daysOfWeek: r.daysOfWeek,
          timesPerPeriod: r.timesPerPeriod,
          estimatedMinutes: r.estimatedMinutes,
          pillarId: r.pillarId ? pillarMappings.find(pm => pm.localId === r.pillarId)?.serverId : undefined,
        })),
      });
      // Store all the ID mappings
      if (result.objective) {
        idMapping.set(local.id, objectiveId);
        pillarMappings.forEach(pm => idMapping.set(pm.localId, pm.serverId));
        metricMappings.forEach(mm => idMapping.set(mm.localId, mm.serverId));
        ritualMappings.forEach(rm => idMapping.set(rm.localId, rm.serverId));
        console.log(`[SyncService] Synced objective: ${local.id} -> ${objectiveId} (${pillarMappings.length} pillars, ${ritualMappings.length} rituals)`);
      }
    } catch (error) {
      const msg = `Failed to upload objective "${local.name}"`;
      console.error(`[SyncService] ${msg}:`, error);
      errors.push(msg);
    }
  }

  // Download remote objectives not in local
  for (const remote of remoteObjectives) {
    if (!localMap.has(remote.id)) {
      console.log(`[SyncService] Downloading objective: ${remote.name}`);
      
      // Get full objective with pillars, metrics, rituals
      const { objective: fullObjective } = await api.getObjective(remote.id);
      
      const localObjective: Objective = {
        id: fullObjective.id,
        name: fullObjective.name,
        category: fullObjective.category as Objective['category'],
        description: fullObjective.description || '',
        targetOutcome: fullObjective.targetOutcome || '',
        pillars: (fullObjective.pillars || []).map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          weight: p.weight,
          progress: p.progress,
        })),
        metrics: (fullObjective.metrics || []).map((m) => ({
          id: m.id,
          name: m.name,
          unit: m.unit,
          type: m.type as any,
          target: m.target,
          targetDirection: m.targetDirection as any,
          current: m.current,
          history: [],
          source: m.source as any,
          pillarId: m.pillarId,
        })),
        rituals: (fullObjective.rituals || []).map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          frequency: r.frequency,
          daysOfWeek: r.daysOfWeek,
          timesPerPeriod: r.timesPerPeriod,
          currentStreak: r.currentStreak,
          longestStreak: r.longestStreak,
          completionsThisPeriod: 0,
          completionHistory: [],
          pillarId: r.pillarId,
          estimatedMinutes: r.estimatedMinutes,
        })),
        timeframe: {
          startDate: new Date(fullObjective.startDate),
          endDate: fullObjective.endDate ? new Date(fullObjective.endDate) : undefined,
          dailyCommitmentMinutes: fullObjective.dailyCommitmentMinutes || 60,
        },
        status: fullObjective.status as any,
        priority: fullObjective.priority || 1,
        isPaused: fullObjective.isPaused || false,
        createdAt: new Date(fullObjective.createdAt),
        updatedAt: new Date(fullObjective.updatedAt),
      };
      
      addObjective(localObjective);
      // Map the ID to itself since it came from server
      idMapping.set(localObjective.id, localObjective.id);
    }
  }

  return { errors };
}

/**
 * Sync tasks with the backend
 */
async function syncTasks(): Promise<{ errors: string[] }> {
  const localTasks = useTaskStore.getState().tasks;
  const { addTasks } = useTaskStore.getState();
  const errors: string[] = [];

  // Get today's tasks from remote
  const today = new Date().toISOString().split('T')[0];
  const { tasks: remoteTasks } = await api.getTasks(today);

  // Create maps
  const remoteMap = new Map(remoteTasks.map((t) => [t.id, t]));
  const localMap = new Map(localTasks.map((t) => [t.id, t]));

  // Upload new local tasks
  for (const local of localTasks) {
    if (!remoteMap.has(local.id)) {
      // Get the mapped server objective ID
      const serverObjectiveId = idMapping.get(local.objectiveId);
      
      if (!serverObjectiveId) {
        console.log(`[SyncService] Skipping task "${local.title}" - objective not synced yet`);
        continue;
      }

      // Generate new UUID if task ID isn't already a valid UUID
      const taskId = isValidUUID(local.id) ? local.id : generateId();
      
      // Map pillarId and ritualId to their server UUIDs
      let pillarId: string | undefined;
      if (local.pillarId) {
        pillarId = idMapping.get(local.pillarId) || (isValidUUID(local.pillarId) ? local.pillarId : undefined);
      }
      
      let ritualId: string | undefined;
      if (local.ritualId) {
        ritualId = idMapping.get(local.ritualId) || (isValidUUID(local.ritualId) ? local.ritualId : undefined);
      }
      
      console.log(`[SyncService] Uploading task: ${local.title} (id: ${taskId}, pillar: ${pillarId || 'none'}, ritual: ${ritualId || 'none'})`);
      
      try {
        await api.createTask({
          id: taskId, // Use valid UUID
          objectiveId: serverObjectiveId, // Use the mapped server objective ID
          pillarId,
          ritualId,
          title: local.title,
          description: local.description,
          whyItMatters: local.whyItMatters,
          scheduledAt: new Date(local.scheduledAt).toISOString(),
          durationMinutes: local.durationMinutes,
        });
      } catch (error) {
        const msg = `Failed to upload task "${local.title}"`;
        console.error(`[SyncService] ${msg}:`, error);
        errors.push(msg);
      }
    }
  }

  // Sync task status changes
  for (const local of localTasks) {
    const remote = remoteMap.get(local.id);
    // Map local status to API-compatible status (handle 'overdue' which doesn't exist on server)
    const apiStatus = local.status === 'overdue' ? 'pending' : local.status;
    
    if (remote && apiStatus !== remote.status) {
      console.log(`[SyncService] Syncing task status: ${local.title} -> ${apiStatus}`);
      
      try {
        await api.updateTask(local.id, {
          status: apiStatus as 'pending' | 'in_progress' | 'completed' | 'skipped',
          completedAt: local.completedAt?.toISOString(),
          skippedReason: local.skippedReason,
        });
      } catch (error) {
        console.error(`[SyncService] Failed to sync task status ${local.title}:`, error);
        // Don't add to errors - status sync failures are less critical
      }
    }
  }

  // Download remote tasks not in local
  for (const remote of remoteTasks) {
    if (!localMap.has(remote.id)) {
      console.log(`[SyncService] Downloading task: ${remote.title}`);
      
      const localTask: Task = {
        id: remote.id,
        objectiveId: remote.objectiveId,
        pillarId: remote.pillarId,
        ritualId: remote.ritualId,
        title: remote.title,
        description: remote.description,
        whyItMatters: remote.whyItMatters,
        scheduledAt: new Date(remote.scheduledAt),
        durationMinutes: remote.durationMinutes,
        status: remote.status,
        completedAt: remote.completedAt ? new Date(remote.completedAt) : undefined,
        skippedReason: remote.skippedReason,
      };
      
      addTasks([localTask]);
    }
  }

  return { errors };
}

/**
 * Upload a single objective to the backend
 */
export async function uploadObjective(objective: Objective): Promise<void> {
  const { isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return;

  try {
    await api.createObjective({
      name: objective.name,
      category: objective.category,
      description: objective.description,
      targetOutcome: objective.targetOutcome,
      endDate: objective.timeframe.endDate?.toISOString(),
      dailyCommitmentMinutes: objective.timeframe.dailyCommitmentMinutes,
      pillars: objective.pillars.map((p) => ({
        name: p.name,
        description: p.description,
        weight: p.weight,
        progress: p.progress,
      })),
      metrics: objective.metrics.map((m) => ({
        name: m.name,
        unit: m.unit,
        type: m.type,
        target: m.target,
        targetDirection: m.targetDirection,
        current: m.current,
        source: m.source,
        pillarId: m.pillarId,
      })),
      rituals: objective.rituals.map((r) => ({
        name: r.name,
        description: r.description,
        frequency: r.frequency,
        daysOfWeek: r.daysOfWeek,
        timesPerPeriod: r.timesPerPeriod,
        estimatedMinutes: r.estimatedMinutes,
        pillarId: r.pillarId,
      })),
    });
    console.log(`[SyncService] Uploaded objective: ${objective.name}`);
  } catch (error) {
    console.error(`[SyncService] Failed to upload objective:`, error);
    throw error;
  }
}

/**
 * Upload tasks to the backend
 */
export async function uploadTasks(tasks: Task[]): Promise<void> {
  const { isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return;

  for (const task of tasks) {
    try {
      await api.createTask({
        objectiveId: task.objectiveId,
        pillarId: task.pillarId,
        ritualId: task.ritualId,
        title: task.title,
        description: task.description,
        whyItMatters: task.whyItMatters,
        scheduledAt: new Date(task.scheduledAt).toISOString(),
        durationMinutes: task.durationMinutes,
      });
    } catch (error) {
      console.error(`[SyncService] Failed to upload task ${task.title}:`, error);
    }
  }
}
