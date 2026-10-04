import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Clock,
  Layers,
  ArrowDown,
  History,
  FileText,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Tag,
  Boxes,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { AppState, StageSummary } from '../types';
import { formatLbs, formatLbsNumber, formatTons, getSiloDerivedStates } from '../lib/sandRules';
import { getSandColorClasses } from './Dashboard';
import { formatStageDateTimeDisplay, formatStageTimeAmPm } from '../lib/stageHistory';

interface StageDetailModalProps {
  summary: StageSummary | null;
  state: AppState;
  onClose: () => void;
  onOpenLogs?: (wellId: string, stageNumber: number) => void;
  onNavigateToPullSheet?: (wellId: string, stageNumber: number) => void;
  onDeleteStage?: (wellId: string, stageNumber: number, reason?: string) => Promise<void>;
}

export default function StageDetailModal({
  summary,
  state,
  onClose,
  onOpenLogs,
  onNavigateToPullSheet,
  onDeleteStage,
}: StageDetailModalProps) {
  const [showDeletedHistory, setShowDeletedHistory] = useState(false);
  const [showTechnicalIds, setShowTechnicalIds] = useState(false);
  const [isDeletingStage, setIsDeletingStage] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!summary) return null;

  const isComplete = summary.status === 'complete';
  const isPartial = summary.status === 'partial';
  const isNotStarted = summary.status === 'not_started';

  const padName = state.config?.padName || 'PAD';

  const activeStageRuns = state.runs.filter(
    (r) => !r.deleted && r.wellId === summary.wellId && r.stageNumber === summary.stageNumber
  );

  const currentSilos = getSiloDerivedStates(state);
  const simulatedState = {
    ...state,
    runs: state.runs.filter(
      (r) => !(r.wellId === summary.wellId && r.stageNumber === summary.stageNumber)
    ),
  };
  const projectedSilos = getSiloDerivedStates(simulatedState);

  // Group active stage runs by silo to show per-silo impact
  const runsBySilo = new Map<number, number>();
  activeStageRuns.forEach((r) => {
    runsBySilo.set(r.siloNumber, (runsBySilo.get(r.siloNumber) || 0) + (r.lbsPulled || 0));
  });

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onDeleteStage) return;
    setIsSubmittingDelete(true);
    setDeleteError(null);
    try {
      await onDeleteStage(summary.wellId, summary.stageNumber, deleteReason.trim() || undefined);
      onClose();
    } catch (err: any) {
      console.error('Failed to delete stage:', err);
      setDeleteError(err?.message || 'Failed to delete stage');
      setIsSubmittingDelete(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b0c0e]/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      {/* Backdrop click dismiss */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Drawer Container (full width on mobile, max-w-2xl on desktop) */}
      <div className="relative w-full max-w-2xl min-h-screen bg-[#14171c] border-l border-[#2a313b] shadow-2xl z-10 flex flex-col justify-between">
        {/* Top Sticky Header */}
        <div>
          <div className="sticky top-0 z-20 bg-[#14171c]/95 backdrop-blur border-b border-[#2a313b] px-4 sm:px-6 py-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-black uppercase text-[#d4a017] tracking-wider">
                  {padName}
                </span>
                <span className="text-[#9aa3ad]">•</span>
                <span className="text-[11px] font-bold text-[#9aa3ad] uppercase">
                  OPERATIONAL STAGE BOOK
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#e8ebe6] font-mono tracking-tight flex items-center gap-3">
                <span>{summary.wellName}</span>
                <span className="text-[#d4a017]">—</span>
                <span className="text-[#d4a017]">STAGE #{summary.stageNumber}</span>
              </h2>

              {/* Status and Timestamp metadata badges */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {isComplete && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-[#8fa37a]/20 text-[#8fa37a] border border-[#8fa37a]/40">
                    <CheckCircle2 className="w-3.5 h-3.5" /> COMPLETE
                  </span>
                )}

                {isPartial && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-[#d4a017]/20 text-[#d4a017] border border-[#d4a017]/40">
                    <Clock className="w-3.5 h-3.5" /> PARTIAL
                  </span>
                )}

                {isNotStarted && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-[#1b2027] text-[#9aa3ad] border border-[#2a313b]">
                    NOT STARTED
                  </span>
                )}

                {summary.wasCorrected && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-black bg-[#5b7c99]/20 text-[#5b7c99] border border-[#5b7c99]/40">
                    <Tag className="w-3 h-3" /> CORRECTED
                  </span>
                )}

                {summary.hasDeletedHistory && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-[#1b2027] text-[#e8ebe6] border border-[#2a313b]">
                    AUDIT HISTORY
                  </span>
                )}

                {summary.displayDateTime && (
                  <span className="text-xs text-[#9aa3ad] font-mono ml-1">
                    {summary.displayDateTime}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[#9aa3ad] hover:text-[#e8ebe6] hover:bg-[#1b2027] rounded-xl transition cursor-pointer"
              title="Close drawer"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-4 sm:p-6 space-y-6 pb-24">
            {/* UNSTARTED STAGE NOTICE */}
            {isNotStarted && (
              <div className="bg-[#0b0c0e] p-6 rounded-lg border border-[#2a313b] text-center space-y-4">
                <Boxes className="w-12 h-12 text-[#9aa3ad] mx-auto" />
                <div>
                  <h3 className="text-lg font-bold text-[#e8ebe6]">Stage Not Yet Started</h3>
                  <p className="text-sm text-[#9aa3ad] mt-1">
                    No run records have been logged for {summary.wellName} Stage #{summary.stageNumber}.
                  </p>
                </div>

                <div className="bg-[#14171c] p-4 rounded-xl border border-[#2a313b] max-w-sm mx-auto">
                  <div className="text-xs font-bold text-[#9aa3ad] uppercase">Planned Stage Design</div>
                  <div className="text-xl font-mono font-black text-[#d4a017] mt-1">
                    {formatLbs(summary.totalDesignLbs)}
                  </div>
                </div>

                {onNavigateToPullSheet && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToPullSheet(summary.wellId, summary.stageNumber);
                    }}
                    className="bg-[#d4a017] hover:bg-[#d4a017] text-[#0b0c0e] font-black px-5 py-2.5 rounded-xl uppercase tracking-wider text-xs transition shadow-lg inline-flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" /> OPEN PULL SHEET
                  </button>
                )}
              </div>
            )}

            {!isNotStarted && (
              <>
                {/* 1. VISUAL ACTUAL PULL SEQUENCE */}
                <div className="bg-[#0b0c0e] p-4 sm:p-5 rounded-lg border border-[#2a313b]/80 shadow-inner">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-black uppercase text-[#d4a017] tracking-wider flex items-center gap-2 font-mono">
                      <Layers className="w-4 h-4" /> ACTUAL PULL SEQUENCE
                    </h3>
                    <span className="text-[11px] font-bold text-[#9aa3ad] uppercase">
                      {summary.pullSequence.length} Pull Step{summary.pullSequence.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {summary.pullSequence.map((step, idx) => {
                      const colorClasses = getSandColorClasses(step.sandType);
                      const isLast = idx === summary.pullSequence.length - 1;

                      return (
                        <React.Fragment key={step.runId || idx}>
                          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-3 sm:p-4 flex items-center justify-between gap-3 shadow-md hover:border-[#2a313b] transition">
                            <div className="flex items-center gap-3">
                              {/* Step circle indicator */}
                              <div className="w-7 h-7 rounded-full bg-[#1b2027] border border-[#2a313b] text-[#d4a017] font-mono text-xs font-black flex items-center justify-center shrink-0">
                                #{step.stepOrder}
                              </div>

                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-base sm:text-lg font-black text-[#e8ebe6]">
                                    SILO {step.siloNumber}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${colorClasses.headerBg}`}
                                  >
                                    {step.sandType}
                                  </span>
                                  {step.wasEdited && (
                                    <span className="text-[9px] font-black uppercase text-[#5b7c99] bg-[#121820] px-1.5 py-0.5 rounded border border-[#5b7c99]">
                                      Edited
                                    </span>
                                  )}
                                </div>
                                {step.createdAt && (
                                  <div className="text-[11px] text-[#9aa3ad] font-mono mt-0.5">
                                    {formatStageTimeAmPm(step.createdAt)}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="font-mono text-base sm:text-lg font-black text-[#d4a017]">
                                {formatLbsNumber(step.lbsPulled)}{' '}
                                <span className="text-xs font-normal text-[#9aa3ad]">lbs</span>
                              </div>
                              <div className="text-[11px] text-[#9aa3ad] font-mono">
                                {formatTons(step.lbsPulled / 2000)}
                              </div>
                            </div>
                          </div>

                          {!isLast && (
                            <div className="flex justify-center py-0.5">
                              <ArrowDown className="w-4 h-4 text-[#d4a017]/50" />
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* 2. STAGE TOTALS & VARIANCE */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-[#0b0c0e] p-3.5 rounded-xl border border-[#2a313b]">
                    <div className="text-[10px] font-black uppercase text-[#9aa3ad] tracking-wider">
                      Stage Design
                    </div>
                    <div className="text-base sm:text-lg font-mono font-black text-[#e8ebe6] mt-1">
                      {formatLbs(summary.totalDesignLbs)}
                    </div>
                  </div>

                  <div className="bg-[#0b0c0e] p-3.5 rounded-xl border border-[#2a313b]">
                    <div className="text-[10px] font-black uppercase text-[#9aa3ad] tracking-wider">
                      Actual Pumped
                    </div>
                    <div className="text-base sm:text-lg font-mono font-black text-[#d4a017] mt-1">
                      {formatLbs(summary.totalActualLbs)}
                    </div>
                  </div>

                  <div className="bg-[#0b0c0e] p-3.5 rounded-xl border border-[#2a313b]">
                    <div className="text-[10px] font-black uppercase text-[#9aa3ad] tracking-wider">
                      {summary.varianceLbs < 0 ? 'Remaining' : summary.varianceLbs === 0 ? 'Variance' : 'Over Design'}
                    </div>
                    <div
                      className={`text-base sm:text-lg font-mono font-black mt-1 ${
                        summary.varianceLbs > 0
                          ? 'text-[#d4a017]'
                          : summary.varianceLbs === 0
                          ? 'text-[#8fa37a]'
                          : 'text-[#d4a017]'
                      }`}
                    >
                      {summary.varianceLbs > 0
                        ? `+${formatLbsNumber(summary.varianceLbs)} lbs`
                        : summary.varianceLbs < 0
                        ? `${formatLbsNumber(Math.abs(summary.varianceLbs))} lbs`
                        : '0 lbs'}
                    </div>
                  </div>

                  <div className="bg-[#0b0c0e] p-3.5 rounded-xl border border-[#2a313b]">
                    <div className="text-[10px] font-black uppercase text-[#9aa3ad] tracking-wider">
                      Status
                    </div>
                    <div className="text-sm font-black mt-1">
                      {isComplete ? (
                        <span className="text-[#8fa37a] font-mono uppercase">Complete</span>
                      ) : (
                        <span className="text-[#d4a017] font-mono uppercase">Partial</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. PER-SAND BREAKDOWN */}
                <div className="bg-[#0b0c0e] p-4 rounded-xl border border-[#2a313b] space-y-3">
                  <div className="text-xs font-black uppercase text-[#9aa3ad] tracking-wider font-mono">
                    Sand Type Breakdown
                  </div>

                  <div className="space-y-3">
                    {Object.keys(summary.designBySand)
                      .filter((sandName) => {
                        const design = summary.designBySand[sandName] || 0;
                        const actual = summary.actualBySand[sandName] || 0;
                        // Hide sand types where both design and actual are 0
                        return !(design === 0 && actual === 0);
                      })
                      .map((sandName) => {
                        const design = summary.designBySand[sandName] || 0;
                        const actual = summary.actualBySand[sandName] || 0;
                        const variance = actual - design;
                        const colorClasses = getSandColorClasses(sandName);
                        const hasDesign = design > 0;
                        const pct = hasDesign ? Math.min(100, Math.round((actual / design) * 100)) : 100;

                        return (
                          <div key={sandName} className="bg-[#14171c] p-3 rounded-lg border border-[#2a313b]">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-bold text-sm text-[#e8ebe6] flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${colorClasses.headerBg}`}>
                                  {sandName}
                                </span>
                              </span>
                              <span className="font-mono text-xs font-bold text-[#e8ebe6]">
                                {hasDesign ? (
                                  `${formatLbsNumber(actual)} / ${formatLbsNumber(design)} lbs`
                                ) : (
                                  <span className="text-[#d4a017] font-black">ACTUAL: {formatLbsNumber(actual)} lbs</span>
                                )}
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full h-2 bg-[#0b0c0e] rounded-full overflow-hidden border border-[#2a313b] mb-1.5">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  !hasDesign ? 'bg-[#d4a017]' : actual >= design ? 'bg-[#8fa37a]' : 'bg-[#d4a017]'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-[#9aa3ad] font-mono">
                              <span>{hasDesign ? `${pct}% of design` : 'No planned design for this sand type'}</span>
                              <span>
                                {!hasDesign
                                  ? `+${formatLbsNumber(actual)} lbs pulled`
                                  : variance === 0
                                  ? 'Balanced'
                                  : variance > 0
                                  ? `+${formatLbsNumber(variance)} lbs over`
                                  : `${formatLbsNumber(Math.abs(variance))} lbs remaining`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* 4. ACTUAL SILO BREAKDOWN TABLE */}
                <div className="bg-[#0b0c0e] p-4 rounded-xl border border-[#2a313b] space-y-3">
                  <div className="text-xs font-black uppercase text-[#9aa3ad] tracking-wider font-mono">
                    Actual Silo Breakdown Table
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-[#2a313b] text-[#9aa3ad] text-[10px] uppercase">
                          <th className="pb-2">Order</th>
                          <th className="pb-2">Silo</th>
                          <th className="pb-2">Sand</th>
                          <th className="pb-2 text-right">Pull (lbs)</th>
                          <th className="pb-2 text-right">Submission</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2a313b]/60">
                        {summary.pullSequence.map((step) => {
                          const subGroup = summary.submissions.find((s) => s.runs.some((r) => r.id === step.runId));
                          return (
                            <tr key={step.runId || step.stepOrder} className="hover:bg-[#14171c]/50">
                              <td className="py-2 text-[#d4a017] font-bold">#{step.stepOrder}</td>
                              <td className="py-2 text-[#e8ebe6] font-black">S{step.siloNumber}</td>
                              <td className="py-2 text-[#e8ebe6]">{step.sandType}</td>
                              <td className="py-2 text-right font-black text-[#d4a017]">
                                {formatLbsNumber(step.lbsPulled)}
                              </td>
                              <td className="py-2 text-right text-[#9aa3ad] text-[11px]">
                                {subGroup ? subGroup.label : 'Submission 1'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 5. SUBMISSION HISTORY */}
                <div className="bg-[#0b0c0e] p-4 rounded-xl border border-[#2a313b] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-black uppercase text-[#9aa3ad] tracking-wider font-mono">
                      Submission History ({summary.submissions.length})
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTechnicalIds((v) => !v)}
                      className="text-[10px] text-[#9aa3ad] hover:text-[#e8ebe6] font-mono underline cursor-pointer"
                    >
                      {showTechnicalIds ? 'Hide Technical IDs' : 'Show Technical IDs'}
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {summary.submissions.map((sub, idx) => {
                      const isLegacy = sub.submissionId === '__legacy_stage_record__' || sub.submissionId?.startsWith('legacy_');

                      return (
                        <div key={sub.submissionId || idx} className="bg-[#14171c] p-3 rounded-lg border border-[#2a313b]">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-[#d4a017] uppercase tracking-wide">
                              {sub.label}
                            </span>
                            <span className="font-mono text-xs font-black text-[#e8ebe6]">
                              {formatLbs(sub.totalLbs)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[#9aa3ad] font-mono mt-1">
                            <span>{sub.timestamp ? formatStageTimeAmPm(sub.timestamp) : 'Logged'}</span>
                            <span>{sub.siloCount} silo record{sub.siloCount > 1 ? 's' : ''}</span>
                          </div>
                          {isLegacy && (
                            <div className="text-[10px] text-[#9aa3ad] font-mono mt-1 italic">
                              Submission boundaries were not stored in this older record.
                            </div>
                          )}
                          {showTechnicalIds && sub.submissionId && !isLegacy && (
                            <div className="mt-2 text-[10px] text-[#9aa3ad] font-mono break-all bg-[#0b0c0e] p-1.5 rounded border border-[#2a313b]">
                              ID: {sub.submissionId}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 6. STARTING / LAST SILO USED */}
                <div className="grid grid-cols-2 gap-3 bg-[#0b0c0e] p-3.5 rounded-xl border border-[#2a313b]">
                  <div>
                    <span className="text-[10px] font-black uppercase text-[#9aa3ad] tracking-wider">
                      Started On
                    </span>
                    <div className="text-sm font-mono font-black text-[#e8ebe6] mt-0.5">
                      {summary.startingSiloNumber ? `Silo ${summary.startingSiloNumber}` : '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-[#9aa3ad] tracking-wider">
                      Last Silo Used
                    </span>
                    <div className="text-sm font-mono font-black text-[#e8ebe6] mt-0.5">
                      {summary.lastUsedSiloNumber ? `Silo ${summary.lastUsedSiloNumber}` : '—'}
                    </div>
                  </div>
                </div>

                {/* 7. DELETED / AUDIT HISTORY (if any) */}
                {summary.hasDeletedHistory && (
                  <div className="bg-[#0b0c0e] rounded-xl border border-[#2a313b] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowDeletedHistory((v) => !v)}
                      className="w-full p-3.5 flex items-center justify-between text-left hover:bg-[#14171c]/50 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#d4a017]" />
                        <span className="text-xs font-black uppercase text-[#e8ebe6] font-mono">
                          Audit History ({summary.deletedRuns.length} Deleted Record{summary.deletedRuns.length > 1 ? 's' : ''})
                        </span>
                      </div>
                      {showDeletedHistory ? (
                        <ChevronUp className="w-4 h-4 text-[#9aa3ad]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#9aa3ad]" />
                      )}
                    </button>

                    {showDeletedHistory && (
                      <div className="p-3.5 pt-0 border-t border-[#2a313b]/80 space-y-2 text-xs font-mono">
                        <p className="text-[11px] text-[#9aa3ad] italic mb-2">
                          Note: Deleted records are preserved for audit compliance and do not contribute to active actual totals.
                        </p>
                        {summary.deletedRuns.map((dr) => (
                          <div key={dr.id} className="bg-[#14171c]/70 p-2.5 rounded border border-[#c23b32]/30 text-[#e8ebe6]">
                            <div className="flex items-center justify-between">
                              <span className="text-[#e25a4a] line-through font-bold">
                                Silo #{dr.siloNumber} • {formatLbs(dr.lbsPulled)} ({dr.sandType})
                              </span>
                              <span className="text-[10px] text-[#9aa3ad]">
                                {dr.deletedAt ? formatStageDateTimeDisplay(dr.deletedAt) : 'Deleted'}
                              </span>
                            </div>
                            {dr.deletedReason && (
                              <div className="text-[11px] text-[#9aa3ad] mt-1">
                                Reason: {dr.deletedReason}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* 8. DELETE ENTIRE STAGE (if stage has active runs) */}
                {onDeleteStage && activeStageRuns.length > 0 && (
                  <div className="bg-[#260e0c]/30 border border-[#c23b32]/40 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-black uppercase text-[#e25a4a] font-mono flex items-center gap-2">
                          <Trash2 className="w-4 h-4 text-[#e25a4a]" /> STAGE DELETION & RESET
                        </h4>
                        <p className="text-[11px] text-[#9aa3ad] mt-0.5">
                          Need to remove this entire stage? Soft-deletes all {activeStageRuns.length} active silo pull(s) and resets the stage to not started.
                        </p>
                      </div>

                      {!isDeletingStage && (
                        <button
                          type="button"
                          onClick={() => setIsDeletingStage(true)}
                          className="bg-[#c23b32]/90 hover:bg-[#c23b32] text-[#e8ebe6] font-black text-xs px-3.5 py-2 rounded-xl transition cursor-pointer shrink-0 uppercase tracking-wider flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> DELETE STAGE
                        </button>
                      )}
                    </div>

                    {isDeletingStage && (
                      <form onSubmit={handleDeleteSubmit} className="space-y-3 pt-2 border-t border-[#c23b32]/30">
                        {deleteError && (
                          <div className="bg-[#260e0c] border border-[#c23b32] p-2.5 rounded-xl text-xs font-bold text-[#e25a4a]">
                            ⚠️ {deleteError}
                          </div>
                        )}

                        <div className="bg-[#0b0c0e] p-3 rounded-xl border border-[#c23b32]/40 space-y-2 text-xs font-mono">
                          <div className="font-bold text-[#e25a4a] uppercase">
                            SILO BALANCE IMPACT ({activeStageRuns.length} RUNS TO BE RESTORED):
                          </div>
                          {Array.from(runsBySilo.entries()).map(([siloNum, lbs]) => {
                            const cur = currentSilos.find((s) => s.siloNumber === siloNum)?.onHandLbs || 0;
                            const proj = projectedSilos.find((s) => s.siloNumber === siloNum)?.onHandLbs || 0;
                            return (
                              <div key={siloNum} className="flex items-center justify-between text-[11px] text-[#e8ebe6]">
                                <span>Silo #{siloNum}:</span>
                                <div className="flex items-center gap-1.5">
                                  <span>{formatLbs(cur)}</span>
                                  <ArrowRight className="w-3.5 h-3.5 text-[#8fa37a]" />
                                  <span className="text-[#8fa37a] font-bold">{formatLbs(proj)}</span>
                                  <span className="text-[#8fa37a] font-bold">(+{formatLbs(lbs)})</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div>
                          <label className="block text-[11px] font-black uppercase text-[#9aa3ad] mb-1">
                            REASON FOR STAGE DELETION (OPTIONAL)
                          </label>
                          <input
                            type="text"
                            value={deleteReason}
                            onChange={(e) => setDeleteReason(e.target.value)}
                            placeholder="e.g. Stage logged under wrong well, re-running stage"
                            className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl px-3.5 py-2 text-xs text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsDeletingStage(false)}
                            disabled={isSubmittingDelete}
                            className="px-3.5 py-2 rounded-xl border border-[#2a313b] text-[#e8ebe6] text-xs font-bold hover:bg-[#1b2027] transition cursor-pointer"
                          >
                            CANCEL
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmittingDelete}
                            className="bg-[#c23b32] hover:bg-[#c23b32] active:bg-[#c23b32] text-[#e8ebe6] font-black text-xs px-4 py-2 rounded-xl shadow border border-[#c23b32] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {isSubmittingDelete ? 'DELETING...' : 'CONFIRM DELETE STAGE'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="sticky bottom-0 z-20 bg-[#14171c]/95 backdrop-blur border-t border-[#2a313b] p-4 flex items-center justify-between gap-3">
          {onOpenLogs && !isNotStarted && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenLogs(summary.wellId, summary.stageNumber);
              }}
              className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] hover:text-[#e8ebe6] font-bold px-4 py-2.5 rounded-xl uppercase tracking-wider text-xs transition inline-flex items-center gap-2 cursor-pointer border border-[#2a313b]"
            >
              <History className="w-4 h-4 text-[#d4a017]" /> OPEN RAW LOGS
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="ml-auto bg-[#d4a017] hover:bg-[#d4a017] text-[#0b0c0e] font-black px-6 py-2.5 rounded-xl uppercase tracking-wider text-xs transition shadow-lg cursor-pointer"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
