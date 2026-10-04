import {
  Layers,
  CheckCircle2,
  ArrowRight,
  Plus,
  Trash2,
  AlertTriangle,
  Calendar,
  Info,
  Scale,
  X,
} from 'lucide-react';
import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  formatLbs,
  getPadSummary,
  getSiloDerivedStates,
  formatTons,
} from '../lib/sandRules';
import { getOperationalDate } from '../lib/dateUtils';
import { AppState, SiloDerivedState } from '../types';

export interface RecordRunPayload {
  wellId: string;
  stageNumber: number;
  siloNumber: number;
  sandType: string;
  lbsPulled: number;
  date: string;
}

export interface RecordRunFormProps {
  state: AppState;
  initialWellId?: string;
  initialStageNumber?: number;
  initialStageLbsOverride?: number;
  initialDate?: string;
  fixedTarget?: boolean;
  title?: string;
  subtitle?: string;
  submitButtonLabel?: string;
  onRecordRun: (records: RecordRunPayload[]) => Promise<void> | void;
  onCancel?: () => void;
  onSuccess?: () => void;
  isModal?: boolean;
}

export default function RecordRunForm({
  state,
  initialWellId,
  initialStageNumber,
  initialStageLbsOverride,
  initialDate,
  fixedTarget = false,
  title,
  subtitle,
  submitButtonLabel,
  onRecordRun,
  onCancel,
  onSuccess,
  isModal = false,
}: RecordRunFormProps) {
  const padSummary = getPadSummary(state);
  const defaultWell = state.config.wells[0] || { id: 'w-1', name: 'Well 1H', plannedStages: 40 };

  const [wellId, setWellId] = useState<string>(
    initialWellId || padSummary.activeWellId || defaultWell.id
  );
  const [stageNumber, setStageNumber] = useState<number>(
    initialStageNumber !== undefined ? initialStageNumber : padSummary.nextStageNumber
  );
  const [stageLbsOverride, setStageLbsOverride] = useState<number | undefined>(
    initialStageLbsOverride
  );
  const [date, setDate] = useState<string>(
    initialDate || getOperationalDate()
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync if initial props change (e.g. when opening modal for different stages)
  useEffect(() => {
    if (initialWellId) setWellId(initialWellId);
  }, [initialWellId]);

  useEffect(() => {
    if (initialStageNumber !== undefined) setStageNumber(initialStageNumber);
  }, [initialStageNumber]);

  useEffect(() => {
    if (initialStageLbsOverride !== undefined) setStageLbsOverride(initialStageLbsOverride);
  }, [initialStageLbsOverride]);

  // Derived silos from current well, stage, and override
  const siloDerivedStates = useMemo(() => {
    return getSiloDerivedStates(state, wellId, stageNumber, stageLbsOverride);
  }, [state, wellId, stageNumber, stageLbsOverride]);

  // Track which silos are currently included in the entry view
  const [includedSiloNumbers, setIncludedSiloNumbers] = useState<number[]>([]);
  // Editable pull amounts per silo
  const [customPulls, setCustomPulls] = useState<Record<number, number>>({});
  // Selected silo from "Add a Silo" dropdown
  const [selectedAddSiloNumber, setSelectedAddSiloNumber] = useState<string>('');

  // When target well or stage changes, initialize included silos and pull weights from planned values
  useEffect(() => {
    const plannedSilos = siloDerivedStates
      .filter((s) => s.plannedPullLbs > 0)
      .map((s) => s.siloNumber);

    // If none are planned (e.g. pad empty or custom stage), default to all online silos with assigned sand
    const initialList = plannedSilos.length > 0
      ? plannedSilos
      : siloDerivedStates.filter((s) => !s.isOutOfService && s.sandType).map((s) => s.siloNumber);

    setIncludedSiloNumbers(initialList);

    const initialPulls: Record<number, number> = {};
    siloDerivedStates.forEach((s) => {
      if (s.plannedPullLbs > 0) {
        initialPulls[s.siloNumber] = s.plannedPullLbs;
      }
    });
    setCustomPulls(initialPulls);
    setSelectedAddSiloNumber('');
  }, [wellId, stageNumber, siloDerivedStates]);

  const selectedWellObj = state.config.wells.find((w) => w.id === wellId) || defaultWell;

  // Silos available to be added
  const availableToAddSilos = useMemo(() => {
    return siloDerivedStates.filter(
      (s) => !includedSiloNumbers.includes(s.siloNumber)
    );
  }, [siloDerivedStates, includedSiloNumbers]);

  const getPullAmount = (siloNum: number): number => {
    if (customPulls[siloNum] !== undefined) {
      return customPulls[siloNum];
    }
    const derived = siloDerivedStates.find((s) => s.siloNumber === siloNum);
    return derived?.plannedPullLbs || 0;
  };

  const handlePullChange = (siloNum: number, val: string) => {
    const num = val === '' ? 0 : parseInt(val, 10);
    setCustomPulls((prev) => ({
      ...prev,
      [siloNum]: isNaN(num) ? 0 : num,
    }));
  };

  const handleAddSilo = (siloNumToAdd: number) => {
    if (!includedSiloNumbers.includes(siloNumToAdd)) {
      setIncludedSiloNumbers((prev) => [...prev, siloNumToAdd]);
      setCustomPulls((prev) => ({
        ...prev,
        [siloNumToAdd]: prev[siloNumToAdd] ?? 0,
      }));
    }
    setSelectedAddSiloNumber('');
  };

  const handleRemoveSilo = (siloNumToRemove: number) => {
    setIncludedSiloNumbers((prev) => prev.filter((num) => num !== siloNumToRemove));
    setCustomPulls((prev) => {
      const updated = { ...prev };
      delete updated[siloNumToRemove];
      return updated;
    });
  };

  // -------------------------------------------------------------
  // CALCULATE LIVE RUNNING TOTALS & VARIANCE AGAINST STAGE DESIGN
  // -------------------------------------------------------------
  const stageDesignTotalLbs = useMemo(() => {
    if (stageLbsOverride !== undefined) return stageLbsOverride;
    return state.config.sandTypes.reduce(
      (sum, st) => sum + (st.perStageDesignLbs || 0),
      0
    );
  }, [state.config.sandTypes, stageLbsOverride]);

  const totalActualPulledLbs = useMemo(() => {
    return includedSiloNumbers.reduce((sum, siloNum) => {
      return sum + (getPullAmount(siloNum) || 0);
    }, 0);
  }, [includedSiloNumbers, customPulls, siloDerivedStates]);

  const totalVarianceLbs = totalActualPulledLbs - stageDesignTotalLbs;
  const variancePercentage = stageDesignTotalLbs > 0
    ? (totalVarianceLbs / stageDesignTotalLbs) * 100
    : 0;

  // Breakdown per Sand Type
  const sandTypeBreakdown = useMemo(() => {
    return state.config.sandTypes.map((st) => {
      const designLbs = st.perStageDesignLbs || 0;
      const actualLbs = includedSiloNumbers
        .filter((siloNum) => {
          const silo = siloDerivedStates.find((s) => s.siloNumber === siloNum);
          return silo?.sandType === st.name;
        })
        .reduce((sum, siloNum) => sum + (getPullAmount(siloNum) || 0), 0);

      const diffLbs = actualLbs - designLbs;
      return {
        sandType: st.name,
        designLbs,
        actualLbs,
        diffLbs,
      };
    });
  }, [state.config.sandTypes, includedSiloNumbers, customPulls, siloDerivedStates]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);

    const recordsToSave: RecordRunPayload[] = [];

    includedSiloNumbers.forEach((siloNum) => {
      const silo = siloDerivedStates.find((s) => s.siloNumber === siloNum);
      const pull = getPullAmount(siloNum);
      if (pull > 0 && silo && silo.sandType) {
        recordsToSave.push({
          wellId,
          stageNumber,
          siloNumber: silo.siloNumber,
          sandType: silo.sandType,
          lbsPulled: pull,
          date,
        });
      }
    });

    if (recordsToSave.length === 0) {
      setErrorMessage('Please specify at least one silo pull weight > 0 lbs.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onRecordRun(recordsToSave);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Failed to record run:', err);
      setErrorMessage(err?.message || 'Failed to record stage run');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Target Well & Stage Header Banner */}
      {fixedTarget ? (
        <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9aa3ad]">
              TARGET STAGE FOR RUN
            </div>
            <div className="text-xl sm:text-2xl font-bold font-display text-[#e8ebe6] flex flex-wrap items-center gap-2">
              <span>{selectedWellObj.name}</span>
              <span className="bg-[#14171c] text-[#9aa3ad] text-sm px-3 py-1 rounded-xl border border-[#2a313b] font-mono font-bold">
                STAGE #{stageNumber}
              </span>
              {selectedWellObj.customerName && (
                <span className="text-xs text-[#9aa3ad] font-medium">
                  • {selectedWellObj.customerName}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[#9aa3ad] mb-1">
                RUN DATE
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-[#14171c] border border-[#2a313b] rounded-xl px-3 py-2 text-sm font-semibold text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none"
              />
            </div>
          </div>
        </div>
      ) : (
        /* Standalone Selectors */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pb-4 border-b border-[#2a313b]">
          <div>
            <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">TARGET WELL</label>
            <select
              value={wellId}
              onChange={(e) => {
                const newWellId = e.target.value;
                setWellId(newWellId);
                const lastRunForWell = (state.runs || [])
                  .filter((r) => !r.deleted && r.wellId === newWellId)
                  .sort((a, b) => b.stageNumber - a.stageNumber)[0];
                setStageNumber(lastRunForWell ? lastRunForWell.stageNumber + 1 : 1);
              }}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3 text-base font-semibold text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none"
            >
              {state.config.wells.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.plannedStages} Stages)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">STAGE NUMBER</label>
            <input
              type="number"
              inputMode="numeric"
              value={stageNumber}
              onChange={(e) => setStageNumber(parseInt(e.target.value, 10) || 1)}
              min={1}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3 text-lg font-bold font-mono text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none min-h-[48px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">STAGE LBS OVERRIDE</label>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Auto Design"
              value={stageLbsOverride ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setStageLbsOverride(val === '' ? undefined : parseInt(val, 10) || 0);
              }}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3 text-base font-bold font-mono text-[#e8ebe6] placeholder-[#9aa3ad]/50 focus:border-[#c23b32] focus:outline-none min-h-[48px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">RUN DATE</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3 text-sm font-semibold text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none min-h-[48px]"
            />
          </div>
        </div>
      )}

      {/* Error Message Box */}
      {errorMessage && (
        <div className="bg-[#260e0c] border border-[#c23b32]/50 rounded-xl p-4 text-[#e25a4a] text-sm font-semibold flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[#e25a4a] shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Silo Pull Allocations List */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-semibold uppercase text-[#9aa3ad] tracking-wider">
          <span>
            PULL ALLOCATION PER SILO ({includedSiloNumbers.length} {includedSiloNumbers.length === 1 ? 'SILO' : 'SILOS'} IN RUN)
          </span>
          <span className="text-[11px] text-[#9aa3ad]/80 font-medium">
            EDIT ACTUAL LBS PULLED DOWNHOLE
          </span>
        </div>

        {includedSiloNumbers.length === 0 ? (
          <div className="bg-[#0b0c0e] border border-dashed border-[#2a313b] rounded-xl p-6 text-center space-y-2">
            <div className="text-[#9aa3ad] font-semibold text-sm">No silos currently allocated for this run.</div>
            <div className="text-xs text-[#9aa3ad]/70">Use the selector below to add a silo to this stage.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {includedSiloNumbers.map((siloNum) => {
              const s = siloDerivedStates.find((ds) => ds.siloNumber === siloNum);
              if (!s) return null;

              const currentPull = getPullAmount(siloNum);
              const isOverPulling = s.onHandLbs > 0 && currentPull > s.onHandLbs;
              const willRunEmpty = currentPull >= s.onHandLbs && s.onHandLbs > 0;

              return (
                <div
                  key={siloNum}
                  className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    s.isOutOfService
                      ? 'bg-[#0b0c0e]/70 border-[#2a313b] opacity-60'
                      : currentPull > 0
                      ? 'bg-[#0b0c0e] border-[#c23b32]/60 shadow-md'
                      : 'bg-[#0b0c0e] border-[#2a313b]'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#14171c] border border-[#2a313b] font-mono font-bold text-base text-[#e8ebe6] flex items-center justify-center shrink-0">
                      #{s.siloNumber}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-base text-[#e8ebe6]">
                          {s.name || `SILO #${s.siloNumber}`}
                        </span>
                        {s.sandType && (
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${
                            s.sandType.toLowerCase().includes('100')
                              ? 'bg-[#e5a93c]/10 text-[#e5a93c] border-[#e5a93c]/30'
                              : s.sandType.toLowerCase().includes('40')
                              ? 'bg-[#6ba3be]/10 text-[#6ba3be] border-[#6ba3be]/30'
                              : 'bg-[#8fa37a]/10 text-[#8fa37a] border-[#8fa37a]/30'
                          }`}>
                            {s.sandType}
                          </span>
                        )}
                        {s.runOrder !== null && (
                          <span className="bg-[#1b2027] text-[#e8ebe6] font-mono text-[10px] px-2 py-0.5 rounded border border-[#2a313b]">
                            ORDER #{s.runOrder}
                          </span>
                        )}
                        {s.isOutOfService && (
                          <span className="bg-[#260e0c] text-[#e25a4a] border border-[#c23b32]/40 font-semibold text-[10px] px-2 py-0.5 rounded">
                            OFFLINE
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-[#9aa3ad] font-normal mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                          On-Hand: <strong className="font-mono text-[#e8ebe6] font-semibold">{formatLbs(s.onHandLbs)}</strong>
                        </span>
                        {s.plannedPullLbs > 0 && (
                          <span>
                            Plan: <strong className="font-mono text-[#8fa37a] font-semibold">{formatLbs(s.plannedPullLbs)}</strong>
                          </span>
                        )}
                        {willRunEmpty && (
                          <span className="text-[#d4a017] font-semibold text-[11px]">
                            ⚡ Runs Dry
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 shrink-0">
                    <div className="text-right">
                      <label className="block text-[10px] font-semibold text-[#9aa3ad] uppercase mb-1">
                        ACTUAL PULL (LBS)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          disabled={s.isOutOfService}
                          value={currentPull === 0 && customPulls[siloNum] === undefined ? 0 : currentPull}
                          onChange={(e) => handlePullChange(siloNum, e.target.value)}
                          className={`w-36 sm:w-44 bg-[#14171c] border rounded-xl p-2.5 text-right font-mono font-bold text-lg sm:text-xl text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none min-h-[46px] ${
                            isOverPulling
                              ? 'border-[#c23b32] text-[#e25a4a]'
                              : 'border-[#2a313b]'
                          }`}
                        />
                      </div>
                      {isOverPulling && (
                        <div className="text-[10px] text-[#e25a4a] font-semibold mt-1">
                          Exceeds on-hand by {formatLbs(currentPull - s.onHandLbs)}
                        </div>
                      )}
                    </div>

                    {/* Remove Silo Button */}
                    <button
                      type="button"
                      title="Remove silo from run"
                      onClick={() => handleRemoveSilo(siloNum)}
                      className="p-2.5 text-[#9aa3ad] hover:text-[#e25a4a] hover:bg-[#14171c] rounded-xl transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Silo Selector Row */}
        {availableToAddSilos.length > 0 && (
          <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="text-xs font-semibold text-[#e8ebe6] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#8fa37a]" />
              <span>Pulled from a silo that wasn't in the plan?</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedAddSiloNumber}
                onChange={(e) => setSelectedAddSiloNumber(e.target.value)}
                className="bg-[#14171c] border border-[#2a313b] rounded-xl px-3 py-2 text-xs font-semibold text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none flex-1 sm:flex-initial"
              >
                <option value="">-- Choose Silo to Add --</option>
                {availableToAddSilos.map((s) => (
                  <option key={s.siloNumber} value={s.siloNumber}>
                    Silo #{s.siloNumber} ({s.sandType || 'No sand'}) • {formatLbs(s.onHandLbs)} on-hand
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={!selectedAddSiloNumber}
                onClick={() => {
                  if (selectedAddSiloNumber) {
                    handleAddSilo(parseInt(selectedAddSiloNumber, 10));
                  }
                }}
                className="bg-[#1b2027] hover:bg-[#2a313b] disabled:opacity-40 text-[#e8ebe6] font-semibold text-xs px-4 py-2 rounded-xl border border-[#2a313b] transition cursor-pointer flex items-center gap-1 min-h-[38px]"
              >
                <Plus className="w-3.5 h-3.5" /> ADD SILO
              </button>
            </div>
          </div>
        )}
      </div>

      {/* LIVE RUNNING TOTAL & VARIANCE CARD */}
      <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#9aa3ad] flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#9aa3ad]" />
            STAGE DESIGN RECONCILIATION
          </div>

          {/* Overall Variance Badge */}
          {totalVarianceLbs < 0 ? (
            <div className="bg-[#260e0c] border border-[#c23b32]/50 text-[#e25a4a] px-3 py-1 rounded-xl text-xs font-semibold font-mono flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-[#e25a4a]" />
              SHORT: {formatLbs(Math.abs(totalVarianceLbs))} ({Math.abs(variancePercentage).toFixed(1)}%)
            </div>
          ) : totalVarianceLbs > 0 ? (
            <div className="bg-[#291e0a] border border-[#d4a017]/50 text-[#d4a017] px-3 py-1 rounded-xl text-xs font-semibold font-mono flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-[#d4a017]" />
              OVER: +{formatLbs(totalVarianceLbs)} (+{variancePercentage.toFixed(1)}%)
            </div>
          ) : (
            <div className="bg-[#142319] border border-[#8fa37a]/50 text-[#8fa37a] px-3 py-1 rounded-xl text-xs font-semibold font-mono flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#8fa37a]" />
              EXACT ON DESIGN (100%)
            </div>
          )}
        </div>

        {/* Big Totals Comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#14171c] border border-[#2a313b] p-3 rounded-xl">
            <div className="text-[10px] font-semibold uppercase text-[#9aa3ad]">STAGE DESIGN</div>
            <div className="text-lg sm:text-xl font-mono font-bold text-[#e8ebe6] mt-0.5">
              {formatLbs(stageDesignTotalLbs)}
            </div>
            <div className="text-[10px] font-mono text-[#9aa3ad]">
              {formatTons(stageDesignTotalLbs / (state.config.lbsPerTon || 2000))}
            </div>
          </div>

          <div className="bg-[#14171c] border border-[#2a313b] p-3 rounded-xl">
            <div className="text-[10px] font-semibold uppercase text-[#8fa37a]">TOTAL RECORDED PULL</div>
            <div className="text-lg sm:text-xl font-mono font-bold text-[#e8ebe6] mt-0.5">
              {formatLbs(totalActualPulledLbs)}
            </div>
            <div className="text-[10px] font-mono text-[#9aa3ad]">
              {formatTons(totalActualPulledLbs / (state.config.lbsPerTon || 2000))}
            </div>
          </div>

          <div className={`p-3 rounded-xl border ${
            totalVarianceLbs < 0
              ? 'bg-[#260e0c]/40 border-[#c23b32]/40'
              : totalVarianceLbs > 0
              ? 'bg-[#291e0a]/40 border-[#d4a017]/40'
              : 'bg-[#142319]/40 border-[#8fa37a]/40'
          }`}>
            <div className="text-[10px] font-semibold uppercase text-[#9aa3ad]">STAGE VARIANCE</div>
            <div className={`text-lg sm:text-xl font-mono font-bold mt-0.5 ${
              totalVarianceLbs < 0
                ? 'text-[#e25a4a]'
                : totalVarianceLbs > 0
                ? 'text-[#d4a017]'
                : 'text-[#8fa37a]'
            }`}>
              {totalVarianceLbs > 0 ? `+${formatLbs(totalVarianceLbs)}` : formatLbs(totalVarianceLbs)}
            </div>
            <div className="text-[10px] font-mono font-medium text-[#9aa3ad]">
              {stageDesignTotalLbs > 0 ? `${((totalActualPulledLbs / stageDesignTotalLbs) * 100).toFixed(1)}% of design` : '—'}
            </div>
          </div>
        </div>

        {/* Sand Type Breakdown Pills (if multiple sand types) */}
        {sandTypeBreakdown.length > 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[#2a313b]">
            {sandTypeBreakdown.map((st) => (
              <div
                key={st.sandType}
                className="bg-[#14171c] border border-[#2a313b] p-2.5 rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-[#e8ebe6]">{st.sandType}: </span>
                  <span className="font-mono font-bold text-[#e8ebe6]">{formatLbs(st.actualLbs)}</span>
                  <span className="text-[#9aa3ad] font-mono"> / {formatLbs(st.designLbs)}</span>
                </div>
                <div className={`font-mono font-semibold text-[11px] ${
                  st.diffLbs < 0 ? 'text-[#e25a4a]' : st.diffLbs > 0 ? 'text-[#d4a017]' : 'text-[#8fa37a]'
                }`}>
                  {st.diffLbs > 0 ? `+${formatLbs(st.diffLbs)}` : formatLbs(st.diffLbs)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Action Controls */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="bg-[#1b2027] hover:bg-[#2a313b] active:bg-[#14171c] text-[#9aa3ad] hover:text-[#e8ebe6] font-semibold text-sm px-6 py-3.5 rounded-xl border border-[#2a313b] transition min-h-[48px] cursor-pointer"
          >
            CANCEL
          </button>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 sm:flex-initial bg-[#c23b32] hover:bg-[#e25a4a] active:bg-[#a63028] disabled:opacity-50 text-[#e8ebe6] font-semibold text-base sm:text-lg px-8 py-3.5 rounded-xl shadow-xl border border-[#e25a4a]/40 transition active:scale-[0.98] flex items-center justify-center gap-2 min-h-[48px] cursor-pointer"
        >
          {isSubmitting ? (
            <span>RECORDING RUN...</span>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5 stroke-[2]" />
              <span>
                {submitButtonLabel || `RECORD RUN — ${selectedWellObj.name} STAGE ${stageNumber}`}
              </span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
