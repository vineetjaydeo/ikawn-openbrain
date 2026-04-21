import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chat';
import type { ActiveTask } from '@/stores/chat';

export function useTaskPolling() {
  const activeTasks = useChatStore((s) => s.activeTasks);
  const updateActiveTask = useChatStore((s) => s.updateActiveTask);
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const pending = activeTasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'failed',
    );

    const schedulePoll = (taskId: number, startedAt: number) => {
      const elapsed = Date.now() - startedAt;
      // Safety cap: stop polling after 10 minutes
      if (elapsed > 600000) {
        updateActiveTask(taskId, { status: 'failed', error: 'Polling timeout' });
        timeoutsRef.current.delete(taskId);
        return;
      }
      // 3s for first 30s, then 10s
      const delay = elapsed < 30000 ? 3000 : 10000;
      const timeout = setTimeout(async () => {
        try {
          const res = await fetch(`/api/tasks/${taskId}/status`, {
            credentials: 'include',
          });
          if (!res.ok) {
            schedulePoll(taskId, startedAt);
            return;
          }
          const data = await res.json();

          const updates: Partial<ActiveTask> = { status: data.status };
          if (data.progress) {
            try {
              updates.progress =
                typeof data.progress === 'string'
                  ? JSON.parse(data.progress)
                  : data.progress;
            } catch {
              // Ignore malformed progress
            }
          }
          if (data.status === 'completed' && data.result) {
            updates.result = data.result;
          }
          if (data.status === 'failed') {
            updates.error = data.error_message || 'Task failed';
          }

          updateActiveTask(taskId, updates);

          // Schedule next poll only if not terminal
          if (data.status !== 'completed' && data.status !== 'failed') {
            schedulePoll(taskId, startedAt);
          } else {
            timeoutsRef.current.delete(taskId);
          }
        } catch {
          // Silently retry on network errors
          schedulePoll(taskId, startedAt);
        }
      }, delay);
      timeoutsRef.current.set(taskId, timeout);
    };

    // Start polling for new tasks
    for (const task of pending) {
      if (timeoutsRef.current.has(task.taskId)) continue;
      schedulePoll(task.taskId, task.startedAt);
    }

    // Clean up timeouts for completed/removed tasks
    for (const [taskId, timeout] of timeoutsRef.current) {
      if (!pending.find((t) => t.taskId === taskId)) {
        clearTimeout(timeout);
        timeoutsRef.current.delete(taskId);
      }
    }
  }, [activeTasks, updateActiveTask]);
}
