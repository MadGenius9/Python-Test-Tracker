import { describe, it, expect, beforeEach } from 'vitest';
import { SyncError, isPermanentConflictCode, classifySyncErrorCode } from './syncErrors';
import { isOnline, cleanObsoleteQueueStorage, subscribeOfflineState } from './offlineQueue';

describe('Error & Conflict Classification', () => {
  beforeEach(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      const store = new Map<string, string>();
      (globalThis as any).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
        key: (idx: number) => Array.from(store.keys())[idx] ?? null,
        get length() {
          return store.size;
        },
      };
    }
  });
  it('identifies permanent validation errors strictly via typed error codes', () => {
    expect(isPermanentConflictCode('DUPLICATE_TICKET')).toBe(true);
    expect(isPermanentConflictCode('STAGE_ALREADY_COMPLETE')).toBe(true);
    expect(isPermanentConflictCode('PAD_NOT_FOUND')).toBe(true);
    expect(isPermanentConflictCode('MALFORMED_QUEUE_ITEM')).toBe(true);
    expect(isPermanentConflictCode('PERMISSION_DENIED')).toBe(true);
  });

  it('identifies retryable network errors strictly via typed error codes', () => {
    expect(isPermanentConflictCode('NETWORK_ERROR')).toBe(false);
    expect(isPermanentConflictCode('TEMPORARY_UNAVAILABLE')).toBe(false);
    expect(isPermanentConflictCode('UNKNOWN_ERROR')).toBe(false);
  });

  it('SyncError instances retain typed code and classify accurately', () => {
    const dupErr = new SyncError('DUPLICATE_TICKET', 'Ticket already exists', { ticketNumber: '123' });
    const stageErr = new SyncError('STAGE_ALREADY_COMPLETE', 'Stage is complete');
    const padErr = new SyncError('PAD_NOT_FOUND', 'Pad deleted');
    const netErr = new SyncError('NETWORK_ERROR', 'Connection timed out');
    const unavailErr = new SyncError('TEMPORARY_UNAVAILABLE', 'Service unavailable');

    expect(dupErr.code).toBe('DUPLICATE_TICKET');
    expect(dupErr.isPermanentConflict).toBe(true);

    expect(stageErr.code).toBe('STAGE_ALREADY_COMPLETE');
    expect(stageErr.isPermanentConflict).toBe(true);

    expect(padErr.code).toBe('PAD_NOT_FOUND');
    expect(padErr.isPermanentConflict).toBe(true);

    expect(netErr.code).toBe('NETWORK_ERROR');
    expect(netErr.isPermanentConflict).toBe(false);

    expect(unavailErr.code).toBe('TEMPORARY_UNAVAILABLE');
    expect(unavailErr.isPermanentConflict).toBe(false);
  });

  it('classifySyncErrorCode extracts code from error objects or maps standard Firestore errors', () => {
    const firestorePerm = { code: 'permission-denied', message: 'Permission denied' };
    const firestoreUnavail = { code: 'unavailable', message: 'Service unavailable' };
    const firestoreNotFound = { code: 'not-found', message: 'Document not found' };

    expect(classifySyncErrorCode(firestorePerm)).toBe('PERMISSION_DENIED');
    expect(classifySyncErrorCode(firestoreUnavail)).toBe('TEMPORARY_UNAVAILABLE');
    expect(classifySyncErrorCode(firestoreNotFound)).toBe('PAD_NOT_FOUND');
  });

  it('correctly cleans up legacy queue storage from localStorage without touching valid keys', () => {
    localStorage.setItem('sandtracker_offline_queue', JSON.stringify([{ id: '1' }]));
    localStorage.setItem('python_sandtracker_offline_queue_v1', JSON.stringify([{ id: '2' }]));
    localStorage.setItem('sandtracker_active_pad_id', 'test-pad-123');

    cleanObsoleteQueueStorage();

    expect(localStorage.getItem('sandtracker_offline_queue')).toBeNull();
    expect(localStorage.getItem('python_sandtracker_offline_queue_v1')).toBeNull();
    expect(localStorage.getItem('sandtracker_active_pad_id')).toBe('test-pad-123');
  });

  it('provides connection status and subscription', () => {
    expect(typeof isOnline()).toBe('boolean');
    let notified = false;
    const unsub = subscribeOfflineState((online) => {
      notified = true;
    });
    expect(notified).toBe(true);
    unsub();
  });
});
