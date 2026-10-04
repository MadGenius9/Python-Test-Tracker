type ConnectionListener = (isOnline: boolean) => void;
const listeners = new Set<ConnectionListener>();

export function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

function notifyListeners() {
  const online = isOnline();
  listeners.forEach((listener) => {
    try {
      listener(online);
    } catch (e) {
      console.error('Error in connection listener:', e);
    }
  });
}

// Global browser online/offline listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notifyListeners();
  });
  window.addEventListener('offline', () => {
    notifyListeners();
  });
}

export function subscribeOfflineState(listener: ConnectionListener): () => void {
  listeners.add(listener);
  // Emit initial state
  listener(isOnline());
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Safely purges obsolete custom offline mutation queue keys from localStorage on startup.
 * Preserves active pad ID, pad config backups, and all legitimate user preferences.
 */
export function cleanObsoleteQueueStorage() {
  const storage =
    typeof window !== 'undefined' && window.localStorage
      ? window.localStorage
      : typeof globalThis !== 'undefined' && (globalThis as any).localStorage
      ? (globalThis as any).localStorage
      : null;

  if (!storage) return;
  try {
    const keysToRemove = [
      'python_sandtracker_offline_queue_v1',
      'sandtracker_offline_queue',
      'sandtracker_queue',
      'sandtracker_sync_conflicts',
    ];

    keysToRemove.forEach((k) => {
      storage.removeItem(k);
    });

    // Also remove any pad-specific queue keys if created in legacy versions
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && (key.startsWith('sandtracker_offline_queue_') || key.startsWith('sandtracker_queue_'))) {
        storage.removeItem(key);
      }
    }
  } catch (err) {
    console.warn('Failed to clean obsolete queue storage:', err);
  }
}
