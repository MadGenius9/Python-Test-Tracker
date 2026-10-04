import {
  AppState,
  DeliveryTicket,
  PartialStageSummary,
  ReconciliationIssue,
  ReconciliationSummary,
  RotationReconciliationStatus,
  SandReconciliationSummary,
  ShiftHandoff,
  SiloReconciliationSummary,
  StageAuditSummary,
  StageSummary,
  SyncReconciliationStatus,
  TicketAuditSummary,
  WellReconciliationStatus,
} from '../types';
import { getOperationalDate, getOperationalTime } from './dateUtils';
import { getFirestoreConnectionStatus } from './firebase';
import {
  calculateSandTypeTotalOnHand,
  calculateSiloOnHandForSand,
  getAuthoritativeRotationPointer,
  getConfiguredSiloNumbers,
  getNextNumericalSilo,
  getSiloDerivedStates,
  sortStageRunsByActualSequence,
} from './sandRules';
import { buildStageSummaries, getStageSummary } from './stageHistory';

// Shared Reconciliation Constants
export const RECONCILIATION_TOLERANCE_EXACT = 1; // 0–1 lb: RECONCILED
export const RECONCILIATION_TOLERANCE_MINOR = 500; // 2–500 lb: MINOR VARIANCE

/**
 * Formats a variance number into clear operational language:
 * 0 lb -> "0 LB RECONCILED"
 * negative -> "X LB SHORT"
 * positive -> "X LB OVER"
 */
export function formatVarianceDisplay(varianceLbs: number): string {
  const rounded = Math.round(varianceLbs);
  if (Math.abs(rounded) <= RECONCILIATION_TOLERANCE_EXACT) {
    return '0 LB RECONCILED';
  }
  if (rounded < 0) {
    return `${Math.abs(rounded).toLocaleString()} LB SHORT`;
  }
  return `${rounded.toLocaleString()} LB OVER`;
}

/**
 * Pure calculation engine for Sand Tracker Reconciliation.
 * Gathers current active deliveries, runs, silo derived balances,
 * stage execution history, and rotation checks without mutating state.
 */
