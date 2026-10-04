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

      {/* Pad map + selected silo rail */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="bg-[#101318] border border-[#2a313b] rounded-xl p-4 sm:p-5 shadow-lg min-w-0" style={{ backgroundImage: 'linear-gradient(rgba(42,49,59,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(42,49,59,0.35) 1px, transparent 1px)', backgroundSize: '28px 28px' }}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-[#d4a017]">
                {padSummary.padName} pad map
              </div>
              <div className="text-xs text-[#9aa3ad] mt-1">
                Next pull: {padSummary.nextWellName} · Stage {padSummary.nextStageNumber}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSharePullSheet}
                className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] border border-[#2a313b] font-medium text-xs px-3 py-2 rounded-lg transition flex items-center gap-1.5"
              >
                {copiedShareLink ? <Check className="w-3.5 h-3.5 text-[#8fa37a]" /> : <Share2 className="w-3.5 h-3.5 text-[#9aa3ad]" />}
                {copiedShareLink ? 'Copied' : 'Share'}
              </button>
              {onNavigateToPullSheet && (
                <button
                  type="button"
                  onClick={onNavigateToPullSheet}
                  className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] font-medium text-xs px-3 py-2 rounded-lg border border-[#2a313b] transition flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-[#9aa3ad]" /> Pull sheet
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsReorderModalOpen(true)}
                className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] border border-[#2a313b] font-medium text-xs px-3 py-2 rounded-lg transition flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5 text-[#d4a017]" /> Run order
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
                  <div className="text-[11px] font-mono uppercase tracking-widest text-[#9aa3ad] mb-3">{titleText}</div>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {sideSilos.map((silo) => {
                      const fill = Math.max(0, Math.min(100, silo.percentFull || 0));
                      const fillColor = silo.isOutOfService
                        ? '#2a313b'
                        : '#d4a017';
                      const isSelected = selectedSiloNumber === silo.siloNumber || (selectedSiloNumber === null && silo.siloNumber === siloStates[0]?.siloNumber);
                      return (
                        <button
                          key={silo.siloNumber}
                          type="button"
                          title={`Silo #${silo.siloNumber}: ${Math.round(silo.onHandLbs).toLocaleString()} lbs · ${silo.stagesLeft.toFixed(2)} stages left`}
                          onClick={() => setSelectedSiloNumber(silo.siloNumber)}
                          className={`group relative shrink-0 w-[132px] rounded-lg px-2 py-3 text-center transition ${
                            isSelected
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

                          <svg viewBox="0 0 120 210" className="mx-auto h-44 w-24">
                            <ellipse cx="60" cy="22" rx="34" ry="10" fill="#1b2027" stroke="#2a313b" />
                            <path d="M26 22 H94 V128 L78 168 H42 L26 128 Z" fill="#14171c" stroke="#2a313b" />
                            <clipPath id={`fill-${silo.siloNumber}`}>
                              <path d="M28 28 H92 V126 L77 164 H43 L28 126 Z" />
                            </clipPath>
                            <g clipPath={`url(#fill-${silo.siloNumber})`}>
                              <rect x="26" y={168 - fill * 1.36} width="68" height="150" fill={fillColor} opacity="0.9" />
                            </g>
                            <path d="M26 22 H94 V128 L78 168 H42 L26 128 Z" fill="none" stroke={isSelected ? '#c23b32' : '#3a4452'} strokeWidth={isSelected ? 3 : 1.5} />
                            <path d="M36 168 L30 196 M84 168 L90 196 M30 196 H90" fill="none" stroke="#2a313b" strokeWidth="3" />
                            {silo.runOrder !== null && !silo.isOutOfService && (
                              <g>
                                <circle cx="96" cy="48" r="12" fill="#d4a017" />
                                <text x="96" y="52" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0b0c0e">{silo.runOrder}</text>
                              </g>
                            )}
                            <text x="60" y="96" textAnchor="middle" fontSize="13" fill="#e8ebe6" fontFamily="IBM Plex Mono, monospace">{Math.round(fill)}%</text>
                          </svg>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-[#d4a017]">{silo.sandType || 'Empty'}</div>
                          <div className="mt-0.5 text-[11px] font-mono text-[#e8ebe6]">{Math.round(silo.onHandLbs).toLocaleString()} lbs</div>
                          <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-[#9aa3ad]">Silo {silo.siloNumber}</div>
                          {silo.plannedPullLbs <= 0 && !silo.isOutOfService && (
                            <div className="mt-1 text-[10px] font-semibold uppercase text-[#d4a017]">Low · no pull</div>
                          )}
                          {silo.isOutOfService && (
                            <div className="mt-1 text-[10px] font-semibold uppercase text-[#e25a4a]">Offline</div>
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

        {(() => {
          const selected = siloStates.find((s) => s.siloNumber === selectedSiloNumber) || siloStates[0];
          if (!selected) {
            return (
              <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 text-sm text-[#9aa3ad]">
                No silos configured.
              </div>
            );
          }
          const fill = Math.max(0, Math.min(100, selected.percentFull || 0));
          return (
            <aside className="bg-[#101318] border border-[#2a313b] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 xl:sticky xl:top-24">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-widest text-[#9aa3ad]">Detail</div>
                  <h2 className="text-2xl font-bold font-display tracking-wide text-[#e8ebe6]">Silo #{selected.siloNumber}</h2>
                  <div className="text-xs text-[#9aa3ad] mt-1">Side {selected.side || 'A'} · {selected.isOutOfService ? 'Offline' : 'Online'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleSiloMaintenance(selected.siloNumber, !selected.isOutOfService)}
                  className={`text-[10px] uppercase font-semibold px-2 py-1 rounded border ${
                    selected.isOutOfService
                      ? 'border-[#c23b32] text-[#e25a4a] bg-[#260e0c]'
                      : 'border-[#2a313b] text-[#9aa3ad] bg-[#1b2027]'
                  }`}
                >
                  <Wrench className="w-3 h-3 inline mr-1" />
                  {selected.isOutOfService ? 'Offline' : 'Online'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSiloForSandChange(selected.siloNumber)}
                className="w-full text-left bg-[#1b2027] border border-[#d4a017]/40 rounded-lg px-3 py-2"
              >
                <div className="text-[10px] font-mono uppercase text-[#9aa3ad]">Mesh</div>
                <div className="text-sm font-semibold text-[#d4a017]">{selected.sandType || 'No sand assigned'}</div>
              </button>

              <div>
                <div className="text-[10px] font-mono uppercase text-[#9aa3ad]">On hand</div>
                <div className="text-4xl font-mono font-semibold tracking-tight text-[#d4a017]">{formatLbs(selected.onHandLbs)}</div>
                <div className="text-xs text-[#9aa3ad] font-mono">{formatTons(selected.onHandTons)}</div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[#9aa3ad]">
                  <span>Capacity</span>
                  <span>{fill.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-[#0b0c0e] border border-[#2a313b] overflow-hidden">
                  <div className="h-full bg-[#d4a017]" style={{ width: `${fill}%` }} />
                </div>
                <div className="text-[11px] text-[#9aa3ad] mt-1 font-mono">of {formatLbs(selected.maxCapacityLbs)}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg px-3 py-2">
                  <div className="text-[10px] uppercase font-mono text-[#9aa3ad]">Run order</div>
                  <div className="font-mono text-[#e8ebe6]">{selected.runOrder ?? 'Auto'}</div>
                </div>
                <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg px-3 py-2">
                  <div className="text-[10px] uppercase font-mono text-[#9aa3ad]">Planned pull</div>
                  <div className="font-mono text-[#e8ebe6]">{formatLbs(selected.plannedPullLbs)}</div>
                </div>
                <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg px-3 py-2 col-span-2">
                  <div className="text-[10px] uppercase font-mono text-[#9aa3ad]">Stages left in silo</div>
                  <div className="font-mono text-[#e8ebe6]">{selected.stagesLeft.toFixed(2)}</div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {onNavigateToDelivery && (
                  <button
                    type="button"
                    onClick={() => onNavigateToDelivery(selected.siloNumber)}
                    className="bg-[#c23b32] hover:bg-[#e25a4a] text-[#e8ebe6] font-semibold text-sm px-3 py-2.5 rounded-lg"
                  >
                    Ticket entry
                  </button>
                )}
                {onNavigateToRun && (
                  <button
                    type="button"
                    onClick={onNavigateToRun}
                    className="bg-[#1b2027] border border-[#2a313b] text-[#e8ebe6] text-sm px-3 py-2.5 rounded-lg"
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
