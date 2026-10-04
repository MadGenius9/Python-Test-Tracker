import { describe, it, expect } from 'vitest';
import { AppState, DeliveryTicket, RunRecord, PadConfig } from '../types';
import {
  calculateReconciliation,
  buildShiftHandoffSnapshot,
} from './reconciliation';

const defaultTestPadConfig: PadConfig = {
  padName: 'Rattlesnake Pad A',
  customerName: 'EOG Resources',
  siloCount: 6,
  lbsPerTruckload: 57000,
  lbsPerTon: 2000,
  drawStrategy: 'sequential_rotation',
  partialThresholdPct: 0.75,
  reorderThresholdStages: 5,
  autoAdvanceWellStage: true,
  clearManualPriorityAfterStage: true,
  sandTypes: [
    { id: 'st-1', name: '100 Mesh', perStageDesignLbs: 350000, colorCategory: 'amber' },
    { id: 'st-2', name: '40/70', perStageDesignLbs: 100000, colorCategory: 'emerald' },
  ],
  wells: [
    { id: 'well-1', name: '1803WC', plannedStages: 50 },
  ],
  silos: [
    { siloNumber: 1, sandType: '100 Mesh', side: 'A', maxCapacityLbs: 350000, isOutOfService: false, startingBalanceLbs: 0, manualPriority: null },
    { siloNumber: 2, sandType: '100 Mesh', side: 'A', maxCapacityLbs: 350000, isOutOfService: false, startingBalanceLbs: 0, manualPriority: null },
    { siloNumber: 3, sandType: '40/70', side: 'A', maxCapacityLbs: 350000, isOutOfService: false, startingBalanceLbs: 0, manualPriority: null },
    { siloNumber: 4, sandType: '40/70', side: 'B', maxCapacityLbs: 350000, isOutOfService: false, startingBalanceLbs: 0, manualPriority: null },
    { siloNumber: 5, sandType: '100 Mesh', side: 'B', maxCapacityLbs: 350000, isOutOfService: false, startingBalanceLbs: 0, manualPriority: null },
    { siloNumber: 6, sandType: '100 Mesh', side: 'B', maxCapacityLbs: 350000, isOutOfService: false, startingBalanceLbs: 0, manualPriority: null },
  ],
};

function createMockState(overrides?: Partial<AppState>): AppState {
  return {
    padId: 'test-pad-1',
    status: 'ready',
    config: defaultTestPadConfig,
    deliveries: [],
    runs: [],
    stageRecords: [],
    deletedDeliveries: [],
    deletedRuns: [],
    ...overrides,
  };
}

