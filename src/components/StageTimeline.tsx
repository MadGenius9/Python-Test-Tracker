import React, { useMemo, useState } from 'react';
import {
  Clock,
  CheckCircle2,
  Calendar,
  ArrowRight,
  ArrowUpDown,
  Tag,
  ChevronRight,
  History,
  Layers,
} from 'lucide-react';
import { AppState, StageSummary } from '../types';
import { formatLbsNumber } from '../lib/sandRules';
import { formatForecastDateDisplay } from '../lib/dateUtils';
import { formatStageTimeAmPm } from '../lib/stageHistory';

interface StageTimelineProps {
  state: AppState;
  summaries: StageSummary[];
  onSelectStage: (summary: StageSummary) => void;
}

export default function StageTimeline({
  state,
  summaries,
  onSelectStage,
}: StageTimelineProps) {
  const [sortOrder, setSortOrder] = useState<'NEWEST' | 'OLDEST'>('NEWEST');

  // Group summaries by operationalDate (YYYY-MM-DD)
  const groupedByDate = useMemo(() => {
    const sorted = [...summaries].sort((a, b) => {
      const timeA = a.completionTimestamp || a.lastRunAt || a.firstRunAt || 0;
      const timeB = b.completionTimestamp || b.lastRunAt || b.firstRunAt || 0;
      return sortOrder === 'NEWEST' ? timeB - timeA : timeA - timeB;
    });

    const groups: { dateKey: string; items: StageSummary[] }[] = [];
    const groupMap = new Map<string, StageSummary[]>();

    for (const item of sorted) {
      const dateKey = item.operationalDate || 'UNKNOWN DATE';
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, []);
        groups.push({ dateKey, items: groupMap.get(dateKey)! });
      }
      groupMap.get(dateKey)!.push(item);
    }

    return groups;
  }, [summaries, sortOrder]);

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-4 sm:p-5 shadow-lg flex items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-black uppercase text-[#d4a017] tracking-wider font-mono">
            Operational History Timeline
          </div>
          <h3 className="text-lg font-black text-[#e8ebe6] font-mono tracking-tight mt-0.5">
            Stage Execution Feed
          </h3>
        </div>

        {/* Sort toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#9aa3ad] uppercase flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5" />
          </span>
          <div className="inline-flex bg-[#0b0c0e] p-1 rounded-xl border border-[#2a313b] text-xs font-bold font-mono">
            <button
              type="button"
              onClick={() => setSortOrder('NEWEST')}
              className={`px-3 py-1 rounded-lg uppercase transition ${
                sortOrder === 'NEWEST'
                  ? 'bg-[#d4a017] text-[#0b0c0e] font-black'
                  : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
              }`}
            >
              Newest First
            </button>
            <button
              type="button"
              onClick={() => setSortOrder('OLDEST')}
              className={`px-3 py-1 rounded-lg uppercase transition ${
                sortOrder === 'OLDEST'
                  ? 'bg-[#d4a017] text-[#0b0c0e] font-black'
                  : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
              }`}
            >
              Oldest First
            </button>
          </div>
        </div>
      </div>

      {/* Date Groups Feed */}
      <div className="space-y-6">
        {groupedByDate.map(({ dateKey, items }) => {
          const displayDate =
            dateKey !== 'UNKNOWN DATE' ? formatForecastDateDisplay(dateKey, true) : 'UNDATED STAGES';

          return (
            <div key={dateKey} className="space-y-3">
              {/* Date Header Badge */}
              <div className="sticky top-16 z-10 py-1 flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-[#0b0c0e] text-[#d4a017] border border-[#2a313b] shadow-md font-mono">
                  <Calendar className="w-3.5 h-3.5" /> {displayDate}
                </span>
                <div className="h-px bg-[#1b2027] flex-1" />
              </div>

              {/* Connected Timeline Cards */}
              <div className="relative pl-6 sm:pl-8 space-y-3 border-l-2 border-[#2a313b] ml-4 sm:ml-5">
                {items.map((summary) => {
                  const isComplete = summary.status === 'complete';
                  const timeStr = summary.completionTimestamp
                    ? formatStageTimeAmPm(summary.completionTimestamp)
                    : summary.displayTime || '—';

                  return (
                    <div
                      key={summary.stageKey}
                      onClick={() => onSelectStage(summary)}
                      className="relative bg-[#14171c] border border-[#2a313b] hover:border-[#d4a017]/50 rounded-lg p-4 sm:p-5 shadow-lg hover:shadow-xl transition cursor-pointer group"
                    >
                      {/* Connector Dot */}
                      <span
                        className={`absolute -left-[31px] sm:-left-[39px] top-6 w-3.5 h-3.5 rounded-full ring-4 ring-[#0b0c0e] flex items-center justify-center ${
                          isComplete ? 'bg-[#8fa37a]' : 'bg-[#d4a017]'
                        }`}
                      />

                      {/* Top row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-base sm:text-lg font-black text-[#e8ebe6] font-mono group-hover:text-[#d4a017] transition">
                            {summary.wellName}
                          </span>
                          <span className="text-[#d4a017] font-mono font-black text-base sm:text-lg">
                            STAGE #{summary.stageNumber}
                          </span>

                          {/* Status Badge */}
                          {isComplete ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-[#8fa37a]/20 text-[#8fa37a] border border-[#8fa37a]/30">
                              <CheckCircle2 className="w-3 h-3" /> COMPLETE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-[#d4a017]/20 text-[#d4a017] border border-[#d4a017]/30">
                              <Clock className="w-3 h-3" /> PARTIAL
                            </span>
                          )}

                          {summary.wasCorrected && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[#5b7c99]/20 text-[#5b7c99] border border-[#5b7c99]/30">
                              CORRECTED
                            </span>
                          )}
                        </div>

                        {/* Timestamp */}
                        <div className="text-xs font-mono text-[#9aa3ad] font-bold flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#9aa3ad]" />
                          <span>{timeStr}</span>
                        </div>
                      </div>

                      {/* Pull Sequence */}
                      <div className="bg-[#0b0c0e] p-3 rounded-xl border border-[#2a313b]/80 mt-3 font-mono text-xs">
                        <div className="text-[10px] font-black uppercase text-[#9aa3ad] mb-1.5">
                          Actual Sequence
                        </div>
                        <div className="flex items-center flex-wrap gap-1.5">
                          {summary.compactSequence.map((step, idx) => (
                            <React.Fragment key={idx}>
                              <span className="inline-flex items-center gap-1 bg-[#14171c] px-2 py-0.5 rounded border border-[#2a313b] text-[11px]">
                                <strong className="text-[#d4a017]">S{step.siloNumber}</strong>
                                <span className="text-[#e8ebe6]">
                                  {formatLbsNumber(step.lbsPulled)}
                                </span>
                              </span>
                              {idx < summary.compactSequence.length - 1 && (
                                <ArrowRight className="w-3 h-3 text-[#9aa3ad] shrink-0" />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>

                      {/* Totals footer */}
                      <div className="flex items-center justify-between font-mono text-xs mt-3 pt-2 border-t border-[#2a313b]/60">
                        <div className="flex items-center gap-4">
                          <div>
                            <span className="text-[#9aa3ad] text-[10px] uppercase">Actual: </span>
                            <strong className="text-[#d4a017] font-black">
                              {formatLbsNumber(summary.totalActualLbs)} lbs
                            </strong>
                          </div>
                          <div>
                            <span className="text-[#9aa3ad] text-[10px] uppercase">Design: </span>
                            <span className="text-[#e8ebe6]">
                              {formatLbsNumber(summary.totalDesignLbs)} lbs
                            </span>
                          </div>
                        </div>

                        <span className="text-[11px] font-bold text-[#d4a017] group-hover:text-[#d4a017] flex items-center gap-1">
                          View Stage Book <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {summaries.length === 0 && (
          <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-12 text-center text-[#9aa3ad] font-mono">
            No stage history recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}
