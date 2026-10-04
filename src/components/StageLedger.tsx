import React, { useMemo, useState } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowUpDown,
  Tag,
  History,
  Layers,
  Calendar,
  X,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { AppState, StageSummary } from '../types';
import { formatLbsNumber } from '../lib/sandRules';
import { getOperationalDate } from '../lib/dateUtils';
import { getStageSummary } from '../lib/stageHistory';

interface StageLedgerProps {
  state: AppState;
  summaries: StageSummary[];
  onSelectStage: (summary: StageSummary) => void;
}

export default function StageLedger({
  state,
  summaries,
  onSelectStage,
}: StageLedgerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [wellFilter, setWellFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETE' | 'PARTIAL'>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | '24H' | 'CUSTOM'>('ALL');
  const [customDate, setCustomDate] = useState('');
  const [sortOption, setSortOption] = useState<'NEWEST' | 'OLDEST' | 'STAGE_ASC' | 'STAGE_DESC'>('NEWEST');

  // Quick lookup inputs
  const [lookupWellId, setLookupWellId] = useState(state.config?.wells?.[0]?.id || '');
  const [lookupStageNum, setLookupStageNum] = useState('');

  const todayStr = getOperationalDate();
  const nowMs = Date.now();
  const twentyFourHoursAgoMs = nowMs - 24 * 60 * 60 * 1000;

  // Filtered and Sorted summaries
  const filteredSummaries = useMemo(() => {
    let list = [...summaries];

    // Search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const isSiloSearch = q.startsWith('s') && !isNaN(parseInt(q.slice(1), 10));
      const targetSiloNum = isSiloSearch ? parseInt(q.slice(1), 10) : null;

      list = list.filter((s) => {
        // Well match
        if (s.wellName.toLowerCase().includes(q)) return true;
        // Stage match
        if (`stage ${s.stageNumber}`.includes(q) || `#${s.stageNumber}`.includes(q) || `${s.stageNumber}` === q) return true;
        // Silo match
        if (targetSiloNum !== null && s.pullSequence.some((p) => p.siloNumber === targetSiloNum)) return true;
        if (s.pullSequence.some((p) => `silo ${p.siloNumber}`.includes(q) || `s${p.siloNumber}`.includes(q) || p.sandType.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    // Well filter
    if (wellFilter !== 'ALL') {
      list = list.filter((s) => s.wellId === wellFilter);
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      list = list.filter((s) => s.status === statusFilter.toLowerCase());
    }

    // Date filter
    if (dateFilter === 'TODAY') {
      list = list.filter((s) => s.operationalDate === todayStr);
    } else if (dateFilter === '24H') {
      list = list.filter((s) => (s.completionTimestamp || s.lastRunAt || 0) >= twentyFourHoursAgoMs);
    } else if (dateFilter === 'CUSTOM' && customDate) {
      list = list.filter((s) => s.operationalDate === customDate);
    }

    // Sorting
    list.sort((a, b) => {
      if (sortOption === 'NEWEST') {
        const timeA = a.completionTimestamp || a.lastRunAt || a.firstRunAt || 0;
        const timeB = b.completionTimestamp || b.lastRunAt || b.firstRunAt || 0;
        return timeB - timeA;
      }
      if (sortOption === 'OLDEST') {
        const timeA = a.completionTimestamp || a.lastRunAt || a.firstRunAt || 0;
        const timeB = b.completionTimestamp || b.lastRunAt || b.firstRunAt || 0;
        return timeA - timeB;
      }
      if (sortOption === 'STAGE_ASC') {
        if (a.wellName !== b.wellName) return a.wellName.localeCompare(b.wellName);
        return a.stageNumber - b.stageNumber;
      }
      if (sortOption === 'STAGE_DESC') {
        if (a.wellName !== b.wellName) return a.wellName.localeCompare(b.wellName);
        return b.stageNumber - a.stageNumber;
      }
      return 0;
    });

    return list;
  }, [
    summaries,
    searchTerm,
    wellFilter,
    statusFilter,
    dateFilter,
    customDate,
    sortOption,
    todayStr,
    twentyFourHoursAgoMs,
  ]);

  const handleQuickLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupWellId || !lookupStageNum) return;
    const stageNum = parseInt(lookupStageNum, 10);
    if (isNaN(stageNum) || stageNum < 1) return;

    // Check if summary is in list
    const existing = summaries.find((s) => s.wellId === lookupWellId && s.stageNumber === stageNum);
    if (existing) {
      onSelectStage(existing);
    } else {
      const summary = getStageSummary(state, lookupWellId, stageNum);
      onSelectStage(summary);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters Toolbar */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-4 sm:p-5 shadow-lg space-y-4">
        {/* Top line: Search and Quick Lookup */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Main search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#9aa3ad] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search well, stage # (e.g. 49), or silo (e.g. S6)..."
              className="w-full bg-[#0b0c0e] border border-[#2a313b] focus:border-[#d4a017] rounded-xl pl-10 pr-9 py-2 text-xs font-mono text-[#e8ebe6] placeholder-[#9aa3ad] outline-none transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa3ad] hover:text-[#e8ebe6]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Lookup Box */}
          <form
            onSubmit={handleQuickLookup}
            className="flex items-center gap-2 bg-[#0b0c0e] p-1.5 rounded-xl border border-[#2a313b] shrink-0"
          >
            <span className="text-[10px] font-black uppercase text-[#d4a017] px-2 tracking-wider hidden sm:inline">
              Quick View
            </span>
            <select
              value={lookupWellId}
              onChange={(e) => setLookupWellId(e.target.value)}
              aria-label="Select Well for Quick Lookup"
              className="bg-[#14171c] border border-[#2a313b] text-xs font-bold text-[#e8ebe6] px-2 py-1.5 rounded-lg outline-none cursor-pointer"
            >
              {(state.config?.wells || []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              max="999"
              value={lookupStageNum}
              onChange={(e) => setLookupStageNum(e.target.value)}
              placeholder="Stage #"
              aria-label="Stage Number"
              className="w-20 bg-[#14171c] border border-[#2a313b] text-xs font-mono font-bold text-[#d4a017] px-2 py-1.5 rounded-lg outline-none"
            />

            <button
              type="submit"
              disabled={!lookupStageNum}
              className="bg-[#d4a017] hover:bg-[#d4a017] disabled:opacity-40 text-[#0b0c0e] font-black text-xs px-3 py-1.5 rounded-lg uppercase tracking-wider transition cursor-pointer"
            >
              VIEW
            </button>
          </form>
        </div>

        {/* Filter Pills and Dropdowns */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#2a313b]/80">
          <div className="flex flex-wrap items-center gap-2">
            {/* Well Filter */}
            <select
              value={wellFilter}
              onChange={(e) => setWellFilter(e.target.value)}
              aria-label="Filter by Well"
              className="bg-[#0b0c0e] border border-[#2a313b] text-xs font-bold text-[#e8ebe6] px-3 py-1.5 rounded-xl outline-none cursor-pointer hover:border-[#2a313b]"
            >
              <option value="ALL">ALL WELLS</option>
              {(state.config?.wells || []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <div className="inline-flex bg-[#0b0c0e] p-1 rounded-xl border border-[#2a313b] text-xs font-bold">
              {(['ALL', 'COMPLETE', 'PARTIAL'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg uppercase transition ${
                    statusFilter === st
                      ? 'bg-[#d4a017] text-[#0b0c0e] font-black'
                      : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Date Filter */}
            <div className="inline-flex items-center bg-[#0b0c0e] p-1 rounded-xl border border-[#2a313b] text-xs font-bold">
              <button
                type="button"
                onClick={() => setDateFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg uppercase transition ${
                  dateFilter === 'ALL'
                    ? 'bg-[#d4a017] text-[#0b0c0e] font-black'
                    : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
                }`}
              >
                ALL TIME
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('TODAY')}
                className={`px-2.5 py-1 rounded-lg uppercase transition ${
                  dateFilter === 'TODAY'
                    ? 'bg-[#d4a017] text-[#0b0c0e] font-black'
                    : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
                }`}
              >
                TODAY
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('24H')}
                className={`px-2.5 py-1 rounded-lg uppercase transition ${
                  dateFilter === '24H'
                    ? 'bg-[#d4a017] text-[#0b0c0e] font-black'
                    : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
                }`}
              >
                24H
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('CUSTOM')}
                className={`px-2.5 py-1 rounded-lg uppercase transition ${
                  dateFilter === 'CUSTOM'
                    ? 'bg-[#d4a017] text-[#0b0c0e] font-black'
                    : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
                }`}
              >
                DATE
              </button>
            </div>

            {dateFilter === 'CUSTOM' && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                aria-label="Custom Date Filter"
                className="bg-[#0b0c0e] border border-[#2a313b] text-xs font-mono text-[#e8ebe6] px-2.5 py-1.5 rounded-xl outline-none"
              />
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[#9aa3ad] uppercase flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" /> Sort:
            </span>
            <select
              value={sortOption}
              onChange={(e: any) => setSortOption(e.target.value)}
              aria-label="Sort Order"
              className="bg-[#0b0c0e] border border-[#2a313b] text-xs font-bold text-[#e8ebe6] px-2.5 py-1.5 rounded-xl outline-none cursor-pointer hover:border-[#2a313b]"
            >
              <option value="NEWEST">Newest Activity</option>
              <option value="OLDEST">Oldest Activity</option>
              <option value="STAGE_ASC">Stage # (Ascending)</option>
              <option value="STAGE_DESC">Stage # (Descending)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between px-1 text-xs text-[#9aa3ad] font-mono">
        <span>
          Showing <strong className="text-[#e8ebe6] font-bold">{filteredSummaries.length}</strong> recorded stage{filteredSummaries.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Main Ledger Table (Desktop) */}
      <div className="hidden md:block bg-[#14171c] border border-[#2a313b] rounded-lg overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="bg-[#0b0c0e]/80 border-b border-[#2a313b] text-[#9aa3ad] text-[11px] font-black uppercase tracking-wider">
              <th className="py-3 px-4">Well</th>
              <th className="py-3 px-3">Stage</th>
              <th className="py-3 px-3">Date / Time</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-4">Actual Pull Sequence</th>
              <th className="py-3 px-3 text-right">Actual</th>
              <th className="py-3 px-3 text-right">Design</th>
              <th className="py-3 px-3 text-right">Variance</th>
              <th className="py-3 px-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a313b]/60">
            {filteredSummaries.map((summary) => {
              const isComplete = summary.status === 'complete';
              const isPartial = summary.status === 'partial';

              return (
                <tr
                  key={summary.stageKey}
                  onClick={() => onSelectStage(summary)}
                  className="hover:bg-[#1b2027]/60 transition cursor-pointer group"
                >
                  {/* Well */}
                  <td className="py-3 px-4 font-bold text-[#e8ebe6] group-hover:text-[#d4a017] transition">
                    {summary.wellName}
                  </td>

                  {/* Stage */}
                  <td className="py-3 px-3 font-black text-[#d4a017]">
                    #{summary.stageNumber}
                  </td>

                  {/* Date / Time */}
                  <td className="py-3 px-3 text-[#e8ebe6] text-[11px] whitespace-nowrap">
                    <div>{summary.displayDateTime?.split('•')[0]?.trim() || summary.operationalDate || '—'}</div>
                    <div className="text-[10px] text-[#9aa3ad]">{summary.displayTime || ''}</div>
                  </td>

                  {/* Status */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
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
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[#5b7c99]/20 text-[#5b7c99] border border-[#5b7c99]/30" title="Edited / Corrected">
                          CORRECTED
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Actual Pull Sequence */}
                  <td className="py-3 px-4">
                    <div className="flex items-center flex-wrap gap-1.5 max-w-md">
                      {summary.compactSequence.map((step, idx) => (
                        <React.Fragment key={idx}>
                          <span className="inline-flex items-center gap-1 bg-[#0b0c0e] px-2 py-0.5 rounded border border-[#2a313b] text-[11px]">
                            <strong className="text-[#d4a017]">S{step.siloNumber}</strong>
                            <span className="text-[#e8ebe6] font-normal">
                              {formatLbsNumber(step.lbsPulled)}
                            </span>
                          </span>
                          {idx < summary.compactSequence.length - 1 && (
                            <ArrowRight className="w-3 h-3 text-[#9aa3ad] shrink-0" />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </td>

                  {/* Total Actual */}
                  <td className="py-3 px-3 text-right font-black text-[#d4a017]">
                    {formatLbsNumber(summary.totalActualLbs)}
                  </td>

                  {/* Design */}
                  <td className="py-3 px-3 text-right text-[#9aa3ad]">
                    {formatLbsNumber(summary.totalDesignLbs)}
                  </td>

                  {/* Variance / Remaining */}
                  <td className="py-3 px-3 text-right font-bold text-xs whitespace-nowrap">
                    {summary.varianceLbs === 0 ? (
                      <span className="text-[#8fa37a]">0</span>
                    ) : summary.varianceLbs > 0 ? (
                      <span className="text-[#d4a017]">+{formatLbsNumber(summary.varianceLbs)} OVER</span>
                    ) : (
                      <span className="text-[#d4a017]">{formatLbsNumber(Math.abs(summary.varianceLbs))} REMAINING</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="py-3 px-3 text-center">
                    <button
                      type="button"
                      className="p-1.5 text-[#9aa3ad] group-hover:text-[#d4a017] rounded-lg hover:bg-[#2a313b] transition"
                      title="Inspect Stage Book"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Stage Cards */}
      <div className="md:hidden space-y-3">
        {filteredSummaries.map((summary) => {
          const isComplete = summary.status === 'complete';
          return (
            <div
              key={summary.stageKey}
              onClick={() => onSelectStage(summary)}
              className="bg-[#14171c] border border-[#2a313b] rounded-lg p-4 space-y-3 shadow-md active:bg-[#1b2027]/80 transition cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-sm text-[#e8ebe6] flex items-center gap-2">
                    <span>{summary.wellName}</span>
                    <span className="text-[#d4a017] font-mono font-black">
                      STAGE #{summary.stageNumber}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#9aa3ad] font-mono mt-0.5">
                    {summary.displayDateTime || summary.operationalDate || '—'}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {isComplete ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-[#8fa37a]/20 text-[#8fa37a] border border-[#8fa37a]/30">
                      COMPLETE
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-[#d4a017]/20 text-[#d4a017] border border-[#d4a017]/30">
                      PARTIAL
                    </span>
                  )}
                  {summary.wasCorrected && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[#5b7c99]/20 text-[#5b7c99] border border-[#5b7c99]/30">
                      CORRECTED
                    </span>
                  )}
                </div>
              </div>

              {/* Pull sequence flow */}
              <div className="bg-[#0b0c0e] p-2.5 rounded-xl border border-[#2a313b]/80 font-mono text-xs">
                <div className="text-[10px] font-black uppercase text-[#9aa3ad] mb-1.5">
                  Actual Pulls
                </div>
                <div className="flex items-center flex-wrap gap-1.5">
                  {summary.compactSequence.map((step, idx) => (
                    <React.Fragment key={idx}>
                      <span className="inline-flex items-center gap-1 bg-[#14171c] px-2 py-0.5 rounded border border-[#2a313b] text-[11px]">
                        <strong className="text-[#d4a017]">S{step.siloNumber}</strong>
                        <span className="text-[#e8ebe6]">{formatLbsNumber(step.lbsPulled)}</span>
                      </span>
                      {idx < summary.compactSequence.length - 1 && (
                        <ArrowRight className="w-3 h-3 text-[#9aa3ad] shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Totals line */}
              <div className="flex items-center justify-between font-mono text-xs pt-1 border-t border-[#2a313b]/60 flex-wrap gap-2">
                <div>
                  <span className="text-[#9aa3ad] text-[10px] uppercase">Actual: </span>
                  <strong className="text-[#d4a017] font-black">
                    {formatLbsNumber(summary.totalActualLbs)} lbs
                  </strong>
                </div>
                <div>
                  <span className="text-[#9aa3ad] text-[10px] uppercase">Design: </span>
                  <span className="text-[#e8ebe6]">{formatLbsNumber(summary.totalDesignLbs)} lbs</span>
                </div>
                <div>
                  <span className="text-[#9aa3ad] text-[10px] uppercase">Var: </span>
                  <span
                    className={
                      summary.varianceLbs > 0
                        ? 'text-[#d4a017] font-bold'
                        : summary.varianceLbs === 0
                        ? 'text-[#8fa37a] font-bold'
                        : 'text-[#d4a017] font-bold'
                    }
                  >
                    {summary.varianceLbs > 0
                      ? `+${formatLbsNumber(summary.varianceLbs)} OVER`
                      : summary.varianceLbs === 0
                      ? '0'
                      : `${formatLbsNumber(Math.abs(summary.varianceLbs))} REMAINING`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredSummaries.length === 0 && (
        <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-12 text-center space-y-3">
          <Layers className="w-10 h-10 text-[#9aa3ad] mx-auto" />
          <h4 className="text-base font-bold text-[#e8ebe6]">No Stages Match Filters</h4>
          <p className="text-xs text-[#9aa3ad] max-w-sm mx-auto">
            Try adjusting your search term, well filter, or date filters to find recorded stages.
          </p>
          {(searchTerm || wellFilter !== 'ALL' || statusFilter !== 'ALL' || dateFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setWellFilter('ALL');
                setStatusFilter('ALL');
                setDateFilter('ALL');
                setCustomDate('');
              }}
              className="mt-2 bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] text-xs font-bold px-4 py-2 rounded-xl transition"
            >
              Clear All Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
