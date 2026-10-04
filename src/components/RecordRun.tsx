import {
  AlertTriangle,
  RotateCcw,
  Check,
  X,
} from 'lucide-react';
import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  formatLbs,
  getPadSummary,
  getSiloDerivedStates,
} from '../lib/sandRules';
import { getOperationalDate } from '../lib/dateUtils';
import { AppState, SiloDerivedState } from '../types';
import { RecordRunPayload } from './RecordRunForm';
import HopperField from './HopperField';

interface RecordRunProps {
  state: AppState;
  initialSiloNumber?: number;
  onSelectSilo?: (siloNumber: number) => void;
  onRecordRun: (records: RecordRunPayload[]) => Promise<void> | void;
  onCancel?: () => void;
}

export default function RecordRun({
  state,
  initialSiloNumber,
  onSelectSilo,
  onRecordRun,
  onCancel,
}: RecordRunProps) {
  const padSummary = getPadSummary(state);
  const defaultWell = state.config.wells[0] || { id: 'w-1', name: 'Well 1H', plannedStages: 40 };

  const [wellId, setWellId] = useState<string>(
    padSummary.activeWellId || defaultWell.id
  );
  const [stageNumber, setStageNumber] = useState<number>(padSummary.nextStageNumber);
  const [date, setDate] = useState<string>(getOperationalDate());
  const [selectedFocusSilo, setSelectedFocusSilo] = useState<number | null>(
    initialSiloNumber ?? null
  );
  const [includedSiloNumbers, setIncludedSiloNumbers] = useState<number[]>([]);
  const [customPulls, setCustomPulls] = useState<Record<number, number>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Silo derived states for current well and stage
  const siloDerivedStates = useMemo(() => {
    return getSiloDerivedStates(state, wellId, stageNumber);
  }, [state, wellId, stageNumber]);

  // Group silos by side for HopperField
  const silosBySide = useMemo(() => {
    const sidesMap = new Map<string, SiloDerivedState[]>();
    siloDerivedStates.forEach((s) => {
      const sName = (s.side || 'A').trim();
      if (!sidesMap.has(sName)) {
        sidesMap.set(sName, []);
      }
      sidesMap.get(sName)!.push(s);
    });
    return Array.from(sidesMap.entries())
      .map(([sideName, silos]) => ({
        sideName,
        silos: silos.sort((a, b) => a.siloNumber - b.siloNumber),
      }))
      .sort((a, b) => a.sideName.localeCompare(b.sideName));
  }, [siloDerivedStates]);

  // Initialize included silos from planned pulls when well or stage changes
  useEffect(() => {
    const planned = siloDerivedStates
      .filter((s) => s.plannedPullLbs > 0 && !s.isOutOfService)
      .map((s) => s.siloNumber);

    const initialList = planned.length > 0
      ? [...planned]
      : siloDerivedStates.filter((s) => !s.isOutOfService && s.sandType).slice(0, 2).map((s) => s.siloNumber);

    const initialPulls: Record<number, number> = {};
    siloDerivedStates.forEach((s) => {
      if (s.plannedPullLbs > 0) {
        initialPulls[s.siloNumber] = s.plannedPullLbs;
      }
    });

    if (initialSiloNumber && siloDerivedStates.some((s) => s.siloNumber === initialSiloNumber)) {
      if (!initialList.includes(initialSiloNumber)) {
        initialList.push(initialSiloNumber);
        const derived = siloDerivedStates.find((s) => s.siloNumber === initialSiloNumber);
        initialPulls[initialSiloNumber] = derived?.plannedPullLbs && derived.plannedPullLbs > 0
          ? derived.plannedPullLbs
          : 0;
      }
      setSelectedFocusSilo(initialSiloNumber);
    } else if (initialList.length > 0) {
      setSelectedFocusSilo(initialList[0]);
    } else if (siloDerivedStates.length > 0) {
      setSelectedFocusSilo(siloDerivedStates[0].siloNumber);
    }

    setIncludedSiloNumbers(initialList);
    setCustomPulls(initialPulls);
  }, [wellId, stageNumber, siloDerivedStates, initialSiloNumber]);

  const selectedWellObj = state.config.wells.find((w) => w.id === wellId) || defaultWell;

  // Handle clicking a tank in HopperField
  const handleSelectSilo = (siloNum: number) => {
    setSelectedFocusSilo(siloNum);
    onSelectSilo?.(siloNum);

    // If not already in included list, add it to active run allocations
    if (!includedSiloNumbers.includes(siloNum)) {
      setIncludedSiloNumbers((prev) => [...prev, siloNum]);
      const derived = siloDerivedStates.find((s) => s.siloNumber === siloNum);
      const defaultPull = derived?.plannedPullLbs && derived.plannedPullLbs > 0
        ? derived.plannedPullLbs
        : 0;
      setCustomPulls((prev) => ({
        ...prev,
        [siloNum]: prev[siloNum] !== undefined ? prev[siloNum] : defaultPull,
      }));
    }
  };

  // Toggle/Remove silo inclusion
  const handleToggleSilo = (siloNum: number) => {
    setSelectedFocusSilo(siloNum);
    if (includedSiloNumbers.includes(siloNum)) {
      setIncludedSiloNumbers((prev) => prev.filter((n) => n !== siloNum));
      setCustomPulls((prev) => {
        const next = { ...prev };
        delete next[siloNum];
        return next;
      });
    } else {
      const derived = siloDerivedStates.find((s) => s.siloNumber === siloNum);
      const defaultPull = derived?.plannedPullLbs && derived.plannedPullLbs > 0
        ? derived.plannedPullLbs
        : 0;
      setIncludedSiloNumbers((prev) => [...prev, siloNum]);
      setCustomPulls((prev) => ({
        ...prev,
        [siloNum]: defaultPull,
      }));
    }
  };

  const handlePullAmountChange = (siloNum: number, rawVal: string) => {
    const num = rawVal === '' ? 0 : parseInt(rawVal.replace(/[^0-9]/g, ''), 10);
    setCustomPulls((prev) => ({
      ...prev,
      [siloNum]: isNaN(num) ? 0 : num,
    }));
  };

  // Metrics
  const stageDesignTotalLbs = useMemo(() => {
    return state.config.sandTypes.reduce(
      (sum, st) => sum + (st.perStageDesignLbs || 0),
      0
    );
  }, [state.config.sandTypes]);

  const totalActualPulledLbs = useMemo(() => {
    return includedSiloNumbers.reduce((sum, siloNum) => {
      return sum + (customPulls[siloNum] || 0);
    }, 0);
  }, [includedSiloNumbers, customPulls]);

  const totalVarianceLbs = totalActualPulledLbs - stageDesignTotalLbs;
  const variancePercentage = stageDesignTotalLbs > 0
    ? (totalVarianceLbs / stageDesignTotalLbs) * 100
    : 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);

    const pullEntries = includedSiloNumbers
      .filter((siloNum) => (customPulls[siloNum] || 0) > 0)
      .map((siloNum) => {
        const silo = siloDerivedStates.find((s) => s.siloNumber === siloNum);
        return {
          wellId,
          stageNumber,
          siloNumber: siloNum,
          sandType: silo?.sandType || '',
          lbsPulled: customPulls[siloNum] || 0,
          date,
        };
      });

    if (pullEntries.length === 0) {
      setErrorMessage('Please enter at least one silo pull amount greater than 0 lbs.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onRecordRun(pullEntries);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to record stage run');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {errorMessage && (
        <div className="bg-[#1a0c0b] border border-[#e25a4a] text-[#f3efe4] px-4 py-3 flex items-center justify-between gap-3 text-sm font-mono">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#e25a4a] shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-[#9aa3ad] hover:text-[#f3efe4]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid: Left HopperField Pad, Right Run Form */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_520px] 2xl:grid-cols-[minmax(0,1fr)_580px] gap-4 items-start">
        {/* Left Column: Industrial HopperField */}
        <div className="min-w-0">
          <HopperField
            sides={silosBySide}
            selectedSilo={selectedFocusSilo}
            onSelect={handleSelectSilo}
          />
        </div>

        {/* Right Column: Existing Run Form */}
        <aside className="border border-[#3a2a16] bg-[#0c0c0c] p-4 sm:p-5 space-y-4 xl:sticky xl:top-4 min-w-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[#2a2418] pb-3">
              <div>
                <div className="font-display text-2xl tracking-wide text-[#f0d48a]">RECORD RUN</div>
                <div className="mt-0.5 text-xs font-mono uppercase tracking-widest text-[#d4a017]">
                  {selectedWellObj.name} · Stage {stageNumber}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-mono uppercase tracking-widest text-[#9aa3ad]">Pulls active</div>
                <div className="text-sm font-mono font-bold text-[#f0d48a]">
                  {includedSiloNumbers.length} / {siloDerivedStates.length}
                </div>
              </div>
            </div>

            {/* Well, Stage, and Date Controls */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#050505] border border-[#2a2418] p-2">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#9aa3ad] mb-1">Target well</label>
                <select
                  value={wellId}
                  onChange={(e) => setWellId(e.target.value)}
                  className="w-full bg-black border border-[#3a2a16] px-2 py-1 text-xs text-[#f3efe4] focus:outline-none focus:border-[#d4a017]"
                >
                  {state.config.wells.map((w) => (
                    <option key={w.id} value={w.id} className="bg-black">
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-[#050505] border border-[#2a2418] p-2">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#9aa3ad] mb-1">Stage #</label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={stageNumber}
                  onChange={(e) => setStageNumber(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-black border border-[#3a2a16] px-2 py-1 text-xs font-mono text-[#f3efe4] focus:outline-none focus:border-[#d4a017]"
                />
              </div>

              <div className="bg-[#050505] border border-[#2a2418] p-2 col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-[#9aa3ad]">Date</label>
                  <button
                    type="button"
                    onClick={() => {
                      const planned = siloDerivedStates
                        .filter((s) => s.plannedPullLbs > 0 && !s.isOutOfService)
                        .map((s) => s.siloNumber);
                      setIncludedSiloNumbers(planned);
                      const pulls: Record<number, number> = {};
                      siloDerivedStates.forEach((s) => {
                        if (s.plannedPullLbs > 0) pulls[s.siloNumber] = s.plannedPullLbs;
                      });
                      setCustomPulls(pulls);
                    }}
                    className="text-[10px] font-mono uppercase tracking-wider text-[#d4a017] hover:text-[#f0d48a] flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset to planned</span>
                  </button>
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-black border border-[#3a2a16] px-2 py-1 text-xs font-mono text-[#f3efe4] focus:outline-none focus:border-[#d4a017]"
                />
              </div>
            </div>

            {/* Selected Silo Pull Entries */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#d4a017]">
                Silo pull allocations
              </div>

              {includedSiloNumbers.length === 0 ? (
                <div className="bg-[#050505] border border-[#2a2418] p-4 text-center text-xs font-mono text-[#9aa3ad]">
                  No silos selected. Click any tank on the pad map to add it to this run.
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {includedSiloNumbers.map((siloNum) => {
                    const silo = siloDerivedStates.find((s) => s.siloNumber === siloNum);
                    const pullVal = customPulls[siloNum] ?? 0;
                    const isSelected = selectedFocusSilo === siloNum;
                    return (
                      <div
                        key={siloNum}
                        onClick={() => {
                          setSelectedFocusSilo(siloNum);
                          onSelectSilo?.(siloNum);
                        }}
                        className={`border p-2.5 transition cursor-pointer ${
                          isSelected
                            ? 'border-[#e25a4a] bg-[#1a0c0b]'
                            : 'border-[#2a2418] bg-[#050505] hover:border-[#3a2a16]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`font-mono font-bold ${isSelected ? 'text-[#e25a4a]' : 'text-[#f3efe4]'}`}>
                              Silo #{siloNum}
                            </span>
                            <span className="text-[10px] font-mono text-[#d4a017] uppercase tracking-wider">
                              {silo?.sandType || 'Empty'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSilo(siloNum);
                            }}
                            className="text-[#9aa3ad] hover:text-[#e25a4a] text-[10px] uppercase font-mono tracking-wider"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={pullVal > 0 ? pullVal.toLocaleString() : ''}
                              placeholder="0"
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handlePullAmountChange(siloNum, e.target.value)}
                              className="w-full bg-black border border-[#3a2a16] px-2.5 py-1.5 text-sm font-mono font-bold text-[#f3efe4] focus:outline-none focus:border-[#d4a017]"
                            />
                            <span className="absolute right-2.5 top-2 text-[10px] font-mono text-[#9aa3ad]">
                              lbs
                            </span>
                          </div>

                          {silo?.plannedPullLbs && silo.plannedPullLbs > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomPulls((prev) => ({
                                  ...prev,
                                  [siloNum]: silo.plannedPullLbs,
                                }));
                              }}
                              className="px-2 py-1.5 bg-[#141414] hover:bg-[#202020] border border-[#3a2a16] text-[10px] font-mono text-[#d4a017] hover:text-[#f3efe4]"
                              title={`Set to planned: ${formatLbs(silo.plannedPullLbs)}`}
                            >
                              Planned
                            </button>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-[#9aa3ad] font-mono mt-1">
                          <span>On hand: {Math.round(silo?.onHandLbs || 0).toLocaleString()} lbs</span>
                          {silo?.plannedPullLbs ? <span>Plan: {formatLbs(silo.plannedPullLbs)}</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Design Variance Summary */}
            <div className="bg-[#050505] border border-[#2a2418] p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#9aa3ad] uppercase text-[10px] tracking-wider">Total actual pull</span>
                <span className="font-bold text-[#f0d48a]">{formatLbs(totalActualPulledLbs)}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#9aa3ad] uppercase text-[10px] tracking-wider">Stage design target</span>
                <span className="text-[#9aa3ad]">{formatLbs(stageDesignTotalLbs)}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-[#2a2418]">
                <span className="text-[#9aa3ad] uppercase text-[10px] tracking-wider">Variance</span>
                <span
                  className={`font-bold ${
                    Math.abs(variancePercentage) <= 5
                      ? 'text-[#8fa37a]'
                      : totalVarianceLbs > 0
                      ? 'text-[#d4a017]'
                      : 'text-[#e25a4a]'
                  }`}
                >
                  {totalVarianceLbs >= 0 ? `+${formatLbs(totalVarianceLbs)}` : formatLbs(totalVarianceLbs)}{' '}
                  ({variancePercentage >= 0 ? `+${variancePercentage.toFixed(1)}%` : `${variancePercentage.toFixed(1)}%`})
                </span>
              </div>
            </div>

            {/* Submit & Cancel Buttons */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="submit"
                disabled={isSubmitting || includedSiloNumbers.length === 0}
                className="w-full border border-[#e25a4a] bg-[#e25a4a] hover:bg-[#c23b32] disabled:opacity-40 text-black font-mono font-bold text-xs uppercase tracking-widest px-3 py-2.5 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span>Recording run...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Save run record</span>
                  </>
                )}
              </button>

              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-full bg-black hover:bg-[#141414] text-[#9aa3ad] hover:text-[#f3efe4] font-mono text-xs uppercase tracking-widest px-3 py-2 border border-[#3a2a16] transition"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
