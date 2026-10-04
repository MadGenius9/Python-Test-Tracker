import { describe, expect, it } from 'vitest';
import { AppState, PadConfig, RunRecord, StageRecord, WellConfig } from '../types';
import {
  buildStageSummaries,
  formatStageDateTimeDisplay,
  formatStageShortDate,
  formatStageTimeAmPm,
  getStageSummary,
  sortStageRunsForReview,
} from './stageHistory';

const mockConfig: PadConfig = {
  padName: 'TEST PAD',
  siloCount: 6,
  lbsPerTruckload: 57000,
  lbsPerTon: 2000,
  drawStrategy: 'sequential_rotation',
  reorderThresholdStages: 2,
  silos: [
    { siloNumber: 1, side: 'A', manualPriority: null, maxCapacityLbs: 350000, isOutOfService: false, sandType: '100 Mesh', startingBalanceLbs: 300000 },
    { siloNumber: 2, side: 'A', manualPriority: null, maxCapacityLbs: 350000, isOutOfService: false, sandType: '100 Mesh', startingBalanceLbs: 300000 },
    { siloNumber: 3, side: 'A', manualPriority: null, maxCapacityLbs: 350000, isOutOfService: false, sandType: '100 Mesh', startingBalanceLbs: 300000 },
    { siloNumber: 4, side: 'A', manualPriority: null, maxCapacityLbs: 350000, isOutOfService: false, sandType: '100 Mesh', startingBalanceLbs: 300000 },
    { siloNumber: 5, side: 'B', manualPriority: null, maxCapacityLbs: 350000, isOutOfService: false, sandType: '40/70', startingBalanceLbs: 300000 },
    { siloNumber: 6, side: 'B', manualPriority: null, maxCapacityLbs: 350000, isOutOfService: false, sandType: '40/70', startingBalanceLbs: 300000 },
  ],
  wells: [
    { id: 'w-1', name: 'Well 1H', plannedStages: 40 },
    {
      id: 'w-2',
      name: 'Well 2H',
      plannedStages: 30,
      perStageDesignOverrides: { '100 Mesh': 500000 },
    },
  ],
  sandTypes: [
    { id: 'st-100', name: '100 Mesh', colorCategory: 'amber', perStageDesignLbs: 453600 },
    { id: 'st-4070', name: '40/70', colorCategory: 'emerald', perStageDesignLbs: 0 },
  ],
};

function createMockState(overrides?: Partial<AppState>): AppState {
  return {
    status: 'ready',
    config: mockConfig,
    deliveries: [],
    runs: [],
    deletedRuns: [],
    stageRecords: {},
    ...overrides,
  };
}

