import { describe, it, expect } from 'vitest';
import {
  calculateSiloOnHandForSand,
  calculateSandTypeTotalOnHand,
  computeRunOrders,
  getAuthoritativeRotationPointer,
  buildPadSiloSequence,
  getNextNumericalSilo,
  getNextWellAndStage,
  getEffectivePerStageDesign,
  getSiloDerivedStates,
  sortStageRunsByActualSequence,
  formatLbs,
  formatLbsNumber,
  formatTons,
  calculateStagePace,
  calculateProjectedFinish,
  isStageComplete,
  getTrustedPaceCompletionTimestamp,
} from './sandRules';
import { addOperationalDays, formatForecastDateDisplay, getOperationalDate } from './dateUtils';
import { AppState, SiloConfig, PadConfig, WellConfig, RunRecord, StageRecord } from '../types';

const defaultPadConfig: PadConfig = {
  padName: 'Test Pad Alpha',
  customerName: 'Test Operator',
  siloCount: 6,
  lbsPerTruckload: 57000,
  lbsPerTon: 2000,
  drawStrategy: 'sequential_rotation',
  partialThresholdPct: 0.75,
  reorderThresholdStages: 5,
  autoAdvanceWellStage: true,
  clearManualPriorityAfterStage: true,
  sandTypes: [
    { id: 'st-1', name: '100 mesh', perStageDesignLbs: 453600, colorCategory: 'amber' },
    { id: 'st-2', name: '40/70', perStageDesignLbs: 100000, colorCategory: 'emerald' },
  ],
  wells: [
    { id: 'w-1', name: 'Well 1H', plannedStages: 40 },
    { id: 'w-2', name: 'Well 2H', plannedStages: 40 },
  ],
  silos: [
    { siloNumber: 1, sandType: '100 mesh', side: 'A', maxCapacityLbs: 350000, startingBalanceLbs: 0, manualPriority: null, isOutOfService: false },
    { siloNumber: 2, sandType: '100 mesh', side: 'A', maxCapacityLbs: 350000, startingBalanceLbs: 0, manualPriority: null, isOutOfService: false },
    { siloNumber: 3, sandType: '100 mesh', side: 'A', maxCapacityLbs: 350000, startingBalanceLbs: 0, manualPriority: null, isOutOfService: false },
    { siloNumber: 4, sandType: '100 mesh', side: 'B', maxCapacityLbs: 350000, startingBalanceLbs: 0, manualPriority: null, isOutOfService: false },
    { siloNumber: 5, sandType: '100 mesh', side: 'B', maxCapacityLbs: 350000, startingBalanceLbs: 0, manualPriority: null, isOutOfService: false },
    { siloNumber: 6, sandType: '100 mesh', side: 'B', maxCapacityLbs: 350000, startingBalanceLbs: 0, manualPriority: null, isOutOfService: false },
  ],
};

function createMockState(overrides?: Partial<AppState>): AppState {
  return {
    padId: 'test-pad-1',
    config: { ...defaultPadConfig, ...overrides?.config },
    deliveries: overrides?.deliveries || [],
    runs: overrides?.runs || [],
    stageRecords: overrides?.stageRecords,
    deletedDeliveries: overrides?.deletedDeliveries || [],
    deletedRuns: overrides?.deletedRuns || [],
  };
}

describe('Sand Tracker - Core Inventory & Balance Math', () => {
  it('calculates silo on-hand correctly including starting balance, deliveries, and runs', () => {
    const state = createMockState({
      config: {
        ...defaultPadConfig,
        silos: defaultPadConfig.silos.map((s) =>
          s.siloNumber === 1 ? { ...s, startingBalanceLbs: 50000 } : s
        ),
      },
      deliveries: [
        { id: 'd1', ticketNumber: 'T-101', siloNumber: 1, sandType: '100 mesh', lbs: 55000, date: '2026-08-25', supplier: 'Atlas', deleted: false, createdAt: 1000 },
        { id: 'd2', ticketNumber: 'T-102', siloNumber: 1, sandType: '100 mesh', lbs: 54000, date: '2026-08-25', supplier: 'Atlas', deleted: true, createdAt: 2000 }, // soft deleted
      ],
      runs: [
        { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 40000, date: '2026-08-25', deleted: false, createdAt: 3000 },
      ],
    });

    const onHand = calculateSiloOnHandForSand(1, '100 mesh', state);
    expect(onHand).toBe(65000);
  });

  it('preserves true negative balances when runs exceed on-hand', () => {
    const state = createMockState({
      deliveries: [
        { id: 'd1', ticketNumber: 'T-101', siloNumber: 1, sandType: '100 mesh', lbs: 50000, date: '2026-08-25', supplier: 'Atlas', deleted: false, createdAt: 1000 },
      ],
      runs: [
        { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 60000, date: '2026-08-25', deleted: false, createdAt: 2000 },
      ],
    });

    const onHand = calculateSiloOnHandForSand(1, '100 mesh', state);
    expect(onHand).toBe(-10000);
  });

  it('calculates pad-wide total on hand per sand type', () => {
    const state = createMockState({
      deliveries: [
        { id: 'd1', ticketNumber: 'T-1', siloNumber: 1, sandType: '100 mesh', lbs: 50000, date: '2026-08-25', supplier: 'Atlas', deleted: false, createdAt: 1000 },
        { id: 'd2', ticketNumber: 'T-2', siloNumber: 2, sandType: '100 mesh', lbs: 50000, date: '2026-08-25', supplier: 'Atlas', deleted: false, createdAt: 2000 },
        { id: 'd3', ticketNumber: 'T-3', siloNumber: 3, sandType: '40/70', lbs: 45000, date: '2026-08-25', supplier: 'Atlas', deleted: false, createdAt: 3000 },
      ],
      runs: [
        { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 20000, date: '2026-08-25', deleted: false, createdAt: 4000 },
      ],
    });

    expect(calculateSandTypeTotalOnHand('100 mesh', state)).toBe(80000);
    expect(calculateSandTypeTotalOnHand('40/70', state)).toBe(45000);
  });
});

