import {
  X,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Scale,
  Calendar,
  ArrowRight,
  Lock,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { formatLbs, formatLbsNumber, getEffectivePerStageDesign, getSiloDerivedStates, isStageComplete } from '../lib/sandRules';
import { getOperationalDate } from '../lib/dateUtils';
import { AppState, SiloDerivedState } from '../types';

export interface RecordPullConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  wellId: string;
  stageNumber: number;
  stageLbsOverride?: number;
  onRecordRun: (
    records: {
      wellId: string;
      stageNumber: number;
      siloNumber: number;
      sandType: string;
      lbsPulled: number;
      date: string;
      runSequence?: number;
      submissionId?: string;
    }[],
    options?: {
      clearManualOverrides?: boolean;
    }
  ) => Promise<void> | void;
  onSuccess?: () => void;
}

export default function RecordPullConfirmModal({
  isOpen,
  onClose,
  state,
  wellId,
  stageNumber,
  stageLbsOverride,
  onRecordRun,
  onSuccess,
}: RecordPullConfirmModalProps) {
  const wellObj = state.config.wells.find((w) => w.id === wellId) || {
    id: wellId,
    name: 'Well',
    plannedStages: 40,
  };

  const [date, setDate] = useState<string>(
    getOperationalDate()
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if stage is already completed
  const isAlreadyComplete = useMemo(() => {
    return isStageComplete(state, wellId, stageNumber);
  }, [state, wellId, stageNumber]);

  // Check if manual overrides exist on the pad
  const hasManualOverrides = useMemo(() => {
    return state.config.silos.some((s) => s.manualPriority !== null && s.manualPriority !== undefined);
  }, [state.config.silos]);

  const [clearOverrides, setClearOverrides] = useState<boolean>(
    state.config.clearManualPriorityAfterStage ?? true
  );

  // Derived silos from current well, stage, and override
  const siloDerivedStates = useMemo(() => {
    return getSiloDerivedStates(state, wellId, stageNumber, stageLbsOverride);
  }, [state, wellId, stageNumber, stageLbsOverride]);

  // Pull items with planned pull > 0 (or manual priority)
  const plannedItems = useMemo(() => {
    return siloDerivedStates
      .filter((s) => s.plannedPullLbs > 0 && !s.isOutOfService && s.sandType)
      .sort((a, b) => (a.runOrder || 99) - (b.runOrder || 99));
  }, [siloDerivedStates]);

  // Fallback: If no silos have plannedPullLbs > 0, include online silos with assigned sand
  const displayItems = useMemo(() => {
    const planned = plannedItems;
    if (planned.length > 0) return planned;
    return siloDerivedStates
      .filter((s) => !s.isOutOfService && s.sandType)
      .sort((a, b) => (a.runOrder || 99) - (b.runOrder || 99));
  }, [plannedItems, siloDerivedStates]);

  // Map of actual editable pull weights per silo
  const [actualPulls, setActualPulls] = useState<Record<number, number>>({});

  // Initialize actual pulls from planned pulls on open or target change
  useEffect(() => {
    const initial: Record<number, number> = {};
    displayItems.forEach((s) => {
      initial[s.siloNumber] = s.plannedPullLbs;
    });
    setActualPulls(initial);
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [wellId, stageNumber, displayItems]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isSubmitting]);

  // Calculations: Total planned vs actual vs design using per-well designs
  const totalActualPulledLbs = displayItems.reduce((sum, item) => {
    const pull = actualPulls[item.siloNumber] ?? item.plannedPullLbs ?? 0;
    return sum + pull;
  }, 0);

  const stageDesignTotalLbs = useMemo(() => {
    if (stageLbsOverride !== undefined) {
      return stageLbsOverride;
    }
    return state.config.sandTypes.reduce(
      (sum, st) => sum + (getEffectivePerStageDesign(wellObj, st) || 0),
      0
    );
  }, [stageLbsOverride, state.config.sandTypes, wellObj]);

  // Check already logged runs for this well & stage
  const priorRunsForThisStage = useMemo(() => {
    return (state.runs || []).filter(
      (r) => !r.deleted && r.wellId === wellId && r.stageNumber === stageNumber
    );
  }, [state.runs, wellId, stageNumber]);

  const previouslyRecordedTotalLbs = useMemo(() => {
    return priorRunsForThisStage.reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
  }, [priorRunsForThisStage]);

  const stageTotalAfterLbs = previouslyRecordedTotalLbs + totalActualPulledLbs;
  const remainingAfterLbs = Math.max(0, stageDesignTotalLbs - stageTotalAfterLbs);
  const varianceAfterLbs = stageTotalAfterLbs - stageDesignTotalLbs;
  const varianceLbs = totalActualPulledLbs - stageDesignTotalLbs;

  // Determine stage completion projection per sand type
  const stageCompletionStatus = useMemo(() => {
    let allMet = true;
    let totalRemaining = 0;

    state.config.sandTypes.forEach((st) => {
      const design = getEffectivePerStageDesign(wellObj, st);
      if (design > 0) {
        const priorPumped = priorRunsForThisStage
          .filter((r) => r.sandType === st.name)
          .reduce((sum, r) => sum + (r.lbsPulled || 0), 0);

        const newPumped = displayItems
          .filter((item) => item.sandType === st.name)
          .reduce((sum, item) => {
            const pull = actualPulls[item.siloNumber] ?? item.plannedPullLbs ?? 0;
            return sum + pull;
          }, 0);

        const totalProjected = priorPumped + newPumped;
        if (totalProjected < design - 1) {
          allMet = false;
          totalRemaining += design - totalProjected;
        }
      }
    });

    return {
      isComplete: allMet && (totalActualPulledLbs > 0 || previouslyRecordedTotalLbs > 0),
      totalRemainingLbs: Math.max(0, totalRemaining),
    };
  }, [state.config.sandTypes, wellObj, priorRunsForThisStage, displayItems, actualPulls, totalActualPulledLbs, previouslyRecordedTotalLbs]);

  if (!isOpen) return null;

  const handlePullChange = (siloNum: number, rawVal: string) => {
    if (rawVal === '') {
      setActualPulls((prev) => ({
        ...prev,
        [siloNum]: 0,
      }));
      return;
    }
    const cleaned = rawVal.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    setActualPulls((prev) => ({
      ...prev,
      [siloNum]: isNaN(num) ? 0 : Math.max(0, Math.round(num)),
    }));
  };

  // Identify silos that will run dry or negative
  const drySilos = displayItems.filter((item) => {
    const pull = actualPulls[item.siloNumber] ?? item.plannedPullLbs ?? 0;
    return pull > 0 && pull >= item.onHandLbs;
  });

  const negativeSilos = displayItems.filter((item) => {
    const pull = actualPulls[item.siloNumber] ?? item.plannedPullLbs ?? 0;
    return pull > 0 && pull > item.onHandLbs;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (isAlreadyComplete) {
      setErrorMessage(`Stage #${stageNumber} on Well ${wellObj.name} is already complete. Edit or delete previous runs to make changes.`);
      return;
    }

    setErrorMessage(null);

    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const recordsToSave: {
      wellId: string;
      stageNumber: number;
      siloNumber: number;
      sandType: string;
      lbsPulled: number;
      date: string;
      runSequence: number;
      submissionId: string;
    }[] = [];

    // Sort items by explicit pull order (runOrder 1, 2, 3...)
    const orderedItems = [...displayItems].sort(
      (a, b) => (a.runOrder || 99) - (b.runOrder || 99)
    );

    // Determine starting runSequence across multiple partial submissions
    let maxExistingSequence = 0;
    if (priorRunsForThisStage.length > 0) {
      const explicitSeqs = priorRunsForThisStage
        .map((r) => r.runSequence)
        .filter((s): s is number => typeof s === 'number' && s > 0);

      if (explicitSeqs.length > 0) {
        maxExistingSequence = Math.max(...explicitSeqs);
      } else {
        maxExistingSequence = priorRunsForThisStage.length;
      }
      maxExistingSequence = Math.max(maxExistingSequence, priorRunsForThisStage.length);
    }

    let sequenceIndex = maxExistingSequence + 1;
    orderedItems.forEach((item) => {
      const pull = actualPulls[item.siloNumber] ?? item.plannedPullLbs ?? 0;
      if (pull > 0 && item.sandType) {
        recordsToSave.push({
          wellId,
          stageNumber,
          siloNumber: item.siloNumber,
          sandType: item.sandType,
          lbsPulled: pull,
          date,
          runSequence: sequenceIndex++,
          submissionId,
        });
      }
    });

    if (recordsToSave.length === 0) {
      setErrorMessage('Please specify at least one silo pull weight greater than 0 lbs.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onRecordRun(recordsToSave, {
        clearManualOverrides: hasManualOverrides && clearOverrides,
      });
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to record run:', err);
      setErrorMessage(err?.message || 'Failed to record stage run. Please retry.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-4 sm:p-6 md:p-8 max-w-3xl w-full text-white shadow-2xl space-y-6 my-auto max-h-[94vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-pull-confirm-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-slate-950 p-2.5 sm:p-3 rounded-2xl font-black shrink-0 shadow-lg">
              <Layers className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.5]" />
            </div>
            <div>
              <h2
                id="record-pull-confirm-title"
                className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2"
              >
                <span>RECORD STAGE PULL</span>
                <span className="text-amber-400 font-mono text-base sm:text-lg bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                  #{stageNumber}
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 font-medium mt-0.5">
                Log actual sand pulled for{' '}
                <strong className="text-white font-bold">{wellObj.name}</strong> • Stage{' '}
                <strong className="text-amber-400 font-bold">#{stageNumber}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Completed Stage Warning */}
        {isAlreadyComplete && (
          <div className="bg-red-500/15 border-2 border-red-500/60 rounded-2xl p-4 text-red-200 text-xs sm:text-sm font-bold flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <span className="font-black uppercase block">STAGE IS ALREADY COMPLETE</span>
              <span>Stage #{stageNumber} on Well {wellObj.name} is already complete. Edit or delete previous runs to make changes.</span>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-red-500/10 border-2 border-red-500/50 rounded-2xl p-4 text-red-200 text-xs sm:text-sm font-bold flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Negative Silo Warning */}
        {negativeSilos.length > 0 && (
          <div className="bg-amber-500/15 border-2 border-amber-500/60 rounded-2xl p-4 text-amber-200 text-xs sm:text-sm font-bold flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span>Warning: Pulling more sand than on-hand for: </span>
              {negativeSilos.map((s) => (
                <strong key={s.siloNumber} className="text-white underline mr-1">
                  Silo #{s.siloNumber} ({formatLbs(actualPulls[s.siloNumber] ?? s.plannedPullLbs)} vs {formatLbs(s.onHandLbs)} on-hand)
                </strong>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {/* Date & Well Info Bar */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                  WELL & STAGE
                </span>
                <span className="text-sm font-black text-amber-400 font-mono">
                  {wellObj.name} — STAGE #{stageNumber}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="record-pull-date" className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>PULL DATE:</span>
              </label>
              <input
                id="record-pull-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-mono font-bold text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Planned Silo Pulls Table (with live editable lbs) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-400">
              <span>SILO PULL BREAKDOWN ({displayItems.length} {displayItems.length === 1 ? 'SILO' : 'SILOS'})</span>
              <span className="text-[11px] font-normal text-slate-500 lowercase">
                (click weight to adjust if actual differed from plan)
              </span>
            </div>

            <div className="border border-slate-700/80 rounded-2xl overflow-hidden bg-slate-950">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700 text-[10px] sm:text-xs font-black uppercase text-slate-300">
                    <th className="py-2.5 px-3 text-center w-14">Order</th>
                    <th className="py-2.5 px-3">Silo</th>
                    <th className="py-2.5 px-3">Sand Type</th>
                    <th className="py-2.5 px-3 text-right">Available</th>
                    <th className="py-2.5 px-3 text-right">Planned Pull</th>
                    <th className="py-2.5 px-3 text-right w-44">Actual Pull (lbs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {displayItems.map((item) => {
                    const actualVal = actualPulls[item.siloNumber] ?? item.plannedPullLbs ?? 0;
                    const runsDry = actualVal >= item.onHandLbs && actualVal > 0;
                    return (
                      <tr
                        key={item.siloNumber}
                        className="hover:bg-slate-900/50 transition-colors"
                      >
                        <td className="py-3 px-3 text-center font-mono font-black text-amber-400">
                          #{item.runOrder || '—'}
                        </td>
                        <td className="py-3 px-3 font-mono font-black text-white">
                          SILO #{item.siloNumber}
                          {runsDry && (
                            <span className="ml-1.5 text-[9px] bg-red-600/30 text-red-300 border border-red-500/40 px-1.5 py-0.5 rounded font-black uppercase">
                              DRY
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-300">
                          {item.sandType}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-400">
                          {formatLbs(item.onHandLbs)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-400">
                          {formatLbs(item.plannedPullLbs)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="numeric"
                            value={actualVal === 0 && actualPulls[item.siloNumber] === 0 ? '0' : actualVal === 0 ? '' : actualVal}
                            onChange={(e) =>
                              handlePullChange(item.siloNumber, e.target.value)
                            }
                            placeholder="0"
                            className={`w-36 bg-slate-900 border-2 rounded-xl px-3 py-1.5 text-right font-mono font-black text-sm text-white focus:outline-none transition ${
                              actualVal > item.onHandLbs
                                ? 'border-amber-500 text-amber-300'
                                : 'border-slate-700 focus:border-amber-500'
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800/90 border-t-2 border-slate-700 font-black text-xs sm:text-sm">
                    <td colSpan={4} className="py-3 px-3 uppercase text-slate-300">
                      STAGE TOTAL PULL
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-400">
                      {formatLbs(
                        displayItems.reduce((s, i) => s + (i.plannedPullLbs || 0), 0)
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-base font-black text-amber-400">
                      {formatLbs(totalActualPulledLbs)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Variance / Comparison vs Stage Design (Adaptive for Single Pull vs Multiple Partial Pulls) */}
          {previouslyRecordedTotalLbs > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5">
                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  STAGE DESIGN
                </div>
                <div className="text-sm sm:text-base font-black font-mono text-slate-200 mt-0.5">
                  {formatLbs(stageDesignTotalLbs)}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5">
                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  PREVIOUSLY RECORDED
                </div>
                <div className="text-sm sm:text-base font-black font-mono text-cyan-400 mt-0.5">
                  {formatLbs(previouslyRecordedTotalLbs)}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5">
                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  THIS RECORD
                </div>
                <div className="text-sm sm:text-base font-black font-mono text-amber-400 mt-0.5">
                  {formatLbs(totalActualPulledLbs)}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5">
                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  STAGE TOTAL AFTER
                </div>
                <div className="text-sm sm:text-base font-black font-mono text-white mt-0.5">
                  {formatLbs(stageTotalAfterLbs)}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 col-span-2 sm:col-span-1">
                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  REMAINING AFTER
                </div>
                <div
                  className={`text-sm sm:text-base font-black font-mono mt-0.5 ${
                    remainingAfterLbs === 0
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {remainingAfterLbs === 0
                    ? varianceAfterLbs > 0
                      ? `+${formatLbs(varianceAfterLbs)} (Over)`
                      : '0 lbs (Complete)'
                    : formatLbs(remainingAfterLbs)}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5">
                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  STAGE DESIGN TARGET
                </div>
                <div className="text-base font-black font-mono text-slate-200 mt-0.5">
                  {formatLbs(stageDesignTotalLbs)}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5">
                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  THIS RECORD
                </div>
                <div className="text-base font-black font-mono text-amber-400 mt-0.5">
                  {formatLbs(totalActualPulledLbs)}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5">
                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  VARIANCE VS DESIGN
                </div>
                <div
                  className={`text-base font-black font-mono mt-0.5 ${
                    varianceLbs === 0
                      ? 'text-emerald-400'
                      : varianceLbs > 0
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}
                >
                  {varianceLbs > 0 ? `+${formatLbs(varianceLbs)} (Over)` : varianceLbs < 0 ? `${formatLbs(varianceLbs)} (Short)` : 'Exact Match (0 lbs)'}
                </div>
              </div>
            </div>
          )}

          {/* Stage Completion Status Callout */}
          <div
            className={`border rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs ${
              stageCompletionStatus.isComplete
                ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300'
                : 'bg-amber-950/40 border-amber-700/60 text-amber-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {stageCompletionStatus.isComplete ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <div>
                <span className="font-black uppercase tracking-wider block">
                  {stageCompletionStatus.isComplete ? 'STAGE STATUS: COMPLETE' : 'STAGE STATUS: PARTIAL'}
                </span>
                <span className="text-[11px] opacity-90 block">
                  {stageCompletionStatus.isComplete
                    ? 'Target design achieved for this stage. Well zipper will rotate to the next well upon recording.'
                    : `Partial stage logged (${formatLbs(stageCompletionStatus.totalRemainingLbs)} still needed). Well zipper will remain on ${wellObj.name} Stage #${stageNumber} until design is fulfilled.`}
                </span>
              </div>
            </div>
            <span
              className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg shrink-0 ${
                stageCompletionStatus.isComplete
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-amber-500 text-slate-950'
              }`}
            >
              {stageCompletionStatus.isComplete ? 'FULL STAGE' : 'PARTIAL'}
            </span>
          </div>

          {/* Dry Silos Alert Callout */}
          {drySilos.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3.5 text-xs text-red-300 font-bold flex items-center gap-2.5">
              <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase shrink-0">
                RELOAD REQUIRED
              </span>
              <span>
                {drySilos.map((s) => `Silo #${s.siloNumber}`).join(', ')} will be empty after this stage and ready for next delivery.
              </span>
            </div>
          )}

          {/* Manual Overrides Hygiene Checkbox */}
          {hasManualOverrides && (
            <div className="bg-purple-950/40 border border-purple-800/60 rounded-2xl p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-purple-400 shrink-0" />
                <label
                  htmlFor="clear-manual-overrides-check"
                  className="text-xs font-bold text-purple-200 cursor-pointer select-none"
                >
                  Clear manual silo priority overrides after recording this stage
                </label>
              </div>
              <input
                id="clear-manual-overrides-check"
                type="checkbox"
                checked={clearOverrides}
                onChange={(e) => setClearOverrides(e.target.checked)}
                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-slate-900 border-slate-700 cursor-pointer"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold text-sm px-5 py-3 rounded-2xl transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || totalActualPulledLbs <= 0 || isAlreadyComplete}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 text-slate-950 font-black text-sm sm:text-base px-6 py-3.5 rounded-2xl shadow-xl border-2 border-amber-300 transition flex items-center justify-center gap-2.5 uppercase tracking-wide cursor-pointer active:scale-[0.99]"
            >
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              <span>{isSubmitting ? 'Recording Pull...' : isAlreadyComplete ? 'STAGE ALREADY COMPLETE' : `CONFIRM & LOG PULL (${formatLbs(totalActualPulledLbs)})`}</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
