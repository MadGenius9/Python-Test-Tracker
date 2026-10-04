import { describe, it, expect, vi } from 'vitest';
import { fetchPadFullState } from './firestoreService';
import { StageRecord } from '../types';

const mockCompletedAt = new Date('2026-08-31T18:00:00Z').getTime();

vi.mock('firebase/firestore', () => {
  return {
    getFirestore: vi.fn(() => ({})),
    doc: vi.fn((_db, ...paths) => ({ path: paths.join('/') })),
    collection: vi.fn((_db, ...paths) => ({ path: paths.join('/') })),
    getDoc: vi.fn(async (docRef: any) => {
      return {
        exists: () => true,
        id: 'pad-test-full-fetch',
        data: () => ({
          config: {
            padName: 'Test Pad Full Fetch',
            wells: [{ id: 'wellId', name: 'Well 1H', plannedStages: 50 }],
            sandTypes: [{ id: 'st-1', name: '100 mesh', perStageDesignLbs: 300000 }],
            silos: [],
          },
          stageRecordsSchemaVersion: 1,
        }),
      };
    }),
    getDocs: vi.fn(async (colRef: any) => {
      const path = colRef?.path || '';
      if (path.endsWith('stageRecords')) {
        return {
          forEach: (cb: (doc: any) => void) => {
            cb({
              id: 'wellId_stage_49',
              data: (): StageRecord => ({
                wellId: 'wellId',
                stageNumber: 49,
                status: 'complete',
                recordedBySand: { '100 mesh': 300000 },
                totalRecordedLbs: 300000,
                lastSubmissionId: 'sub-49',
                completedAt: mockCompletedAt,
                updatedAt: mockCompletedAt,
              }),
            });
          },
          size: 1,
        };
      }
      if (path.endsWith('deliveries')) {
        return {
          forEach: (_cb: any) => {},
          size: 0,
        };
      }
      if (path.endsWith('runs')) {
        return {
          forEach: (_cb: any) => {},
          size: 0,
        };
      }
      return {
        forEach: (_cb: any) => {},
        size: 0,
      };
    }),
    onSnapshot: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(async () => {}),
    })),
  };
});

describe('fetchPadFullState - Stage Records Loading', () => {
  it('confirms a fetched pad state exposes stageRecords["wellId_stage_49"].completedAt', async () => {
    const padId = 'pad-test-full-fetch';
    const fetchedState = await fetchPadFullState(padId);

    expect(fetchedState).not.toBeNull();
    expect(fetchedState?.status).toBe('ready');
    expect(fetchedState?.stageRecords).toBeDefined();
    expect(fetchedState?.stageRecords?.['wellId_stage_49']).toBeDefined();
    expect(fetchedState?.stageRecords?.['wellId_stage_49'].completedAt).toBe(mockCompletedAt);
    expect(fetchedState?.stageRecords?.['wellId_stage_49'].status).toBe('complete');
    expect(fetchedState?.stageRecords?.['wellId_stage_49'].stageNumber).toBe(49);
    expect(fetchedState?.stageRecords?.['wellId_stage_49'].totalRecordedLbs).toBe(300000);
  });
});
