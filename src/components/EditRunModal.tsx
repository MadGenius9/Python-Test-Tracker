import { ArrowRight, CheckCircle2, Layers, Pencil, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { formatLbs, getSiloDerivedStates } from '../lib/sandRules';
import { getOperationalDate } from '../lib/dateUtils';
import { AppState, RunRecord } from '../types';

interface EditRunModalProps {
  state: AppState;
  run: RunRecord;
  onSave: (updates: Partial<Omit<RunRecord, 'id' | 'createdAt'>>) => Promise<void>;
  onClose: () => void;
}

export default function EditRunModal({ state, run, onSave, onClose }: EditRunModalProps) {
  const [wellId, setWellId] = useState<string>(run.wellId || state.config.wells[0]?.id || 'w-1');
  const [stageNumber, setStageNumber] = useState<number>(run.stageNumber || 1);
  const [siloNumber, setSiloNumber] = useState<number>(run.siloNumber || 1);
  const [sandType, setSandType] = useState<string>(run.sandType || state.config.sandTypes[0]?.name || '100 Mesh');
  const [lbsPulled, setLbsPulled] = useState<string>(run.lbsPulled ? run.lbsPulled.toString() : '');
  const [date, setDate] = useState<string>(run.date || getOperationalDate());

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Balance Projection Calculation
  const currentSiloDerivedStates = getSiloDerivedStates(state);

  const oldSilo = run.siloNumber;
  const newSilo = siloNumber;
  const newLbsPulled = parseInt(lbsPulled, 10) || 0;

  // Simulate updated runs state
  const simulatedRuns = state.runs.map((r) =>
    r.id === run.id
      ? {
          ...r,
          wellId,
          stageNumber,
          siloNumber: newSilo,
          sandType,
          lbsPulled: newLbsPulled,
          date,
        }
      : r
  );

  const simulatedState: AppState = { ...state, runs: simulatedRuns };
  const projectedSiloDerivedStates = getSiloDerivedStates(simulatedState);

  // Affected silos
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

    const numericLbs = parseInt(lbsPulled, 10);
    if (isNaN(numericLbs) || numericLbs < 0) {
      errs.lbsPulled = 'Valid weight pulled in lbs is required';
    }

    if (!stageNumber || stageNumber <= 0) {
      errs.stageNumber = 'Valid stage number is required';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setIsSubmitting(true);

    try {
      await onSave({
        wellId,
        stageNumber,
        siloNumber,
        sandType,
        lbsPulled: numericLbs,
        date,
      });
      onClose();
    } catch (err: any) {
      console.error('Failed to update stage run:', err);
      setSubmitError(err?.message || 'Failed to update stage run');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl max-w-xl w-full p-6 text-white shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-slate-950 p-2.5 rounded-2xl font-black">
              <Pencil className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight">EDIT STAGE RUN RECORD</h2>
              <p className="text-xs text-slate-400 font-mono">Updating sand pull history for Silo #{run.siloNumber}</p>
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
          {/* Row 1: Well & Stage # */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">WELL *</label>
              <select
                value={wellId}
                onChange={(e) => setWellId(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 font-black text-amber-400 text-base focus:border-amber-500 focus:outline-none"
              >
                {state.config.wells.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">STAGE NUMBER *</label>
              <input
                type="number"
                value={stageNumber}
                onChange={(e) => {
                  setStageNumber(parseInt(e.target.value, 10) || 1);
                  setErrors((prev) => ({ ...prev, stageNumber: '' }));
                }}
                className={`w-full bg-slate-950 border-2 ${
                  errors.stageNumber ? 'border-red-500' : 'border-slate-700'
                } rounded-xl px-4 py-3 font-mono font-black text-white text-base focus:border-amber-500 focus:outline-none`}
              />
              {errors.stageNumber && <p className="text-xs text-red-400 mt-1 font-bold">{errors.stageNumber}</p>}
            </div>
          </div>

          {/* Row 2: Silo & Weight Pulled */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">PULLED FROM SILO *</label>
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
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">SAND PULLED (LBS) *</label>
              <input
                type="number"
                value={lbsPulled}
                onChange={(e) => {
                  setLbsPulled(e.target.value);
                  setErrors((prev) => ({ ...prev, lbsPulled: '' }));
                }}
                className={`w-full bg-slate-950 border-2 ${
                  errors.lbsPulled ? 'border-red-500' : 'border-slate-700'
                } rounded-xl px-4 py-3 font-mono font-black text-white text-base focus:border-amber-500 focus:outline-none`}
                placeholder="e.g. 120000"
              />
              {errors.lbsPulled && <p className="text-xs text-red-400 mt-1 font-bold">{errors.lbsPulled}</p>}
            </div>
          </div>

          {/* Row 3: Sand Type & Date */}
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
              <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">RUN DATE *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 font-mono font-bold text-white text-base focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

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
              {isSubmitting ? 'SAVING...' : 'SAVE RUN CHANGES'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
