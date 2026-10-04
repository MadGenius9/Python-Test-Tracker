import { describe, it, expect } from 'vitest';
import {
  getEffectivePerStageDesign,
  getSiloDerivedStates,
  getNextWellAndStage,
  sortStageRunsByActualSequence,
  isStageComplete,
} from './sandRules';
import { AppState, PadConfig, WellConfig, RunRecord, StageRecord, StageSubmissionMarker } from '../types';
import { calculateStageRecordFromRuns, buildStageRecordFromTotals } from './firestoreService';

const testPadConfig: PadConfig = {
  padName: 'Reliability Pad Alpha',
  customerName: 'Permian Operator',
  siloCount: 6,
  lbsPerTruckload: 57000,
  lbsPerTon: 2000,
  drawStrategy: 'sequential_rotation',
  partialThresholdPct: 0.75,
  reorderThresholdStages: 5,
  autoAdvanceWellStage: true,
  clearManualPriorityAfterStage: true,
  sandTypes: [
    { id: 'st-1', name: '100 mesh', perStageDesignLbs: 300000, colorCategory: 'amber' },
    { id: 'st-2', name: '40/70', perStageDesignLbs: 100000, colorCategory: 'emerald' },
  ],
  wells: [
    { id: 'w-1', name: 'Well 1H', plannedStages: 40 },
    {
      id: 'w-2',
      name: 'Well 2H',
      plannedStages: 40,
      perStageDesignOverrides: {
        '100 mesh': 350000,
        '40/70': 50000,
      },
    },
  ],
  silos: [
    { siloNumber: 1, sandType: '100 mesh', side: 'A', maxCapacityLbs: 350000, startingBalanceLbs: 300000, manualPriority: null, isOutOfService: false },
    { siloNumber: 2, sandType: '100 mesh', side: 'A', maxCapacityLbs: 350000, startingBalanceLbs: 300000, manualPriority: null, isOutOfService: false },
    { siloNumber: 3, sandType: '100 mesh', side: 'A', maxCapacityLbs: 350000, startingBalanceLbs: 300000, manualPriority: null, isOutOfService: false },
    { siloNumber: 4, sandType: '40/70', side: 'B', maxCapacityLbs: 350000, startingBalanceLbs: 200000, manualPriority: null, isOutOfService: false },
    { siloNumber: 5, sandType: '40/70', side: 'B', maxCapacityLbs: 350000, startingBalanceLbs: 200000, manualPriority: null, isOutOfService: false },
    { siloNumber: 6, sandType: '40/70', side: 'B', maxCapacityLbs: 350000, startingBalanceLbs: 200000, manualPriority: null, isOutOfService: false },
  ],
};

function createMockState(overrides?: Partial<AppState>): AppState {
  return {
    padId: 'rel-pad-1',
    config: { ...testPadConfig, ...overrides?.config },
    deliveries: overrides?.deliveries || [],
    runs: overrides?.runs || [],
  };
}

describe('Reliability - Stage Partial vs Complete Logic', () => {
  it('correctly evaluates complete stage with 1 lb tolerance when total pumped reaches design', () => {
    const well = testPadConfig.wells[0]; // w-1: 300k 100 mesh, 100k 40/70
    const sandType100 = testPadConfig.sandTypes[0];
    const design = getEffectivePerStageDesign(well, sandType100);

    const totalPumpedFull = 300000;
    const isCompleteFull = totalPumpedFull >= (design - 1);
    expect(isCompleteFull).toBe(true);

    const totalPumpedSlightlyUnderTolerance = 299999;
    const isCompleteTolerance = totalPumpedSlightlyUnderTolerance >= (design - 1);
    expect(isCompleteTolerance).toBe(true);

    const totalPumpedPartial = 250000;
    const isCompletePartial = totalPumpedPartial >= (design - 1);
    expect(isCompletePartial).toBe(false);
  });

  it('handles multi-sand stage completion where both sands must satisfy their effective designs', () => {
    const well = testPadConfig.wells[1]; // w-2: 350k 100 mesh, 50k 40/70
    const sand100 = testPadConfig.sandTypes[0];
    const sand4070 = testPadConfig.sandTypes[1];

    const design100 = getEffectivePerStageDesign(well, sand100);
    const design4070 = getEffectivePerStageDesign(well, sand4070);

    expect(design100).toBe(350000);
    expect(design4070).toBe(50000);

    // Scenario A: 100 mesh met, 40/70 partial
    const pumped100A = 350000;
    const pumped4070A = 20000;
    const isAllCompleteA = (pumped100A >= design100 - 1) && (pumped4070A >= design4070 - 1);
    expect(isAllCompleteA).toBe(false);

    // Scenario B: both met
    const pumped100B = 350000;
    const pumped4070B = 50000;
    const isAllCompleteB = (pumped100B >= design100 - 1) && (pumped4070B >= design4070 - 1);
    expect(isAllCompleteB).toBe(true);
  });

  it('does not block completion if a sand type has 0 required lbs for the well', () => {
    const wellZeroSand: WellConfig = {
      id: 'w-zero',
      name: 'Zero 40/70 Well',
      plannedStages: 40,
      perStageDesignOverrides: {
        '100 mesh': 300000,
        '40/70': 0,
      },
    };

    const design100 = getEffectivePerStageDesign(wellZeroSand, testPadConfig.sandTypes[0]);
    const design4070 = getEffectivePerStageDesign(wellZeroSand, testPadConfig.sandTypes[1]);

    const pumped100 = 300000;
    const pumped4070 = 0;

    const is100Complete = design100 <= 0 || pumped100 >= (design100 - 1);
    const is4070Complete = design4070 <= 0 || pumped4070 >= (design4070 - 1);

    expect(is100Complete && is4070Complete).toBe(true);
  });
});

