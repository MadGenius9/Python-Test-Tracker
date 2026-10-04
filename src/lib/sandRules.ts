import {
  AppState,
  DiagnosticsReport,
  DrawStrategy,
  ForecastConfidence,
  ForecastMode,
  MismatchedDelivery,
  PadSummary,
  RunRecord,
  SandTypeSpec,
  SandTypeSummary,
  SiloConfig,
  SiloDerivedState,
  StageCycleDetail,
  StageRecord,
  StageRecordConsistencyIssue,
  StageRecordConsistencyReport,
  WellConfig,
} from '../types';
import {
  addOperationalDays,
  formatForecastDateTimeDisplay,
  formatForecastTimeDisplay,
  formatHoursAndMinutes,
  generateDateSequence,
  getOperationalDate,
  getOperationalTime,
} from './dateUtils';
import { normalizeTicketNumber } from './ticketUtils';

export function formatLbs(lbs: number): string {
  const rounded = Math.round(lbs);
  return `${rounded.toLocaleString()} lbs`;
}

export function formatLbsNumber(lbs: number): string {
  const rounded = Math.round(lbs);
  return rounded.toLocaleString();
}

export function formatTons(tons: number): string {
  return `${tons.toFixed(1)} Tons`;
}

export function formatTruckloads(lbs: number, lbsPerTruckload = 57000): string {
  const loads = (lbs / lbsPerTruckload).toFixed(1);
  return `${loads} loads`;
}

export function sortStageRunsByActualSequence(runs: RunRecord[]): RunRecord[] {
  return [...runs].sort((a, b) => {
    const hasSeqA = a.runSequence !== undefined && a.runSequence !== null;
    const hasSeqB = b.runSequence !== undefined && b.runSequence !== null;

    if (hasSeqA && hasSeqB) {
      if (a.runSequence! !== b.runSequence!) {
        return a.runSequence! - b.runSequence!;
      }
      return (a.createdAt || 0) - (b.createdAt || 0);
    }

    if (!hasSeqA && !hasSeqB) {
      return (a.createdAt || 0) - (b.createdAt || 0);
    }

    // Mixed legacy (no runSequence) and new (has runSequence)
    const timeA = a.createdAt || 0;
    const timeB = b.createdAt || 0;
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    // If createdAt is identical, legacy record precedes new record
    return hasSeqA ? 1 : -1;
  });
}

// Helper: Calculate on-hand lbs for a silo specifically for a given sand type
export function calculateSiloOnHandForSand(
  siloNumber: number,
  sandType: string | null,
  state: AppState
): number {
  if (!sandType) return 0;

  const siloConfig = state.config.silos.find((s) => s.siloNumber === siloNumber);
  const startingBalance =
    siloConfig && siloConfig.sandType === sandType
      ? siloConfig.startingBalanceLbs || 0
      : 0;

  const totalDelivered = state.deliveries
    .filter((d) => !d.deleted && d.siloNumber === siloNumber && d.sandType === sandType)
    .reduce((sum, d) => sum + (d.lbs || 0), 0);

  const totalRun = state.runs
    .filter((r) => !r.deleted && r.siloNumber === siloNumber && r.sandType === sandType)
    .reduce((sum, r) => sum + (r.lbsPulled || 0), 0);

  // Note: Do NOT clamp at 0 — true negative balance must be preserved!
  return startingBalance + totalDelivered - totalRun;
}

// Helper: Calculate total pad-wide on-hand lbs for a sand type
export function calculateSandTypeTotalOnHand(sandType: string, state: AppState): number {
  // Sum starting balances for silos assigned to this sand type
  const totalStarting = state.config.silos
    .filter((s) => s.sandType === sandType)
    .reduce((sum, s) => sum + (s.startingBalanceLbs || 0), 0);

  // Sum all deliveries for this sand type across all silos
  const totalDelivered = state.deliveries
    .filter((d) => !d.deleted && d.sandType === sandType)
    .reduce((sum, d) => sum + (d.lbs || 0), 0);

  // Sum all runs for this sand type across all silos
  const totalRun = state.runs
    .filter((r) => !r.deleted && r.sandType === sandType)
    .reduce((sum, r) => sum + (r.lbsPulled || 0), 0);

  return totalStarting + totalDelivered - totalRun;
}

// Section D #1: Helper to get configured silo numbers in numerical ascending order
export function getConfiguredSiloNumbers(silos: SiloConfig[]): number[] {
  return silos.map((s) => s.siloNumber).sort((a, b) => a - b);
}

// Section D #2: Advance to next silo number circularly along configured silos
export function getNextNumericalSilo(currentSilo: number, configuredNumbers: number[]): number {
  if (configuredNumbers.length === 0) return currentSilo >= 6 ? 1 : currentSilo + 1;
  const idx = configuredNumbers.indexOf(currentSilo);
  if (idx === -1) {
    const next = configuredNumbers.find((n) => n > currentSilo);
    return next !== undefined ? next : configuredNumbers[0];
  }
  return configuredNumbers[(idx + 1) % configuredNumbers.length];
}

// Section D #3: Determine authoritative rotation starting pointer based on "FINISH PARTIALS THEN ROTATE"
export function getAuthoritativeRotationPointer(
  state?: AppState,
  targetWellId?: string,
  targetStageNumber?: number,
  sandType?: string,
  configuredNumbers?: number[]
): number {
  const allConfigured =
    configuredNumbers && configuredNumbers.length > 0
      ? configuredNumbers
      : (state?.config.silos || []).map((s) => s.siloNumber).sort((a, b) => a - b);
  const fallback = allConfigured[0] || 1;

  if (!state || !state.runs || state.runs.length === 0) {
    return fallback;
  }

  // Filter non-deleted runs with actual sand pulled
  const validRuns = state.runs.filter((r) => !r.deleted && (r.lbsPulled || 0) > 0);
  if (validRuns.length === 0) {
    return fallback;
  }

  // 1. Check if the target stage itself has partially recorded runs
  if (targetWellId && targetStageNumber) {
    const currentStageRuns = sortStageRunsByActualSequence(
      validRuns.filter((r) => r.wellId === targetWellId && r.stageNumber === targetStageNumber)
    );

    if (currentStageRuns.length > 0) {
      const lastRun = currentStageRuns[currentStageRuns.length - 1];
      // 1a. Explicit stored nextRotationSilo
      if (lastRun.nextRotationSilo !== undefined && lastRun.nextRotationSilo !== null) {
        return lastRun.nextRotationSilo;
      }
      // 1b. Stored ending balance
      if (lastRun.endingSiloBalanceLbs !== undefined && lastRun.endingSiloBalanceLbs !== null) {
        if (lastRun.endingSiloBalanceLbs > 0) {
          return lastRun.siloNumber;
        }
        return getNextNumericalSilo(lastRun.siloNumber, allConfigured);
      }
      // 1c. Legacy fallback: use current on-hand only when historical facts are missing
      const onHand = calculateSiloOnHandForSand(lastRun.siloNumber, lastRun.sandType, state);
      if (onHand > 0) {
        return lastRun.siloNumber;
      }
      return getNextNumericalSilo(lastRun.siloNumber, allConfigured);
    }
  }

  // 2. Find the most recent run on the pad (or prior to target)
  const sortedRuns = [...validRuns].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  let candidateRuns = sortedRuns;
  if (targetWellId && targetStageNumber) {
    const priorRuns = sortedRuns.filter((r) => {
      if (r.wellId === targetWellId) {
        return r.stageNumber < targetStageNumber;
      }
      return true;
    });
    if (priorRuns.length > 0) {
      candidateRuns = priorRuns;
    }
  }

  if (candidateRuns.length === 0) {
    return fallback;
  }

  // The latest run identifies the most recently executed run
  const latestRun = candidateRuns[candidateRuns.length - 1];
  
  // 2a. Explicit stored nextRotationSilo (immune to later refills)
  if (latestRun.nextRotationSilo !== undefined && latestRun.nextRotationSilo !== null) {
    return latestRun.nextRotationSilo;
  }

  // 2b. Stored ending balance (immune to later refills)
  if (latestRun.endingSiloBalanceLbs !== undefined && latestRun.endingSiloBalanceLbs !== null) {
    if (latestRun.endingSiloBalanceLbs > 0) {
      return latestRun.siloNumber;
    }
    return getNextNumericalSilo(latestRun.siloNumber, allConfigured);
  }

  // 2c. Legacy fallback for old records lacking historical metadata
  const onHandAfter = calculateSiloOnHandForSand(latestRun.siloNumber, latestRun.sandType, state);
  if (onHandAfter > 0) {
    return latestRun.siloNumber;
  }
  return getNextNumericalSilo(latestRun.siloNumber, allConfigured);
}

// Section D #4: Build the master circular sequence of silos for the current stage
export function buildPadSiloSequence(
  allSilos: SiloConfig[],
  state?: AppState,
  targetWellId?: string,
  targetStageNumber?: number,
  sandType?: string
): number[] {
  const configuredNumbers = allSilos.map((s) => s.siloNumber).sort((a, b) => a - b);
  if (configuredNumbers.length === 0) return [];

  // 1. Check for manual overrides on the current stage
  const manualSilos = allSilos
    .filter((s) => s.manualPriority !== null && s.manualPriority !== undefined && !s.isOutOfService)
    .sort((a, b) => (a.manualPriority || 0) - (b.manualPriority || 0));

  if (manualSilos.length > 0) {
    const sequence: number[] = [];
    const added = new Set<number>();

    // Start with manual override silos in requested priority order
    for (const s of manualSilos) {
      sequence.push(s.siloNumber);
      added.add(s.siloNumber);
    }

    // Continue circularly from the last manual override silo
    const lastManualSilo = manualSilos[manualSilos.length - 1].siloNumber;
    let pivotIdx = configuredNumbers.indexOf(lastManualSilo);
    if (pivotIdx === -1) pivotIdx = 0;

    for (let step = 1; step <= configuredNumbers.length; step++) {
      const candidate = configuredNumbers[(pivotIdx + step) % configuredNumbers.length];
      if (!added.has(candidate)) {
        sequence.push(candidate);
        added.add(candidate);
      }
    }

    return sequence;
  }

  // 2. No manual overrides: start from authoritative rotation pointer
  const rotationPointer = getAuthoritativeRotationPointer(
    state,
    targetWellId,
    targetStageNumber,
    sandType,
    configuredNumbers
  );

  let startIdx = configuredNumbers.indexOf(rotationPointer);
  if (startIdx === -1) startIdx = 0;

  const sequence: number[] = [];
  for (let i = 0; i < configuredNumbers.length; i++) {
    sequence.push(configuredNumbers[(startIdx + i) % configuredNumbers.length]);
  }

  return sequence;
}

