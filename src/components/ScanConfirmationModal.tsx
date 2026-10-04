import React, { useState } from 'react';
import { AlertCircle, Check, Camera, Edit3, X, HelpCircle, ArrowRight, Layers } from 'lucide-react';
import { ParsedTicketScan, normalizeTicketNumber, validateTicketFields } from '../lib/ticketUtils';

interface ScanConfirmationModalProps {
  parsed: ParsedTicketScan;
  candidates?: ParsedTicketScan[];
  onConfirm: (confirmed: ParsedTicketScan) => void;
  onEdit: (current: ParsedTicketScan) => void;
  onRescan: () => void;
  onCancel: () => void;
}

export default function ScanConfirmationModal({
  parsed: initialParsed,
  candidates = [],
  onConfirm,
  onEdit,
  onRescan,
  onCancel,
}: ScanConfirmationModalProps) {
  const [selectedCandidate, setSelectedCandidate] = useState<ParsedTicketScan>(initialParsed);
  const [ticketInput, setTicketInput] = useState(selectedCandidate.ticketNumber || '');
  const [weightInput, setWeightInput] = useState(
    selectedCandidate.weightLbs ? String(selectedCandidate.weightLbs) : ''
  );

  const isMultipleCodes = candidates.length > 1;

  const currentParsed: ParsedTicketScan = {
    ...selectedCandidate,
    ticketNumber: ticketInput ? normalizeTicketNumber(ticketInput) : undefined,
    weightLbs: weightInput ? parseInt(weightInput.replace(/\D/g, ''), 10) : undefined,
  };

  const validation = validateTicketFields({
    ticketNumber: currentParsed.ticketNumber,
    weightLbs: currentParsed.weightLbs,
  });

  const handleSelectCandidate = (cand: ParsedTicketScan) => {
    setSelectedCandidate(cand);
    setTicketInput(cand.ticketNumber || '');
    setWeightInput(cand.weightLbs ? String(cand.weightLbs) : '');
  };

  const handleConfirm = () => {
    onConfirm(currentParsed);
  };

  return (
    <div
      className="fixed inset-0 bg-[#0b0c0e]/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-confirm-title"
    >
      <div className="bg-[#14171c] border border-[#2a313b] rounded-2xl max-w-lg w-full p-5 sm:p-6 text-[#e8ebe6] shadow-2xl space-y-4 relative animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2a313b]">
          <div className="flex items-center gap-3">
            <div className="bg-[#1b2027] text-[#e8ebe6] border border-[#2a313b] p-2.5 rounded-xl shrink-0">
              {isMultipleCodes ? (
                <Layers className="w-6 h-6 stroke-[2]" />
              ) : (
                <AlertCircle className="w-6 h-6 stroke-[2] text-[#d4a017]" />
              )}
            </div>
            <div>
              <h3 id="scan-confirm-title" className="text-xl font-bold font-display uppercase tracking-wide text-[#e8ebe6]">
                {isMultipleCodes ? 'MULTIPLE CODES FOUND' : 'CONFIRM SCANNED TICKET'}
              </h3>
              <p className="text-xs text-[#9aa3ad] font-semibold uppercase tracking-wider">
                {selectedCandidate.confidence === 'confirmed'
                  ? 'VERIFY EXTRACTED FIELDS'
                  : 'OPERATOR CONFIRMATION REQUIRED'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-[#9aa3ad] hover:text-[#e8ebe6] bg-[#1b2027] hover:bg-[#2a313b] p-2 rounded-xl transition cursor-pointer"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multiple Candidates Selector */}
        {isMultipleCodes && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase text-[#9aa3ad] tracking-wider">
              SELECT THE CORRECT TICKET CODE:
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {candidates.map((cand, idx) => {
                const isSelected =
                  normalizeTicketNumber(cand.ticketNumber || '') ===
                  normalizeTicketNumber(selectedCandidate.ticketNumber || '') &&
                  cand.rawValue === selectedCandidate.rawValue;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectCandidate(cand)}
                    className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-[#1b2027] border-[#c23b32] text-[#e8ebe6]'
                        : 'bg-[#0b0c0e] border-[#2a313b] text-[#9aa3ad] hover:border-[#9aa3ad]/40'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#e8ebe6] text-sm">
                          {cand.ticketNumber ? `#${cand.ticketNumber}` : 'No Ticket #'}
                        </span>
                        <span
                          className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-md ${
                            cand.confidence === 'confirmed'
                              ? 'bg-[#142319] text-[#8fa37a] border border-[#8fa37a]/40'
                              : cand.confidence === 'probable'
                              ? 'bg-[#291e0a] text-[#d4a017] border border-[#d4a017]/40'
                              : 'bg-[#14171c] text-[#9aa3ad] border border-[#2a313b]'
                          }`}
                        >
                          {cand.parser === 'atlas'
                            ? 'Atlas 6-Part'
                            : cand.parser === 'atlas-partial'
                            ? 'Atlas Partial'
                            : cand.parser === 'generic_labeled'
                            ? 'Labeled'
                            : cand.confidence}
                        </span>
                      </div>
                      <div className="text-xs text-[#9aa3ad] truncate flex items-center gap-2">
                        {cand.weightLbs && (
                          <span className="font-mono font-semibold text-[#e8ebe6]">
                            {cand.weightLbs.toLocaleString()} lbs
                          </span>
                        )}
                        {cand.matchedSandType && <span>• {cand.matchedSandType}</span>}
                        {cand.poNumber && <span>• PO: {cand.poNumber}</span>}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="bg-[#c23b32] text-[#e8ebe6] p-1.5 rounded-lg shrink-0">
                        <Check className="w-4 h-4 stroke-[2]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Validation / Plausibility Warnings */}
        {validation.warnings.length > 0 && (
          <div className="bg-[#291e0a]/80 border border-[#d4a017]/50 rounded-xl p-3.5 space-y-1 text-xs text-[#d4a017]">
            <div className="flex items-center gap-1.5 font-semibold uppercase text-[#d4a017]">
              <AlertCircle className="w-4 h-4 text-[#d4a017] shrink-0" />
              <span>Plausibility Notice</span>
            </div>
            {validation.warnings.map((w, i) => (
              <p key={i} className="pl-5 leading-snug">
                {w}
              </p>
            ))}
          </div>
        )}

        {/* Scanned Fields Form */}
        <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-4 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-[#2a313b] pb-2">
            <span className="text-[10px] font-semibold uppercase text-[#9aa3ad] font-sans tracking-wider">
              EXTRACTED TICKET VALUES
            </span>
            <span className="text-[10px] text-[#9aa3ad] font-semibold uppercase font-sans">
              Parser: {selectedCandidate.parser} ({selectedCandidate.confidence})
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-[#9aa3ad] uppercase block font-sans font-semibold mb-1">
                Ticket Number *
              </label>
              <input
                type="text"
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value)}
                placeholder="e.g. M30134835"
                className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-3 py-2 text-base font-mono font-bold text-[#e8ebe6] uppercase focus:border-[#c23b32] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#9aa3ad] uppercase block font-sans font-semibold mb-1">
                  Net Weight (LBS)
                </label>
                <input
                  type="text"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder="e.g. 52380"
                  className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-3 py-2 text-sm font-mono font-bold text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-[#9aa3ad] uppercase block font-sans font-semibold mb-1">
                  Sand Type / Product
                </label>
                <div className="bg-[#14171c] border border-[#2a313b] rounded-xl px-3 py-2 text-sm font-semibold text-[#e8ebe6] truncate">
                  {selectedCandidate.matchedSandType || selectedCandidate.productCode || 'None detected'}
                </div>
              </div>
            </div>

            {(selectedCandidate.carrier || selectedCandidate.truck || selectedCandidate.poNumber) && (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#2a313b] text-[#9aa3ad] text-[11px]">
                {selectedCandidate.poNumber && (
                  <div>
                    <span className="text-[9px] text-[#9aa3ad] uppercase block font-sans">PO #</span>
                    <span className="font-semibold text-[#e8ebe6] truncate block">{selectedCandidate.poNumber}</span>
                  </div>
                )}
                {selectedCandidate.truck && (
                  <div>
                    <span className="text-[9px] text-[#9aa3ad] uppercase block font-sans">Truck #</span>
                    <span className="font-semibold text-[#e8ebe6] truncate block">{selectedCandidate.truck}</span>
                  </div>
                )}
                {selectedCandidate.carrier && (
                  <div>
                    <span className="text-[9px] text-[#9aa3ad] uppercase block font-sans">Carrier</span>
                    <span className="font-semibold text-[#e8ebe6] truncate block">{selectedCandidate.carrier}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Raw Scan Text Display */}
          <div className="pt-2 border-t border-[#2a313b] space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-[#9aa3ad] font-sans font-semibold uppercase">
              <HelpCircle className="w-3 h-3 text-[#9aa3ad]" />
              <span>Raw Scanned Payload</span>
            </div>
            <div className="bg-[#14171c] p-2 rounded-xl text-[10px] text-[#9aa3ad] break-all select-all font-mono border border-[#2a313b]">
              {selectedCandidate.rawValue}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onRescan}
            className="w-full bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] font-semibold py-3 px-4 rounded-xl text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-[0.98] border border-[#2a313b] shadow-md cursor-pointer"
          >
            <Camera className="w-4 h-4 text-[#9aa3ad]" />
            <span>RESCAN</span>
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!validation.isValid}
            className="w-full bg-[#c23b32] hover:bg-[#e25a4a] active:bg-[#a63028] disabled:opacity-50 text-[#e8ebe6] font-semibold py-3 px-4 rounded-xl shadow-xl text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-[0.98] border border-[#e25a4a]/40 cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[2]" />
            <span>CONFIRM & APPLY</span>
          </button>
        </div>
      </div>
    </div>
  );
}
