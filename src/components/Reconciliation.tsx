import React, { useEffect, useState, useMemo } from 'react';
import {
  AppState,
  DeliveryTicket,
  HandoffNotes,
  PartialStageSummary,
  ReconciliationSummary,
  ShiftHandoff,
} from '../types';
import {
  calculateReconciliation,
  buildShiftHandoffSnapshot,
  RECONCILIATION_TOLERANCE_EXACT,
  RECONCILIATION_TOLERANCE_MINOR,
} from '../lib/reconciliation';
import {
  saveHandoffNotes,
  subscribeToHandoffNotes,
  createShiftHandoff,
  subscribeToShiftHandoffs,
} from '../lib/firestoreService';
import {
  formatStageDateTimeDisplay,
  formatStageTimeAmPm,
} from '../lib/stageHistory';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ClipboardCheck,
  RotateCw,
  Clock,
  Printer,
  History,
  FileText,
  Truck,
  Layers,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  X,
  User,
  Scale,
  Send,
  Eye,
  Activity,
} from 'lucide-react';
import { formatLbsNumber } from '../lib/sandRules';

interface ReconciliationProps {
  state: AppState;
  onNavigateTab?: (tab: any, opts?: any) => void;
  onSuccessMessage?: (msg: string) => void;
}

function formatCompactLbs(lbs: number): string {
  if (Math.abs(lbs) >= 1_000_000) {
    return `${(lbs / 1_000_000).toFixed(2)}M LB`;
  }
  if (Math.abs(lbs) >= 1_000) {
    return `${(lbs / 1_000).toFixed(1)}K LB`;
  }
  return `${Math.round(lbs).toLocaleString()} LB`;
}