// Section D #5: Compute run orders for silos of a sand type based on strategy and manual overrides
export function computeRunOrders(
  silosForSand: SiloConfig[],
  siloDerivedMap: Map<
    number,
    {
      onHandLbs: number;
      runToDateLbs: number;
      capacityLbs: number;
    }
  >,
  drawStrategy: DrawStrategy = 'sequential_rotation',
  partialThresholdPct: number = 0.75,
  state?: AppState,
  targetWellId?: string,
  targetStageNumber?: number,
  sandType?: string
): Map<number, number> {
  // Exclude out-of-service silos and empty silos (onHandLbs <= 0)
  const activeSilos = silosForSand.filter(
    (s) =>
      !s.isOutOfService &&
      (siloDerivedMap.get(s.siloNumber)?.onHandLbs || 0) > 0
  );
  const result = new Map<number, number>();

  if (activeSilos.length === 0) return result;

  // Authoritative operating mode: FINISH PARTIALS THEN ROTATE (1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 1)
  if (drawStrategy === 'sequential_rotation' || drawStrategy === 'partials_then_rotate') {
    const allSilos =
      state?.config.silos && state.config.silos.length > 0 ? state.config.silos : silosForSand;
    const fullSequence = buildPadSiloSequence(
      allSilos,
      state,
      targetWellId,
      targetStageNumber,
      sandType
    );

    // Filter active silos for this sand type and sort strictly by appearance in fullSequence
    const sorted = [...activeSilos].sort((a, b) => {
      const idxA = fullSequence.indexOf(a.siloNumber);
      const idxB = fullSequence.indexOf(b.siloNumber);
      const orderA = idxA !== -1 ? idxA : 999;
      const orderB = idxB !== -1 ? idxB : 999;
      return orderA - orderB;
    });

    sorted.forEach((s, idx) => {
      result.set(s.siloNumber, idx + 1);
    });

    return result;
  }

  // Fallbacks for other specific strategies if selected
  let sortedByBaseStrategy: SiloConfig[] = [];
  if (drawStrategy === 'least_used_first') {
    sortedByBaseStrategy = [...activeSilos].sort((a, b) => {
      const runA = siloDerivedMap.get(a.siloNumber)?.runToDateLbs || 0;
      const runB = siloDerivedMap.get(b.siloNumber)?.runToDateLbs || 0;
      if (runA !== runB) return runA - runB;
      return a.siloNumber - b.siloNumber;
    });
  } else if (drawStrategy === 'fullest_first') {
    sortedByBaseStrategy = [...activeSilos].sort((a, b) => {
      const onHandA = siloDerivedMap.get(a.siloNumber)?.onHandLbs || 0;
      const onHandB = siloDerivedMap.get(b.siloNumber)?.onHandLbs || 0;
      if (onHandA !== onHandB) return onHandB - onHandA;
      return a.siloNumber - b.siloNumber;
    });
  } else {
    // emptiest_first
    sortedByBaseStrategy = [...activeSilos].sort((a, b) => {
      const onHandA = siloDerivedMap.get(a.siloNumber)?.onHandLbs || 0;
      const onHandB = siloDerivedMap.get(b.siloNumber)?.onHandLbs || 0;
      if (onHandA !== onHandB) return onHandA - onHandB;
      return a.siloNumber - b.siloNumber;
    });
  }

  sortedByBaseStrategy.forEach((s, idx) => {
    result.set(s.siloNumber, idx + 1);
  });

  return result;
}

// Section D #4 & #5: Calculate derived states using target well and stage
export function getSiloDerivedStates(
  state: AppState,
  targetWellId?: string,
  targetStageNumber?: number,
  stageLbsOverride?: number
): SiloDerivedState[] {
  const lbsPerTon = state.config.lbsPerTon || 2000;

  // Determine active well and stage if not provided
  const activeWell =
    state.config.wells.find((w) => w.id === targetWellId) ||
    state.config.wells[0] || { id: 'w-1', name: 'Well 1H', plannedStages: 40 };

  let currentStage = targetStageNumber;
  if (currentStage === undefined) {
    const lastRunForWell = state.runs
      .filter((r) => !r.deleted && r.wellId === activeWell.id)
      .sort((a, b) => b.stageNumber - a.stageNumber)[0];
    currentStage = lastRunForWell ? lastRunForWell.stageNumber + 1 : 1;
  }

  // Compute on-hand, run-to-date, and capacity for each silo
  const siloDerivedMap = new Map<
    number,
    {
      onHandLbs: number;
      runToDateLbs: number;
      capacityLbs: number;
    }
  >();
  state.config.silos.forEach((s) => {
    const onHand = calculateSiloOnHandForSand(s.siloNumber, s.sandType, state);
    const runToDate = s.sandType
      ? state.runs
          .filter(
            (r) => !r.deleted && r.siloNumber === s.siloNumber && r.sandType === s.sandType
          )
          .reduce((sum, r) => sum + (r.lbsPulled || 0), 0)
      : 0;
    const maxCap = s.maxCapacityLbs || 350000;

    siloDerivedMap.set(s.siloNumber, {
      onHandLbs: onHand,
      runToDateLbs: runToDate,
      capacityLbs: maxCap,
    });
  });

  // Group silos by Sand Type
  const sandTypeGroupSilos = new Map<string, SiloConfig[]>();
  state.config.silos.forEach((s) => {
    if (s.sandType) {
      if (!sandTypeGroupSilos.has(s.sandType)) {
        sandTypeGroupSilos.set(s.sandType, []);
      }
      sandTypeGroupSilos.get(s.sandType)!.push(s);
    }
  });

  // 1. Calculate relative run orders within each sand type (respecting manualPriority & draw strategy)
  const drawStrategy = state.config.drawStrategy || 'sequential_rotation';
  const partialThreshold = state.config.partialThresholdPct ?? 0.75;

  const relativeRunOrdersMap = new Map<number, number>();
  sandTypeGroupSilos.forEach((silosForSand, sandType) => {
    const orders = computeRunOrders(
      silosForSand,
      siloDerivedMap,
      drawStrategy,
      partialThreshold,
      state,
      activeWell.id,
      currentStage,
      sandType
    );
    orders.forEach((order, siloNum) => relativeRunOrdersMap.set(siloNum, order));
  });

  // 2. Calculate planned pulls per silo (CAPPED at actual available on-hand weight)
  const plannedPullsMap = new Map<number, number>();

  sandTypeGroupSilos.forEach((silosForSand, sandType) => {
    const sandSpec = state.config.sandTypes.find((st) => st.name === sandType);
    const standardDesignLbs = sandSpec ? getEffectivePerStageDesign(activeWell, sandSpec) : 150000;
    const requiredForStage = stageLbsOverride ?? standardDesignLbs;

    // Check how many lbs have ALREADY been recorded for this well, stage, and sand type
    const alreadyRunLbs = state.runs
      .filter((r) => !r.deleted && r.wellId === activeWell.id && r.stageNumber === currentStage && r.sandType === sandType)
      .reduce((sum, r) => sum + (r.lbsPulled || 0), 0);

    let remainingNeeded = Math.max(0, requiredForStage - alreadyRunLbs);

    // Active online silos ordered by relative runOrder (1, 2, 3...)
    const activeOrderedSilos = silosForSand
      .filter((s) => !s.isOutOfService)
      .sort((a, b) => (relativeRunOrdersMap.get(a.siloNumber) || 99) - (relativeRunOrdersMap.get(b.siloNumber) || 99));

    activeOrderedSilos.forEach((s) => {
      const onHand = siloDerivedMap.get(s.siloNumber)?.onHandLbs || 0;
      if (remainingNeeded <= 0 || onHand <= 0) {
        plannedPullsMap.set(s.siloNumber, 0);
      } else {
        const pull = Math.min(onHand, remainingNeeded);
        plannedPullsMap.set(s.siloNumber, pull);
        remainingNeeded -= pull;
      }
    });

    // SECTION B: Never dump leftover remainingNeeded onto a silo!
    // If remainingNeeded > 0, it means the silos run short for this stage.
  });

  // 3. Section A: Assign pad-wide global run orders across the entire pad
  // - Silos the current stage actually pulls from get sequential numbers (1, 2, 3...) in pull sequence order
  // - A silo with a manual override (s.manualPriority !== null) ALWAYS shows its global run number
  const fullPadSequence = buildPadSiloSequence(
    state.config.silos,
    state,
    activeWell.id,
    currentStage
  );

  const globalRunOrderMap = new Map<number, number>();
  let currentPadRunOrder = 1;

  fullPadSequence.forEach((siloNum) => {
    const s = state.config.silos.find((silo) => silo.siloNumber === siloNum);
    if (!s || s.isOutOfService) return;

    const pull = plannedPullsMap.get(siloNum) || 0;
    const hasOverride = s.manualPriority !== null && s.manualPriority !== undefined;
    if (pull > 0 || hasOverride) {
      globalRunOrderMap.set(siloNum, currentPadRunOrder++);
    }
  });

  // Construct full SiloDerivedState objects
  return state.config.silos.map((s) => {
    const onHandLbs = siloDerivedMap.get(s.siloNumber)?.onHandLbs || 0;
    const onHandTons = onHandLbs / lbsPerTon;
    const maxCap = s.maxCapacityLbs || 350000;
    const percentFull = Math.min(999, Math.max(0, (onHandLbs / maxCap) * 100));
    const isOverCapacity = onHandLbs > maxCap;
    const isNegative = onHandLbs < 0;

    const sandSpec = state.config.sandTypes.find((st) => st.name === s.sandType);
    const perStageDesign = sandSpec ? getEffectivePerStageDesign(activeWell, sandSpec) : 150000;
    const stagesLeft = perStageDesign > 0 ? onHandLbs / perStageDesign : 0;

    let status: 'OK' | 'LOW' | 'EMPTY' | 'OUT_OF_SERVICE' = 'OK';
    if (s.isOutOfService) {
      status = 'OUT_OF_SERVICE';
    } else if (onHandLbs <= 0) {
      status = 'EMPTY';
    } else if (stagesLeft < 1.0) {
      status = 'LOW';
    }

    return {
      siloNumber: s.siloNumber,
      name: s.name || `Silo #${s.siloNumber}`,
      side: s.side || 'A',
      sandType: s.sandType,
      manualPriority: s.manualPriority,
      maxCapacityLbs: maxCap,
      startingBalanceLbs: s.startingBalanceLbs || 0,
      isOutOfService: s.isOutOfService || false,
      onHandLbs,
      onHandTons,
      percentFull,
      isOverCapacity,
      isNegative,
      status,
      runOrder: s.isOutOfService ? null : globalRunOrderMap.get(s.siloNumber) ?? null,
      plannedPullLbs: plannedPullsMap.get(s.siloNumber) || 0,
      stagesLeft,
    };
  });
}

