import {
  Copy,
  Share2,
  Check,
  AlertTriangle,
  FileText,
  Boxes,
  Layers,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Printer,
  MapPin,
  Workflow,
  Lock,
  RotateCcw,
  CheckCircle2,
  History,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import RecordPullConfirmModal from './RecordPullConfirmModal';
import {
  getSiloDerivedStates,
  formatLbs,
  formatLbsNumber,
  getEffectivePerStageDesign,
  sortStageRunsByActualSequence,
  calculateSandTypeTotalOnHand,
  getNextWellAndStage,
} from '../lib/sandRules';
import { AppState } from '../types';

interface StagePullSheetProps {
  state: AppState;
  initialWellId?: string;
  initialStageNumber?: number;
  targetWellId?: string;
  targetStageNumber?: number;
  isPinned?: boolean;
  onSuccessMessage?: (msg: string) => void;
  resetSignal?: number;
  lastRanWellId?: string;
  onRecordRun?: (
    records: any[],
    options?: { clearManualOverrides?: boolean }
  ) => Promise<void> | void;
  onClearAllSiloPriorities?: () => void;
}

function getSandTypeStyle(sandType: string | null, isInRun: boolean, runsDry: boolean) {
  if (runsDry) {
    return {
      box: 'bg-[#1b2027] border-2 border-[#c23b32] text-[#e8ebe6]',
      badge: 'bg-[#260e0c] text-[#e25a4a] border border-[#c23b32]',
      pullText: 'text-[#e25a4a] font-bold',
      borderAccent: 'border-[#c23b32]',
    };
  }

  if (!isInRun) {
    return {
      box: 'bg-[#14171c]/60 border border-[#2a313b] text-[#9aa3ad] opacity-75',
      badge: 'bg-[#1b2027] text-[#9aa3ad] border border-[#2a313b]',
      pullText: 'text-[#9aa3ad]',
      borderAccent: 'border-[#2a313b]',
    };
  }

  const lower = (sandType || '').toLowerCase();
  if (lower.includes('100')) {
    return {
      box: 'bg-[#14171c] border-2 border-[#d4a017] text-[#e8ebe6]',
      badge: 'bg-[#1b2027] text-[#d4a017] border border-[#d4a017]/50 font-semibold',
      pullText: 'text-[#d4a017] font-bold',
      borderAccent: 'border-[#d4a017]',
    };
  }
  if (lower.includes('40/70') || lower.includes('4070') || lower.includes('40')) {
    return {
      box: 'bg-[#14171c] border-2 border-[#5b7c99] text-[#e8ebe6]',
      badge: 'bg-[#1b2027] text-[#5b7c99] border border-[#5b7c99]/50 font-semibold',
      pullText: 'text-[#5b7c99] font-bold',
      borderAccent: 'border-[#5b7c99]',
    };
  }
  return {
    box: 'bg-[#14171c] border-2 border-[#8fa37a] text-[#e8ebe6]',
    badge: 'bg-[#1b2027] text-[#8fa37a] border border-[#8fa37a]/50 font-semibold',
    pullText: 'text-[#8fa37a] font-bold',
    borderAccent: 'border-[#8fa37a]',
  };
}

export default function StagePullSheet({
  state,
  initialWellId,
  initialStageNumber,
  targetWellId,
  targetStageNumber,
  isPinned = false,
  onSuccessMessage,
  resetSignal,
  lastRanWellId,
  onRecordRun,
  onClearAllSiloPriorities,
}: StagePullSheetProps) {
  const lbsPerTon = state.config.lbsPerTon || 2000;
  const wells = state.config.wells.length > 0
    ? state.config.wells
    : [{ id: 'w-1', name: 'Well 1H', plannedStages: 40 }];

  // Compute next target from zipper / furthest behind
  const nextTarget = getNextWellAndStage(state);
  const fallbackWellId = nextTarget?.wellId || wells[0]?.id || 'w-1';
  const fallbackStageNumber = nextTarget?.stageNumber || 1;

  // Track if the user manually changed well or stage on the pull sheet
  const [isManuallyOverridden, setIsManuallyOverridden] = useState<boolean>(false);
  const [isRecordRunModalOpen, setIsRecordRunModalOpen] = useState<boolean>(false);

  // Selected Well state (initializes from pinned prop or target or getNextWellAndStage)
  const [selectedWellId, setSelectedWellId] = useState<string>(
    initialWellId || targetWellId || fallbackWellId
  );

  // Selected Stage Number state (initializes from pinned prop or target or getNextWellAndStage)
  const [stageNumber, setStageNumber] = useState<number>(
    initialStageNumber || targetStageNumber || fallbackStageNumber
  );

  const activeWell = wells.find((w) => w.id === selectedWellId) || wells[0];

  // Determine default next stage for active well
  const lastRunForWell = (state.runs || [])
    .filter((r) => !r.deleted && r.wellId === activeWell.id)
    .sort((a, b) => b.stageNumber - a.stageNumber)[0];

  const defaultStageNumber = lastRunForWell
    ? lastRunForWell.stageNumber + 1
    : 1;

  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<boolean>(false);

  // 1. Sync state if pinned initial props change (URL parameters)
  useEffect(() => {
    if (isPinned && initialWellId) {
      setSelectedWellId(initialWellId);
      setIsManuallyOverridden(false);
    }
    if (isPinned && initialStageNumber) {
      setStageNumber(initialStageNumber);
      setIsManuallyOverridden(false);
    }
  }, [isPinned, initialWellId, initialStageNumber]);

  // 2. Direct target updates from auto-advance
  useEffect(() => {
    if (targetWellId && targetStageNumber) {
      setSelectedWellId(targetWellId);
      setStageNumber(targetStageNumber);
      setIsManuallyOverridden(false);
    }
  }, [targetWellId, targetStageNumber, resetSignal]);

  // 3. Reset manual override when a run is recorded locally (resetSignal)
  useEffect(() => {
    if (resetSignal && !targetWellId) {
      setIsManuallyOverridden(false);
      const next = getNextWellAndStage(state, lastRanWellId);
      if (next) {
        setSelectedWellId(next.wellId);
        setStageNumber(next.stageNumber);
      }
    }
  }, [resetSignal, lastRanWellId, targetWellId]);

  // 4. When runs land from another phone (state.runs updates in Firestore):
  // Recompute next well and stage to follow along IF not pinned by URL, not manually overridden, and not targeted
  useEffect(() => {
    if (!isPinned && !isManuallyOverridden && !targetWellId) {
      const next = getNextWellAndStage(state);
      if (next) {
        setSelectedWellId(next.wellId);
        setStageNumber(next.stageNumber);
      }
    }
  }, [state.runs, state.config.wells, isPinned, isManuallyOverridden, targetWellId]);

  // Compute derived silo states for chosen well and stage
  const derivedSilos = getSiloDerivedStates(state, activeWell?.id, stageNumber);

  // Filter to silos that actually pull sand for this stage, ordered by global run order
  const pullSilos = derivedSilos
    .filter((s) => s.plannedPullLbs > 0)
    .sort((a, b) => (a.runOrder || 99) - (b.runOrder || 99));

  // Compute running cumulative totals PER SAND TYPE
  const runningTotalBySandType = new Map<string, number>();
  const pullItems = pullSilos.map((s) => {
    const sType = s.sandType || 'Unassigned';
    const prevSandTotal = runningTotalBySandType.get(sType) || 0;
    const currentSandRunningTotalLbs = prevSandTotal + s.plannedPullLbs;
    runningTotalBySandType.set(sType, currentSandRunningTotalLbs);

    const onHandAfterLbs = Math.max(0, s.onHandLbs - s.plannedPullLbs);
    const runsDry = s.onHandLbs <= s.plannedPullLbs || onHandAfterLbs <= 0;

    return {
      ...s,
      sandTypeLabel: sType,
      runningTotalLbs: currentSandRunningTotalLbs,
      runningTotalTons: currentSandRunningTotalLbs / lbsPerTon,
      plannedPullTons: s.plannedPullLbs / lbsPerTon,
      onHandAfterLbs,
      onHandAfterTons: onHandAfterLbs / lbsPerTon,
      runsDry,
    };
  });

  // Calculate Stage Total Lbs and Tons across all silos
  const stageTotalStartingLbs = pullItems.reduce((sum, item) => sum + item.onHandLbs, 0);
  const stageTotalPullLbs = pullItems.reduce((sum, item) => sum + item.plannedPullLbs, 0);
  const stageTotalPullTons = stageTotalPullLbs / lbsPerTon;
  const stageTotalEndingLbs = pullItems.reduce((sum, item) => sum + item.onHandAfterLbs, 0);

  // Compute per-sand-type downhole totals for THIS STAGE using per-well designs
  const thisStageSandTotals = state.config.sandTypes.map((st) => {
    const pulledLbs = pullItems
      .filter((item) => item.sandTypeLabel === st.name)
      .reduce((sum, item) => sum + item.plannedPullLbs, 0);
    const designLbs = getEffectivePerStageDesign(activeWell, st);
    return {
      sandType: st.name,
      pulledLbs,
      pulledTons: pulledLbs / lbsPerTon,
      designLbs,
    };
  });

  // Already logged runs for this well & stage to compute remaining required on partial stages
  const alreadyLoggedForThisStage = (state.runs || []).filter(
    (r) => !r.deleted && r.wellId === activeWell?.id && r.stageNumber === stageNumber
  );

  // Check for Shortages on this stage (using remaining required instead of full design)
  const shortages = state.config.sandTypes.map((st) => {
    const fullDesign = getEffectivePerStageDesign(activeWell, st);
    const alreadyPumped = alreadyLoggedForThisStage
      .filter((r) => r.sandType === st.name)
      .reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
    const requiredForStage = Math.max(0, fullDesign - alreadyPumped);

    const availableInActiveSilos = state.config.silos
      .filter((s) => s.sandType === st.name && !s.isOutOfService)
      .reduce((sum, s) => {
        const siloOnHand = derivedSilos.find((ds) => ds.siloNumber === s.siloNumber)?.onHandLbs || 0;
        return sum + Math.max(0, siloOnHand);
      }, 0);

    const shortfallLbs = Math.max(0, requiredForStage - availableInActiveSilos);
    return {
      sandType: st.name,
      requiredForStage,
      fullDesign,
      alreadyPumped,
      availableInActiveSilos,
      shortfallLbs,
      shortfallTons: shortfallLbs / lbsPerTon,
    };
  }).filter((s) => s.shortfallLbs > 0);

  // Identify specific silos that run dry
  const dryCans = pullItems.filter((item) => item.runsDry);

  // Check if run order was set manually on any active silo
  const hasManualOrder = state.config.silos.some(
    (s) => s.manualPriority !== null && s.manualPriority !== undefined && !s.isOutOfService
  );

  // Calculate post-stage location balances per sand type
  const postStageBalances = state.config.sandTypes.map((st) => {
    const currentOnHand = calculateSandTypeTotalOnHand(st.name, state);
    const pulledThisStage = pullItems
      .filter((item) => item.sandTypeLabel === st.name)
      .reduce((sum, item) => sum + item.plannedPullLbs, 0);

    const remainingOnHandLbs = Math.max(0, currentOnHand - pulledThisStage);
    const remainingOnHandTons = remainingOnHandLbs / lbsPerTon;

    return {
      sandType: st.name,
      remainingOnHandLbs,
      remainingOnHandTons,
    };
  });

  const totalPostStageOnHandLbs = postStageBalances.reduce((sum, b) => sum + b.remainingOnHandLbs, 0);
  const totalPostStageOnHandTons = totalPostStageOnHandLbs / lbsPerTon;

  // Previous Stage Totals calculation for active well
  const prevStageNumber = stageNumber > 1 ? stageNumber - 1 : null;
  const prevStageRuns = prevStageNumber
    ? (state.runs || []).filter(
        (r) => !r.deleted && r.wellId === activeWell?.id && r.stageNumber === prevStageNumber
      )
    : [];

  const prevStageTotalPulledLbs = prevStageRuns.reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
  const prevStageTotalPulledTons = prevStageTotalPulledLbs / lbsPerTon;

  const prevStageBySandType = state.config.sandTypes.map((st) => {
    const pulledLbs = prevStageRuns
      .filter((r) => r.sandType === st.name)
      .reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
    return {
      sandType: st.name,
      pulledLbs,
      pulledTons: pulledLbs / lbsPerTon,
    };
  }).filter((st) => st.pulledLbs > 0);

  const prevStageBySilo = sortStageRunsByActualSequence(prevStageRuns)
    .map((r, idx) => ({
      order: r.runSequence || idx + 1,
      siloNumber: r.siloNumber,
      sandType: r.sandType,
      lbsPulled: r.lbsPulled,
      tonsPulled: r.lbsPulled / lbsPerTon,
      date: r.date,
    }));

  // Partition silos by Side (Side A down left, Side B down right)
  let sideASilos = derivedSilos.filter((s) => s.side === 'A');
  let sideBSilos = derivedSilos.filter((s) => s.side === 'B');

  if (sideASilos.length === 0 && sideBSilos.length === 0) {
    const half = Math.ceil(derivedSilos.length / 2);
    sideASilos = derivedSilos.slice(0, half);
    sideBSilos = derivedSilos.slice(half);
  } else if (sideBSilos.length === 0 && sideASilos.length > 1) {
    const half = Math.ceil(sideASilos.length / 2);
    sideBSilos = sideASilos.slice(half);
    sideASilos = sideASilos.slice(0, half);
  }

  // Date Generated timestamp string
  const dateGenerated = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Construct Shareable URL
  const getShareableUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    return `${origin}${pathname}?pad=${encodeURIComponent(state.padId)}&well=${encodeURIComponent(activeWell.id)}&stage=${stageNumber}`;
  };

  // Copy Pinned Stage Link
  const handleCopyLink = async () => {
    const url = getShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      if (onSuccessMessage) {
        onSuccessMessage(`Pinned link for ${activeWell.name} Stage #${stageNumber} copied!`);
      }
      setTimeout(() => setCopiedLink(false), 3000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  // Generate SMS / Plain Text Pull Sheet
  const generateTextSummary = (): string => {
    let text = `STAGE PULL SHEET\n`;
    text += `Pad: ${state.config.padName}\n`;
    text += `Well: ${activeWell.name} | Stage #${stageNumber}\n`;
    text += `Date: ${dateGenerated}\n`;
    if (hasManualOrder) {
      text += `NOTICE: Run order was set manually.\n`;
    }
    text += `----------------------------------------\n`;

    if (shortages.length > 0) {
      shortages.forEach((s) => {
        text += `🚨 SHORT BY ${formatLbs(s.shortfallLbs)} (${s.shortfallTons.toFixed(1)} T) OF ${s.sandType.toUpperCase()}\n`;
      });
      text += `----------------------------------------\n`;
    }

    text += `PULL TABLE:\n`;
    if (pullItems.length === 0) {
      text += `No sand planned for this stage.\n`;
    } else {
      pullItems.forEach((item, index) => {
        text += `Order #${item.runOrder ?? index + 1} | SILO #${item.siloNumber} (${item.sandTypeLabel})\n`;
        text += `  Starting: ${formatLbsNumber(item.onHandLbs)} lbs\n`;
        text += `  Pull: ${formatLbsNumber(item.plannedPullLbs)} lbs (${item.plannedPullTons.toFixed(1)} T)\n`;
        text += `  Ending: ${formatLbsNumber(item.onHandAfterLbs)} lbs${item.runsDry ? ' ⚠️ RUNS DRY' : ''}\n\n`;
      });
    }

    text += `----------------------------------------\n`;
    text += `1. THIS STAGE DOWNHOLE:\n`;
    thisStageSandTotals.forEach((st) => {
      text += `  • ${st.sandType}: ${formatLbsNumber(st.pulledLbs)} lbs (${st.pulledTons.toFixed(1)} T)\n`;
    });

    text += `\n2. RUNS DRY - RELOAD AFTER THIS STAGE:\n`;
    if (dryCans.length > 0) {
      dryCans.forEach((c) => {
        text += `  • SILO #${c.siloNumber} (${c.sandTypeLabel})\n`;
      });
    } else {
      text += `  • None\n`;
    }

    text += `\n3. ON LOCATION AFTER THIS STAGE:\n`;
    postStageBalances.forEach((b) => {
      text += `  • ${b.sandType}: ${formatLbsNumber(b.remainingOnHandLbs)} lbs (${b.remainingOnHandTons.toFixed(1)} T)\n`;
    });

    text += `----------------------------------------\n`;
    text += `Pull them in the order shown. Run each silo dry before moving to the next.\n`;
    text += `Link: ${getShareableUrl()}`;

    return text;
  };

  const handleCopyText = async () => {
    const txt = generateTextSummary();
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedText(true);
      if (onSuccessMessage) {
        onSuccessMessage('Pull sheet text copied to clipboard!');
      }
      setTimeout(() => setCopiedText(false), 3000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const renderSiloBox = (silo: (typeof derivedSilos)[0], side: 'A' | 'B') => {
    const pullItem = pullItems.find((p) => p.siloNumber === silo.siloNumber);
    const isInRun = Boolean(pullItem && pullItem.plannedPullLbs > 0);
    const pullLbs = pullItem ? pullItem.plannedPullLbs : 0;
    const pullTons = pullLbs / lbsPerTon;
    const onHandAfterLbs = pullItem ? pullItem.onHandAfterLbs : silo.onHandLbs;
    const runsDry = Boolean(pullItem && pullItem.runsDry);
    const runOrder = pullItem ? pullItem.runOrder || (pullItems.indexOf(pullItem) + 1) : null;

    const style = getSandTypeStyle(silo.sandType, isInRun, runsDry);

    return (
      <div
        key={silo.siloNumber}
        className="flex items-center gap-2 my-1.5"
      >
        {/* On Side B, Arrow points LEFT toward blender */}
        {side === 'B' && isInRun && (
          <div className="flex flex-col items-center shrink-0 font-mono text-xs font-bold text-[#c23b32]">
            <span className="bg-[#c23b32] text-[#e8ebe6] px-2 py-0.5 rounded font-mono text-[11px] font-bold shadow-sm">
              #{runOrder}
            </span>
            <ArrowLeft className="w-4 h-4 text-[#e25a4a] mt-0.5" />
          </div>
        )}

        {/* Silo Box */}
        <div
          className={`flex-1 rounded-xl p-3 shadow-md transition ${style.box}`}
        >
          <div className="flex items-center justify-between border-b border-[#2a313b] pb-1.5 mb-1.5">
            <div className="font-bold text-sm font-mono tracking-tight text-[#e8ebe6] uppercase">
              SILO #{silo.siloNumber}
            </div>
            {silo.sandType ? (
              <div className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${style.badge}`}>
                {silo.sandType}
              </div>
            ) : (
              <div className="text-[10px] font-semibold text-[#9aa3ad] uppercase">
                Unassigned
              </div>
            )}
          </div>

          {isInRun ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="bg-[#c23b32] text-[#e8ebe6] px-2 py-0.5 rounded text-xs font-mono font-bold">
                  RUN #{runOrder}
                </span>
                <span className="text-xs font-mono text-[#9aa3ad]">
                  {pullTons.toFixed(1)} tons
                </span>
              </div>

              {/* PRIMARY FOCAL POINT: PULL QUANTITY */}
              <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-[#e8ebe6] my-1">
                {formatLbsNumber(pullLbs)} <span className="text-xs font-sans text-[#9aa3ad]">lbs</span>
              </div>

              {/* Starting & Ending lbs */}
              <div className="flex items-center justify-between text-xs font-mono text-[#9aa3ad] border-t border-[#2a313b] pt-1">
                <span>Start: <span className="text-[#e8ebe6] font-medium">{formatLbsNumber(silo.onHandLbs)}</span></span>
                <span>End: <span className={runsDry ? 'text-[#e25a4a] font-bold' : 'text-[#e8ebe6] font-medium'}>{formatLbsNumber(onHandAfterLbs)}</span></span>
              </div>

              {runsDry && (
                <div className="mt-1 bg-[#260e0c] text-[#e25a4a] border border-[#c23b32] text-[10px] font-bold uppercase px-2 py-0.5 rounded text-center tracking-wider flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  RUNS DRY — RELOAD
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1 py-0.5">
              <div className="inline-block bg-[#1b2027] text-[#9aa3ad] text-[10px] font-semibold uppercase px-2 py-0.5 rounded border border-[#2a313b]">
                NO PULL
              </div>
              <div className="text-xs font-mono text-[#9aa3ad]">
                On Hand: <span className="text-[#e8ebe6]">{formatLbsNumber(silo.onHandLbs)} lbs</span>
              </div>
            </div>
          )}
        </div>

        {/* On Side A, Arrow points RIGHT toward blender */}
        {side === 'A' && isInRun && (
          <div className="flex flex-col items-center shrink-0 font-mono text-xs font-bold text-[#c23b32]">
            <span className="bg-[#c23b32] text-[#e8ebe6] px-2 py-0.5 rounded font-mono text-[11px] font-bold shadow-sm">
              #{runOrder}
            </span>
            <ArrowRight className="w-4 h-4 text-[#e25a4a] mt-0.5" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-[#e8ebe6] overflow-x-hidden selection:bg-[#c23b32] selection:text-white printable-sheet">
      {/* PRINT STYLESHEET */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 0.3in;
          }
          
          header, nav, aside, .no-print, .screen-only, button:not(.print-allow), select:not(.print-allow), input:not(.print-allow) {
            display: none !important;
          }
          
          html, body, #root, main, .printable-sheet {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #0f172a !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 10.4in !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-variant-numeric: tabular-nums;
          }

          * {
            box-shadow: none !important;
            text-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .print-only {
            display: block !important;
            width: 100% !important;
            max-width: 10.4in !important;
            margin: 0 auto !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .page-break-inside-avoid,
          table,
          tr,
          .summary-strip {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }

        @media screen {
          .print-only {
            display: none !important;
          }
        }
      `}</style>

      {/* DEDICATED 1-PAGE PRINT-ONLY SCHEMATIC */}
      <div className="stage-pull-sheet print-only hidden print:block text-slate-950 font-sans bg-white p-0 m-0 text-xs w-full max-w-[10.4in] mx-auto">
        {/* Header Bar (~0.45-0.55in height) */}
        <div className="border-b-2 border-slate-950 pb-1.5 mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div>
              <div className="text-xs font-black tracking-wider text-red-700 uppercase leading-none">
                PYTHON PRESSURE PUMPING
              </div>
              <h1 className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-950 font-mono mt-0.5 flex items-center gap-1.5">
                {(activeWell.customerName || state.config.customerName) && (
                  <>
                    <span className="text-red-700">{activeWell.customerName || state.config.customerName}</span>
                    <span className="text-slate-400">•</span>
                  </>
                )}
                <span>{state.config.padName}</span>
                <span className="text-slate-400">•</span>
                <span>WELL {activeWell.name}</span>
                <span className="text-slate-400">•</span>
                <span className="bg-amber-300 px-2 py-0.5 rounded text-slate-950 font-black text-base sm:text-lg border-2 border-slate-950">
                  STAGE #{stageNumber}
                </span>
              </h1>
            </div>
          </div>
          <div className="text-right text-xs font-mono font-bold text-slate-900 leading-tight">
            <div className="font-black text-slate-950 uppercase text-sm">STAGE PULL SCHEMATIC</div>
            <div className="text-slate-700">DATE: {dateGenerated}</div>
            {hasManualOrder && (
              <div className="text-[10px] font-black uppercase text-purple-900 bg-purple-100 px-2 py-0.5 rounded border border-purple-400 inline-flex items-center gap-1 mt-0.5">
                <Lock className="w-3 h-3" /> MANUAL ORDER
              </div>
            )}
          </div>
        </div>

        {/* Shortages Callout if any */}
        {shortages.length > 0 && (
          <div className="bg-red-50 border-2 border-red-600 px-2.5 py-1 mb-1.5 rounded-lg text-red-900 text-xs font-bold flex items-center justify-between page-break-inside-avoid">
            <span className="font-black text-red-700 uppercase flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-red-700" /> SHORTAGE DETECTED:
            </span>
            {shortages.map((s) => (
              <span key={s.sandType} className="font-mono font-black text-xs sm:text-sm">
                SHORT BY {formatLbsNumber(s.shortfallLbs)} lbs ({s.shortfallTons.toFixed(1)} T) OF {s.sandType.toUpperCase()}
              </span>
            ))}
          </div>
        )}

        {/* Pad Layout Schematic (Side A | Blender | Side B) */}
        <div className="border-2 border-slate-800 rounded-xl p-1.5 mb-1.5 bg-slate-50 page-break-inside-avoid">
          <div className="text-xs font-black uppercase text-slate-800 tracking-wider mb-1 flex justify-between border-b border-slate-300 pb-0.5">
            <span className="text-slate-900 font-black">SIDE A SILOS</span>
            <span className="font-mono text-amber-800 font-black">PAD SCHEMATIC & ROTATION</span>
            <span className="text-slate-900 font-black">SIDE B SILOS</span>
          </div>

          <div className="grid grid-cols-11 gap-1.5 items-center">
            {/* Side A */}
            <div className="col-span-5 space-y-1">
              {sideASilos.map((silo) => {
                const pull = pullItems.find((p) => p.siloNumber === silo.siloNumber);
                const isInRun = Boolean(pull && pull.plannedPullLbs > 0);
                return (
                  <div
                    key={silo.siloNumber}
                    className={`py-1 px-2 rounded-lg border text-xs flex items-center justify-between ${
                      isInRun
                        ? 'bg-amber-100/90 border-amber-600 text-slate-950 font-bold'
                        : 'bg-white border-slate-300 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono font-black text-sm text-slate-950">#{silo.siloNumber}</span>
                      <span className="text-[10px] uppercase font-black text-slate-800">
                        {silo.sandType || 'Unassigned'}
                      </span>
                    </div>
                    {isInRun ? (
                      <div className="text-right flex items-center gap-1.5">
                        <span className="bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded font-black text-xs font-mono border border-amber-700 leading-none">
                          RUN #{pull!.runOrder}
                        </span>
                        <div className="font-mono font-black text-slate-950 text-sm sm:text-base leading-none">
                          {formatLbsNumber(pull!.plannedPullLbs)} <span className="text-[10px] font-bold text-slate-800">lbs</span>
                        </div>
                        {pull!.runsDry ? (
                          <span className="text-[10px] font-black text-white uppercase bg-red-600 px-1.5 py-0.5 rounded border border-red-800 leading-none">
                            ⚠️ DRY
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold text-slate-700">
                            End: {formatLbsNumber(pull!.onHandAfterLbs)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-right">
                        <span className="text-[10px] italic text-slate-500 font-bold">NO PULL</span>
                        <span className="text-[10px] font-mono text-slate-700 ml-1">({formatLbsNumber(silo.onHandLbs)})</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sand Conveyor */}
            <div className="col-span-1 border-2 border-slate-900 bg-amber-300 rounded-lg p-1 text-center font-mono text-[10px] font-black uppercase flex flex-col justify-center items-center h-full min-h-[55px]">
              <span>SAND</span>
              <span className="text-[8px] text-slate-900 font-black leading-none">CONVEYOR</span>
              <span className="text-[8px] text-emerald-950 mt-1 bg-white px-1 py-0.5 rounded font-black leading-none border border-emerald-800">
                DOWN
              </span>
            </div>

            {/* Side B */}
            <div className="col-span-5 space-y-1">
              {sideBSilos.map((silo) => {
                const pull = pullItems.find((p) => p.siloNumber === silo.siloNumber);
                const isInRun = Boolean(pull && pull.plannedPullLbs > 0);
                return (
                  <div
                    key={silo.siloNumber}
                    className={`py-1 px-2 rounded-lg border text-xs flex items-center justify-between ${
                      isInRun
                        ? 'bg-amber-100/90 border-amber-600 text-slate-950 font-bold'
                        : 'bg-white border-slate-300 text-slate-600'
                    }`}
                  >
                    {isInRun ? (
                      <div className="text-left flex items-center gap-1.5">
                        <span className="bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded font-black text-xs font-mono border border-amber-700 leading-none">
                          RUN #{pull!.runOrder}
                        </span>
                        <div className="font-mono font-black text-slate-950 text-sm sm:text-base leading-none">
                          {formatLbsNumber(pull!.plannedPullLbs)} <span className="text-[10px] font-bold text-slate-800">lbs</span>
                        </div>
                        {pull!.runsDry ? (
                          <span className="text-[10px] font-black text-white uppercase bg-red-600 px-1.5 py-0.5 rounded border border-red-800 leading-none">
                            ⚠️ DRY
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold text-slate-700">
                            End: {formatLbsNumber(pull!.onHandAfterLbs)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-left">
                        <span className="text-[10px] italic text-slate-500 font-bold">NO PULL</span>
                        <span className="text-[10px] font-mono text-slate-700 ml-1">({formatLbsNumber(silo.onHandLbs)})</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] uppercase font-black text-slate-800">
                        {silo.sandType || 'Unassigned'}
                      </span>
                      <span className="font-mono font-black text-sm text-slate-950">#{silo.siloNumber}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pull Sequence Table */}
        <div className="mb-1.5 page-break-inside-avoid">
          <div className="text-sm font-black uppercase text-slate-900 tracking-wider mb-0.5 flex items-center justify-between">
            <span>SILO PULL SEQUENCE ({pullItems.length} SILOS IN ROTATION)</span>
            <span className="text-[11px] font-bold text-slate-600 font-mono">TABULAR FIELD VIEW</span>
          </div>
          <table className="w-full text-sm text-left border-collapse border-2 border-slate-900">
            <thead>
              <tr className="bg-slate-200 text-slate-950 font-black uppercase text-xs sm:text-sm border-b-2 border-slate-900">
                <th className="py-1 px-2 border-r border-slate-400 text-center w-14 font-black">Order</th>
                <th className="py-1 px-2 border-r border-slate-400 font-black">Silo</th>
                <th className="py-1 px-2 border-r border-slate-400 font-black">Sand Type</th>
                <th className="py-1 px-2 border-r border-slate-400 text-right font-black">Starting (lbs)</th>
                <th className="py-1 px-2 border-r border-slate-400 text-right font-black text-slate-950 bg-amber-200/60">PULL (LBS)</th>
                <th className="py-1 px-2 border-r border-slate-400 text-right font-black">Pull (tons)</th>
                <th className="py-1 px-2 text-right font-black text-slate-950">ENDING (LBS)</th>
              </tr>
            </thead>
            <tbody>
              {pullItems.map((item, idx) => (
                <tr key={item.siloNumber} className="border-b border-slate-300">
                  <td className="py-0.5 px-2 border-r border-slate-300 text-center font-black font-mono text-sm">
                    #{item.runOrder ?? idx + 1}
                  </td>
                  <td className="py-0.5 px-2 border-r border-slate-300 font-black font-mono text-sm text-slate-950">
                    SILO #{item.siloNumber}
                  </td>
                  <td className="py-0.5 px-2 border-r border-slate-300 font-bold text-[13px] text-slate-900">
                    {item.sandTypeLabel}
                  </td>
                  <td className="py-0.5 px-2 border-r border-slate-300 text-right font-mono font-bold text-slate-900 text-sm leading-none">
                    {formatLbsNumber(item.onHandLbs)}
                  </td>
                  <td className="py-0.5 px-2 border-r border-slate-300 text-right font-mono font-black text-slate-950 text-lg leading-none bg-amber-50/70">
                    {formatLbsNumber(item.plannedPullLbs)} <span className="text-[10px] font-bold text-slate-800">lbs</span>
                  </td>
                  <td className="py-0.5 px-2 border-r border-slate-300 text-right font-mono text-slate-800 font-bold text-xs">
                    {item.plannedPullTons.toFixed(1)} t
                  </td>
                  <td className={`py-0.5 px-2 text-right font-mono font-black text-sm ${item.runsDry ? 'text-red-700 bg-red-50' : 'text-slate-950'}`}>
                    {formatLbsNumber(item.onHandAfterLbs)} {item.runsDry ? '⚠️ DRY' : 'lbs'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-200 font-black text-sm border-t-2 border-slate-900">
                <td colSpan={3} className="py-1 px-2 uppercase text-slate-950 border-r border-slate-400 font-black">
                  Total Stage Pull
                </td>
                <td className="py-1 px-2 text-right font-mono text-slate-950 font-bold text-sm border-r border-slate-400 leading-none">
                  {formatLbsNumber(stageTotalStartingLbs)}
                </td>
                <td className="py-1 px-2 text-right font-mono text-slate-950 font-black text-lg border-r border-slate-400 leading-none bg-amber-300/80">
                  {formatLbsNumber(stageTotalPullLbs)} <span className="text-[10px] font-bold text-slate-900">lbs</span>
                </td>
                <td className="py-1 px-2 text-right font-mono text-slate-900 font-bold border-r border-slate-400 text-xs">
                  {stageTotalPullTons.toFixed(1)} t
                </td>
                <td className="py-1 px-2 text-right font-mono text-slate-950 font-black text-sm">
                  {formatLbsNumber(stageTotalEndingLbs)} lbs
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 3 Summary Strips in 3 Columns (14-16px bold typography) */}
        <div className="grid grid-cols-3 gap-2 border-2 border-slate-900 rounded-xl p-2 bg-slate-50 text-xs sm:text-sm mb-1.5 page-break-inside-avoid shadow-none">
          <div className="flex flex-col justify-between">
            <div>
              <div className="font-black text-slate-950 uppercase border-b-2 border-slate-400 pb-0.5 mb-1 text-xs sm:text-sm flex items-center gap-1.5 tracking-wide">
                <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-[10px] shadow-sm">1</span>
                Downhole Requirement
              </div>
              <div className="space-y-0.5">
                {thisStageSandTotals.map((st) => (
                  <div key={st.sandType} className="font-mono font-bold leading-tight text-xs sm:text-sm text-slate-900">
                    {st.sandType}: <span className="font-black text-slate-950 text-sm sm:text-base">{formatLbsNumber(st.pulledLbs)} lbs</span> <span className="text-slate-700 text-xs font-semibold">({st.pulledTons.toFixed(1)}t)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between">
            <div>
              <div className="font-black text-slate-950 uppercase border-b-2 border-slate-400 pb-0.5 mb-1 text-xs sm:text-sm flex items-center gap-1.5 tracking-wide">
                <span className="w-4 h-4 rounded-full bg-red-600 text-white font-black flex items-center justify-center text-[10px] shadow-sm">2</span>
                Reload After Stage
              </div>
              {dryCans.length > 0 ? (
                <div className="space-y-0.5">
                  <div className="font-mono font-black text-red-700 uppercase leading-tight text-xs sm:text-sm flex flex-wrap gap-1">
                    {dryCans.map((c) => (
                      <span key={c.siloNumber} className="bg-red-600 text-white px-2 py-0.5 rounded font-mono font-black text-xs border border-red-900">
                        SILO #{c.siloNumber} ({c.sandTypeLabel})
                      </span>
                    ))}
                  </div>
                  <div className="text-[10px] font-black text-red-800 uppercase tracking-wide">Requires immediate reload</div>
                </div>
              ) : (
                <div className="text-emerald-800 font-black leading-snug text-xs sm:text-sm flex items-center gap-1 pt-0.5">
                  <Check className="w-4 h-4 text-emerald-700 stroke-[3]" /> None — All have balance
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-between">
            <div>
              <div className="font-black text-slate-950 uppercase border-b-2 border-slate-400 pb-0.5 mb-1 text-xs sm:text-sm flex items-center gap-1.5 tracking-wide">
                <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center text-[10px] shadow-sm">3</span>
                On Location Remaining
              </div>
              <div className="space-y-0.5">
                {postStageBalances.map((b) => (
                  <div key={b.sandType} className="font-mono leading-tight text-xs sm:text-sm text-slate-900">
                    {b.sandType}: <span className="font-black text-slate-950">{formatLbsNumber(b.remainingOnHandLbs)} lbs</span>
                  </div>
                ))}
                <div className="font-mono font-black text-slate-950 text-xs sm:text-sm border-t border-slate-300 pt-0.5 mt-0.5">
                  Total Pad: {formatLbsNumber(totalPostStageOnHandLbs)} lbs <span className="text-slate-700 text-xs font-bold">({totalPostStageOnHandTons.toFixed(1)}t)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Previous Stage Reference (Single Compact Strip) */}
        {prevStageNumber && (
          <div className="border-2 border-slate-900 rounded-xl py-1 px-2.5 bg-slate-100 text-xs sm:text-sm mb-1.5 page-break-inside-avoid flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black uppercase text-slate-950 bg-slate-200 px-1.5 py-0.5 rounded border border-slate-400 text-xs">
                PREV STAGE #{prevStageNumber} ({activeWell.name})
              </span>
              {prevStageRuns.length > 0 ? (
                <>
                  <span className="text-slate-900 font-bold text-xs sm:text-sm">
                    TOTAL: <strong className="font-black text-slate-950">{formatLbsNumber(prevStageTotalPulledLbs)} lbs</strong> ({prevStageTotalPulledTons.toFixed(1)}t)
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-800 text-xs">
                    {prevStageBySandType.map((st) => `${st.sandType}: ${formatLbsNumber(st.pulledLbs)} lbs`).join(' | ')}
                  </span>
                </>
              ) : (
                <span className="italic text-slate-600 text-xs">No recorded run logged for Stage #{prevStageNumber} yet</span>
              )}
            </div>
            {prevStageRuns.length > 0 && (
              <div className="text-slate-900 font-black text-xs sm:text-sm">
                <span className="text-slate-600 font-semibold uppercase mr-1">RUN:</span>
                {prevStageBySilo.map((s) => `#${s.order} S${s.siloNumber} (${formatLbsNumber(s.lbsPulled)})`).join(' → ')}
              </div>
            )}
          </div>
        )}

        {/* Field Notes & Handwritten Sign-off Box (Compact Print View ~58px) */}
        <div className="border-2 border-dashed border-slate-700 rounded-xl p-2 mb-1.5 bg-white flex flex-col justify-between min-h-[58px] page-break-inside-avoid text-xs">
          <div className="text-slate-700 italic text-xs font-medium">
            Field Notes / Stage Remarks: ___________________________________________________________________________________________________________
          </div>
          <div className="font-mono font-bold text-slate-900 text-xs sm:text-sm flex justify-between items-end pt-1 border-t border-slate-200">
            <span>Operator Sign-off: ___________________________________</span>
            <span>Date / Time: ________________________</span>
          </div>
        </div>

        {/* Footer Instruction */}
        <div className="border-2 border-amber-600 bg-amber-100/90 text-slate-950 rounded-xl py-1 px-3 text-center text-xs sm:text-sm font-black uppercase tracking-wider page-break-inside-avoid">
          "PULL SILOS IN ORDER SHOWN. RUN EACH SILO DRY BEFORE SWITCHING TO THE NEXT."
        </div>
      </div>

      {/* SCREEN-ONLY INTERACTIVE PULL SHEET */}
      <div className="screen-only space-y-6">

      {/* Top Toolbar: Well/Stage Selectors & Print/Link Controls */}
      {!isPinned && (
        <div className="no-print top-toolbar bg-[#14171c] border border-[#2a313b] rounded-xl p-3 sm:p-4 shadow-lg flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-[#9aa3ad] tracking-wider mb-1">
                SELECT WELL
              </label>
              <select
                value={selectedWellId}
                onChange={(e) => {
                  setIsManuallyOverridden(true);
                  const newWellId = e.target.value;
                  setSelectedWellId(newWellId);
                  const wObj = wells.find((w) => w.id === newWellId);
                  if (wObj) {
                    const lastR = (state.runs || [])
                      .filter((r) => !r.deleted && r.wellId === wObj.id)
                      .sort((a, b) => b.stageNumber - a.stageNumber)[0];
                    setStageNumber(lastR ? lastR.stageNumber + 1 : 1);
                  }
                }}
                className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg px-3 py-1.5 text-xs sm:text-sm font-bold text-[#e8ebe6] focus:outline-none focus:border-[#8fa37a]"
              >
                {wells.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.plannedStages} Stages)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-[#9aa3ad] tracking-wider mb-1">
                STAGE NUMBER
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={stageNumber}
                  onChange={(e) => {
                    setIsManuallyOverridden(true);
                    setStageNumber(Math.max(1, parseInt(e.target.value, 10) || 1));
                  }}
                  className="w-20 bg-[#0b0c0e] border border-[#2a313b] rounded-lg px-3 py-1.5 text-xs sm:text-sm font-mono font-bold text-[#e8ebe6] focus:outline-none focus:border-[#8fa37a]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsManuallyOverridden(false);
                    const next = getNextWellAndStage(state);
                    if (next) {
                      setSelectedWellId(next.wellId);
                      setStageNumber(next.stageNumber);
                    } else {
                      setStageNumber(defaultStageNumber);
                    }
                  }}
                  className={`text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                    isManuallyOverridden
                      ? 'bg-[#d4a017] hover:bg-[#d4a017]/90 text-[#0b0c0e] border-[#d4a017] shadow-sm'
                      : 'bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] hover:text-[#e8ebe6] border-[#2a313b]'
                  }`}
                  title={isManuallyOverridden ? 'Reset to Auto Next Well & Stage' : 'Reset to Next Stage'}
                >
                  {isManuallyOverridden && <RotateCcw className="w-3 h-3 stroke-[2.5]" />}
                  {isManuallyOverridden
                    ? 'RESET TO AUTO'
                    : `AUTO NEXT (${nextTarget ? (wells.find(w => w.id === nextTarget.wellId)?.name || 'WELL') + ' #' + nextTarget.stageNumber : '#' + defaultStageNumber})`}
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons: Record Pull, Print, Copy Link, Copy Text */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!isPinned && onRecordRun && (
              <button
                type="button"
                onClick={() => setIsRecordRunModalOpen(true)}
                className="bg-[#c23b32] hover:bg-[#e25a4a] active:bg-[#a63028] text-[#e8ebe6] font-bold text-xs px-3.5 py-2 rounded-lg shadow border border-[#e25a4a]/40 transition flex items-center gap-2 uppercase tracking-wide cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                <span>RECORD THIS PULL</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="bg-[#14171c] hover:bg-[#1b2027] text-[#8fa37a] hover:text-[#e8ebe6] border border-[#8fa37a]/60 font-bold text-xs px-3.5 py-2 rounded-lg transition flex items-center gap-2 uppercase tracking-wide cursor-pointer"
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span>PRINT SHEET</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] hover:text-[#e8ebe6] font-medium text-xs px-3 py-2 rounded-lg border border-[#2a313b] transition flex items-center gap-1.5 uppercase cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-[#8fa37a] stroke-[3]" />
                  <span className="text-[#8fa37a]">LINK COPIED!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 stroke-[2.5]" />
                  <span>COPY PINNED LINK</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyText}
              className="bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] hover:text-[#e8ebe6] font-medium text-xs px-3 py-2 rounded-lg border border-[#2a313b] transition flex items-center gap-1.5 uppercase cursor-pointer"
            >
              {copiedText ? (
                <Check className="w-4 h-4 text-[#8fa37a] stroke-[3]" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>TEXT SUMMARY</span>
            </button>
          </div>
        </div>
      )}

      {/* MANUAL OVERRIDE HYGIENE BANNER AT TOP OF PULL SHEET */}
      {hasManualOrder && (
        <div className="bg-[#14171c] border border-[#5b7c99]/50 text-[#e8ebe6] rounded-xl p-3 sm:p-4 shadow-md flex flex-col sm:flex-row items-center justify-between gap-3 page-break-inside-avoid">
          <div className="flex items-center gap-3">
            <div className="bg-[#5b7c99]/20 text-[#5b7c99] border border-[#5b7c99]/40 p-2 rounded-lg shrink-0">
              <Lock className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#5b7c99]">
                MANUAL RUN-ORDER OVERRIDES ACTIVE
              </div>
              <div className="text-xs sm:text-sm font-medium text-[#e8ebe6] mt-0.5">
                Run sequence is manually pinned for: {state.config.silos.filter(s => s.manualPriority !== null && s.manualPriority !== undefined).map(s => `Silo #${s.siloNumber} (Slot #${s.manualPriority})`).join(', ')}
              </div>
            </div>
          </div>

          {onClearAllSiloPriorities && (
            <button
              type="button"
              onClick={onClearAllSiloPriorities}
              className="bg-[#1b2027] hover:bg-[#2a313b] text-[#5b7c99] hover:text-[#e8ebe6] border border-[#5b7c99]/40 font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 uppercase tracking-wide shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Auto Carousel</span>
            </button>
          )}
        </div>
      )}

      {/* PROMINENT SHORTAGE ALERT BANNER AT TOP */}
      {shortages.length > 0 && (
        <div className="space-y-3 page-break-inside-avoid">
          {shortages.map((s) => (
            <div
              key={s.sandType}
              className="bg-[#260e0c] text-[#e8ebe6] border border-[#c23b32] rounded-xl p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3.5 text-center sm:text-left">
                <div className="bg-[#c23b32] text-white p-2.5 rounded-lg font-bold shrink-0 shadow">
                  <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#e25a4a]">
                    CRITICAL STAGE SHORTAGE WARNING
                  </div>
                  <div className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-[#e8ebe6] font-mono">
                    SHORT BY {formatLbs(s.shortfallLbs)} ({s.shortfallTons.toFixed(1)} TONS) OF {s.sandType.toUpperCase()}
                  </div>
                  <div className="text-xs text-[#9aa3ad] mt-0.5">
                    Stage requires {formatLbs(s.requiredForStage)}, but only {formatLbs(s.availableInActiveSilos)} available in online silos on location!
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* READ-ONLY HIGH-CONTRAST PULL SHEET CARD */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 sm:p-6 shadow-xl space-y-6 print:border-2 print:border-slate-800 print:bg-white print:p-0">
        
        {/* HEADER SECTION */}
        <div className="border-b border-[#2a313b] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 page-break-inside-avoid">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#9aa3ad] flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#8fa37a]" /> OFFICIAL STAGE PULL SHEET
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-display uppercase tracking-tight text-[#e8ebe6] mt-0.5">
              {state.config.padName}
            </h1>
            <div className="text-base sm:text-lg font-bold tracking-wide mt-1.5 uppercase flex flex-wrap items-center gap-2 font-mono">
              <span className="text-[#9aa3ad]">WELL: {activeWell.name}</span>
              <span className="text-[#2a313b]">•</span>
              <span className="bg-[#c23b32] text-[#e8ebe6] px-3 py-0.5 rounded-md font-bold font-mono text-sm sm:text-base border border-[#e25a4a]/40 shadow-sm inline-flex items-center">
                STAGE #{stageNumber}
              </span>
            </div>
            {hasManualOrder && (
              <div className="text-[10px] font-semibold uppercase text-[#5b7c99] tracking-wider flex items-center gap-1.5 mt-2 bg-[#0b0c0e] border border-[#5b7c99]/40 px-2.5 py-0.5 rounded-md w-fit">
                <Lock className="w-3 h-3 text-[#5b7c99]" />
                Run order was set manually
              </div>
            )}
          </div>

          <div className="text-left sm:text-right bg-[#0b0c0e] border border-[#2a313b] px-3 py-2 rounded-lg shrink-0">
            <div className="text-[10px] font-semibold uppercase text-[#9aa3ad]">
              DATE GENERATED
            </div>
            <div className="text-xs sm:text-sm font-mono text-[#e8ebe6] flex items-center gap-1.5 sm:justify-end mt-0.5">
              <Calendar className="w-3.5 h-3.5 text-[#9aa3ad]" />
              {dateGenerated}
            </div>
          </div>
        </div>

        {/* 1. THE PAD LAYOUT SCHEMATIC DIAGRAM */}
        <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3 sm:p-4 space-y-3 page-break-inside-avoid">
          <div className="flex items-center justify-between border-b border-[#2a313b] pb-2">
            <div>
              <h2 className="text-sm font-bold font-display uppercase text-[#e8ebe6] tracking-wide flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#8fa37a]" /> STAGE SCHEMATIC & PAD LAYOUT
              </h2>
              <p className="text-xs text-[#9aa3ad]">
                Physical silo orientation and pull sequence
              </p>
            </div>
            <div className="text-right font-mono text-[11px] font-semibold text-[#9aa3ad]">
              SIDE A ◄ ➔ SIDE B
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
            {/* LEFT COLUMN: SIDE A SILOS */}
            <div className="md:col-span-5 space-y-2">
              <div className="text-[10px] font-bold uppercase text-[#9aa3ad] tracking-wider text-center bg-[#14171c] py-1 rounded-md border border-[#2a313b]">
                A SIDE SILOS
              </div>
              {sideASilos.map((silo) => renderSiloBox(silo, 'A'))}
            </div>

            {/* MIDDLE COLUMN: SAND CONVEYOR */}
            <div className="md:col-span-1 flex flex-col items-center justify-center py-3 bg-[#14171c] border border-[#2a313b] rounded-lg p-2 text-center h-full min-h-[120px]">
              <div className="w-7 h-7 rounded-full bg-[#c23b32] text-[#e8ebe6] font-bold flex items-center justify-center shadow mb-1.5 shrink-0">
                <Workflow className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
              <div className="text-[10px] font-bold uppercase tracking-tight text-[#9aa3ad] font-mono text-center">
                SAND CONVEYOR
              </div>
              <div className="text-[9px] font-mono font-semibold text-[#8fa37a] mt-1.5 bg-[#0b0c0e] px-1.5 py-0.5 rounded border border-[#2a313b]">
                DOWNHOLE
              </div>
            </div>

            {/* RIGHT COLUMN: SIDE B SILOS */}
            <div className="md:col-span-5 space-y-2">
              <div className="text-[10px] font-bold uppercase text-[#9aa3ad] tracking-wider text-center bg-[#14171c] py-1 rounded-md border border-[#2a313b]">
                B SIDE SILOS
              </div>
              {sideBSilos.map((silo) => renderSiloBox(silo, 'B'))}
            </div>
          </div>
        </div>

        {/* 2. PULL TABLE SECTION */}
        <div className="space-y-3 page-break-inside-avoid">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold font-display uppercase tracking-tight text-[#e8ebe6] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#8fa37a]" />
              SILO PULL SEQUENCE ({pullItems.length} {pullItems.length === 1 ? 'SILO' : 'SILOS'})
            </h2>
            <span className="text-xs font-mono text-[#9aa3ad]">
              Run Order Sequence
            </span>
          </div>

          {pullItems.length === 0 ? (
            <div className="bg-[#0b0c0e] border border-dashed border-[#2a313b] rounded-xl p-8 text-center text-[#9aa3ad]">
              <Boxes className="w-8 h-8 mx-auto text-[#9aa3ad]/50 mb-2" />
              <div className="text-sm font-bold uppercase text-[#e8ebe6]">NO SAND PLANNED FOR THIS STAGE</div>
              <p className="text-xs text-[#9aa3ad] mt-1">
                Confirm stage design specs or verify stage number.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#2a313b] bg-[#0b0c0e]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#14171c] border-b border-[#2a313b] text-[10px] font-bold uppercase text-[#9aa3ad] tracking-wider">
                    <th className="p-2.5 text-center">Order</th>
                    <th className="p-2.5">Silo</th>
                    <th className="p-2.5">Sand</th>
                    <th className="p-2.5 text-right">Starting (lbs)</th>
                    <th className="p-2.5 text-right font-bold text-[#d4a017] text-xs">PULL (LBS)</th>
                    <th className="p-2.5 text-right">Pull (tons)</th>
                    <th className="p-2.5 text-right font-bold text-[#8fa37a] text-xs">ENDING (LBS)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a313b]/60">
                  {pullItems.map((item, index) => (
                    <tr
                      key={item.siloNumber}
                      className={`hover:bg-[#14171c]/60 transition ${
                        item.runsDry ? 'bg-[#260e0c]/30' : ''
                      }`}
                    >
                      {/* Order */}
                      <td className="p-2.5 text-center">
                        <span className="px-2 py-0.5 rounded bg-[#260e0c] text-[#e25a4a] border border-[#c23b32]/60 font-mono font-bold text-xs inline-block">
                          #{item.runOrder ?? index + 1}
                        </span>
                      </td>

                      {/* Silo Number */}
                      <td className="p-2.5">
                        <div className="text-sm sm:text-base font-bold text-[#e8ebe6] font-mono tracking-tight whitespace-nowrap">
                          SILO #{item.siloNumber}
                        </div>
                        <div className="text-[10px] font-mono text-[#9aa3ad]">
                          Side {item.side}
                        </div>
                      </td>

                      {/* Sand Type */}
                      <td className="p-2.5">
                        <div className="text-xs font-semibold uppercase text-[#e8ebe6] whitespace-nowrap">
                          {item.sandTypeLabel}
                        </div>
                      </td>

                      {/* Starting (lbs) */}
                      <td className="p-2.5 text-right whitespace-nowrap">
                        <div className="text-sm font-mono text-[#9aa3ad]">
                          {formatLbsNumber(item.onHandLbs)} <span className="text-xs font-sans text-[#9aa3ad]/70">lbs</span>
                        </div>
                      </td>

                      {/* Pull (lbs) - Visual Focal Point */}
                      <td className="p-2.5 text-right whitespace-nowrap">
                        <div className="text-lg sm:text-xl font-bold text-[#d4a017] font-mono tracking-tight">
                          {formatLbsNumber(item.plannedPullLbs)} <span className="text-xs font-sans text-[#9aa3ad]">lbs</span>
                        </div>
                      </td>

                      {/* Pull (tons) */}
                      <td className="p-2.5 text-right whitespace-nowrap">
                        <div className="text-xs font-mono text-[#9aa3ad]">
                          {item.plannedPullTons.toFixed(1)} T
                        </div>
                      </td>

                      {/* Ending (lbs) */}
                      <td className="p-2.5 text-right whitespace-nowrap">
                        <div
                          className={`text-sm font-mono font-semibold ${
                            item.runsDry ? 'text-[#e25a4a] font-bold' : 'text-[#8fa37a]'
                          }`}
                        >
                          {formatLbsNumber(item.onHandAfterLbs)} {item.runsDry ? '' : <span className="text-xs font-sans text-[#9aa3ad]">lbs</span>}
                        </div>
                        {item.runsDry && (
                          <div className="bg-[#260e0c] text-[#e25a4a] border border-[#c23b32] px-1.5 py-0.5 rounded text-[9px] uppercase font-mono inline-flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> RUNS DRY
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* TOTAL ROW */}
                <tfoot>
                  <tr className="bg-[#14171c] border-t-2 border-[#2a313b] text-[#e8ebe6]">
                    <td colSpan={3} className="p-3 font-bold uppercase text-xs text-[#9aa3ad] tracking-wider">
                      TOTAL STAGE PULL
                    </td>
                    <td className="p-3 text-right font-mono text-sm text-[#9aa3ad]">
                      {formatLbsNumber(stageTotalStartingLbs)} <span className="text-xs font-sans text-[#9aa3ad]/70">lbs</span>
                    </td>
                    <td className="p-3 text-right font-bold text-xl sm:text-2xl font-mono text-[#d4a017] tracking-tight">
                      {formatLbsNumber(stageTotalPullLbs)} <span className="text-xs font-sans text-[#9aa3ad]">lbs</span>
                    </td>
                    <td className="p-3 text-right font-mono text-xs text-[#9aa3ad]">
                      {stageTotalPullTons.toFixed(1)} Tons
                    </td>
                    <td className="p-3 text-right font-bold text-sm font-mono text-[#8fa37a]">
                      {formatLbsNumber(stageTotalEndingLbs)} <span className="text-xs font-sans text-[#9aa3ad]">lbs</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* 3. THREE SUMMARY STRIPS */}
        <div className="space-y-4 pt-2">
          
          {/* STRIP 1: THIS STAGE */}
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 sm:p-5 space-y-3 page-break-inside-avoid summary-strip shadow-md">
            <div className="text-xs font-bold uppercase tracking-wider text-[#9aa3ad] flex items-center gap-2 font-display">
              <span className="w-5 h-5 rounded bg-[#1b2027] text-[#e8ebe6] border border-[#2a313b] text-[10px] font-bold flex items-center justify-center">1</span>
              THIS STAGE DOWNHOLE REQUIREMENT
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {thisStageSandTotals.map((st) => (
                <div key={st.sandType} className="bg-[#0b0c0e] border border-[#2a313b] p-3 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase text-[#9aa3ad]">{st.sandType}</div>
                    <div className="text-xl sm:text-2xl font-bold font-mono text-[#e8ebe6] mt-0.5">
                      {formatLbsNumber(st.pulledLbs)} <span className="text-xs font-sans text-[#9aa3ad]">lbs</span>
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs sm:text-sm font-bold text-[#9aa3ad]">
                    {st.pulledTons.toFixed(1)} Tons
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* STRIP 2: RUNS DRY - RELOAD AFTER THIS STAGE */}
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 sm:p-5 space-y-3 page-break-inside-avoid summary-strip shadow-md">
            <div className="text-xs font-bold uppercase tracking-wider text-[#e25a4a] flex items-center gap-2 font-display">
              <span className="w-5 h-5 rounded bg-[#260e0c] text-[#e25a4a] border border-[#c23b32] text-[10px] font-bold flex items-center justify-center">2</span>
              RUNS DRY - RELOAD AFTER THIS STAGE
            </div>

            {dryCans.length > 0 ? (
              <div className="bg-[#260e0c] border border-[#c23b32] rounded-lg p-3 space-y-2">
                <div className="text-xs font-bold uppercase text-[#e25a4a]">
                  THE FOLLOWING SILOS END AT ZERO AND REQUIRE RELOADING:
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {dryCans.map((c) => (
                    <span
                      key={c.siloNumber}
                      className="bg-[#c23b32] text-[#e8ebe6] font-bold text-xs sm:text-sm px-3 py-1.5 rounded-md border border-[#e25a4a]/40 flex items-center gap-1.5 font-mono shadow-sm"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      SILO #{c.siloNumber} ({c.sandTypeLabel})
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-[#0b0c0e] border border-[#2a313b] p-3 rounded-lg text-xs font-semibold text-[#8fa37a] uppercase flex items-center gap-2">
                <Check className="w-4 h-4 text-[#8fa37a] stroke-[2.5] shrink-0" />
                NONE — All silos have remaining sand balance after this stage.
              </div>
            )}
          </div>

          {/* STRIP 3: ON LOCATION AFTER THIS STAGE */}
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 sm:p-5 space-y-3 page-break-inside-avoid summary-strip shadow-md">
            <div className="text-xs font-bold uppercase tracking-wider text-[#8fa37a] flex items-center gap-2 font-display">
              <span className="w-5 h-5 rounded bg-[#141e17] text-[#8fa37a] border border-[#8fa37a]/40 text-[10px] font-bold flex items-center justify-center">3</span>
              ON LOCATION AFTER THIS STAGE
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              {postStageBalances.map((b) => (
                <div key={b.sandType} className="bg-[#0b0c0e] border border-[#2a313b] p-3 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase text-[#9aa3ad]">{b.sandType} REMAINING</div>
                    <div className="text-lg sm:text-xl font-bold font-mono text-[#e8ebe6] mt-0.5">
                      {formatLbsNumber(b.remainingOnHandLbs)} <span className="text-xs font-sans text-[#9aa3ad]">lbs</span>
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs font-medium text-[#8fa37a]">
                    {b.remainingOnHandTons.toFixed(1)} Tons
                  </div>
                </div>
              ))}

              <div className="bg-[#1b2027] border border-[#2a313b] p-3 rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase text-[#9aa3ad]">TOTAL PAD REMAINING</div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-[#8fa37a] mt-0.5">
                    {formatLbsNumber(totalPostStageOnHandLbs)} <span className="text-xs font-sans text-[#9aa3ad]">lbs</span>
                  </div>
                </div>
                <div className="text-right font-mono text-xs font-bold text-[#e8ebe6]">
                  {totalPostStageOnHandTons.toFixed(1)} Tons
                </div>
              </div>
            </div>
          </div>

          {/* PREVIOUS STAGE TOTALS SUMMARY VIEW */}
          {prevStageNumber && (
            <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 space-y-3 page-break-inside-avoid summary-strip shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2a313b] pb-2">
                <div className="text-xs font-bold uppercase tracking-wider text-[#9aa3ad] flex items-center gap-2 font-mono">
                  <div className="w-5 h-5 rounded bg-[#1b2027] text-[#9aa3ad] border border-[#2a313b] flex items-center justify-center">
                    <History className="w-3.5 h-3.5" />
                  </div>
                  <span>PREVIOUS STAGE #{prevStageNumber} TOTALS ({activeWell.name})</span>
                </div>
                <span className="text-[10px] font-semibold text-[#9aa3ad] uppercase">
                  Prior Stage Reference
                </span>
              </div>

              {prevStageRuns.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Overall Previous Pulled Total */}
                    <div className="bg-[#0b0c0e] border border-[#2a313b] p-3 rounded-lg flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold uppercase text-[#9aa3ad]">TOTAL PREV STAGE PULL</div>
                        <div className="text-lg sm:text-xl font-bold font-mono text-[#e8ebe6] mt-0.5">
                          {formatLbsNumber(prevStageTotalPulledLbs)} <span className="text-xs font-sans text-[#9aa3ad]">lbs</span>
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs font-bold text-[#9aa3ad]">
                        {prevStageTotalPulledTons.toFixed(1)} Tons
                      </div>
                    </div>

                    {/* Per-Sand Type Breakdowns */}
                    {prevStageBySandType.map((st) => (
                      <div key={st.sandType} className="bg-[#0b0c0e] border border-[#2a313b] p-3 rounded-lg flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-bold uppercase text-[#9aa3ad]">{st.sandType} PULLED</div>
                          <div className="text-lg sm:text-xl font-bold font-mono text-[#e8ebe6] mt-0.5">
                            {formatLbsNumber(st.pulledLbs)} <span className="text-xs font-sans text-[#9aa3ad]">lbs</span>
                          </div>
                        </div>
                        <div className="text-right font-mono text-xs font-medium text-[#9aa3ad]">
                          {st.pulledTons.toFixed(1)} Tons
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Silo by Silo Run Order from Prev Stage */}
                  <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#9aa3ad] mb-2">
                      SILO BREAKDOWN (STAGE #{prevStageNumber})
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {prevStageBySilo.map((s) => (
                        <div
                          key={`${s.siloNumber}-${s.sandType}-${s.order}`}
                          className="bg-[#14171c] border border-[#2a313b] px-3 py-1.5 rounded-md flex items-center gap-2 font-mono text-xs"
                        >
                          <span className="text-[#c23b32] font-bold">#{s.order} SILO {s.siloNumber}</span>
                          <span className="text-[#9aa3ad]">({s.sandType})</span>
                          <span className="font-bold text-[#e8ebe6]">{formatLbsNumber(s.lbsPulled)} lbs</span>
                          <span className="text-[#9aa3ad]">({s.tonsPulled.toFixed(1)}t)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-[#9aa3ad]">
                    <span className="w-2 h-2 rounded-full bg-[#9aa3ad]"></span>
                    <span>No recorded runs logged for <strong>{activeWell.name} Stage #{prevStageNumber}</strong> in the run log yet.</span>
                  </div>
                  <span className="text-[10px] text-[#9aa3ad] italic">Stage #1 or pending completion</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RECORD RUN PRIMARY ACTION BUTTON */}
        {!isPinned && onRecordRun && (
          <div className="pt-2 pb-1 print:hidden">
            <button
              type="button"
              onClick={() => setIsRecordRunModalOpen(true)}
              className="w-full bg-[#c23b32] hover:bg-[#e25a4a] active:bg-[#a63028] text-[#e8ebe6] font-bold text-base sm:text-lg px-6 py-3.5 rounded-xl shadow-lg border border-[#e25a4a]/40 transition flex items-center justify-center gap-2.5 uppercase tracking-wide cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              <span>RECORD RUN — {activeWell?.name || 'WELL'} STAGE {stageNumber}</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        )}

        {/* 4. BLANK FIELD NOTES BOX FOR HANDWRITTEN SIGN-OFF */}
        <div className="bg-[#14171c] border border-dashed border-[#2a313b] rounded-xl p-4 sm:p-5 space-y-2.5 page-break-inside-avoid shadow-md">
          <div className="text-xs font-bold uppercase tracking-wider text-[#9aa3ad] flex items-center gap-2 font-display">
            <FileText className="w-4 h-4 text-[#8fa37a]" />
            FIELD NOTES & OPERATOR SIGN-OFF
          </div>
          <div className="border border-dashed border-[#2a313b] rounded-lg p-4 min-h-[90px] flex items-start bg-[#0b0c0e]/40">
            <div className="text-xs text-[#9aa3ad] italic font-medium">
              Handwritten notes, stage deviations, or supervisor sign-off...
            </div>
          </div>
        </div>

        {/* FOOTER LINE */}
        <div className="border-t border-[#2a313b] pt-4 text-center page-break-inside-avoid">
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-3 text-[#9aa3ad] text-xs font-mono uppercase tracking-wider shadow-sm">
            "Pull silos in order shown. Run each silo dry before moving to the next."
          </div>
        </div>

      </div>
      </div>

      {/* RECORD RUN MODAL DIALOG */}
      {isRecordRunModalOpen && onRecordRun && (
        <RecordPullConfirmModal
          isOpen={isRecordRunModalOpen}
          onClose={() => setIsRecordRunModalOpen(false)}
          state={state}
          wellId={activeWell.id}
          stageNumber={stageNumber}
          onRecordRun={async (records, options) => {
            await onRecordRun(records, options);
          }}
          onSuccess={() => {
            setIsRecordRunModalOpen(false);
            setIsManuallyOverridden(false);
            if (onSuccessMessage) {
              onSuccessMessage(`Stage #${stageNumber} pull successfully logged!`);
            }
            const next = getNextWellAndStage(state, activeWell.id);
            if (next) {
              setSelectedWellId(next.wellId);
              setStageNumber(next.stageNumber);
            }
          }}
        />
      )}
    </div>
  );
}
