import {
  ArrowUpDown,
  ArrowRight,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Gauge,
  Sliders,
  FileText,
  Share2,
  Check,
  Lock,
  RotateCcw,
} from 'lucide-react';
import { useState } from 'react';
import SetRunOrderModal from './SetRunOrderModal';
import HopperField from './HopperField';
import { formatLbs, formatTons, formatTruckloads, getPadSummary, getSiloDerivedStates } from '../lib/sandRules';
import { AppState, SiloDerivedState } from '../types';

interface SiloBoardProps {
  state: AppState;
  onChangeSiloSand: (siloNumber: number, sandType: string | null) => void;
  onChangeSiloPriority: (siloNumber: number, priority: number | null) => void;
  onClearAllSiloPriorities?: () => void;
  onSetAllSiloPriorities?: (priorityMap: Record<number, number | null>) => void;
  onToggleSiloMaintenance: (siloNumber: number, isOutOfService: boolean) => void;
  onNavigateToDelivery?: (siloNumber?: number) => void;
  onNavigateToRun?: () => void;
  onNavigateToPullSheet?: () => void;
  onSuccessMessage?: (msg: string) => void;
}

export default function SiloBoard({
  state,
  onChangeSiloSand,
  onChangeSiloPriority,
  onClearAllSiloPriorities,
  onSetAllSiloPriorities,
  onToggleSiloMaintenance,
  onNavigateToDelivery,
  onNavigateToRun,
  onNavigateToPullSheet,
  onSuccessMessage,
}: SiloBoardProps) {
  const padSummary = getPadSummary(state);

  // State for optional Stage Lbs Override ("Need This Stage" custom requirement)
  const [stageLbsOverride, setStageLbsOverride] = useState<number | undefined>(undefined);
  const [selectedSiloForSandChange, setSelectedSiloForSandChange] = useState<number | null>(null);
  const [isReorderModalOpen, setIsReorderModalOpen] = useState<boolean>(false);
  const [copiedShareLink, setCopiedShareLink] = useState<boolean>(false);
  const [selectedSiloNumber, setSelectedSiloNumber] = useState<number | null>(null);

  const handleSharePullSheet = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const shareUrl = `${origin}${pathname}?pad=${encodeURIComponent(state.padId)}&well=${encodeURIComponent(padSummary.activeWellId)}&stage=${padSummary.nextStageNumber}`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      if (onSuccessMessage) {
        onSuccessMessage(`Stage Pull Sheet link copied for ${padSummary.nextWellName} Stage #${padSummary.nextStageNumber}!`);
      }
      setTimeout(() => setCopiedShareLink(false), 3000);
    } catch (err) {
      console.error('Failed to copy share link:', err);
    }
  };

  const activeWell = state.config.wells[0];

  const siloStates = getSiloDerivedStates(
    state,
    activeWell?.id,
    padSummary.nextStageNumber,
    stageLbsOverride
  );

  // Overrides tracking
  const lockedSilos = state.config.silos.filter(
    (s) => s.manualPriority !== null && s.manualPriority !== undefined
  );
  const hasActiveOverrides = lockedSilos.length > 0;

  // Duplicate priority detection per sand type (flags in red if two online silos share same manualPriority)
  const duplicateLockedSilos = new Set<number>();
  const priorityCountsBySandType = new Map<string, Map<number, number[]>>();

  siloStates.forEach((s) => {
    if (s.manualPriority !== null && s.manualPriority !== undefined && !s.isOutOfService) {
      const sType = s.sandType || 'UNASSIGNED';
      if (!priorityCountsBySandType.has(sType)) {
        priorityCountsBySandType.set(sType, new Map());
      }
      const map = priorityCountsBySandType.get(sType)!;
      const list = map.get(s.manualPriority) || [];
      list.push(s.siloNumber);
      map.set(s.manualPriority, list);
    }
  });

  priorityCountsBySandType.forEach((priorityMap) => {
    priorityMap.forEach((siloList) => {
      if (siloList.length > 1) {
        siloList.forEach((num) => duplicateLockedSilos.add(num));
      }
    });
  });

  const handleClearAllOverrides = () => {
    if (onClearAllSiloPriorities) {
      onClearAllSiloPriorities();
    } else {
      lockedSilos.forEach((s) => onChangeSiloPriority(s.siloNumber, null));
    }
  };

  const handleSaveWholeOrder = (priorityMap: Record<number, number | null>) => {
    if (onSetAllSiloPriorities) {
      onSetAllSiloPriorities(priorityMap);
    } else {
      Object.entries(priorityMap).forEach(([siloNumStr, prio]) => {
        onChangeSiloPriority(Number(siloNumStr), prio);
      });
    }
  };

  // Group silos dynamically by Side
  const uniqueSides = Array.from(new Set(siloStates.map((s) => (s.side || 'A').trim())));
  const silosBySide = uniqueSides.map((sideName) => ({
    sideName,
    silos: siloStates.filter((s) => (s.side || 'A').trim() === sideName),
  }));

  // Helper for Card Color styling based on Sand Type and Status
  const getCardStyle = (sDerived: SiloDerivedState) => {
    if (sDerived.isOutOfService) {
      return {
        bg: 'bg-[#14171c]/70',
        border: 'border-[#2a313b]',
        badgeBg: 'bg-[#1b2027] text-[#9aa3ad]',
        textAccent: 'text-[#9aa3ad]',
        headerBg: 'bg-[#1b2027] text-[#9aa3ad] border-[#2a313b]',
        barColor: 'bg-[#9aa3ad]',
      };
    }

    if (sDerived.isNegative) {
      return {
        bg: 'bg-[#1b2027]',
        border: 'border-[#c23b32]',
        badgeBg: 'bg-[#c23b32] text-[#e8ebe6] font-semibold',
        textAccent: 'text-[#e25a4a]',
        headerBg: 'bg-[#260e0c] text-[#e25a4a] border-[#c23b32]/40',
        barColor: 'bg-[#c23b32]',
      };
    }

    if (sDerived.status === 'EMPTY' || !sDerived.sandType) {
      return {
        bg: 'bg-[#14171c]',
        border: 'border-[#2a313b]',
        badgeBg: 'bg-[#1b2027] text-[#9aa3ad]',
        textAccent: 'text-[#9aa3ad]',
        headerBg: 'bg-[#1b2027] text-[#9aa3ad] border-[#2a313b]',
        barColor: 'bg-[#9aa3ad]',
      };
    }

    const sandNameLower = sDerived.sandType.toLowerCase();

    if (sandNameLower.includes('100')) {
      return {
        bg: 'bg-[#14171c]',
        border: 'border-[#2a313b] hover:border-[#d4a017]/50',
        badgeBg: 'bg-[#1b2027] text-[#d4a017] font-semibold border border-[#d4a017]/50',
        textAccent: 'text-[#d4a017]',
        headerBg: 'bg-[#1b2027] text-[#d4a017] border-[#d4a017]/40',
        barColor: 'bg-[#d4a017]',
      };
    }

    if (sandNameLower.includes('40/70') || sandNameLower.includes('40')) {
      return {
        bg: 'bg-[#14171c]',
        border: 'border-[#2a313b] hover:border-[#5b7c99]/50',
        badgeBg: 'bg-[#1b2027] text-[#5b7c99] font-semibold border border-[#5b7c99]/50',
        textAccent: 'text-[#5b7c99]',
        headerBg: 'bg-[#1b2027] text-[#5b7c99] border-[#5b7c99]/40',
        barColor: 'bg-[#5b7c99]',
      };
    }

    return {
      bg: 'bg-[#14171c]',
      border: 'border-[#2a313b] hover:border-[#8fa37a]/50',
      badgeBg: 'bg-[#1b2027] text-[#8fa37a] font-semibold border border-[#8fa37a]/50',
      textAccent: 'text-[#8fa37a]',
      headerBg: 'bg-[#1b2027] text-[#8fa37a] border-[#8fa37a]/40',
      barColor: 'bg-[#8fa37a]',
    };
  };

  return (
    <div className="space-y-4 pb-12">
      {/* 1. WARN WHEN OVERRIDES ARE ACTIVE BANNER */}
      {hasActiveOverrides && (
        <div className="bg-[#1b2027] border border-[#d4a017]/70 rounded-xl p-3.5 sm:p-4 text-[#e8ebe6] shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-[#d4a017]/20 text-[#d4a017] p-2 rounded-lg shrink-0 border border-[#d4a017]/40">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-[#d4a017] tracking-wider flex items-center gap-2">
                <span>MANUAL RUN-ORDER OVERRIDES ACTIVE</span>
                <span className="bg-[#14171c] text-[#d4a017] px-2 py-0.5 rounded text-[10px] border border-[#d4a017]/40 font-mono">
                  {lockedSilos.length} PINNED
                </span>
              </div>
              <div className="text-xs sm:text-sm text-[#9aa3ad] mt-0.5">
                Run order is locked on {lockedSilos.length} silo{lockedSilos.length === 1 ? '' : 's'} — automated rotation is bypassed for those units.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearAllOverrides}
            className="bg-[#14171c] hover:bg-[#1b2027] text-[#d4a017] border border-[#d4a017]/50 font-medium text-xs px-3.5 py-2 rounded-lg transition shrink-0 uppercase tracking-wider flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Clear Overrides
          </button>
        </div>
      )}

      {/* Reorder Threshold Alert Banner */}
      {padSummary.hasReorderAlert && (
        <div className="bg-[#260e0c] border border-[#c23b32] rounded-xl p-3.5 sm:p-4 text-[#e8ebe6] shadow-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-[#c23b32]/20 text-[#e25a4a] p-2 rounded-lg shrink-0 border border-[#c23b32]/40">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-[#e25a4a] tracking-wider">
                REORDER ALERT THRESHOLD REACHED
              </div>
              <div className="text-xs sm:text-sm text-[#9aa3ad] mt-0.5">
                One or more sand types have dropped below the {state.config.reorderThresholdStages || 5}-stage pad reserve threshold.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-mono uppercase tracking-widest text-[#9aa3ad]">
              {padSummary.nextWellName} · Stage {padSummary.nextStageNumber}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleSharePullSheet} className="text-xs font-mono text-[#9aa3ad] border border-[#2a313b] px-2 py-1 rounded">{copiedShareLink ? 'Copied' : 'Share'}</button>
              {onNavigateToPullSheet && <button type="button" onClick={onNavigateToPullSheet} className="text-xs font-mono text-[#e8ebe6] border border-[#2a313b] px-2 py-1 rounded">Pull sheet</button>}
              <button type="button" onClick={() => setIsReorderModalOpen(true)} className="text-xs font-mono text-[#d4a017] border border-[#2a313b] px-2 py-1 rounded">Run order</button>
            </div>
          </div>
          <HopperField
            sides={silosBySide}
            selectedSilo={selectedSiloNumber ?? siloStates[0]?.siloNumber}
            onSelect={setSelectedSiloNumber}
          />
        </div>
        {(() => {
          const selected = siloStates.find((s) => s.siloNumber === (selectedSiloNumber ?? siloStates[0]?.siloNumber));
          if (!selected) return <aside className="text-sm text-[#9aa3ad]">No silos.</aside>;
          const fill = Math.max(0, Math.min(100, selected.percentFull || 0));
          return (
            <aside className="border border-cyan-500/30 bg-[#070b12] p-4 sm:p-5 shadow-[0_0_40px_rgba(34,211,238,0.06)] space-y-4 xl:sticky xl:top-24">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-widest text-cyan-400">Detail</div>
                  <h2 className="text-2xl font-bold font-display tracking-wide text-cyan-200">Silo #{selected.siloNumber}</h2>
                  <div className="text-xs text-slate-400 mt-1 font-mono">Side {selected.side || 'A'} · {selected.isOutOfService ? 'Offline' : 'Online'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleSiloMaintenance(selected.siloNumber, !selected.isOutOfService)}
                  className={`text-[10px] uppercase font-mono tracking-wider px-2.5 py-1 border transition ${
                    selected.isOutOfService
                      ? 'border-fuchsia-400 text-fuchsia-200 bg-fuchsia-500/10'
                      : 'border-cyan-500/30 text-cyan-300 bg-black hover:border-cyan-400'
                  }`}
                >
                  <Wrench className="w-3 h-3 inline mr-1" />
                  {selected.isOutOfService ? 'Offline' : 'Online'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSiloForSandChange(selected.siloNumber)}
                className="w-full text-left bg-[#0b1220] border border-cyan-500/30 px-3 py-2 hover:border-cyan-300 transition"
              >
                <div className="text-[10px] font-mono uppercase text-cyan-400">Mesh</div>
                <div className="text-sm font-mono font-bold text-cyan-100">{selected.sandType || 'No sand assigned'}</div>
              </button>

              <div>
                <div className="text-[10px] font-mono uppercase text-cyan-400">On hand</div>
                <div className="text-4xl font-mono font-semibold tracking-tight text-fuchsia-200">{formatLbs(selected.onHandLbs)}</div>
                <div className="text-xs text-slate-400 font-mono">{formatTons(selected.onHandTons)}</div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[10px] font-mono uppercase text-cyan-400">
                  <span>Capacity</span>
                  <span className="text-cyan-200 font-bold">{fill.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-2 bg-[#0b1220] border border-cyan-500/30 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-400 shadow-[0_0_12px_rgba(217,70,239,0.5)]" style={{ width: `${fill}%` }} />
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">of {formatLbs(selected.maxCapacityLbs)}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-[#0b1220] border border-cyan-500/20 px-3 py-2">
                  <div className="text-[10px] uppercase font-mono text-cyan-400">Run order</div>
                  <div className="font-mono text-cyan-100 font-bold">{selected.runOrder ?? 'Auto'}</div>
                </div>
                <div className="bg-[#0b1220] border border-cyan-500/20 px-3 py-2">
                  <div className="text-[10px] uppercase font-mono text-cyan-400">Planned pull</div>
                  <div className="font-mono text-cyan-100 font-bold">{formatLbs(selected.plannedPullLbs)}</div>
                </div>
                <div className="bg-[#0b1220] border border-cyan-500/20 px-3 py-2 col-span-2">
                  <div className="text-[10px] uppercase font-mono text-cyan-400">Stages left in silo</div>
                  <div className="font-mono text-fuchsia-300 font-bold">{selected.stagesLeft.toFixed(2)}</div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                {onNavigateToDelivery && (
                  <button
                    type="button"
                    onClick={() => onNavigateToDelivery(selected.siloNumber)}
                    className="border border-fuchsia-400 bg-fuchsia-500 hover:bg-fuchsia-400 text-black font-mono font-bold text-xs uppercase tracking-widest px-3 py-2.5 shadow-[0_0_20px_rgba(217,70,239,0.35)] transition cursor-pointer"
                  >
                    Ticket entry
                  </button>
                )}
                {onNavigateToRun && (
                  <button
                    type="button"
                    onClick={onNavigateToRun}
                    className="bg-black hover:bg-[#0b1220] text-cyan-200 hover:text-cyan-100 font-mono text-xs uppercase tracking-widest px-3 py-2 border border-cyan-500/30 transition cursor-pointer"
                  >
                    Record run
                  </button>
                )}
              </div>
            </aside>
          );
        })()}
      </div>

      {/* Sand Assignment Modal */}
      {selectedSiloForSandChange !== null && (
        <div className="fixed inset-0 bg-[#0b0c0e]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl max-w-md w-full p-5 text-[#e8ebe6] shadow-2xl">
            <h3 className="text-lg font-bold text-[#e8ebe6] mb-1 font-display tracking-wide">
              ASSIGN SILO #{selectedSiloForSandChange} SAND
            </h3>
            <p className="text-xs text-[#9aa3ad] mb-4">
              Set or change which sand type this silo holds.
            </p>

            <div className="space-y-2 mb-5">
              {state.config.sandTypes.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    onChangeSiloSand(selectedSiloForSandChange, st.name);
                    setSelectedSiloForSandChange(null);
                  }}
                  className="w-full text-left p-3 rounded-lg border border-[#2a313b] bg-[#1b2027] hover:bg-[#2a313b] active:bg-[#c23b32] text-[#e8ebe6] font-medium text-sm flex items-center justify-between transition"
                >
                  <span className="font-semibold">{st.name}</span>
                  <span className="text-xs text-[#9aa3ad] font-mono">
                    Design: {st.perStageDesignLbs.toLocaleString()} lbs
                  </span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  onChangeSiloSand(selectedSiloForSandChange, null);
                  setSelectedSiloForSandChange(null);
                }}
                className="w-full text-left p-2.5 rounded-lg border border-dashed border-[#2a313b] bg-[#0b0c0e] hover:bg-[#1b2027] text-[#9aa3ad] font-medium text-xs text-center transition"
              >
                Clear Sand Assignment (Empty)
              </button>
            </div>

            <div className="text-right">
              <button
                type="button"
                onClick={() => setSelectedSiloForSandChange(null)}
                className="bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] hover:text-[#e8ebe6] font-medium px-4 py-2 rounded-lg text-xs border border-[#2a313b]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Whole Order Drag-to-Reorder Modal */}
      <SetRunOrderModal
        isOpen={isReorderModalOpen}
        onClose={() => setIsReorderModalOpen(false)}
        state={state}
        siloStates={siloStates}
        onSaveOrders={handleSaveWholeOrder}
        onClearAllOverrides={handleClearAllOverrides}
      />
    </div>
  );
}
