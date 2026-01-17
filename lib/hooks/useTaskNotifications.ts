/**
 * Hook to manage task notifications
 * Automatically schedules/reschedules notifications when tasks change
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useTaskStore, useSettingsStore } from '../store';
import {
  scheduleTaskNotifications,
  cancelTaskNotifications,
  scheduleRecurringMorningBriefing,
  cleanupDuplicateNotifications,
  listScheduledNotifications,
} from '../services/notificationScheduler';
import { isToday } from 'date-fns';

/**
 * Hook to automatically schedule notifications for tasks
 * Call this once in your app root
 */
export function useTaskNotifications() {
  const tasks = useTaskStore((s) => s.tasks);
  const notificationPreference = useSettingsStore((s) => s.notificationPreference);
  const appState = useRef(AppState.currentState);
  const lastScheduledRef = useRef<string>('');
  const initializedRef = useRef(false);

  // On mount: cleanup duplicates and setup morning briefing
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initialize = async () => {
      // First, clean up any duplicate notifications from previous sessions
      await cleanupDuplicateNotifications();

      // Schedule morning briefing (will skip if already exists)
      if (notificationPreference.enabled) {
        await scheduleRecurringMorningBriefing(7, 0);
      }

      // Debug: list what's scheduled
      await listScheduledNotifications();
    };

    initialize();
  }, []);

  // Schedule notifications when tasks change
  useEffect(() => {
    const todaysTasks = tasks.filter(
      (t) => isToday(new Date(t.scheduledAt)) && t.status === 'pending'
    );

    // Create a signature to detect actual changes
    const signature = todaysTasks.map((t) => `${t.id}:${t.status}:${t.scheduledAt}`).join(',');
    
    // Skip if nothing changed
    if (signature === lastScheduledRef.current) {
      return;
    }

    lastScheduledRef.current = signature;

    const scheduleAll = async () => {
      if (notificationPreference.enabled && todaysTasks.length > 0) {
        console.log(`[useTaskNotifications] Scheduling notifications for ${todaysTasks.length} tasks`);
        await scheduleTaskNotifications(todaysTasks, notificationPreference);
      }
    };

    scheduleAll();
  }, [tasks, notificationPreference]);

  // Cancel notifications when a task is completed or skipped
  useEffect(() => {
    const completedOrSkipped = tasks.filter(
      (t) => t.status === 'completed' || t.status === 'skipped'
    );

    for (const task of completedOrSkipped) {
      cancelTaskNotifications(task.id);
    }
  }, [tasks]);

  // Handle app state changes - just cleanup, don't reschedule
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[useTaskNotifications] App came to foreground');
        // Only cleanup duplicates, don't reschedule (they're already scheduled)
        await cleanupDuplicateNotifications();
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);
}

export default useTaskNotifications;