export function calculateReconciliation(state: AppState): ReconciliationSummary {
  const padId = state.padId || 'unknown-pad';
  const padName = state.config?.padName || 'Unnamed Pad';
  const generatedAt = Date.now();

  const issues: ReconciliationIssue[] = [];

  // 1. Deliveries Calculation (Active non-deleted only)
  const activeDeliveries = (state.deliveries || []).filter((d) => !d.deleted);
  const deletedDeliveries = (state.deliveries || []).filter((d) => d.deleted).concat(state.deletedDeliveries || []);
  const totalDeliveredLbs = activeDeliveries.reduce((sum, d) => sum + (d.lbs || 0), 0);

  // 2. Pumped Calculation (Active non-deleted RunRecords only)
  const activeRuns = (state.runs || []).filter((r) => !r.deleted);
  const deletedRuns = (state.runs || []).filter((r) => r.deleted).concat(state.deletedRuns || []);
  const totalPumpedLbs = activeRuns.reduce((sum, r) => sum + (r.lbsPulled || 0), 0);

  // 3. Silo Inventory (Authoritative balances)
  const siloDerived = getSiloDerivedStates(state);
  const totalSiloInventoryLbs = siloDerived.reduce((sum, s) => sum + s.onHandLbs, 0);

  // Starting balance pad-wide
  const totalStartingBalanceLbs = (state.config?.silos || []).reduce(
    (sum, s) => sum + (s.startingBalanceLbs || 0),
    0
  );

  // Expected On Location = Total Starting Balance + Active Delivered - Active Pumped
  const totalExpectedOnLocationLbs = totalStartingBalanceLbs + totalDeliveredLbs - totalPumpedLbs;

  // Total Variance = Silo Inventory - Expected On Location
  const totalVarianceLbs = totalSiloInventoryLbs - totalExpectedOnLocationLbs;
  const varianceDisplay = formatVarianceDisplay(totalVarianceLbs);

  // 4. Per-Sand Reconciliation
  const sandSummaries: SandReconciliationSummary[] = (state.config?.sandTypes || []).map((st) => {
    const sandName = st.name;

    const delivered = activeDeliveries
      .filter((d) => d.sandType === sandName)
      .reduce((sum, d) => sum + (d.lbs || 0), 0);

    const pumped = activeRuns
      .filter((r) => r.sandType === sandName)
      .reduce((sum, r) => sum + (r.lbsPulled || 0), 0);

    const sandStartingBalance = (state.config?.silos || [])
      .filter((s) => s.sandType === sandName)
      .reduce((sum, s) => sum + (s.startingBalanceLbs || 0), 0);

    const expected = sandStartingBalance + delivered - pumped;
    const siloInventory = calculateSandTypeTotalOnHand(sandName, state);
    const variance = siloInventory - expected;

    let status: 'reconciled' | 'minor_variance' | 'needs_review' = 'reconciled';
    if (Math.abs(variance) > RECONCILIATION_TOLERANCE_MINOR) {
      status = 'needs_review';
    } else if (Math.abs(variance) > RECONCILIATION_TOLERANCE_EXACT) {
      status = 'minor_variance';
    }

    return {
      sandType: sandName,
      deliveredLbs: delivered,
      pumpedLbs: pumped,
      expectedOnLocationLbs: expected,
      siloInventoryLbs: siloInventory,
      varianceLbs: variance,
      status,
      varianceDisplay: formatVarianceDisplay(variance),
    };
  });

  // Check top-level inventory discrepancy issue
  if (Math.abs(totalVarianceLbs) > RECONCILIATION_TOLERANCE_MINOR) {
    issues.push({
      id: 'issue-inv-discrepancy',
      severity: 'critical',
      category: 'inventory',
      title: 'Inventory Discrepancy',
      description: `Pad-wide calculated silo inventory differs from expected inventory by ${varianceDisplay}.`,
    });
  } else if (Math.abs(totalVarianceLbs) > RECONCILIATION_TOLERANCE_EXACT) {
    issues.push({
      id: 'issue-inv-minor-variance',
      severity: 'warning',
      category: 'inventory',
      title: 'Minor Inventory Variance',
      description: `Pad inventory has a minor variance of ${varianceDisplay}.`,
    });
  }

  // 5. Silo Health Summaries & Checks
  const siloSummaries: SiloReconciliationSummary[] = (state.config?.silos || []).map((siloCfg) => {
    const derived = siloDerived.find((d) => d.siloNumber === siloCfg.siloNumber);
    const onHandLbs = derived ? derived.onHandLbs : calculateSiloOnHandForSand(siloCfg.siloNumber, siloCfg.sandType, state);
    const maxCapacityLbs = siloCfg.maxCapacityLbs || 350000;
    const isNegative = onHandLbs < 0;
    const isOverCapacity = onHandLbs > maxCapacityLbs;
    const percentFull = maxCapacityLbs > 0 ? (onHandLbs / maxCapacityLbs) * 100 : 0;
    const enabled = !siloCfg.isOutOfService;

    let status: 'OK' | 'LOW' | 'EMPTY' | 'OUT_OF_SERVICE' | 'NEGATIVE' | 'OVER_CAPACITY' = 'OK';
    let issueText: string | undefined;

    if (isNegative) {
      status = 'NEGATIVE';
      issueText = `SILO ${siloCfg.siloNumber} HAS NEGATIVE INVENTORY`;
      issues.push({
        id: `issue-silo-neg-${siloCfg.siloNumber}`,
        severity: 'critical',
        category: 'silo',
        title: `Silo ${siloCfg.siloNumber} Negative Inventory`,
        description: `Silo ${siloCfg.siloNumber} has calculated balance of ${onHandLbs.toLocaleString()} lb.`,
        relatedSiloNumber: siloCfg.siloNumber,
      });
    } else if (isOverCapacity) {
      status = 'OVER_CAPACITY';
      const overBy = onHandLbs - maxCapacityLbs;
      issueText = `SILO ${siloCfg.siloNumber} EXCEEDS CAPACITY BY ${overBy.toLocaleString()} LB`;
      issues.push({
        id: `issue-silo-overcap-${siloCfg.siloNumber}`,
        severity: 'critical',
        category: 'silo',
        title: `Silo ${siloCfg.siloNumber} Over Capacity`,
        description: `Silo ${siloCfg.siloNumber} (${onHandLbs.toLocaleString()} lb) exceeds capacity by ${overBy.toLocaleString()} lb.`,
        relatedSiloNumber: siloCfg.siloNumber,
      });
    } else if (!enabled) {
      status = 'OUT_OF_SERVICE';
      if (onHandLbs > 0) {
        issueText = `OUT OF SERVICE (${onHandLbs.toLocaleString()} LB INSIDE)`;
        issues.push({
          id: `issue-silo-oos-sand-${siloCfg.siloNumber}`,
          severity: 'warning',
          category: 'silo',
          title: `Silo ${siloCfg.siloNumber} Disabled with Sand`,
          description: `Silo ${siloCfg.siloNumber} is marked out of service but contains ${onHandLbs.toLocaleString()} lb of sand.`,
          relatedSiloNumber: siloCfg.siloNumber,
        });
      }
    } else if (onHandLbs === 0) {
      status = 'EMPTY';
    } else if (percentFull < 15) {
      status = 'LOW';
    }

    return {
      siloNumber: siloCfg.siloNumber,
      name: siloCfg.name,
      side: siloCfg.side,
      sandType: siloCfg.sandType,
      onHandLbs,
      capacityLbs: maxCapacityLbs,
      percentFull,
      enabled,
      isNegative,
      isOverCapacity,
      status,
      issueText,
    };
  });

  // 6. Stage Summaries & Partial Stages
  const stageSummaries = buildStageSummaries(state);

  // Current Well Statuses
  const wellStatuses: WellReconciliationStatus[] = (state.config?.wells || []).map((well) => {
    const wellStages = stageSummaries.filter((s) => s.wellId === well.id);
    const completedCount = wellStages.filter((s) => s.status === 'complete').length;

    // Find highest recorded stage number for this well
    const lastRunForWell = activeRuns
      .filter((r) => r.wellId === well.id)
      .sort((a, b) => b.stageNumber - a.stageNumber)[0];

    const currentStageNum = lastRunForWell ? lastRunForWell.stageNumber : 1;
    const currentSummary = getStageSummary(state, well.id, currentStageNum);

    let stageStatus: 'ready' | 'partial' | 'complete' | 'not_started' = 'not_started';
    if (currentSummary.status === 'partial') {
      stageStatus = 'partial';
    } else if (completedCount >= well.plannedStages) {
      stageStatus = 'complete';
    } else if (completedCount > 0 || currentSummary.status === 'complete') {
      stageStatus = 'ready';
    }

    const percentComplete = well.plannedStages > 0 ? (completedCount / well.plannedStages) * 100 : 0;

    return {
      wellId: well.id,
      wellName: well.name || well.id,
      currentStageNumber: currentStageNum,
      totalPlannedStages: well.plannedStages,
      stageStatus,
      percentComplete,
    };
  });

  // Partial Stages Breakdown
  const configuredSiloNumbers = getConfiguredSiloNumbers(state.config?.silos || []);
  const partialStages: PartialStageSummary[] = stageSummaries
    .filter((s) => s.status === 'partial')
    .map((s) => {
      const remainingLbs = Math.max(0, s.totalDesignLbs - s.totalActualLbs);

      // Determine actual pull sequence
      const pullSequence = s.runs.map((r, idx) => ({
        stepOrder: idx + 1,
        siloNumber: r.siloNumber,
        lbsPulled: r.lbsPulled,
        sandType: r.sandType,
      }));

      // Finish partials then rotate resume determination
      let resumeSilo: number | null = null;
      let resumeReason = '';

      if (s.runs.length > 0) {
        const lastRun = s.runs[s.runs.length - 1];
        const onHand = calculateSiloOnHandForSand(lastRun.siloNumber, lastRun.sandType, state);
        if (onHand > 0) {
          resumeSilo = lastRun.siloNumber;
          resumeReason = `S${lastRun.siloNumber} was partially used on the most recent actual pull and still contains sand.`;
        } else {
          resumeSilo = getNextNumericalSilo(lastRun.siloNumber, configuredSiloNumbers);
          resumeReason = `S${lastRun.siloNumber} was emptied. Rotate to next configured Silo ${resumeSilo}.`;
        }
      } else {
        resumeSilo = configuredSiloNumbers[0] || 1;
        resumeReason = 'Start on first configured silo.';
      }

      return {
        wellId: s.wellId,
        wellName: s.wellName,
        stageNumber: s.stageNumber,
        stageKey: s.stageKey,
        designLbs: s.totalDesignLbs,
        actualRecordedLbs: s.totalActualLbs,
        remainingLbs,
        pullSequence,
        resumeSilo,
        resumeReason,
      };
    });

  if (partialStages.length > 0) {
    issues.push({
      id: 'issue-partial-stages',
      severity: 'warning',
      category: 'stage',
      title: 'Active Partial Stages',
      description: `${partialStages.length} stage(s) have uncompleted sand pulls in progress.`,
    });
  }

  // 7. Last Completed Stage
  const completedStages = stageSummaries.filter((s) => s.status === 'complete');
  const lastCompletedStage: StageSummary | null = completedStages.length > 0 ? completedStages[0] : null;

  // 8. Rotation Check
  let rotationStatus: RotationReconciliationStatus;
  const sortedActiveRuns = [...activeRuns].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  if (sortedActiveRuns.length === 0) {
    const defaultStart = configuredSiloNumbers[0] || 1;
    rotationStatus = {
      lastActualSilo: null,
      nextStartSilo: defaultStart,
      expectedNextStartSilo: defaultStart,
      valid: true,
      status: 'valid',
      why: 'No run history recorded on pad yet. Start sequence on first configured silo.',
    };
  } else {
    const latestRun = sortedActiveRuns[sortedActiveRuns.length - 1];
    const lastActualSilo = latestRun.siloNumber;
    const onHandAfter = calculateSiloOnHandForSand(lastActualSilo, latestRun.sandType, state);

    let expectedNextStartSilo: number;
    let whyText: string;

    if (onHandAfter > 0) {
      expectedNextStartSilo = lastActualSilo;
      whyText = `S${lastActualSilo} was partially used on the most recent actual pull.`;
    } else {
      expectedNextStartSilo = getNextNumericalSilo(lastActualSilo, configuredSiloNumbers);
      whyText = `S${lastActualSilo} was emptied exactly.`;
    }

    const currentPointer = getAuthoritativeRotationPointer(state);
    const isValid = currentPointer === expectedNextStartSilo;

    let disagreementDetails: string | undefined;
    if (!isValid) {
      disagreementDetails = `EXPECTED S${expectedNextStartSilo} • CURRENT S${currentPointer}`;
      issues.push({
        id: 'issue-rotation-mismatch',
        severity: 'critical',
        category: 'rotation',
        title: 'Rotation State Needs Review',
        description: `Authoritative history implies next start silo S${expectedNextStartSilo}, but current rotation pointer is S${currentPointer}.`,
      });
    }

    const wellForRun = state.config?.wells?.find((w) => w.id === latestRun.wellId);

    rotationStatus = {
      lastActualSilo,
      lastActualWellName: wellForRun?.name || latestRun.wellId,
      lastActualStageNumber: latestRun.stageNumber,
      lastActualRunLbs: latestRun.lbsPulled,
      lastActualSandType: latestRun.sandType,
      nextStartSilo: expectedNextStartSilo,
      expectedNextStartSilo,
      currentStoredSilo: currentPointer,
      valid: isValid,
      status: isValid ? 'valid' : 'mismatch',
      why: whyText,
      disagreementDetails,
    };
  }

  // 9. Recent Deliveries (Latest 5 active, newest first)
  const recentDeliveries = [...activeDeliveries]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 5);

  // 10. Ticket Audit & Stage Audit
  const correctedTicketsCount = activeDeliveries.filter(
    (d) => Boolean((d.editCount && d.editCount > 0) || d.editedAt || (d as any).correctedAt)
  ).length;

  // 11. Connection & Cloud Status
  const firestoreStatus = getFirestoreConnectionStatus();
  const navOnline =
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;
  const isConnected = firestoreStatus === 'connected';
  const hasError = firestoreStatus === 'error';
  const online = isConnected || (!hasError && navOnline);
  const cloudStatusDisplay = isConnected
    ? 'DESIGN SANDBOX (LOCAL STORAGE)'
    : firestoreStatus === 'connecting'
    ? 'INITIALIZING LOCAL STORAGE...'
    : 'LOCAL STORAGE';

  if (!online || hasError) {
    issues.push({
      id: 'issue-network-offline',
      severity: 'warning',
      category: 'sync',
      title: 'Device Disconnected from Cloud',
      description: 'Device is offline. Changes cannot be saved until internet connectivity is restored.',
    });
  }

  const syncStatus: SyncReconciliationStatus = {
    isOnline: Boolean(isConnected || (online && !hasError)),
    cloudStatusDisplay,
  };

  const ticketAudit: TicketAuditSummary = {
    activeCount: activeDeliveries.length,
    activeTotalLbs: totalDeliveredLbs,
    correctedCount: correctedTicketsCount,
    deletedCount: deletedDeliveries.length,
  };

  const stageAudit: StageAuditSummary = {
    partialStagesCount: partialStages.length,
    correctedStagesCount: stageSummaries.filter((s) => s.wasCorrected).length,
    completedStagesCount: completedStages.length,
    totalRecordedStagesCount: stageSummaries.length,
  };

  if (correctedTicketsCount > 0) {
    issues.push({
      id: 'issue-corrected-tickets',
      severity: 'info',
      category: 'ticket',
      title: 'Corrected Tickets in Audit History',
      description: `${correctedTicketsCount} delivery ticket(s) contain recorded supervisor/operator corrections.`,
    });
  }

  // 12. Determine Overall Status
  // CRITICAL: Red ("needs_review")
  // WARNING: Amber ("warning")
  // RECONCILED: Green ("reconciled")
  const hasCritical = issues.some((i) => i.severity === 'critical');
  const hasWarning = issues.some((i) => i.severity === 'warning');

  let overallStatus: 'reconciled' | 'warning' | 'needs_review' = 'reconciled';
  if (hasCritical) {
    overallStatus = 'needs_review';
  } else if (hasWarning) {
    overallStatus = 'warning';
  } else {
    overallStatus = 'reconciled';
  }

  return {
    padId,
    padName,
    generatedAt,
    sandSummaries,
    totalDeliveredLbs,
    totalPumpedLbs,
    totalExpectedOnLocationLbs,
    totalSiloInventoryLbs,
    totalVarianceLbs,
    varianceDisplay,
    siloSummaries,
    wellStatuses,
    partialStages,
    lastCompletedStage,
    rotationStatus,
    recentDeliveries,
    ticketAudit,
    stageAudit,
    syncStatus,
    issues,
    overallStatus,
  };
}

