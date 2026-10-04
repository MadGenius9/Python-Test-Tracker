import { AppState, RunRecord, StageCompactPull, StagePullStep, StageRecord, StageSubmissionGroup, StageSummary, WellConfig } from '../types';
import { getOperationalDate, OPERATIONAL_TIMEZONE } from './dateUtils';
import { getEffectivePerStageDesign, isStageComplete, sortStageRunsByActualSequence } from './sandRules';

/**
 * Sorts runs within a stage according to authoritative sequence:
 * 1. runSequence (if present)
 * 2. createdAt / legacy tie-breakers
 */
export function sortStageRunsForReview(runs: RunRecord[]): RunRecord[] {
  return sortStageRunsByActualSequence(runs);
}

/**
 * Formats a timestamp into 12-hour AM/PM time in America/Chicago timezone.
 * e.g. "7:42 PM"
 */
export function formatStageTimeAmPm(timestamp?: number | null): string {
  if (!timestamp || isNaN(timestamp)) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return formatter.format(d);
}

/**
 * Formats a timestamp into short operational date (e.g. "AUG 27").
 */
export function formatStageShortDate(timestamp?: number | null): string {
  if (!timestamp || isNaN(timestamp)) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIMEZONE,
    month: 'short',
    day: 'numeric',
  });
  return formatter.format(d).toUpperCase();
}

/**
 * Formats a timestamp into full operational date and time (e.g. "AUG 27, 2026 • 7:42 PM").
 */
