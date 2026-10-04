import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  LayoutList,
  Map,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { AppState, StageSummary } from '../types';
import { buildStageSummaries } from '../lib/stageHistory';
import StageLedger from './StageLedger';
import StageMap from './StageMap';
import StageTimeline from './StageTimeline';
import StageDetailModal from './StageDetailModal';

interface StageReviewProps {
  state: AppState;
  onOpenLogs?: (wellId: string, stageNumber: number) => void;
  onNavigateToPullSheet?: (wellId: string, stageNumber: number) => void;
  onDeleteStage?: (wellId: string, stageNumber: number, reason?: string) => Promise<void>;
}

export type StageReviewViewMode = 'ledger' | 'map' | 'timeline';

export default function StageReview({
  state,
  onOpenLogs,
  onNavigateToPullSheet,
  onDeleteStage,
}: StageReviewProps) {
  const [activeView, setActiveView] = useState<StageReviewViewMode>('ledger');
  const [selectedSummary, setSelectedSummary] = useState<StageSummary | null>(null);

  // Compute all stage summaries once across state.runs and state.stageRecords
  const summaries = useMemo(() => {
    return buildStageSummaries(state);
  }, [state]);

  const padName = state.config?.padName || 'PAD';

  return (
    <div className="space-y-6">
      {/* Top Header & View Tabs */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-4 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase text-[#d4a017] tracking-wider font-mono">
              {padName}
            </span>
            <span className="text-[#9aa3ad]">•</span>
            <span className="text-[11px] font-bold text-[#9aa3ad] uppercase font-mono">
              Historical Operational Review
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#e8ebe6] font-mono tracking-tight flex items-center gap-3 mt-1">
            <BookOpen className="w-7 h-7 text-[#d4a017]" />
            <span>STAGE BOOK / STAGE REVIEW</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#9aa3ad] font-sans mt-1">
            Authoritative stage execution records, actual pull sequences, and per-well volume balances.
          </p>
        </div>

        {/* View Switcher Tabs: LEDGER | STAGE MAP | TIMELINE */}
        <div className="inline-flex bg-[#0b0c0e] p-1.5 rounded-lg border border-[#2a313b] self-start md:self-auto shrink-0 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveView('ledger')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition flex items-center gap-2 cursor-pointer font-mono ${
              activeView === 'ledger'
                ? 'bg-[#d4a017] text-[#0b0c0e] shadow-lg'
                : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
            }`}
          >
            <LayoutList className="w-4 h-4" /> LEDGER
          </button>

          <button
            type="button"
            onClick={() => setActiveView('map')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition flex items-center gap-2 cursor-pointer font-mono ${
              activeView === 'map'
                ? 'bg-[#d4a017] text-[#0b0c0e] shadow-lg'
                : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
            }`}
          >
            <Map className="w-4 h-4" /> STAGE MAP
          </button>

          <button
            type="button"
            onClick={() => setActiveView('timeline')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition flex items-center gap-2 cursor-pointer font-mono ${
              activeView === 'timeline'
                ? 'bg-[#d4a017] text-[#0b0c0e] shadow-lg'
                : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
            }`}
          >
            <Clock className="w-4 h-4" /> TIMELINE
          </button>
        </div>
      </div>

      {/* Active Sub-View */}
      {activeView === 'ledger' && (
        <StageLedger
          state={state}
          summaries={summaries}
          onSelectStage={(sum) => setSelectedSummary(sum)}
        />
      )}

      {activeView === 'map' && (
        <StageMap
          state={state}
          summaries={summaries}
          onSelectStage={(sum) => setSelectedSummary(sum)}
          onNavigateToPullSheet={onNavigateToPullSheet}
        />
      )}

      {activeView === 'timeline' && (
        <StageTimeline
          state={state}
          summaries={summaries}
          onSelectStage={(sum) => setSelectedSummary(sum)}
        />
      )}

      {/* Stage Detail Drawer/Modal */}
      {selectedSummary && (
        <StageDetailModal
          summary={selectedSummary}
          state={state}
          onClose={() => setSelectedSummary(null)}
          onOpenLogs={onOpenLogs}
          onNavigateToPullSheet={onNavigateToPullSheet}
          onDeleteStage={onDeleteStage}
        />
      )}
    </div>
  );
}