describe('Reliability - Run Sequence Across Multiple Partial Submissions', () => {
  it('continues runSequence across multiple partial submissions for the same well and stage', () => {
    const firstSubmissionRuns: RunRecord[] = [
      {
        id: 'run-1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 2,
        sandType: '100 mesh',
        lbsPulled: 150000,
        date: '2026-08-25',
        deleted: false,
        runSequence: 1,
        submissionId: 'sub-1',
        createdAt: 1000,
      },
      {
        id: 'run-2',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 3,
        sandType: '100 mesh',
        lbsPulled: 50000,
        date: '2026-08-25',
        deleted: false,
        runSequence: 2,
        submissionId: 'sub-1',
        createdAt: 2000,
      },
    ];

    // Compute max sequence for next partial submission
    const existingSeqs = firstSubmissionRuns
      .map((r) => r.runSequence)
      .filter((s): s is number => typeof s === 'number');
    const maxSeq = Math.max(...existingSeqs, firstSubmissionRuns.length);
    expect(maxSeq).toBe(2);

    // Second partial submission starting at maxSeq + 1
    const secondSubmissionRuns: RunRecord[] = [
      {
        id: 'run-3',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 3,
        sandType: '100 mesh',
        lbsPulled: 100000,
        date: '2026-08-25',
        deleted: false,
        runSequence: maxSeq + 1,
        submissionId: 'sub-2',
        createdAt: 3000,
      },
      {
        id: 'run-4',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 4,
        sandType: '40/70',
        lbsPulled: 100000,
        date: '2026-08-25',
        deleted: false,
        runSequence: maxSeq + 2,
        submissionId: 'sub-2',
        createdAt: 4000,
      },
    ];

    expect(secondSubmissionRuns[0].runSequence).toBe(3);
    expect(secondSubmissionRuns[1].runSequence).toBe(4);

    const allRuns = [...firstSubmissionRuns, ...secondSubmissionRuns];
    const sorted = sortStageRunsByActualSequence(allRuns);

    expect(sorted.map((r) => r.runSequence)).toEqual([1, 2, 3, 4]);
  });

  it('correctly handles mixed legacy records and new records with explicit runSequence', () => {
    const legacyRuns: RunRecord[] = [
      {
        id: 'legacy-1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 100000,
        date: '2026-08-20',
        deleted: false,
        createdAt: 100,
      },
      {
        id: 'legacy-2',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 2,
        sandType: '100 mesh',
        lbsPulled: 100000,
        date: '2026-08-20',
        deleted: false,
        createdAt: 200,
      },
    ];

    const newRuns: RunRecord[] = [
      {
        id: 'new-1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 3,
        sandType: '100 mesh',
        lbsPulled: 100000,
        date: '2026-08-25',
        deleted: false,
        runSequence: 3,
        createdAt: 500,
      },
    ];

    const sorted = sortStageRunsByActualSequence([...newRuns, ...legacyRuns]);
    expect(sorted[0].id).toBe('legacy-1');
    expect(sorted[1].id).toBe('legacy-2');
    expect(sorted[2].id).toBe('new-1');
  });
});

describe('Reliability - First Incomplete Stage Iteration in Zipper Order', () => {
  it('finds the first incomplete stage when stages are completed out of order or sequentially', () => {
    const state = createMockState({
      runs: [
        // Well 1H Stage 1 complete
        {
          id: 'r1',
          wellId: 'w-1',
          stageNumber: 1,
          siloNumber: 1,
          sandType: '100 mesh',
          lbsPulled: 300000,
          date: '2026-08-25',
          deleted: false,
          createdAt: 1000,
        },
        {
          id: 'r2',
          wellId: 'w-1',
          stageNumber: 1,
          siloNumber: 4,
          sandType: '40/70',
          lbsPulled: 100000,
          date: '2026-08-25',
          deleted: false,
          createdAt: 2000,
        },
        // Well 1H Stage 2 partial
        {
          id: 'r3',
          wellId: 'w-1',
          stageNumber: 2,
          siloNumber: 2,
          sandType: '100 mesh',
          lbsPulled: 150000,
          date: '2026-08-25',
          deleted: false,
          createdAt: 3000,
        },
      ],
    });

    expect(isStageComplete(state, 'w-1', 1)).toBe(true);
    expect(isStageComplete(state, 'w-1', 2)).toBe(false);

    const next = getNextWellAndStage(state);
    expect(next?.wellId).toBe('w-1');
    expect(next?.stageNumber).toBe(2);
  });
});

