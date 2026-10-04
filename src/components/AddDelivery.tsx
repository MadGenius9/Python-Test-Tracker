import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  QrCode,
  Truck,
  RotateCcw,
  Undo2,
  Check,
  Sparkles,
  Clock,
  Plus,
  FileSpreadsheet,
  History,
  X,
} from 'lucide-react';
import React, { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { getSiloDerivedStates, formatLbs, formatTons } from '../lib/sandRules';
import {
  parseTicketScanValue,
  findDuplicateDelivery,
  findDeletedDelivery,
  normalizeTicketNumber,
  getLastUsedSupplier,
  setLastUsedSupplier,
  ParsedTicketScan,
} from '../lib/ticketUtils';
import { getOperationalDate, getOperationalTime, formatOperationalDateDisplay } from '../lib/dateUtils';
import { AppState, DeliveryTicket } from '../types';
import TicketScannerModal, { ScanResult } from './TicketScannerModal';
import DuplicateWarningModal from './DuplicateWarningModal';
import ScanConfirmationModal from './ScanConfirmationModal';

interface AddDeliveryProps {
  state: AppState;
  initialSiloNumber?: number;
  onAddDelivery: (delivery: {
    ticketNumber: string;
    siloNumber: number;
    sandType: string;
    lbs: number;
    supplier: string;
    date: string;
    timeOfDay?: string;
    driverName?: string;
    notes?: string;
    photoUrl?: string | null;
    carrier?: string;
    truck?: string;
    poNumber?: string;
    productCode?: string;
    reassignSiloSand?: boolean;
    supervisorOverride?: boolean;
    overrideReason?: string;
    scanMetadata?: any;
  }) => Promise<void> | void;
  onDeleteDelivery?: (id: string, reason?: string) => Promise<void> | void;
  onSaveProductCodeMapping?: (mineCode: string, sandType: string) => Promise<void> | void;
  onChangeSiloSand?: (siloNumber: number, sandType: string | null) => void;
  onNavigateToSetup?: () => void;
  onNavigateToLogs?: () => void;
  onDone?: () => void;
  onCancel?: () => void;
}

export default function AddDelivery({
  state,
  initialSiloNumber,
  onAddDelivery,
  onDeleteDelivery,
  onSaveProductCodeMapping,
  onChangeSiloSand,
  onNavigateToSetup,
  onNavigateToLogs,
  onDone,
  onCancel,
}: AddDeliveryProps) {
  const ticketInputRef = useRef<HTMLInputElement | null>(null);

  const siloDerivedStates = getSiloDerivedStates(state);
  const defaultSiloNum = initialSiloNumber || state.config.silos[0]?.siloNumber || 1;
  const initialSiloObj = state.config.silos.find((s) => s.siloNumber === defaultSiloNum);

  const todayStr = getOperationalDate();
  const nowTimeStr = getOperationalTime();

  const [ticketNumber, setTicketNumber] = useState('');
  const [siloNumber, setSiloNumber] = useState<number>(defaultSiloNum);
  const [sandType, setSandType] = useState<string>(
    initialSiloObj?.sandType || state.config.sandTypes[0]?.name || '100 Mesh'
  );
  const [lbs, setLbs] = useState<string>('');

  // Supplier logic based on state.config.suppliers
  const supplierList = state.config.suppliers || [];

  const getInitialSupplierConfig = () => {
    if (supplierList.length === 1) {
      return { opt: supplierList[0], custom: '', val: supplierList[0] };
    }
    if (supplierList.length > 1) {
      const last = getLastUsedSupplier();
      if (last && supplierList.includes(last)) {
        return { opt: last, custom: '', val: last };
      }
      const recent = state.deliveries[0]?.supplier;
      if (recent && supplierList.includes(recent)) {
        return { opt: recent, custom: '', val: recent };
      }
      return { opt: supplierList[0], custom: '', val: supplierList[0] };
    }
    return { opt: '', custom: '', val: '' };
  };

  const initialSupplierConfig = getInitialSupplierConfig();
  const [selectedSupplierOpt, setSelectedSupplierOpt] = useState<string>(initialSupplierConfig.opt);
  const [customSupplier, setCustomSupplier] = useState<string>(initialSupplierConfig.custom);
  const [supplier, setSupplier] = useState<string>(initialSupplierConfig.val);

  useEffect(() => {
    if (supplierList.length === 1) {
      setSelectedSupplierOpt(supplierList[0]);
      setSupplier(supplierList[0]);
    } else if (supplierList.length > 1) {
      if (!selectedSupplierOpt || (!supplierList.includes(selectedSupplierOpt) && selectedSupplierOpt !== '__OTHER__')) {
        const last = getLastUsedSupplier();
        const choice = (last && supplierList.includes(last))
          ? last
          : (state.deliveries[0]?.supplier && supplierList.includes(state.deliveries[0]?.supplier))
          ? state.deliveries[0]?.supplier
          : supplierList[0];
        setSelectedSupplierOpt(choice);
        setSupplier(choice);
      }
    }
  }, [state.config.suppliers]);

  const [date, setDate] = useState(todayStr);
  const [timeOfDay, setTimeOfDay] = useState(nowTimeStr);
  const [driverName, setDriverName] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Extra fields from Atlas 6-part QR
  const [truck, setTruck] = useState<string>('');
  const [poNumber, setPoNumber] = useState<string>('');
  const [productCode, setProductCode] = useState<string>('');
  const [unrecognizedProductCode, setUnrecognizedProductCode] = useState<string | null>(null);
  const [highlightSilo, setHighlightSilo] = useState<boolean>(false);

  // Scanner & Scanned state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedInfo, setScannedInfo] = useState<{
    rawValue: string;
    format: string;
    parser?: string;
    confidence?: string;
    winningScale?: string;
    engine?: string;
  } | null>(null);

  // Scan confirmation modal state
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [pendingScan, setPendingScan] = useState<ParsedTicketScan | null>(null);
  const [scanCandidates, setScanCandidates] = useState<ParsedTicketScan[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Flash confirmation & vibration
  const [justSavedFlash, setJustSavedFlash] = useState<string | null>(null);
  const [undoFlash, setUndoFlash] = useState<string | null>(null);

  // Session tickets list (last 5 tickets entered in this session)
  const [sessionTickets, setSessionTickets] = useState<DeliveryTicket[]>([]);

  // Sand mismatch confirmation modal state
  const [isSandMismatchModalOpen, setIsSandMismatchModalOpen] = useState<boolean>(false);

  // Mobile-specific UI states
  const [isMobileManualMode, setIsMobileManualMode] = useState<boolean>(false);
  const [isMobileEditingTicket, setIsMobileEditingTicket] = useState<boolean>(false);
  const [showMobileHistoryModal, setShowMobileHistoryModal] = useState<boolean>(false);
  const mobileTicketInputRef = useRef<HTMLInputElement | null>(null);
  const mobileWeightInputRef = useRef<HTMLInputElement | null>(null);

  // Focus ticket input when mobile manual mode is toggled
  useEffect(() => {
    if (isMobileManualMode) {
      mobileTicketInputRef.current?.focus();
    }
  }, [isMobileManualMode]);

  // Duplicate ticket check across all active deliveries on this pad
  const duplicateDelivery = findDuplicateDelivery(ticketNumber, state.deliveries);
  const deletedDeliveryMatch = findDeletedDelivery(ticketNumber, state.deletedDeliveries);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  const handleCloseDuplicateModal = () => {
    setIsDuplicateModalOpen(false);
    setTimeout(() => {
      ticketInputRef.current?.focus();
    }, 100);
  };

  // Live Silo Calculations
  const selectedSiloDerived = siloDerivedStates.find((s) => s.siloNumber === siloNumber);
  const currentSiloConfig = state.config.silos.find((s) => s.siloNumber === siloNumber);
  const currentConfiguredSand = currentSiloConfig?.sandType;
  const lbsPerTon = state.config.lbsPerTon || 2000;
  const onHandLbs = selectedSiloDerived?.onHandLbs || 0;
  const maxCapacityLbs = selectedSiloDerived?.maxCapacityLbs || 350000;
  const percentFull = Math.min(100, Math.max(0, Math.round((onHandLbs / maxCapacityLbs) * 100)));
  const onHandTons = (onHandLbs / lbsPerTon).toFixed(1);
  const maxTons = (maxCapacityLbs / lbsPerTon).toFixed(1);

  const deliveryWeightLbs = parseInt(lbs, 10) || 0;
  const projectedOnHandLbs = onHandLbs + deliveryWeightLbs;
  const projectedPercentFull = Math.min(100, Math.max(0, Math.round((projectedOnHandLbs / maxCapacityLbs) * 100)));
  const isOverCapacityWarning = projectedOnHandLbs > maxCapacityLbs;

  // Helper to apply parsed ticket to form fields
  const applyParsedTicket = (parsed: ParsedTicketScan) => {
    if (parsed.ticketNumber) {
      setTicketNumber(parsed.ticketNumber);
    }
    if (parsed.lbs) {
      setLbs(parsed.lbs.toString());
    }
    if (parsed.carrier) {
      const carrier = parsed.carrier.trim();
      if (supplierList.includes(carrier)) {
        setSelectedSupplierOpt(carrier);
        setSupplier(carrier);
        setCustomSupplier('');
      } else if (carrier) {
        setSelectedSupplierOpt('__OTHER__');
        setCustomSupplier(carrier);
        setSupplier(carrier);
      }
    }
    if (parsed.truck) setTruck(parsed.truck);
    if (parsed.poNumber) setPoNumber(parsed.poNumber);
    if (parsed.productCode) setProductCode(parsed.productCode);

    if (parsed.matchedSandType) {
      setSandType(parsed.matchedSandType);
      setUnrecognizedProductCode(null);
    } else if (parsed.productCode) {
      setUnrecognizedProductCode(parsed.productCode);
    } else {
      setUnrecognizedProductCode(null);
    }

    setHighlightSilo(true);

    // Run duplicate check on normalized ticket
    if (parsed.ticketNumber) {
      const norm = normalizeTicketNumber(parsed.ticketNumber);
      const dup = findDuplicateDelivery(norm, state.deliveries);
      if (dup) {
        setIsDuplicateModalOpen(true);
      }
    }

    setTimeout(() => {
      ticketInputRef.current?.focus();
    }, 100);
  };

  // Handle Scan Success from TicketScannerModal
  const handleScanSuccess = (result: ScanResult) => {
    setIsScannerOpen(false);
    const { rawValue, format, parsed, candidates, isAmbiguous, winningScale, engine } = result;

    // Vibrate device
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(100);
      } catch (e) {
        // ignore
      }
    }

    if (isAmbiguous || parsed.confidence !== 'confirmed') {
      // Need operator verification
      setPendingScan(parsed);
      setScanCandidates(candidates || [parsed]);
      setIsConfirmationModalOpen(true);
    } else {
      // Confirmed scan
      setScannedInfo({
        rawValue,
        format,
        parser: parsed.parser,
        confidence: parsed.confidence,
        winningScale,
        engine,
      });
      applyParsedTicket(parsed);
    }
  };

  // Handle confirmation from ScanConfirmationModal
  const handleConfirmScan = (confirmed: ParsedTicketScan) => {
    setIsConfirmationModalOpen(false);
    setScannedInfo({
      rawValue: confirmed.rawValue,
      format: confirmed.format || 'QR_CODE',
      parser: confirmed.parser,
      confidence: confirmed.confidence,
    });
    applyParsedTicket(confirmed);
  };

  const handleRememberProductCodePairing = async () => {
    if (!unrecognizedProductCode || !sandType || !onSaveProductCodeMapping) return;
    try {
      await onSaveProductCodeMapping(unrecognizedProductCode, sandType);
      setUnrecognizedProductCode(null);
      setJustSavedFlash(`Saved Product Code mapping: ${unrecognizedProductCode} ➔ ${sandType}`);
      setTimeout(() => setJustSavedFlash(null), 3000);
    } catch (err) {
      console.error('Failed to save pairing:', err);
    }
  };

  // Handle Silo Change
  const handleSiloChange = (num: number) => {
    setSiloNumber(num);
    setHighlightSilo(false);
    const siloObj = state.config.silos.find((s) => s.siloNumber === num);
    if (siloObj && siloObj.sandType) {
      setSandType(siloObj.sandType);
    }
  };

  const handlePhotoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Execute actual save to Firestore
  const executeSaveDelivery = async (opts: {
    reassignSiloSand?: boolean;
    supervisorOverride?: boolean;
    overrideReason?: string;
  }) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setIsSandMismatchModalOpen(false);

    const cleanTicket = normalizeTicketNumber(ticketNumber);
    const numericLbs = parseInt(lbs, 10);
    const timeToRecord = timeOfDay || getOperationalTime();

    try {
      if (supplier.trim()) {
        setLastUsedSupplier(supplier.trim());
      }

      await onAddDelivery({
        ticketNumber: cleanTicket,
        siloNumber,
        sandType,
        lbs: numericLbs,
        supplier: supplier.trim(),
        date,
        timeOfDay: timeToRecord,
        driverName: driverName.trim(),
        notes: notes.trim(),
        photoUrl,
        carrier: supplier.trim(),
        truck: truck || undefined,
        poNumber: poNumber || undefined,
        productCode: productCode || undefined,
        reassignSiloSand: opts.reassignSiloSand,
        supervisorOverride: opts.supervisorOverride,
        overrideReason: opts.overrideReason,
        scanMetadata: scannedInfo
          ? {
              method: 'camera',
              format: scannedInfo.format,
              parser: scannedInfo.parser as any,
              confidence: scannedInfo.confidence as any,
              rawValue: scannedInfo.rawValue,
              winningScale: scannedInfo.winningScale,
              engine: scannedInfo.engine,
              scannedAt: Date.now(),
            }
          : undefined,
      });

      // Vibrate if supported
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([100, 50, 100]);
        } catch (e) {
          // ignore
        }
      }

      // Add to session feed
      const newSessionRecord: DeliveryTicket = {
        id: `session-${Date.now()}-${cleanTicket}`,
        ticketNumber: cleanTicket,
        siloNumber,
        sandType,
        lbs: numericLbs,
        supplier: supplier.trim(),
        date,
        timeOfDay: timeToRecord,
        driverName: driverName.trim(),
        notes: notes.trim(),
        photoUrl,
        createdAt: Date.now(),
        supervisorOverride: opts.supervisorOverride,
        overrideReason: opts.overrideReason,
      };
      setSessionTickets((prev) => [newSessionRecord, ...prev].slice(0, 5));

      // Trigger Green Flash message
      setJustSavedFlash(
        `TICKET #${cleanTicket} SAVED (${numericLbs.toLocaleString()} LBS TO SILO #${siloNumber})`
      );
      setTimeout(() => setJustSavedFlash(null), 3500);

      // Clear ticket-specific fields, KEEPING silo, supplier, sandType, date for consecutive loads
      setTicketNumber('');
      setLbs('');
      setDriverName('');
      setNotes('');
      setPhotoUrl(null);
      setTruck('');
      setPoNumber('');
      setProductCode('');
      setUnrecognizedProductCode(null);
      setScannedInfo(null);
      setHighlightSilo(false);
      setIsMobileEditingTicket(false);
      setIsMobileManualMode(false);
      setErrors({});

      // Return cursor focus back to ticket number field
      setTimeout(() => {
        ticketInputRef.current?.focus();
      }, 100);
    } catch (err: any) {
      console.error('Save failed:', err);
      setSubmitError(err?.message || 'Failed to save delivery ticket. Check database connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Form Submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const errs: Record<string, string> = {};

    const cleanTicket = normalizeTicketNumber(ticketNumber);
    if (!cleanTicket) {
      errs.ticketNumber = 'Ticket number is required';
    }

    const numericLbs = parseInt(lbs, 10);
    if (!numericLbs || numericLbs <= 0) {
      errs.lbs = 'Valid sand weight in lbs is required';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      ticketInputRef.current?.focus();
      return;
    }

    // Check for duplicate ticket across active deliveries
    const dup = findDuplicateDelivery(cleanTicket, state.deliveries);
    if (dup) {
      setIsDuplicateModalOpen(true);
      return;
    }

    // Check if configured sand type on this silo differs from delivered sand type
    if (currentConfiguredSand && sandType && currentConfiguredSand !== sandType) {
      // Require user confirmation before reassigning a silo mid-stack
      setIsSandMismatchModalOpen(true);
      return;
    }

    // No sand mismatch & no duplicate -> Save directly
    await executeSaveDelivery({ reassignSiloSand: false });
  };

  // Handle Undo for a session ticket
  const handleUndoTicket = async (ticket: DeliveryTicket) => {
    if (!onDeleteDelivery) return;
    try {
      // Find matching live record in state.deliveries to get actual firestore ID
      const matchingLive = (state.deliveries || []).find(
        (d) => !d.deleted && d.ticketNumber === ticket.ticketNumber
      );
      const targetId = matchingLive?.id || ticket.id;

      await onDeleteDelivery(targetId, 'Undone from ticket entry session');

      // Vibrate
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(80);
        } catch (e) {
          // ignore
        }
      }

      // Remove from session list
      setSessionTickets((prev) => prev.filter((t) => t.ticketNumber !== ticket.ticketNumber));

      setUndoFlash(`TICKET #${ticket.ticketNumber} UNDONE & REMOVED`);
      setTimeout(() => setUndoFlash(null), 3000);

      setTimeout(() => {
        ticketInputRef.current?.focus();
      }, 100);
    } catch (err: any) {
      console.error('Error undoing ticket:', err);
      alert(`Failed to undo ticket: ${err?.message || 'Unknown error'}`);
    }
  };

  const remainingLbs = maxCapacityLbs - projectedOnHandLbs;
  const recentPadDeliveries = (state.deliveries || [])
    .filter((d) => !d.deleted)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const lastSavedTicket = sessionTickets[0] || recentPadDeliveries[0];

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      {/* FLASH SUCCESS / UNDO MESSAGES (Shared across Mobile and Desktop) */}
      {justSavedFlash && (
        <div className="bg-[#142319] text-[#8fa37a] p-4 sm:p-5 rounded-2xl font-semibold text-sm sm:text-base text-center shadow-xl border border-[#8fa37a]/40 animate-in fade-in slide-in-from-top-2 flex items-center justify-center gap-3">
          <CheckCircle2 className="w-5 h-5 stroke-[2] shrink-0" />
          <span className="font-display tracking-wide uppercase">{justSavedFlash}</span>
        </div>
      )}

      {undoFlash && (
        <div className="bg-[#291e0a] text-[#d4a017] p-4 rounded-2xl font-semibold text-sm text-center shadow-xl border border-[#d4a017]/40 animate-in fade-in flex items-center justify-center gap-2">
          <Undo2 className="w-5 h-5 stroke-[2]" />
          <span className="font-display tracking-wide uppercase">{undoFlash}</span>
        </div>
      )}

      {/* SUBMISSION ERROR BANNER */}
      {submitError && (
        <div className="bg-[#260e0c] border border-[#c23b32]/60 text-[#e8ebe6] p-4 sm:p-5 rounded-2xl font-semibold shadow-2xl flex items-center gap-4">
          <div className="bg-[#14171c] text-[#e25a4a] p-3 rounded-xl shrink-0 border border-[#c23b32]/40 shadow">
            <AlertTriangle className="w-6 h-6 stroke-[2]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-[#e25a4a]">
              SAVE ERROR
            </div>
            <div className="text-sm sm:text-base font-mono uppercase text-[#e8ebe6] font-bold tracking-tight mt-0.5">
              {submitError}
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Warning Modal */}
      {isDuplicateModalOpen && duplicateDelivery && (
        <DuplicateWarningModal
          duplicate={duplicateDelivery}
          lbsPerTon={state.config.lbsPerTon}
          scannedTicketNumber={ticketNumber}
          rawScanValue={scannedInfo?.rawValue}
          onClose={handleCloseDuplicateModal}
          onRescan={() => {
            handleCloseDuplicateModal();
            setIsScannerOpen(true);
          }}
          onViewExisting={() => {
            handleCloseDuplicateModal();
            if (onDone) onDone();
          }}
          onSupervisorOverride={async (reason) => {
            await executeSaveDelivery({
              reassignSiloSand: false,
              supervisorOverride: true,
              overrideReason: reason,
            });
            handleCloseDuplicateModal();
          }}
        />
      )}

      {/* Scan Confirmation Modal */}
      {isConfirmationModalOpen && pendingScan && (
        <ScanConfirmationModal
          parsed={pendingScan}
          candidates={scanCandidates}
          onConfirm={handleConfirmScan}
          onEdit={(edited) => {
            handleConfirmScan(edited);
          }}
          onRescan={() => {
            setIsConfirmationModalOpen(false);
            setIsScannerOpen(true);
          }}
          onCancel={() => setIsConfirmationModalOpen(false)}
        />
      )}

      {/* Sand Mismatch Reassignment Confirmation Modal */}
      {isSandMismatchModalOpen && currentConfiguredSand && (
        <div className="fixed inset-0 z-50 bg-[#0b0c0e]/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#14171c] border border-[#d4a017]/60 rounded-2xl max-w-lg w-full p-5 sm:p-6 text-[#e8ebe6] shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-start gap-3.5 pb-2 border-b border-[#2a313b]">
              <div className="bg-[#291e0a] text-[#d4a017] p-2.5 rounded-xl shrink-0 border border-[#d4a017]/40 shadow">
                <AlertTriangle className="w-6 h-6 stroke-[2]" />
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#d4a017]">
                  SILO SAND TYPE REASSIGNMENT
                </div>
                <h3 className="text-xl font-bold text-[#e8ebe6] font-display uppercase">
                  Silo #{siloNumber} Sand Type Mismatch
                </h3>
              </div>
            </div>

            <div className="bg-[#0b0c0e] border border-[#2a313b] p-4 rounded-xl space-y-2 text-xs sm:text-sm">
              <div className="text-[#9aa3ad]">
                Silo #{siloNumber} is currently configured for{' '}
                <span className="bg-[#1b2027] text-[#e8ebe6] font-semibold px-2 py-0.5 rounded border border-[#2a313b]">
                  {currentConfiguredSand}
                </span>
                .
              </div>
              <div className="text-[#d4a017] font-medium">
                Ticket #{ticketNumber.trim()} specifies{' '}
                <span className="bg-[#291e0a] text-[#d4a017] font-semibold px-2 py-0.5 rounded border border-[#d4a017]/40">
                  {sandType}
                </span>
                .
              </div>
              <div className="text-xs text-[#9aa3ad] pt-1 border-t border-[#2a313b]">
                Reassigning this silo updates its sand type in pad settings for all subsequent stage pulls.
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => executeSaveDelivery({ reassignSiloSand: true })}
                className="w-full bg-[#c23b32] hover:bg-[#e25a4a] text-[#e8ebe6] font-semibold text-xs sm:text-sm py-3 px-4 rounded-xl shadow-xl transition active:scale-[0.98] uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[2]" />
                <span>Reassign Silo #{siloNumber} to {sandType} & Save</span>
              </button>

              <button
                type="button"
                onClick={() => executeSaveDelivery({ reassignSiloSand: false })}
                className="w-full bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] font-semibold text-xs py-3 px-4 rounded-xl border border-[#2a313b] transition active:scale-[0.98] uppercase tracking-wider cursor-pointer"
              >
                Keep Silo as {currentConfiguredSand} (Save Ticket Only)
              </button>

              <button
                type="button"
                onClick={() => setIsSandMismatchModalOpen(false)}
                className="w-full text-[#9aa3ad] hover:text-[#e8ebe6] font-medium text-xs py-2 transition cursor-pointer"
              >
                Cancel & Review Form
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MOBILE ONE-SCREEN QUICK WORKFLOW (Visible ONLY on Mobile < md screens)   */}
      {/* ========================================================================= */}
      <div className="block md:hidden space-y-3.5 max-w-md mx-auto select-none">
        {/* Header Bar */}
        <div className="bg-[#14171c] border border-[#2a313b] rounded-2xl p-3.5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#1b2027] text-[#e8ebe6] p-2 rounded-xl border border-[#2a313b]">
              <Truck className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase text-[#e8ebe6] tracking-wider font-display">
                TICKET ENTRY
              </div>
              <div className="text-[10px] text-[#9aa3ad] font-semibold uppercase">
                ONE-SCREEN WORKFLOW
              </div>
            </div>
          </div>

          {(onDone || onCancel) && (
            <button
              type="button"
              onClick={onDone || onCancel}
              className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] border border-[#2a313b] px-3 py-1.5 rounded-xl text-xs font-semibold uppercase flex items-center gap-1 transition active:scale-95 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-[#8fa37a] stroke-[2]" />
              <span>DONE</span>
            </button>
          )}
        </div>

        {/* 1. SELECT SILO: 2x3 Grid with Large Touch Targets */}
        <div className="bg-[#14171c] border border-[#2a313b] rounded-2xl p-3 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-[#9aa3ad] px-0.5">
            <span>SELECT SILO</span>
            <span className="text-[#9aa3ad] font-mono">TAP TO SWITCH</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {Array.from({ length: state.config.siloCount || state.config.silos?.length || 6 }, (_, i) => i + 1).map((num) => {
              const siloObj = state.config.silos.find((s) => s.siloNumber === num);
              const derived = siloDerivedStates.find((s) => s.siloNumber === num);
              const isSelected = siloNumber === num;
              const sandName = siloObj?.sandType || 'UNASSIGNED';
              const sandAbbr = sandName.includes('100')
                ? '100M'
                : sandName.includes('40/70')
                ? '40/70'
                : sandName.slice(0, 5);

              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleSiloChange(num)}
                  className={`min-h-[52px] p-2 rounded-xl flex flex-col items-center justify-center transition active:scale-95 cursor-pointer text-center ${
                    isSelected
                      ? 'bg-[#c23b32] text-[#e8ebe6] ring-2 ring-[#c23b32]/50 shadow-lg font-bold scale-[1.02]'
                      : 'bg-[#0b0c0e] border border-[#2a313b] text-[#e8ebe6] hover:border-[#9aa3ad]/40 font-medium'
                  }`}
                >
                  <div className="text-sm font-bold tracking-tight leading-none">
                    S{num}
                  </div>
                  <div
                    className={`text-[10px] uppercase font-mono font-semibold mt-1 leading-none truncate max-w-[80px] ${
                      isSelected ? 'text-[#e8ebe6]' : 'text-[#9aa3ad]'
                    }`}
                  >
                    {sandAbbr}
                  </div>
                  <div
                    className={`text-[9px] font-mono mt-0.5 leading-none ${
                      isSelected ? 'text-[#e8ebe6]/80' : 'text-[#9aa3ad]/70'
                    }`}
                  >
                    {derived ? `${(derived.onHandLbs / lbsPerTon).toFixed(0)}T` : '—'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Silo Current Balance & Sand info */}
          <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3 flex items-center justify-between text-xs">
            <div>
              <div className="text-[10px] font-semibold uppercase text-[#9aa3ad]">
                SILO {siloNumber} • {currentSiloConfig?.side ? `SIDE ${currentSiloConfig.side}` : ''}
              </div>
              <div className="text-sm font-bold text-[#e8ebe6] uppercase">
                {sandType}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase text-[#9aa3ad]">
                CURRENT
              </div>
              <div className="text-base font-mono font-bold text-[#e8ebe6]">
                {formatLbs(onHandLbs)}
              </div>
            </div>
          </div>
        </div>

        {/* 2. SCAN / INPUT AREA */}
        {/* State A: No ticket scanned & not manually editing */}
        {!ticketNumber && deliveryWeightLbs === 0 && !isMobileManualMode && (
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="w-full min-h-[56px] bg-[#c23b32] hover:bg-[#e25a4a] active:bg-[#a63028] text-[#e8ebe6] font-semibold text-base uppercase tracking-wider rounded-xl shadow-xl flex items-center justify-center gap-2.5 transition active:scale-95 cursor-pointer"
            >
              <QrCode className="w-5 h-5 stroke-[2]" />
              <span className="font-display tracking-wider">SCAN TICKET</span>
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsMobileManualMode(true)}
                className="text-xs font-semibold uppercase tracking-wider text-[#9aa3ad] hover:text-[#e8ebe6] underline transition py-1 cursor-pointer"
              >
                + Enter Manually
              </button>
            </div>
          </div>
        )}

        {/* State B: Manual Entry Mode Active */}
        {isMobileManualMode && !ticketNumber && deliveryWeightLbs === 0 && (
          <div className="bg-[#14171c] border border-[#2a313b] rounded-2xl p-3.5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-[#9aa3ad]">
              <span>MANUAL TICKET ENTRY</span>
              <button
                type="button"
                onClick={() => {
                  setIsMobileManualMode(false);
                  setIsScannerOpen(true);
                }}
                className="text-[#e25a4a] hover:text-[#e8ebe6] underline font-medium uppercase cursor-pointer"
              >
                Switch to Scan
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-[#9aa3ad] mb-1">
                  TICKET NUMBER *
                </label>
                <input
                  ref={mobileTicketInputRef}
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. M30134842"
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-2.5 text-base font-mono font-bold text-[#e8ebe6] uppercase focus:border-[#c23b32] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase text-[#9aa3ad] mb-1">
                  WEIGHT (LBS) *
                </label>
                <input
                  ref={mobileWeightInputRef}
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 57140"
                  value={lbs}
                  onChange={(e) => setLbs(e.target.value)}
                  className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-2.5 text-base font-mono font-bold text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* State C: Ticket Data Present (Scanned or Entered) */}
        {(ticketNumber || deliveryWeightLbs > 0) && (
          <div className="space-y-3">
            {/* Scanned Ticket Result Card */}
            <div className="bg-[#14171c] border border-[#2a313b] rounded-2xl p-3.5 space-y-2 shadow-xl">
              {!isMobileEditingTicket ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-[#8fa37a]" />
                      <span className="text-[11px] font-semibold uppercase text-[#9aa3ad] tracking-wider">
                        SCANNED TICKET
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsMobileEditingTicket(true)}
                      className="text-xs font-semibold text-[#9aa3ad] hover:text-[#e8ebe6] uppercase px-2 py-0.5 rounded bg-[#1b2027] border border-[#2a313b] cursor-pointer"
                    >
                      [ EDIT ]
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-[#0b0c0e] p-2.5 rounded-xl border border-[#2a313b]">
                    <div>
                      <div className="text-[9px] font-semibold uppercase text-[#9aa3ad]">
                        TICKET NUMBER
                      </div>
                      <div className="text-sm font-mono font-bold text-[#e8ebe6]">
                        {ticketNumber || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-semibold uppercase text-[#9aa3ad]">
                        WEIGHT
                      </div>
                      <div className="text-sm font-mono font-bold text-[#e8ebe6]">
                        {formatLbs(deliveryWeightLbs)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Inline Correction Controls */
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-[#e8ebe6]">
                    <span>EDIT TICKET DETAILS</span>
                    <button
                      type="button"
                      onClick={() => setIsMobileEditingTicket(false)}
                      className="bg-[#c23b32] text-[#e8ebe6] px-2 py-0.5 rounded text-[10px] font-semibold uppercase cursor-pointer"
                    >
                      CONFIRM
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-semibold uppercase text-[#9aa3ad] mb-0.5">
                        TICKET #
                      </label>
                      <input
                        type="text"
                        value={ticketNumber}
                        onChange={(e) => setTicketNumber(e.target.value)}
                        className="w-full bg-[#0b0c0e] border border-[#c23b32]/80 rounded-lg p-2 text-xs font-mono font-bold text-[#e8ebe6] uppercase focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-semibold uppercase text-[#9aa3ad] mb-0.5">
                        WEIGHT (LBS)
                      </label>
                      <input
                        type="number"
                        value={lbs}
                        onChange={(e) => setLbs(e.target.value)}
                        className="w-full bg-[#0b0c0e] border border-[#c23b32]/80 rounded-lg p-2 text-xs font-mono font-bold text-[#e8ebe6] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* DUPLICATE TICKET WARNING (Section 15) */}
            {duplicateDelivery ? (
              <div className="bg-[#260e0c] border border-[#c23b32]/60 p-3.5 rounded-2xl text-[#e8ebe6] space-y-2 shadow-xl animate-in zoom-in-95">
                <div className="flex items-center gap-2 text-[#e25a4a]">
                  <AlertTriangle className="w-5 h-5 stroke-[2]" />
                  <div className="text-xs font-bold uppercase tracking-wider">
                    DUPLICATE TICKET
                  </div>
                </div>
                <div className="text-xs font-medium text-[#e8ebe6]/90">
                  Ticket <strong className="font-mono text-[#e8ebe6]">#{ticketNumber}</strong> already exists.
                </div>
                <div className="text-[11px] font-semibold uppercase text-[#d4a017] bg-[#14171c] p-2 rounded-lg text-center border border-[#2a313b]">
                  THIS LOAD WILL NOT BE ADDED.
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTicketNumber('');
                      setLbs('');
                      setIsScannerOpen(true);
                    }}
                    className="flex-1 bg-[#c23b32] hover:bg-[#e25a4a] text-[#e8ebe6] font-semibold text-xs py-2.5 rounded-xl uppercase tracking-wider cursor-pointer"
                  >
                    SCAN AGAIN
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDuplicateModalOpen(true)}
                    className="flex-1 bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] font-semibold text-xs py-2.5 rounded-xl uppercase tracking-wider border border-[#2a313b] cursor-pointer"
                  >
                    OVERRIDE
                  </button>
                </div>
              </div>
            ) : (
              /* LIVE SILO INVENTORY PREVIEW (Sections 5, 6, 7) */
              <div className="bg-[#14171c] border border-[#2a313b] rounded-2xl p-3.5 space-y-3 shadow-xl">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9aa3ad] text-center">
                  LIVE SILO INVENTORY PREVIEW
                </div>

                {/* 3 Columns: CURRENT -> THIS LOAD -> AFTER SAVE */}
                <div className="grid grid-cols-3 gap-2 text-center bg-[#0b0c0e] p-2.5 rounded-xl border border-[#2a313b]">
                  <div className="space-y-0.5">
                    <div className="text-[9px] font-semibold uppercase text-[#9aa3ad]">
                      CURRENT
                    </div>
                    <div className="text-xs font-mono font-medium text-[#9aa3ad]">
                      {formatLbs(onHandLbs)}
                    </div>
                  </div>

                  <div className="space-y-0.5 border-x border-[#2a313b]">
                    <div className="text-[9px] font-semibold uppercase text-[#8fa37a]">
                      THIS LOAD
                    </div>
                    <div className="text-xs font-mono font-bold text-[#8fa37a]">
                      +{formatLbs(deliveryWeightLbs)}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-[9px] font-semibold uppercase text-[#e8ebe6]">
                      AFTER SAVE
                    </div>
                    <div className="text-xs sm:text-sm font-mono font-bold text-[#e8ebe6]">
                      {formatLbs(projectedOnHandLbs)}
                    </div>
                  </div>
                </div>

                {/* Giant AFTER SAVE Display */}
                <div className="bg-[#0b0c0e] border border-[#8fa37a]/40 rounded-xl p-3 text-center space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8fa37a]">
                    AFTER SAVE INVENTORY
                  </div>
                  <div className="text-2xl font-mono font-bold text-[#e8ebe6] tracking-tight">
                    {formatLbs(projectedOnHandLbs)}
                  </div>
                  <div className="text-[10px] font-mono text-[#9aa3ad] font-medium">
                    CAPACITY: {formatLbs(maxCapacityLbs)} •{' '}
                    {remainingLbs >= 0 ? (
                      <span className="text-[#8fa37a] font-semibold">
                        {formatLbs(remainingLbs)} REMAINING
                      </span>
                    ) : (
                      <span className="text-[#e25a4a] font-semibold">
                        ⚠️ {formatLbs(Math.abs(remainingLbs))} OVER CAPACITY
                      </span>
                    )}
                  </div>
                </div>

                {/* Over-Capacity Warning */}
                {isOverCapacityWarning && (
                  <div className="bg-[#260e0c] border border-[#c23b32]/60 p-2.5 rounded-xl text-[#e8ebe6] text-xs font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#e25a4a] shrink-0" />
                    <span>
                      ⚠️ <strong>{formatLbs(projectedOnHandLbs - maxCapacityLbs)} OVER CAPACITY</strong>. Verify silo before saving.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 3. SAVE TICKET ACTION (Section 8, 9, 10) */}
            {!duplicateDelivery && (
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={isSubmitting || !ticketNumber.trim() || deliveryWeightLbs <= 0}
                  onClick={async () => {
                    const cleanTicket = normalizeTicketNumber(ticketNumber);
                    if (!cleanTicket) {
                      alert('Please enter a ticket number');
                      return;
                    }
                    if (deliveryWeightLbs <= 0) {
                      alert('Please enter valid sand weight');
                      return;
                    }
                    if (currentConfiguredSand && sandType && currentConfiguredSand !== sandType) {
                      setIsSandMismatchModalOpen(true);
                      return;
                    }
                    await executeSaveDelivery({ reassignSiloSand: false });
                  }}
                  className="w-full min-h-[56px] bg-[#c23b32] hover:bg-[#e25a4a] active:bg-[#a63028] text-[#e8ebe6] font-semibold text-lg uppercase tracking-wider rounded-xl shadow-2xl flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-6 h-6 stroke-[2]" />
                  <span className="font-display tracking-wider">{isSubmitting ? 'SAVING...' : 'SAVE TICKET'}</span>
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setTicketNumber('');
                      setLbs('');
                      setIsMobileManualMode(false);
                      setIsMobileEditingTicket(false);
                      setScannedInfo(null);
                    }}
                    className="text-xs font-medium uppercase text-[#9aa3ad] hover:text-[#e8ebe6] py-1 cursor-pointer"
                  >
                    ✕ Cancel / Clear Ticket
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. LAST SAVED STRIP & QUICK HISTORY (Section 12) */}
        {lastSavedTicket && (
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-3 flex items-center justify-between text-xs shadow-lg">
            <div className="space-y-0.5 min-w-0">
              <div className="text-[9px] font-semibold uppercase text-[#9aa3ad] tracking-wider">
                LAST SAVED
              </div>
              <div className="text-xs font-mono font-bold text-[#e8ebe6] truncate">
                #{lastSavedTicket.ticketNumber} • S{lastSavedTicket.siloNumber} • {formatLbs(lastSavedTicket.lbs)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowMobileHistoryModal(true)}
              className="bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] hover:text-[#e8ebe6] border border-[#2a313b] px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider shrink-0 transition cursor-pointer"
            >
              HISTORY
            </button>
          </div>
        )}

        {/* Mobile History Drawer / Modal */}
        {showMobileHistoryModal && (
          <div className="fixed inset-0 z-50 bg-[#0b0c0e]/85 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-in fade-in">
            <div className="bg-[#14171c] border border-[#2a313b] rounded-2xl max-w-md w-full p-4 text-[#e8ebe6] shadow-2xl space-y-3 animate-in slide-in-from-bottom-4">
              <div className="flex items-center justify-between border-b border-[#2a313b] pb-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#e8ebe6] flex items-center gap-1.5 font-display">
                  <History className="w-4 h-4 text-[#8fa37a]" /> RECENT TICKETS (THIS PAD)
                </div>
                <button
                  type="button"
                  onClick={() => setShowMobileHistoryModal(false)}
                  className="text-[#9aa3ad] hover:text-[#e8ebe6] p-1 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {recentPadDeliveries.slice(0, 8).map((t) => (
                  <div
                    key={t.id}
                    className="bg-[#0b0c0e] border border-[#2a313b] p-2.5 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-[#e8ebe6]">
                        #{t.ticketNumber} • S{t.siloNumber}
                      </div>
                      <div className="text-[10px] text-[#9aa3ad]">
                        {t.sandType} • {t.timeOfDay || (t.createdAt ? new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-[#e8ebe6]">
                        {formatLbs(t.lbs)}
                      </div>
                      {onDeleteDelivery && sessionTickets.some((st) => st.ticketNumber === t.ticketNumber) && (
                        <button
                          type="button"
                          onClick={() => handleUndoTicket(t)}
                          className="text-[10px] font-semibold text-[#e25a4a] underline hover:text-[#c23b32] cursor-pointer"
                        >
                          UNDO
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowMobileHistoryModal(false)}
                className="w-full bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] font-semibold text-xs py-2.5 rounded-xl uppercase tracking-wider border border-[#2a313b] cursor-pointer"
              >
                CLOSE
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* DESKTOP / TABLET DETAILED TICKET ENTRY (Visible ONLY on md: and up)       */}
      {/* ========================================================================= */}
      <div className="hidden md:block space-y-6">
        {/* Top Banner with Done & Scan Buttons */}
        <div className="bg-[#14171c] border border-[#2a313b] rounded-2xl p-5 sm:p-6 text-[#e8ebe6] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="bg-[#1b2027] text-[#e8ebe6] p-3 rounded-xl border border-[#2a313b] shrink-0 shadow-lg">
              <Truck className="w-6 h-6 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold uppercase tracking-wide font-display text-[#e8ebe6]">
                  TICKET ENTRY
                </h2>
                <span className="bg-[#1b2027] text-[#9aa3ad] border border-[#2a313b] text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md">
                  MULTI-LOAD
                </span>
              </div>
              <p className="text-xs text-[#9aa3ad] font-normal mt-0.5">
                Enter tickets consecutively — stay on screen until finished.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-stretch sm:self-auto">
            {/* Scan Ticket Button */}
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="flex-1 sm:flex-none bg-[#c23b32] hover:bg-[#e25a4a] active:bg-[#a63028] text-[#e8ebe6] font-semibold text-xs sm:text-sm px-4 py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 uppercase tracking-wider transition active:scale-95 cursor-pointer min-h-[44px]"
            >
              <QrCode className="w-4 h-4 stroke-[2]" />
              <span className="font-display tracking-wider">SCAN TICKET</span>
            </button>

            {/* DONE Button - Deliberate return to board */}
            {(onDone || onCancel) && (
              <button
                type="button"
                onClick={onDone || onCancel}
                className="flex-1 sm:flex-none bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] font-semibold text-xs sm:text-sm px-4 py-3 rounded-xl shadow border border-[#2a313b] flex items-center justify-center gap-2 uppercase tracking-wider transition active:scale-95 cursor-pointer min-h-[44px]"
                title="Finish ticket entry stack and return to Silo Board"
              >
                <Check className="w-4 h-4 text-[#8fa37a] stroke-[2]" />
                <span>DONE</span>
              </button>
            )}
          </div>
        </div>

        {/* RECENT DELIVERIES (Last ~5 Tickets) */}
        {(() => {
          const recentTickets = (state.deliveries || [])
            .filter((d) => !d.deleted)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 5);

          return (
            <div className="bg-[#14171c] border border-[#2a313b] rounded-2xl p-5 text-[#e8ebe6] shadow-xl space-y-3">
              <div className="flex items-center justify-between gap-3 border-b border-[#2a313b] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="bg-[#1b2027] p-2 rounded-xl text-[#9aa3ad] border border-[#2a313b]">
                    <Truck className="w-4 h-4 stroke-[2]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#e8ebe6] font-display">
                      RECENT DELIVERIES
                    </h3>
                    <p className="text-[11px] text-[#9aa3ad] font-normal">
                      Last {recentTickets.length} tickets recorded on this pad
                    </p>
                  </div>
                </div>

                {(onNavigateToLogs || onDone) && (
                  <button
                    type="button"
                    onClick={onNavigateToLogs || onDone}
                    className="px-3.5 py-1.5 rounded-xl bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] hover:text-[#e8ebe6] border border-[#2a313b] text-xs font-semibold uppercase tracking-wider transition flex items-center gap-1.5 shadow cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5 text-[#8fa37a]" />
                    <span>VIEW TICKET LOG</span>
                  </button>
                )}
              </div>

              {recentTickets.length === 0 ? (
                <div className="text-xs text-[#9aa3ad] italic py-2">
                  No delivery tickets recorded yet on this pad.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
                  {recentTickets.map((t) => (
                    <div
                      key={t.id}
                      className="bg-[#0b0c0e] border border-[#2a313b] hover:border-[#9aa3ad]/40 p-3 rounded-xl space-y-1 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-[#e8ebe6] text-xs">
                          #{t.ticketNumber}
                        </span>
                        <span className="bg-[#1b2027] text-[#9aa3ad] font-semibold text-[10px] px-1.5 py-0.5 rounded border border-[#2a313b]">
                          SILO {t.siloNumber}
                        </span>
                      </div>
                      <div className="text-sm font-mono font-bold text-[#e8ebe6]">
                        {formatLbs(t.lbs)}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#9aa3ad] font-normal">
                        <span>{t.timeOfDay || (t.createdAt ? new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—')}</span>
                        <span className="truncate max-w-[80px] text-[#9aa3ad]" title={t.sandType}>
                          {t.sandType}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

      {/* Form Card */}
      <form
        onSubmit={handleSubmit}
        className="bg-[#14171c] border border-[#2a313b] rounded-2xl p-5 sm:p-7 text-[#e8ebe6] shadow-xl space-y-6"
      >
        {/* LIVE TARGET SILO ON-HAND & % FULL MONITOR CARD */}
        <div
          className={`border rounded-xl p-4 sm:p-5 space-y-3 transition shadow ${
            highlightSilo
              ? 'bg-[#1b2027] border-[#c23b32] ring-2 ring-[#c23b32]/40'
              : 'bg-[#0b0c0e] border-[#2a313b]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="bg-[#1b2027] text-[#e8ebe6] border border-[#2a313b] font-bold text-xs px-2.5 py-1 rounded-lg font-display">
                SILO #{siloNumber}
              </span>
              <span className="text-xs font-semibold text-[#e8ebe6]">
                {currentSiloConfig?.name || `Silo ${siloNumber}`} (Side {currentSiloConfig?.side || 'A'})
              </span>
              <span className="text-xs text-[#9aa3ad] font-mono font-medium">
                • {sandType}
              </span>
            </div>

            <div className="text-right">
              <span className="text-xs font-mono font-bold text-[#e8ebe6]">
                {formatLbs(onHandLbs)}
              </span>
              <span className="text-[10px] text-[#9aa3ad] ml-1.5 font-mono">
                ({onHandTons} / {maxTons} T)
              </span>
            </div>
          </div>

          {/* Progress Fill Bar */}
          <div className="space-y-1.5">
            <div className="h-3.5 bg-[#14171c] rounded-full overflow-hidden border border-[#2a313b] relative">
              {/* Current Fill */}
              <div
                className={`h-full transition-all duration-500 ${
                  percentFull >= 95
                    ? 'bg-[#c23b32]'
                    : percentFull >= 80
                    ? 'bg-[#d4a017]'
                    : 'bg-[#8fa37a]'
                }`}
                style={{ width: `${percentFull}%` }}
              />
              {/* Projected Increase Overlay */}
              {deliveryWeightLbs > 0 && projectedPercentFull > percentFull && (
                <div
                  className="h-full bg-[#8fa37a]/60 animate-pulse absolute top-0"
                  style={{
                    left: `${percentFull}%`,
                    width: `${Math.min(100 - percentFull, projectedPercentFull - percentFull)}%`,
                  }}
                />
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono">
              <div className="text-[#9aa3ad] font-medium">
                CURRENT: <span className="text-[#e8ebe6] font-bold">{percentFull}% FULL</span>
              </div>
              {deliveryWeightLbs > 0 && (
                <div className="text-[#8fa37a] font-bold flex items-center gap-1">
                  <span>+ {deliveryWeightLbs.toLocaleString()} LBS ➔</span>
                  <span className="text-[#e8ebe6] underline">
                    {formatLbs(projectedOnHandLbs)} ({projectedPercentFull}%)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RAW SCANNED VALUE DISPLAY BOX */}
        {scannedInfo && (
          <div className="bg-[#0b0c0e] border border-[#2a313b] p-4 rounded-xl space-y-1.5 shadow animate-in fade-in">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#9aa3ad]">
              <span className="flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-[#8fa37a]" /> Scanned Barcode / QR:
              </span>
              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                {scannedInfo.winningScale && (
                  <span className="bg-[#142319] text-[#8fa37a] border border-[#8fa37a]/40 px-2 py-0.5 rounded-md">
                    {scannedInfo.winningScale}
                  </span>
                )}
                <span className="bg-[#1b2027] text-[#9aa3ad] border border-[#2a313b] px-2.5 py-0.5 rounded-md">
                  FORMAT: {scannedInfo.format}
                </span>
              </div>
            </div>
            <div className="text-sm sm:text-base font-mono font-bold text-[#e8ebe6] break-all bg-[#14171c] p-3 rounded-lg border border-[#2a313b]">
              {scannedInfo.rawValue}
            </div>
          </div>
        )}

        {/* Capacity Overfill Warning */}
        {isOverCapacityWarning && (
          <div className="bg-[#260e0c] border border-[#c23b32]/60 p-4 rounded-xl text-[#e8ebe6] text-xs font-medium flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#e25a4a] shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-[#e25a4a] uppercase text-sm font-display">
                ⚠️ SILO #{siloNumber} CAPACITY WARNING
              </div>
              Adding {deliveryWeightLbs.toLocaleString()} lbs will bring Silo #{siloNumber}'s
              on-hand total to{' '}
              <span className="font-mono text-[#e8ebe6] font-bold">
                {projectedOnHandLbs.toLocaleString()} lbs
              </span>
              , which exceeds its rated capacity of{' '}
              <span className="font-mono text-[#d4a017] font-bold">
                {maxCapacityLbs.toLocaleString()} lbs
              </span>
              .
            </div>
          </div>
        )}

        {/* Product Code Pairing Prompt */}
        {unrecognizedProductCode && (
          <div className="bg-[#291e0a] border border-[#d4a017]/40 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-[#d4a017] shrink-0" />
              <div className="text-xs text-[#e8ebe6]">
                New Product Code <strong className="text-[#e8ebe6] font-mono">{unrecognizedProductCode}</strong>.
                Remember pairing with <strong className="text-[#e8ebe6]">{sandType}</strong>?
              </div>
            </div>
            <button
              type="button"
              onClick={handleRememberProductCodePairing}
              className="bg-[#d4a017] hover:bg-[#e25a4a] text-[#0b0c0e] hover:text-[#e8ebe6] font-semibold text-xs px-3.5 py-2 rounded-xl transition active:scale-95 shrink-0 cursor-pointer"
            >
              Remember Mapping
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Ticket Number */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold uppercase text-[#9aa3ad]">
                TICKET NUMBER *
              </label>
              {duplicateDelivery && (
                <button
                  type="button"
                  onClick={() => setIsDuplicateModalOpen(true)}
                  className="bg-[#260e0c] hover:bg-[#3d1613] text-[#e25a4a] border border-[#c23b32]/50 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 transition cursor-pointer"
                >
                  <AlertTriangle className="w-3 h-3 text-[#e25a4a]" />
                  <span>ALREADY RECORDED</span>
                </button>
              )}
            </div>
            <div className="relative flex items-center">
              <input
                ref={ticketInputRef}
                type="text"
                inputMode="numeric"
                placeholder="e.g. 1049823"
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                className={`w-full bg-[#0b0c0e] border rounded-xl p-3.5 pr-12 text-lg font-mono font-bold text-[#e8ebe6] uppercase focus:outline-none min-h-[48px] ${
                  errors.ticketNumber
                    ? 'border-[#c23b32]'
                    : duplicateDelivery
                    ? 'border-[#c23b32] text-[#e25a4a]'
                    : 'border-[#2a313b] focus:border-[#c23b32]'
                }`}
              />
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                title="Scan Ticket Barcode / QR"
                className="absolute right-2 p-2.5 bg-[#c23b32] hover:bg-[#e25a4a] active:bg-[#a63028] text-[#e8ebe6] rounded-lg transition active:scale-95 cursor-pointer min-h-[36px] flex items-center justify-center"
              >
                <QrCode className="w-4 h-4 stroke-[2]" />
              </button>
            </div>
            {errors.ticketNumber && (
              <p className="text-xs text-[#e25a4a] mt-1 font-medium">{errors.ticketNumber}</p>
            )}
          </div>

          {/* Silo Destination */}
          <div>
            <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">
              DESTINATION SILO *
            </label>
            <select
              value={siloNumber}
              onChange={(e) => handleSiloChange(parseInt(e.target.value, 10))}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3.5 text-base font-bold text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none min-h-[48px]"
            >
              {state.config.silos.map((s) => (
                <option key={s.siloNumber} value={s.siloNumber}>
                  {s.name || `Silo #${s.siloNumber}`} (Side {s.side || 'A'}) — {s.sandType || 'No Sand'}{' '}
                  {s.isOutOfService ? '[OFFLINE]' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sand Type */}
          <div>
            <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">
              SAND TYPE
            </label>
            <select
              value={sandType}
              onChange={(e) => setSandType(e.target.value)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3.5 text-base font-bold text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none min-h-[48px]"
            >
              {state.config.sandTypes.map((st) => (
                <option key={st.id} value={st.name}>
                  {st.name}
                </option>
              ))}
            </select>
            {(() => {
              const selectedSilo = state.config.silos.find((s) => s.siloNumber === siloNumber);
              if (selectedSilo && selectedSilo.sandType !== sandType) {
                return (
                  <div className="mt-2 bg-[#0b0c0e] border border-[#d4a017]/40 rounded-xl p-2.5 text-xs text-[#e8ebe6] flex flex-wrap items-center justify-between gap-2 shadow-inner">
                    <span className="text-[#9aa3ad]">
                      Silo #{siloNumber} is currently assigned to <strong className="text-[#e8ebe6]">{selectedSilo.sandType || 'Unassigned'}</strong>.
                    </span>
                    {onChangeSiloSand && (
                      <button
                        type="button"
                        onClick={() => onChangeSiloSand(siloNumber, sandType)}
                        className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] border border-[#2a313b] font-semibold px-2.5 py-1 rounded-lg text-xs transition active:scale-95 cursor-pointer"
                      >
                        Set Silo to {sandType}
                      </button>
                    )}
                  </div>
                );
              }
              return null;
            })()}
          </div>

          {/* Sand Weight in LBS */}
          <div>
            <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">
              SAND WEIGHT (LBS) *
            </label>
            <input
              type="number"
              inputMode="numeric"
              placeholder="e.g. 48200"
              value={lbs}
              onChange={(e) => setLbs(e.target.value)}
              className={`w-full bg-[#0b0c0e] border rounded-xl p-3.5 text-lg font-mono font-bold text-[#e8ebe6] focus:outline-none min-h-[48px] ${
                errors.lbs ? 'border-[#c23b32]' : 'border-[#2a313b] focus:border-[#c23b32]'
              }`}
            />
            <div className="text-xs text-[#9aa3ad] font-mono mt-1">
              ≈ {((parseInt(lbs, 10) || 0) / (state.config.lbsPerTon || 2000)).toFixed(2)} Tons
            </div>
            {errors.lbs && <p className="text-xs text-[#e25a4a] mt-1 font-medium">{errors.lbs}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Supplier */}
          <div>
            <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">SUPPLIER</label>
            {supplierList.length === 1 ? (
              <div className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3.5 text-sm font-bold text-[#e8ebe6] flex items-center justify-between min-h-[48px]">
                <span>{supplierList[0]}</span>
                <span className="text-[10px] font-mono font-medium uppercase text-[#9aa3ad] bg-[#14171c] border border-[#2a313b] px-2.5 py-1 rounded-md">
                  Configured
                </span>
              </div>
            ) : supplierList.length > 1 ? (
              <div className="space-y-2">
                <select
                  value={selectedSupplierOpt}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedSupplierOpt(val);
                    if (val === '__OTHER__') {
                      setSupplier(customSupplier);
                    } else {
                      setSupplier(val);
                    }
                  }}
                  className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3.5 text-sm font-medium text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none min-h-[48px]"
                >
                  {supplierList.map((sup) => (
                    <option key={sup} value={sup}>
                      {sup}
                    </option>
                  ))}
                  <option value="__OTHER__">+ Other (type it)...</option>
                </select>

                {selectedSupplierOpt === '__OTHER__' && (
                  <div>
                    <input
                      type="text"
                      placeholder="Type one-off supplier name..."
                      value={customSupplier}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomSupplier(val);
                        setSupplier(val);
                      }}
                      className="w-full bg-[#0b0c0e] border border-[#2a313b] focus:border-[#c23b32] rounded-xl p-3 text-sm font-medium text-[#e8ebe6] focus:outline-none"
                      required
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3.5 space-y-2">
                <div className="text-xs font-semibold text-[#9aa3ad] flex items-center justify-between">
                  <span>No suppliers set up</span>
                  {onNavigateToSetup && (
                    <button
                      type="button"
                      onClick={onNavigateToSetup}
                      className="text-xs font-semibold text-[#e25a4a] hover:text-[#e8ebe6] underline uppercase flex items-center gap-1 cursor-pointer"
                    >
                      Go to Setup ➔
                    </button>
                  )}
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Type supplier name..."
                    value={customSupplier}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomSupplier(val);
                      setSupplier(val);
                    }}
                    className="w-full bg-[#14171c] border border-[#2a313b] rounded-lg p-2.5 text-xs font-medium text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">DELIVERY DATE</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3.5 text-sm font-medium text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none min-h-[48px]"
            />
          </div>

          {/* Time of Day */}
          <div>
            <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">TIME OF DAY</label>
            <input
              type="time"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3.5 text-sm font-medium text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none min-h-[48px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Driver Name */}
          <div>
            <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">DRIVER NAME (OPTIONAL)</label>
            <input
              type="text"
              placeholder="e.g. John Doe"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3.5 text-sm font-medium text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none min-h-[48px]"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">NOTES / BOL REF</label>
            <input
              type="text"
              placeholder="e.g. Bill of Lading #9042"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-3.5 text-sm font-medium text-[#e8ebe6] focus:border-[#c23b32] focus:outline-none min-h-[48px]"
            />
          </div>
        </div>

        {/* Photo Attachment Room */}
        <div>
          <label className="block text-xs font-semibold uppercase text-[#9aa3ad] mb-2">
            TICKET PHOTO ATTACHMENT
          </label>
          <div className="bg-[#0b0c0e] border-2 border-dashed border-[#2a313b] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-[#1b2027] text-[#9aa3ad] p-3 rounded-xl border border-[#2a313b]">
                <Camera className="w-5 h-5 stroke-[2]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#e8ebe6]">Attach Ticket Scan / BOL Photo</div>
                <div className="text-[10px] text-[#9aa3ad]">Capture with device camera or choose from gallery</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="bg-[#c23b32] hover:bg-[#e25a4a] text-[#e8ebe6] font-semibold px-3.5 py-2 rounded-xl text-xs shadow-md cursor-pointer transition flex items-center gap-1.5 uppercase">
                <Camera className="w-4 h-4" />
                <span>TAKE PHOTO</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>

              <label className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] font-semibold px-3 py-2 rounded-xl text-xs border border-[#2a313b] cursor-pointer transition uppercase">
                <span>BROWSE</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {photoUrl && (
            <div className="mt-3 bg-[#0b0c0e] p-3 rounded-xl border border-[#2a313b] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src={photoUrl} alt="Ticket preview" className="h-16 w-16 rounded-lg object-cover border border-[#2a313b]" />
                <div>
                  <div className="text-xs font-semibold text-[#8fa37a] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ticket Photo Attached
                  </div>
                  <div className="text-[10px] text-[#9aa3ad] font-mono">Ready to upload with delivery ticket</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPhotoUrl(null)}
                className="text-xs text-[#e25a4a] hover:text-[#c23b32] font-semibold px-3 py-1.5 rounded-lg hover:bg-[#260e0c] border border-transparent hover:border-[#c23b32]/40 transition cursor-pointer"
              >
                REMOVE PHOTO
              </button>
            </div>
          )}
        </div>

        {/* Buttons - Sticky at bottom for easy thumb access on mobile */}
        <div className="sticky bottom-4 z-30 bg-[#14171c]/95 backdrop-blur-md p-3.5 rounded-xl border border-[#2a313b] shadow-2xl flex items-center justify-between gap-3 mt-6">
          {(onDone || onCancel) ? (
            <button
              type="button"
              onClick={onDone || onCancel}
              className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] font-semibold text-sm px-5 py-3.5 rounded-xl border border-[#2a313b] transition min-h-[48px] flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4 text-[#8fa37a] stroke-[2]" />
              <span>DONE</span>
            </button>
          ) : <div />}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 sm:flex-initial bg-[#c23b32] hover:bg-[#e25a4a] active:bg-[#a63028] text-[#e8ebe6] font-semibold text-base px-6 py-3.5 rounded-xl shadow-xl transition active:scale-95 flex items-center justify-center gap-2 min-h-[48px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-5 h-5 stroke-[2]" />
            <span className="font-display tracking-wider">{isSubmitting ? 'SAVING TICKET...' : 'SAVE TICKET ENTRY'}</span>
          </button>
        </div>
      </form>

      {/* LAST 5 TICKETS LOGGED THIS SESSION (WITH UNDO) */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#9aa3ad] border-b border-[#2a313b] pb-3">
          <span className="flex items-center gap-2 font-display text-sm text-[#e8ebe6]">
            <Truck className="w-4 h-4 text-[#8fa37a]" /> LAST 5 TICKETS LOGGED THIS SESSION
          </span>
          <span className="bg-[#1b2027] text-[#9aa3ad] px-2.5 py-0.5 rounded-md font-mono text-xs border border-[#2a313b]">
            {sessionTickets.length} ENTERED
          </span>
        </div>

        {sessionTickets.length === 0 ? (
          <div className="text-center py-8 text-[#9aa3ad] text-xs font-medium uppercase tracking-wider">
            No tickets logged in this session yet. Consecutive entries will appear here with instant undo.
          </div>
        ) : (
          <div className="space-y-2.5">
            {sessionTickets.map((t) => (
              <div
                key={t.id}
                className="bg-[#0b0c0e] border border-[#2a313b] hover:border-[#9aa3ad]/40 p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-[#e8ebe6] text-sm">
                      #{t.ticketNumber}
                    </span>
                    <span className="bg-[#1b2027] text-[#e8ebe6] text-[11px] font-semibold px-2 py-0.5 rounded uppercase border border-[#2a313b]">
                      Silo #{t.siloNumber}
                    </span>
                    <span className="text-[11px] text-[#9aa3ad] font-medium bg-[#14171c] px-2 py-0.5 rounded border border-[#2a313b]">
                      {t.sandType}
                    </span>
                    {t.timeOfDay && (
                      <span className="text-[10px] font-mono text-[#9aa3ad]">
                        {t.timeOfDay}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#9aa3ad]">
                    Supplier: <span className="text-[#e8ebe6] font-medium">{t.supplier || 'N/A'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3.5">
                  <div className="text-left sm:text-right">
                    <div className="font-mono font-bold text-[#e8ebe6] text-sm">
                      {t.lbs.toLocaleString()} LBS
                    </div>
                    <div className="text-[10px] font-mono text-[#8fa37a] font-semibold">
                      {(t.lbs / lbsPerTon).toFixed(2)} Tons
                    </div>
                  </div>

                  {onDeleteDelivery && (
                    <button
                      type="button"
                      onClick={() => handleUndoTicket(t)}
                      className="bg-[#1b2027] hover:bg-[#260e0c] active:bg-[#3d1613] text-[#9aa3ad] hover:text-[#e25a4a] border border-[#2a313b] hover:border-[#c23b32]/50 px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition active:scale-95 shadow-sm cursor-pointer"
                      title="Undo and remove this ticket entry"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>UNDO</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

      {/* Ticket Scanner Modal */}
      <TicketScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScanSuccess}
        title="SCAN SAND TICKET"
        mappings={state.config.productCodeMappings || []}
      />
    </div>
  );
}