export const Reconciliation: React.FC<ReconciliationProps> = ({
  state,
  onNavigateTab,
  onSuccessMessage,
}) => {
  const padId = state.padId || '';

  // Calculate live reconciliation summary
  const summary: ReconciliationSummary = useMemo(() => {
    return calculateReconciliation(state);
  }, [state]);

  // Handoff Notes state & subscriptions
  const [notesText, setNotesText] = useState<string>('');
  const [notesMeta, setNotesMeta] = useState<HandoffNotes | null>(null);
  const [operatorName, setOperatorName] = useState<string>(() => {
    try {
      return localStorage.getItem('sandtracker_operator_name') || '';
    } catch (_) {
      return '';
    }
  });
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false);
  const [notesSavedJustNow, setNotesSavedJustNow] = useState<boolean>(false);

  // Shift Handoff snapshots history
  const [handoffHistory, setHandoffHistory] = useState<ShiftHandoff[]>([]);
  const [selectedHistoricalHandoff, setSelectedHistoricalHandoff] = useState<ShiftHandoff | null>(null);
  const [viewMode, setViewMode] = useState<'current' | 'history'>('current');

  // Confirmation Modal for creating handoff
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isCreatingHandoff, setIsCreatingHandoff] = useState<boolean>(false);

  // Print Modal
  const [printHandoffData, setPrintHandoffData] = useState<ShiftHandoff | null>(null);

  // Subscribe to Notes
  useEffect(() => {
    if (!padId) return;
    const unsub = subscribeToHandoffNotes(padId, (remoteNotes) => {
      if (remoteNotes) {
        setNotesText(remoteNotes.text || '');
        setNotesMeta(remoteNotes);
      }
    });
    return () => unsub();
  }, [padId]);

  // Subscribe to Shift Handoff Snapshots
  useEffect(() => {
    if (!padId) return;
    const unsub = subscribeToShiftHandoffs(padId, (list) => {
      setHandoffHistory(list);
    });
    return () => unsub();
  }, [padId]);

  const handleSaveNotes = async () => {
    if (!padId) return;
    setIsSavingNotes(true);
    try {
      if (operatorName) {
        try {
          localStorage.setItem('sandtracker_operator_name', operatorName);
        } catch (_) {}
      }
      const saved = await saveHandoffNotes(padId, notesText, operatorName || 'Operator');
      setNotesMeta(saved);
      setNotesSavedJustNow(true);
      setTimeout(() => setNotesSavedJustNow(false), 3000);
      onSuccessMessage?.('Shift handoff notes updated');
    } catch (err) {
      console.error('Failed to save handoff notes:', err);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleCreateHandoff = async () => {
    if (!padId) return;
    setIsCreatingHandoff(true);
    try {
      // 1. Save notes first
      await saveHandoffNotes(padId, notesText, operatorName || 'Operator');

      // 2. Build immutable snapshot
      const snapshot = buildShiftHandoffSnapshot(
        state,
        notesText,
        operatorName || 'Operator'
      );

      // 3. Persist
      await createShiftHandoff(padId, snapshot);

      setShowConfirmModal(false);
      onSuccessMessage?.('Shift Handoff Snapshot Created Successfully');
    } catch (err) {
      console.error('Failed to create shift handoff snapshot:', err);
    } finally {
      setIsCreatingHandoff(false);
    }
  };

  const handlePrintCurrent = () => {
    const liveSnapshot = buildShiftHandoffSnapshot(
      state,
      notesText,
      operatorName || 'Operator'
    );
    setPrintHandoffData(liveSnapshot);
  };

  const handlePrintHistoric = (h: ShiftHandoff) => {
    setPrintHandoffData(h);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & OVERALL STATUS BANNER */}
      {/* ========================================================================= */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 sm:p-6 shadow-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#1b2027] text-[#5b7c99] text-xs font-black uppercase px-2.5 py-1 rounded-lg tracking-wider border border-[#5b7c99]/20 flex items-center gap-1.5">
                <ClipboardCheck className="w-3.5 h-3.5 text-[#5b7c99]" />
                PRIMARY VERIFICATION & HANDOFF
              </span>
              <span className="text-xs font-bold text-[#9aa3ad] font-mono">
                {formatStageDateTimeDisplay(summary.generatedAt)}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold uppercase tracking-wide font-display text-[#e8ebe6] font-mono flex items-center gap-2">
              <span>SHIFT RECONCILIATION</span>
              <span className="text-[#9aa3ad] font-light">•</span>
              <span className="text-[#d4a017]">{summary.padName}</span>
            </h1>
          </div>

          {/* View Mode Toggle (Current vs History) & Print Action */}
          <div className="flex items-center gap-2">
            <div className="bg-[#0b0c0e] p-1 rounded-lg border border-[#2a313b] flex items-center">
              <button
                type="button"
                onClick={() => setViewMode('current')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition flex items-center gap-1.5 ${
                  viewMode === 'current'
                    ? 'bg-[#d4a017] text-[#0b0c0e] shadow-md'
                    : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
                }`}
              >
                <Activity className="w-3.5 h-3.5" /> CURRENT STATE
              </button>
              <button
                type="button"
                onClick={() => setViewMode('history')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition flex items-center gap-1.5 ${
                  viewMode === 'history'
                    ? 'bg-[#d4a017] text-[#0b0c0e] shadow-md'
                    : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>HANDOFF HISTORY</span>
                {handoffHistory.length > 0 && (
                  <span className="bg-[#1b2027] text-[#d4a017] text-[10px] px-1.5 py-0.2 rounded-full">
                    {handoffHistory.length}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrintCurrent}
              className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] border border-[#2a313b] px-3.5 py-2 rounded-lg text-xs font-black uppercase transition flex items-center gap-1.5 shrink-0"
              title="Print Current Operational Reconciliation"
            >
              <Printer className="w-4 h-4 text-[#5b7c99]" /> PRINT
            </button>
          </div>
        </div>

        {/* Overall Status Banner */}
        {summary.overallStatus === 'reconciled' && (
          <div className="bg-[#141e17]/60 border border-[#8fa37a]/80 rounded-lg p-4 flex items-center justify-between gap-4 text-[#8fa37a] shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#8fa37a]/20 border border-[#8fa37a]/40 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-[#8fa37a]" />
              </div>
              <div>
                <div className="text-lg font-black uppercase tracking-wider font-mono text-[#e8ebe6]">
                  ALL SYSTEMS RECONCILED
                </div>
                <div className="text-xs text-[#8fa37a]/90">
                  Sand deliveries match pumped sand and silo balances exactly. Rotation and stage orders verified.
                </div>
              </div>
            </div>
            <div className="text-right font-mono hidden sm:block">
              <div className="text-xs text-[#8fa37a] uppercase font-black">Variance</div>
              <div className="text-xl font-black text-[#8fa37a]">0 LB ✓</div>
            </div>
          </div>
        )}

        {summary.overallStatus === 'warning' && (
          <div className="bg-[#291e04]/60 border border-[#d4a017]/80 rounded-lg p-4 flex items-center justify-between gap-4 text-[#d4a017] shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#d4a017]/20 border border-[#d4a017]/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-[#d4a017]" />
              </div>
              <div>
                <div className="text-lg font-black uppercase tracking-wider font-mono text-[#e8ebe6]">
                  CHECK WARNINGS
                </div>
                <div className="text-xs text-[#d4a017]/90">
                  {summary.partialStages.length > 0
                    ? `${summary.partialStages.length} partial stage in progress. Operations normal.`
                    : 'Minor inventory variance, uncompleted stages, or unsynced changes present.'}
                </div>
              </div>
            </div>
            <div className="text-right font-mono hidden sm:block">
              <div className="text-xs text-[#d4a017] uppercase font-black">Variance</div>
              <div className="text-xl font-black text-[#d4a017]">{summary.varianceDisplay}</div>
            </div>
          </div>
        )}

        {summary.overallStatus === 'needs_review' && (
          <div className="bg-[#260e0c]/70 border border-[#c23b32] rounded-lg p-4 flex items-center justify-between gap-4 text-[#e25a4a] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#c23b32]/20 border border-[#c23b32]/50 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-6 h-6 text-[#e25a4a]" />
              </div>
              <div>
                <div className="text-lg font-black uppercase tracking-wider font-mono text-[#e8ebe6]">
                  NEEDS REVIEW
                </div>
                <div className="text-xs text-[#e25a4a] font-bold">
                  Meaningful inventory discrepancy, negative silo balance, rotation mismatch, or permanent sync conflict detected.
                </div>
              </div>
            </div>
            <div className="text-right font-mono hidden sm:block">
              <div className="text-xs text-[#e25a4a] uppercase font-black">Variance</div>
              <div className="text-xl font-black text-[#e25a4a]">{summary.varianceDisplay}</div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. HISTORY VIEW (If selected) */}
      {/* ========================================================================= */}
      {viewMode === 'history' ? (
        <div className="space-y-6">
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold uppercase tracking-wide font-display text-[#e8ebe6] font-mono flex items-center gap-2">
                  <History className="w-5 h-5 text-[#d4a017]" />
                  IMMUTABLE SHIFT HANDOFF HISTORY
                </h2>
                <p className="text-xs text-[#9aa3ad]">
                  Historical snapshots are permanently frozen at handoff time and never modified by subsequent job activity.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewMode('current')}
                className="bg-[#d4a017] hover:bg-[#d4a017] text-[#0b0c0e] px-4 py-2 rounded-xl text-xs font-black uppercase transition"
              >
                RETURN TO CURRENT STATE
              </button>
            </div>

            {handoffHistory.length === 0 ? (
              <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-lg bg-[#1b2027] text-[#9aa3ad] flex items-center justify-center mx-auto">
                  <ClipboardCheck className="w-6 h-6 text-[#9aa3ad]" />
                </div>
                <div className="text-base font-black uppercase text-[#e8ebe6] font-mono">
                  NO SHIFT HANDOFFS RECORDED YET
                </div>
                <p className="text-xs text-[#9aa3ad] max-w-md mx-auto">
                  When a shift concludes, click "CREATE SHIFT HANDOFF" on the current view to preserve an immutable record for the oncoming crew.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {handoffHistory.map((h) => {
                  const isRec = h.overallStatus === 'reconciled';
                  const isWarn = h.overallStatus === 'warning';
                  const isCrit = h.overallStatus === 'needs_review';

                  return (
                    <div
                      key={h.id}
                      onClick={() => setSelectedHistoricalHandoff(h)}
                      className="bg-[#0b0c0e] border border-[#2a313b] hover:border-[#d4a017]/60 rounded-lg p-4 transition cursor-pointer shadow-lg space-y-3 relative group"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-[#2a313b]/80 pb-2">
                        <div>
                          <div className="text-xs font-black uppercase text-[#e8ebe6] font-mono">
                            {formatStageDateTimeDisplay(h.createdAt)}
                          </div>
                          <div className="text-[11px] text-[#9aa3ad] flex items-center gap-1">
                            <User className="w-3 h-3 text-[#9aa3ad]" />
                            <span>{h.createdBy || 'Operator'}</span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                            isRec
                              ? 'bg-[#141e17] text-[#8fa37a] border-[#8fa37a]'
                              : isWarn
                              ? 'bg-[#291e04] text-[#d4a017] border-[#d4a017]'
                              : 'bg-[#260e0c] text-[#e25a4a] border-[#c23b32]'
                          }`}
                        >
                          {h.overallStatus.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="bg-[#14171c]/80 p-2 rounded-xl border border-[#2a313b]">
                          <span className="text-[10px] text-[#9aa3ad] block uppercase">Delivered</span>
                          <span className="font-black text-[#e8ebe6]">{formatCompactLbs(h.totalDeliveredLbs)}</span>
                        </div>
                        <div className="bg-[#14171c]/80 p-2 rounded-xl border border-[#2a313b]">
                          <span className="text-[10px] text-[#9aa3ad] block uppercase">Pumped</span>
                          <span className="font-black text-[#e8ebe6]">{formatCompactLbs(h.totalPumpedLbs)}</span>
                        </div>
                        <div className="bg-[#14171c]/80 p-2 rounded-xl border border-[#2a313b]">
                          <span className="text-[10px] text-[#9aa3ad] block uppercase">Inventory</span>
                          <span className="font-black text-[#e8ebe6]">{formatCompactLbs(h.totalSiloInventoryLbs)}</span>
                        </div>
                        <div
                          className={`p-2 rounded-xl border ${
                            isRec
                              ? 'bg-[#141e17]/30 border-[#8fa37a] text-[#8fa37a]'
                              : 'bg-[#291e04]/30 border-[#d4a017] text-[#d4a017]'
                          }`}
                        >
                          <span className="text-[10px] block uppercase opacity-80">Variance</span>
                          <span className="font-black">{h.varianceDisplay || '0 LB'}</span>
                        </div>
                      </div>

                      {h.notes && (
                        <p className="text-xs text-[#e8ebe6] line-clamp-2 italic bg-[#14171c] p-2 rounded-xl border border-[#2a313b]/80">
                          "{h.notes}"
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 text-[11px] text-[#9aa3ad]">
                        <span>Partials: {h.partialStageSnapshot?.length || 0}</span>
                        <div className="flex items-center gap-1 text-[#5b7c99] font-bold group-hover:text-[#5b7c99]">
                          <Eye className="w-3.5 h-3.5" />
                          <span>VIEW SNAPSHOT</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 3. CURRENT LIVE RECONCILIATION VIEW */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* Top Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
            {/* DELIVERED */}
            <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-4 shadow-xl space-y-1">
              <span className="text-[11px] font-black uppercase text-[#9aa3ad] tracking-wider block">
                DELIVERED
              </span>
              <div className="text-2xl sm:text-3xl font-black text-[#5b7c99] font-mono tracking-tight tabular-nums">
                {formatCompactLbs(summary.totalDeliveredLbs)}
              </div>
              <div className="text-[11px] font-mono text-[#9aa3ad] font-bold tabular-nums">
                {summary.totalDeliveredLbs.toLocaleString()} lb exact
              </div>
            </div>

            {/* PUMPED */}
            <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-4 shadow-xl space-y-1">
              <span className="text-[11px] font-black uppercase text-[#9aa3ad] tracking-wider block">
                PUMPED
              </span>
              <div className="text-2xl sm:text-3xl font-black text-[#e8ebe6] font-mono tracking-tight tabular-nums">
                {formatCompactLbs(summary.totalPumpedLbs)}
              </div>
              <div className="text-[11px] font-mono text-[#9aa3ad] font-bold tabular-nums">
                {summary.totalPumpedLbs.toLocaleString()} lb exact
              </div>
            </div>

            {/* EXPECTED ON LOCATION */}
            <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-4 shadow-xl space-y-1">
              <span className="text-[11px] font-black uppercase text-[#9aa3ad] tracking-wider block">
                EXPECTED ON LOCATION
              </span>
              <div className="text-2xl sm:text-3xl font-black text-[#d4a017] font-mono tracking-tight tabular-nums">
                {formatCompactLbs(summary.totalExpectedOnLocationLbs)}
              </div>
              <div className="text-[11px] font-mono text-[#9aa3ad] font-bold tabular-nums">
                {summary.totalExpectedOnLocationLbs.toLocaleString()} lb exact
              </div>
            </div>

            {/* SILO INVENTORY */}
            <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-4 shadow-xl space-y-1">
              <span className="text-[11px] font-black uppercase text-[#9aa3ad] tracking-wider block">
                SILO INVENTORY
              </span>
              <div className="text-2xl sm:text-3xl font-black text-[#8fa37a] font-mono tracking-tight tabular-nums">
                {formatCompactLbs(summary.totalSiloInventoryLbs)}
              </div>
              <div className="text-[11px] font-mono text-[#9aa3ad] font-bold tabular-nums">
                {summary.totalSiloInventoryLbs.toLocaleString()} lb exact
              </div>
            </div>

            {/* VARIANCE */}
            <div
              className={`col-span-2 md:col-span-1 rounded-lg p-4 shadow-xl space-y-1 border-2 ${
                Math.abs(summary.totalVarianceLbs) <= RECONCILIATION_TOLERANCE_EXACT
                  ? 'bg-[#141e17]/40 border-[#8fa37a]/80 text-[#8fa37a]'
                  : Math.abs(summary.totalVarianceLbs) <= RECONCILIATION_TOLERANCE_MINOR
                  ? 'bg-[#291e04]/40 border-[#d4a017]/80 text-[#d4a017]'
                  : 'bg-[#260e0c]/50 border-[#c23b32] text-[#e25a4a]'
              }`}
            >
              <span className="text-[11px] font-black uppercase tracking-wider block opacity-90">
                VARIANCE
              </span>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight tabular-nums">
                {summary.totalVarianceLbs === 0 ? '0 LB ✓' : `${formatCompactLbs(summary.totalVarianceLbs)}`}
              </div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider">
                {summary.varianceDisplay}
              </div>
            </div>
          </div>

          {/* 3-Column Operations Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ========================================================================= */}
            {/* LEFT COLUMN (4 Cols): Per-Sand Totals & Silo Balances */}
            {/* ========================================================================= */}
            <div className="lg:col-span-4 space-y-6">
              {/* Per-Sand Reconciliation */}
              <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
                  <h2 className="text-sm font-black uppercase tracking-wider text-[#e8ebe6] font-mono flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[#5b7c99]" />
                    PER-SAND RECONCILIATION
                  </h2>
                  <span className="text-[10px] text-[#9aa3ad] uppercase font-mono">INDEPENDENT EQUATIONS</span>
                </div>

                <div className="space-y-4">
                  {summary.sandSummaries.map((sand) => {
                    const isSandReconciled = sand.status === 'reconciled';
                    const isSandWarn = sand.status === 'minor_variance';

                    return (
                      <div
                        key={sand.sandType}
                        className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-base font-black uppercase text-[#d4a017] font-mono">
                            {sand.sandType}
                          </span>
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                              isSandReconciled
                                ? 'bg-[#141e17] text-[#8fa37a] border-[#8fa37a]'
                                : isSandWarn
                                ? 'bg-[#291e04] text-[#d4a017] border-[#d4a017]'
                                : 'bg-[#260e0c] text-[#e25a4a] border-[#c23b32]'
                            }`}
                          >
                            {sand.varianceDisplay}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div className="bg-[#14171c]/90 p-2 rounded-xl border border-[#2a313b]/80">
                            <span className="text-[10px] text-[#9aa3ad] block uppercase">Delivered</span>
                            <span className="font-black text-[#5b7c99]">{sand.deliveredLbs.toLocaleString()} lb</span>
                          </div>
                          <div className="bg-[#14171c]/90 p-2 rounded-xl border border-[#2a313b]/80">
                            <span className="text-[10px] text-[#9aa3ad] block uppercase">Pumped</span>
                            <span className="font-black text-[#e8ebe6]">{sand.pumpedLbs.toLocaleString()} lb</span>
                          </div>
                          <div className="bg-[#14171c]/90 p-2 rounded-xl border border-[#2a313b]/80">
                            <span className="text-[10px] text-[#9aa3ad] block uppercase">Expected</span>
                            <span className="font-black text-[#d4a017]">{sand.expectedOnLocationLbs.toLocaleString()} lb</span>
                          </div>
                          <div className="bg-[#14171c]/90 p-2 rounded-xl border border-[#2a313b]/80">
                            <span className="text-[10px] text-[#9aa3ad] block uppercase">Silos</span>
                            <span className="font-black text-[#8fa37a]">{sand.siloInventoryLbs.toLocaleString()} lb</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* All 6 Silos Breakdown & Health Checks */}
              <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
                  <h2 className="text-sm font-black uppercase tracking-wider text-[#e8ebe6] font-mono flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#8fa37a]" />
                    SILO INVENTORY & HEALTH
                  </h2>
                  <span className="text-[10px] text-[#8fa37a] font-mono font-bold">
                    TOTAL: {summary.totalSiloInventoryLbs.toLocaleString()} LB
                  </span>
                </div>

                <div className="space-y-2.5">
                  {summary.siloSummaries.map((silo) => {
                    const isNeg = silo.isNegative;
                    const isOver = silo.isOverCapacity;
                    const isOos = !silo.enabled;

                    return (
                      <div
                        key={silo.siloNumber}
                        className={`p-3 rounded-lg border transition ${
                          isNeg
                            ? 'bg-[#260e0c]/60 border-[#c23b32] text-[#e25a4a]'
                            : isOver
                            ? 'bg-[#260e0c]/60 border-[#c23b32] text-[#e25a4a]'
                            : isOos
                            ? 'bg-[#0b0c0e]/80 border-[#2a313b] text-[#9aa3ad]'
                            : 'bg-[#0b0c0e] border-[#2a313b] text-[#e8ebe6]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-xl bg-[#1b2027] font-mono font-black text-xs text-[#d4a017] flex items-center justify-center border border-[#2a313b]">
                              S{silo.siloNumber}
                            </span>
                            <div>
                              <div className="text-xs font-bold text-[#e8ebe6]">
                                {silo.sandType || 'UNASSIGNED'}
                              </div>
                              <div className="text-[10px] text-[#9aa3ad]">
                                Side {silo.side} {silo.name ? `• ${silo.name}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="text-right font-mono">
                            <div className={`text-sm font-black ${isNeg ? 'text-[#e25a4a]' : 'text-[#8fa37a]'}`}>
                              {silo.onHandLbs.toLocaleString()} lb
                            </div>
                            <div className="text-[10px] text-[#9aa3ad]">
                              {Math.round(silo.percentFull)}% of {formatCompactLbs(silo.capacityLbs)}
                            </div>
                          </div>
                        </div>

                        {/* Capacity Progress Bar */}
                        <div className="w-full bg-[#1b2027] h-1.5 rounded-full mt-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isNeg
                                ? 'bg-[#c23b32]'
                                : isOver
                                ? 'bg-[#c23b32]'
                                : silo.percentFull > 85
                                ? 'bg-[#d4a017]'
                                : 'bg-[#8fa37a]'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, silo.percentFull))}%` }}
                          />
                        </div>

                        {silo.issueText && (
                          <div className="mt-2 text-[10px] font-black uppercase text-[#e25a4a] flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-[#e25a4a]" />
                            <span>{silo.issueText}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* CENTER COLUMN (4 Cols): Current Operations, Partials, Rotation, Last Completed */}
            {/* ========================================================================= */}
            <div className="lg:col-span-4 space-y-6">
              {/* Current Operations */}
              <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
                  <h2 className="text-sm font-black uppercase tracking-wider text-[#e8ebe6] font-mono flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#5b7c99]" />
                    CURRENT OPERATIONS
                  </h2>
                  <span className="text-[10px] text-[#9aa3ad] uppercase font-mono">WELL & STAGE STATUS</span>
                </div>

                <div className="space-y-2">
                  {summary.wellStatuses.map((well) => (
                    <div
                      key={well.wellId}
                      className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-sm font-black text-[#e8ebe6] font-mono">{well.wellName}</div>
                        <div className="text-xs text-[#9aa3ad]">
                          Stage {well.currentStageNumber} of {well.totalPlannedStages}
                        </div>
                      </div>

                      <span
                        className={`text-xs font-black uppercase px-2.5 py-1 rounded-xl border font-mono ${
                          well.stageStatus === 'partial'
                            ? 'bg-[#291e04] text-[#d4a017] border-[#d4a017] animate-pulse'
                            : well.stageStatus === 'complete'
                            ? 'bg-[#141e17] text-[#8fa37a] border-[#8fa37a]'
                            : 'bg-[#14171c] text-[#5b7c99] border-[#2a313b]'
                        }`}
                      >
                        {well.stageStatus}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Partial Stages (Prominent) */}
              <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
                  <h2 className="text-sm font-black uppercase tracking-wider text-[#e8ebe6] font-mono flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#d4a017]" />
                    PARTIAL STAGES
                  </h2>
                  {summary.partialStages.length > 0 && (
                    <span className="bg-[#291e04] text-[#d4a017] border border-[#d4a017] text-[10px] font-black px-2 py-0.5 rounded-lg">
                      {summary.partialStages.length} ACTIVE
                    </span>
                  )}
                </div>

                {summary.partialStages.length === 0 ? (
                  <div className="bg-[#0b0c0e]/60 border border-[#8fa37a]/30 rounded-lg p-6 text-center text-[#8fa37a] font-mono text-xs font-black uppercase flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#8fa37a]" />
                    ✓ NO PARTIAL STAGES
                  </div>
                ) : (
                  <div className="space-y-3">
                    {summary.partialStages.map((part) => (
                      <div
                        key={part.stageKey}
                        className="bg-[#0b0c0e] border border-[#d4a017]/40 rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black text-[#d4a017] font-mono">
                            {part.wellName} — STAGE {part.stageNumber}
                          </span>
                          <span className="bg-[#d4a017]/20 text-[#d4a017] text-[10px] font-black uppercase px-2 py-0.5 rounded-md border border-[#d4a017]/40">
                            PARTIAL
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                          <div className="bg-[#14171c] p-2 rounded-xl border border-[#2a313b]">
                            <span className="text-[10px] text-[#9aa3ad] block uppercase">Design</span>
                            <span className="font-bold text-[#e8ebe6]">{part.designLbs.toLocaleString()} lb</span>
                          </div>
                          <div className="bg-[#14171c] p-2 rounded-xl border border-[#2a313b]">
                            <span className="text-[10px] text-[#9aa3ad] block uppercase">Recorded</span>
                            <span className="font-bold text-[#5b7c99]">{part.actualRecordedLbs.toLocaleString()} lb</span>
                          </div>
                          <div className="bg-[#14171c] p-2 rounded-xl border border-[#2a313b]">
                            <span className="text-[10px] text-[#9aa3ad] block uppercase">Remaining</span>
                            <span className="font-bold text-[#d4a017]">{part.remainingLbs.toLocaleString()} lb</span>
                          </div>
                        </div>

                        {/* Actual Pull Sequence */}
                        {part.pullSequence.length > 0 && (
                          <div className="space-y-1.5 bg-[#14171c] p-2.5 rounded-xl border border-[#2a313b]/80">
                            <span className="text-[10px] font-black uppercase text-[#9aa3ad] block tracking-wider">
                              ACTUAL PULL SEQUENCE
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                              {part.pullSequence.map((step, idx) => (
                                <React.Fragment key={idx}>
                                  <span className="bg-[#0b0c0e] text-[#e8ebe6] px-2 py-1 rounded-lg border border-[#2a313b]">
                                    #{step.stepOrder} S{step.siloNumber} {step.lbsPulled.toLocaleString()} lb
                                  </span>
                                  {idx < part.pullSequence.length - 1 && (
                                    <ArrowRight className="w-3 h-3 text-[#9aa3ad]" />
                                  )}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Resume Silo */}
                        <div className="bg-[#121820]/40 border border-[#5b7c99]/40 p-2.5 rounded-xl flex items-center justify-between text-xs">
                          <div>
                            <span className="text-[10px] font-black uppercase text-[#5b7c99] block">
                              RESUME EXECUTION
                            </span>
                            <span className="text-[#e8ebe6]">{part.resumeReason}</span>
                          </div>
                          <span className="bg-[#5b7c99] text-[#0b0c0e] px-2.5 py-1 rounded-lg font-mono font-black text-xs shrink-0">
                            SILO {part.resumeSilo || 1}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Silo Rotation Check */}
              <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
                  <h2 className="text-sm font-black uppercase tracking-wider text-[#e8ebe6] font-mono flex items-center gap-2">
                    <RotateCw className="w-4 h-4 text-[#5b7c99]" />
                    SILO ROTATION CHECK
                  </h2>
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                      summary.rotationStatus.valid
                        ? 'bg-[#141e17] text-[#8fa37a] border-[#8fa37a]'
                        : 'bg-[#260e0c] text-[#e25a4a] border-[#c23b32]'
                    }`}
                  >
                    {summary.rotationStatus.valid ? '✓ ROTATION VALID' : 'ROTATION STATE NEEDS REVIEW'}
                  </span>
                </div>

                <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-4 space-y-3 font-mono">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-[#14171c] p-2.5 rounded-xl border border-[#2a313b]">
                      <span className="text-[10px] text-[#9aa3ad] block uppercase">LAST ACTUAL SILO USED</span>
                      <span className="text-base font-black text-[#e8ebe6]">
                        {summary.rotationStatus.lastActualSilo ? `S${summary.rotationStatus.lastActualSilo}` : 'NONE'}
                      </span>
                    </div>
                    <div className="bg-[#14171c] p-2.5 rounded-xl border border-[#2a313b]">
                      <span className="text-[10px] text-[#9aa3ad] block uppercase">NEXT START SILO</span>
                      <span className="text-base font-black text-[#5b7c99]">
                        S{summary.rotationStatus.nextStartSilo || 1}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-[#e8ebe6] bg-[#14171c] p-2.5 rounded-xl border border-[#2a313b]/80">
                    <span className="text-[10px] font-black uppercase text-[#9aa3ad] block mb-0.5">WHY:</span>
                    {summary.rotationStatus.why}
                  </div>

                  {summary.rotationStatus.disagreementDetails && (
                    <div className="bg-[#260e0c]/60 border border-[#c23b32] text-[#e25a4a] text-xs p-2.5 rounded-xl font-bold">
                      {summary.rotationStatus.disagreementDetails}
                    </div>
                  )}
                </div>
              </div>

              {/* Last Completed Stage */}
              <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
                  <h2 className="text-sm font-black uppercase tracking-wider text-[#e8ebe6] font-mono flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#8fa37a]" />
                    LAST COMPLETED STAGE
                  </h2>
                  {summary.lastCompletedStage?.displayTime && (
                    <span className="text-[10px] text-[#9aa3ad] font-mono font-bold">
                      {summary.lastCompletedStage.displayTime}
                    </span>
                  )}
                </div>

                {summary.lastCompletedStage ? (
                  <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-4 space-y-2.5 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-[#e8ebe6]">
                        {summary.lastCompletedStage.wellName} — STAGE {summary.lastCompletedStage.stageNumber}
                      </span>
                      <span className="text-xs font-black text-[#8fa37a]">
                        {summary.lastCompletedStage.totalActualLbs.toLocaleString()} LB
                      </span>
                    </div>

                    <div className="bg-[#14171c] p-2 rounded-xl border border-[#2a313b] text-xs text-[#e8ebe6]">
                      <span className="text-[10px] text-[#9aa3ad] block uppercase mb-1">ACTUAL PULL:</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {summary.lastCompletedStage.compactSequence.map((step, idx) => (
                          <React.Fragment key={idx}>
                            <span className="bg-[#0b0c0e] px-2 py-0.5 rounded border border-[#2a313b]">
                              S{step.siloNumber} {step.lbsPulled.toLocaleString()} lb
                            </span>
                            {idx < summary.lastCompletedStage!.compactSequence.length - 1 && (
                              <ArrowRight className="w-3 h-3 text-[#9aa3ad]" />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#0b0c0e]/60 p-4 rounded-lg border border-[#2a313b] text-center text-xs text-[#9aa3ad] font-mono">
                    NO COMPLETED STAGES RECORDED YET
                  </div>
                )}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* RIGHT COLUMN (4 Cols): Recent Deliveries, Ticket Audit, Stage Audit, Sync */}
            {/* ========================================================================= */}
            <div className="lg:col-span-4 space-y-6">
              {/* Recent Deliveries */}
              <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
                  <h2 className="text-sm font-black uppercase tracking-wider text-[#e8ebe6] font-mono flex items-center gap-2">
                    <Truck className="w-4 h-4 text-[#5b7c99]" />
                    RECENT DELIVERIES
                  </h2>
                  <button
                    type="button"
                    onClick={() => onNavigateTab?.('logs', { tab: 'deliveries' })}
                    className="text-[11px] font-black uppercase text-[#d4a017] hover:text-[#d4a017] flex items-center gap-1 cursor-pointer"
                  >
                    <span>VIEW ALL</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {summary.recentDeliveries.length === 0 ? (
                  <div className="bg-[#0b0c0e]/60 p-4 rounded-lg border border-[#2a313b] text-center text-xs text-[#9aa3ad] font-mono">
                    NO ACTIVE DELIVERY TICKETS
                  </div>
                ) : (
                  <div className="space-y-2">
                    {summary.recentDeliveries.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3 space-y-1 font-mono text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-[#d4a017]">
                            #{ticket.ticketNumber}
                          </span>
                          <span className="font-black text-[#5b7c99]">
                            {ticket.lbs.toLocaleString()} lb
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[#9aa3ad]">
                          <span>
                            SILO {ticket.siloNumber} • {ticket.sandType}
                          </span>
                          <span>{ticket.timeOfDay || formatStageTimeAmPm(ticket.createdAt)}</span>
                        </div>
                        {ticket.supplier && (
                          <div className="text-[10px] text-[#9aa3ad] pt-0.5">
                            {ticket.supplier} {ticket.truck ? `• Truck ${ticket.truck}` : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ticket & Stage Audits */}
              <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
                  <h2 className="text-sm font-black uppercase tracking-wider text-[#e8ebe6] font-mono flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-[#8fa37a]" />
                    AUDIT SUMMARY
                  </h2>
                  <span className="text-[10px] text-[#9aa3ad] uppercase font-mono">INTEGRITY COUNTS</span>
                </div>

                {/* Ticket Audit */}
                <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3.5 space-y-2">
                  <span className="text-[10px] font-black uppercase text-[#9aa3ad] tracking-wider block">
                    TICKET AUDIT
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="bg-[#14171c] p-2 rounded-xl border border-[#2a313b]/80">
                      <span className="text-[10px] text-[#9aa3ad] block uppercase">Active Tickets</span>
                      <span className="font-black text-[#e8ebe6]">{summary.ticketAudit.activeCount}</span>
                    </div>
                    <div className="bg-[#14171c] p-2 rounded-xl border border-[#2a313b]/80">
                      <span className="text-[10px] text-[#9aa3ad] block uppercase">Corrected</span>
                      <span className="font-black text-[#d4a017]">{summary.ticketAudit.correctedCount}</span>
                    </div>
                    <div className="bg-[#14171c] p-2 rounded-xl border border-[#2a313b]/80">
                      <span className="text-[10px] text-[#9aa3ad] block uppercase">Deleted History</span>
                      <span className="font-black text-[#9aa3ad]">{summary.ticketAudit.deletedCount}</span>
                    </div>
                  </div>
                </div>

                {/* Stage Audit */}
                <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3.5 space-y-2">
                  <span className="text-[10px] font-black uppercase text-[#9aa3ad] tracking-wider block">
                    STAGE AUDIT
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="bg-[#14171c] p-2 rounded-xl border border-[#2a313b]/80">
                      <span className="text-[10px] text-[#9aa3ad] block uppercase">Completed</span>
                      <span className="font-black text-[#8fa37a]">{summary.stageAudit.completedStagesCount}</span>
                    </div>
                    <div className="bg-[#14171c] p-2 rounded-xl border border-[#2a313b]/80">
                      <span className="text-[10px] text-[#9aa3ad] block uppercase">Partial</span>
                      <span className="font-black text-[#d4a017]">{summary.stageAudit.partialStagesCount}</span>
                    </div>
                    <div className="bg-[#14171c] p-2 rounded-xl border border-[#2a313b]/80">
                      <span className="text-[10px] text-[#9aa3ad] block uppercase">Corrected</span>
                      <span className="font-black text-[#5b7c99]">{summary.stageAudit.correctedStagesCount}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Realtime Cloud Connection */}
              <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
                  <h2 className="text-sm font-black uppercase tracking-wider text-[#e8ebe6] font-mono flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#5b7c99]" />
                    CLOUD DATA
                  </h2>
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                      summary.syncStatus.isOnline
                        ? 'bg-[#141e17] text-[#8fa37a] border-[#8fa37a]'
                        : 'bg-[#291e04] text-[#d4a017] border-[#d4a017]'
                    }`}
                  >
                    {summary.syncStatus.cloudStatusDisplay}
                  </span>
                </div>

                <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-[#9aa3ad]">Connection State:</span>
                    <span className={summary.syncStatus.isOnline ? 'text-[#8fa37a] font-bold' : 'text-[#d4a017] font-bold'}>
                      {summary.syncStatus.isOnline ? '● REALTIME ACTIVE' : '○ OFFLINE (DISCONNECTED)'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#9aa3ad] leading-relaxed">
                    {summary.syncStatus.isOnline
                      ? 'Connected to authoritative Firestore cloud via Starlink. All ticket & stage mutations commit immediately and sync live across all jobsite devices.'
                      : 'Internet connection unavailable. Please reconnect to Starlink to perform changes.'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BOTTOM SECTION: SHIFT HANDOFF NOTES & IMMUTABLE HANDOFF CREATION */}
          {/* ========================================================================= */}
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2a313b] pb-4">
              <div>
                <h2 className="text-lg font-bold uppercase tracking-wide font-display text-[#e8ebe6] font-mono flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#d4a017]" />
                  SHIFT HANDOFF NOTES
                </h2>
                <p className="text-xs text-[#9aa3ad]">
                  Critical operational observations, upcoming stage guidelines, or sand truck logistics for the oncoming crew.
                </p>
              </div>

              {notesMeta?.updatedAt && (
                <div className="text-xs text-[#9aa3ad] font-mono flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#9aa3ad]" />
                  <span>LAST UPDATED:</span>
                  <span className="text-[#e8ebe6] font-bold">{formatStageDateTimeDisplay(notesMeta.updatedAt)}</span>
                  {notesMeta.updatedBy && (
                    <span className="text-[#5b7c99] font-bold">• {notesMeta.updatedBy}</span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-black uppercase text-[#9aa3ad] mb-1">
                    OPERATOR NAME / BADGE
                  </label>
                  <input
                    type="text"
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    placeholder="e.g. C. Overby"
                    className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl px-3 py-2 text-xs font-bold text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-black uppercase text-[#9aa3ad] mb-1">
                    HANDOFF DIRECTIVES & NOTES
                  </label>
                  <textarea
                    rows={3}
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                    placeholder="e.g. 1803WC Stage 49 partial. Resume on Silo 1. Expecting 4 Hi-Crush 100 Mesh trucks at 21:00..."
                    className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3 text-xs text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none leading-relaxed"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={isSavingNotes}
                    className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] border border-[#2a313b] font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5 text-[#5b7c99]" />
                    {isSavingNotes ? 'SAVING...' : 'SAVE NOTES'}
                  </button>
                  {notesSavedJustNow && (
                    <span className="text-xs text-[#8fa37a] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Notes Saved
                    </span>
                  )}
                </div>

                {/* Primary Action Button */}
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  className="w-full sm:w-auto bg-gradient-to-r from-[#d4a017] to-[#d4a017] hover:from-[#d4a017] hover:to-[#d4a017] text-[#0b0c0e] font-black px-6 py-3 rounded-lg uppercase tracking-wider text-sm shadow-xl transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ClipboardCheck className="w-5 h-5 text-[#0b0c0e]" />
                  <span>CREATE SHIFT HANDOFF SNAPSHOT</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. CONFIRMATION MODAL FOR CREATING SHIFT HANDOFF */}
      {/* ========================================================================= */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-[#0b0c0e]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-[#14171c] border border-[#d4a017] rounded-xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-6 h-6 text-[#d4a017]" />
                <h3 className="text-lg font-black uppercase text-[#e8ebe6] font-mono">
                  CREATE SHIFT HANDOFF?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-[#9aa3ad] hover:text-[#e8ebe6] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#e8ebe6]">
              This will create an immutable, permanent operational snapshot of current sand deliveries, pumped totals, silo inventory, rotation status, and handoff directives.
            </p>

            <div className="bg-[#0b0c0e] rounded-lg p-4 border border-[#2a313b] space-y-2.5 font-mono text-xs">
              <div className="flex justify-between items-center py-1 border-b border-[#2a313b]/80">
                <span className="text-[#9aa3ad] uppercase">INVENTORY STATUS:</span>
                <span
                  className={`font-black uppercase ${
                    summary.overallStatus === 'reconciled'
                      ? 'text-[#8fa37a]'
                      : summary.overallStatus === 'warning'
                      ? 'text-[#d4a017]'
                      : 'text-[#e25a4a]'
                  }`}
                >
                  {summary.overallStatus.replace('_', ' ')}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#2a313b]/80">
                <span className="text-[#9aa3ad] uppercase">VARIANCE:</span>
                <span className="text-[#e8ebe6] font-black">{summary.varianceDisplay}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#2a313b]/80">
                <span className="text-[#9aa3ad] uppercase">PARTIAL STAGES:</span>
                <span className="text-[#e8ebe6] font-black">{summary.partialStages.length}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#2a313b]/80">
                <span className="text-[#9aa3ad] uppercase">CLOUD STATUS:</span>
                <span className={summary.syncStatus.isOnline ? 'text-[#8fa37a] font-black' : 'text-[#d4a017] font-black'}>
                  {summary.syncStatus.cloudStatusDisplay}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-[#2a313b]/80">
                <span className="text-[#9aa3ad] uppercase">NEXT START SILO:</span>
                <span className="text-[#5b7c99] font-black">
                  SILO {summary.rotationStatus.nextStartSilo || 1}
                </span>
              </div>

              {notesText && (
                <div className="pt-2">
                  <span className="text-[10px] text-[#9aa3ad] block uppercase mb-1">NOTES PREVIEW:</span>
                  <div className="text-[#e8ebe6] italic bg-[#14171c] p-2.5 rounded-xl border border-[#2a313b]">
                    "{notesText}"
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] px-4 py-2.5 rounded-xl text-xs font-bold uppercase transition"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleCreateHandoff}
                disabled={isCreatingHandoff}
                className="bg-[#d4a017] hover:bg-[#d4a017] text-[#0b0c0e] font-black px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition shadow-lg flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isCreatingHandoff ? 'CREATING...' : 'CONFIRM & CREATE HANDOFF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. HISTORICAL HANDOFF DETAIL MODAL */}
      {/* ========================================================================= */}
      {selectedHistoricalHandoff && (
        <div className="fixed inset-0 z-50 bg-[#0b0c0e]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-4xl w-full bg-[#14171c] border border-[#2a313b] rounded-xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
              <div>
                <span className="bg-[#291e04] text-[#d4a017] border border-[#d4a017] text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                  HISTORICAL SHIFT HANDOFF
                </span>
                <h3 className="text-xl font-black uppercase text-[#e8ebe6] font-mono mt-1">
                  {formatStageDateTimeDisplay(selectedHistoricalHandoff.createdAt)}
                </h3>
                <div className="text-xs text-[#9aa3ad]">
                  Recorded by: <span className="text-[#5b7c99] font-bold">{selectedHistoricalHandoff.createdBy || 'Operator'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintHistoric(selectedHistoricalHandoff)}
                  className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] border border-[#2a313b] px-3 py-1.5 rounded-xl text-xs font-black uppercase transition flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5 text-[#5b7c99]" /> PRINT
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHistoricalHandoff(null)}
                  className="text-[#9aa3ad] hover:text-[#e8ebe6] p-1 rounded-lg"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Historical Top Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono">
              <div className="bg-[#0b0c0e] p-3 rounded-lg border border-[#2a313b]">
                <span className="text-[10px] text-[#9aa3ad] uppercase block">Delivered</span>
                <span className="text-base font-black text-[#5b7c99]">
                  {selectedHistoricalHandoff.totalDeliveredLbs.toLocaleString()} lb
                </span>
              </div>
              <div className="bg-[#0b0c0e] p-3 rounded-lg border border-[#2a313b]">
                <span className="text-[10px] text-[#9aa3ad] uppercase block">Pumped</span>
                <span className="text-base font-black text-[#e8ebe6]">
                  {selectedHistoricalHandoff.totalPumpedLbs.toLocaleString()} lb
                </span>
              </div>
              <div className="bg-[#0b0c0e] p-3 rounded-lg border border-[#2a313b]">
                <span className="text-[10px] text-[#9aa3ad] uppercase block">Expected</span>
                <span className="text-base font-black text-[#d4a017]">
                  {selectedHistoricalHandoff.totalExpectedOnLocationLbs.toLocaleString()} lb
                </span>
              </div>
              <div className="bg-[#0b0c0e] p-3 rounded-lg border border-[#2a313b]">
                <span className="text-[10px] text-[#9aa3ad] uppercase block">Silo Inventory</span>
                <span className="text-base font-black text-[#8fa37a]">
                  {selectedHistoricalHandoff.totalSiloInventoryLbs.toLocaleString()} lb
                </span>
              </div>
              <div className="bg-[#0b0c0e] p-3 rounded-lg border border-[#2a313b]">
                <span className="text-[10px] text-[#9aa3ad] uppercase block">Variance</span>
                <span className="text-base font-black text-[#8fa37a]">
                  {selectedHistoricalHandoff.varianceDisplay}
                </span>
              </div>
            </div>

            {/* Historical Notes */}
            {selectedHistoricalHandoff.notes && (
              <div className="bg-[#0b0c0e] p-4 rounded-lg border border-[#2a313b] space-y-1">
                <span className="text-[10px] font-black uppercase text-[#d4a017] tracking-wider block">
                  SHIFT HANDOFF DIRECTIVES
                </span>
                <p className="text-xs text-[#e8ebe6] italic leading-relaxed whitespace-pre-wrap">
                  "{selectedHistoricalHandoff.notes}"
                </p>
              </div>
            )}

            {/* Historical Silos Snapshot */}
            <div className="space-y-2">
              <span className="text-xs font-black uppercase text-[#e8ebe6] font-mono">
                SILO BALANCES AT HANDOFF TIME
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-mono">
                {selectedHistoricalHandoff.siloSnapshot.map((s) => (
                  <div key={s.siloNumber} className="bg-[#0b0c0e] p-3 rounded-lg border border-[#2a313b] text-xs">
                    <div className="text-[#d4a017] font-black">SILO {s.siloNumber}</div>
                    <div className="text-[11px] text-[#9aa3ad] truncate">{s.sandType || 'EMPTY'}</div>
                    <div className="text-[#e8ebe6] font-bold mt-1">{s.inventoryLbs.toLocaleString()} lb</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Historical Wells & Rotation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-[#0b0c0e] p-4 rounded-lg border border-[#2a313b] space-y-2">
                <span className="text-[10px] font-black uppercase text-[#9aa3ad] block">WELL STATUS SNAPSHOT</span>
                {selectedHistoricalHandoff.wellSnapshot.map((w) => (
                  <div key={w.wellId} className="flex justify-between items-center py-1 border-b border-[#2a313b]/60 last:border-0">
                    <span className="text-[#e8ebe6] font-bold">{w.wellName}</span>
                    <span className="text-[#9aa3ad]">Stage {w.stageNumber} ({w.status})</span>
                  </div>
                ))}
              </div>

              <div className="bg-[#0b0c0e] p-4 rounded-lg border border-[#2a313b] space-y-2">
                <span className="text-[10px] font-black uppercase text-[#9aa3ad] block">ROTATION STATE</span>
                <div className="flex justify-between items-center py-1 border-b border-[#2a313b]/60">
                  <span className="text-[#9aa3ad]">Last Silo Pulled:</span>
                  <span className="text-[#e8ebe6] font-bold">
                    {selectedHistoricalHandoff.rotationSnapshot.lastActualSilo
                      ? `S${selectedHistoricalHandoff.rotationSnapshot.lastActualSilo}`
                      : 'None'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#2a313b]/60">
                  <span className="text-[#9aa3ad]">Next Start Silo:</span>
                  <span className="text-[#5b7c99] font-bold">
                    S{selectedHistoricalHandoff.rotationSnapshot.nextStartSilo || 1}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-[#9aa3ad]">Rotation Valid:</span>
                  <span className="text-[#8fa37a] font-bold">
                    {selectedHistoricalHandoff.rotationSnapshot.valid ? 'YES ✓' : 'NEEDS REVIEW'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. CLEAN PRINT LAYOUT MODAL (US Letter field-ready) */}
      {/* ========================================================================= */}
      {printHandoffData && (
        <div className="fixed inset-0 z-50 bg-[#0b0c0e]/90 flex flex-col items-center justify-center p-4">
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 max-w-4xl w-full flex items-center justify-between mb-3 text-[#e8ebe6]">
            <div className="text-xs font-mono font-bold">
              PRINT PREVIEW — FORMATTED FOR US LETTER
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-[#d4a017] hover:bg-[#d4a017] text-[#0b0c0e] font-black px-4 py-2 rounded-xl text-xs uppercase flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> SEND TO PRINTER
              </button>
              <button
                type="button"
                onClick={() => setPrintHandoffData(null)}
                className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] px-3 py-2 rounded-xl text-xs font-bold uppercase"
              >
                CLOSE
              </button>
            </div>
          </div>

          <div
            id="printable-handoff-sheet"
            className="bg-[#e8ebe6] text-[#0b0c0e] p-8 rounded-lg max-w-4xl w-full max-h-[85vh] overflow-y-auto shadow-2xl font-mono text-xs space-y-4 print:m-0 print:p-6 print:max-h-none print:shadow-none"
          >
            {/* Print Header */}
            <div className="border-b-2 border-[#0b0c0e] pb-3 flex justify-between items-start">
              <div>
                <div className="text-xl font-bold uppercase tracking-wide font-display">PYTHON PRESSURE PUMPING</div>
                <div className="text-sm font-bold text-[#9aa3ad] uppercase">
                  SAND TRACKER • SHIFT RECONCILIATION & HANDOFF
                </div>
                <div className="text-xs font-bold mt-1 text-[#14171c]">
                  PAD: <span className="underline">{printHandoffData.padName}</span>
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="font-bold">DATE: {printHandoffData.operationalDate}</div>
                <div className="font-bold">TIME: {formatStageTimeAmPm(printHandoffData.createdAt)}</div>
                <div className="text-[#9aa3ad]">OPERATOR: {printHandoffData.createdBy || 'Operator'}</div>
              </div>
            </div>

            {/* Top Totals Table */}
            <div className="grid grid-cols-5 gap-2 border border-[#2a313b] p-2 rounded text-center">
              <div>
                <div className="text-[10px] font-bold uppercase text-[#9aa3ad]">DELIVERED</div>
                <div className="text-sm font-black">{printHandoffData.totalDeliveredLbs.toLocaleString()} lb</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-[#9aa3ad]">PUMPED</div>
                <div className="text-sm font-black">{printHandoffData.totalPumpedLbs.toLocaleString()} lb</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-[#9aa3ad]">EXPECTED</div>
                <div className="text-sm font-black">{printHandoffData.totalExpectedOnLocationLbs.toLocaleString()} lb</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-[#9aa3ad]">SILO INVENTORY</div>
                <div className="text-sm font-black">{printHandoffData.totalSiloInventoryLbs.toLocaleString()} lb</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-[#9aa3ad]">VARIANCE</div>
                <div className="text-sm font-black">{printHandoffData.varianceDisplay}</div>
              </div>
            </div>

            {/* Silo Balances */}
            <div>
              <div className="text-[11px] font-black uppercase border-b border-[#9aa3ad] pb-1 mb-1">
                SILO BALANCES
              </div>
              <div className="grid grid-cols-6 gap-2 text-center">
                {printHandoffData.siloSnapshot.map((s) => (
                  <div key={s.siloNumber} className="border border-[#9aa3ad] p-1.5 rounded">
                    <div className="font-black text-xs">SILO {s.siloNumber}</div>
                    <div className="text-[10px] text-[#9aa3ad]">{s.sandType || 'EMPTY'}</div>
                    <div className="font-bold text-xs mt-0.5">{s.inventoryLbs.toLocaleString()} lb</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Well & Rotation Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-[#9aa3ad] p-2 rounded">
                <div className="text-[10px] font-black uppercase border-b border-[#9aa3ad] pb-1 mb-1">
                  CURRENT WELL STAGES
                </div>
                {printHandoffData.wellSnapshot.map((w) => (
                  <div key={w.wellId} className="flex justify-between text-xs py-0.5">
                    <span>{w.wellName}:</span>
                    <span className="font-bold">Stage {w.stageNumber} ({w.status.toUpperCase()})</span>
                  </div>
                ))}
              </div>

              <div className="border border-[#9aa3ad] p-2 rounded">
                <div className="text-[10px] font-black uppercase border-b border-[#9aa3ad] pb-1 mb-1">
                  ROTATION & DISPATCH
                </div>
                <div className="flex justify-between text-xs py-0.5">
                  <span>LAST SILO PULLED:</span>
                  <span className="font-bold">
                    {printHandoffData.rotationSnapshot.lastActualSilo ? `SILO ${printHandoffData.rotationSnapshot.lastActualSilo}` : 'NONE'}
                  </span>
                </div>
                <div className="flex justify-between text-xs py-0.5">
                  <span>NEXT START SILO:</span>
                  <span className="font-black underline">
                    SILO {printHandoffData.rotationSnapshot.nextStartSilo || 1}
                  </span>
                </div>
              </div>
            </div>

            {/* Handoff Directives / Notes */}
            <div className="border border-[#0b0c0e] p-3 rounded">
              <div className="text-[10px] font-black uppercase mb-1">
                SHIFT HANDOFF DIRECTIVES / NOTES:
              </div>
              <div className="text-xs whitespace-pre-wrap italic">
                {printHandoffData.notes || 'No specific notes recorded for this shift.'}
              </div>
            </div>

            {/* Sign-off */}
            <div className="pt-4 border-t border-[#9aa3ad] flex justify-between text-xs">
              <div>OFFGOING OPERATOR: __________________________</div>
              <div>ONCOMING OPERATOR: __________________________</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