describe('Sand Tracker - Authoritative Silo Rotation ("FINISH PARTIALS THEN ROTATE")', () => {
  it('Fresh start begins circularly from Silo 1', () => {
    const silos = defaultPadConfig.silos;
    const derivedMap = new Map([
      [1, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [2, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [3, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [4, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [5, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [6, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
    ]);

    const runOrders = computeRunOrders(silos, derivedMap, 'sequential_rotation', 0.75);
    expect(runOrders.get(1)).toBe(1);
    expect(runOrders.get(2)).toBe(2);
    expect(runOrders.get(3)).toBe(3);
    expect(runOrders.get(4)).toBe(4);
    expect(runOrders.get(5)).toBe(5);
    expect(runOrders.get(6)).toBe(6);
  });

  // TEST 1 — Finish partial then continue
  it('Test 1 — Finish partial then continue: Pulls Silo 2 (137,160), Silo 3 (311,400), Silo 4 (5,040), leaving Silo 4 partial -> Next stage starts at Silo 4', () => {
    // Inventory setup:
    // Silo 1 = 300,000, Silo 2 = 137,160, Silo 3 = 311,400, Silo 4 = 297,160, Silo 5 = 300,000, Silo 6 = 300,000
    // Stage 1 planned from pointer Silo 2:
    // Stage requires 453,600 lb.
    // Silo 2 pulled: 137,160 (exhausted to 0)
    // Silo 3 pulled: 311,400 (exhausted to 0)
    // Silo 4 pulled: 5,040 (remaining = 292,120)
    const stateAfterStage1 = createMockState({
      config: {
        ...defaultPadConfig,
        silos: defaultPadConfig.silos.map((s) => {
          if (s.siloNumber === 1) return { ...s, startingBalanceLbs: 300000 };
          if (s.siloNumber === 2) return { ...s, startingBalanceLbs: 137160 };
          if (s.siloNumber === 3) return { ...s, startingBalanceLbs: 311400 };
          if (s.siloNumber === 4) return { ...s, startingBalanceLbs: 297160 };
          if (s.siloNumber === 5) return { ...s, startingBalanceLbs: 300000 };
          if (s.siloNumber === 6) return { ...s, startingBalanceLbs: 300000 };
          return s;
        }),
      },
      runs: [
        { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 2, sandType: '100 mesh', lbsPulled: 137160, date: '2026-08-25', deleted: false, createdAt: 1000 },
        { id: 'r2', wellId: 'w-1', stageNumber: 1, siloNumber: 3, sandType: '100 mesh', lbsPulled: 311400, date: '2026-08-25', deleted: false, createdAt: 2000 },
        { id: 'r3', wellId: 'w-1', stageNumber: 1, siloNumber: 4, sandType: '100 mesh', lbsPulled: 5040, date: '2026-08-25', deleted: false, createdAt: 3000 },
      ],
    });

    // Check on-hand for Silo 4
    const silo4OnHand = calculateSiloOnHandForSand(4, '100 mesh', stateAfterStage1);
    expect(silo4OnHand).toBe(292120);

    // For Stage 2, the authoritative rotation pointer must be Silo 4!
    const nextPointer = getAuthoritativeRotationPointer(stateAfterStage1, 'w-1', 2, '100 mesh');
    expect(nextPointer).toBe(4);

    // Derived map for Stage 2
    const derivedMapStage2 = new Map([
      [1, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [2, { onHandLbs: 0, runToDateLbs: 137160, capacityLbs: 350000 }],
      [3, { onHandLbs: 0, runToDateLbs: 311400, capacityLbs: 350000 }],
      [4, { onHandLbs: 292120, runToDateLbs: 5040, capacityLbs: 350000 }],
      [5, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [6, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
    ]);

    const runOrdersStage2 = computeRunOrders(
      defaultPadConfig.silos,
      derivedMapStage2,
      'sequential_rotation',
      0.75,
      stateAfterStage1,
      'w-1',
      2,
      '100 mesh'
    );

    // Run order for Stage 2 must start at Silo 4!
    expect(runOrdersStage2.get(4)).toBe(1);
    expect(runOrdersStage2.get(5)).toBe(2);
    expect(runOrdersStage2.get(6)).toBe(3);
    expect(runOrdersStage2.get(1)).toBe(4);
    expect(runOrdersStage2.has(2)).toBe(false); // 0 lbs on hand
    expect(runOrdersStage2.has(3)).toBe(false); // 0 lbs on hand
  });

  // TEST 2 — Do not choose fullest
  it('Test 2 — Do not choose fullest: Never skips to fuller silos (S4/S5) when rotating from S2', () => {
    // Current pointer is Silo 2
    // S2 = 100,000, S3 = 120,000, S4 = 390,000, S5 = 390,000
    // Stage requirement = 453,600 lb
    // Pull sequence must be: Silo 2 (100k) -> Silo 3 (120k) -> Silo 4 (233.6k).
    // Silo 5 is not pulled even though it is full.
    const state = createMockState({
      config: {
        ...defaultPadConfig,
        silos: defaultPadConfig.silos.map((s) => {
          if (s.siloNumber === 2) return { ...s, startingBalanceLbs: 100000, manualPriority: 1 };
          if (s.siloNumber === 3) return { ...s, startingBalanceLbs: 120000 };
          if (s.siloNumber === 4) return { ...s, startingBalanceLbs: 390000 };
          if (s.siloNumber === 5) return { ...s, startingBalanceLbs: 390000 };
          return { ...s, startingBalanceLbs: 0 };
        }),
      },
    });

    const derivedMap = new Map([
      [2, { onHandLbs: 100000, runToDateLbs: 0, capacityLbs: 390000 }],
      [3, { onHandLbs: 120000, runToDateLbs: 0, capacityLbs: 390000 }],
      [4, { onHandLbs: 390000, runToDateLbs: 0, capacityLbs: 390000 }],
      [5, { onHandLbs: 390000, runToDateLbs: 0, capacityLbs: 390000 }],
    ]);

    const runOrders = computeRunOrders(
      state.config.silos,
      derivedMap,
      'sequential_rotation',
      0.75,
      state,
      'w-1',
      1,
      '100 mesh'
    );

    // Sequence must be strictly 2 -> 3 -> 4 -> 5
    expect(runOrders.get(2)).toBe(1);
    expect(runOrders.get(3)).toBe(2);
    expect(runOrders.get(4)).toBe(3);
    expect(runOrders.get(5)).toBe(4);
  });

  // TEST 3 — Exact empty advances
  it('Test 3 — Exact empty advances: If Silo 5 is emptied exactly to 0, next stage starts at Silo 6', () => {
    const state = createMockState({
      config: {
        ...defaultPadConfig,
        silos: defaultPadConfig.silos.map((s) => {
          if (s.siloNumber === 4) return { ...s, startingBalanceLbs: 86000 };
          if (s.siloNumber === 5) return { ...s, startingBalanceLbs: 300000 };
          if (s.siloNumber === 6) return { ...s, startingBalanceLbs: 300000 };
          return s;
        }),
      },
      runs: [
        { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 4, sandType: '100 mesh', lbsPulled: 86000, date: '2026-08-25', deleted: false, createdAt: 1000 },
        { id: 'r2', wellId: 'w-1', stageNumber: 1, siloNumber: 5, sandType: '100 mesh', lbsPulled: 300000, date: '2026-08-25', deleted: false, createdAt: 2000 },
      ],
    });

    // S4 and S5 are now 0 lbs
    expect(calculateSiloOnHandForSand(4, '100 mesh', state)).toBe(0);
    expect(calculateSiloOnHandForSand(5, '100 mesh', state)).toBe(0);

    // Rotation pointer for next stage must be Silo 6!
    const nextPointer = getAuthoritativeRotationPointer(state, 'w-1', 2, '100 mesh');
    expect(nextPointer).toBe(6);
  });

  // TEST 4 — Last silo remains partial
  it('Test 4 — Last silo remains partial: Stage pulls S5 (188,000) and S6 (265,600), leaving S6 with 46,100 -> Next stage starts at Silo 6 (does NOT jump to 1)', () => {
    const state = createMockState({
      config: {
        ...defaultPadConfig,
        silos: defaultPadConfig.silos.map((s) => {
          if (s.siloNumber === 5) return { ...s, startingBalanceLbs: 188000 };
          if (s.siloNumber === 6) return { ...s, startingBalanceLbs: 311700 };
          return s;
        }),
      },
      runs: [
        { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 5, sandType: '100 mesh', lbsPulled: 188000, date: '2026-08-25', deleted: false, createdAt: 1000 },
        { id: 'r2', wellId: 'w-1', stageNumber: 1, siloNumber: 6, sandType: '100 mesh', lbsPulled: 265600, date: '2026-08-25', deleted: false, createdAt: 2000 },
      ],
    });

    expect(calculateSiloOnHandForSand(5, '100 mesh', state)).toBe(0);
    expect(calculateSiloOnHandForSand(6, '100 mesh', state)).toBe(46100);

    const nextPointer = getAuthoritativeRotationPointer(state, 'w-1', 2, '100 mesh');
    expect(nextPointer).toBe(6);
  });

  // TEST 5 — Wrap 6 to 1
  it('Test 5 — Wrap 6 to 1: Stage pulls S6 (100,000) and S1 (353,600), leaving S1 with 46,400 -> Next stage starts at Silo 1', () => {
    const state = createMockState({
      config: {
        ...defaultPadConfig,
        silos: defaultPadConfig.silos.map((s) => {
          if (s.siloNumber === 1) return { ...s, startingBalanceLbs: 400000 };
          if (s.siloNumber === 6) return { ...s, startingBalanceLbs: 100000 };
          return s;
        }),
      },
      runs: [
        { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 6, sandType: '100 mesh', lbsPulled: 100000, date: '2026-08-25', deleted: false, createdAt: 1000 },
        { id: 'r2', wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 353600, date: '2026-08-25', deleted: false, createdAt: 2000 },
      ],
    });

    expect(calculateSiloOnHandForSand(6, '100 mesh', state)).toBe(0);
    expect(calculateSiloOnHandForSand(1, '100 mesh', state)).toBe(46400);

    const nextPointer = getAuthoritativeRotationPointer(state, 'w-1', 2, '100 mesh');
    expect(nextPointer).toBe(1);
  });

  // WELL 1803WC STAGE 49 ACTUAL PULL
  it('Well 1803WC Stage 49: Pulls S6 (219,600 lb) and S1 (234,000 lb) totaling 453,600 lb -> Next rotation starts at Silo 1', () => {
    const state = createMockState({
      config: {
        ...defaultPadConfig,
        sandTypes: [{ id: 'st-1', name: '100 Mesh', perStageDesignLbs: 453600, colorCategory: 'amber' }],
        wells: [{ id: 'w-1803wc', name: 'WELL 1803WC', plannedStages: 60 }],
        silos: defaultPadConfig.silos.map((s) => {
          if (s.siloNumber === 6) return { ...s, sandType: '100 Mesh', startingBalanceLbs: 219600 };
          if (s.siloNumber === 1) return { ...s, sandType: '100 Mesh', startingBalanceLbs: 350000 };
          return { ...s, sandType: '100 Mesh', startingBalanceLbs: 350000 };
        }),
      },
      runs: [
        {
          id: 'r-49-1',
          wellId: 'w-1803wc',
          stageNumber: 49,
          siloNumber: 6,
          sandType: '100 Mesh',
          lbsPulled: 219600,
          date: '2026-08-27',
          deleted: false,
          createdAt: 1724784000000,
        },
        {
          id: 'r-49-2',
          wellId: 'w-1803wc',
          stageNumber: 49,
          siloNumber: 1,
          sandType: '100 Mesh',
          lbsPulled: 234000,
          date: '2026-08-27',
          deleted: false,
          createdAt: 1724784001000,
        },
      ],
    });

    // Total pumped
    const stage49Runs = state.runs.filter((r) => r.stageNumber === 49 && !r.deleted);
    const totalPumped = stage49Runs.reduce((sum, r) => sum + r.lbsPulled, 0);
    expect(totalPumped).toBe(453600);

    // Silo 6 is now empty (219,600 - 219,600 = 0)
    expect(calculateSiloOnHandForSand(6, '100 Mesh', state)).toBe(0);

    // Silo 1 has remaining sand (350,000 - 234,000 = 116,000)
    expect(calculateSiloOnHandForSand(1, '100 Mesh', state)).toBe(116000);

    // Next stage rotation starts at Silo 1 because Silo 1 was the last pulled and has remaining balance
    const nextPointer = getAuthoritativeRotationPointer(state, 'w-1803wc', 50, '100 Mesh');
    expect(nextPointer).toBe(1);
  });

  // TEST 6 — Skip empty silos
  it('Test 6 — Skip empty silos: When starting from Silo 3, but S3 and S4 are empty, pulls S5 then S6', () => {
    const derivedMap = new Map([
      [1, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [2, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [3, { onHandLbs: 0, runToDateLbs: 0, capacityLbs: 350000 }], // Empty
      [4, { onHandLbs: 0, runToDateLbs: 0, capacityLbs: 350000 }], // Empty
      [5, { onHandLbs: 200000, runToDateLbs: 0, capacityLbs: 350000 }],
      [6, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
    ]);

    // Force rotation starting pointer at 3 via manualPriority on 3 (or previous run on 2)
    const silosWithOverride = defaultPadConfig.silos.map((s) =>
      s.siloNumber === 3 ? { ...s, manualPriority: 1 } : s
    );

    const runOrders = computeRunOrders(
      silosWithOverride,
      derivedMap,
      'sequential_rotation',
      0.75
    );

    // Empty silos 3 & 4 are skipped from active pull list. S5 is #1, S6 is #2, S1 is #3, S2 is #4
    expect(runOrders.has(3)).toBe(false);
    expect(runOrders.has(4)).toBe(false);
    expect(runOrders.get(5)).toBe(1);
    expect(runOrders.get(6)).toBe(2);
    expect(runOrders.get(1)).toBe(3);
    expect(runOrders.get(2)).toBe(4);
  });

  // FIELD SCENARIO — Manual overrides behave as stage-specific overrides
  it('Field Scenario: Manual override on Silo 2 and 3 sets pull sequence 2 -> 3 -> 4 -> 5 -> 6 -> 1', () => {
    const silos: SiloConfig[] = defaultPadConfig.silos.map((s) => {
      if (s.siloNumber === 2) return { ...s, manualPriority: 1 };
      if (s.siloNumber === 3) return { ...s, manualPriority: 2 };
      return { ...s, manualPriority: null };
    });

    const derivedMap = new Map([
      [1, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [2, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [3, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [4, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [5, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [6, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
    ]);

    const runOrders = computeRunOrders(silos, derivedMap, 'sequential_rotation', 0.75);
    expect(runOrders.get(2)).toBe(1);
    expect(runOrders.get(3)).toBe(2);
    expect(runOrders.get(4)).toBe(3);
    expect(runOrders.get(5)).toBe(4);
    expect(runOrders.get(6)).toBe(5);
    expect(runOrders.get(1)).toBe(6);
  });

  it('excludes out-of-service silos from pull rotation', () => {
    const silos: SiloConfig[] = defaultPadConfig.silos.map((s) => {
      if (s.siloNumber === 2) return { ...s, isOutOfService: true };
      return s;
    });

    const derivedMap = new Map([
      [1, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [2, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
      [3, { onHandLbs: 300000, runToDateLbs: 0, capacityLbs: 350000 }],
    ]);

    const runOrders = computeRunOrders(silos, derivedMap, 'sequential_rotation', 0.75);
    expect(runOrders.has(2)).toBe(false);
    expect(runOrders.get(1)).toBe(1);
    expect(runOrders.get(3)).toBe(2);
  });
});

describe('Sand Tracker - Zipper Workflow & Next Stage Progression', () => {
  const singleSandPad: PadConfig = {
    ...defaultPadConfig,
    sandTypes: [{ id: 'st-1', name: '100 mesh', perStageDesignLbs: 300000, colorCategory: 'amber' }],
  };

  it('advances sequentially in a single-well pad', () => {
    const singleWellPad: PadConfig = {
      ...singleSandPad,
      wells: [{ id: 'w-1', name: 'Well 1H', plannedStages: 40 }],
    };

    const state = createMockState({
      config: singleWellPad,
      runs: [
        { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 300000, date: '2026-08-25', deleted: false, createdAt: 1000 },
        { id: 'r2', wellId: 'w-1', stageNumber: 2, siloNumber: 2, sandType: '100 mesh', lbsPulled: 300000, date: '2026-08-25', deleted: false, createdAt: 2000 },
      ],
    });

    const next = getNextWellAndStage(state);
    expect(next?.wellId).toBe('w-1');
    expect(next?.stageNumber).toBe(3);
  });

  it('zips between alternating wells (Well 1H Stage 1 -> Well 2H Stage 1 -> Well 1H Stage 2)', () => {
    // Case 1: No runs yet -> Well 1 Stage 1
    const state0 = createMockState({ config: singleSandPad });
    expect(getNextWellAndStage(state0)).toEqual({ wellId: 'w-1', stageNumber: 1 });

    // Case 2: Well 1 Stage 1 finished -> Next is Well 2 Stage 1
    const state1 = createMockState({
      config: singleSandPad,
      runs: [
        { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 300000, date: '2026-08-25', deleted: false, createdAt: 1000 },
      ],
    });
    expect(getNextWellAndStage(state1, 'w-1')).toEqual({ wellId: 'w-2', stageNumber: 1 });

    // Case 3: Both Well 1 and Well 2 finished Stage 1, last ran was Well 2 -> Next is Well 1 Stage 2
    const state2 = createMockState({
      config: singleSandPad,
      runs: [
        { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 300000, date: '2026-08-25', deleted: false, createdAt: 1000 },
        { id: 'r2', wellId: 'w-2', stageNumber: 1, siloNumber: 2, sandType: '100 mesh', lbsPulled: 300000, date: '2026-08-25', deleted: false, createdAt: 2000 },
      ],
    });
    expect(getNextWellAndStage(state2, 'w-2')).toEqual({ wellId: 'w-1', stageNumber: 2 });
  });
});

describe('Sand Tracker - Formatting Utilities', () => {
  it('formats lbs and tons cleanly', () => {
    expect(formatLbs(300000)).toBe('300,000 lbs');
    expect(formatLbsNumber(300000)).toBe('300,000');
    expect(formatTons(150.25)).toBe('150.3 Tons');
  });
});

describe('Sand Tracker - Per-Well Stage Design Overrides', () => {
  const sandType100 = defaultPadConfig.sandTypes[0]; // 453,600 lbs default
  const sandType4070 = defaultPadConfig.sandTypes[1]; // 100,000 lbs default

  it('falls back to sandSpec default design when well has no override', () => {
    const wellWithoutOverride: WellConfig = { id: 'w-1', name: 'Well 1H', plannedStages: 40 };
    expect(getEffectivePerStageDesign(wellWithoutOverride, sandType100)).toBe(453600);
    expect(getEffectivePerStageDesign(undefined, sandType100)).toBe(453600);
  });

  it('uses well design override when specified for sand type', () => {
    const wellWithOverride: WellConfig = {
      id: 'w-2',
      name: 'Well 2H (Heavy)',
      plannedStages: 40,
      perStageDesignOverrides: {
        '100 mesh': 550000,
        '40/70': 75000,
      },
    };

    expect(getEffectivePerStageDesign(wellWithOverride, sandType100)).toBe(550000);
    expect(getEffectivePerStageDesign(wellWithOverride, sandType4070)).toBe(75000);
  });

  it('computes silo derived planned pulls using well-specific overrides', () => {
    const customConfig: PadConfig = {
      ...defaultPadConfig,
      wells: [
        {
          id: 'w-override',
          name: 'Override Well',
          plannedStages: 40,
          perStageDesignOverrides: {
            '100 mesh': 200000, // lower than 453,600
          },
        },
      ],
      silos: defaultPadConfig.silos.map((s) => ({
        ...s,
        startingBalanceLbs: 300000,
      })),
    };

    const state = createMockState({ config: customConfig });
    const derived = getSiloDerivedStates(state, 'w-override', 1);

    const pullSilos = derived.filter((s) => s.plannedPullLbs > 0);
    const totalPlannedPull = pullSilos.reduce((sum, s) => sum + s.plannedPullLbs, 0);

    expect(totalPlannedPull).toBe(200000);
  });
});

describe('Sand Tracker - Two-Sand Stages', () => {
  it('allocates pull correctly when pad uses two distinct sand types', () => {
    const twoSandPadConfig: PadConfig = {
      ...defaultPadConfig,
      sandTypes: [
        { id: 'st-1', name: '100 mesh', perStageDesignLbs: 300000, colorCategory: 'amber' },
        { id: 'st-2', name: '40/70', perStageDesignLbs: 100000, colorCategory: 'emerald' },
      ],
      silos: [
        { siloNumber: 1, sandType: '100 mesh', side: 'A', maxCapacityLbs: 350000, startingBalanceLbs: 200000, manualPriority: null, isOutOfService: false },
        { siloNumber: 2, sandType: '100 mesh', side: 'A', maxCapacityLbs: 350000, startingBalanceLbs: 200000, manualPriority: null, isOutOfService: false },
        { siloNumber: 3, sandType: '40/70', side: 'A', maxCapacityLbs: 350000, startingBalanceLbs: 150000, manualPriority: null, isOutOfService: false },
        { siloNumber: 4, sandType: '40/70', side: 'B', maxCapacityLbs: 350000, startingBalanceLbs: 150000, manualPriority: null, isOutOfService: false },
      ],
    };

    const state = createMockState({ config: twoSandPadConfig });
    const derived = getSiloDerivedStates(state, 'w-1', 1);

    const mesh100Pulled = derived
      .filter((s) => s.sandType === '100 mesh')
      .reduce((sum, s) => sum + s.plannedPullLbs, 0);

    const mesh4070Pulled = derived
      .filter((s) => s.sandType === '40/70')
      .reduce((sum, s) => sum + s.plannedPullLbs, 0);

    expect(mesh100Pulled).toBe(300000);
    expect(mesh4070Pulled).toBe(100000);
  });
});

describe('Sand Tracker - Run Sequence Ordering', () => {
  it('sorts runs deterministically by runSequence then createdAt', () => {
    const runs: RunRecord[] = [
      { id: 'r3', wellId: 'w-1', stageNumber: 1, siloNumber: 3, sandType: '100 mesh', lbsPulled: 50000, runSequence: 3, createdAt: 3000, date: '2026-08-25', deleted: false },
      { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 50000, runSequence: 1, createdAt: 1000, date: '2026-08-25', deleted: false },
      { id: 'r2', wellId: 'w-1', stageNumber: 1, siloNumber: 2, sandType: '100 mesh', lbsPulled: 50000, runSequence: 2, createdAt: 2000, date: '2026-08-25', deleted: false },
    ];

    const sorted = sortStageRunsByActualSequence(runs);
    expect(sorted.map((r) => r.siloNumber)).toEqual([1, 2, 3]);
  });
});

describe('Sand Tracker - Stage Pace & Projected Pad Finish Date', () => {
  it('correctly calculates Central Time date arithmetic across month and year boundaries', () => {
    expect(addOperationalDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addOperationalDays('2026-08-31', 8)).toBe('2026-09-08');
    expect(addOperationalDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addOperationalDays('2028-02-28', 1)).toBe('2028-02-29'); // Leap year 2028
  });

  it('formats forecast date displays with and without weekday', () => {
    expect(formatForecastDateDisplay('2026-09-08', false)).toBe('SEP 8, 2026');
    expect(formatForecastDateDisplay('2026-09-08', true)).toContain('SEP 8, 2026');
    expect(formatForecastDateDisplay(null)).toBe('');
  });

  it('counts only complete stages and leaves partial stages in remaining', () => {
    // Well 1H: 40 stages planned. Stage 1 is complete (453,600 lbs 100 mesh + 100,000 lbs 40/70)
    // Stage 2 is partial (200,000 lbs 100 mesh)
    const state = createMockState({
      config: {
        ...defaultPadConfig,
        wells: [{ id: 'w-1', name: 'Well 1H', plannedStages: 40 }],
      },
      runs: [
        { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 453600, createdAt: 1000, date: '2026-08-28', deleted: false },
        { id: 'r2', wellId: 'w-1', stageNumber: 1, siloNumber: 3, sandType: '40/70', lbsPulled: 100000, createdAt: 2000, date: '2026-08-28', deleted: false },
        { id: 'r3', wellId: 'w-1', stageNumber: 2, siloNumber: 1, sandType: '100 mesh', lbsPulled: 200000, createdAt: 3000, date: '2026-08-29', deleted: false }, // partial
      ],
    });

    expect(isStageComplete(state, 'w-1', 1)).toBe(true);
    expect(isStageComplete(state, 'w-1', 2)).toBe(false);

    const paceStats = calculateStagePace(state, '2026-08-29');
    expect(paceStats.totalCompletedStages).toBe(1);
    expect(paceStats.totalRemainingStages).toBe(39);
    expect(paceStats.totalPlannedStages).toBe(40);
  });

  it('groups completed stages by America/Chicago date using completion timestamp', () => {
    // 2 completed stages on 2026-08-28, 3 completed stages on 2026-08-29, 4 completed stages on 2026-08-30
    // Design is single sand: 100k
    const simplePadConfig: PadConfig = {
      ...defaultPadConfig,
      sandTypes: [{ id: 'st-1', name: '100 mesh', perStageDesignLbs: 100000, colorCategory: 'amber' }],
      wells: [{ id: 'w-1', name: 'Well 1H', plannedStages: 20 }],
    };

    // Construct timestamps in Central Time (UTC-5 in Daylight Saving Time: 17:00 UTC = 12:00 CDT)
    const aug28 = new Date('2026-08-28T17:00:00Z').getTime();
    const aug29 = new Date('2026-08-29T17:00:00Z').getTime();
    const aug30 = new Date('2026-08-30T17:00:00Z').getTime();

    const runs: RunRecord[] = [
      // Aug 28: Stage 1, Stage 2
      { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 100000, createdAt: aug28, date: '2026-08-28', deleted: false },
      { id: 'r2', wellId: 'w-1', stageNumber: 2, siloNumber: 1, sandType: '100 mesh', lbsPulled: 100000, createdAt: aug28 + 1000, date: '2026-08-28', deleted: false },

      // Aug 29: Stage 3, Stage 4, Stage 5
      { id: 'r3', wellId: 'w-1', stageNumber: 3, siloNumber: 1, sandType: '100 mesh', lbsPulled: 100000, createdAt: aug29, date: '2026-08-29', deleted: false },
      { id: 'r4', wellId: 'w-1', stageNumber: 4, siloNumber: 1, sandType: '100 mesh', lbsPulled: 100000, createdAt: aug29 + 1000, date: '2026-08-29', deleted: false },
      { id: 'r5', wellId: 'w-1', stageNumber: 5, siloNumber: 1, sandType: '100 mesh', lbsPulled: 100000, createdAt: aug29 + 2000, date: '2026-08-29', deleted: false },

      // Aug 30: Stage 6, Stage 7, Stage 8, Stage 9
      { id: 'r6', wellId: 'w-1', stageNumber: 6, siloNumber: 1, sandType: '100 mesh', lbsPulled: 100000, createdAt: aug30, date: '2026-08-30', deleted: false },
      { id: 'r7', wellId: 'w-1', stageNumber: 7, siloNumber: 1, sandType: '100 mesh', lbsPulled: 100000, createdAt: aug30 + 1000, date: '2026-08-30', deleted: false },
      { id: 'r8', wellId: 'w-1', stageNumber: 8, siloNumber: 1, sandType: '100 mesh', lbsPulled: 100000, createdAt: aug30 + 2000, date: '2026-08-30', deleted: false },
      { id: 'r9', wellId: 'w-1', stageNumber: 9, siloNumber: 1, sandType: '100 mesh', lbsPulled: 100000, createdAt: aug30 + 3000, date: '2026-08-30', deleted: false },
    ];

    const stageRecords: Record<string, StageRecord> = {};
    for (let stg = 1; stg <= 9; stg++) {
      const time = stg <= 2 ? aug28 : stg <= 5 ? aug29 : aug30;
      stageRecords[`w-1_stage_${stg}`] = {
        wellId: 'w-1',
        stageNumber: stg,
        status: 'complete',
        recordedBySand: { '100 mesh': 100000 },
        totalRecordedLbs: 100000,
        completedAt: time,
        completionTimestampSource: 'live',
      };
    }

    const state = createMockState({ config: simplePadConfig, runs, stageRecords });
    const paceStats = calculateStagePace(state, '2026-08-31');

    expect(paceStats.totalCompletedStages).toBe(9);
    expect(paceStats.totalPumpingDays).toBe(3);
    // Last 3 pumping days: (2 + 3 + 4) / 3 = 3.0 stages/day
    expect(paceStats.recentAverageStagesPerDay).toBe(3.0);
    expect(paceStats.daysUsedForRecentAverage).toBe(3);
    expect(paceStats.jobAverageStagesPerDay).toBe(3.0);
  });

  it('calculates projected finish date accurately based on remaining stages and pace', () => {
    // 79 stages remaining at 9.7 stages/day
    // 79 / 9.7 = 8.144 days -> ceil = 9 calendar days
    // If today is 2026-08-30 -> 2026-08-30 + 9 days = 2026-09-08
    const forecast = calculateProjectedFinish(79, 9.7, '2026-08-30');
    expect(forecast.projectedDaysRemaining).toBeCloseTo(8.144, 2);
    expect(forecast.calendarDays).toBe(9);
    expect(forecast.finishDate).toBe('2026-09-08');
    expect(forecast.isComplete).toBe(false);
  });

  it('handles 0 remaining stages and handles 0 pace gracefully', () => {
    const completedForecast = calculateProjectedFinish(0, 10, '2026-08-31');
    expect(completedForecast.isComplete).toBe(true);
    expect(completedForecast.projectedDaysRemaining).toBe(0);
    expect(completedForecast.finishDate).toBe('2026-08-31');

    const zeroPaceForecast = calculateProjectedFinish(20, 0, '2026-08-31');
    expect(zeroPaceForecast.isComplete).toBe(false);
    expect(zeroPaceForecast.finishDate).toBeNull();
    expect(zeroPaceForecast.projectedDaysRemaining).toBeNull();
  });

  it('counts multi-silo single stage as exactly 1 completed stage', () => {
    const simplePadConfig: PadConfig = {
      ...defaultPadConfig,
      sandTypes: [{ id: 'st-1', name: '100 mesh', perStageDesignLbs: 300000, colorCategory: 'amber' }],
      wells: [{ id: 'w-1', name: 'Well 1H', plannedStages: 10 }],
    };

    const aug30 = new Date('2026-08-30T17:00:00Z').getTime();

    // Stage 1 pulled from Silo 1 (150k) and Silo 2 (150k) = 300k total (complete)
    const runs: RunRecord[] = [
      { id: 'r1', wellId: 'w-1', stageNumber: 1, siloNumber: 1, sandType: '100 mesh', lbsPulled: 150000, createdAt: aug30, date: '2026-08-30', deleted: false },
      { id: 'r2', wellId: 'w-1', stageNumber: 1, siloNumber: 2, sandType: '100 mesh', lbsPulled: 150000, createdAt: aug30 + 100, date: '2026-08-30', deleted: false },
    ];

    const state = createMockState({ config: simplePadConfig, runs });
    const paceStats = calculateStagePace(state, '2026-08-30');

    expect(paceStats.totalCompletedStages).toBe(1);
    expect(paceStats.totalRemainingStages).toBe(9);
  });

  it('StageRecord correction scenario: Stage completed Aug 28 -> corrected to partial -> re-completed Aug 31', () => {
    const padConfig: PadConfig = {
      ...defaultPadConfig,
      sandTypes: [{ id: 'st-1', name: '100 mesh', perStageDesignLbs: 300000, colorCategory: 'amber' }],
      wells: [{ id: 'w-1', name: 'Well 1803WC', plannedStages: 50 }],
    };

    const aug28Time = new Date('2026-08-28T18:00:00Z').getTime();
    const aug31Time = new Date('2026-08-31T18:00:00Z').getTime();

    // 1. Initial State: Stage 49 completed on Aug 28
    const stage49RecordInitial: StageRecord = {
      wellId: 'w-1',
      stageNumber: 49,
      status: 'complete',
      recordedBySand: { '100 mesh': 300000 },
      totalRecordedLbs: 300000,
      lastSubmissionId: 'sub-1',
      updatedAt: aug28Time,
      completedAt: aug28Time,
      completionTimestampSource: 'live',
    };

    const initialRun: RunRecord = {
      id: 'run-1',
      date: '2026-08-28',
      wellId: 'w-1',
      stageNumber: 49,
      siloNumber: 1,
      sandType: '100 mesh',
      lbsPulled: 300000,
      createdAt: aug28Time,
      deleted: false,
    };

    let state = createMockState({
      config: padConfig,
      runs: [initialRun],
      stageRecords: {
        'w-1_stage_49': stage49RecordInitial,
      },
    });

    let paceStats = calculateStagePace(state, '2026-08-31');
    expect(paceStats.totalCompletedStages).toBe(1);
    let aug28Count = paceStats.dailyCounts.find((d) => d.date === '2026-08-28')?.count || 0;
    let aug31Count = paceStats.dailyCounts.find((d) => d.date === '2026-08-31')?.count || 0;
    expect(aug28Count).toBe(1);
    expect(aug31Count).toBe(0);

    // 2. Correction: Stage 49 changed to PARTIAL (e.g. run deleted or lbs reduced)
    const stage49RecordPartial: StageRecord = {
      wellId: 'w-1',
      stageNumber: 49,
      status: 'partial',
      recordedBySand: { '100 mesh': 150000 },
      totalRecordedLbs: 150000,
      lastSubmissionId: 'sub-2',
      updatedAt: aug29Time(aug28Time),
      completedAt: null,
    };

    const partialRun: RunRecord = {
      id: 'run-1',
      date: '2026-08-28',
      wellId: 'w-1',
      stageNumber: 49,
      siloNumber: 1,
      sandType: '100 mesh',
      lbsPulled: 150000,
      createdAt: aug28Time,
      deleted: false,
    };

    state = createMockState({
      config: padConfig,
      runs: [partialRun],
      stageRecords: {
        'w-1_stage_49': stage49RecordPartial,
      },
    });

    paceStats = calculateStagePace(state, '2026-08-31');
    expect(paceStats.totalCompletedStages).toBe(0);
    aug28Count = paceStats.dailyCounts.find((d) => d.date === '2026-08-28')?.count || 0;
    aug31Count = paceStats.dailyCounts.find((d) => d.date === '2026-08-31')?.count || 0;
    expect(aug28Count).toBe(0);
    expect(aug31Count).toBe(0);

    // 3. Stage 49 completed again on Aug 31
    const stage49RecordRecompleted: StageRecord = {
      wellId: 'w-1',
      stageNumber: 49,
      status: 'complete',
      recordedBySand: { '100 mesh': 300000 },
      totalRecordedLbs: 300000,
      lastSubmissionId: 'sub-3',
      updatedAt: aug31Time,
      completedAt: aug31Time,
      completionTimestampSource: 'correction',
    };

    const recompletedRun: RunRecord = {
      id: 'run-2',
      date: '2026-08-31',
      wellId: 'w-1',
      stageNumber: 49,
      siloNumber: 1,
      sandType: '100 mesh',
      lbsPulled: 300000,
      createdAt: aug31Time,
      deleted: false,
    };

    state = createMockState({
      config: padConfig,
      runs: [recompletedRun],
      stageRecords: {
        'w-1_stage_49': stage49RecordRecompleted,
      },
    });

    paceStats = calculateStagePace(state, '2026-08-31');
    expect(paceStats.totalCompletedStages).toBe(1);
    expect(paceStats.totalRemainingStages).toBe(49);
    aug28Count = paceStats.dailyCounts.find((d) => d.date === '2026-08-28')?.count || 0;
    aug31Count = paceStats.dailyCounts.find((d) => d.date === '2026-08-31')?.count || 0;
    // Aug 31 gets +1 completed stage, Aug 28 does NOT continue receiving it
    expect(aug31Count).toBe(1);
    expect(aug28Count).toBe(0);
  });

  it('Live update: Stage Progress updates automatically when stageRecords status/completedAt changes', () => {
    const padConfig: PadConfig = {
      ...defaultPadConfig,
      sandTypes: [{ id: 'st-1', name: '100 mesh', perStageDesignLbs: 200000, colorCategory: 'amber' }],
      wells: [{ id: 'w-1', name: 'Well 1H', plannedStages: 10 }],
    };

    const initialStageRecords: Record<string, StageRecord> = {};
    const state = createMockState({
      config: padConfig,
      runs: [],
      stageRecords: initialStageRecords,
    });

    let pace = calculateStagePace(state, '2026-08-31');
    expect(pace.totalCompletedStages).toBe(0);

    // Live update received from another client: Stage 1 completed
    const updatedStageRecords: Record<string, StageRecord> = {
      'w-1_stage_1': {
        wellId: 'w-1',
        stageNumber: 1,
        status: 'complete',
        recordedBySand: { '100 mesh': 200000 },
        totalRecordedLbs: 200000,
        lastSubmissionId: 'sub-remote',
        updatedAt: new Date('2026-08-31T15:00:00Z').getTime(),
        completedAt: new Date('2026-08-31T15:00:00Z').getTime(),
        completionTimestampSource: 'live',
      },
    };

    const liveUpdatedRun: RunRecord = {
      id: 'run-live-1',
      date: '2026-08-31',
      wellId: 'w-1',
      stageNumber: 1,
      siloNumber: 1,
      sandType: '100 mesh',
      lbsPulled: 200000,
      createdAt: new Date('2026-08-31T15:00:00Z').getTime(),
      deleted: false,
    };

    const liveUpdatedState = {
      ...state,
      runs: [liveUpdatedRun],
      stageRecords: updatedStageRecords,
    };

    pace = calculateStagePace(liveUpdatedState, '2026-08-31');
    expect(pace.totalCompletedStages).toBe(1);
    expect(pace.totalRemainingStages).toBe(9);
    const todayCount = pace.dailyCounts.find((d) => d.date === '2026-08-31')?.count || 0;
    expect(todayCount).toBe(1);
  });

  it('getTrustedPaceCompletionTimestamp strict allow-list verification', () => {
    const mockRecord = (source?: any, status = 'complete', time = 1700000000000): StageRecord => ({
      wellId: 'w-1',
      stageNumber: 1,
      status: status as any,
      completedAt: time,
      completionTimestampSource: source,
    });

    expect(getTrustedPaceCompletionTimestamp(mockRecord('history_backfill'))).toBeNull();
    expect(getTrustedPaceCompletionTimestamp(mockRecord('backfill'))).toBeNull();
    expect(getTrustedPaceCompletionTimestamp(mockRecord('imported_legacy'))).toBeNull();
    expect(getTrustedPaceCompletionTimestamp(mockRecord(undefined))).toBeNull();
    expect(getTrustedPaceCompletionTimestamp(mockRecord('live'))).toBe(1700000000000);
    expect(getTrustedPaceCompletionTimestamp(mockRecord('correction'))).toBe(1700000000000);
    expect(getTrustedPaceCompletionTimestamp(mockRecord('live', 'partial'))).toBeNull();
    expect(getTrustedPaceCompletionTimestamp(mockRecord('live', 'complete', 0))).toBeNull();
  });
});

describe('Sand Tracker - Smarter Adaptive Stage Cycle Forecasting Engine (Test Cases A–H)', () => {
  const basePadConfig: PadConfig = {
    ...defaultPadConfig,
    sandTypes: [{ id: 'st-1', name: '100 mesh', perStageDesignLbs: 300000, colorCategory: 'amber' }],
    wells: [{ id: 'w-1', name: 'Well 1H', plannedStages: 30 }],
  };

  // Helper to create sequential completed stages with explicit intervals
  function createTimedStages(
    intervalsHours: number[],
    startTime = new Date('2026-08-30T06:00:00Z').getTime()
  ) {
    let currentTime = startTime;
    const stageRecords: Record<string, StageRecord> = {};
    const runs: RunRecord[] = [];

    // Stage 1 completed at startTime
    stageRecords['w-1_stage_1'] = {
      wellId: 'w-1',
      stageNumber: 1,
      status: 'complete',
      recordedBySand: { '100 mesh': 300000 },
      totalRecordedLbs: 300000,
      completedAt: currentTime,
      completionTimestampSource: 'live',
    };
    runs.push({
      id: 'r-1',
      wellId: 'w-1',
      stageNumber: 1,
      siloNumber: 1,
      sandType: '100 mesh',
      lbsPulled: 300000,
      createdAt: currentTime,
      date: '2026-08-30',
      deleted: false,
    });

    // Following stages
    for (let i = 0; i < intervalsHours.length; i++) {
      const stageNum = i + 2;
      currentTime += intervalsHours[i] * 3600 * 1000;
      stageRecords[`w-1_stage_${stageNum}`] = {
        wellId: 'w-1',
        stageNumber: stageNum,
        status: 'complete',
        recordedBySand: { '100 mesh': 300000 },
        totalRecordedLbs: 300000,
        completedAt: currentTime,
        completionTimestampSource: 'live',
      };
      runs.push({
        id: `r-${stageNum}`,
        wellId: 'w-1',
        stageNumber: stageNum,
        siloNumber: 1,
        sandType: '100 mesh',
        lbsPulled: 300000,
        createdAt: currentTime,
        date: '2026-08-30',
        deleted: false,
      });
    }

    return { stageRecords, runs, lastCompletionTime: currentTime };
  }

  // TEST CASE A: Baseline Adaptive Cycle
  it('Test Case A: Baseline Adaptive Cycle calculates exact hours per stage and projected finish', () => {
    // 9 intervals of 2.0 hours = 10 completed stages
    const intervals = [2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0];
    const { stageRecords, runs, lastCompletionTime } = createTimedStages(intervals);

    const state = createMockState({
      config: basePadConfig,
      stageRecords,
      runs,
    });

    const paceStats = calculateStagePace(state, '2026-08-30');
    expect(paceStats.totalCompletedStages).toBe(10);
    expect(paceStats.adaptiveStageCycleHours).toBeCloseTo(2.0, 2);
    expect(paceStats.adaptiveStagesPerDay).toBeCloseTo(12.0, 1);
    expect(paceStats.confidence).toBe('HIGH');

    // 20 remaining stages at 2.0 hours/stage = 40.0 hours remaining
    const forecast = calculateProjectedFinish(20, {
      mode: 'adaptive',
      stagePaceStats: paceStats,
      asOfTimestamp: lastCompletionTime,
    }, state);

    expect(forecast.effectiveHoursPerStage).toBeCloseTo(2.0, 2);
    expect(forecast.projectedHoursRemaining).toBeCloseTo(40.0, 1);
    expect(forecast.projectedDaysRemaining).toBeCloseTo(40.0 / 24, 2);
    expect(forecast.projectedFinishTimestamp).toBe(lastCompletionTime + 40 * 3600 * 1000);
    expect(forecast.confidence).toBe('HIGH');
  });

  // TEST CASE B: Outlier Downtime Exclusion
  it('Test Case B: Outlier Downtime Exclusion filters out 11.5h maintenance event in Adaptive mode', () => {
    // 8 normal 2.0h cycles + 1 long 11.5h downtime cycle
    const intervals = [2.0, 2.1, 2.0, 2.2, 11.5, 2.0, 2.1, 2.0];
    const { stageRecords, runs, lastCompletionTime } = createTimedStages(intervals);

    const state = createMockState({
      config: basePadConfig,
      stageRecords,
      runs,
    });

    const paceStats = calculateStagePace(state, '2026-08-30');
    expect(paceStats.outlierCount).toBe(1);
    expect(paceStats.extendedDowntimeNote).toContain('11h 30m');
    // Adaptive cycle excludes 11.5h, so average remains near ~2.06h
    expect(paceStats.adaptiveStageCycleHours).toBeLessThan(2.3);
    expect(paceStats.adaptiveStageCycleHours).toBeGreaterThan(1.9);

    // Verify rolling 24h is slower because it includes the downtime
    expect(paceStats.rolling24hStagesPerDay).toBeLessThan(paceStats.adaptiveStagesPerDay!);
  });

  // TEST CASE C: In-Progress Active Stage Deduction
  it('Test Case C: In-Progress Active Stage accurately deducts partial stage progress', () => {
    const intervals = [2.0, 2.0, 2.0, 2.0];
    const { stageRecords, runs, lastCompletionTime } = createTimedStages(intervals);

    // Add partial run for active stage (Stage 6): 150,000 lbs out of 300,000 design (50%)
    runs.push({
      id: 'r-6-partial',
      wellId: 'w-1',
      stageNumber: 6,
      siloNumber: 1,
      sandType: '100 mesh',
      lbsPulled: 150000,
      createdAt: lastCompletionTime + 3600 * 1000,
      date: '2026-08-30',
      deleted: false,
    });

    const state = createMockState({
      config: basePadConfig,
      stageRecords,
      runs,
    });

    const paceStats = calculateStagePace(state, '2026-08-30');
    expect(paceStats.currentActiveStageDetail).not.toBeNull();
    expect(paceStats.currentActiveStageDetail?.fractionComplete).toBeCloseTo(0.5, 2);
    expect(paceStats.currentActiveStageDetail?.fractionRemaining).toBeCloseTo(0.5, 2);

    // Total remaining stages for well = 30 - 5 completed = 25 remaining
    // Active stage deduction: 0.5 of active stage + 24 unstarted stages = 24.5 effective stages
    // At 2.0h/stage -> 24.5 * 2.0 = 49.0 hours remaining (instead of 25 * 2.0 = 50.0h)
    const forecast = calculateProjectedFinish(25, {
      mode: 'adaptive',
      stagePaceStats: paceStats,
      asOfTimestamp: lastCompletionTime,
    }, state);

    expect(forecast.projectedHoursRemaining).toBeCloseTo(49.0, 1);
  });

  // TEST CASE D: Low Sample Size Fallbacks
  it('Test Case D: Low Sample Size Fallbacks handle 0 stages, 1 stage, and few cycles gracefully', () => {
    // 0 stages
    const emptyState = createMockState({ config: basePadConfig });
    const emptyPace = calculateStagePace(emptyState, '2026-08-30');
    expect(emptyPace.confidence).toBe('LOW');
    expect(emptyPace.adaptiveStageCycleHours).toBeNull();

    const emptyForecast = calculateProjectedFinish(30, {
      mode: 'adaptive',
      stagePaceStats: emptyPace,
    }, emptyState);
    expect(emptyForecast.finishDate).toBeNull();
    expect(emptyForecast.confidence).toBe('LOW');

    // 1 completed stage (0 cycle transitions)
    const { stageRecords, runs } = createTimedStages([]);
    const singleStageState = createMockState({
      config: basePadConfig,
      stageRecords,
      runs,
    });
    const singlePace = calculateStagePace(singleStageState, '2026-08-30');
    expect(singlePace.totalCompletedStages).toBe(1);
    expect(singlePace.stageCycles.length).toBe(0);
    expect(singlePace.confidence).toBe('LOW');
  });

  // TEST CASE E: Mode Comparison & Switching
  it('Test Case E: Mode Comparison correctly resolves between Adaptive, Rolling 24h, 3D, 7D, and Manual', () => {
    const intervals = [2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0];
    const { stageRecords, runs, lastCompletionTime } = createTimedStages(intervals);

    const state = createMockState({
      config: basePadConfig,
      stageRecords,
      runs,
    });
    const paceStats = calculateStagePace(state, '2026-08-30');

    // Adaptive mode
    const adaptive = calculateProjectedFinish(10, { mode: 'adaptive', stagePaceStats: paceStats }, state);
    expect(adaptive.effectiveHoursPerStage).toBeCloseTo(2.0, 1);

    // Rolling 24h mode
    const rolling = calculateProjectedFinish(10, { mode: 'rolling_24h', stagePaceStats: paceStats }, state);
    expect(rolling.stagesPerDay).toBeGreaterThan(0);

    // Recent 3d mode
    const recent3d = calculateProjectedFinish(10, { mode: 'recent_3d', stagePaceStats: paceStats }, state);
    expect(recent3d.stagesPerDay).toBeGreaterThan(0);

    // Recent 7d mode
    const recent7d = calculateProjectedFinish(10, { mode: 'recent_7d', stagePaceStats: paceStats }, state);
    expect(recent7d.stagesPerDay).toBeGreaterThan(0);

    // Manual mode with stages/day
    const manualPace = calculateProjectedFinish(10, {
      mode: 'manual',
      manualStagesPerDay: 8.0,
      stagePaceStats: paceStats,
    }, state);
    expect(manualPace.effectiveHoursPerStage).toBeCloseTo(3.0, 1);
    expect(manualPace.projectedHoursRemaining).toBeCloseTo(30.0, 1);

    // Manual mode with hours/stage
    const manualCycle = calculateProjectedFinish(10, {
      mode: 'manual',
      manualHoursPerStage: 2.5,
      stagePaceStats: paceStats,
    }, state);
    expect(manualCycle.effectiveHoursPerStage).toBeCloseTo(2.5, 1);
    expect(manualCycle.projectedHoursRemaining).toBeCloseTo(25.0, 1);
  });

  // TEST CASE F: Shift Boundary / Date-Time Continuity (Crossing Midnight)
  it('Test Case F: Shift Boundary correctly formats date and time across midnight', () => {
    // 2026-08-30 22:00:00 UTC
    const startTimestamp = new Date('2026-08-30T22:00:00Z').getTime();

    const forecast = calculateProjectedFinish(2, {
      mode: 'manual',
      manualHoursPerStage: 3.0, // 2 stages * 3h = 6h remaining -> 2026-08-31 04:00:00 UTC
      asOfTimestamp: startTimestamp,
    });

    expect(forecast.projectedHoursRemaining).toBe(6.0);
    expect(forecast.finishDateTimeDisplay).toContain(':');
    expect(forecast.finishDateTimeDisplay).toMatch(/AM|PM/);
  });

  // TEST CASE G: Pad Completion (0 Remaining Stages)
  it('Test Case G: Pad Completion (0 Remaining Stages) displays completion state', () => {
    const forecast = calculateProjectedFinish(0, {
      mode: 'adaptive',
    });

    expect(forecast.isComplete).toBe(true);
    expect(forecast.projectedHoursRemaining).toBe(0);
    expect(forecast.projectedDaysRemaining).toBe(0);
    expect(forecast.finishDateTimeDisplay).toBe('ALL PAD STAGES COMPLETED');
  });

  // TEST CASE H: Legacy Signature Backward Compatibility
  it('Test Case H: Preserves backward compatibility when called with number/string arguments', () => {
    const forecast = calculateProjectedFinish(20, 10.0, '2026-08-30');
    expect(forecast.projectedDaysRemaining).toBeCloseTo(2.0, 2);
    expect(forecast.finishDate).toBe('2026-09-01');
    expect(forecast.isComplete).toBe(false);
  });
});


function aug29Time(base: number) {
  return base + 86400000;
}