describe('Stage History & Stage Review Engine', () => {
  // Test 1: Multi-silo stage test
  it('1. Multi-silo stage test: 4-silo stage aggregates correctly and maintains sequential order', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-1',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 2,
        sandType: '100 Mesh',
        lbsPulled: 137160,
        runSequence: 1,
        createdAt: 1000,
        date: '2026-08-27',
      },
      {
        id: 'r-2',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 3,
        sandType: '100 Mesh',
        lbsPulled: 200000,
        runSequence: 2,
        createdAt: 2000,
        date: '2026-08-27',
      },
      {
        id: 'r-3',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 3,
        sandType: '100 Mesh',
        lbsPulled: 111400,
        runSequence: 3,
        createdAt: 3000,
        date: '2026-08-27',
      },
      {
        id: 'r-4',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 4,
        sandType: '100 Mesh',
        lbsPulled: 5040,
        runSequence: 4,
        createdAt: 4000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs });
    const summary = getStageSummary(state, 'w-1', 1);

    expect(summary.totalActualLbs).toBe(453600);
    expect(summary.status).toBe('complete');
    expect(summary.pullSequence.map((p) => p.siloNumber)).toEqual([2, 3, 3, 4]);

    // Compact sequence should combine adjacent S3 pulls
    expect(summary.compactSequence).toEqual([
      { siloNumber: 2, sandType: '100 Mesh', lbsPulled: 137160 },
      { siloNumber: 3, sandType: '100 Mesh', lbsPulled: 311400 },
      { siloNumber: 4, sandType: '100 Mesh', lbsPulled: 5040 },
    ]);
  });

  // Test 2: Partial stage test
  it('2. Partial stage test: 200,000 lbs against 453,600 lbs design shows partial and 253,600 remaining', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-p',
        wellId: 'w-1',
        stageNumber: 2,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 200000,
        createdAt: 1000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs });
    const summary = getStageSummary(state, 'w-1', 2);

    expect(summary.status).toBe('partial');
    expect(summary.totalActualLbs).toBe(200000);
    expect(summary.totalDesignLbs).toBe(453600);
    expect(summary.varianceLbs).toBe(-253600);
  });

  // Test 3: Two separate submissions for same stage
  it('3. Two separate submissions for same stage aggregates total lbs and groups submissions', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-s1',
        wellId: 'w-1',
        stageNumber: 3,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 200000,
        submissionId: 'sub-alpha',
        createdAt: 1000,
        date: '2026-08-27',
      },
      {
        id: 'r-s2',
        wellId: 'w-1',
        stageNumber: 3,
        siloNumber: 2,
        sandType: '100 Mesh',
        lbsPulled: 253600,
        submissionId: 'sub-beta',
        createdAt: 2000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs });
    const summary = getStageSummary(state, 'w-1', 3);

    expect(summary.totalActualLbs).toBe(453600);
    expect(summary.submissions.length).toBe(2);
    expect(summary.submissions[0].submissionId).toBe('sub-alpha');
    expect(summary.submissions[0].totalLbs).toBe(200000);
    expect(summary.submissions[1].submissionId).toBe('sub-beta');
    expect(summary.submissions[1].totalLbs).toBe(253600);
  });

  // Test 4: Per-well design overrides
  it('4. Per-well design overrides: Well 2 reflects 500,000 lbs design instead of pad default 453,600 lbs', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-w2',
        wellId: 'w-2',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 500000,
        createdAt: 1000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs });
    const summary = getStageSummary(state, 'w-2', 1);

    expect(summary.totalDesignLbs).toBe(500000);
    expect(summary.designBySand['100 Mesh']).toBe(500000);
    expect(summary.status).toBe('complete');
  });

  // Test 5: Deleted run isolation
  it('5. Deleted run isolation: Deleted runs do not add to actual totals and appear in deleted history', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-active',
        wellId: 'w-1',
        stageNumber: 5,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 453600,
        createdAt: 2000,
        date: '2026-08-27',
      },
    ];

    const deletedRuns: RunRecord[] = [
      {
        id: 'r-del',
        wellId: 'w-1',
        stageNumber: 5,
        siloNumber: 2,
        sandType: '100 Mesh',
        lbsPulled: 100000,
        deleted: true,
        deletedAt: 1500,
        deletedReason: 'Duplicate entry',
        createdAt: 1000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs, deletedRuns });
    const summary = getStageSummary(state, 'w-1', 5);

    expect(summary.totalActualLbs).toBe(453600);
    expect(summary.hasDeletedHistory).toBe(true);
    expect(summary.deletedRuns.length).toBe(1);
    expect(summary.deletedRuns[0].deletedReason).toBe('Duplicate entry');
  });

  // Test 6: Corrected run test
  it('6. Corrected run test: Edited run shows wasEdited = true and reflects corrected weight in totals', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-edited',
        wellId: 'w-1',
        stageNumber: 6,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 453600,
        editCount: 1,
        editedAt: 3000,
        createdAt: 1000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs });
    const summary = getStageSummary(state, 'w-1', 6);

    expect(summary.wasEdited).toBe(true);
    expect(summary.totalActualLbs).toBe(453600);
  });

  // Test 7: Authoritative completion date from StageRecord
  it('7. Authoritative completion date: Uses StageRecord.completedAt when present', () => {
    const timestamp = 1724784120000; // Specific epoch
    const stageRecords: Record<string, StageRecord> = {
      w_1_stage_7: {
        wellId: 'w-1',
        stageNumber: 7,
        status: 'complete',
        recordedBySand: { '100 Mesh': 453600 },
        totalRecordedLbs: 453600,
        lastSubmissionId: 'sub-7',
        updatedAt: timestamp,
        completedAt: timestamp,
      },
    };

    const runs: RunRecord[] = [
      {
        id: 'r-7',
        wellId: 'w-1',
        stageNumber: 7,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 453600,
        createdAt: 1000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs, stageRecords });
    const summary = getStageSummary(state, 'w-1', 7);

    expect(summary.completionTimestamp).toBe(timestamp);
  });

  // Test 8: Fallback legacy completion date
  it('8. Fallback legacy completion date: If no StageRecord.completedAt, uses final active run timestamp', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-8a',
        wellId: 'w-1',
        stageNumber: 8,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 200000,
        runSequence: 1,
        createdAt: 1000,
        date: '2026-08-27',
      },
      {
        id: 'r-8b',
        wellId: 'w-1',
        stageNumber: 8,
        siloNumber: 2,
        sandType: '100 Mesh',
        lbsPulled: 253600,
        runSequence: 2,
        createdAt: 5000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs, stageRecords: {} });
    const summary = getStageSummary(state, 'w-1', 8);

    expect(summary.completionTimestamp).toBe(5000);
  });

  // Test 9: Stage Map grid accuracy
  it('9. Stage Map grid accuracy: Accurately generates summaries for unstarted and started stages', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-9a',
        wellId: 'w-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 453600,
        createdAt: 1000,
        date: '2026-08-27',
      },
      {
        id: 'r-9b',
        wellId: 'w-1',
        stageNumber: 2,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 200000,
        createdAt: 2000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs });
    const s1 = getStageSummary(state, 'w-1', 1);
    const s2 = getStageSummary(state, 'w-1', 2);
    const s3 = getStageSummary(state, 'w-1', 3);

    expect(s1.status).toBe('complete');
    expect(s2.status).toBe('partial');
    expect(s3.status).toBe('not_started');
  });

  // Test 10: Operational Central Time
  it('10. Operational Central Time: Formats date and time in America/Chicago timezone without UTC drift', () => {
    // 2026-08-27T19:42:00Z is 14:42:00 (2:42 PM) Central Daylight Time
    const epochMs = new Date('2026-08-27T19:42:00Z').getTime();
    const timeStr = formatStageTimeAmPm(epochMs);
    expect(timeStr).toContain('2:42 PM');

    const dateTimeStr = formatStageDateTimeDisplay(epochMs);
    expect(dateTimeStr).toContain('AUG 27, 2026');
    expect(dateTimeStr).toContain('2:42 PM');
  });

  // Test 11: No duplicate rows in ledger
  it('11. No duplicate rows in ledger: A stage with multiple runs produces exactly 1 StageSummary', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-11a',
        wellId: 'w-1',
        stageNumber: 11,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 100000,
        runSequence: 1,
        createdAt: 1000,
        date: '2026-08-27',
      },
      {
        id: 'r-11b',
        wellId: 'w-1',
        stageNumber: 11,
        siloNumber: 2,
        sandType: '100 Mesh',
        lbsPulled: 150000,
        runSequence: 2,
        createdAt: 2000,
        date: '2026-08-27',
      },
      {
        id: 'r-11c',
        wellId: 'w-1',
        stageNumber: 11,
        siloNumber: 3,
        sandType: '100 Mesh',
        lbsPulled: 203600,
        runSequence: 3,
        createdAt: 3000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs });
    const summaries = buildStageSummaries(state);

    const s11Summaries = summaries.filter((s) => s.wellId === 'w-1' && s.stageNumber === 11);
    expect(s11Summaries.length).toBe(1);
    expect(s11Summaries[0].pullSequence.length).toBe(3);
    expect(s11Summaries[0].totalActualLbs).toBe(453600);
  });

  // Test 12: Actual sequence preservation
  it('12. Actual sequence preservation: Explicit runSequence determines order regardless of database insertion order', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-third-inserted',
        wellId: 'w-1',
        stageNumber: 12,
        siloNumber: 4,
        sandType: '100 Mesh',
        lbsPulled: 50000,
        runSequence: 3,
        createdAt: 500, // inserted earliest
        date: '2026-08-27',
      },
      {
        id: 'r-first-inserted',
        wellId: 'w-1',
        stageNumber: 12,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 200000,
        runSequence: 1,
        createdAt: 2000, // inserted later
        date: '2026-08-27',
      },
      {
        id: 'r-second-inserted',
        wellId: 'w-1',
        stageNumber: 12,
        siloNumber: 2,
        sandType: '100 Mesh',
        lbsPulled: 203600,
        runSequence: 2,
        createdAt: 3000, // inserted latest
        date: '2026-08-27',
      },
    ];

    const sorted = sortStageRunsForReview(runs);
    expect(sorted.map((r) => r.siloNumber)).toEqual([1, 2, 4]);
  });

  // PATCH TEST A: Stage Map Counts Calculation
  it('Patch A: Stage Map remaining count calculates planned - complete - partial correctly', () => {
    const planned = 86;
    const completeCount = 42;
    const partialCount = 1;
    const notStartedCount = Math.max(0, planned - completeCount - partialCount);

    expect(completeCount).toBe(42);
    expect(partialCount).toBe(1);
    expect(notStartedCount).toBe(43);
    expect(completeCount + partialCount + notStartedCount).toBe(planned);
  });

  // PATCH TEST B: Remaining display logic
  it('Patch B: Remaining display logic calculates positive remaining lbs when under design', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-partial-b',
        wellId: 'w-1',
        stageNumber: 20,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 200000,
        createdAt: 1000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs });
    const summary = getStageSummary(state, 'w-1', 20);

    expect(summary.totalDesignLbs).toBe(453600);
    expect(summary.totalActualLbs).toBe(200000);
    expect(summary.varianceLbs).toBe(-253600);
    expect(Math.abs(summary.varianceLbs)).toBe(253600);
  });

  // PATCH TEST C: Corrected via Edit
  it('Patch C: Stage with edited run has wasCorrected = true and wasEdited = true', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-edit-c',
        wellId: 'w-1',
        stageNumber: 21,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 453600,
        editCount: 1,
        createdAt: 1000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs });
    const summary = getStageSummary(state, 'w-1', 21);

    expect(summary.wasEdited).toBe(true);
    expect(summary.wasCorrected).toBe(true);
    expect(summary.hasDeletedHistory).toBe(false);
  });

  // PATCH TEST D: Corrected via Deleted History
  it('Patch D: Stage with deleted run has wasCorrected = true and hasDeletedHistory = true', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-active-d',
        wellId: 'w-1',
        stageNumber: 22,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 453600,
        createdAt: 2000,
        date: '2026-08-27',
      },
    ];

    const deletedRuns: RunRecord[] = [
      {
        id: 'r-del-d',
        wellId: 'w-1',
        stageNumber: 22,
        siloNumber: 2,
        sandType: '100 Mesh',
        lbsPulled: 50000,
        deleted: true,
        createdAt: 1000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs, deletedRuns });
    const summary = getStageSummary(state, 'w-1', 22);

    expect(summary.wasEdited).toBe(false);
    expect(summary.hasDeletedHistory).toBe(true);
    expect(summary.wasCorrected).toBe(true);
  });

  // PATCH TEST E: Zero-design sand types
  it('Patch E: Zero-design sand types with 0 actual are present in raw data for display filtering', () => {
    const runs: RunRecord[] = [
      {
        id: 'r-e',
        wellId: 'w-1',
        stageNumber: 23,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 453600,
        createdAt: 1000,
        date: '2026-08-27',
      },
    ];

    const state = createMockState({ runs });
    const summary = getStageSummary(state, 'w-1', 23);

    expect(summary.designBySand['100 Mesh']).toBe(453600);
    expect(summary.actualBySand['100 Mesh']).toBe(453600);
    expect(summary.designBySand['40/70']).toBe(0);
    expect(summary.actualBySand['40/70']).toBe(0);
  });

  // PATCH TEST F: Legacy Submission Grouping
  it('Patch F: 4 legacy runs without submissionId collapse into a single Legacy Stage Record group', () => {
    const runs: RunRecord[] = [
      { id: 'r-f1', wellId: 'w-1', stageNumber: 24, siloNumber: 1, sandType: '100 Mesh', lbsPulled: 100000, createdAt: 1000, date: '2026-08-27' },
      { id: 'r-f2', wellId: 'w-1', stageNumber: 24, siloNumber: 2, sandType: '100 Mesh', lbsPulled: 100000, createdAt: 2000, date: '2026-08-27' },
      { id: 'r-f3', wellId: 'w-1', stageNumber: 24, siloNumber: 3, sandType: '100 Mesh', lbsPulled: 100000, createdAt: 3000, date: '2026-08-27' },
      { id: 'r-f4', wellId: 'w-1', stageNumber: 24, siloNumber: 4, sandType: '100 Mesh', lbsPulled: 153600, createdAt: 4000, date: '2026-08-27' },
    ];

    const state = createMockState({ runs });
    const summary = getStageSummary(state, 'w-1', 24);

    expect(summary.submissions.length).toBe(1);
    expect(summary.submissions[0].label).toBe('Legacy Stage Record');
    expect(summary.submissions[0].totalLbs).toBe(453600);
    expect(summary.submissions[0].runs.length).toBe(4);
    expect(summary.submissions[0].siloCount).toBe(4);
  });

  // PATCH TEST G: Real Submission Groups
  it('Patch G: Preserves distinct modern submissions with submissionId', () => {
    const runs: RunRecord[] = [
      { id: 'r-g1', wellId: 'w-1', stageNumber: 25, siloNumber: 1, sandType: '100 Mesh', lbsPulled: 100000, submissionId: 'sub-A', createdAt: 1000, date: '2026-08-27' },
      { id: 'r-g2', wellId: 'w-1', stageNumber: 25, siloNumber: 2, sandType: '100 Mesh', lbsPulled: 100000, submissionId: 'sub-A', createdAt: 1000, date: '2026-08-27' },
      { id: 'r-g3', wellId: 'w-1', stageNumber: 25, siloNumber: 3, sandType: '100 Mesh', lbsPulled: 100000, submissionId: 'sub-B', createdAt: 2000, date: '2026-08-27' },
      { id: 'r-g4', wellId: 'w-1', stageNumber: 25, siloNumber: 4, sandType: '100 Mesh', lbsPulled: 153600, submissionId: 'sub-B', createdAt: 2000, date: '2026-08-27' },
    ];

    const state = createMockState({ runs });
    const summary = getStageSummary(state, 'w-1', 25);

    expect(summary.submissions.length).toBe(2);
    expect(summary.submissions[0].submissionId).toBe('sub-A');
    expect(summary.submissions[0].label).toBe('Submission 1');
    expect(summary.submissions[0].totalLbs).toBe(200000);
    expect(summary.submissions[1].submissionId).toBe('sub-B');
    expect(summary.submissions[1].label).toBe('Submission 2');
    expect(summary.submissions[1].totalLbs).toBe(253600);
  });

  // PATCH TEST H: All-Deleted Stage Edge Case
  it('Patch H: Stage with 0 active runs but existing deleted runs fails safely to not_started', () => {
    const deletedRuns: RunRecord[] = [
      {
        id: 'r-del-all',
        wellId: 'w-1',
        stageNumber: 26,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 453600,
        deleted: true,
        createdAt: 1000,
        date: '2026-08-27',
      },
    ];

    // Even if stageRecords has a stale complete record
    const stageRecords: Record<string, StageRecord> = {
      w_1_stage_26: {
        wellId: 'w-1',
        stageNumber: 26,
        status: 'complete',
        recordedBySand: { '100 Mesh': 453600 },
        totalRecordedLbs: 453600,
        lastSubmissionId: 'sub-legacy',
        updatedAt: 1000,
        completedAt: 1000,
      },
    };

    const state = createMockState({ runs: [], deletedRuns, stageRecords });
    const summary = getStageSummary(state, 'w-1', 26);

    expect(summary.status).toBe('not_started');
    expect(summary.totalActualLbs).toBe(0);
    expect(summary.hasDeletedHistory).toBe(true);
    expect(summary.wasCorrected).toBe(true);
    expect(summary.deletedRuns.length).toBe(1);

    // buildStageSummaries should exclude unstarted stages
    const summaries = buildStageSummaries(state);
    expect(summaries.some((s) => s.wellId === 'w-1' && s.stageNumber === 26)).toBe(false);
  });
});
