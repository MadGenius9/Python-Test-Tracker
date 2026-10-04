import { AlertTriangle, Camera, CheckCircle2, QrCode, Save, Sparkles, Truck, Volume2, Tag, Plus, ArrowRight } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { getSiloDerivedStates } from '../lib/sandRules';
import {
  parseTicketScanValue,
  findDuplicateDelivery,
  findDeletedDelivery,
  normalizeTicketNumber,
  getLastUsedSupplier,
  setLastUsedSupplier,
  ParsedTicketScan,
} from '../lib/ticketUtils';
import { getOperationalDate, getOperationalTime } from '../lib/dateUtils';
import { AppState, DeliveryTicket } from '../types';
import TicketScannerModal, { ScanResult } from './TicketScannerModal';
import DuplicateWarningModal from './DuplicateWarningModal';
import ScanConfirmationModal from './ScanConfirmationModal';

interface QuickEntryProps {
  state: AppState;
  onAddDelivery: (delivery: {
    ticketNumber: string;
    siloNumber: number;
    sandType: string;
    lbs: number;
    supplier: string;
    date: string;
    timeOfDay?: string;
    carrier?: string;
    truck?: string;
    poNumber?: string;
    productCode?: string;
    supervisorOverride?: boolean;
    overrideReason?: string;
    scanMetadata?: any;
  }) => Promise<void> | void;
  onSaveProductCodeMapping?: (mineCode: string, sandType: string) => Promise<void> | void;
  onNavigateToSetup?: () => void;
}

