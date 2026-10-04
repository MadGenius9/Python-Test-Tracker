import { AlertTriangle, ArrowRight, Trash2, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { formatLbs, getSiloDerivedStates } from '../lib/sandRules';
import { AppState, DeliveryTicket, RunRecord } from '../types';

interface DeleteConfirmModalProps {
  state: AppState;
  target: { type: 'ticket'; item: DeliveryTicket } | { type: 'run'; item: RunRecord };
  onConfirmDelete: (reason?: string) => Promise<void>;
  onClose: () => void;
}

export default function DeleteConfirmModal({
  state,
  target,
  onConfirmDelete,
  onClose,
}: DeleteConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSiloStates = getSiloDerivedStates(state);

  let siloNumber = 1;
  let summaryText = '';
  let beforeLbs = 0;
  let afterLbs = 0;
  let diffLbs = 0;

  if (target.type === 'ticket') {
    const ticket = target.item;
    siloNumber = ticket.siloNumber;
    const currentSilo = currentSiloStates.find((s) => s.siloNumber === siloNumber);
    beforeLbs = currentSilo?.onHandLbs || 0;

    const simulatedDeliveries = state.deliveries.filter((d) => d.id !== ticket.id);
    const projectedState = { ...state, deliveries: simulatedDeliveries };
    const projectedSilo = getSiloDerivedStates(projectedState).find((s) => s.siloNumber === siloNumber);
    afterLbs = projectedSilo?.onHandLbs || 0;
    diffLbs = afterLbs - beforeLbs; // Negative (e.g. -52380)

    summaryText = `Removes ${formatLbs(ticket.lbs)} from Silo ${siloNumber} (${formatLbs(beforeLbs)} → ${formatLbs(afterLbs)})`;
  } else {
    const run = target.item;
    siloNumber = run.siloNumber;
    const currentSilo = currentSiloStates.find((s) => s.siloNumber === siloNumber);
    beforeLbs = currentSilo?.onHandLbs || 0;

    const simulatedRuns = state.runs.filter((r) => r.id !== run.id);
    const projectedState = { ...state, runs: simulatedRuns };
    const projectedSilo = getSiloDerivedStates(projectedState).find((s) => s.siloNumber === siloNumber);
    afterLbs = projectedSilo?.onHandLbs || 0;
    diffLbs = afterLbs - beforeLbs; // Positive (e.g. +120000)

    summaryText = `Restores ${formatLbs(run.lbsPulled)} to Silo ${siloNumber} (${formatLbs(beforeLbs)} → ${formatLbs(afterLbs)})`;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirmDelete(reason.trim() || undefined);
      onClose();
    } catch (err: any) {
      console.error('Failed to soft delete record:', err);
      setError(err?.message || 'Failed to soft delete record');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-red-500/80 rounded-3xl max-w-lg w-full p-6 text-white shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-3">
            <div className="bg-red-500 text-slate-950 p-2.5 rounded-2xl font-black">
              <Trash2 className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-red-400">
                DELETE {target.type === 'ticket' ? 'DELIVERY TICKET' : 'SILO RUN RECORD'}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {target.type === 'ticket'
                  ? `Ticket #${target.item.ticketNumber} • ${target.item.supplier}`
                  : `Silo #${target.item.siloNumber} • Stage #${target.item.stageNumber} • ${formatLbs(target.item.lbsPulled)}`}
              </p>
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

        {error && (
          <div className="bg-red-950/90 border border-red-500 text-red-200 p-3 rounded-xl text-xs font-bold mb-4">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Record Details Banner */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs space-y-1.5 font-mono">
            {target.type === 'ticket' ? (
              <>
                <div className="flex justify-between text-slate-300">
                  <span>TICKET NO:</span>
                  <span className="font-bold text-amber-400">{target.item.ticketNumber}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>SAND TYPE / WEIGHT:</span>
                  <span className="font-bold text-white">
                    {target.item.sandType} • {formatLbs(target.item.lbs)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>TARGET SILO:</span>
                  <span className="font-bold text-white">Silo #{target.item.siloNumber}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>SUPPLIER / DATE:</span>
                  <span className="font-bold text-white">
                    {target.item.supplier} ({target.item.date})
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-slate-300">
                  <span>STAGE NO:</span>
                  <span className="font-bold text-amber-400">Stage #{target.item.stageNumber}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>PULLED WEIGHT:</span>
                  <span className="font-bold text-white">{formatLbs(target.item.lbsPulled)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>PULLED FROM:</span>
                  <span className="font-bold text-white">Silo #{target.item.siloNumber} ({target.item.sandType})</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>RUN DATE:</span>
                  <span className="font-bold text-white">{target.item.date}</span>
                </div>
              </>
            )}
          </div>

          {/* PROJECTED IMPACT ON SILO */}
          <div className="bg-red-950/40 border-2 border-red-500/60 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-red-400 tracking-wider">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>SILO BALANCE IMPACT PREVIEW</span>
            </div>
            <p className="text-sm font-bold text-white leading-snug">{summaryText}</p>

            <div className="bg-slate-950/80 rounded-xl p-3 flex items-center justify-between font-mono font-black text-sm">
              <span className="text-slate-400">Silo #{siloNumber} Balance:</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-300">{formatLbs(beforeLbs)}</span>
                <ArrowRight className="w-4 h-4 text-red-400 shrink-0" />
                <span className={diffLbs >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                  {formatLbs(afterLbs)}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${diffLbs >= 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-red-950 text-red-300 border border-red-800'}`}>
                  {diffLbs >= 0 ? `+${formatLbs(diffLbs)}` : formatLbs(diffLbs)}
                </span>
              </div>
            </div>
          </div>

          {/* Optional Reason Input */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">
              REASON FOR DELETION (OPTIONAL)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Duplicate ticket entry, scale typo, truck returned"
              className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:border-red-500 focus:outline-none"
            />
          </div>

          <p className="text-[11px] text-slate-400 italic">
            * Note: Soft deletion moves this record to the Deleted tab. Nothing is permanently destroyed and can be restored at any time.
          </p>

          {/* Actions */}
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
              className="bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black text-sm px-6 py-3 rounded-xl shadow-lg border border-red-400 transition flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4 stroke-[2.5]" />
              {isSubmitting
                ? 'DELETING...'
                : target.type === 'ticket'
                ? 'CONFIRM DELETE TICKET'
                : 'CONFIRM DELETE SILO RUN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