// Helper: Check if a specific well and stage has met all required per-stage sand designs
// Strictly authoritative from active non-deleted RunRecords.
// When no active runs exist in memory (e.g. unit tests or cached state), falls back to StageRecord.
export function isStageComplete(
  state: AppState,
  wellId: string,
  stageNumber: number
): boolean {
  const well = state.config?.wells?.find((w) => w.id === wellId);
  if (!well) return false;

  const stageRuns = (state.runs || []).filter(
    (r) => !r.deleted && r.wellId === wellId && r.stageNumber === stageNumber
  );

  if (stageRuns.length > 0) {
    const sandTypes = state.config?.sandTypes || [];
    if (sandTypes.length === 0) {
      return stageRuns.reduce((sum, r) => sum + (r.lbsPulled || 0), 0) > 0;
    }

    let hasAnyRequiredSand = false;
    for (const st of sandTypes) {
      const effectiveDesign = getEffectivePerStageDesign(well, st);
      if (effectiveDesign > 0) {
        hasAnyRequiredSand = true;
        const pumped = stageRuns
          .filter((r) => r.sandType === st.name)
          .reduce((sum, r) => sum + (r.lbsPulled || 0), 0);

        // Tolerance of 1 lb (per prompt requirement)
        if (pumped < effectiveDesign - 1) {
          return false;
        }
      }
    }

    if (!hasAnyRequiredSand) {
      return stageRuns.reduce((sum, r) => sum + (r.lbsPulled || 0), 0) > 0;
    }

    return true;
  }

  // Zero active runs is NEVER complete. RunRecords are absolute stage truth.
  return false;
}

// Helper: Determine next well and stage to plan based on strict zipper well rotation
export function getNextWellAndStage(
  state: AppState,
  justRanWellId?: string
): { wellId: string; stageNumber: number } | null {
  const wells = state.config.wells || [];
  if (wells.length === 0) return null;

  // Helper: check if a well has a partially started (in-progress) stage with logged runs
  const getWellInProgressStage = (well: WellConfig): number | null => {
    const activeRuns = (state.runs || []).filter((r) => !r.deleted && r.wellId === well.id);
    const stageNumbers = Array.from(new Set(activeRuns.map((r) => r.stageNumber))).sort((a, b) => a - b);
    for (const stg of stageNumbers) {
      if (!isStageComplete(state, well.id, stg)) {
        return stg;
      }
    }
    return null;
  };

  // Helper: get next stage info for a given well (iterating 1 through plannedStages to find the first incomplete stage)
  const getWellNextStageInfo = (
    well: WellConfig
  ): { nextStage: number; completedCount: number; isFinished: boolean } => {
    const plannedStages = well.plannedStages && well.plannedStages > 0 ? well.plannedStages : 40;
    let completedCount = 0;

    for (let stg = 1; stg <= plannedStages; stg++) {
      if (isStageComplete(state, well.id, stg)) {
        completedCount++;
      } else {
        return { nextStage: stg, completedCount, isFinished: false };
      }
    }

    return { nextStage: plannedStages + 1, completedCount, isFinished: true };
  };

  const isWellFinished = (well: WellConfig): boolean => {
    const { isFinished } = getWellNextStageInfo(well);
    return isFinished;
  };

  // If every well is finished, return null
  const hasAnyUnfinished = wells.some((w) => !isWellFinished(w));
  if (!hasAnyUnfinished) {
    return null;
  }

  // 1. If justRanWellId was supplied, check if that well has an in-progress partial stage:
  if (justRanWellId) {
    const justRanWell = wells.find((w) => w.id === justRanWellId);
    if (justRanWell) {
      const inProgressStage = getWellInProgressStage(justRanWell);
      if (inProgressStage !== null) {
        return {
          wellId: justRanWell.id,
          stageNumber: inProgressStage,
        };
      }
    }
  }

  // 2. Check the most recent run on the pad overall for in-progress partial stage
  const activeRuns = (state.runs || []).filter((r) => !r.deleted && r.wellId);
  if (activeRuns.length > 0) {
    const sortedRuns = [...activeRuns].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const mostRecent = sortedRuns[0];
    if (mostRecent && mostRecent.wellId) {
      const latestWell = wells.find((w) => w.id === mostRecent.wellId);
      if (latestWell && !isStageComplete(state, latestWell.id, mostRecent.stageNumber)) {
        return {
          wellId: latestWell.id,
          stageNumber: mostRecent.stageNumber,
        };
      }
    }
  }

  // Determine starting reference well index
  let referenceIndex = -1;
  if (justRanWellId) {
    referenceIndex = wells.findIndex((w) => w.id === justRanWellId);
  }
  if (referenceIndex === -1 && activeRuns.length > 0) {
    const sortedRuns = [...activeRuns].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const mostRecentRun = sortedRuns[0];
    if (mostRecentRun && mostRecentRun.wellId) {
      referenceIndex = wells.findIndex((w) => w.id === mostRecentRun.wellId);
    }
  }

  // Walk forward in zipper sequence
  if (referenceIndex !== -1) {
    for (let step = 1; step <= wells.length; step++) {
      const idx = (referenceIndex + step) % wells.length;
      const candidateWell = wells[idx];
      if (!isWellFinished(candidateWell)) {
        const info = getWellNextStageInfo(candidateWell);
        return {
          wellId: candidateWell.id,
          stageNumber: info.nextStage,
        };
      }
    }
  }

  // Fallback: first unfinished well
  for (let i = 0; i < wells.length; i++) {
    const candidateWell = wells[i];
    if (!isWellFinished(candidateWell)) {
      const info = getWellNextStageInfo(candidateWell);
      return {
        wellId: candidateWell.id,
        stageNumber: info.nextStage,
      };
    }
  }

  return null;
}

// Get Pad Level Summary
export function getPadSummary(state: AppState): PadSummary {
  const lbsPerTon = state.config.lbsPerTon || 2000;
  const reorderStages = state.config.reorderThresholdStages || 5;

  const nextInfo = getNextWellAndStage(state);
  const activeWell =
    (nextInfo && state.config.wells.find((w) => w.id === nextInfo.wellId)) ||
    state.config.wells[0] || {
      id: 'w-1',
      name: 'Well 1H',
      plannedStages: 40,
    };

  // Determine next stage number for active well
  const lastRunForWell = (state.runs || [])
    .filter((r) => !r.deleted && r.wellId === activeWell.id)
    .sort((a, b) => b.stageNumber - a.stageNumber)[0];

  const nextStageNumber = nextInfo
    ? nextInfo.stageNumber
    : lastRunForWell
    ? lastRunForWell.stageNumber + 1
    : 1;

  let totalPadOnHandLbs = 0;
  let hasReorderAlert = false;

  const sandTypeSummaries: SandTypeSummary[] = state.config.sandTypes.map((st) => {
    const onHandLbs = calculateSandTypeTotalOnHand(st.name, state);
    const onHandTons = onHandLbs / lbsPerTon;
    const effectiveDesign = getEffectivePerStageDesign(activeWell, st);
    const stagesLeft = effectiveDesign > 0 ? onHandLbs / effectiveDesign : 0;
    const reorderThresholdLbs = effectiveDesign * reorderStages;
    const isBelowReorderThreshold = onHandLbs < reorderThresholdLbs;

    // SECTION B: Calculate stage shortfall for the upcoming stage
    const requiredForStage = effectiveDesign;
    const alreadyRunLbs = state.runs
      .filter(
        (r) =>
          !r.deleted &&
          r.wellId === activeWell.id &&
          r.stageNumber === nextStageNumber &&
          r.sandType === st.name
      )
      .reduce((sum, r) => sum + (r.lbsPulled || 0), 0);

    const remainingNeeded = Math.max(0, requiredForStage - alreadyRunLbs);

    // Sum positive on-hand sand available in online silos assigned to this sand type
    const activeOnHand = state.config.silos
      .filter((s) => s.sandType === st.name && !s.isOutOfService)
      .reduce((sum, s) => {
        const oh = calculateSiloOnHandForSand(s.siloNumber, s.sandType, state);
        return sum + Math.max(0, oh);
      }, 0);

    const stageShortfallLbs = Math.max(0, remainingNeeded - activeOnHand);

    if (isBelowReorderThreshold) {
      hasReorderAlert = true;
    }

    totalPadOnHandLbs += onHandLbs;

    return {
      sandType: st.name,
      onHandLbs,
      onHandTons,
      stagesLeft,
      perStageDesignLbs: effectiveDesign,
      reorderThresholdLbs,
      isBelowReorderThreshold,
      stageShortfallLbs,
    };
  });

  return {
    customerName: state.config.customerName,
    activeWellCustomerName: activeWell.customerName || state.config.customerName,
    padName: state.config.padName || 'UNNAMED PAD',
    activeWellId: activeWell.id,
    nextWellName: activeWell.name,
    nextStageNumber,
    sandTypeSummaries,
    totalPadOnHandLbs,
    hasReorderAlert,
  };
}