export default function QuickEntry({ state, onAddDelivery, onSaveProductCodeMapping, onNavigateToSetup }: QuickEntryProps) {
  const ticketInputRef = useRef<HTMLInputElement | null>(null);

  const siloDerivedStates = getSiloDerivedStates(state);
  const defaultSiloNum = state.config.silos[0]?.siloNumber || 1;
  const initialSiloObj = state.config.silos.find((s) => s.siloNumber === defaultSiloNum);

  const todayStr = getOperationalDate();

  // Persistent session states for quick consecutive logging
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

  // Additional fields from Atlas 6-part QR
  const [truck, setTruck] = useState<string>('');
  const [poNumber, setPoNumber] = useState<string>('');
  const [productCode, setProductCode] = useState<string>('');
  const [unrecognizedProductCode, setUnrecognizedProductCode] = useState<string | null>(null);

  // Visually prominent silo highlight after scan
  const [highlightSilo, setHighlightSilo] = useState<boolean>(false);

  // Session-logged tickets feed (last 5 in current session)
  const [sessionTickets, setSessionTickets] = useState<DeliveryTicket[]>([]);

  // Scan & feedback state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedInfo, setScannedInfo] = useState<{
    rawValue: string;
    format: string;
    parser?: string;
    confidence?: string;
    winningScale?: string;
    engine?: string;
  } | null>(null);

  // Confirmation modal state
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [pendingScan, setPendingScan] = useState<ParsedTicketScan | null>(null);
  const [scanCandidates, setScanCandidates] = useState<ParsedTicketScan[]>([]);

  const [justSavedFlash, setJustSavedFlash] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-focus ticket input on mount
  useEffect(() => {
    ticketInputRef.current?.focus();
  }, []);

  // Update default sand type when silo selection changes
  const handleSiloChange = (num: number) => {
    setSiloNumber(num);
    setHighlightSilo(false);
    const siloObj = state.config.silos.find((s) => s.siloNumber === num);
    if (siloObj && siloObj.sandType) {
      setSandType(siloObj.sandType);
    }
  };

  // Selected Target Silo Derived Info
  const selectedSiloDerived = siloDerivedStates.find((s) => s.siloNumber === siloNumber);
  const lbsPerTon = state.config.lbsPerTon || 2000;
  const onHandLbs = selectedSiloDerived?.onHandLbs || 0;
  const maxCapacityLbs = selectedSiloDerived?.maxCapacityLbs || 350000;
  const percentFull = Math.min(100, Math.max(0, Math.round((onHandLbs / maxCapacityLbs) * 100)));
  const onHandTons = (onHandLbs / lbsPerTon).toFixed(1);
  const maxTons = (maxCapacityLbs / lbsPerTon).toFixed(1);

  // Duplicate ticket check across ALL deliveries on this pad
  const duplicateDelivery = findDuplicateDelivery(ticketNumber, state.deliveries);
  const deletedDeliveryMatch = findDeletedDelivery(ticketNumber, state.deletedDeliveries);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  const handleCloseDuplicateModal = () => {
    setIsDuplicateModalOpen(false);
    setTimeout(() => {
      ticketInputRef.current?.focus();
    }, 100);
  };

  // Apply parsed ticket to quick entry form
  const applyParsedTicket = (parsed: ParsedTicketScan) => {
    if (parsed.ticketNumber) setTicketNumber(parsed.ticketNumber);
    if (parsed.lbs) setLbs(parsed.lbs.toString());
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

    // Silo is NOT in QR code -> make silo picker prominent
    setHighlightSilo(true);

    // Duplicate check on normalized ticket
    if (parsed.ticketNumber) {
      const norm = normalizeTicketNumber(parsed.ticketNumber);
      const dup = findDuplicateDelivery(norm, state.deliveries);
      if (dup) {
        setIsDuplicateModalOpen(true);
      }
    }

    // Focus ticket field or allow immediate confirmation
    setTimeout(() => {
      ticketInputRef.current?.focus();
    }, 100);
  };

  // Handle Scan Result from TicketScannerModal
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
      setPendingScan(parsed);
      setScanCandidates(candidates || [parsed]);
      setIsConfirmationModalOpen(true);
    } else {
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
      console.error('Failed to save mapping:', err);
    }
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  // Core execution helper for saving
  const executeSaveTicket = async (opts?: { supervisorOverride?: boolean; overrideReason?: string }) => {
    const cleanTicket = normalizeTicketNumber(ticketNumber);
    if (!cleanTicket) {
      alert('Please enter or scan a ticket number.');
      ticketInputRef.current?.focus();
      return;
    }

    const weightLbs = parseInt(lbs, 10);
    if (isNaN(weightLbs) || weightLbs <= 0) {
      alert('Please enter a valid weight in lbs.');
      return;
    }

    setIsSubmitting(true);
    if (supplier.trim()) {
      setLastUsedSupplier(supplier.trim());
    }
    const nowTimeStr = getOperationalTime();

    const newTicketRecord: DeliveryTicket = {
      id: `session-${Date.now()}`,
      ticketNumber: cleanTicket,
      siloNumber,
      sandType,
      lbs: weightLbs,
      supplier,
      date: todayStr,
      timeOfDay: nowTimeStr,
      createdAt: Date.now(),
      carrier: supplier,
      truck: truck || undefined,
      poNumber: poNumber || undefined,
      productCode: productCode || undefined,
      supervisorOverride: opts?.supervisorOverride,
      overrideReason: opts?.overrideReason,
    };

    try {
      await onAddDelivery({
        ticketNumber: cleanTicket,
        siloNumber,
        sandType,
        lbs: weightLbs,
        supplier,
        date: todayStr,
        timeOfDay: nowTimeStr,
        carrier: supplier,
        truck: truck || undefined,
        poNumber: poNumber || undefined,
        productCode: productCode || undefined,
        supervisorOverride: opts?.supervisorOverride,
        overrideReason: opts?.overrideReason,
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

      // Confirm with Vibration & Flash
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([100, 50, 100]);
        } catch (e) {
          // ignore
        }
      }

      // Add to session feed
      setSessionTickets((prev) => [newTicketRecord, ...prev].slice(0, 5));

      // Trigger Green Flash message
      setJustSavedFlash(`TICKET #${cleanTicket} SAVED (${weightLbs.toLocaleString()} LBS TO SILO #${siloNumber})`);
      setTimeout(() => setJustSavedFlash(null), 3500);

      // Clear ticket number & weight & scanned metadata, keep silo selected for consecutive loads
      setTicketNumber('');
      setLbs('');
      setTruck('');
      setPoNumber('');
      setProductCode('');
      setUnrecognizedProductCode(null);
      setScannedInfo(null);
      setHighlightSilo(false);

      // Return focus to ticket number field for next entry
      setTimeout(() => {
        ticketInputRef.current?.focus();
      }, 150);
    } catch (err: any) {
      console.error('Error saving quick ticket:', err);
      const msg = err?.message || 'Failed to save ticket to Firestore.';
      setSaveError(msg);
      alert(`Failed to save ticket: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Form Submission / Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const cleanTicket = normalizeTicketNumber(ticketNumber);
    if (!cleanTicket) {
      alert('Please enter or scan a ticket number.');
      ticketInputRef.current?.focus();
      return;
    }

    const weightLbs = parseInt(lbs, 10);
    if (isNaN(weightLbs) || weightLbs <= 0) {
      alert('Please enter a valid weight in lbs.');
      return;
    }

    // Duplicate check on normalized ticket number
    const dup = findDuplicateDelivery(cleanTicket, state.deliveries);
    if (dup) {
      setIsDuplicateModalOpen(true);
      return;
    }

    await executeSaveTicket();
  };

  const formattedToday = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between selection:bg-amber-500 selection:text-slate-950">
      <div className="max-w-xl mx-auto w-full p-4 space-y-4 pb-28">
        {/* Top Header: Pad Name & Today's Date */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex items-center justify-between text-xs shadow-lg">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-black uppercase tracking-wider text-amber-400">
              PAD: {state.config.padName || 'ALPHA-1'}
            </span>
          </div>
          <div className="font-mono font-bold text-slate-400 uppercase tracking-wide">
            {formattedToday}
          </div>
        </div>

        {/* Save Error Red Banner */}
        {saveError && (
          <div className="bg-red-600 border-2 border-red-400 text-white p-4 rounded-2xl font-black text-sm text-center shadow-2xl flex items-center justify-center gap-2">
            <AlertTriangle className="w-5 h-5 stroke-[3]" />
            <span>SAVE FAILED: {saveError}</span>
          </div>
        )}

        {/* Saved Success Green Flash Banner */}
        {justSavedFlash && (
          <div className="bg-emerald-500 text-slate-950 p-4 rounded-2xl font-black text-sm text-center shadow-2xl border-2 border-emerald-300 animate-bounce flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 stroke-[3]" />
            <span>{justSavedFlash}</span>
          </div>
        )}

        {/* 1. BIG SCAN TICKET BUTTON - Largest thing on the screen */}
        <button
          type="button"
          onClick={() => setIsScannerOpen(true)}
          className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black py-6 px-6 rounded-3xl shadow-2xl border-4 border-amber-300 flex flex-col items-center justify-center gap-2 uppercase tracking-wider transition active:scale-[0.98] cursor-pointer min-h-[96px]"
        >
          <div className="flex items-center gap-3 text-2xl sm:text-3xl">
            <QrCode className="w-8 h-8 sm:w-10 sm:h-10 stroke-[2.5]" />
            <span>SCAN TICKET</span>
          </div>
          <span className="text-xs font-bold text-slate-900/80 tracking-normal normal-case">
            Scan 1D barcode or 2D code on freight BOL
          </span>
        </button>

        {/* Scanned Raw Info Banner */}
        {scannedInfo && (
          <div className="bg-slate-900 border-2 border-amber-500/80 p-3.5 rounded-2xl text-xs space-y-2">
            <div className="flex items-center justify-between font-black uppercase text-amber-400 flex-wrap gap-2">
              <span className="flex items-center gap-1.5">
                <QrCode className="w-4 h-4" /> Scanned Ticket Code:
              </span>
              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                {scannedInfo.winningScale && (
                  <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40">
                    {scannedInfo.winningScale}
                  </span>
                )}
                <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/40">
                  {scannedInfo.format}
                </span>
              </div>
            </div>
            <div className="font-mono font-bold text-amber-300 break-all bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
              {scannedInfo.rawValue}
            </div>

            {(truck || poNumber || productCode) && (
              <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800 text-[11px] font-mono">
                {truck && (
                  <span className="bg-slate-950 border border-slate-700 px-2 py-1 rounded text-slate-300 font-bold">
                    Truck: <strong className="text-white">{truck}</strong>
                  </span>
                )}
                {poNumber && (
                  <span className="bg-slate-950 border border-slate-700 px-2 py-1 rounded text-slate-300 font-bold">
                    PO: <strong className="text-white">{poNumber}</strong>
                  </span>
                )}
                {productCode && (
                  <span className="bg-slate-950 border border-slate-700 px-2 py-1 rounded text-slate-300 font-bold">
                    Mine Code: <strong className="text-amber-400">{productCode}</strong>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Unrecognized Product Code Warning Note */}
        {unrecognizedProductCode && (
          <div className="bg-amber-500/10 border-2 border-amber-500 text-amber-300 p-4 rounded-2xl space-y-2 text-xs shadow-xl">
            <div className="flex items-center gap-2 font-black uppercase text-amber-400">
              <Tag className="w-5 h-5 shrink-0" />
              <span>Unknown product code "{unrecognizedProductCode}" — pick the sand type and I'll remember it.</span>
            </div>
            {onSaveProductCodeMapping && (
              <button
                type="button"
                onClick={handleRememberProductCodePairing}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 px-4 rounded-xl shadow-lg uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>SAVE PAIRING: {unrecognizedProductCode} ➔ {sandType}</span>
              </button>
            )}
          </div>
        )}

        {/* Duplicate Warning Modal */}
        {isDuplicateModalOpen && duplicateDelivery && (
          <DuplicateWarningModal
            duplicate={duplicateDelivery}
            lbsPerTon={lbsPerTon}
            onClose={handleCloseDuplicateModal}
          />
        )}

        {/* Quick Entry Form */}
        <form onSubmit={handleSave} className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl">
          {/* Ticket Number Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-black uppercase tracking-wider text-amber-400">
                TICKET NUMBER *
              </label>
              {duplicateDelivery && (
                <button
                  type="button"
                  onClick={() => setIsDuplicateModalOpen(true)}
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/50 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition"
                >
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span>ALREADY RECORDED (REVIEW)</span>
                </button>
              )}
            </div>
            <input
              ref={ticketInputRef}
              type="text"
              inputMode="numeric"
              placeholder="e.g. 1049823"
              value={ticketNumber}
              onChange={(e) => setTicketNumber(e.target.value)}
              className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl px-4 py-3.5 text-xl font-mono font-black text-white focus:border-amber-500 focus:outline-none min-h-[52px]"
              required
            />
          </div>

          {/* Target Silo Selector */}
          <div className={highlightSilo ? 'p-3 rounded-2xl bg-amber-500/10 border-2 border-amber-400 animate-pulse space-y-1' : ''}>
            {highlightSilo && (
              <div className="bg-amber-500 text-slate-950 font-black text-xs uppercase px-3 py-1 rounded-xl flex items-center gap-1.5 mb-1.5">
                <ArrowRight className="w-4 h-4 stroke-[3]" />
                <span>SELECT TARGET SILO (MANUAL PICK REQUIRED — NOT IN QR CODE)</span>
              </div>
            )}
            <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
              TARGET SILO *
            </label>
            <select
              value={siloNumber}
              onChange={(e) => handleSiloChange(parseInt(e.target.value, 10))}
              className={`w-full bg-slate-950 border-2 rounded-2xl px-4 py-3.5 text-base font-black focus:outline-none min-h-[52px] ${
                highlightSilo
                  ? 'border-amber-400 text-amber-300 ring-2 ring-amber-400'
                  : 'border-slate-700 text-amber-400 focus:border-amber-500'
              }`}
            >
              {state.config.silos.map((s) => (
                <option key={s.siloNumber} value={s.siloNumber}>
                  {s.name || `Silo #${s.siloNumber}`} (Side {s.side || 'A'}) — {s.sandType || 'Unassigned'}
                  {s.isOutOfService ? ' [OFFLINE]' : ''}
                </option>
              ))}
            </select>

            {/* TARGET SILO ON-HAND & PERCENT FULL LIVE STATUS */}
            <div className="mt-2.5 bg-slate-950 border border-slate-800 p-3 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs font-black">
                <span className="text-slate-400 uppercase">
                  Target Silo #{siloNumber} On-Hand:
                </span>
                <span className="text-amber-400 font-mono text-sm">
                  {onHandLbs.toLocaleString()} lbs ({onHandTons} T)
                </span>
              </div>

              {/* Visual Fill Progress Bar */}
              <div className="w-full bg-slate-800 h-3.5 rounded-full overflow-hidden p-0.5 border border-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    percentFull >= 90
                      ? 'bg-red-500'
                      : percentFull >= 75
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${percentFull}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                <span>Capacity: {maxCapacityLbs.toLocaleString()} lbs ({maxTons} T)</span>
                <span className={`font-mono font-black ${percentFull >= 90 ? 'text-red-400' : 'text-amber-400'}`}>
                  {percentFull}% Full
                </span>
              </div>
            </div>
          </div>

          {/* Amount (lbs) Input */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
              AMOUNT (LBS) *
            </label>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                placeholder="lbs"
                value={lbs}
                onChange={(e) => setLbs(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl px-4 py-3.5 text-lg font-mono font-black text-white focus:border-amber-500 focus:outline-none min-h-[52px]"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-500">
                {lbs && !isNaN(parseInt(lbs, 10))
                  ? `${(parseInt(lbs, 10) / lbsPerTon).toFixed(1)} Tons`
                  : ''}
              </span>
            </div>
          </div>

          {/* Supplier */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
              SUPPLIER *
            </label>
            {supplierList.length === 1 ? (
              <div className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl px-4 py-3 text-sm font-black text-amber-400 flex items-center justify-between min-h-[48px]">
                <span>{supplierList[0]}</span>
                <span className="text-[10px] font-mono font-bold uppercase text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
                  Configured Supplier
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
                  className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none min-h-[48px]"
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
                      placeholder="Type one-off supplier / hauler name..."
                      value={customSupplier}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomSupplier(val);
                        setSupplier(val);
                      }}
                      className="w-full bg-slate-950 border-2 border-amber-500/80 rounded-2xl p-3 text-sm font-bold text-amber-300 focus:border-amber-400 focus:outline-none"
                      required
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-950 border-2 border-slate-700 rounded-2xl p-3.5 space-y-2">
                <div className="text-xs font-bold text-amber-400 flex items-center justify-between">
                  <span>No suppliers set up</span>
                  {onNavigateToSetup && (
                    <button
                      type="button"
                      onClick={onNavigateToSetup}
                      className="text-xs font-black text-amber-400 hover:text-amber-300 underline uppercase flex items-center gap-1 cursor-pointer"
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
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sand Type */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1.5">
              SAND TYPE *
            </label>
            <select
              value={sandType}
              onChange={(e) => setSandType(e.target.value)}
              className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-white focus:border-amber-500 focus:outline-none min-h-[48px]"
            >
              {state.config.sandTypes.map((st) => (
                <option key={st.id} value={st.name}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>

          {/* Big Save Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black py-4 px-6 rounded-2xl shadow-xl border-2 border-emerald-300 text-lg uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-[0.98] min-h-[56px] cursor-pointer mt-2"
          >
            <Save className="w-6 h-6 stroke-[2.5]" />
            <span>{isSubmitting ? 'SAVING TICKET...' : 'SAVE TICKET'}</span>
          </button>
        </form>

        {/* Last 5 Tickets Logged This Session */}
        <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-4 space-y-3 shadow-xl">
          <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
            <span className="flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-amber-400" /> LAST 5 TICKETS LOGGED THIS SESSION
            </span>
            <span className="bg-slate-800 text-amber-400 px-2 py-0.5 rounded font-mono">
              {sessionTickets.length} SAVED
            </span>
          </div>

          {sessionTickets.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs font-bold uppercase tracking-wider">
              No tickets logged in this session yet.
            </div>
          ) : (
            <div className="space-y-2">
              {sessionTickets.map((t) => (
                <div
                  key={t.id}
                  className="bg-slate-950 border border-slate-800 p-3 rounded-2xl flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-amber-400 text-sm">
                        #{t.ticketNumber}
                      </span>
                      <span className="bg-slate-800 text-slate-300 text-[10px] font-black px-2 py-0.5 rounded uppercase">
                        Silo #{t.siloNumber}
                      </span>
                      <span className="text-[10px] text-slate-400">{t.sandType}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Supplier: <span className="text-white font-bold">{t.supplier}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-black text-white text-sm">
                      {t.lbs.toLocaleString()} LBS
                    </div>
                    <div className="text-[10px] font-mono text-emerald-400 font-bold">
                      {(t.lbs / lbsPerTon).toFixed(1)} Tons
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
          onSupervisorOverride={async (reason) => {
            await executeSaveTicket({
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

      {/* Ticket Scanner Modal */}
      <TicketScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScanSuccess}
        title="SCAN SAND DELIVERY TICKET"
        mappings={state.config.productCodeMappings || []}
      />
    </div>
  );
}
