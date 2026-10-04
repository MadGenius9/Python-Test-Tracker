import React, { useState, useEffect } from 'react';
import {
  Sliders,
  RotateCcw,
  Check,
  X,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Lock,
  Sparkles,
} from 'lucide-react';
import { AppState, SiloDerivedState } from '../types';
import { formatLbs } from '../lib/sandRules';

interface SetRunOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  siloStates: SiloDerivedState[];
  onSaveOrders: (priorityMap: Record<number, number | null>) => void;
  onClearAllOverrides: () => void;
}

export default function SetRunOrderModal({
  isOpen,
  onClose,
  state,
  siloStates,
  onSaveOrders,
  onClearAllOverrides,
}: SetRunOrderModalProps) {
  // Group active silos by Sand Type
  const sandTypes = state.config.sandTypes;
  const [selectedSandType, setSelectedSandType] = useState<string>(
    sandTypes[0]?.name || '100 Mesh'
  );

  // Maintain ordered list of siloNumbers for the active sand type
  const [orderedSiloNumbers, setOrderedSiloNumbers] = useState<number[]>([]);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Initialize or update ordered list whenever sandType or modal opens
  useEffect(() => {
    if (!isOpen) return;

    // Filter active silos for this sand type
    const matchingSilos = siloStates.filter(
      (s) => s.sandType === selectedSandType && !s.isOutOfService
    );

    // Sort by current computed runOrder, fallback to siloNumber
    const sorted = [...matchingSilos].sort((a, b) => {
      if (a.runOrder !== null && b.runOrder !== null) return a.runOrder - b.runOrder;
      if (a.runOrder !== null) return -1;
      if (b.runOrder !== null) return 1;
      return a.siloNumber - b.siloNumber;
    });

    setOrderedSiloNumbers(sorted.map((s) => s.siloNumber));
  }, [isOpen, selectedSandType, siloStates]);

  if (!isOpen) return null;

  const activeSilosMap = new Map(siloStates.map((s) => [s.siloNumber, s]));

  // Move item up in order
  const moveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...orderedSiloNumbers];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    setOrderedSiloNumbers(next);
  };

  // Move item down in order
  const moveDown = (index: number) => {
    if (index >= orderedSiloNumbers.length - 1) return;
    const next = [...orderedSiloNumbers];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    setOrderedSiloNumbers(next);
  };

  // Drag & drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIdx(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;

    const next = [...orderedSiloNumbers];
    const item = next.splice(draggedIdx, 1)[0];
    next.splice(index, 0, item);
    setDraggedIdx(index);
    setOrderedSiloNumbers(next);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  const handleSave = () => {
    const priorityMap: Record<number, number | null> = {};
    orderedSiloNumbers.forEach((siloNum, idx) => {
      priorityMap[siloNum] = idx + 1;
    });
    onSaveOrders(priorityMap);
    onClose();
  };

  const handleClearAll = () => {
    onClearAllOverrides();
    onClose();
  };

  const thresholdPct = state.config.partialThresholdPct ?? 0.75;
  const thresholdVal = thresholdPct > 1 ? thresholdPct / 100 : thresholdPct;

  return (
    <div className="fixed inset-0 bg-[#0b0c0e]/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl max-w-2xl w-full p-5 text-[#e8ebe6] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#2a313b] pb-3.5">
          <div className="flex items-center gap-3">
            <div className="bg-[#1b2027] text-[#8fa37a] p-2 rounded-lg shrink-0 border border-[#2a313b]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-[#e8ebe6] tracking-wide font-display">
                SET SILO RUN ORDER
              </h3>
              <p className="text-xs text-[#9aa3ad] mt-0.5">
                Drag rows or use the arrow buttons to arrange the exact sequence silos will be pulled from.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9aa3ad] hover:text-[#e8ebe6] p-1.5 rounded-lg hover:bg-[#1b2027] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sand Type Selector if multiple */}
        {sandTypes.length > 1 && (
          <div className="flex items-center gap-2 mt-3.5 pb-2 border-b border-[#2a313b] overflow-x-auto">
            <span className="text-xs font-semibold uppercase text-[#9aa3ad] shrink-0 font-mono">
              SAND TYPE:
            </span>
            {sandTypes.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedSandType(st.name)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase transition ${
                  selectedSandType === st.name
                    ? 'bg-[#c23b32] text-[#e8ebe6]'
                    : 'bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] hover:text-[#e8ebe6] border border-[#2a313b]'
                }`}
              >
                {st.name}
              </button>
            ))}
          </div>
        )}

        {/* Informational Sub-header */}
        <div className="mt-3.5 bg-[#1b2027] border border-[#2a313b] rounded-lg p-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#8fa37a] shrink-0" />
            <span className="text-[#9aa3ad]">
              Saving applies <strong className="text-[#e8ebe6]">Slot #1..#{orderedSiloNumbers.length}</strong> manual priorities for {selectedSandType}.
            </span>
          </div>
          <span className="bg-[#14171c] text-[#9aa3ad] text-[10px] font-mono px-2 py-0.5 rounded uppercase border border-[#2a313b]">
            {orderedSiloNumbers.length} Silos Active
          </span>
        </div>

        {/* Reorderable List */}
        <div className="mt-3.5 flex-1 overflow-y-auto space-y-2 pr-1">
          {orderedSiloNumbers.length === 0 ? (
            <div className="p-8 text-center text-[#9aa3ad] bg-[#0b0c0e] rounded-xl border border-dashed border-[#2a313b]">
              No online silos assigned to {selectedSandType}.
            </div>
          ) : (
            orderedSiloNumbers.map((siloNum, idx) => {
              const silo = activeSilosMap.get(siloNum);
              if (!silo) return null;

              const isPartial =
                silo.maxCapacityLbs > 0 &&
                silo.onHandLbs / silo.maxCapacityLbs < thresholdVal;

              const isDragging = draggedIdx === idx;

              return (
                <div
                  key={siloNum}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border transition select-none ${
                    isDragging
                      ? 'bg-[#1b2027] border-[#8fa37a] shadow-lg'
                      : 'bg-[#1b2027]/70 border-[#2a313b] hover:border-[#8fa37a]/50'
                  }`}
                >
                  {/* Position Badge & Drag Handle */}
                  <div className="flex items-center gap-2.5">
                    <div className="cursor-grab active:cursor-grabbing text-[#9aa3ad] hover:text-[#e8ebe6] p-1">
                      <GripVertical className="w-4 h-4" />
                    </div>

                    <div className="bg-[#14171c] text-[#8fa37a] border border-[#2a313b] font-bold font-mono w-8 h-8 rounded-lg flex items-center justify-center text-sm">
                      #{idx + 1}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#e8ebe6] uppercase text-sm font-mono">
                          SILO #{silo.siloNumber}
                        </span>
                        <span className="text-[10px] font-mono text-[#9aa3ad] uppercase bg-[#14171c] px-1.5 py-0.5 rounded border border-[#2a313b]">
                          SIDE {silo.side || 'A'}
                        </span>
                        {silo.manualPriority !== null && (
                          <span className="bg-[#14171c] text-[#d4a017] border border-[#d4a017]/40 text-[9px] font-mono uppercase px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5" /> PINNED
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs font-mono text-[#9aa3ad]">
                        <span className="text-[#e8ebe6] font-semibold">
                          {formatLbs(silo.onHandLbs)} on hand ({silo.percentFull.toFixed(0)}%)
                        </span>
                        {isPartial && (
                          <span className="text-[#d4a017] text-[10px] font-mono px-1.5 py-0.2 rounded uppercase border border-[#d4a017]/30 bg-[#14171c]">
                            Partial
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Up / Down Reorder Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveUp(idx)}
                      className="p-1.5 rounded-md bg-[#14171c] hover:bg-[#2a313b] disabled:opacity-30 disabled:cursor-not-allowed text-[#9aa3ad] hover:text-[#e8ebe6] border border-[#2a313b]"
                      title="Move Up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === orderedSiloNumbers.length - 1}
                      onClick={() => moveDown(idx)}
                      className="p-1.5 rounded-md bg-[#14171c] hover:bg-[#2a313b] disabled:opacity-30 disabled:cursor-not-allowed text-[#9aa3ad] hover:text-[#e8ebe6] border border-[#2a313b]"
                      title="Move Down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="mt-4 pt-3.5 border-t border-[#2a313b] flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleClearAll}
            className="w-full sm:w-auto bg-[#1b2027] hover:bg-[#14171c] text-[#9aa3ad] hover:text-[#e8ebe6] font-medium text-xs px-3.5 py-2 rounded-lg border border-[#2a313b] transition flex items-center justify-center gap-1.5 uppercase tracking-wider"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#8fa37a]" />
            Reset to Auto
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] hover:text-[#e8ebe6] font-medium px-4 py-2 rounded-lg text-xs border border-[#2a313b] flex-1 sm:flex-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={orderedSiloNumbers.length === 0}
              className="bg-[#c23b32] hover:bg-[#e25a4a] text-[#e8ebe6] font-semibold px-4 py-2 rounded-lg text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition flex-1 sm:flex-none disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              Save Run Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