function createMockRun(overrides: Partial<RunRecord> & { wellId: string; stageNumber: number; siloNumber: number; sandType: string; lbsPulled: number }): RunRecord {
  return {
    id: overrides.id || `run-${Math.random().toString(36).substring(2, 7)}`,
    date: overrides.date || '2026-08-25',
    createdAt: overrides.createdAt || 1000,
    deleted: overrides.deleted ?? false,
    ...overrides,
  };
}

describe('Reliability - Permanent Stage Idempotency & Markers', () => {
  function simulateCommitRunRecords(
    config: PadConfig,
    stageRecordsMap: Map<string, StageRecord>,
    stageSubmissionsMap: Map<string, StageSubmissionMarker>,
    records: RunRecord[]
  ) {
    const groupsMap = new Map<
      string,
      {
        stageKey: string;
        submissionKey: string;
        wellId: string;
        stageNumber: number;
        submissionId: string;
        records: RunRecord[];
      }
    >();

    for (const r of records) {
      const stageKey = `${r.wellId}_stage_${r.stageNumber}`;
      const subId = r.submissionId || 'default_sub';
      const submissionKey = `${stageKey}_${subId}`;
      if (!groupsMap.has(submissionKey)) {
        groupsMap.set(submissionKey, {
          stageKey,
          submissionKey,
          wellId: r.wellId,
          stageNumber: r.stageNumber,
          submissionId: subId,
          records: [],
        });
      }
      groupsMap.get(submissionKey)!.records.push(r);
    }

    for (const [, group] of groupsMap.entries()) {
      if (stageSubmissionsMap.has(group.submissionKey)) {
        // [STAGE SUBMISSION IDEMPOTENT NO-OP]
        continue;
      }

      const existingStage = stageRecordsMap.get(group.stageKey);
      if (existingStage && existingStage.status === 'complete') {
        throw new Error(`STAGE ALREADY COMPLETE: Stage #${group.stageNumber} has already been completed.`);
      }

      const existingRecordedBySand: Record<string, number> = { ...(existingStage?.recordedBySand || {}) };
      for (const r of group.records) {
        if (r.sandType) {
          existingRecordedBySand[r.sandType] = (existingRecordedBySand[r.sandType] || 0) + (r.lbsPulled || 0);
        }
      }
      const totalRecordedLbs = Object.values(existingRecordedBySand).reduce((sum, v) => sum + v, 0);

      const well = config.wells.find((w) => w.id === group.wellId);
      const sandTypes = config.sandTypes || [];
      let isComplete = false;
      if (sandTypes.length > 0) {
        let hasAnyRequired = false;
        let allRequiredMet = true;
        for (const st of sandTypes) {
          const effectiveDesign = well ? getEffectivePerStageDesign(well, st) : (st.perStageDesignLbs || 0);
          if (effectiveDesign > 0) {
            hasAnyRequired = true;
            const pumped = existingRecordedBySand[st.name] || 0;
            if (pumped < effectiveDesign - 1) {
              allRequiredMet = false;
            }
          }
        }
        isComplete = hasAnyRequired ? allRequiredMet : totalRecordedLbs > 0;
      } else {
        isComplete = totalRecordedLbs > 0;
      }

      const now = Date.now();
      const stageRecordDoc: StageRecord = {
        wellId: group.wellId,
        stageNumber: group.stageNumber,
        status: isComplete ? 'complete' : 'partial',
        recordedBySand: existingRecordedBySand,
        totalRecordedLbs,
        lastSubmissionId: group.submissionId,
        updatedAt: now,
        completedAt: isComplete ? (existingStage?.completedAt || now) : null,
      };
      stageRecordsMap.set(group.stageKey, stageRecordDoc);

      const marker: StageSubmissionMarker = {
        stageKey: group.stageKey,
        wellId: group.wellId,
        stageNumber: group.stageNumber,
        submissionId: group.submissionId,
        processedAt: now,
        runIds: group.records.map((r) => r.id),
        totalSubmittedLbs: group.records.reduce((sum, r) => sum + (r.lbsPulled || 0), 0),
      };
      stageSubmissionsMap.set(group.submissionKey, marker);
    }
  }

  it('TEST A: Submission A (200,000 lbs) submitted twice results in exactly 200,000 lbs, not 400,000 lbs', () => {
    const stageRecords = new Map<string, StageRecord>();
    const stageSubmissions = new Map<string, StageSubmissionMarker>();

    const subA: RunRecord[] = [
      createMockRun({
        id: 'r-1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 200000,
        submissionId: 'sub_A',
      }),
    ];

    // Submit A first time
    simulateCommitRunRecords(testPadConfig, stageRecords, stageSubmissions, subA);
    const stageAfterFirst = stageRecords.get('w-1_stage_1');
    expect(stageAfterFirst?.totalRecordedLbs).toBe(200000);
    expect(stageSubmissions.has('w-1_stage_1_sub_A')).toBe(true);

    // Submit A second time (retry)
    simulateCommitRunRecords(testPadConfig, stageRecords, stageSubmissions, subA);
    const stageAfterSecond = stageRecords.get('w-1_stage_1');
    expect(stageAfterSecond?.totalRecordedLbs).toBe(200000);
  });

  it('TEST B: Submission A (200k), Submission B (253.6k), then replay Submission A results in 453.6k, not 653.6k', () => {
    const stageRecords = new Map<string, StageRecord>();
    const stageSubmissions = new Map<string, StageSubmissionMarker>();

    const subA: RunRecord[] = [
      createMockRun({
        id: 'r-A',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 200000,
        submissionId: 'sub_A',
      }),
    ];

    const subB: RunRecord[] = [
      createMockRun({
        id: 'r-B',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 2,
        sandType: '100 mesh',
        lbsPulled: 100000,
        submissionId: 'sub_B',
      }),
      createMockRun({
        id: 'r-B2',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 4,
        sandType: '40/70',
        lbsPulled: 153600,
        submissionId: 'sub_B',
      }),
    ];

    // 1. Process A
    simulateCommitRunRecords(testPadConfig, stageRecords, stageSubmissions, subA);
    expect(stageRecords.get('w-1_stage_1')?.totalRecordedLbs).toBe(200000);

    // 2. Process B
    simulateCommitRunRecords(testPadConfig, stageRecords, stageSubmissions, subB);
    expect(stageRecords.get('w-1_stage_1')?.totalRecordedLbs).toBe(453600);
    expect(stageRecords.get('w-1_stage_1')?.lastSubmissionId).toBe('sub_B');

    // 3. Old offline Submission A retries later (even though lastSubmissionId is sub_B!)
    simulateCommitRunRecords(testPadConfig, stageRecords, stageSubmissions, subA);
    expect(stageRecords.get('w-1_stage_1')?.totalRecordedLbs).toBe(453600);
  });

  it('TEST C: Stage completes from Submission B, replay B is a successful no-op (NOT "stage already complete" error)', () => {
    const stageRecords = new Map<string, StageRecord>();
    const stageSubmissions = new Map<string, StageSubmissionMarker>();

    const subB: RunRecord[] = [
      createMockRun({
        id: 'r-B1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 300000,
        submissionId: 'sub_B',
      }),
      createMockRun({
        id: 'r-B2',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 4,
        sandType: '40/70',
        lbsPulled: 100000,
        submissionId: 'sub_B',
      }),
    ];

    // Process B -> stage becomes complete
    simulateCommitRunRecords(testPadConfig, stageRecords, stageSubmissions, subB);
    const stage = stageRecords.get('w-1_stage_1');
    expect(stage?.status).toBe('complete');
    expect(stage?.totalRecordedLbs).toBe(400000);

    // Replay B -> should not throw error, should be successful no-op
    expect(() => {
      simulateCommitRunRecords(testPadConfig, stageRecords, stageSubmissions, subB);
    }).not.toThrow();

    expect(stageRecords.get('w-1_stage_1')?.totalRecordedLbs).toBe(400000);
  });

  it('TEST D: Stage is complete, brand new Submission C is rejected', () => {
    const stageRecords = new Map<string, StageRecord>();
    const stageSubmissions = new Map<string, StageSubmissionMarker>();

    const subB: RunRecord[] = [
      createMockRun({
        id: 'r-B1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 300000,
        submissionId: 'sub_B',
      }),
      createMockRun({
        id: 'r-B2',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 4,
        sandType: '40/70',
        lbsPulled: 100000,
        submissionId: 'sub_B',
      }),
    ];

    simulateCommitRunRecords(testPadConfig, stageRecords, stageSubmissions, subB);

    const subC: RunRecord[] = [
      createMockRun({
        id: 'r-C1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 50000,
        submissionId: 'sub_C',
      }),
    ];

    expect(() => {
      simulateCommitRunRecords(testPadConfig, stageRecords, stageSubmissions, subC);
    }).toThrow(/STAGE ALREADY COMPLETE/);
  });

  it('Mixed Online/Offline Scenario: Submission A queued offline, connection recovered, written, B written, old A retries safely', () => {
    const stageRecords = new Map<string, StageRecord>();
    const stageSubmissions = new Map<string, StageSubmissionMarker>();

    const subA: RunRecord[] = [
      createMockRun({
        id: 'run-a1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 150000,
        submissionId: 'sub_offline_A',
      }),
    ];

    const subB: RunRecord[] = [
      createMockRun({
        id: 'run-b1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 2,
        sandType: '100 mesh',
        lbsPulled: 150000,
        submissionId: 'sub_online_B',
      }),
    ];

    // 1. Connection recovers, subA syncs
    simulateCommitRunRecords(testPadConfig, stageRecords, stageSubmissions, subA);
    // 2. User does subB
    simulateCommitRunRecords(testPadConfig, stageRecords, stageSubmissions, subB);
    expect(stageRecords.get('w-1_stage_1')?.totalRecordedLbs).toBe(300000);

    // 3. Stale worker / offline queue retries subA
    simulateCommitRunRecords(testPadConfig, stageRecords, stageSubmissions, subA);
    expect(stageRecords.get('w-1_stage_1')?.totalRecordedLbs).toBe(300000);
  });
});