// Section C #6: Diagnostics Report Calculation
export function getDiagnosticsReport(state: AppState): DiagnosticsReport {
  const padSummary = getPadSummary(state);
  const siloDerivedStates = getSiloDerivedStates(state);

  const computedPadOnHandLbs = padSummary.totalPadOnHandLbs;
  const sumOfSilosOnHandLbs = siloDerivedStates.reduce((sum, s) => sum + s.onHandLbs, 0);
  const isPadTotalMismatch = Math.abs(computedPadOnHandLbs - sumOfSilosOnHandLbs) > 1;

  // Negative silos
  const negativeSilos = siloDerivedStates
    .filter((s) => s.onHandLbs < 0)
    .map((s) => ({ siloNumber: s.siloNumber, onHandLbs: s.onHandLbs }));

  // Count duplicate ticket numbers on active (non-deleted) deliveries
  const ticketCounts = new Map<string, number>();
  state.deliveries.forEach((d) => {
    if (!d.deleted && d.ticketNumber) {
      const normalized = normalizeTicketNumber(d.ticketNumber);
      if (normalized) {
        ticketCounts.set(normalized, (ticketCounts.get(normalized) || 0) + 1);
      }
    }
  });

  const duplicateTicketNumbers: { ticketNumber: string; count: number }[] = [];
  ticketCounts.forEach((count, tNum) => {
    if (count > 1) {
      // Find original display casing
      const original = state.deliveries.find((d) => !d.deleted && normalizeTicketNumber(d.ticketNumber) === tNum)?.ticketNumber || tNum;
      duplicateTicketNumbers.push({ ticketNumber: original, count });
    }
  });

  // Mismatched deliveries (delivery sand type != current assigned silo sand type)
  const mismatchedDeliveries: MismatchedDelivery[] = [];
  state.deliveries.forEach((d) => {
    const silo = state.config.silos.find((s) => s.siloNumber === d.siloNumber);
    if (silo && silo.sandType && d.sandType !== silo.sandType) {
      mismatchedDeliveries.push({
        ticketId: d.id,
        ticketNumber: d.ticketNumber,
        siloNumber: d.siloNumber,
        deliverySandType: d.sandType,
        siloCurrentSandType: silo.sandType,
        date: d.date,
      });
    }
  });

  // Unassigned silos (configured silos without sand type assigned)
  const unassignedSilos = (state.config.silos || [])
    .filter((s) => !s.sandType)
    .map((s) => s.siloNumber);

  // Deliveries and stage runs assigned to a silo number not in the current config
  const configuredSiloNumbers = new Set<number>();
  const effectiveSiloCount = state.config.siloCount || state.config.silos?.length || 6;
  for (let i = 1; i <= effectiveSiloCount; i++) {
    configuredSiloNumbers.add(i);
  }
  if (state.config.silos) {
    state.config.silos.forEach((s) => configuredSiloNumbers.add(s.siloNumber));
  }

  const unassignedSiloDeliveries = (state.deliveries || []).filter(
    (d) => !configuredSiloNumbers.has(d.siloNumber)
  );

  const unassignedSiloRuns = (state.runs || []).filter(
    (r) => !configuredSiloNumbers.has(r.siloNumber)
  );

  // Section: Stage Record Consistency Check
  // Compare derived RunRecord totals & status against cached StageRecords
  const stageKeysSet = new Set<string>();

  // Collect from active runs
  (state.runs || []).forEach((r) => {
    if (!r.deleted && r.wellId && r.stageNumber) {
      stageKeysSet.add(`${r.wellId}_stage_${r.stageNumber}`);
    }
  });

  // Collect from existing cached StageRecords
  if (state.stageRecords) {
    if (Array.isArray(state.stageRecords)) {
      state.stageRecords.forEach((sr) => {
        if (sr?.wellId && sr?.stageNumber) {
          stageKeysSet.add(`${sr.wellId}_stage_${sr.stageNumber}`);
        }
      });
    } else if (typeof state.stageRecords === 'object') {
      Object.entries(state.stageRecords).forEach(([key, sr]) => {
        if (sr?.wellId && sr?.stageNumber) {
          stageKeysSet.add(`${sr.wellId}_stage_${sr.stageNumber}`);
        } else if (key) {
          stageKeysSet.add(key);
        }
      });
    }
  }

  const stageConsistencyIssues: StageRecordConsistencyIssue[] = [];

  stageKeysSet.forEach((key) => {
    const parts = key.split('_stage_');
    if (parts.length !== 2) return;
    const wellId = parts[0];
    const stageNumber = parseInt(parts[1], 10);
    if (isNaN(stageNumber)) return;

    const wellObj = state.config.wells.find((w) => w.id === wellId);
    const wellName = wellObj?.name || `Well ${wellId}`;

    // Active runs
    const activeRuns = (state.runs || []).filter(
      (r) => !r.deleted && r.wellId === wellId && r.stageNumber === stageNumber
    );
    const authoritativeTotalLbs = activeRuns.reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
    const authoritativeComplete = isStageComplete(state, wellId, stageNumber);
    const authoritativeStatus =
      activeRuns.length === 0
        ? 'not_started'
        : authoritativeComplete
        ? 'complete'
        : 'partial';

    // Cached stage record
    let cachedRecord: StageRecord | undefined;
    if (state.stageRecords) {
      if (Array.isArray(state.stageRecords)) {
        cachedRecord = state.stageRecords.find(
          (sr) => sr && sr.wellId === wellId && sr.stageNumber === stageNumber
        );
      } else if (typeof state.stageRecords === 'object') {
        cachedRecord =
          state.stageRecords[key] ||
          Object.values(state.stageRecords).find(
            (sr) => sr && sr.wellId === wellId && sr.stageNumber === stageNumber
          );
      }
    }

    if (activeRuns.length === 0 && cachedRecord) {
      stageConsistencyIssues.push({
        wellId,
        wellName,
        stageNumber,
        issue: 'Dangling StageRecord exists with 0 active run records',
        cachedStatus: cachedRecord.status,
        authoritativeStatus,
        cachedTotalLbs: cachedRecord.totalRecordedLbs || 0,
        authoritativeTotalLbs: 0,
      });
    } else if (activeRuns.length > 0 && !cachedRecord) {
      stageConsistencyIssues.push({
        wellId,
        wellName,
        stageNumber,
        issue: 'Missing StageRecord for stage with active runs',
        authoritativeStatus,
        authoritativeTotalLbs,
      });
    } else if (activeRuns.length > 0 && cachedRecord) {
      const statusMismatch = cachedRecord.status !== authoritativeStatus;
      const weightMismatch =
        Math.abs((cachedRecord.totalRecordedLbs || 0) - authoritativeTotalLbs) > 1;

      if (statusMismatch || weightMismatch) {
        let issueText = '';
        if (statusMismatch && weightMismatch) {
          issueText = `Status mismatch (${cachedRecord.status?.toUpperCase()} vs ${authoritativeStatus.toUpperCase()}) & Weight mismatch (${(cachedRecord.totalRecordedLbs || 0).toLocaleString()} vs ${authoritativeTotalLbs.toLocaleString()} LB)`;
        } else if (statusMismatch) {
          issueText = `Status mismatch: Cached=${cachedRecord.status?.toUpperCase()}, Actual=${authoritativeStatus.toUpperCase()}`;
        } else {
          issueText = `Weight mismatch: Cached=${(cachedRecord.totalRecordedLbs || 0).toLocaleString()} LB, Actual=${authoritativeTotalLbs.toLocaleString()} LB`;
        }

        stageConsistencyIssues.push({
          wellId,
          wellName,
          stageNumber,
          issue: issueText,
          cachedStatus: cachedRecord.status,
          authoritativeStatus,
          cachedTotalLbs: cachedRecord.totalRecordedLbs || 0,
          authoritativeTotalLbs,
        });
      }
    }
  });

  const stageRecordConsistency: StageRecordConsistencyReport = {
    isConsistent: stageConsistencyIssues.length === 0,
    inconsistentCount: stageConsistencyIssues.length,
    issues: stageConsistencyIssues,
  };

  return {
    computedPadOnHandLbs,
    sumOfSilosOnHandLbs,
    isPadTotalMismatch,
    negativeSilos,
    duplicateTicketNumbers,
    mismatchedDeliveries,
    unassignedSilos,
    unassignedSiloDeliveries,
    unassignedSiloRuns,
    stageRecordConsistency,
  };
}

// -------------------------------------------------------------
// Job Design & Well Design Calculations
// -------------------------------------------------------------

export function getEffectivePerStageDesign(
  well: WellConfig | undefined | null,
  sandType: SandTypeSpec
): number {
  if (well?.perStageDesignOverrides) {
    if (
      well.perStageDesignOverrides[sandType.id] !== undefined &&
      well.perStageDesignOverrides[sandType.id] !== null
    ) {
      const val = well.perStageDesignOverrides[sandType.id];
      if (typeof val === 'number' && !isNaN(val) && val >= 0) {
        return val;
      }
    }
    if (
      well.perStageDesignOverrides[sandType.name] !== undefined &&
      well.perStageDesignOverrides[sandType.name] !== null
    ) {
      const val = well.perStageDesignOverrides[sandType.name];
      if (typeof val === 'number' && !isNaN(val) && val >= 0) {
        return val;
      }
    }
  }
  return sandType.perStageDesignLbs || 0;
}

export function calculateSandDesignForWell(
  well: WellConfig,
  sandType: SandTypeSpec
): number {
  const perStageLbs = getEffectivePerStageDesign(well, sandType);
  return (well.plannedStages || 0) * perStageLbs;
}

export function calculateSandPumpedForWell(
  wellId: string,
  sandTypeName: string,
  state: AppState
): number {
  return state.runs
    .filter((r) => r.wellId === wellId && r.sandType === sandTypeName)
    .reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
}

