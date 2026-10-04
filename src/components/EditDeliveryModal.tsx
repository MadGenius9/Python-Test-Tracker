import { AlertTriangle, ArrowRight, CheckCircle2, Pencil, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { formatLbs, getSiloDerivedStates } from '../lib/sandRules';
import { normalizeTicketNumber } from '../lib/ticketUtils';
import { getOperationalDate } from '../lib/dateUtils';
import { AppState, DeliveryTicket } from '../types';

interface EditDeliveryModalProps {
  state: AppState;
  ticket: DeliveryTicket;
  onSave: (updates: Partial<Omit<DeliveryTicket, 'id' | 'createdAt'>>) => Promise<void>;
  onClose: () => void;
}

export default function EditDeliveryModal({ state, ticket, onSave, onClose }: EditDeliveryModalProps) {
  const [ticketNumber, setTicketNumber] = useState(ticket.ticketNumber || '');
  const [siloNumber, setSiloNumber] = useState<number>(ticket.siloNumber || 1);
  const [sandType, setSandType] = useState<string>(ticket.sandType || state.config.sandTypes[0]?.name || '100 Mesh');
  const [lbs, setLbs] = useState<string>(ticket.lbs ? ticket.lbs.toString() : '');
  const [supplier, setSupplier] = useState<string>(ticket.supplier || '');
  const [date, setDate] = useState(ticket.date || getOperationalDate());
  const [timeOfDay, setTimeOfDay] = useState(ticket.timeOfDay || '');
  const [driverName, setDriverName] = useState(ticket.driverName || '');
  const [notes, setNotes] = useState(ticket.notes || '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Supplier list from config
  const supplierList = state.config.suppliers || [];

  // Check duplicate ticket number (excluding THIS ticket id and deleted deliveries)
  const normInput = normalizeTicketNumber(ticketNumber);
  const duplicateDelivery = normInput
    ? state.deliveries.find(
        (d) => !d.deleted && d.id !== ticket.id && normalizeTicketNumber(d.ticketNumber) === normInput
      )
    : undefined;

  // Check sand type mismatch against selected silo configuration
  const selectedSiloConfig = state.config.silos.find((s) => s.siloNumber === siloNumber);
  const isSandTypeMismatch =
    selectedSiloConfig && selectedSiloConfig.sandType && selectedSiloConfig.sandType !== sandType;

  // Calculate current on-hand vs projected on-hand for affected silos
  const currentSiloDerivedStates = getSiloDerivedStates(state);

  const oldSilo = ticket.siloNumber;
  const newSilo = siloNumber;
  const newWeightLbs = parseInt(lbs, 10) || 0;

  // Simulate updated state with this ticket edited
  const simulatedDeliveries = state.deliveries.map((d) =>
    d.id === ticket.id
      ? {
          ...d,
          siloNumber: newSilo,
          lbs: newWeightLbs,
          sandType,
        }
      : d
  );

  const simulatedState: AppState = { ...state, deliveries: simulatedDeliveries };
  const projectedSiloDerivedStates = getSiloDerivedStates(simulatedState);

  // Unique list of affected silos
  const affectedSiloNumbers = Array.from(new Set([oldSilo, newSilo])).sort((a, b) => a - b);

  const siloChanges = affectedSiloNumbers.map((sNum) => {
    const beforeObj = currentSiloDerivedStates.find((s) => s.siloNumber === sNum);
    const afterObj = projectedSiloDerivedStates.find((s) => s.siloNumber === sNum);
    const beforeLbs = beforeObj?.onHandLbs || 0;
    const afterLbs = afterObj?.onHandLbs || 0;
    const diff = afterLbs - beforeLbs;
    return {
      siloNumber: sNum,
      siloName: beforeObj?.name || `Silo ${sNum}`,
      beforeLbs,
      afterLbs,
      diff,
      isChanged: beforeLbs !== afterLbs || oldSilo !== newSilo,
    };
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const errs: Record<string, string> = {};

    if (!ticketNumber.trim()) {
      errs.ticketNumber = 'Ticket number is required';
    }

    const numericLbs = parseInt(lbs, 10);
    if (!numericLbs || numericLbs <= 0) {
      errs.lbs = 'Valid sand weight in lbs is required';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setIsSubmitting(true);

    try {
      await onSave({
        ticketNumber: ticketNumber.trim(),
        siloNumber,
        sandType,
        lbs: numericLbs,
        supplier: supplier.trim(),
        date,
        timeOfDay: timeOfDay || undefined,
        driverName: driverName.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      console.error('Failed to update ticket:', err);
      setSubmitError(err?.message || 'Failed to update ticket');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl max-w-2xl w-full p-6 text-white shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-slate-950 p-2.5 rounded-2xl font-black">
              <Pencil className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight">EDIT TICKET ENTRY</h2>
              <p className="text-xs text-slate-400 font-mono">Editing Ticket #{ticket.ticketNumber}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitError && (
          <div className="bg-red-950/80 border-2 border-red-500 text-red-200 p-3.5 rounded-2xl text-xs font-bold mb-4">
            ⚠️ {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Row 1: Ticket # & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">TICKET NUMBER *</label>
              <input
                type="text"
                value={ticketNumber}
                onChange={(e) => {
                  setTicketNumber(e.target.value);
                  setErrors((prev) => ({ ...prev, ticketNumber: '' }));
                }}
                className={`w-full bg-slate-950 border-2 ${
                  errors.ticketNumber ? 'border-red-500' : 'border-slate-700'
                } rounded-xl px-4 py-3 font-mono font-black text-amber-400 text-base uppercase focus:border-amber-500 focus:outline-none`}
                placeholder="e.g. 104928"
              />
              {errors.ticketNumber && <p className="text-xs text-red-400 mt-1 font-bold">{errors.ticketNumber}</p>}
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">DELIVERY DATE *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 font-mono font-bold text-white text-base focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Duplicate Ticket Alert */}
          {duplicateDelivery && (
            <div className="bg-amber-950/60 border-2 border-amber-500 text-amber-200 p-3.5 rounded-2xl text-xs space-y-1">
              <div className="flex items-center gap-2 font-black uppercase text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>DUPLICATE TICKET NUMBER DETECTED</span>
              </div>
              <p>
                Ticket #{duplicateDelivery.ticketNumber} is already logged in Silo #{duplicateDelivery.siloNumber} ({formatLbs(duplicateDelivery.lbs)}) on {duplicateDelivery.date}.
              </p>
            </div>
          )}

          {/* Row 2: Target Silo & Sand Weight */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">TARGET SILO *</label>
              <select
                value={siloNumber}
                onChange={(e) => setSiloNumber(parseInt(e.target.value, 10))}
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 font-mono font-black text-amber-400 text-base focus:border-amber-500 focus:outline-none"
              >
                {!state.config.silos.some((s) => s.siloNumber === siloNumber) && (
                  <option value={siloNumber} className="text-red-400 font-black">
                    ⚠️ Silo #{siloNumber} (Not in current pad config)
                  </option>
                )}
                {state.config.silos.map((s) => (
                  <option key={s.siloNumber} value={s.siloNumber}>
                    Silo #{s.siloNumber} {s.name ? `(${s.name})` : ''} - {s.sandType || 'Empty'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">NET SAND WEIGHT (LBS) *</label>
              <input
                type="number"
                value={lbs}
                onChange={(e) => {
                  setLbs(e.target.value);
                  setErrors((prev) => ({ ...prev, lbs: '' }));
                }}
                className={`w-full bg-slate-950 border-2 ${
                  errors.lbs ? 'border-red-500' : 'border-slate-700'
                } rounded-xl px-4 py-3 font-mono font-black text-white text-base focus:border-amber-500 focus:outline-none`}
                placeholder="e.g. 52380"
              />
              {errors.lbs && <p className="text-xs text-red-400 mt-1 font-bold">{errors.lbs}</p>}
            </div>
          </div>

          {/* Row 3: Sand Type & Supplier */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">SAND TYPE *</label>
              <select
                value={sandType}
                onChange={(e) => setSandType(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 font-bold text-white text-base focus:border-amber-500 focus:outline-none"
              >
                {state.config.sandTypes.map((st) => (
                  <option key={st.id} value={st.name}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">SUPPLIER / HAULER *</label>
              {supplierList.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={supplierList.includes(supplier) ? supplier : '__OTHER__'}
                    onChange={(e) => {
                      if (e.target.value !== '__OTHER__') {
                        setSupplier(e.target.value);
                      }
                    }}
                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 font-bold text-white text-base focus:border-amber-500 focus:outline-none"
                  >
                    {supplierList.map((sup) => (
                      <option key={sup} value={sup}>
                        {sup}
                      </option>
                    ))}
                    <option value="__OTHER__">+ Custom Supplier Name...</option>
                  </select>
                  {(!supplierList.includes(supplier) || supplier === '') && (
                    <input
                      type="text"
                      value={supplier}
                      onChange={(e) => setSupplier(e.target.value)}
                      placeholder="Enter supplier name"
                      className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="e.g. Atlas Sand"
                  className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 font-bold text-white text-base focus:border-amber-500 focus:outline-none"
                />
              )}
            </div>
          </div>

          {/* Sand Type Mismatch Warning */}
          {isSandTypeMismatch && (
            <div className="bg-amber-950/60 border border-amber-500/80 p-3 rounded-2xl text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-400 uppercase">Sand Type Mismatch: </span>
                Silo #{siloNumber} is configured as <strong>{selectedSiloConfig?.sandType}</strong>, but this ticket specifies <strong>{sandType}</strong>.
              </div>
            </div>
          )}

          {/* PROJECTED SILO BALANCE IMPACT */}
          <div className="bg-slate-950 border-2 border-amber-500/40 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-black uppercase text-amber-400 tracking-wider">
                PROJECTED SILO BALANCE IMPACT
              </span>
              <span className="text-[10px] font-mono text-slate-400">On-Hand Adjustment</span>
            </div>

            <div className="space-y-2">
              {siloChanges.map((sc) => (
                <div
                  key={sc.siloNumber}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="font-bold text-sm text-white">
                    Silo #{sc.siloNumber} <span className="text-xs text-slate-400 font-normal">({sc.siloName})</span>
                  </div>

                  <div className="flex items-center gap-2 font-mono font-black text-sm">
                    <span className="text-slate-300">{formatLbs(sc.beforeLbs)}</span>
                    <ArrowRight className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className={sc.diff >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                      {formatLbs(sc.afterLbs)}
                    </span>
                    {sc.diff !== 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded ${sc.diff > 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'}`}>
                        {sc.diff > 0 ? `+${formatLbs(sc.diff)}` : formatLbs(sc.diff)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Row 4: Driver Name & Time of Day */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">DRIVER NAME (OPTIONAL)</label>
              <input
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                placeholder="Driver full name"
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">TIME OF DAY (OPTIONAL)</label>
              <input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Row 5: Notes */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">NOTES / MEMO (OPTIONAL)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
              placeholder="e.g. Shift 1 load, re-weighed at scale"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-3 rounded-xl border border-slate-700 text-slate-300 font-bold text-sm hover:bg-slate-800 transition"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm px-6 py-3 rounded-xl shadow-lg border-2 border-amber-300 transition flex items-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              {isSubmitting ? 'SAVING...' : 'SAVE TICKET CHANGES'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