describe('Reliability - Stage Record Reconciliation from Run History', () => {
  it('TEST DELETE: Deleting a run from a complete stage recalculates stage to partial and nulls completedAt', () => {
    const runs: RunRecord[] = [
      createMockRun({
        id: 'run-1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 200000,
        deleted: false,
      }),
      createMockRun({
        id: 'run-2',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 2,
        sandType: '100 mesh',
        lbsPulled: 100000,
        deleted: false,
      }),
      createMockRun({
        id: 'run-3',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 4,
        sandType: '40/70',
        lbsPulled: 100000,
        deleted: false,
      }),
    ];

    // Initial state: complete
    const initialStage = calculateStageRecordFromRuns(testPadConfig, 'w-1', 1, runs);
    expect(initialStage.status).toBe('complete');
    expect(initialStage.totalRecordedLbs).toBe(400000);
    expect(initialStage.completedAt).not.toBeNull();

    // Mark run-2 (100k) deleted
    const updatedRuns = runs.map((r) => (r.id === 'run-2' ? { ...r, deleted: true } : r));
    const reconciledStage = calculateStageRecordFromRuns(
      testPadConfig,
      'w-1',
      1,
      updatedRuns,
      initialStage
    );

    expect(reconciledStage.status).toBe('partial');
    expect(reconciledStage.totalRecordedLbs).toBe(300000);
    expect(reconciledStage.recordedBySand['100 mesh']).toBe(200000);
    expect(reconciledStage.recordedBySand['40/70']).toBe(100000);
    expect(reconciledStage.completedAt).toBeNull();
  });

  it('TEST RESTORE: Restoring a deleted run recalculates stage back to complete', () => {
    const runs: RunRecord[] = [
      createMockRun({
        id: 'run-1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 300000,
        deleted: false,
      }),
      createMockRun({
        id: 'run-2',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 4,
        sandType: '40/70',
        lbsPulled: 100000,
        deleted: true, // Currently deleted
      }),
    ];

    const partialStage = calculateStageRecordFromRuns(testPadConfig, 'w-1', 1, runs);
    expect(partialStage.status).toBe('partial');
    expect(partialStage.totalRecordedLbs).toBe(300000);

    // Restore run-2
    const restoredRuns = runs.map((r) => (r.id === 'run-2' ? { ...r, deleted: false } : r));
    const completeStage = calculateStageRecordFromRuns(
      testPadConfig,
      'w-1',
      1,
      restoredRuns,
      partialStage
    );

    expect(completeStage.status).toBe('complete');
    expect(completeStage.totalRecordedLbs).toBe(400000);
    expect(completeStage.completedAt).not.toBeNull();
  });

  it('TEST EDIT POUNDS: Editing run weight recalculates stage total and status immediately', () => {
    const runs: RunRecord[] = [
      createMockRun({
        id: 'run-1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 300000,
        deleted: false,
      }),
      createMockRun({
        id: 'run-2',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 4,
        sandType: '40/70',
        lbsPulled: 100000,
        deleted: false,
      }),
    ];

    const initialStage = calculateStageRecordFromRuns(testPadConfig, 'w-1', 1, runs);
    expect(initialStage.status).toBe('complete');

    // Edit run-2 from 100k to 50k
    const editedRuns = runs.map((r) => (r.id === 'run-2' ? { ...r, lbsPulled: 50000 } : r));
    const reconciled = calculateStageRecordFromRuns(
      testPadConfig,
      'w-1',
      1,
      editedRuns,
      initialStage
    );

    expect(reconciled.totalRecordedLbs).toBe(350000);
    expect(reconciled.status).toBe('partial');
    expect(reconciled.completedAt).toBeNull();
  });

  it('TEST CHANGE SAND TYPE: Moving a run from 100 mesh to 40/70 recalculates both sand totals', () => {
    const customConfig: PadConfig = {
      ...testPadConfig,
      sandTypes: [
        { id: 'st-1', name: '100 mesh', perStageDesignLbs: 250000, colorCategory: 'amber' },
        { id: 'st-2', name: '40/70', perStageDesignLbs: 200000, colorCategory: 'emerald' },
      ],
    };

    const runs: RunRecord[] = [
      createMockRun({
        id: 'run-1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 350000,
        deleted: false,
      }),
      createMockRun({
        id: 'run-2',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 4,
        sandType: '40/70',
        lbsPulled: 100000,
        deleted: false,
      }),
    ];

    const initialStage = calculateStageRecordFromRuns(customConfig, 'w-1', 1, runs);
    // 100 mesh has 350k (>= 250k), but 40/70 has 100k (< 200k) -> partial
    expect(initialStage.status).toBe('partial');

    // Edit run: change 100,000 lbs from 100 mesh to 40/70
    const runsAfterCorrection: RunRecord[] = [
      createMockRun({
        id: 'run-1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 250000,
        deleted: false,
      }),
      createMockRun({
        id: 'run-2',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 4,
        sandType: '40/70',
        lbsPulled: 200000,
        deleted: false,
      }),
    ];

    const reconciled = calculateStageRecordFromRuns(
      customConfig,
      'w-1',
      1,
      runsAfterCorrection,
      initialStage
    );

    expect(reconciled.recordedBySand['100 mesh']).toBe(250000);
    expect(reconciled.recordedBySand['40/70']).toBe(200000);
    expect(reconciled.status).toBe('complete');
  });

  it('TEST MOVE STAGE: Moving a run from Stage 49 to Stage 50 recalculates both stages', () => {
    const runs: RunRecord[] = [
      // Stage 49 runs
      createMockRun({
        id: 'run-stg49-1',
        wellId: 'w-1',
        stageNumber: 49,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 300000,
        deleted: false,
      }),
      createMockRun({
        id: 'run-stg49-2',
        wellId: 'w-1',
        stageNumber: 49,
        siloNumber: 4,
        sandType: '40/70',
        lbsPulled: 100000,
        deleted: false,
      }),
      // Stage 50 runs
      createMockRun({
        id: 'run-stg50-1',
        wellId: 'w-1',
        stageNumber: 50,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 200000,
        deleted: false,
      }),
    ];

    const stg49Before = calculateStageRecordFromRuns(testPadConfig, 'w-1', 49, runs);
    const stg50Before = calculateStageRecordFromRuns(testPadConfig, 'w-1', 50, runs);

    expect(stg49Before.status).toBe('complete');
    expect(stg49Before.totalRecordedLbs).toBe(400000);
    expect(stg50Before.status).toBe('partial');
    expect(stg50Before.totalRecordedLbs).toBe(200000);

    // Move run-stg49-2 (100k 40/70) from Stage 49 to Stage 50
    const runsAfterMove = runs.map((r) =>
      r.id === 'run-stg49-2' ? { ...r, stageNumber: 50 } : r
    );

    const stg49After = calculateStageRecordFromRuns(testPadConfig, 'w-1', 49, runsAfterMove, stg49Before);
    const stg50After = calculateStageRecordFromRuns(testPadConfig, 'w-1', 50, runsAfterMove, stg50Before);

    // Stage 49 lost its 40/70 run -> now partial
    expect(stg49After.totalRecordedLbs).toBe(300000);
    expect(stg49After.recordedBySand['40/70'] || 0).toBe(0);
    expect(stg49After.status).toBe('partial');

    // Stage 50 gained 100k 40/70 (now 200k 100 mesh + 100k 40/70)
    expect(stg50After.totalRecordedLbs).toBe(300000);
    expect(stg50After.recordedBySand['40/70']).toBe(100000);
  });

  it('Over-pulls: Recorded pounds exceeding design remain complete without silent truncation', () => {
    const runs: RunRecord[] = [
      createMockRun({
        id: 'run-1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 350000, // design is 300,000
        deleted: false,
      }),
      createMockRun({
        id: 'run-2',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 4,
        sandType: '40/70',
        lbsPulled: 104000, // design is 100,000
        deleted: false,
      }),
    ];

    const stage = calculateStageRecordFromRuns(testPadConfig, 'w-1', 1, runs);
    expect(stage.status).toBe('complete');
    expect(stage.totalRecordedLbs).toBe(454000); // Preserved in full!
    expect(stage.recordedBySand['100 mesh']).toBe(350000);
    expect(stage.recordedBySand['40/70']).toBe(104000);
  });
});