export interface JobDesignSandTypeMetrics {
  sandType: SandTypeSpec;
  jobDesignTotalLbs: number;
  jobDesignTotalTons: number;
  deliveredSoFarLbs: number;
  deliveredSoFarTons: number;
  stillToDeliverLbs: number; // jobDesignTotalLbs - deliveredSoFarLbs (negative = over-delivered)
  stillToDeliverTons: number;
  truckloadsStillNeeded: number; // stillToDeliverLbs / lbsPerTruckload
  pumpedSoFarLbs: number;
  pumpedSoFarTons: number;
  remainingInDesignLbs: number; // jobDesignTotalLbs - pumpedSoFarLbs
  remainingInDesignTons: number;
  effectivePerStageDesignLbs: number;
  stagesInDesign: number; // jobDesignTotalLbs / perStageDesignLbs
  stagesPumpedSoFar: number; // pumpedSoFarLbs / perStageDesignLbs
  stagesOfSandLeftInDesign: number; // stagesInDesign - stagesPumpedSoFar
  // Cross Check
  plannedStagesSumLbs: number; // Sum across all wells (plannedStages x well effective design)
  plannedCrossCheckDiffLbs: number; // plannedStagesSumLbs - jobDesignTotalLbs
  plannedCrossCheckDiffPercent: number; // Math.abs(diff) / jobDesignTotalLbs * 100
  hasCrossCheckFlag: boolean; // diffPercent > 2%
}

export function calculateJobDesignMetrics(state: AppState): JobDesignSandTypeMetrics[] {
  const lbsPerTruckload = state.config.lbsPerTruckload || 57000;
  const lbsPerTon = state.config.lbsPerTon || 2000;

  return state.config.sandTypes.map((sandType) => {
    const jobDesignTotalLbs = sandType.jobDesignTotalLbs || 0;
    const jobDesignTotalTons = jobDesignTotalLbs / lbsPerTon;

    const deliveredSoFarLbs = state.deliveries
      .filter((d) => d.sandType === sandType.name)
      .reduce((sum, d) => sum + (d.lbs || 0), 0);
    const deliveredSoFarTons = deliveredSoFarLbs / lbsPerTon;

    const stillToDeliverLbs = jobDesignTotalLbs - deliveredSoFarLbs;
    const stillToDeliverTons = stillToDeliverLbs / lbsPerTon;

    const truckloadsStillNeeded =
      stillToDeliverLbs > 0 ? stillToDeliverLbs / lbsPerTruckload : 0;

    const pumpedSoFarLbs = state.runs
      .filter((r) => r.sandType === sandType.name)
      .reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
    const pumpedSoFarTons = pumpedSoFarLbs / lbsPerTon;

    const remainingInDesignLbs = jobDesignTotalLbs - pumpedSoFarLbs;
    const remainingInDesignTons = remainingInDesignLbs / lbsPerTon;

    const perStage = sandType.perStageDesignLbs || 0;
    const stagesInDesign = perStage > 0 ? jobDesignTotalLbs / perStage : 0;
    const stagesPumpedSoFar = perStage > 0 ? pumpedSoFarLbs / perStage : 0;
    const stagesOfSandLeftInDesign = stagesInDesign - stagesPumpedSoFar;

    // Cross-Check: Sum each well's stages x well's effective design
    const plannedStagesSumLbs = state.config.wells.reduce((sum, well) => {
      return sum + calculateSandDesignForWell(well, sandType);
    }, 0);

    const plannedCrossCheckDiffLbs = plannedStagesSumLbs - jobDesignTotalLbs;
    const plannedCrossCheckDiffPercent =
      jobDesignTotalLbs > 0
        ? (Math.abs(plannedCrossCheckDiffLbs) / jobDesignTotalLbs) * 100
        : plannedStagesSumLbs > 0
        ? 100
        : 0;

    const hasCrossCheckFlag = plannedCrossCheckDiffPercent > 2;

    return {
      sandType,
      jobDesignTotalLbs,
      jobDesignTotalTons,
      deliveredSoFarLbs,
      deliveredSoFarTons,
      stillToDeliverLbs,
      stillToDeliverTons,
      truckloadsStillNeeded,
      pumpedSoFarLbs,
      pumpedSoFarTons,
      remainingInDesignLbs,
      remainingInDesignTons,
      effectivePerStageDesignLbs: perStage,
      stagesInDesign,
      stagesPumpedSoFar,
      stagesOfSandLeftInDesign,
      plannedStagesSumLbs,
      plannedCrossCheckDiffLbs,
      plannedCrossCheckDiffPercent,
      hasCrossCheckFlag,
    };
  });
}

// -------------------------------------------------------------
// Delivered by Supplier Summary
// -------------------------------------------------------------

export interface SupplierSummaryRow {
  supplierName: string;
  lbsPerSandType: Record<string, number>;
  totalLbs: number;
  totalTons: number;
  loadCount: number;
}

export function calculateDeliveredBySupplier(state: AppState): SupplierSummaryRow[] {
  const lbsPerTon = state.config.lbsPerTon || 2000;
  const map = new Map<string, { lbsPerSandType: Record<string, number>; totalLbs: number; loadCount: number }>();

  state.deliveries.forEach((d) => {
    let name = (d.supplier || '').trim();
    if (!name) {
      name = '(No Supplier Specified)';
    }

    if (!map.has(name)) {
      map.set(name, { lbsPerSandType: {}, totalLbs: 0, loadCount: 0 });
    }

    const entry = map.get(name)!;
    const sType = d.sandType || 'Unassigned';
    entry.lbsPerSandType[sType] = (entry.lbsPerSandType[sType] || 0) + (d.lbs || 0);
    entry.totalLbs += d.lbs || 0;
    entry.loadCount += 1;
  });

  const rows: SupplierSummaryRow[] = [];
  map.forEach((data, supplierName) => {
    rows.push({
      supplierName,
      lbsPerSandType: data.lbsPerSandType,
      totalLbs: data.totalLbs,
      totalTons: data.totalLbs / lbsPerTon,
      loadCount: data.loadCount,
    });
  });

  // Sort descending by totalLbs
  rows.sort((a, b) => b.totalLbs - a.totalLbs);

  return rows;
}

// -------------------------------------------------------------
// Stage Pace & Projected Finish Date Calculations
// -------------------------------------------------------------

export interface DailyProductionCount {
  date: string;
  count: number;
}

export interface CompletedStageDetail {
  wellId: string;
  wellName: string;
  stageNumber: number;
  completedAt: number;
  operationalDate: string;
}

export interface StagePaceOptions {
  referenceDateStr?: string;
  referenceTime?: number; // ms timestamp
  mode?: ForecastMode;
  manualStagesPerDay?: number;
  manualHoursPerStage?: number;
}

export interface StagePaceStats {
  totalCompletedStages: number;
  totalPlannedStages: number;
  totalRemainingStages: number;
  todayCompletedStages: number;
  todayOperationalDate: string;

  // Adaptive Cycle Stats (Default)
  adaptiveStageCycleHours: number | null;
  adaptiveStagesPerDay: number | null;
  adaptiveCyclesUsed: number;
  outlierCount: number;
  extendedDowntimeDetectedHours: number | null;
  extendedDowntimeNote: string | null;

  // Rolling 24 Hours
  rolling24hCompletedStages: number;
  rolling24hStagesPerDay: number;
  rolling24hHoursPerStage: number | null;

  // Recent 3 Calendar Days (with 0-count calendar days counted)
  recentAverageStagesPerDay: number;
  recentHoursPerStage: number | null;
  daysUsedForRecentAverage: number;

  // Recent 7 Calendar Days (with 0-count calendar days counted)
  sevenDayAverageStagesPerDay: number;
  sevenDayHoursPerStage: number | null;
  daysUsedForSevenDayAverage: number;

  // Overall Job Tracked Average
  jobAverageStagesPerDay: number;
  jobHoursPerStage: number | null;
  totalPumpingDays: number;

  // Confidence & Details
  confidence: ForecastConfidence;
  confidenceLabel: 'WAITING FOR STAGE HISTORY' | 'EARLY ESTIMATE' | 'RECENT PACE' | 'ESTABLISHED PACE';
  confidenceReason?: string;
  stageCycles: StageCycleDetail[];
  dailyCounts: DailyProductionCount[];
  completedStages: CompletedStageDetail[];
  excludedHistoricalStagesCount: number;
  paceTrackingStartedAt?: number | null;

  // Current Active Stage Info
  currentActiveStageDetail?: {
    wellId: string;
    wellName: string;
    stageNumber: number;
    fractionComplete: number;
    fractionRemaining: number;
    pumpedSandLbs: number;
    designSandLbs: number;
    firstRunAt?: number | null;
    elapsedHours?: number;
    estimatedRemainingHours?: number;
  } | null;
}

/**
 * Derives a trusted completion timestamp specifically for stage pace forecasting.
 * 
 * TRUSTED PACE SOURCE RULE:
 * Only stages with completionTimestampSource === 'live' or 'correction' with a valid positive
 * completedAt timestamp contribute to stages/day calculations.
 * 
 * Historical imported/backfilled stages ('history_backfill') or uncertified legacy sources
 * return null for pace calculations so that bulk imported data does NOT distort real daily pace.
 */
export function getTrustedPaceCompletionTimestamp(
  stateOrRecord: AppState | StageRecord,
  wellId?: string,
  stageNumber?: number
): number | null {
  let sr: StageRecord | undefined;

  if ('status' in stateOrRecord && 'stageNumber' in stateOrRecord) {
    sr = stateOrRecord as StageRecord;
  } else {
    const state = stateOrRecord as AppState;
    if (state.stageRecords && wellId !== undefined && stageNumber !== undefined) {
      const stageKey = `${wellId}_stage_${stageNumber}`;
      if (Array.isArray(state.stageRecords)) {
        sr = state.stageRecords.find((r) => r && r.wellId === wellId && r.stageNumber === stageNumber);
      } else if (typeof state.stageRecords === 'object') {
        sr =
          state.stageRecords[stageKey] ||
          Object.values(state.stageRecords).find(
            (r) => r && r.wellId === wellId && r.stageNumber === stageNumber
          );
      }
    }
  }

  if (!sr) {
    return null;
  }

  if (sr.status !== 'complete') {
    return null;
  }

  // Strict allow-list: Pace timestamps are trusted ONLY when 'live' or 'correction'
  if (
    sr.completionTimestampSource !== 'live' &&
    sr.completionTimestampSource !== 'correction'
  ) {
    return null;
  }

  if (!sr.completedAt || sr.completedAt <= 0) {
    return null;
  }

  return sr.completedAt;
}