describe('Reconciliation Engine', () => {
  it('reconciles cleanly with 0 variance when delivered equals pumped plus silo balances', () => {
    // 500,000 delivered to Silo 1
    const deliveries: DeliveryTicket[] = [
      {
        id: 't-1',
        ticketNumber: '10001',
        siloNumber: 1,
        sandType: '100 Mesh',
        lbs: 500000,
        supplier: 'Atlas Sand',
        date: '2026-08-31',
        createdAt: 1000,
      },
    ];

    // 350,000 pumped from Silo 1 (leaves 150,000 in Silo 1)
    const runs: RunRecord[] = [
      {
        id: 'r-1',
        wellId: 'well-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 350000,
        runSequence: 1,
        date: '2026-08-31',
        createdAt: 2000,
      },
    ];

    const state = createMockState({
      config: {
        ...defaultTestPadConfig,
        sandTypes: [
          { id: 'st-1', name: '100 Mesh', perStageDesignLbs: 350000, colorCategory: 'amber' },
        ],
      },
      deliveries,
      runs,
    });
    const summary = calculateReconciliation(state);

    expect(summary.totalDeliveredLbs).toBe(500000);
    expect(summary.totalPumpedLbs).toBe(350000);
    expect(summary.totalExpectedOnLocationLbs).toBe(150000);
    expect(summary.totalSiloInventoryLbs).toBe(150000);
    expect(summary.totalVarianceLbs).toBe(0);
    expect(summary.varianceDisplay).toBe('0 LB RECONCILED');
    expect(summary.overallStatus).toBe('reconciled');
  });

  it('detects negative silo balances and flags status as needs_review', () => {
    // 100,000 delivered to Silo 1
    const deliveries: DeliveryTicket[] = [
      {
        id: 't-1',
        ticketNumber: '10001',
        siloNumber: 1,
        sandType: '100 Mesh',
        lbs: 100000,
        supplier: 'Atlas Sand',
        date: '2026-08-31',
        createdAt: 1000,
      },
    ];

    // 150,000 pumped from Silo 1 (leads to -50,000 on hand)
    const runs: RunRecord[] = [
      {
        id: 'r-1',
        wellId: 'well-1',
        stageNumber: 1,
        siloNumber: 1,
        sandType: '100 Mesh',
        lbsPulled: 150000,
        runSequence: 1,
        date: '2026-08-31',
        createdAt: 2000,
      },
    ];

    const state = createMockState({ deliveries, runs });
    const summary = calculateReconciliation(state);

    const silo1 = summary.siloSummaries.find((s) => s.siloNumber === 1);
    expect(silo1?.isNegative).toBe(true);
    expect(silo1?.onHandLbs).toBe(-50000);
    expect(summary.overallStatus).toBe('needs_review');
  });

  it('accurately isolates partial stages and determines the correct resume silo', () => {
    // Design is 350,000 lbs. Only 200,000 was pulled from Silo 6.
    const deliveries: DeliveryTicket[] = [
      {
        id: 't-1',
        ticketNumber: '10001',
        siloNumber: 6,
        sandType: '100 Mesh',
        lbs: 300000,
        supplier: 'Atlas Sand',
        date: '2026-08-31',
        createdAt: 1000,
      },
    ];

    const runs: RunRecord[] = [
      {
        id: 'r-1',
        wellId: 'well-1',
        stageNumber: 10,
        siloNumber: 6,
        sandType: '100 Mesh',
        lbsPulled: 200000,
        runSequence: 1,
        date: '2026-08-31',
        createdAt: 2000,
      },
    ];

    const state = createMockState({ deliveries, runs });
    const summary = calculateReconciliation(state);

    expect(summary.partialStages.length).toBe(1);
    const partial = summary.partialStages[0];
    expect(partial.wellName).toBe('1803WC');
    expect(partial.stageNumber).toBe(10);
    expect(partial.actualRecordedLbs).toBe(200000);
    expect(partial.designLbs).toBe(450000);
    expect(partial.remainingLbs).toBe(250000);
    expect(partial.resumeSilo).toBe(6);
    expect(partial.pullSequence.length).toBe(1);
    expect(partial.pullSequence[0].siloNumber).toBe(6);
  });

  it('correctly audits tickets and handles deleted vs active tickets', () => {
    const deliveries: DeliveryTicket[] = [
      {
        id: 't-1',
        ticketNumber: '10001',
        siloNumber: 1,
        sandType: '100 Mesh',
        lbs: 50000,
        supplier: 'Atlas Sand',
        date: '2026-08-31',
        createdAt: 1000,
      },
      {
        id: 't-2',
        ticketNumber: '10002',
        siloNumber: 1,
        sandType: '100 Mesh',
        lbs: 50000,
        supplier: 'Atlas Sand',
        deleted: true,
        deletedReason: 'Duplicate entry',
        date: '2026-08-31',
        createdAt: 1100,
      },
      {
        id: 't-3',
        ticketNumber: '10003',
        siloNumber: 2,
        sandType: '100 Mesh',
        lbs: 50000,
        supplier: 'Atlas Sand',
        editedAt: 1200,
        editCount: 1,
        date: '2026-08-31',
        createdAt: 1050,
      },
    ];

    const state = createMockState({ deliveries });
    const summary = calculateReconciliation(state);

    expect(summary.ticketAudit.activeCount).toBe(2);
    expect(summary.ticketAudit.deletedCount).toBe(1);
    expect(summary.ticketAudit.correctedCount).toBe(1);
    // Deleted tickets are excluded from delivered totals
    expect(summary.totalDeliveredLbs).toBe(100000);
  });

  it('builds an immutable shift handoff snapshot with all required properties', () => {
    const deliveries: DeliveryTicket[] = [
      {
        id: 't-1',
        ticketNumber: '10001',
        siloNumber: 1,
        sandType: '100 Mesh',
        lbs: 100000,
        supplier: 'Atlas Sand',
        date: '2026-08-31',
        createdAt: 1000,
      },
    ];

    const state = createMockState({ deliveries });
    const snapshot = buildShiftHandoffSnapshot(state, 'Testing shift handoff notes', 'C. Overby');

    expect(snapshot.id).toBeDefined();
    expect(snapshot.padId).toBe('test-pad-1');
    expect(snapshot.padName).toBe('Rattlesnake Pad A');
    expect(snapshot.createdBy).toBe('C. Overby');
    expect(snapshot.notes).toBe('Testing shift handoff notes');
    expect(snapshot.totalDeliveredLbs).toBe(100000);
    expect(snapshot.siloSnapshot.length).toBe(6);
    expect(snapshot.rotationSnapshot.nextStartSilo).toBeDefined();
  });
});
