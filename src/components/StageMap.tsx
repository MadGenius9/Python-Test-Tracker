import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Circle,
  Tag,
  Layers,
  FileSpreadsheet,
  Info,
} from 'lucide-react';
import { AppState, StageSummary, WellConfig } from '../types';
import { formatLbs } from '../lib/sandRules';
import { getStageSummary } from '../lib/stageHistory';

interface StageMapProps {
  state: AppState;
  summaries: StageSummary[];
  onSelectStage: (summary: StageSummary) => void;
  onNavigateToPullSheet?: (wellId: string, stageNumber: number) => void;
}

export default function StageMap({
  state,
  summaries,
  onSelectStage,
  onNavigateToPullSheet,
}: StageMapProps) {
  const wells = state.config?.wells || [];
  const [selectedWellId, setSelectedWellId] = useState<string>(wells[0]?.id || '');

  const activeWell: WellConfig | undefined = wells.find((w) => w.id === selectedWellId) || wells[0];

  // Map of recorded summaries for active well
  const stageSummaryMap = useMemo(() => {
    const map = new Map<number, StageSummary>();
    if (!activeWell) return map;

    summaries
      .filter((s) => s.wellId === activeWell.id)
      .forEach((s) => {
        map.set(s.stageNumber, s);
      });

    return map;
  }, [summaries, activeWell]);

  // Overall metrics for selected well
  const { totalPlanned, completeCount, partialCount, remainingCount, totalPumpedLbs } = useMemo(() => {
    if (!activeWell) {
      return { totalPlanned: 0, completeCount: 0, partialCount: 0, remainingCount: 0, totalPumpedLbs: 0 };
    }

    const planned = activeWell.plannedStages || 0;
    let complete = 0;
    let partial = 0;
    let pumped = 0;

    stageSummaryMap.forEach((summary) => {
      if (summary.status === 'complete') complete++;
      else if (summary.status === 'partial') partial++;
      pumped += summary.totalActualLbs;
    });

    // Remaining = not-started future stages only (planned - complete - partial)
    const notStartedCount = Math.max(0, planned - complete - partial);

    return {
      totalPlanned: planned,
      completeCount: complete,
      partialCount: partial,
      remainingCount: notStartedCount,
      totalPumpedLbs: pumped,
    };
  }, [activeWell, stageSummaryMap]);

  if (!activeWell) {
    return (
      <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-8 text-center text-[#9aa3ad]">
        No wells configured for this pad.
      </div>
    );
  }

  // Generate array of stage numbers from 1 to plannedStages (or at least max recorded stage)
  const keys: number[] = Array.from(stageSummaryMap.keys());
  const maxRecorded = keys.length > 0 ? Math.max(...keys) : 0;
  const totalStagesToDisplay = Math.max(activeWell.plannedStages || 0, maxRecorded, 1);
  const stageNumbers = Array.from({ length: totalStagesToDisplay }, (_, i) => i + 1);

  const handleCellClick = (stageNum: number) => {
    const existing = stageSummaryMap.get(stageNum);
    if (existing) {
      onSelectStage(existing);
    } else {
      const unstartedSummary = getStageSummary(state, activeWell.id, stageNum);
      onSelectStage(unstartedSummary);
    }
  };

  return (
    <div className="space-y-4">
      {/* Well Selection Tabs */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-3 sm:p-4 shadow-lg">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {wells.map((w) => {
            const isSelected = w.id === activeWell.id;
            const wSummaries = summaries.filter((s) => s.wellId === w.id);
            const wComplete = wSummaries.filter((s) => s.status === 'complete').length;

            return (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWellId(w.id)}
                className={`px-4 py-2.5 rounded-xl font-mono text-xs transition shrink-0 flex items-center gap-2.5 cursor-pointer border ${
                  isSelected
                    ? 'bg-[#d4a017] text-[#0b0c0e] font-black border-[#d4a017] shadow-md'
                    : 'bg-[#0b0c0e] text-[#e8ebe6] hover:text-[#e8ebe6] border-[#2a313b] hover:border-[#2a313b]'
                }`}
              >
                <span className="font-bold text-sm">{w.name}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black ${
                    isSelected ? 'bg-[#0b0c0e]/30 text-[#0b0c0e]' : 'bg-[#1b2027] text-[#9aa3ad]'
                  }`}
                >
                  {wComplete}/{w.plannedStages || 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Well Overview Stats Banner */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-black uppercase text-[#d4a017] tracking-wider font-mono">
              Active Well Stage Map
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-[#e8ebe6] font-mono tracking-tight mt-0.5">
              {activeWell.name}
            </h3>
          </div>

          {/* Metric Badges */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-mono text-xs">
            <div className="bg-[#0b0c0e] px-3 py-2 rounded-xl border border-[#2a313b]">
              <span className="text-[10px] font-bold text-[#9aa3ad] uppercase block">Complete</span>
              <strong className="text-[#8fa37a] font-black text-sm">{completeCount}</strong>
            </div>

            <div className="bg-[#0b0c0e] px-3 py-2 rounded-xl border border-[#2a313b]">
              <span className="text-[10px] font-bold text-[#9aa3ad] uppercase block">Partial</span>
              <strong className="text-[#d4a017] font-black text-sm">{partialCount}</strong>
            </div>

            <div className="bg-[#0b0c0e] px-3 py-2 rounded-xl border border-[#2a313b]">
              <span className="text-[10px] font-bold text-[#9aa3ad] uppercase block">Remaining</span>
              <strong className="text-[#e8ebe6] font-black text-sm">{remainingCount}</strong>
            </div>

            <div className="bg-[#0b0c0e] px-3 py-2 rounded-xl border border-[#2a313b]">
              <span className="text-[10px] font-bold text-[#9aa3ad] uppercase block">Planned</span>
              <strong className="text-[#e8ebe6] font-black text-sm">{totalPlanned}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Stage Grid */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-4 sm:p-6 shadow-xl">
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 sm:gap-2.5">
          {stageNumbers.map((stageNum) => {
            const summary = stageSummaryMap.get(stageNum);
            const isComplete = summary?.status === 'complete';
            const isPartial = summary?.status === 'partial';
            const isNotStarted = !summary || summary.status === 'not_started';
            const wasCorrected = summary?.wasCorrected;

            let bgClass = 'bg-[#0b0c0e] border-[#2a313b]/80 text-[#9aa3ad] hover:border-[#2a313b] hover:text-[#e8ebe6]';
            if (isComplete) {
              bgClass = 'bg-[#141e17]/30 border-[#8fa37a]/50 text-[#8fa37a] hover:border-[#8fa37a] hover:bg-[#141e17]/40 shadow-sm';
            } else if (isPartial) {
              bgClass = 'bg-[#291e04]/30 border-[#d4a017]/50 text-[#d4a017] hover:border-[#d4a017] hover:bg-[#291e04]/40 shadow-sm';
            }

            return (
              <button
                key={stageNum}
                type="button"
                onClick={() => handleCellClick(stageNum)}
                className={`relative aspect-square rounded-xl border flex flex-col items-center justify-center p-1 transition cursor-pointer font-mono group ${bgClass}`}
                title={`${activeWell.name} Stage #${stageNum}: ${
                  isComplete ? 'Complete' : isPartial ? 'Partial' : 'Not Started'
                }`}
              >
                {/* Edited / Corrected Indicator Dot */}
                {wasCorrected && (
                  <span
                    className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#5b7c99] ring-2 ring-[#14171c]"
                    title="Stage records were corrected/edited"
                  />
                )}

                {/* Status icon */}
                <div className="mb-0.5">
                  {isComplete ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#8fa37a]" />
                  ) : isPartial ? (
                    <Clock className="w-3.5 h-3.5 text-[#d4a017]" />
                  ) : (
                    <Circle className="w-3 h-3 text-[#9aa3ad] group-hover:text-[#9aa3ad]" />
                  )}
                </div>

                {/* Stage number */}
                <span className="text-xs font-black tracking-tight">
                  {String(stageNum).padStart(2, '0')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-6 pt-4 border-t border-[#2a313b]/80 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-[#141e17]/40 border border-[#8fa37a] flex items-center justify-center">
              <CheckCircle2 className="w-2.5 h-2.5 text-[#8fa37a]" />
            </span>
            <span className="text-[#e8ebe6] font-bold">Complete Stage</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-[#291e04]/40 border border-[#d4a017] flex items-center justify-center">
              <Clock className="w-2.5 h-2.5 text-[#d4a017]" />
            </span>
            <span className="text-[#e8ebe6] font-bold">Partial Stage</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-[#0b0c0e] border border-[#2a313b] flex items-center justify-center">
              <Circle className="w-2.5 h-2.5 text-[#9aa3ad]" />
            </span>
            <span className="text-[#9aa3ad]">Not Started</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#5b7c99]" />
            <span className="text-[#e8ebe6] font-bold">Edited / Corrected</span>
          </div>
        </div>
      </div>
    </div>
  );
}