/**
 * Derives a reliable completion timestamp for a completed stage (for Stage Book / history display).
 * Returns null if the stage is not complete or has no valid timestamp information,
 * preventing artificial assignment to today's date.
 */
export function getReliableStageCompletionTimestamp(
  state: AppState,
  wellId: string,
  stageNumber: number
): number | null {
  // 1. Check authoritative StageRecord if present
  let sr: StageRecord | undefined;
  if (state.stageRecords) {
    const stageKey = `${wellId}_stage_${stageNumber}`;
    if (Array.isArray(state.stageRecords)) {
      sr = state.stageRecords.find((r) => r && r.wellId === wellId && r.stageNumber === stageNumber);
    } else if (typeof state.stageRecords === 'object') {
      sr =
        state.stageRecords[stageKey] ||
        Object.values(state.stageRecords).find(
          (r) => r && r.wellId === wellId && r.stageNumber === stageNumber
        );
    }
  }

  // LIVE / CORRECTION: StageRecord.completedAt is authoritative.
  if (
    sr &&
    sr.status === 'complete' &&
    sr.completedAt &&
    sr.completedAt > 0 &&
    (sr.completionTimestampSource === 'live' || sr.completionTimestampSource === 'correction')
  ) {
    return sr.completedAt;
  }

  // HISTORY_BACKFILL or LEGACY / UNKNOWN SOURCE:
  // If active historical RunRecords have a valid final timestamp, use the final RunRecord timestamp.
  const stageRuns = (state.runs || []).filter(
    (r) => !r.deleted && r.wellId === wellId && r.stageNumber === stageNumber
  );

  if (stageRuns.length > 0) {
    let maxRunTime = 0;
    for (const r of stageRuns) {
      const time = r.createdAt || (r.date ? new Date(`${r.date}T12:00:00Z`).getTime() : 0);
      if (time > maxRunTime) {
        maxRunTime = time;
      }
    }
    if (maxRunTime > 0) {
      return maxRunTime;
    }
  }

  // Only use StageRecord.completedAt if no usable run timestamp exists.
  if (sr && sr.status === 'complete' && sr.completedAt && sr.completedAt > 0) {
    return sr.completedAt;
  }

  return null;
}

export function calculateSandDesignForStage(
  state: AppState,
  wellId: string,
  _stageNumber: number
): number {
  const well = state.config?.wells?.find((w) => w.id === wellId);
  let totalDesignLbs = 0;
  for (const st of state.config?.sandTypes || []) {
    totalDesignLbs += getEffectivePerStageDesign(well, st);
  }
  return totalDesignLbs > 0 ? totalDesignLbs : 300000;
}