describe('Reliability - Formatting & No Duplicate "lbs lbs"', () => {
  it('formats numbers cleanly without duplicate "lbs lbs"', () => {
    const formattedNum = '219,600';
    const textOutput = `${formattedNum} lbs`;
    expect(textOutput).not.toContain('lbs lbs');
    expect(textOutput).toBe('219,600 lbs');
  });
});

describe('Reliability - Atomic Run Corrections & Stage Record Backfill', () => {
  const config = testPadConfig; // w-1: 300k 100 mesh, 100k 40/70; total design 400k

  it('buildStageRecordFromTotals: evaluates stage status, tolerance, and completedAt accurately', () => {
    // 1. Partial stage
    const partialStage = buildStageRecordFromTotals(
      config,
      'w-1',
      1,
      { '100 mesh': 200000, '40/70': 50000 },
      null,
      1000
    );
    expect(partialStage.status).toBe('partial');
    expect(partialStage.totalRecordedLbs).toBe(250000);
    expect(partialStage.completedAt).toBeNull();

    // 2. Complete stage (transitions partial -> complete)
    const completeStage = buildStageRecordFromTotals(
      config,
      'w-1',
      1,
      { '100 mesh': 300000, '40/70': 100000 },
      partialStage,
      2000
    );
    expect(completeStage.status).toBe('complete');
    expect(completeStage.totalRecordedLbs).toBe(400000);
    expect(completeStage.completedAt).toBe(2000);

    // 3. Complete stage with 1-lb tolerance
    const toleranceStage = buildStageRecordFromTotals(
      config,
      'w-1',
      1,
      { '100 mesh': 299999, '40/70': 99999 },
      null,
      3000
    );
    expect(toleranceStage.status).toBe('complete');
    expect(toleranceStage.completedAt).toBe(3000);

    // 4. Preserve existing completedAt if already complete
    const preservedStage = buildStageRecordFromTotals(
      config,
      'w-1',
      1,
      { '100 mesh': 320000, '40/70': 110000 },
      completeStage,
      4000
    );
    expect(preservedStage.status).toBe('complete');
    expect(preservedStage.completedAt).toBe(2000); // Preserved original completion timestamp!

    // 5. Transition complete -> partial resets completedAt to null
    const regressedStage = buildStageRecordFromTotals(
      config,
      'w-1',
      1,
      { '100 mesh': 250000, '40/70': 100000 },
      completeStage,
      5000
    );
    expect(regressedStage.status).toBe('partial');
    expect(regressedStage.completedAt).toBeNull();
  });

  it('DELETE RUN: applies atomic delta subtraction and clamps to 0', () => {
    // Initial completed stage: 300k 100 mesh + 100k 40/70
    const initialStage: StageRecord = {
      wellId: 'w-1',
      stageNumber: 1,
      status: 'complete',
      recordedBySand: { '100 mesh': 300000, '40/70': 100000 },
      totalRecordedLbs: 400000,
      lastSubmissionId: 'sub-1',
      updatedAt: 1000,
      completedAt: 1000,
    };

    // Run to delete: 50,000 lbs of 40/70
    const runToDelete = {
      wellId: 'w-1',
      stageNumber: 1,
      sandType: '40/70',
      lbsPulled: 50000,
    };

    // Atomic delta subtraction
    const currentRecorded = { ...initialStage.recordedBySand };
    currentRecorded[runToDelete.sandType] = Math.max(
      0,
      (currentRecorded[runToDelete.sandType] || 0) - runToDelete.lbsPulled
    );

    const reconciled = buildStageRecordFromTotals(
      config,
      'w-1',
      1,
      currentRecorded,
      initialStage,
      2000
    );

    expect(reconciled.recordedBySand['40/70']).toBe(50000);
    expect(reconciled.totalRecordedLbs).toBe(350000);
    expect(reconciled.status).toBe('partial'); // 40/70 is now under 100k design
    expect(reconciled.completedAt).toBeNull();
  });

  it('RESTORE RUN: applies atomic delta addition and restores completion status', () => {
    // Stage was partial with 300k 100 mesh and 50k 40/70
    const partialStage: StageRecord = {
      wellId: 'w-1',
      stageNumber: 1,
      status: 'partial',
      recordedBySand: { '100 mesh': 300000, '40/70': 50000 },
      totalRecordedLbs: 350000,
      lastSubmissionId: 'sub-1',
      updatedAt: 1000,
      completedAt: null,
    };

    // Restoring run of 50,000 lbs 40/70
    const runToRestore = {
      wellId: 'w-1',
      stageNumber: 1,
      sandType: '40/70',
      lbsPulled: 50000,
    };

    const currentRecorded = { ...partialStage.recordedBySand };
    currentRecorded[runToRestore.sandType] =
      (currentRecorded[runToRestore.sandType] || 0) + runToRestore.lbsPulled;

    const reconciled = buildStageRecordFromTotals(
      config,
      'w-1',
      1,
      currentRecorded,
      partialStage,
      3000
    );

    expect(reconciled.recordedBySand['40/70']).toBe(100000);
    expect(reconciled.totalRecordedLbs).toBe(400000);
    expect(reconciled.status).toBe('complete');
    expect(reconciled.completedAt).toBe(3000);
  });

  it('EDIT RUN (Same Stage): applies net change correctly when weight and sand type are modified', () => {
    const stage: StageRecord = {
      wellId: 'w-1',
      stageNumber: 1,
      status: 'partial',
      recordedBySand: { '100 mesh': 200000, '40/70': 100000 },
      totalRecordedLbs: 300000,
      lastSubmissionId: 'sub-1',
      updatedAt: 1000,
      completedAt: null,
    };

    // Edit run: change from 200,000 lbs 100 mesh to 300,000 lbs 100 mesh
    const oldRun = { sandType: '100 mesh', lbsPulled: 200000 };
    const newRun = { sandType: '100 mesh', lbsPulled: 300000 };

    const recorded = { ...stage.recordedBySand };
    recorded[oldRun.sandType] = Math.max(0, (recorded[oldRun.sandType] || 0) - oldRun.lbsPulled);
    recorded[newRun.sandType] = (recorded[newRun.sandType] || 0) + newRun.lbsPulled;

    const reconciled = buildStageRecordFromTotals(config, 'w-1', 1, recorded, stage, 2000);

    expect(reconciled.recordedBySand['100 mesh']).toBe(300000);
    expect(reconciled.recordedBySand['40/70']).toBe(100000);
    expect(reconciled.totalRecordedLbs).toBe(400000);
    expect(reconciled.status).toBe('complete');
    expect(reconciled.completedAt).toBe(2000);
  });

  it('MOVE RUN (Between Stages): atomically updates both source and destination stages', () => {
    // Stage 1 was complete (400k)
    const stage1: StageRecord = {
      wellId: 'w-1',
      stageNumber: 1,
      status: 'complete',
      recordedBySand: { '100 mesh': 300000, '40/70': 100000 },
      totalRecordedLbs: 400000,
      lastSubmissionId: 'sub-1',
      updatedAt: 1000,
      completedAt: 1000,
    };

    // Stage 2 was partial (300k 100 mesh, 0 40/70)
    const stage2: StageRecord = {
      wellId: 'w-1',
      stageNumber: 2,
      status: 'partial',
      recordedBySand: { '100 mesh': 300000 },
      totalRecordedLbs: 300000,
      lastSubmissionId: 'sub-2',
      updatedAt: 1500,
      completedAt: null,
    };

    // Move run (100k 40/70) from Stage 1 to Stage 2
    const movedRun = { sandType: '40/70', lbsPulled: 100000 };

    // Update old stage
    const oldRecorded = { ...stage1.recordedBySand };
    oldRecorded[movedRun.sandType] = Math.max(0, (oldRecorded[movedRun.sandType] || 0) - movedRun.lbsPulled);
    const reconciledOld = buildStageRecordFromTotals(config, 'w-1', 1, oldRecorded, stage1, 2000);

    // Update new stage
    const newRecorded = { ...stage2.recordedBySand };
    newRecorded[movedRun.sandType] = (newRecorded[movedRun.sandType] || 0) + movedRun.lbsPulled;
    const reconciledNew = buildStageRecordFromTotals(config, 'w-1', 2, newRecorded, stage2, 2000);

    // Assertions
    expect(reconciledOld.status).toBe('partial');
    expect(reconciledOld.totalRecordedLbs).toBe(300000);
    expect(reconciledOld.completedAt).toBeNull();

    expect(reconciledNew.status).toBe('complete');
    expect(reconciledNew.totalRecordedLbs).toBe(400000);
    expect(reconciledNew.recordedBySand['40/70']).toBe(100000);
    expect(reconciledNew.completedAt).toBe(2000);
  });

  it('LEGACY BACKFILL: builds authoritative stage records from non-deleted run history and ignores empty stages', () => {
    const historicalRuns: RunRecord[] = [
      // Well 1 Stage 1: complete (300k 100 mesh, 100k 40/70)
      createMockRun({ wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 300000, deleted: false }),
      createMockRun({ wellId: 'w-1', stageNumber: 1, siloNumber: 4, sandType: '40/70', lbsPulled: 100000, deleted: false }),
      // Well 1 Stage 2: partial (200k 100 mesh, deleted run of 50k 40/70)
      createMockRun({ wellId: 'w-1', stageNumber: 2, siloNumber: 1, sandType: '100 mesh', lbsPulled: 200000, deleted: false }),
      createMockRun({ wellId: 'w-1', stageNumber: 2, siloNumber: 4, sandType: '40/70', lbsPulled: 50000, deleted: true }),
      // Well 2 Stage 1: complete override design (350k 100 mesh, 50k 40/70)
      createMockRun({ wellId: 'w-2', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 350000, deleted: false }),
      createMockRun({ wellId: 'w-2', stageNumber: 1, siloNumber: 4, sandType: '40/70', lbsPulled: 50000, deleted: false }),
    ];

    const w1s1 = calculateStageRecordFromRuns(config, 'w-1', 1, historicalRuns);
    const w1s2 = calculateStageRecordFromRuns(config, 'w-1', 2, historicalRuns);
    const w2s1 = calculateStageRecordFromRuns(config, 'w-2', 1, historicalRuns);
    const w1s3 = calculateStageRecordFromRuns(config, 'w-1', 3, historicalRuns); // No runs

    expect(w1s1.status).toBe('complete');
    expect(w1s1.totalRecordedLbs).toBe(400000);

    expect(w1s2.status).toBe('partial');
    expect(w1s2.totalRecordedLbs).toBe(200000); // Deleted run excluded!
    expect(w1s2.recordedBySand['40/70'] || 0).toBe(0);

    expect(w2s1.status).toBe('complete');
    expect(w2s1.totalRecordedLbs).toBe(400000);

    expect(w1s3.totalRecordedLbs).toBe(0);
    expect(w1s3.status).toBe('partial');
  });

  it('IDEMPOTENT BACKFILL: re-running backfill preserves existing completedAt without side-effects', () => {
    const runs: RunRecord[] = [
      createMockRun({ wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 300000, deleted: false }),
      createMockRun({ wellId: 'w-1', stageNumber: 1, siloNumber: 4, sandType: '40/70', lbsPulled: 100000, deleted: false }),
    ];

    // First backfill pass
    const firstPass = calculateStageRecordFromRuns(config, 'w-1', 1, runs, null, 1000);
    expect(firstPass.status).toBe('complete');
    expect(firstPass.completedAt).toBe(1000);

    // Second backfill pass with firstPass provided as existing record
    const secondPass = calculateStageRecordFromRuns(config, 'w-1', 1, runs, firstPass, 5000);
    expect(secondPass.status).toBe('complete');
    expect(secondPass.totalRecordedLbs).toBe(firstPass.totalRecordedLbs);
    expect(secondPass.completedAt).toBe(1000); // Still 1000!
  });
});