/**
 * Creates an immutable ShiftHandoff snapshot from current state and notes.
 */
export function buildShiftHandoffSnapshot(
  state: AppState,
  notes: string,
  operatorName?: string,
  operatorEmail?: string
): ShiftHandoff {
  const recon = calculateReconciliation(state);
  const now = Date.now();
  const operationalDate = getOperationalDate(now);
  const handoffId = `handoff_${now.toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  // Per-sand snapshot
  const sandSnapshot: ShiftHandoff['sandSnapshot'] = {};
  recon.sandSummaries.forEach((st) => {
    sandSnapshot[st.sandType] = {
      deliveredLbs: st.deliveredLbs,
      pumpedLbs: st.pumpedLbs,
      expectedOnLocationLbs: st.expectedOnLocationLbs,
      siloInventoryLbs: st.siloInventoryLbs,
      varianceLbs: st.varianceLbs,
    };
  });

  // Silo snapshot
  const siloSnapshot: ShiftHandoff['siloSnapshot'] = recon.siloSummaries.map((s) => ({
    siloNumber: s.siloNumber,
    name: s.name,
    sandType: s.sandType,
    inventoryLbs: s.onHandLbs,
    capacityLbs: s.capacityLbs,
    enabled: s.enabled,
  }));

  // Well snapshot
  const wellSnapshot: ShiftHandoff['wellSnapshot'] = recon.wellStatuses.map((w) => ({
    wellId: w.wellId,
    wellName: w.wellName,
    stageNumber: w.currentStageNumber,
    status: w.stageStatus,
  }));

  // Rotation snapshot
  const rotationSnapshot: ShiftHandoff['rotationSnapshot'] = {
    lastActualSilo: recon.rotationStatus.lastActualSilo,
    nextStartSilo: recon.rotationStatus.nextStartSilo,
    valid: recon.rotationStatus.valid,
  };

  // Last delivery info
  const latestDelivery = recon.recentDeliveries.length > 0 ? recon.recentDeliveries[0] : null;

  // Deliveries today
  const activeDeliveries = (state.deliveries || []).filter((d) => !d.deleted);
  const deliveriesToday = activeDeliveries.filter((d) => d.date === operationalDate);
  const deliveriesTodayCount = deliveriesToday.length;
  const deliveriesTodayLbs = deliveriesToday.reduce((sum, d) => sum + (d.lbs || 0), 0);

  return {
    id: handoffId,
    padId: recon.padId,
    padName: recon.padName,
    createdAt: now,
    operationalDate,
    createdBy: operatorName || 'Operator',
    createdByEmail: operatorEmail || null || undefined,
    overallStatus: recon.overallStatus,
    totalDeliveredLbs: recon.totalDeliveredLbs,
    totalPumpedLbs: recon.totalPumpedLbs,
    totalExpectedOnLocationLbs: recon.totalExpectedOnLocationLbs,
    totalSiloInventoryLbs: recon.totalSiloInventoryLbs,
    totalVarianceLbs: recon.totalVarianceLbs,
    varianceDisplay: recon.varianceDisplay,
    sandSnapshot,
    siloSnapshot,
    wellSnapshot,
    partialStageSnapshot: recon.partialStages,
    rotationSnapshot,
    lastDeliveryTicketId: latestDelivery?.id || null,
    lastDeliveryTicketNumber: latestDelivery?.ticketNumber || null,
    lastDeliveryAt: latestDelivery?.createdAt || null,
    deliveriesTodayCount,
    deliveriesTodayLbs,
    notes: notes || '',
  };
}