export function calculateStagePace(
  state: AppState,
  referenceDateStrOrOptions?: string | StagePaceOptions
): StagePaceStats {
  let referenceDateStr: string | undefined;
  let referenceTime: number | undefined;

  if (typeof referenceDateStrOrOptions === 'string') {
    referenceDateStr = referenceDateStrOrOptions;
  } else if (referenceDateStrOrOptions && typeof referenceDateStrOrOptions === 'object') {
    referenceDateStr = referenceDateStrOrOptions.referenceDateStr;
    referenceTime = referenceDateStrOrOptions.referenceTime;
  }

  const todayOperationalDate = referenceDateStr || getOperationalDate(referenceTime);
  const nowTimestamp =
    referenceTime || (referenceDateStr ? new Date(`${referenceDateStr}T12:00:00Z`).getTime() : Date.now());

  const wells = state.config.wells || [];
  let totalPlannedStages = 0;
  let totalCompletedStages = 0;
  const completedStagesForPace: CompletedStageDetail[] = [];

  for (const well of wells) {
    const planned = well.plannedStages || 0;
    totalPlannedStages += planned;

    // Check all planned stages plus any extra stages that have runs or records
    const wellRuns = (state.runs || []).filter((r) => !r.deleted && r.wellId === well.id);
    const maxStageInRuns = wellRuns.reduce((max, r) => Math.max(max, r.stageNumber || 0), 0);
    let maxStageInRecords = 0;
    if (state.stageRecords) {
      if (Array.isArray(state.stageRecords)) {
        maxStageInRecords = state.stageRecords
          .filter((sr) => sr && sr.wellId === well.id)
          .reduce((max, sr) => Math.max(max, sr.stageNumber || 0), 0);
      } else if (typeof state.stageRecords === 'object') {
        maxStageInRecords = Object.values(state.stageRecords)
          .filter((sr) => sr && sr.wellId === well.id)
          .reduce((max, sr) => Math.max(max, sr.stageNumber || 0), 0);
      }
    }
    const maxStage = Math.max(planned, maxStageInRuns, maxStageInRecords);

    for (let stage = 1; stage <= maxStage; stage++) {
      if (isStageComplete(state, well.id, stage)) {
        totalCompletedStages++;
        const trustedCompletedAt = getTrustedPaceCompletionTimestamp(state, well.id, stage);

        if (trustedCompletedAt !== null && trustedCompletedAt > 0) {
          const operationalDate = getOperationalDate(trustedCompletedAt);
          completedStagesForPace.push({
            wellId: well.id,
            wellName: well.name,
            stageNumber: stage,
            completedAt: trustedCompletedAt,
            operationalDate,
          });
        }
      }
    }
  }

  const totalRemainingStages = Math.max(0, totalPlannedStages - totalCompletedStages);
  const excludedHistoricalStagesCount = Math.max(0, totalCompletedStages - completedStagesForPace.length);

  // Sort trusted completed stages chronologically
  completedStagesForPace.sort((a, b) => a.completedAt - b.completedAt);

  // 1. Calculate Stage Cycles (Time between consecutive stage completions)
  const stageCycles: StageCycleDetail[] = [];
  for (let i = 1; i < completedStagesForPace.length; i++) {
    const prev = completedStagesForPace[i - 1];
    const curr = completedStagesForPace[i];
    const durationHours = (curr.completedAt - prev.completedAt) / (1000 * 3600);
    if (durationHours > 0) {
      stageCycles.push({
        wellId: curr.wellId,
        wellName: curr.wellName,
        stageNumber: curr.stageNumber,
        completedAt: curr.completedAt,
        previousCompletedAt: prev.completedAt,
        cycleDurationHours: durationHours,
        isOutlierDowntime: false,
      });
    }
  }

  // 2. Adaptive Stage Cycle Estimation (Using most recent 8-12 cycles)
  let adaptiveStageCycleHours: number | null = null;
  let adaptiveStagesPerDay: number | null = null;
  let adaptiveCyclesUsed = 0;
  let extendedDowntimeDetectedHours: number | null = null;
  let extendedDowntimeNote: string | null = null;
  let confidence: ForecastConfidence = 'WAITING FOR HISTORY';

  const recentCycleSlice = stageCycles.slice(-12);
  if (recentCycleSlice.length >= 2) {
    const durations = recentCycleSlice.map((c) => c.cycleDurationHours).sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    const medianDuration =
      durations.length % 2 === 0 ? (durations[mid - 1] + durations[mid]) / 2 : durations[mid];

    // Outlier downtime detection: cycle >= 6.0h AND (cycle >= 2.0x median OR cycle >= 8.0h)
    let totalOutlierDowntime = 0;
    for (const cycle of recentCycleSlice) {
      if (
        cycle.cycleDurationHours >= 6.0 &&
        (cycle.cycleDurationHours >= 2.0 * medianDuration || cycle.cycleDurationHours >= 8.0)
      ) {
        cycle.isOutlierDowntime = true;
        cycle.downtimeReason = 'Extended downtime / shutdown';
        totalOutlierDowntime += cycle.cycleDurationHours;
      }
    }

    if (totalOutlierDowntime > 0) {
      extendedDowntimeDetectedHours = totalOutlierDowntime;
      extendedDowntimeNote = `Extended downtime detected: ${formatHoursAndMinutes(
        totalOutlierDowntime
      )} (Excluded from Adaptive cycle estimate, included in Rolling 24h)`;
    }

    const normalCycles = recentCycleSlice.filter((c) => !c.isOutlierDowntime);
    if (normalCycles.length >= 2) {
      const K = normalCycles.length;
      let weightedSum = 0;
      let totalWeights = 0;
      for (let k = 0; k < K; k++) {
        const weight = 1 + 0.15 * (k / (K - 1));
        weightedSum += normalCycles[k].cycleDurationHours * weight;
        totalWeights += weight;
      }
      adaptiveStageCycleHours = weightedSum / totalWeights;
      adaptiveStagesPerDay = 24 / adaptiveStageCycleHours;
      adaptiveCyclesUsed = K;

      // Calculate sample standard deviation
      const avg = normalCycles.reduce((s, c) => s + c.cycleDurationHours, 0) / K;
      const variance =
        normalCycles.reduce((s, c) => s + Math.pow(c.cycleDurationHours - avg, 2), 0) / (K - 1);
      const stdDev = Math.sqrt(variance);
      const relVariance = avg > 0 ? stdDev / avg : 1;

      if (K >= 8 && relVariance < 0.35) {
        confidence = 'HIGH';
      } else if (K >= 4) {
        confidence = 'MEDIUM';
      } else {
        confidence = 'LOW';
      }
    } else if (normalCycles.length === 1) {
      adaptiveStageCycleHours = normalCycles[0].cycleDurationHours;
      adaptiveStagesPerDay = 24 / adaptiveStageCycleHours;
      adaptiveCyclesUsed = 1;
      confidence = 'LOW';
    } else {
      adaptiveStageCycleHours = null;
      adaptiveStagesPerDay = null;
      adaptiveCyclesUsed = 0;
      confidence = 'LOW';
    }
  } else if (recentCycleSlice.length === 1) {
    adaptiveStageCycleHours = recentCycleSlice[0].cycleDurationHours;
    adaptiveStagesPerDay = 24 / adaptiveStageCycleHours;
    adaptiveCyclesUsed = 1;
    confidence = 'LOW';
  } else {
    confidence = 'LOW';
  }

  // 3. Rolling 24 Hours Pace
  const reference24hTime =
    referenceTime ||
    (completedStagesForPace.length > 0
      ? completedStagesForPace[completedStagesForPace.length - 1].completedAt
      : nowTimestamp);
  const t24Start = reference24hTime - 24 * 3600 * 1000;
  const stagesIn24h = completedStagesForPace.filter(
    (cs) => cs.completedAt >= t24Start && cs.completedAt <= reference24hTime
  );
  const rolling24hCompletedStages = stagesIn24h.length;
  let rolling24hStagesPerDay = 0;

  if (completedStagesForPace.length > 0) {
    const earliestTime = completedStagesForPace[0].completedAt;
    const elapsedPadHours = (reference24hTime - earliestTime) / 3600000;
    if (elapsedPadHours > 0 && elapsedPadHours < 24) {
      rolling24hStagesPerDay = (rolling24hCompletedStages / Math.max(1, elapsedPadHours)) * 24;
    } else {
      rolling24hStagesPerDay = rolling24hCompletedStages;
    }
  }
  const rolling24hHoursPerStage = rolling24hStagesPerDay > 0 ? 24 / rolling24hStagesPerDay : null;

  // 4. Daily Production Counts & Calendar Day Averages
  const dateCountsMap = new Map<string, number>();
  for (const cs of completedStagesForPace) {
    const d = cs.operationalDate;
    dateCountsMap.set(d, (dateCountsMap.get(d) || 0) + 1);
  }

  const dailyCounts: DailyProductionCount[] = Array.from(dateCountsMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayCompletedStages = dateCountsMap.get(todayOperationalDate) || 0;
  const earliestOperationalDate = dailyCounts.length > 0 ? dailyCounts[0].date : todayOperationalDate;

  // Prior Calendar Days for Recent 3-day and 7-day windows (0-stage days explicitly counted)
  const priorDay1 = addOperationalDays(todayOperationalDate, -1);
  const priorDay2 = addOperationalDays(todayOperationalDate, -2);
  const priorDay3 = addOperationalDays(todayOperationalDate, -3);

  let recentAverageStagesPerDay = 0;
  let daysUsedForRecentAverage = 0;

  if (earliestOperationalDate <= priorDay3) {
    // All 3 prior calendar days are within pad active pumping history
    const sum3 =
      (dateCountsMap.get(priorDay1) || 0) +
      (dateCountsMap.get(priorDay2) || 0) +
      (dateCountsMap.get(priorDay3) || 0);
    recentAverageStagesPerDay = sum3 / 3;
    daysUsedForRecentAverage = 3;
  } else {
    // Pad has fewer than 3 prior days
    const priorSeq = generateDateSequence(earliestOperationalDate, priorDay1);
    if (priorSeq.length > 0 && priorDay1 >= earliestOperationalDate) {
      const sum = priorSeq.reduce((acc, d) => acc + (dateCountsMap.get(d) || 0), 0);
      recentAverageStagesPerDay = sum / priorSeq.length;
      daysUsedForRecentAverage = priorSeq.length;
    } else {
      // Only today exists
      recentAverageStagesPerDay = todayCompletedStages;
      daysUsedForRecentAverage = 1;
    }
  }
  const recentHoursPerStage = recentAverageStagesPerDay > 0 ? 24 / recentAverageStagesPerDay : null;

  // 7-Day Average
  const priorDay7 = addOperationalDays(todayOperationalDate, -7);
  let sevenDayAverageStagesPerDay = 0;
  let daysUsedForSevenDayAverage = 0;

  if (earliestOperationalDate <= priorDay7) {
    const seq7 = generateDateSequence(priorDay7, priorDay1);
    const sum7 = seq7.reduce((acc, d) => acc + (dateCountsMap.get(d) || 0), 0);
    sevenDayAverageStagesPerDay = sum7 / 7;
    daysUsedForSevenDayAverage = 7;
  } else {
    const priorSeq = generateDateSequence(earliestOperationalDate, priorDay1);
    if (priorSeq.length > 0 && priorDay1 >= earliestOperationalDate) {
      const sum = priorSeq.reduce((acc, d) => acc + (dateCountsMap.get(d) || 0), 0);
      sevenDayAverageStagesPerDay = sum / priorSeq.length;
      daysUsedForSevenDayAverage = priorSeq.length;
    } else {
      sevenDayAverageStagesPerDay = todayCompletedStages;
      daysUsedForSevenDayAverage = 1;
    }
  }
  const sevenDayHoursPerStage =
    sevenDayAverageStagesPerDay > 0 ? 24 / sevenDayAverageStagesPerDay : null;

  // Overall Tracked Average
  const latestPumpingDate =
    todayCompletedStages > 0
      ? todayOperationalDate
      : dailyCounts.length > 0
        ? dailyCounts[dailyCounts.length - 1].date
        : todayOperationalDate;
  const totalPumpingDays =
    completedStagesForPace.length > 0
      ? generateDateSequence(earliestOperationalDate, latestPumpingDate).length
      : 0;
  const jobAverageStagesPerDay =
    totalPumpingDays > 0 ? completedStagesForPace.length / totalPumpingDays : 0;
  const jobHoursPerStage = jobAverageStagesPerDay > 0 ? 24 / jobAverageStagesPerDay : null;

  // 5. Check Active In-Progress Stage Detail
  let currentActiveStageDetail: StagePaceStats['currentActiveStageDetail'] = null;
  if (state.runs && state.runs.length > 0) {
    for (const well of wells) {
      for (let s = 1; s <= (well.plannedStages || 0); s++) {
        if (!isStageComplete(state, well.id, s)) {
          const activeRuns = state.runs.filter(
            (r) => !r.deleted && r.wellId === well.id && r.stageNumber === s
          );
          if (activeRuns.length > 0) {
            const pumpedSandLbs = activeRuns.reduce((acc, r) => acc + (r.lbsPulled || 0), 0);
            const designSandLbs = calculateSandDesignForStage(state, well.id, s);
            const fractionComplete =
              designSandLbs > 0 ? Math.min(0.95, pumpedSandLbs / designSandLbs) : 0.5;
            const fractionRemaining = Math.max(0.05, 1 - fractionComplete);
            const firstRunAt = Math.min(...activeRuns.map((r) => r.createdAt || nowTimestamp));
            const elapsedHours = (nowTimestamp - firstRunAt) / 3600000;

            currentActiveStageDetail = {
              wellId: well.id,
              wellName: well.name,
              stageNumber: s,
              fractionComplete,
              fractionRemaining,
              pumpedSandLbs,
              designSandLbs,
              firstRunAt,
              elapsedHours: Math.max(0, elapsedHours),
            };
            break;
          }
        }
      }
      if (currentActiveStageDetail) break;
    }
  }

  // 6. Legacy Confidence Label
  let confidenceLabel: 'WAITING FOR STAGE HISTORY' | 'EARLY ESTIMATE' | 'RECENT PACE' | 'ESTABLISHED PACE' =
    'WAITING FOR STAGE HISTORY';
  if (totalCompletedStages === 0 || completedStagesForPace.length === 0) {
    confidenceLabel = 'WAITING FOR STAGE HISTORY';
  } else if (totalPumpingDays <= 2 || adaptiveCyclesUsed < 4) {
    confidenceLabel = 'EARLY ESTIMATE';
  } else if (totalPumpingDays < 7 || adaptiveCyclesUsed < 8) {
    confidenceLabel = 'RECENT PACE';
  } else {
    confidenceLabel = 'ESTABLISHED PACE';
  }

  const outlierCount = stageCycles.filter((c) => c.isOutlierDowntime).length;

  return {
    totalCompletedStages,
    totalPlannedStages,
    totalRemainingStages,
    todayCompletedStages,
    todayOperationalDate,
    adaptiveStageCycleHours,
    adaptiveStagesPerDay,
    adaptiveCyclesUsed,
    outlierCount,
    extendedDowntimeDetectedHours,
    extendedDowntimeNote,
    rolling24hCompletedStages,
    rolling24hStagesPerDay,
    rolling24hHoursPerStage,
    recentAverageStagesPerDay,
    recentHoursPerStage,
    daysUsedForRecentAverage,
    sevenDayAverageStagesPerDay,
    sevenDayHoursPerStage,
    daysUsedForSevenDayAverage,
    jobAverageStagesPerDay,
    jobHoursPerStage,
    totalPumpingDays,
    confidence,
    confidenceLabel,
    stageCycles,
    dailyCounts,
    completedStages: completedStagesForPace,
    excludedHistoricalStagesCount,
    paceTrackingStartedAt: state.config.paceTrackingStartedAt || null,
    currentActiveStageDetail,
  };
}

export interface ForecastOptions {
  mode?: ForecastMode;
  manualStagesPerDay?: number;
  manualHoursPerStage?: number;
  referenceTime?: number; // ms timestamp
  asOfTimestamp?: number; // ms timestamp
  currentOperationalDate?: string;
  stagePaceStats?: StagePaceStats;
}

export interface ForecastResult {
  mode: ForecastMode;
  projectedHoursRemaining: number | null;
  projectedDaysRemaining: number | null;
  calendarDays: number | null;
  projectedFinishTimestamp: number | null;
  finishDate: string | null;
  finishTimeDisplay: string | null;
  finishDateTimeDisplay: string | null;
  stagesPerDay: number | null;
  hoursPerStage: number | null;
  effectiveHoursPerStage?: number | null;
  effectiveStagesPerDay?: number | null;
  paceDescription: string;
  isComplete: boolean;
  confidence: ForecastConfidence;
  fallbackApplied?: string | null;
}

export function calculateProjectedFinish(
  remainingStages: number,
  stagesPerDayOrOptions?: number | ForecastOptions,
  currentOperationalDateOrState?: string | AppState
): ForecastResult {
  let mode: ForecastMode = 'adaptive';
  let stagesPerDayInput: number | undefined;
  let hoursPerStageInput: number | undefined;
  let referenceTime: number = Date.now();
  let currentOperationalDate: string = getOperationalDate();
  let stagePaceStats: StagePaceStats | undefined;

  if (typeof stagesPerDayOrOptions === 'number') {
    stagesPerDayInput = stagesPerDayOrOptions;
    mode = 'manual';
    if (typeof currentOperationalDateOrState === 'string') {
      currentOperationalDate = currentOperationalDateOrState;
      // Derive referenceTime at noon Central on that operational date
      referenceTime = new Date(`${currentOperationalDate}T17:00:00Z`).getTime();
    }
  } else if (stagesPerDayOrOptions && typeof stagesPerDayOrOptions === 'object') {
    mode = stagesPerDayOrOptions.mode || 'adaptive';
    stagesPerDayInput = stagesPerDayOrOptions.manualStagesPerDay;
    hoursPerStageInput = stagesPerDayOrOptions.manualHoursPerStage;
    if (stagesPerDayOrOptions.asOfTimestamp) {
      referenceTime = stagesPerDayOrOptions.asOfTimestamp;
    } else if (stagesPerDayOrOptions.referenceTime) {
      referenceTime = stagesPerDayOrOptions.referenceTime;
    }
    if (stagesPerDayOrOptions.currentOperationalDate) {
      currentOperationalDate = stagesPerDayOrOptions.currentOperationalDate;
      if (!stagesPerDayOrOptions.asOfTimestamp && !stagesPerDayOrOptions.referenceTime) {
        referenceTime = new Date(`${currentOperationalDate}T17:00:00Z`).getTime();
      }
    } else {
      currentOperationalDate = getOperationalDate(referenceTime);
    }
    stagePaceStats = stagesPerDayOrOptions.stagePaceStats;
  }

  if (!stagePaceStats && currentOperationalDateOrState && typeof currentOperationalDateOrState === 'object') {
    stagePaceStats = calculateStagePace(currentOperationalDateOrState as AppState, {
      referenceDateStr: currentOperationalDate,
      referenceTime,
      mode,
    });
  }

  if (remainingStages <= 0) {
    return {
      mode,
      projectedHoursRemaining: 0,
      projectedDaysRemaining: 0,
      calendarDays: 0,
      projectedFinishTimestamp: referenceTime,
      finishDate: currentOperationalDate,
      finishTimeDisplay: formatForecastTimeDisplay(referenceTime),
      finishDateTimeDisplay: 'ALL PAD STAGES COMPLETED',
      stagesPerDay: 0,
      hoursPerStage: 0,
      effectiveHoursPerStage: 0,
      effectiveStagesPerDay: 0,
      paceDescription: 'Pad is 100% complete',
      isComplete: true,
      confidence: 'HIGH',
    };
  }

  let effectiveStagesPerDay: number | null = null;
  let effectiveHoursPerStage: number | null = null;
  let paceDescription = '';
  let confidence: ForecastConfidence = stagePaceStats?.confidence || 'MEDIUM';
  let fallbackApplied: string | null = null;

  if (mode === 'manual') {
    if (hoursPerStageInput && hoursPerStageInput > 0) {
      effectiveHoursPerStage = hoursPerStageInput;
      effectiveStagesPerDay = 24 / hoursPerStageInput;
      paceDescription = `Manual Pace: ${formatHoursAndMinutes(effectiveHoursPerStage)}/stage (${effectiveStagesPerDay.toFixed(1)} stg/day)`;
    } else if (stagesPerDayInput && stagesPerDayInput > 0) {
      effectiveStagesPerDay = stagesPerDayInput;
      effectiveHoursPerStage = 24 / stagesPerDayInput;
      paceDescription = `Manual Pace: ${effectiveStagesPerDay.toFixed(1)} stg/day (${formatHoursAndMinutes(effectiveHoursPerStage)}/stage)`;
    }
  } else if (mode === 'rolling_24h') {
    if (stagePaceStats && stagePaceStats.rolling24hStagesPerDay > 0) {
      effectiveStagesPerDay = stagePaceStats.rolling24hStagesPerDay;
      effectiveHoursPerStage = stagePaceStats.rolling24hHoursPerStage;
      paceDescription = `Rolling 24h: ${effectiveStagesPerDay.toFixed(1)} stg/day (${formatHoursAndMinutes(effectiveHoursPerStage)}/stage)`;
      confidence = stagePaceStats.rolling24hCompletedStages >= 4 ? 'HIGH' : 'MEDIUM';
    }
  } else if (mode === 'recent_3d') {
    if (stagePaceStats && stagePaceStats.recentAverageStagesPerDay > 0) {
      effectiveStagesPerDay = stagePaceStats.recentAverageStagesPerDay;
      effectiveHoursPerStage = stagePaceStats.recentHoursPerStage;
      paceDescription = `Recent 3-Day: ${effectiveStagesPerDay.toFixed(1)} stg/day (${formatHoursAndMinutes(effectiveHoursPerStage)}/stage)`;
      confidence = stagePaceStats.daysUsedForRecentAverage >= 3 ? 'HIGH' : 'MEDIUM';
    }
  } else if (mode === 'recent_7d') {
    if (stagePaceStats && stagePaceStats.sevenDayAverageStagesPerDay > 0) {
      effectiveStagesPerDay = stagePaceStats.sevenDayAverageStagesPerDay;
      effectiveHoursPerStage = stagePaceStats.sevenDayHoursPerStage;
      paceDescription = `Recent 7-Day: ${effectiveStagesPerDay.toFixed(1)} stg/day (${formatHoursAndMinutes(effectiveHoursPerStage)}/stage)`;
      confidence = stagePaceStats.daysUsedForSevenDayAverage >= 5 ? 'HIGH' : 'MEDIUM';
    }
  } else {
    // Mode is 'adaptive'
    if (stagePaceStats && stagePaceStats.adaptiveStageCycleHours !== null && stagePaceStats.adaptiveCyclesUsed >= 1) {
      effectiveHoursPerStage = stagePaceStats.adaptiveStageCycleHours;
      effectiveStagesPerDay = stagePaceStats.adaptiveStagesPerDay;
      paceDescription = `Adaptive Cycle: ${formatHoursAndMinutes(effectiveHoursPerStage)}/stage (${effectiveStagesPerDay ? effectiveStagesPerDay.toFixed(1) : '--'} stg/day)`;
      confidence = stagePaceStats.confidence;
    } else if (stagePaceStats && stagePaceStats.recentAverageStagesPerDay > 0) {
      // Fallback 1: Recent 3 Days
      effectiveStagesPerDay = stagePaceStats.recentAverageStagesPerDay;
      effectiveHoursPerStage = stagePaceStats.recentHoursPerStage;
      fallbackApplied = 'Fallback to Recent 3 Days (insufficient cycle history)';
      paceDescription = `Recent 3-Day Pace: ${effectiveStagesPerDay.toFixed(1)} stg/day`;
      confidence = 'LOW';
    } else if (stagePaceStats && stagePaceStats.jobAverageStagesPerDay > 0) {
      // Fallback 2: Tracked Average
      effectiveStagesPerDay = stagePaceStats.jobAverageStagesPerDay;
      effectiveHoursPerStage = stagePaceStats.jobHoursPerStage;
      fallbackApplied = 'Fallback to Tracked Average';
      paceDescription = `Tracked Average: ${effectiveStagesPerDay.toFixed(1)} stg/day`;
      confidence = 'LOW';
    } else if (stagesPerDayInput && stagesPerDayInput > 0) {
      effectiveStagesPerDay = stagesPerDayInput;
      effectiveHoursPerStage = 24 / stagesPerDayInput;
      fallbackApplied = 'Fallback to Manual Rate';
      paceDescription = `Manual Pace: ${effectiveStagesPerDay.toFixed(1)} stg/day`;
      confidence = 'LOW';
    }
  }

  // If still no valid pace, return graceful Waiting for History result
  if (!effectiveHoursPerStage || effectiveHoursPerStage <= 0 || !effectiveStagesPerDay || effectiveStagesPerDay <= 0) {
    return {
      mode,
      projectedHoursRemaining: null,
      projectedDaysRemaining: null,
      calendarDays: null,
      projectedFinishTimestamp: null,
      finishDate: null,
      finishTimeDisplay: null,
      finishDateTimeDisplay: null,
      stagesPerDay: null,
      hoursPerStage: null,
      effectiveHoursPerStage: null,
      effectiveStagesPerDay: null,
      paceDescription: 'Waiting for stage history to establish pace',
      isComplete: false,
      confidence: stagePaceStats?.confidence || 'LOW',
      fallbackApplied,
    };
  }

  // Precision Remaining Time Calculation (preserving fractional hours and in-progress stage progress)
  let projectedHoursRemaining: number;
  const activeStage = stagePaceStats?.currentActiveStageDetail;

  if (activeStage && activeStage.fractionRemaining > 0 && remainingStages >= 1) {
    const currentStageHours = activeStage.fractionRemaining * effectiveHoursPerStage;
    const futureStagesHours = Math.max(0, remainingStages - 1) * effectiveHoursPerStage;
    projectedHoursRemaining = currentStageHours + futureStagesHours;
  } else {
    projectedHoursRemaining = remainingStages * effectiveHoursPerStage;
  }

  const projectedDaysRemaining = projectedHoursRemaining / 24;
  const calendarDays = Math.ceil(projectedDaysRemaining);
  const projectedFinishTimestamp = referenceTime + projectedHoursRemaining * 3600 * 1000;
  const finishDate = addOperationalDays(currentOperationalDate, calendarDays);
  const finishTimeDisplay = formatForecastTimeDisplay(projectedFinishTimestamp);
  const finishDateTimeDisplay = formatForecastDateTimeDisplay(projectedFinishTimestamp);

  return {
    mode,
    projectedHoursRemaining,
    projectedDaysRemaining,
    calendarDays,
    projectedFinishTimestamp,
    finishDate,
    finishTimeDisplay,
    finishDateTimeDisplay,
    stagesPerDay: effectiveStagesPerDay,
    hoursPerStage: effectiveHoursPerStage,
    effectiveHoursPerStage,
    effectiveStagesPerDay,
    paceDescription,
    isComplete: false,
    confidence,
    fallbackApplied,
  };
}
