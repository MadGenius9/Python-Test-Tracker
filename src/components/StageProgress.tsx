import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Gauge,
  Info,
  Layers,
  Sliders,
  Sparkles,
  Timer,
  TrendingUp,
  Zap,
} from 'lucide-react';
import React, { useState } from 'react';
import {
  formatForecastDateDisplay,
  formatForecastDateTimeDisplay,
  formatHoursAndMinutes,
  formatOperationalDateDisplay,
} from '../lib/dateUtils';
import {
  calculateProjectedFinish,
  calculateSandDesignForWell,
  calculateSandPumpedForWell,
  calculateStagePace,
  formatLbs,
  isStageComplete,
} from '../lib/sandRules';
import { AppState, ForecastMode, WellConfig } from '../types';

interface StageProgressProps {
  state: AppState;
}

export default function StageProgress({ state }: StageProgressProps) {
  const { config, runs } = state;
  const lbsPerTon = config.lbsPerTon || 2000;

  const [forecastMode, setForecastMode] = useState<ForecastMode>(config.forecastMode || 'adaptive');
  const [manualInputType, setManualInputType] = useState<'stagesPerDay' | 'hoursPerStage'>('stagesPerDay');
  const [manualStagesPerDayInput, setManualStagesPerDayInput] = useState<string>(
    config.manualStagesPerDay ? String(config.manualStagesPerDay) : '10.0'
  );
  const [manualHoursPerStageInput, setManualHoursPerStageInput] = useState<string>(
    config.manualHoursPerStage ? String(config.manualHoursPerStage) : '2.4'
  );
  const [showPaceDetails, setShowPaceDetails] = useState<boolean>(false);

  const schemaVersion =
    state.config.stageRecordsSchemaVersion ??
    (state as any).stageRecordsSchemaVersion ??
    1;
  const isRebuildingHistory = schemaVersion < 4;

  const wells =
    config.wells.length > 0
      ? config.wells
      : [{ id: 'w-1', name: 'Well 1H', plannedStages: 40 }];

  // 1. Authoritative Pace & History Stats across entire Pad
  const paceStats = calculateStagePace(state);

  // 2. Compute Authoritative Stats Per Well (Using isStageComplete)
  const wellProgressList = wells.map((well) => {
    const plannedStages = well.plannedStages || 0;

    let pumpedStages = 0;
    let firstIncompleteStage: number | null = null;

    for (let stg = 1; stg <= plannedStages; stg++) {
      if (isStageComplete(state, well.id, stg)) {
        pumpedStages++;
      } else if (firstIncompleteStage === null) {
        firstIncompleteStage = stg;
      }
    }

    const remainingStages = Math.max(0, plannedStages - pumpedStages);
    const percentComplete =
      plannedStages > 0
        ? Math.min(100, Math.round((pumpedStages / plannedStages) * 100))
        : 0;

    // Current Stage is the first incomplete stage (e.g. Stage 43 if 1-42 complete)
    const currentActiveStage =
      firstIncompleteStage !== null ? firstIncompleteStage : plannedStages > 0 ? plannedStages : 1;

    // Active runs for this well (for sand weight calculations)
    const wellRuns = (runs || []).filter((r) => !r.deleted && r.wellId === well.id);
    const totalSandPumpedLbs = wellRuns.reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
    const totalSandPumpedTons = totalSandPumpedLbs / lbsPerTon;

    // Per sand type breakdown for this well
    const sandTypeBreakdown = (config.sandTypes || []).map((st) => {
      const designLbs = calculateSandDesignForWell(well, st);
      const pumpedLbs = calculateSandPumpedForWell(well.id, st.name, state);
      const varianceLbs = pumpedLbs - designLbs;
      const variancePercent = designLbs > 0 ? (varianceLbs / designLbs) * 100 : 0;
      return {
        sandType: st,
        designLbs,
        pumpedLbs,
        varianceLbs,
        variancePercent,
      };
    });

    const totalSandDesignLbs = sandTypeBreakdown.reduce((s, b) => s + b.designLbs, 0);
    const estimatedSandRemainingLbs = Math.max(0, totalSandDesignLbs - totalSandPumpedLbs);
    const estimatedSandRemainingTons = estimatedSandRemainingLbs / lbsPerTon;

    return {
      well,
      plannedStages,
      pumpedStages,
      remainingStages,
      percentComplete,
      totalSandPumpedLbs,
      totalSandPumpedTons,
      totalSandDesignLbs,
      estimatedSandRemainingLbs,
      estimatedSandRemainingTons,
      currentActiveStage,
      sandTypeBreakdown,
    };
  });

  // Master Pad Totals
  const totalPadPlannedStages = wellProgressList.reduce((sum, w) => sum + w.plannedStages, 0);
  const totalPadPumpedStages = wellProgressList.reduce((sum, w) => sum + w.pumpedStages, 0);
  const totalPadRemainingStages = Math.max(0, totalPadPlannedStages - totalPadPumpedStages);
  const totalPadPercentComplete =
    totalPadPlannedStages > 0
      ? Math.min(100, Math.round((totalPadPumpedStages / totalPadPlannedStages) * 100))
      : 0;

  const totalPadSandPumpedLbs = wellProgressList.reduce((sum, w) => sum + w.totalSandPumpedLbs, 0);
  const totalPadSandPumpedTons = totalPadSandPumpedLbs / lbsPerTon;

  // Forecast Resolution
  const parsedManualStagesPerDay = parseFloat(manualStagesPerDayInput) || undefined;
  const parsedManualHoursPerStage = parseFloat(manualHoursPerStageInput) || undefined;

  const forecast = calculateProjectedFinish(
    totalPadRemainingStages,
    {
      mode: forecastMode,
      manualStagesPerDay: manualInputType === 'stagesPerDay' ? parsedManualStagesPerDay : undefined,
      manualHoursPerStage: manualInputType === 'hoursPerStage' ? parsedManualHoursPerStage : undefined,
      stagePaceStats: paceStats,
    },
    state
  );

  // Pad totals per sand type
  const padSandTypeTotals = (config.sandTypes || []).map((st) => {
    const padDesignLbs = wells.reduce((sum, w) => sum + calculateSandDesignForWell(w, st), 0);
    const padPumpedLbs = wells.reduce(
      (sum, w) => sum + calculateSandPumpedForWell(w.id, st.name, state),
      0
    );
    const varianceLbs = padPumpedLbs - padDesignLbs;
    const variancePercent = padDesignLbs > 0 ? (varianceLbs / padDesignLbs) * 100 : 0;
    return { sandType: st, padDesignLbs, padPumpedLbs, varianceLbs, variancePercent };
  });

  return (
    <div className="space-y-6">
      {/* Pad Level Overview Banner */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 sm:p-6 shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="bg-[#d4a017] text-[#0b0c0e] p-3 rounded-lg font-black shadow-lg">
              <Activity className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-[#d4a017]">
                WELL PAD OPERATIONS
              </div>
              <h2 className="text-2xl font-bold text-[#e8ebe6] tracking-wide uppercase font-display">
                STAGE PROGRESS & PAD FORECAST
              </h2>
              <p className="text-xs text-[#9aa3ad] font-semibold mt-0.5">
                Real-time tracking of planned, pumped, and remaining frac stages with pace-driven completion forecasting.
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs font-black uppercase text-[#9aa3ad] tracking-wider">
              PAD OVERALL COMPLETION
            </div>
            <div className="text-3xl font-black text-[#d4a017] font-mono">
              {totalPadPercentComplete}%
            </div>
          </div>
        </div>

        {/* Master Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-black uppercase">
            <span className="text-[#8fa37a] flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> {totalPadPumpedStages} COMPLETED STAGES
            </span>
            <span className="text-[#d4a017]">
              {totalPadRemainingStages} STAGES REMAINING
            </span>
            <span className="text-[#e8ebe6] font-mono">
              {totalPadPlannedStages} TOTAL PLANNED
            </span>
          </div>

          <div className="w-full bg-[#0b0c0e] rounded-full h-4 p-0.5 border border-[#2a313b] overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#d4a017] via-[#d4a017] to-[#8fa37a] h-full rounded-full transition-all duration-500 shadow-md"
              style={{ width: `${totalPadPercentComplete}%` }}
            ></div>
          </div>
        </div>

        {/* Expanded Pad Forecast Stat Tiles (6 Metrics Visible) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          {/* Tile 1: Planned Stages */}
          <div className="bg-[#0b0c0e]/80 p-3.5 rounded-lg border border-[#2a313b]">
            <div className="text-[10px] font-black uppercase text-[#9aa3ad]">PLANNED STAGES</div>
            <div className="text-xl font-black text-[#e8ebe6] font-mono mt-0.5">{totalPadPlannedStages}</div>
            <div className="text-[11px] text-[#9aa3ad] font-bold">{wells.length} Wells Active</div>
          </div>

          {/* Tile 2: Completed Stages */}
          <div className="bg-[#0b0c0e]/80 p-3.5 rounded-lg border border-[#2a313b]">
            <div className="text-[10px] font-black uppercase text-[#9aa3ad]">COMPLETED</div>
            <div className="text-xl font-black text-[#8fa37a] font-mono mt-0.5">{totalPadPumpedStages}</div>
            <div className="text-[11px] text-[#8fa37a] font-bold">{totalPadPercentComplete}% Done</div>
          </div>

          {/* Tile 3: Remaining Stages */}
          <div className="bg-[#0b0c0e]/80 p-3.5 rounded-lg border border-[#2a313b]">
            <div className="text-[10px] font-black uppercase text-[#9aa3ad]">REMAINING</div>
            <div className="text-xl font-black text-[#d4a017] font-mono mt-0.5">{totalPadRemainingStages}</div>
            <div className="text-[11px] text-[#d4a017] font-bold">To Complete</div>
          </div>

          {/* Tile 4: Stages Today */}
          <div className="bg-[#0b0c0e]/80 p-3.5 rounded-lg border border-[#2a313b]">
            <div className="text-[10px] font-black uppercase text-[#9aa3ad]">STAGES TODAY</div>
            <div className="text-xl font-black text-[#5b7c99] font-mono mt-0.5">{paceStats.todayCompletedStages}</div>
            <div className="text-[11px] text-[#5b7c99] font-bold">Central Time</div>
          </div>

          {/* Tile 5: Active Forecast Pace */}
          <div className="bg-[#0b0c0e]/80 p-3.5 rounded-lg border border-[#2a313b]">
            <div className="text-[10px] font-black uppercase text-[#9aa3ad] flex items-center justify-between">
              <span>ACTIVE PACE</span>
              <span className="text-[9px] text-[#d4a017] font-mono uppercase">{forecastMode}</span>
            </div>
            <div className="text-xl font-black text-[#d4a017] font-mono mt-0.5 truncate">
              {forecast.hoursPerStage !== null && forecast.hoursPerStage > 0
                ? `${formatHoursAndMinutes(forecast.hoursPerStage)}/stg`
                : forecast.stagesPerDay !== null && forecast.stagesPerDay > 0
                ? `${forecast.stagesPerDay.toFixed(1)}/day`
                : '—'}
            </div>
            <div className="text-[11px] text-[#9aa3ad] font-bold truncate">
              {forecast.stagesPerDay !== null && forecast.stagesPerDay > 0
                ? `${forecast.stagesPerDay.toFixed(1)} stages/day`
                : 'No History'}
            </div>
          </div>

          {/* Tile 6: Projected Finish */}
          <div className="bg-[#0b0c0e]/80 p-3.5 rounded-lg border border-[#d4a017]/30 bg-[#291e04]/10">
            <div className="text-[10px] font-black uppercase text-[#d4a017] flex items-center gap-1">
              <Calendar className="w-3 h-3" /> PROJECTED FINISH
            </div>
            <div className="text-base font-black text-[#e8ebe6] font-mono mt-0.5 truncate">
              {totalPadRemainingStages === 0
                ? 'COMPLETED'
                : forecast.finishDateTimeDisplay || 'WAITING'}
            </div>
            <div className="text-[11px] text-[#d4a017] font-bold">
              {totalPadRemainingStages === 0
                ? '0 Days Left'
                : forecast.projectedDaysRemaining !== null
                ? `~${forecast.projectedDaysRemaining.toFixed(1)} Days Left`
                : 'No History'}
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Projected Pad Finish Card */}
      <div className="bg-gradient-to-br from-[#14171c] via-[#14171c] to-[#0b0c0e] border border-[#2a313b] rounded-xl p-6 shadow-2xl space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-[#2a313b] pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#8fa37a] text-[#0b0c0e] p-2.5 rounded-xl font-black shadow-md">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-[#e8ebe6] uppercase tracking-tight">
                  PROJECTED PAD FINISH
                </h3>
                <span
                  className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border font-mono ${
                    forecast.confidence === 'HIGH'
                      ? 'bg-[#141e17]/60 border-[#8fa37a]/50 text-[#8fa37a]'
                      : forecast.confidence === 'MEDIUM'
                      ? 'bg-[#291e04]/60 border-[#d4a017]/50 text-[#d4a017]'
                      : forecast.confidence === 'LOW'
                      ? 'bg-[#121820]/60 border-[#5b7c99]/50 text-[#5b7c99]'
                      : 'bg-[#1b2027] border-[#2a313b] text-[#9aa3ad]'
                  }`}
                >
                  {forecast.confidence} CONFIDENCE
                </span>
              </div>
              <p className="text-xs text-[#9aa3ad] font-semibold mt-0.5">
                Pace-based completion model using real stage cycle durations and pumping history (Central Time).
              </p>
            </div>
          </div>

          {/* 5 Forecast Mode Selectors */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#0b0c0e] p-1.5 rounded-lg border border-[#2a313b] text-xs font-black">
            <button
              type="button"
              onClick={() => setForecastMode('adaptive')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                forecastMode === 'adaptive'
                  ? 'bg-[#d4a017] text-[#0b0c0e] shadow-md font-black'
                  : 'text-[#9aa3ad] hover:text-[#e8ebe6] hover:bg-[#14171c]'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>ADAPTIVE</span>
              <span className={`text-[9px] px-1 py-0.2 rounded font-black uppercase ${
                forecastMode === 'adaptive' ? 'bg-[#0b0c0e] text-[#d4a017]' : 'bg-[#1b2027] text-[#9aa3ad]'
              }`}>
                REC
              </span>
            </button>
            <button
              type="button"
              onClick={() => setForecastMode('rolling_24h')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                forecastMode === 'rolling_24h'
                  ? 'bg-[#d4a017] text-[#0b0c0e] shadow-md font-black'
                  : 'text-[#9aa3ad] hover:text-[#e8ebe6] hover:bg-[#14171c]'
              }`}
            >
              ROLLING 24H
            </button>
            <button
              type="button"
              onClick={() => setForecastMode('recent_3d')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                forecastMode === 'recent_3d'
                  ? 'bg-[#d4a017] text-[#0b0c0e] shadow-md font-black'
                  : 'text-[#9aa3ad] hover:text-[#e8ebe6] hover:bg-[#14171c]'
              }`}
            >
              RECENT 3D
            </button>
            <button
              type="button"
              onClick={() => setForecastMode('recent_7d')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                forecastMode === 'recent_7d'
                  ? 'bg-[#d4a017] text-[#0b0c0e] shadow-md font-black'
                  : 'text-[#9aa3ad] hover:text-[#e8ebe6] hover:bg-[#14171c]'
              }`}
            >
              7D
            </button>
            <button
              type="button"
              onClick={() => setForecastMode('manual')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
                forecastMode === 'manual'
                  ? 'bg-[#d4a017] text-[#0b0c0e] shadow-md font-black'
                  : 'text-[#9aa3ad] hover:text-[#e8ebe6] hover:bg-[#14171c]'
              }`}
            >
              <Sliders className="w-3 h-3" /> MANUAL
            </button>
          </div>
        </div>

        {/* Manual Rate Input Bar (Visible only when MANUAL mode is active) */}
        {forecastMode === 'manual' && (
          <div className="bg-[#0b0c0e] p-4 rounded-lg border border-[#d4a017]/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="text-xs font-black text-[#d4a017] uppercase flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" /> MANUAL WHAT-IF STAGE PACE
              </div>
              <p className="text-[11px] text-[#9aa3ad]">
                Simulate different stage cycle times or daily rates. Does not modify actual production history.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Unit Toggle */}
              <div className="flex bg-[#14171c] p-1 rounded-xl border border-[#2a313b] text-xs font-black">
                <button
                  type="button"
                  onClick={() => setManualInputType('stagesPerDay')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    manualInputType === 'stagesPerDay' ? 'bg-[#d4a017] text-[#0b0c0e]' : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
                  }`}
                >
                  STAGES / DAY
                </button>
                <button
                  type="button"
                  onClick={() => setManualInputType('hoursPerStage')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    manualInputType === 'hoursPerStage' ? 'bg-[#d4a017] text-[#0b0c0e]' : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
                  }`}
                >
                  HOURS / STAGE
                </button>
              </div>

              {manualInputType === 'stagesPerDay' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0.1"
                    max="50"
                    value={manualStagesPerDayInput}
                    onChange={(e) => {
                      setManualStagesPerDayInput(e.target.value);
                      const num = parseFloat(e.target.value);
                      if (num > 0) {
                        setManualHoursPerStageInput((24 / num).toFixed(2));
                      }
                    }}
                    className="w-24 bg-[#14171c] border border-[#2a313b] text-[#e8ebe6] font-mono font-black text-center px-3 py-1.5 rounded-xl focus:border-[#d4a017] focus:outline-none"
                    placeholder="10.0"
                  />
                  <span className="text-xs font-black text-[#d4a017] font-mono">STG/DAY</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="48"
                    value={manualHoursPerStageInput}
                    onChange={(e) => {
                      setManualHoursPerStageInput(e.target.value);
                      const num = parseFloat(e.target.value);
                      if (num > 0) {
                        setManualStagesPerDayInput((24 / num).toFixed(1));
                      }
                    }}
                    className="w-24 bg-[#14171c] border border-[#2a313b] text-[#e8ebe6] font-mono font-black text-center px-3 py-1.5 rounded-xl focus:border-[#d4a017] focus:outline-none"
                    placeholder="2.4"
                  />
                  <span className="text-xs font-black text-[#d4a017] font-mono">HRS/STAGE</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Extended Downtime Note if present in Adaptive Mode */}
        {forecastMode === 'adaptive' && paceStats.extendedDowntimeNote && (
          <div className="bg-[#291e04]/30 border border-[#d4a017]/40 rounded-lg p-3.5 flex items-center gap-3 text-xs text-[#d4a017]">
            <Info className="w-4 h-4 text-[#d4a017] shrink-0" />
            <span>{paceStats.extendedDowntimeNote}</span>
          </div>
        )}

        {/* Active Stage In-Progress Banner */}
        {paceStats.currentActiveStageDetail && totalPadRemainingStages > 0 && (
          <div className="bg-[#121820]/30 border border-[#5b7c99]/40 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-[#5b7c99] animate-pulse" />
              <span className="font-black uppercase text-[#5b7c99]">ACTIVE STAGE IN PROGRESS:</span>
              <span className="text-[#e8ebe6] font-bold">
                {paceStats.currentActiveStageDetail.wellName} Stage {paceStats.currentActiveStageDetail.stageNumber}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[#e8ebe6] font-mono">
              <span>{Math.round(paceStats.currentActiveStageDetail.fractionComplete * 100)}% sand pumped</span>
              <span>•</span>
              <span className="text-[#5b7c99]">
                ~{Math.round(paceStats.currentActiveStageDetail.fractionRemaining * 100)}% remaining
              </span>
            </div>
          </div>
        )}

        {/* Main Forecast Hero Display */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-7 space-y-3">
            <div className="text-xs font-black uppercase tracking-wider text-[#9aa3ad] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#d4a017]" /> ESTIMATED COMPLETION DATE & TIME
            </div>

            {isRebuildingHistory ? (
              <div className="bg-[#291e04]/40 border border-[#d4a017]/50 rounded-lg p-4 flex items-center gap-3.5 text-[#d4a017]">
                <div className="w-5 h-5 border border-[#d4a017] border-t-transparent rounded-full animate-spin shrink-0" />
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-[#d4a017]">
                    REBUILDING PRODUCTION HISTORY
                  </div>
                  <p className="text-[11px] text-[#d4a017]/80 mt-0.5">
                    Aligning historical stage completion timestamps with authoritative run logs.
                  </p>
                </div>
              </div>
            ) : totalPadRemainingStages === 0 ? (
              <div className="space-y-1">
                <div className="text-3xl sm:text-4xl font-black text-[#8fa37a] font-mono tracking-tight uppercase">
                  ALL PAD STAGES COMPLETED
                </div>
                <p className="text-xs text-[#8fa37a] font-bold">
                  {totalPadPlannedStages} of {totalPadPlannedStages} planned stages pumped to design.
                </p>
              </div>
            ) : !forecast.finishDate ? (
              <div className="space-y-1">
                <div className="text-2xl sm:text-3xl font-black text-[#e8ebe6] font-mono tracking-tight uppercase">
                  {paceStats.totalCompletedStages > 0 ? 'COLLECTING LIVE DATA' : 'WAITING FOR STAGE HISTORY'}
                </div>
                <p className="text-xs text-[#d4a017]/90 font-semibold flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {paceStats.totalCompletedStages > 0
                    ? `Pace tracking requires completed stages with live timing. ${paceStats.excludedHistoricalStagesCount} historical stage${paceStats.excludedHistoricalStagesCount === 1 ? '' : 's'} counted in total progress are excluded from pace calculation.`
                    : 'Complete at least one stage to calculate pace.'}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-3xl sm:text-4xl font-black text-[#e8ebe6] font-mono tracking-tight uppercase">
                  {forecast.finishDateTimeDisplay}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono font-bold text-[#e8ebe6]">
                  <span className="text-[#d4a017]">
                    {totalPadRemainingStages} stages remaining
                  </span>
                  <span className="text-[#9aa3ad]">•</span>
                  <span className="text-[#8fa37a]">
                    {forecast.hoursPerStage !== null && `${formatHoursAndMinutes(forecast.hoursPerStage)}/stage`}
                    {forecast.stagesPerDay !== null && ` (${forecast.stagesPerDay.toFixed(1)} stg/day)`}
                  </span>
                  <span className="text-[#9aa3ad]">•</span>
                  <span className="text-[#5b7c99]">
                    ~{forecast.projectedDaysRemaining?.toFixed(1)} days left ({forecast.projectedHoursRemaining?.toFixed(1)} hrs)
                  </span>
                </div>
              </div>
            )}

            <div className="text-[11px] text-[#9aa3ad] font-semibold">
              {forecast.paceDescription}
              {forecast.fallbackApplied && (
                <span className="text-[#d4a017] block mt-0.5">({forecast.fallbackApplied})</span>
              )}
            </div>
          </div>

          {/* Daily Stage Production Mini-History */}
          <div className="md:col-span-5 bg-[#0b0c0e] p-4 rounded-lg border border-[#2a313b] space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-black uppercase text-[#9aa3ad]">
              <span className="flex items-center gap-1.5 text-[#d4a017]">
                <TrendingUp className="w-3.5 h-3.5" /> RECENT PUMPING DAYS
              </span>
              <span className="font-mono text-[#9aa3ad]">
                {paceStats.totalPumpingDays} Active Day{paceStats.totalPumpingDays === 1 ? '' : 's'}
              </span>
            </div>

            {paceStats.dailyCounts.length === 0 ? (
              <div className="text-xs text-[#9aa3ad] italic py-2 text-center">
                No completed stages logged yet
              </div>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {paceStats.dailyCounts
                  .slice(-5)
                  .reverse()
                  .map((dc) => {
                    const isToday = dc.date === paceStats.todayOperationalDate;
                    return (
                      <div
                        key={dc.date}
                        className={`flex items-center justify-between text-xs font-mono px-3 py-1.5 rounded-xl border ${
                          isToday
                            ? 'bg-[#121820]/30 border-[#5b7c99]/40 text-[#e8ebe6]'
                            : 'bg-[#14171c] border-[#2a313b]/80 text-[#e8ebe6]'
                        }`}
                      >
                        <span className="font-sans font-bold flex items-center gap-1.5">
                          {formatOperationalDateDisplay(dc.date, {
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC',
                          })}
                          {isToday && (
                            <span className="text-[9px] bg-[#5b7c99]/20 text-[#5b7c99] px-1.5 py-0.2 rounded font-black uppercase">
                              Today
                            </span>
                          )}
                        </span>
                        <span className="font-black text-[#8fa37a] font-mono">
                          {dc.count} stage{dc.count === 1 ? '' : 's'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Collapsible Pace Details Debug Section */}
        <div className="border-t border-[#2a313b]/80 pt-3">
          <button
            type="button"
            onClick={() => setShowPaceDetails(!showPaceDetails)}
            className="w-full px-3 py-2 rounded-xl bg-[#0b0c0e]/80 hover:bg-[#0b0c0e] border border-[#2a313b] flex items-center justify-between text-xs font-black uppercase text-[#9aa3ad] hover:text-[#d4a017] transition"
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#d4a017]" />
              <span>STAGE CYCLE & PACE DETAILS</span>
            </div>
            <span className="text-[10px] font-mono text-[#d4a017]">
              {showPaceDetails ? 'HIDE ▲' : 'EXPAND ▼'}
            </span>
          </button>

          {showPaceDetails && (
            <div className="mt-3 p-4 bg-[#0b0c0e]/90 rounded-lg border border-[#2a313b] space-y-4">
              {/* Stage Cycle Timings */}
              <div>
                <div className="text-[10px] font-black uppercase text-[#9aa3ad] tracking-wider mb-2 flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-[#d4a017]" /> RECENT STAGE CYCLES (MOST RECENT COMPLETED)
                </div>
                {paceStats.stageCycles && paceStats.stageCycles.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {paceStats.stageCycles.slice(-12).reverse().map((c, idx) => (
                      <div
                        key={`${c.wellId}_${c.stageNumber}_${idx}`}
                        className={`p-2.5 rounded-xl border ${
                          c.isOutlierDowntime
                            ? 'bg-[#260e0c]/20 border-[#c23b32]/60'
                            : 'bg-[#14171c] border-[#2a313b]/80'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-[#e8ebe6]">{c.wellName} Stg {c.stageNumber}</span>
                          {c.isOutlierDowntime && (
                            <span className="text-[9px] text-[#e25a4a] font-mono">DOWNTIME</span>
                          )}
                        </div>
                        <div className={`text-base font-black font-mono mt-0.5 ${
                          c.isOutlierDowntime ? 'text-[#e25a4a]' : 'text-[#d4a017]'
                        }`}>
                          {formatHoursAndMinutes(c.cycleDurationHours)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[#9aa3ad] text-xs italic">
                    Requires at least 2 completed live stages to measure stage cycle time.
                  </div>
                )}
              </div>

              {/* All Method Comparison Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#2a313b]/60 font-mono">
                <div>
                  <div className="text-[10px] text-[#9aa3ad] uppercase font-sans font-bold">ADAPTIVE CYCLE</div>
                  <div className="text-base font-black text-[#d4a017] mt-0.5">
                    {paceStats.adaptiveStageCycleHours !== null
                      ? `${formatHoursAndMinutes(paceStats.adaptiveStageCycleHours)}/stg`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-[#9aa3ad]">
                    {paceStats.adaptiveStagesPerDay ? `${paceStats.adaptiveStagesPerDay.toFixed(1)} stg/day` : 'No history'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9aa3ad] uppercase font-sans font-bold">ROLLING 24H</div>
                  <div className="text-base font-black text-[#e8ebe6] mt-0.5">
                    {paceStats.rolling24hStagesPerDay > 0
                      ? `${paceStats.rolling24hStagesPerDay.toFixed(1)} / DAY`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-[#9aa3ad]">
                    {paceStats.rolling24hCompletedStages} stages in 24h
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9aa3ad] uppercase font-sans font-bold">RECENT 3-DAY</div>
                  <div className="text-base font-black text-[#e8ebe6] mt-0.5">
                    {paceStats.recentAverageStagesPerDay > 0
                      ? `${paceStats.recentAverageStagesPerDay.toFixed(1)} / DAY`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-[#9aa3ad]">
                    {paceStats.daysUsedForRecentAverage} prior days used
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9aa3ad] uppercase font-sans font-bold">7-DAY AVG</div>
                  <div className="text-base font-black text-[#e8ebe6] mt-0.5">
                    {paceStats.sevenDayAverageStagesPerDay > 0
                      ? `${paceStats.sevenDayAverageStagesPerDay.toFixed(1)} / DAY`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-[#9aa3ad]">
                    {paceStats.daysUsedForSevenDayAverage} prior days used
                  </div>
                </div>
              </div>

              {/* Stage Source Breakdown */}
              <div className="pt-2 border-t border-[#2a313b]/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-[#8fa37a] font-bold">
                    ✓ {paceStats.completedStages.length} Live Tracked Stage{paceStats.completedStages.length === 1 ? '' : 's'} (In Pace)
                  </span>
                  {paceStats.excludedHistoricalStagesCount > 0 && (
                    <span className="text-[#9aa3ad] font-semibold">
                      • {paceStats.excludedHistoricalStagesCount} Historical Stage{paceStats.excludedHistoricalStagesCount === 1 ? '' : 's'} (Excluded From Pace)
                    </span>
                  )}
                </div>
                {paceStats.paceTrackingStartedAt && (
                  <span className="text-[#9aa3ad] font-mono text-[11px]">
                    Live Tracking Started: {new Date(paceStats.paceTrackingStartedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Individual Well Cards */}
      <div className="space-y-4">
        <div className="text-xs font-black uppercase tracking-wider text-[#d4a017] px-1">
          PER-WELL STAGE BREAKDOWN ({wells.length} WELLS)
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {wellProgressList.map((wp) => (
            <div
              key={wp.well.id}
              className="bg-[#14171c] border border-[#2a313b] rounded-lg p-5 shadow-xl space-y-4"
            >
              {/* Well Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#2a313b]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#d4a017] text-[#0b0c0e] font-black text-lg font-mono flex items-center justify-center shadow-md shrink-0">
                    {wp.well.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-[#e8ebe6] uppercase tracking-tight">
                      {wp.well.name}
                    </h3>
                    <div className="text-xs font-bold text-[#d4a017]">
                      {wp.remainingStages === 0 ? (
                        <span className="text-[#8fa37a] flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Well Complete
                        </span>
                      ) : (
                        `Current Stage: #${wp.currentActiveStage}`
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-black text-[#d4a017] font-mono">
                    {wp.percentComplete}%
                  </div>
                  <div className="text-[10px] font-bold uppercase text-[#9aa3ad]">
                    PROGRESS
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="w-full bg-[#0b0c0e] rounded-full h-3.5 p-0.5 border border-[#2a313b] overflow-hidden">
                  <div
                    className="bg-[#d4a017] h-full rounded-full transition-all duration-500"
                    style={{ width: `${wp.percentComplete}%` }}
                  ></div>
                </div>

                <div className="flex justify-between text-[11px] font-bold font-mono text-[#9aa3ad]">
                  <span>{wp.pumpedStages} / {wp.plannedStages} Stages Complete</span>
                  <span className="text-[#d4a017]">{wp.remainingStages} Left</span>
                </div>
              </div>

              {/* Stat Details Grid */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="bg-[#0b0c0e] p-2.5 rounded-xl border border-[#2a313b]">
                  <div className="text-[9px] font-black uppercase text-[#9aa3ad]">PLANNED</div>
                  <div className="text-base font-black text-[#e8ebe6] font-mono">{wp.plannedStages}</div>
                  <div className="text-[9px] text-[#9aa3ad]">Stages</div>
                </div>

                <div className="bg-[#0b0c0e] p-2.5 rounded-xl border border-[#2a313b]">
                  <div className="text-[9px] font-black uppercase text-[#9aa3ad]">PUMPED</div>
                  <div className="text-base font-black text-[#8fa37a] font-mono">{wp.pumpedStages}</div>
                  <div className="text-[9px] text-[#8fa37a] font-bold">Complete</div>
                </div>

                <div className="bg-[#0b0c0e] p-2.5 rounded-xl border border-[#2a313b]">
                  <div className="text-[9px] font-black uppercase text-[#9aa3ad]">REMAINING</div>
                  <div className="text-base font-black text-[#d4a017] font-mono">{wp.remainingStages}</div>
                  <div className="text-[9px] text-[#d4a017] font-bold">Stages Left</div>
                </div>
              </div>

              {/* Per Sand Type Breakdown Table */}
              <div className="bg-[#0b0c0e] p-3 rounded-xl border border-[#2a313b] space-y-2">
                <div className="text-[10px] font-black uppercase text-[#d4a017]">
                  SAND TYPE DESIGN VS PUMPED
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead>
                      <tr className="text-[#9aa3ad] border-b border-[#2a313b]">
                        <th className="pb-1 font-black">SAND</th>
                        <th className="pb-1 text-right font-black">DESIGN</th>
                        <th className="pb-1 text-right font-black">PUMPED</th>
                        <th className="pb-1 text-right font-black">VARIANCE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a313b]/50">
                      {wp.sandTypeBreakdown.map((sb) => (
                        <tr key={sb.sandType.id}>
                          <td className="py-1 font-sans font-bold text-[#e8ebe6]">{sb.sandType.name}</td>
                          <td className="py-1 text-right text-[#e8ebe6]">
                            {formatLbs(sb.designLbs)}
                          </td>
                          <td className="py-1 text-right font-bold text-[#8fa37a]">
                            {formatLbs(sb.pumpedLbs)}
                          </td>
                          <td
                            className={`py-1 text-right font-bold ${
                              sb.varianceLbs > 0
                                ? 'text-[#d4a017]'
                                : sb.varianceLbs < 0
                                ? 'text-[#5b7c99]'
                                : 'text-[#9aa3ad]'
                            }`}
                          >
                            {sb.varianceLbs > 0 ? '+' : ''}
                            {formatLbs(sb.varianceLbs)}{' '}
                            <span className="text-[9px] font-normal">
                              ({sb.variancePercent > 0 ? '+' : ''}
                              {sb.variancePercent.toFixed(1)}%)
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sand Weight Stat Footer */}
              <div className="bg-[#0b0c0e] p-3 rounded-xl border border-[#2a313b] flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] font-black uppercase text-[#9aa3ad] block">
                    TOTAL SAND PUMPED
                  </span>
                  <span className="font-mono font-black text-[#e8ebe6]">{formatLbs(wp.totalSandPumpedLbs)}</span>
                  <span className="text-[10px] text-[#9aa3ad] font-bold ml-1.5">
                    ({wp.totalSandPumpedTons.toFixed(1)} T)
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-black uppercase text-[#9aa3ad] block">
                    EST. SAND REMAINING
                  </span>
                  <span className="font-mono font-black text-[#d4a017]">
                    {formatLbs(wp.estimatedSandRemainingLbs)}
                  </span>
                  <span className="text-[10px] text-[#9aa3ad] font-bold ml-1.5">
                    ({wp.estimatedSandRemainingTons.toFixed(1)} T)
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pad Totals Row by Sand Type */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 shadow-2xl space-y-3">
        <div className="flex items-center gap-3 border-b border-[#2a313b] pb-2">
          <div className="bg-[#d4a017] text-[#0b0c0e] p-2 rounded-xl font-black">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-[#e8ebe6] uppercase tracking-tight">
              PAD TOTALS BY SAND TYPE (ALL WELLS)
            </h3>
            <p className="text-xs text-[#9aa3ad] font-semibold">
              Aggregated planned design vs actual sand pumped across the entire well pad.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="bg-[#0b0c0e] text-[#9aa3ad] font-black uppercase border-b border-[#2a313b]">
                <th className="py-3 px-4">SAND TYPE</th>
                <th className="py-3 px-3 text-right">TOTAL PAD DESIGN</th>
                <th className="py-3 px-3 text-right">PUMPED TO DATE</th>
                <th className="py-3 px-3 text-right">VARIANCE (LBS)</th>
                <th className="py-3 px-4 text-right">VARIANCE (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a313b]/60">
              {padSandTypeTotals.map((pst) => (
                <tr key={pst.sandType.id} className="hover:bg-[#0b0c0e]/40">
                  <td className="py-3 px-4 font-sans font-black text-[#e8ebe6] text-sm">
                    {pst.sandType.name}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-[#e8ebe6]">
                    {formatLbs(pst.padDesignLbs)}
                  </td>
                  <td className="py-3 px-3 text-right font-black text-[#8fa37a]">
                    {formatLbs(pst.padPumpedLbs)}
                  </td>
                  <td
                    className={`py-3 px-3 text-right font-black ${
                      pst.varianceLbs > 0
                        ? 'text-[#d4a017]'
                        : pst.varianceLbs < 0
                        ? 'text-[#5b7c99]'
                        : 'text-[#9aa3ad]'
                    }`}
                  >
                    {pst.varianceLbs > 0 ? '+' : ''}
                    {formatLbs(pst.varianceLbs)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-black ${
                      pst.varianceLbs > 0
                        ? 'text-[#d4a017]'
                        : pst.varianceLbs < 0
                        ? 'text-[#5b7c99]'
                        : 'text-[#9aa3ad]'
                    }`}
                  >
                    {pst.variancePercent > 0 ? '+' : ''}
                    {pst.variancePercent.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#0b0c0e] border-t-2 border-[#2a313b] font-black text-[#e8ebe6]">
                <td className="py-3.5 px-4 font-sans uppercase text-[#d4a017]">TOTAL ALL SANDS</td>
                <td className="py-3.5 px-3 text-right text-[#e8ebe6]">
                  {formatLbs(padSandTypeTotals.reduce((s, p) => s + p.padDesignLbs, 0))}
                </td>
                <td className="py-3.5 px-3 text-right text-[#8fa37a] text-sm">
                  {formatLbs(padSandTypeTotals.reduce((s, p) => s + p.padPumpedLbs, 0))}
                </td>
                <td className="py-3.5 px-3 text-right text-[#d4a017]">
                  {formatLbs(padSandTypeTotals.reduce((s, p) => s + p.varianceLbs, 0))}
                </td>
                <td className="py-3.5 px-4 text-right text-[#e8ebe6]">
                  {(
                    (padSandTypeTotals.reduce((s, p) => s + p.varianceLbs, 0) /
                      (padSandTypeTotals.reduce((s, p) => s + p.padDesignLbs, 0) || 1)) *
                    100
                  ).toFixed(1)}
                  %
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