export function formatStageDateTimeDisplay(timestamp?: number | null): string {
  if (!timestamp || isNaN(timestamp)) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${dateFormatter.format(d).toUpperCase()} • ${timeFormatter.format(d)}`;
}

/**
 * Constructs a single StageSummary for a well and stage number.
 * Can be called for recorded stages as well as unstarted future stages.
 */
export function getStageSummary(
  state: AppState,
  wellId: string,
  stageNumber: number
): StageSummary {
  const well: WellConfig = state.config?.wells?.find((w) => w.id === wellId) || {
    id: wellId,
    name: wellId,
    plannedStages: 0,
  };

  const stageKey = `${wellId}_stage_${stageNumber}`;

  // 1. Collect active non-deleted runs and deleted runs
  const stageRuns = (state.runs || []).filter(
    (r) => !r.deleted && r.wellId === wellId && r.stageNumber === stageNumber
  );
  const deletedRuns = (state.deletedRuns || []).filter(
    (r) => r.wellId === wellId && r.stageNumber === stageNumber
  );

  // 2. Sort active runs strictly by actual execution sequence
  const sortedRuns = sortStageRunsForReview(stageRuns);

  // 3. Authoritative Stage Status
  let status: 'complete' | 'partial' | 'not_started' = 'not_started';
  let stageRecord: StageRecord | undefined;

  if (state.stageRecords) {
    if (Array.isArray(state.stageRecords)) {
      stageRecord = state.stageRecords.find((r) => r && r.wellId === wellId && r.stageNumber === stageNumber);
    } else if (typeof state.stageRecords === 'object') {
      stageRecord =
        state.stageRecords[stageKey] ||
        Object.values(state.stageRecords).find(
          (r) => r && r.wellId === wellId && r.stageNumber === stageNumber
        );
    }
  }

  // 3. Authoritative Stage Status derived from active runs
  // If there are zero active runs, status is always 'not_started'
  if (sortedRuns.length === 0) {
    status = 'not_started';
  } else {
    status = isStageComplete(state, wellId, stageNumber) ? 'complete' : 'partial';
  }

  // 4. Authoritative Stage Date & Completion Timestamp
  let completionTimestamp: number | null = null;
  if (status === 'complete') {
    if (stageRecord?.completedAt && typeof stageRecord.completedAt === 'number') {
      completionTimestamp = stageRecord.completedAt;
    } else if (sortedRuns.length > 0) {
      // Legacy complete: final active run timestamp
      const runTimestamps = sortedRuns.map((r) => r.createdAt || 0).filter((t) => t > 0);
      completionTimestamp = runTimestamps.length > 0 ? runTimestamps[runTimestamps.length - 1] : null;
    }
  } else if (status === 'partial') {
    if (sortedRuns.length > 0) {
      const runTimestamps = sortedRuns.map((r) => r.createdAt || 0).filter((t) => t > 0);
      completionTimestamp = runTimestamps.length > 0 ? Math.max(...runTimestamps) : null;
    }
  }

  const operationalDate = completionTimestamp ? getOperationalDate(completionTimestamp) : null;
  const displayTime = completionTimestamp ? formatStageTimeAmPm(completionTimestamp) : null;
  const displayDateTime = completionTimestamp ? formatStageDateTimeDisplay(completionTimestamp) : null;

  // 5. Per-Sand Design & Actual Calculations
  const designBySand: Record<string, number> = {};
  const actualBySand: Record<string, number> = {};

  const sandTypes = state.config?.sandTypes || [];
  for (const st of sandTypes) {
    const effDesign = getEffectivePerStageDesign(well, st);
    designBySand[st.name] = effDesign;
    actualBySand[st.name] = 0;
  }

  for (const r of sortedRuns) {
    const sName = r.sandType || 'Unknown';
    actualBySand[sName] = (actualBySand[sName] || 0) + (r.lbsPulled || 0);
    if (designBySand[sName] === undefined) {
      designBySand[sName] = 0;
    }
  }

  const totalDesignLbs = Object.values(designBySand).reduce((sum, v) => sum + (v || 0), 0);
  const totalActualLbs = sortedRuns.reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
  const varianceLbs = totalActualLbs - totalDesignLbs;

  // 6. Detailed Pull Sequence (1 row per run)
  const pullSequence: StagePullStep[] = sortedRuns.map((r, idx) => ({
    stepOrder: idx + 1,
    siloNumber: r.siloNumber,
    sandType: r.sandType,
    lbsPulled: r.lbsPulled,
    submissionId: r.submissionId,
    runId: r.id,
    createdAt: r.createdAt,
    wasEdited: Boolean((r.editCount && r.editCount > 0) || r.editedAt),
  }));

  // 7. Compact Sequence (combines ADJACENT pulls from the same silo)
  const compactSequence: StageCompactPull[] = [];
  for (const r of sortedRuns) {
    if (
      compactSequence.length > 0 &&
      compactSequence[compactSequence.length - 1].siloNumber === r.siloNumber &&
      compactSequence[compactSequence.length - 1].sandType === r.sandType
    ) {
      compactSequence[compactSequence.length - 1].lbsPulled += r.lbsPulled;
    } else {
      compactSequence.push({
        siloNumber: r.siloNumber,
        sandType: r.sandType,
        lbsPulled: r.lbsPulled,
      });
    }
  }

  // 8. Submission Groups
  // Real submissions with submissionId are grouped strictly by submissionId.
  // Legacy records without submissionId are grouped into one single Legacy Stage Record group.
  const submissionMap = new Map<string, RunRecord[]>();
  const submissionOrder: string[] = [];

  for (const r of sortedRuns) {
    const sId = r.submissionId || '__legacy_stage_record__';
    if (!submissionMap.has(sId)) {
      submissionMap.set(sId, []);
      submissionOrder.push(sId);
    }
    submissionMap.get(sId)!.push(r);
  }

  let modernSubIndex = 1;
  const submissions: StageSubmissionGroup[] = submissionOrder.map((sId) => {
    const sRuns = submissionMap.get(sId)!;
    const sLbs = sRuns.reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
    const uniqueSilos = new Set(sRuns.map((r) => r.siloNumber)).size;
    const earliestTime = sRuns.reduce(
      (min, r) => (r.createdAt && r.createdAt < min ? r.createdAt : min),
      sRuns[0]?.createdAt || 0
    );

    const isLegacy = sId === '__legacy_stage_record__';
    const label = isLegacy ? 'Legacy Stage Record' : `Submission ${modernSubIndex++}`;

    return {
      submissionId: sId,
      label,
      timestamp: earliestTime,
      totalLbs: sLbs,
      siloCount: uniqueSilos,
      runs: sRuns,
    };
  });

  // 9. Timestamps & History Indicators
  const firstRunAt = sortedRuns.length > 0 ? sortedRuns[0].createdAt || null : null;
  const lastRunAt = sortedRuns.length > 0 ? sortedRuns[sortedRuns.length - 1].createdAt || null : null;

  const wasEdited = sortedRuns.some((r) => Boolean((r.editCount && r.editCount > 0) || r.editedAt));
  const hasDeletedHistory = deletedRuns.length > 0;
  const wasCorrected = wasEdited || hasDeletedHistory;

  const startingSiloNumber = sortedRuns.length > 0 ? sortedRuns[0].siloNumber : null;
  const lastUsedSiloNumber = sortedRuns.length > 0 ? sortedRuns[sortedRuns.length - 1].siloNumber : null;

  return {
    stageKey,
    wellId,
    wellName: well.name || wellId,
    stageNumber,
    status,
    completionTimestamp,
    operationalDate,
    displayTime,
    displayDateTime,
    designBySand,
    actualBySand,
    totalDesignLbs,
    totalActualLbs,
    varianceLbs,
    runs: sortedRuns,
    pullSequence,
    compactSequence,
    submissionIds: submissionOrder,
    submissions,
    firstRunAt,
    lastRunAt,
    wasEdited,
    hasDeletedHistory,
    wasCorrected,
    deletedRuns,
    startingSiloNumber,
    lastUsedSiloNumber,
  };
}

/**
 * Builds all StageSummary objects for recorded stages across the pad.
 * Indexes runs once for optimal performance.
 * Untouched future stages are excluded from this pad-wide summary list.
 */
export function buildStageSummaries(state: AppState): StageSummary[] {
  if (!state) return [];

  // Find all unique well and stage pairs that have active runs or stage records
  const stageKeysSet = new Set<string>();

  (state.runs || []).forEach((r) => {
    if (!r.deleted && r.wellId && r.stageNumber) {
      stageKeysSet.add(`${r.wellId}__${r.stageNumber}`);
    }
  });

  if (state.stageRecords) {
    if (Array.isArray(state.stageRecords)) {
      state.stageRecords.forEach((sr) => {
        if (sr && sr.wellId && sr.stageNumber) {
          stageKeysSet.add(`${sr.wellId}__${sr.stageNumber}`);
        }
      });
    } else if (typeof state.stageRecords === 'object') {
      Object.values(state.stageRecords).forEach((sr) => {
        if (sr && sr.wellId && sr.stageNumber) {
          stageKeysSet.add(`${sr.wellId}__${sr.stageNumber}`);
        }
      });
    }
  }

  const summaries: StageSummary[] = [];
  for (const compoundKey of stageKeysSet) {
    const [wellId, stageNumStr] = compoundKey.split('__');
    const stageNumber = parseInt(stageNumStr, 10);
    if (wellId && !isNaN(stageNumber)) {
      const summary = getStageSummary(state, wellId, stageNumber);
      if (summary.status !== 'not_started') {
        summaries.push(summary);
      }
    }
  }

  // Default Sort: Newest completion / activity first
  summaries.sort((a, b) => {
    const timeA = a.completionTimestamp || a.lastRunAt || a.firstRunAt || 0;
    const timeB = b.completionTimestamp || b.lastRunAt || b.firstRunAt || 0;
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    if (a.wellName !== b.wellName) {
      return a.wellName.localeCompare(b.wellName);
    }
    return b.stageNumber - a.stageNumber;
  });

  return summaries;
}
