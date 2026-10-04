import { AlertTriangle, X, Check, Camera, ExternalLink, HelpCircle, ShieldAlert, KeyRound } from 'lucide-react';
import React, { useState } from 'react';
import { DeliveryTicket } from '../types';

interface DuplicateWarningModalProps {
  duplicate: DeliveryTicket;
  scannedTicketNumber?: string;
  rawScanValue?: string;
  lbsPerTon?: number;
  onClose: () => void;
  onRescan?: () => void;
  onViewExisting?: (ticket: DeliveryTicket) => void;
  onSupervisorOverride?: (reason: string) => Promise<void> | void;
}

export default function DuplicateWarningModal({
  duplicate,
  scannedTicketNumber,
  rawScanValue,
  lbsPerTon = 2000,
  onClose,
  onRescan,
  onViewExisting,
  onSupervisorOverride,
}: DuplicateWarningModalProps) {
  const [showOverrideInput, setShowOverrideInput] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverriding, setIsOverriding] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const tons = (duplicate.lbs / lbsPerTon).toFixed(2);
  const formattedDate = duplicate.date
    ? new Date(duplicate.date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : duplicate.date;

  const handleConfirmOverride = async () => {
    if (!overrideReason.trim()) {
      setOverrideError('Supervisor override reason is mandatory.');
      return;
    }
    if (!onSupervisorOverride) return;

    try {
      setIsOverriding(true);
      setOverrideError(null);
      await onSupervisorOverride(overrideReason.trim());
    } catch (err: any) {
      setOverrideError(err?.message || 'Failed to apply supervisor override.');
      setIsOverriding(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-[#0b0c0e]/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-modal-title"
    >
      <div className="bg-[#14171c] border border-[#c23b32]/60 rounded-2xl max-w-lg w-full p-5 sm:p-6 text-[#e8ebe6] shadow-2xl space-y-4 relative animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2a313b]">
          <div className="flex items-center gap-3">
            <div className="bg-[#260e0c] text-[#e25a4a] border border-[#c23b32]/40 p-2.5 rounded-xl shrink-0">
              <AlertTriangle className="w-6 h-6 stroke-[2]" />
            </div>
            <div>
              <h3 id="duplicate-modal-title" className="text-xl font-bold font-display uppercase tracking-wide text-[#e25a4a]">
                ALREADY RECORDED
              </h3>
              <p className="text-xs text-[#9aa3ad] font-semibold uppercase tracking-wider">
                DUPLICATE TICKET NUMBER DETECTED
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9aa3ad] hover:text-[#e8ebe6] bg-[#1b2027] hover:bg-[#2a313b] p-2 rounded-xl transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice Comparison Box */}
        <div className="bg-[#260e0c]/60 border border-[#c23b32]/40 rounded-xl p-3.5 space-y-2 text-xs sm:text-sm text-[#e8ebe6] font-medium">
          <div className="flex items-center justify-between gap-2 border-b border-[#c23b32]/30 pb-2">
            <span className="text-[#e25a4a] uppercase font-semibold text-xs">Scanned / New Ticket:</span>
            <span className="font-mono font-bold text-[#d4a017] text-base">
              #{scannedTicketNumber || duplicate.ticketNumber}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#9aa3ad] uppercase font-semibold text-xs">Matched Existing Record:</span>
            <span className="font-mono font-bold text-[#e8ebe6] text-base">
              #{duplicate.ticketNumber}
            </span>
          </div>
        </div>

        {/* Scanned Raw Diagnostic Value (if scanner was used) */}
        {rawScanValue && (
          <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3 space-y-1.5 font-mono text-xs">
            <div className="flex items-center justify-between text-[#d4a017] font-sans font-semibold text-[11px] uppercase">
              <span className="flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" />
                Raw Scanned Value
              </span>
              <span className="text-[10px] text-[#9aa3ad]">Verify extracted ticket number</span>
            </div>
            <div className="bg-[#14171c] p-2 rounded-xl text-[#e8ebe6] break-all select-all border border-[#2a313b] text-[11px]">
              {rawScanValue}
            </div>
            <p className="text-[10px] text-[#9aa3ad] font-sans">
              If the physical ticket has not been entered, confirm whether a PO or order number was scanned instead of the unique ticket identifier.
            </p>
          </div>
        )}

        {/* Existing Record Details Box */}
        <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-4 space-y-3 font-mono text-xs">
          <div className="text-[10px] font-semibold uppercase text-[#9aa3ad] font-sans tracking-wider border-b border-[#2a313b] pb-1.5 flex items-center justify-between">
            <span>EXISTING RECORD DETAILS</span>
            <span className="text-[#8fa37a] font-semibold">ACTIVE IN DATABASE</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-[#9aa3ad]">
            <div>
              <span className="text-[10px] text-[#9aa3ad] uppercase block font-sans">Silo Assigned</span>
              <span className="text-sm font-bold text-[#e8ebe6]">SILO #{duplicate.siloNumber}</span>
            </div>

            <div>
              <span className="text-[10px] text-[#9aa3ad] uppercase block font-sans">Net Weight</span>
              <span className="text-sm font-bold text-[#e8ebe6]">
                {duplicate.lbs.toLocaleString()} LBS <span className="text-[11px] text-[#9aa3ad]">({tons} T)</span>
              </span>
            </div>

            <div>
              <span className="text-[10px] text-[#9aa3ad] uppercase block font-sans">Sand Type</span>
              <span className="font-semibold text-[#e8ebe6]">{duplicate.sandType || 'N/A'}</span>
            </div>

            <div>
              <span className="text-[10px] text-[#9aa3ad] uppercase block font-sans">Supplier</span>
              <span className="font-semibold text-[#e8ebe6] truncate block">{duplicate.supplier || 'N/A'}</span>
            </div>

            <div className="col-span-2">
              <span className="text-[10px] text-[#9aa3ad] uppercase block font-sans">Date & Time</span>
              <span className="font-semibold text-[#e8ebe6]">
                {formattedDate} {duplicate.timeOfDay ? `@ ${duplicate.timeOfDay}` : ''}
              </span>
            </div>

            {(duplicate.driverName || duplicate.notes) && (
              <div className="col-span-2 pt-1 border-t border-[#2a313b] space-y-1">
                {duplicate.driverName && (
                  <div>
                    <span className="text-[10px] text-[#9aa3ad] uppercase block font-sans">Driver</span>
                    <span className="text-[#e8ebe6]">{duplicate.driverName}</span>
                  </div>
                )}
                {duplicate.notes && (
                  <div>
                    <span className="text-[10px] text-[#9aa3ad] uppercase block font-sans">Notes</span>
                    <span className="text-[#9aa3ad] italic">{duplicate.notes}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Supervisor Override Section */}
        {onSupervisorOverride && (
          <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-4 space-y-3">
            {!showOverrideInput ? (
              <button
                type="button"
                onClick={() => setShowOverrideInput(true)}
                className="w-full text-xs text-[#9aa3ad] hover:text-[#d4a017] font-semibold uppercase tracking-wider py-1.5 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#d4a017]" />
                <span>Explicit Supervisor Override (Reason Required)</span>
              </button>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-[#d4a017] font-semibold text-xs uppercase">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Supervisor Override Authorization</span>
                </div>
                <p className="text-[11px] text-[#9aa3ad]">
                  Enter a mandatory operational reason why this duplicate ticket must be saved (e.g. Split load on two silos, Scale re-issue):
                </p>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => {
                    setOverrideReason(e.target.value);
                    setOverrideError(null);
                  }}
                  placeholder="Mandatory reason for override..."
                  className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-3 py-2 text-xs text-[#e8ebe6] placeholder-[#9aa3ad]/50 focus:outline-none focus:border-[#c23b32] font-medium"
                />
                {overrideError && (
                  <p className="text-xs text-[#e25a4a] font-semibold">{overrideError}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowOverrideInput(false)}
                    className="flex-1 bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] text-xs font-semibold py-2 rounded-xl"
                  >
                    CANCEL OVERRIDE
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmOverride}
                    disabled={isOverriding || !overrideReason.trim()}
                    className="flex-1 bg-[#c23b32] hover:bg-[#e25a4a] disabled:opacity-50 text-[#e8ebe6] text-xs font-semibold py-2 rounded-xl uppercase tracking-wider shadow-lg"
                  >
                    {isOverriding ? 'SAVING OVERRIDE...' : 'AUTHORIZE & SAVE'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {onRescan && (
            <button
              type="button"
              onClick={onRescan}
              className="w-full bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] font-semibold py-3 px-4 rounded-xl text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-[0.98] border border-[#2a313b] shadow-md cursor-pointer"
            >
              <Camera className="w-4 h-4 text-[#9aa3ad]" />
              <span>RESCAN TICKET</span>
            </button>
          )}

          {onViewExisting && (
            <button
              type="button"
              onClick={() => onViewExisting(duplicate)}
              className="w-full bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] font-semibold py-3 px-4 rounded-xl text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-[0.98] border border-[#2a313b] shadow-md cursor-pointer"
            >
              <ExternalLink className="w-4 h-4 text-[#9aa3ad]" />
              <span>VIEW IN LOGS</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            autoFocus
            className={`w-full bg-[#c23b32] hover:bg-[#e25a4a] active:bg-[#a63028] text-[#e8ebe6] font-semibold py-3 px-4 rounded-xl shadow-xl text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-[0.98] border border-[#e25a4a]/40 cursor-pointer ${
              !onRescan && !onViewExisting ? 'sm:col-span-2' : ''
            }`}
          >
            <Check className="w-4 h-4 stroke-[2]" />
            <span>RETURN & FIX TICKET #</span>
          </button>
        </div>
      </div>
    </div>
  );
}
