import {
  ArrowDown,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  X,
  Plus,
  RotateCcw,
  Check,
} from 'lucide-react';
import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  formatLbs,
  formatTons,
  getPadSummary,
  getSiloDerivedStates,
} from '../lib/sandRules';
import { getOperationalDate } from '../lib/dateUtils';
import { AppState, SiloDerivedState } from '../types';
import { RecordRunPayload } from './RecordRunForm';

interface RecordRunProps {
  state: AppState;
  onRecordRun: (records: RecordRunPayload[]) => Promise<void> | void;
  onCancel?: () => void;
}

export default function RecordRun({ state, onRecordRun, onCancel }: RecordRunProps) {
  const padSummary = getPadSummary(state);
  const defaultWell = state.config.wells[0] || { id: 'w-1', name: 'Well 1H', plannedStages: 40 };

  const [wellId, setWellId] = useState<string>(
    padSummary.activeWellId || defaultWell.id
  );
  const [stageNumber, setStageNumber] = useState<number>(padSummary.nextStageNumber);
  const [date, setDate] = useState<string>(getOperationalDate());
  const [selectedFocusSilo, setSelectedFocusSilo] = useState<number | null>(null);
  const [includedSiloNumbers, setIncludedSiloNumbers] = useState<number[]>([]);
  const [customPulls, setCustomPulls] = useState<Record<number, number>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Silo derived states for current well and stage
  const siloDerivedStates = useMemo(() => {
    return getSiloDerivedStates(state, wellId, stageNumber);
  }, [state, wellId, stageNumber]);

  // Group silos by side
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
      ? planned
      : siloDerivedStates.filter((s) => !s.isOutOfService && s.sandType).slice(0, 2).map((s) => s.siloNumber);

    setIncludedSiloNumbers(initialList);

    const initialPulls: Record<number, number> = {};
    siloDerivedStates.forEach((s) => {
      if (s.plannedPullLbs > 0) {
        initialPulls[s.siloNumber] = s.plannedPullLbs;
      }
    });
    setCustomPulls(initialPulls);

    if (initialList.length > 0) {
      setSelectedFocusSilo(initialList[0]);
    } else if (siloDerivedStates.length > 0) {
      setSelectedFocusSilo(siloDerivedStates[0].siloNumber);
    }
  }, [wellId, stageNumber, siloDerivedStates]);

  const selectedWellObj = state.config.wells.find((w) => w.id === wellId) || defaultWell;

  // Toggle silo inclusion in the sand pull
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
        <div className="bg-[#260e0c] border border-[#c23b32] text-[#e8ebe6] px-4 py-3 rounded-xl flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#e25a4a] shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-[#9aa3ad] hover:text-[#e8ebe6]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid: Left tank pad map, Right run record form */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4">
        {/* Left Column: Industrial Hopper Tank Grid */}
        <div
          className="bg-[#101318] border border-[#2a313b] rounded-xl p-4 sm:p-5 shadow-lg min-w-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(42,49,59,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(42,49,59,0.35) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-[#d4a017]">
                {padSummary.padName} pad map
              </div>
              <h1 className="text-xl sm:text-2xl font-bold font-display tracking-wide text-[#e8ebe6] mt-0.5">
                Record run · {selectedWellObj.name} · Stage {stageNumber}
              </h1>
              <div className="text-xs text-[#9aa3ad] mt-1 font-mono">
                Click a tank to toggle pull · {includedSiloNumbers.length} silo(s) selected
              </div>
            </div>

            <div className="flex items-center gap-2">
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
                className="px-3 py-1.5 rounded-lg border border-[#2a313b] bg-[#14171c] hover:bg-[#1b2027] text-xs font-mono text-[#d4a017] transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset planned</span>
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {silosBySide.map(({ sideName, silos: sideSilos }) => {
              const titleText = sideName.toUpperCase().startsWith('SIDE')
                ? sideName.toUpperCase()
                : `SIDE ${sideName.toUpperCase()}`;
              return (
                <div key={sideName}>
                  <div className="text-[11px] font-mono uppercase tracking-widest text-[#9aa3ad] mb-3">
                    {titleText}
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {sideSilos.map((silo) => {
                      const fill = Math.max(0, Math.min(100, silo.percentFull || 0));
                      const isPulling = includedSiloNumbers.includes(silo.siloNumber);
                      const isFocused = selectedFocusSilo === silo.siloNumber;
                      const pullAmount = customPulls[silo.siloNumber] ?? 0;
                      const fillColor = silo.isOutOfService ? '#2a313b' : '#d4a017';

                      return (
                        <button
                          key={silo.siloNumber}
                          type="button"
                          title={`Silo #${silo.siloNumber}: ${Math.round(silo.onHandLbs).toLocaleString()} lbs remaining · ${silo.stagesLeft.toFixed(2)} stages left`}
                          onClick={() => handleToggleSilo(silo.siloNumber)}
                          className={`group relative shrink-0 w-[132px] rounded-lg px-2 py-3 text-center transition ${
                            isPulling || isFocused
                              ? 'bg-[#1b2027] shadow-[inset_0_0_0_2px_#c23b32]'
                              : 'bg-transparent hover:bg-[#1b2027]/60'
                          }`}
                        >
                          {/* Hover tooltip showing pounds remaining and stages left */}
                          <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 z-30 opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 bg-[#0b0c0e]/95 backdrop-blur-md border border-[#c23b32]/60 px-2.5 py-1 rounded shadow-2xl text-center whitespace-nowrap min-w-[85px]">
                            <div className="text-[10px] font-mono font-bold text-[#e8ebe6]">
                              {Math.round(silo.onHandLbs).toLocaleString()} lbs remaining
                            </div>
                            <div className="text-[9px] font-mono text-[#d4a017]">
                              {silo.stagesLeft > 99 ? '>99' : silo.stagesLeft.toFixed(1)} stages left
                            </div>
                          </div>

                          <svg viewBox="0 0 120 220" className="mx-auto h-48 w-24">
                            {/* Top Dome */}
                            <ellipse cx="60" cy="22" rx="34" ry="10" fill="#1b2027" stroke="#2a313b" />
                            {/* Hopper Body */}
                            <path d="M26 22 H94 V128 L78 168 H42 L26 128 Z" fill="#14171c" stroke="#2a313b" />
                            {/* Sand Fill */}
                            <clipPath id={`run-fill-${silo.siloNumber}`}>
                              <path d="M28 28 H92 V126 L77 164 H43 L28 126 Z" />
                            </clipPath>
                            <g clipPath={`url(#run-fill-${silo.siloNumber})`}>
                              <rect x="26" y={168 - fill * 1.36} width="68" height="150" fill={fillColor} opacity="0.9" />
                            </g>
                            {/* Outer Outline */}
                            <path
                              d="M26 22 H94 V128 L78 168 H42 L26 128 Z"
                              fill="none"
                              stroke={isPulling || isFocused ? '#c23b32' : '#3a4452'}
                              strokeWidth={isPulling || isFocused ? 3 : 1.5}
                            />
                            {/* Support Legs */}
                            <path d="M36 168 L30 196 M84 168 L90 196 M30 196 H90" fill="none" stroke="#2a313b" strokeWidth="3" />

                            {/* PULL ARROW: Crimson discharge pull arrow coming out of hopper cone when pulling */}
                            {isPulling && (
                              <g className="animate-pulse">
                                <line x1="60" y1="168" x2="60" y2="204" stroke="#c23b32" strokeWidth="4" strokeLinecap="round" />
                                <path d="M52 196 L60 206 L68 196" fill="none" stroke="#c23b32" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                                <circle cx="60" cy="168" r="3" fill="#d4a017" />
                              </g>
                            )}

                            {/* Run Order Badge */}
                            {silo.runOrder !== null && !silo.isOutOfService && (
                              <g>
                                <circle cx="96" cy="48" r="12" fill="#d4a017" />
                                <text x="96" y="52" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0b0c0e">{silo.runOrder}</text>
                              </g>
                            )}

                            {/* Fill Percentage */}
                            <text x="60" y="96" textAnchor="middle" fontSize="13" fill="#e8ebe6" fontFamily="IBM Plex Mono, monospace">
                              {Math.round(fill)}%
                            </text>
                          </svg>

                          <div className="text-[10px] font-mono uppercase tracking-widest text-[#d4a017]">
                            {silo.sandType || 'Empty'}
                          </div>
                          <div className="mt-0.5 text-[11px] font-mono text-[#e8ebe6]">
                            {Math.round(silo.onHandLbs).toLocaleString()} lbs
                          </div>
                          <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-[#9aa3ad]">
                            Silo {silo.siloNumber}
                          </div>

                          {/* Pulling status callout */}
                          {isPulling ? (
                            <div className="mt-1 text-[11px] font-mono font-bold text-[#e25a4a] flex items-center justify-center gap-0.5">
                              <ArrowDown className="w-3 h-3 stroke-[2.5]" />
                              <span>{formatLbs(pullAmount)}</span>
                            </div>
                          ) : (
                            <>
                              {silo.plannedPullLbs <= 0 && !silo.isOutOfService && (
                                <div className="mt-1 text-[10px] font-semibold uppercase text-[#d4a017]">
                                  Low · no pull
                                </div>
                              )}
                              {silo.isOutOfService && (
                                <div className="mt-1 text-[10px] font-semibold uppercase text-[#e25a4a]">
                                  Offline
                                </div>
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Form Bound to Real Run Handler */}
        <aside className="bg-[#101318] border border-[#2a313b] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 xl:sticky xl:top-24">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[#2a313b] pb-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-[#9aa3ad]">Run Entry</div>
                <h2 className="text-xl font-bold font-display tracking-wide text-[#e8ebe6]">Stage sand pull</h2>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-mono uppercase text-[#9aa3ad]">Pulls active</div>
                <div className="text-sm font-mono font-bold text-[#e8ebe6]">
                  {includedSiloNumbers.length} / {siloDerivedStates.length}
                </div>
              </div>
            </div>

            {/* Well, Stage, and Date Controls */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-2">
                <label className="block text-[10px] font-mono uppercase text-[#9aa3ad] mb-1">Target well</label>
                <select
                  value={wellId}
                  onChange={(e) => setWellId(e.target.value)}
                  className="w-full bg-[#14171c] border border-[#2a313b] rounded px-2 py-1 text-xs text-[#e8ebe6] focus:outline-none focus:border-[#c23b32]"
                >
                  {state.config.wells.map((w) => (
                    <option key={w.id} value={w.id} className="bg-[#14171c]">
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-2">
                <label className="block text-[10px] font-mono uppercase text-[#9aa3ad] mb-1">Stage #</label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={stageNumber}
                  onChange={(e) => setStageNumber(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-[#14171c] border border-[#2a313b] rounded px-2 py-1 text-xs font-mono text-[#e8ebe6] focus:outline-none focus:border-[#c23b32]"
                />
              </div>

              <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-2 col-span-2">
                <label className="block text-[10px] font-mono uppercase text-[#9aa3ad] mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-[#14171c] border border-[#2a313b] rounded px-2 py-1 text-xs font-mono text-[#e8ebe6] focus:outline-none focus:border-[#c23b32]"
                />
              </div>
            </div>

            {/* Selected Silo Pull Entries */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#9aa3ad]">
                Silo pull allocations
              </div>

              {includedSiloNumbers.length === 0 ? (
                <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-4 text-center text-xs text-[#9aa3ad]">
                  No silos selected. Click any tank on the pad map to add it to this run.
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {includedSiloNumbers.map((siloNum) => {
                    const silo = siloDerivedStates.find((s) => s.siloNumber === siloNum);
                    const pullVal = customPulls[siloNum] ?? 0;
                    return (
                      <div
                        key={siloNum}
                        className={`bg-[#0b0c0e] border rounded-lg p-2.5 transition ${
                          selectedFocusSilo === siloNum
                            ? 'border-[#c23b32]'
                            : 'border-[#2a313b]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-[#e8ebe6]">Silo #{siloNum}</span>
                            <span className="text-[10px] font-mono text-[#d4a017] uppercase">
                              {silo?.sandType || 'Sand'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleSilo(siloNum)}
                            className="text-[#9aa3ad] hover:text-[#e25a4a] text-[10px] uppercase font-mono"
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
                              onChange={(e) => handlePullAmountChange(siloNum, e.target.value)}
                              className="w-full bg-[#14171c] border border-[#2a313b] rounded px-2.5 py-1.5 text-sm font-mono font-bold text-[#e8ebe6] focus:outline-none focus:border-[#c23b32]"
                            />
                            <span className="absolute right-2.5 top-2 text-[10px] font-mono text-[#9aa3ad]">
                              lbs
                            </span>
                          </div>

                          {silo?.plannedPullLbs && silo.plannedPullLbs > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setCustomPulls((prev) => ({
                                  ...prev,
                                  [siloNum]: silo.plannedPullLbs,
                                }));
                              }}
                              className="px-2 py-1.5 bg-[#1b2027] hover:bg-[#2a313b] border border-[#2a313b] rounded text-[10px] font-mono text-[#9aa3ad] hover:text-[#e8ebe6]"
                              title={`Set to planned: ${formatLbs(silo.plannedPullLbs)}`}
                            >
                              Planned
                            </button>
                          )}
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
            <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#9aa3ad] uppercase text-[10px]">Total actual pull</span>
                <span className="font-bold text-[#e8ebe6]">{formatLbs(totalActualPulledLbs)}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#9aa3ad] uppercase text-[10px]">Stage design target</span>
                <span className="text-[#9aa3ad]">{formatLbs(stageDesignTotalLbs)}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-[#2a313b]/60">
                <span className="text-[#9aa3ad] uppercase text-[10px]">Variance</span>
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
                className="w-full bg-[#c23b32] hover:bg-[#e25a4a] disabled:opacity-50 text-[#e8ebe6] font-semibold text-sm px-3 py-2.5 rounded-lg transition shadow-md flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? (
                  <span>Recording run...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Save run record</span>
                  </>
                )}
              </button>

              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-full bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] hover:text-[#e8ebe6] font-medium text-xs px-3 py-2 rounded-lg border border-[#2a313b] transition"
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
