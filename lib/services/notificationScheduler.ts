/**
 * Notification Scheduler Service
 * Manages scheduling, rescheduling, and cancellation of task notifications
 */

import * as Notifications from 'expo-notifications';
import { isToday, isTomorrow, addDays, setHours, setMinutes, differenceInMinutes, startOfDay, isPast } from 'date-fns';
import type { Task, Objective, NotificationPreference } from '../types';

// Store notification IDs mapped to task IDs
const scheduledNotifications = new Map<string, string[]>();

/**
 * Schedule all notifications for today's tasks
 */
export async function scheduleTaskNotifications(
  tasks: Task[],
  preference: NotificationPreference
): Promise<void> {
  if (!preference.enabled) {
    console.log('[NotificationScheduler] Notifications disabled, skipping');
    return;
  }

  // Filter to today's pending tasks
  const todaysTasks = tasks.filter(
    (t) => isToday(new Date(t.scheduledAt)) && t.status === 'pending'
  );

  console.log(`[NotificationScheduler] Scheduling notifications for ${todaysTasks.length} tasks`);

  for (const task of todaysTasks) {
    await scheduleTaskReminder(task, preference);
  }
}

/**
 * Schedule reminder notification for a single task
 */
export async function scheduleTaskReminder(
  task: Task,
  preference: NotificationPreference
): Promise<string | null> {
  if (!preference.enabled) return null;

  const taskTime = new Date(task.scheduledAt);
  const reminderTime = new Date(taskTime.getTime() - preference.advanceMinutes * 60 * 1000);

  // Don't schedule if reminder time has passed
  if (isPast(reminderTime)) {
    console.log(`[NotificationScheduler] Skipping past reminder for "${task.title}"`);
    return null;
  }

  // Cancel any existing notifications for this task
  await cancelTaskNotifications(task.id);

  try {
    // Schedule the advance reminder
    const reminderId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ Task in ${preference.advanceMinutes} min`,
        body: task.title,
        subtitle: task.whyItMatters,
        data: { taskId: task.id, type: 'task_reminder' },
        sound: true,
        categoryIdentifier: 'task',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderTime,
      },
    });

    // Schedule the task start notification
    const startId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎯 Time to start',
        body: task.title,
        data: { taskId: task.id, type: 'task_start' },
        sound: true,
        categoryIdentifier: 'task',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: taskTime,
      },
    });

    // Store notification IDs
    scheduledNotifications.set(task.id, [reminderId, startId]);

    console.log(`[NotificationScheduler] Scheduled notifications for "${task.title}" at ${reminderTime.toLocaleTimeString()}`);

    // If escalation is enabled, schedule overdue notification
    if (preference.escalation) {
      const overdueTime = new Date(taskTime.getTime() + 15 * 60 * 1000); // 15 min after task time
      const overdueId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ Deviation Detected',
          body: `"${task.title}" is overdue. Mark as complete or skip to proceed.`,
          data: { taskId: task.id, type: 'deviation' },
          sound: true,
          categoryIdentifier: 'deviation',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: overdueTime,
        },
      });

      const existing = scheduledNotifications.get(task.id) || [];
      scheduledNotifications.set(task.id, [...existing, overdueId]);
    }

    return reminderId;
  } catch (error) {
    console.error(`[NotificationScheduler] Failed to schedule for "${task.title}":`, error);
    return null;
  }
}

/**
 * Cancel all notifications for a specific task
 */
export async function cancelTaskNotifications(taskId: string): Promise<void> {
  const notificationIds = scheduledNotifications.get(taskId);
  if (notificationIds) {
    for (const id of notificationIds) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch (error) {
        // Ignore errors for already-fired notifications
      }
    }
    scheduledNotifications.delete(taskId);
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  scheduledNotifications.clear();
  console.log('[NotificationScheduler] Cancelled all scheduled notifications');
}

/**
 * Schedule morning briefing notification
 */
export async function scheduleMorningBriefing(
  objectives: Objective[],
  tasks: Task[],
  briefingHour: number = 7, // 7 AM default
  preference: NotificationPreference
): Promise<string | null> {
  if (!preference.enabled) return null;

  // Schedule for tomorrow morning
  const tomorrow = addDays(startOfDay(new Date()), 1);
  const briefingTime = setMinutes(setHours(tomorrow, briefingHour), 0);

  // Count tomorrow's tasks
  const tomorrowsTasks = tasks.filter((t) => isTomorrow(new Date(t.scheduledAt)));
  const activeObjectives = objectives.filter((o) => !o.isPaused);

  const taskCount = tomorrowsTasks.length;
  const objectiveCount = activeObjectives.length;

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '☀️ Good morning',
        body: taskCount > 0
          ? `You have ${taskCount} task${taskCount !== 1 ? 's' : ''} scheduled across ${objectiveCount} objective${objectiveCount !== 1 ? 's' : ''}.`
          : 'No tasks scheduled for today. Generate your daily plan?',
        data: { type: 'morning_briefing' },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: briefingTime,
      },
    });

    console.log(`[NotificationScheduler] Scheduled morning briefing for ${briefingTime.toLocaleString()}`);
    return notificationId;
  } catch (error) {
    console.error('[NotificationScheduler] Failed to schedule morning briefing:', error);
    return null;
  }
}

// Track if we've scheduled the morning briefing this session
let morningBriefingScheduled = false;

/**
 * Schedule daily recurring morning briefing (only once)
 */
export async function scheduleRecurringMorningBriefing(
  briefingHour: number = 7,
  briefingMinute: number = 0
): Promise<string | null> {
  // First, check if there's already a morning briefing scheduled
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const existingMorning = existing.filter(
    (n) => n.content.data?.type === 'morning_briefing'
  );

  // If we already have one, don't schedule another
  if (existingMorning.length > 0) {
    console.log(`[NotificationScheduler] Morning briefing already scheduled (${existingMorning.length} found), skipping`);
    return existingMorning[0].identifier;
  }

  // Prevent duplicate scheduling in same session
  if (morningBriefingScheduled) {
    console.log('[NotificationScheduler] Morning briefing already scheduled this session, skipping');
    return null;
  }

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '☀️ Good morning',
        body: 'Review your objectives and generate today\'s tasks.',
        data: { type: 'morning_briefing' },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: briefingHour,
        minute: briefingMinute,
      },
    });

    morningBriefingScheduled = true;
    console.log(`[NotificationScheduler] Scheduled recurring morning briefing at ${briefingHour}:${briefingMinute.toString().padStart(2, '0')}`);
    return notificationId;
  } catch (error) {
    console.error('[NotificationScheduler] Failed to schedule recurring morning briefing:', error);
    return null;
  }
}

/**
 * Get count of scheduled notifications
 */
export async function getScheduledNotificationCount(): Promise<number> {
  const notifications = await Notifications.getAllScheduledNotificationsAsync();
  return notifications.length;
}

/**
 * Clean up duplicate notifications
 * Keeps only one of each type per task
 */
export async function cleanupDuplicateNotifications(): Promise<number> {
  const notifications = await Notifications.getAllScheduledNotificationsAsync();
  
  // Group by task ID and type
  const seen = new Map<string, string>(); // key: "taskId:type" -> first notification ID
  const toCancel: string[] = [];

  for (const n of notifications) {
    const taskId = n.content.data?.taskId as string | undefined;
    const type = n.content.data?.type as string | undefined;
    
    // For morning briefing, only keep one
    if (type === 'morning_briefing') {
      const key = 'morning_briefing';
      if (seen.has(key)) {
        toCancel.push(n.identifier);
      } else {
        seen.set(key, n.identifier);
      }
      continue;
    }

    // For task notifications, only keep one per task+type
    if (taskId && type) {
      const key = `${taskId}:${type}`;
      if (seen.has(key)) {
        toCancel.push(n.identifier);
      } else {
        seen.set(key, n.identifier);
      }
    }
  }

  // Cancel duplicates
  for (const id of toCancel) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }

  if (toCancel.length > 0) {
    console.log(`[NotificationScheduler] Cleaned up ${toCancel.length} duplicate notifications`);
  }

  return toCancel.length;
}

/**
 * Debug: List all scheduled notifications
 */
export async function listScheduledNotifications(): Promise<void> {
  const notifications = await Notifications.getAllScheduledNotificationsAsync();
  console.log(`[NotificationScheduler] ${notifications.length} scheduled notifications:`);
  for (const n of notifications) {
    console.log(`  - ${n.content.title}: ${n.content.body}`);
  }
}
