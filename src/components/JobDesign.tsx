import React from 'react';
import { AppState } from '../types';
import {
  calculateJobDesignMetrics,
  calculateDeliveredBySupplier,
  formatLbs,
  formatTons,
} from '../lib/sandRules';
import { FileSpreadsheet, AlertTriangle, Truck, CheckCircle2, ShieldAlert } from 'lucide-react';

interface JobDesignProps {
  state: AppState;
}

export default function JobDesign({ state }: JobDesignProps) {
  const metrics = calculateJobDesignMetrics(state);
  const supplierRows = calculateDeliveredBySupplier(state);
  const lbsPerTon = state.config.lbsPerTon || 2000;

  // Cross-check summary
  const flaggedMetrics = metrics.filter((m) => m.hasCrossCheckFlag);

  return (
    <div className="space-y-8">
      {/* Overview Banner */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 shadow-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="bg-[#d4a017] text-[#0b0c0e] p-3 rounded-lg font-black shadow-lg">
              <FileSpreadsheet className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-[#d4a017]">
                FRAC JOB SPECIFICATIONS
              </div>
              <h2 className="text-2xl font-bold text-[#e8ebe6] tracking-wide uppercase font-display">
                JOB DESIGN TRACKING & CROSS-CHECK
              </h2>
              <p className="text-xs text-[#9aa3ad] font-semibold mt-0.5">
                Whole-job sand targets, stage progress balance, and supplier delivery totals.
              </p>
            </div>
          </div>

          <div className="bg-[#0b0c0e] p-3.5 rounded-lg border border-[#2a313b] flex items-center gap-6">
            <div>
              <div className="text-[10px] font-black uppercase text-[#9aa3ad]">TOTAL JOB DESIGN</div>
              <div className="text-xl font-black text-[#e8ebe6] font-mono">
                {formatLbs(metrics.reduce((s, m) => s + m.jobDesignTotalLbs, 0))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase text-[#9aa3ad]">TOTAL DELIVERED</div>
              <div className="text-xl font-black text-[#8fa37a] font-mono">
                {formatLbs(metrics.reduce((s, m) => s + m.deliveredSoFarLbs, 0))}
              </div>
            </div>
          </div>
        </div>

        {/* Design Cross-Check Alert Banner */}
        {flaggedMetrics.length > 0 ? (
          <div className="bg-[#d4a017]/15 border border-[#d4a017]/80 rounded-lg p-4 text-[#e8ebe6] space-y-2">
            <div className="flex items-center gap-2 font-black text-[#d4a017] text-sm uppercase">
              <AlertTriangle className="w-5 h-5 text-[#d4a017] shrink-0" />
              <span>DESIGN CROSS-CHECK VARIANCE ALERT (&gt; 2% DIFFERENCE)</span>
            </div>
            <p className="text-xs text-[#e8ebe6]">
              Planned stages multiplied by per-stage design (accounting for per-well overrides) differs
              from the whole-job frac design total by more than 2% for the following sand types:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
              {flaggedMetrics.map((fm) => (
                <div
                  key={fm.sandType.id}
                  className="bg-[#0b0c0e]/80 p-3 rounded-xl border border-[#d4a017]/30 text-xs flex justify-between items-center"
                >
                  <div>
                    <span className="font-black text-[#d4a017] uppercase">{fm.sandType.name}: </span>
                    <span className="text-[#e8ebe6]">
                      Planned ({formatLbs(fm.plannedStagesSumLbs)}) vs Job Total (
                      {formatLbs(fm.jobDesignTotalLbs)})
                    </span>
                  </div>
                  <span className="font-mono font-black text-[#d4a017] bg-[#d4a017]/20 px-2 py-0.5 rounded border border-[#d4a017]/40 ml-2 shrink-0">
                    {fm.plannedCrossCheckDiffPercent.toFixed(1)}% diff
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-[#8fa37a]/10 border border-[#8fa37a]/30 rounded-lg p-3 text-[#8fa37a] text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#8fa37a] shrink-0" />
            <span>
              <strong>Design Cross-Check Passed:</strong> Per-stage planned totals align within 2% of whole-job frac design figures across all sand types.
            </span>
          </div>
        )}
      </div>

      {/* Per Sand Type Metrics - Column Layout (Silo Board Style) */}
      <div className="space-y-3">
        <div className="text-xs font-black uppercase tracking-wider text-[#d4a017] px-1">
          PER-SAND TYPE JOB METRICS
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {metrics.map((m) => {
            const isOverDelivered = m.stillToDeliverLbs < 0;

            return (
              <div
                key={m.sandType.id}
                className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 shadow-2xl flex flex-col justify-between space-y-4"
              >
                {/* Header */}
                <div className="border-b border-[#2a313b] pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-[#d4a017] inline-block shadow-sm"></span>
                    <h3 className="text-xl font-black text-[#e8ebe6] uppercase tracking-tight">
                      {m.sandType.name}
                    </h3>
                  </div>
                  {m.hasCrossCheckFlag && (
                    <span className="text-[10px] font-black uppercase bg-[#d4a017]/20 text-[#d4a017] border border-[#d4a017]/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Cross-Check
                    </span>
                  )}
                </div>

                {/* Main Figures Stack */}
                <div className="space-y-2 text-xs">
                  {/* Job Design Total */}
                  <div className="bg-[#0b0c0e] p-3 rounded-lg border border-[#2a313b] flex justify-between items-center">
                    <span className="font-black uppercase text-[#9aa3ad]">Job Design Total</span>
                    <div className="text-right">
                      <div className="font-mono font-black text-[#e8ebe6] text-base">
                        {formatLbs(m.jobDesignTotalLbs)}
                      </div>
                      <div className="text-[10px] text-[#9aa3ad] font-mono">
                        {formatTons(m.jobDesignTotalTons)}
                      </div>
                    </div>
                  </div>

                  {/* Delivered So Far */}
                  <div className="bg-[#0b0c0e] p-3 rounded-lg border border-[#2a313b] flex justify-between items-center">
                    <span className="font-black uppercase text-[#9aa3ad]">Delivered So Far</span>
                    <div className="text-right">
                      <div className="font-mono font-black text-[#8fa37a] text-base">
                        {formatLbs(m.deliveredSoFarLbs)}
                      </div>
                      <div className="text-[10px] text-[#8fa37a]/80 font-mono">
                        {formatTons(m.deliveredSoFarTons)}
                      </div>
                    </div>
                  </div>

                  {/* Still to Deliver */}
                  <div
                    className={`p-3 rounded-lg border flex justify-between items-center ${
                      isOverDelivered
                        ? 'bg-[#260e0c]/40 border-[#c23b32]/60'
                        : 'bg-[#0b0c0e] border-[#2a313b]'
                    }`}
                  >
                    <div>
                      <span
                        className={`font-black uppercase block ${
                          isOverDelivered ? 'text-[#e25a4a]' : 'text-[#9aa3ad]'
                        }`}
                      >
                        Still to Deliver
                      </span>
                      {isOverDelivered && (
                        <span className="text-[9px] font-bold text-[#e25a4a]">
                          OVER-DELIVERED!
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-mono font-black text-base ${
                          isOverDelivered ? 'text-[#e25a4a]' : 'text-[#d4a017]'
                        }`}
                      >
                        {formatLbs(m.stillToDeliverLbs)}
                      </div>
                      <div
                        className={`text-[10px] font-mono ${
                          isOverDelivered ? 'text-[#e25a4a]' : 'text-[#d4a017]/80'
                        }`}
                      >
                        {formatTons(m.stillToDeliverTons)}
                      </div>
                    </div>
                  </div>

                  {/* Truckloads Still Needed */}
                  <div className="bg-[#0b0c0e] p-3 rounded-lg border border-[#2a313b] flex justify-between items-center">
                    <div className="flex items-center gap-1.5 font-black uppercase text-[#9aa3ad]">
                      <Truck className="w-4 h-4 text-[#d4a017]" />
                      <span>Loads Still Needed</span>
                    </div>
                    <div className="font-mono font-black text-[#e8ebe6] text-base">
                      {m.truckloadsStillNeeded > 0
                        ? `${m.truckloadsStillNeeded.toFixed(1)} loads`
                        : '0 loads'}
                    </div>
                  </div>

                  {/* Pumped So Far */}
                  <div className="bg-[#0b0c0e] p-3 rounded-lg border border-[#2a313b] flex justify-between items-center">
                    <span className="font-black uppercase text-[#9aa3ad]">Pumped So Far</span>
                    <div className="text-right">
                      <div className="font-mono font-black text-[#5b7c99] text-base">
                        {formatLbs(m.pumpedSoFarLbs)}
                      </div>
                      <div className="text-[10px] text-[#5b7c99]/80 font-mono">
                        {formatTons(m.pumpedSoFarTons)}
                      </div>
                    </div>
                  </div>

                  {/* Remaining in Design */}
                  <div className="bg-[#0b0c0e] p-3 rounded-lg border border-[#2a313b] flex justify-between items-center">
                    <span className="font-black uppercase text-[#9aa3ad]">Remaining in Design</span>
                    <div className="text-right">
                      <div className="font-mono font-black text-[#e8ebe6] text-base">
                        {formatLbs(m.remainingInDesignLbs)}
                      </div>
                      <div className="text-[10px] text-[#9aa3ad] font-mono">
                        {formatTons(m.remainingInDesignTons)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stage Calculations Breakdown */}
                <div className="bg-[#0b0c0e]/60 p-3 rounded-lg border border-[#2a313b]/80 space-y-1.5 pt-2 text-[11px] font-mono">
                  <div className="flex justify-between text-[#9aa3ad]">
                    <span>Stages in Design:</span>
                    <span className="font-bold text-[#e8ebe6]">{m.stagesInDesign.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between text-[#9aa3ad]">
                    <span>Stages Pumped So Far:</span>
                    <span className="font-bold text-[#8fa37a]">{m.stagesPumpedSoFar.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between text-[#9aa3ad] border-t border-[#2a313b]/60 pt-1.5">
                    <span>Stages Left in Design:</span>
                    <span className="font-bold text-[#d4a017]">
                      {m.stagesOfSandLeftInDesign.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delivered by Supplier Table */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-[#d4a017] text-[#0b0c0e] p-2.5 rounded-xl font-black">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#e8ebe6] uppercase tracking-tight">
                DELIVERED BY SUPPLIER
              </h3>
              <p className="text-xs text-[#9aa3ad] font-semibold">
                Breakdown of total sand delivered per hauler/supplier.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-[#d4a017] bg-[#d4a017]/10 px-3 py-1 rounded-xl border border-[#d4a017]/30">
            {supplierRows.length} Suppliers Recorded
          </span>
        </div>

        {supplierRows.length === 0 ? (
          <div className="text-center py-8 text-[#9aa3ad] text-xs italic font-bold">
            No deliveries recorded on this pad yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#0b0c0e] text-[#9aa3ad] font-black uppercase border-b border-[#2a313b] text-[11px]">
                  <th className="py-3 px-4 rounded-l-xl">SUPPLIER / HAULER</th>
                  {state.config.sandTypes.map((st) => (
                    <th key={st.id} className="py-3 px-3 text-right">
                      {st.name} (LBS)
                    </th>
                  ))}
                  <th className="py-3 px-3 text-right">TOTAL LBS</th>
                  <th className="py-3 px-3 text-right">TOTAL TONS</th>
                  <th className="py-3 px-4 text-right rounded-r-xl">LOAD COUNT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a313b]/60 font-mono">
                {supplierRows.map((row, idx) => (
                  <tr
                    key={row.supplierName}
                    className={idx % 2 === 0 ? 'bg-[#14171c]/40' : 'bg-[#0b0c0e]/40'}
                  >
                    <td className="py-3 px-4 font-sans font-bold text-[#e8ebe6] text-sm">
                      {row.supplierName}
                    </td>
                    {state.config.sandTypes.map((st) => {
                      const lbs = row.lbsPerSandType[st.name] || 0;
                      return (
                        <td key={st.id} className="py-3 px-3 text-right font-bold text-[#e8ebe6]">
                          {lbs > 0 ? lbs.toLocaleString() : '-'}
                        </td>
                      );
                    })}
                    <td className="py-3 px-3 text-right font-black text-[#d4a017] text-sm">
                      {row.totalLbs.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-[#e8ebe6]">
                      {row.totalTons.toFixed(1)} T
                    </td>
                    <td className="py-3 px-4 text-right font-black text-[#8fa37a] text-sm">
                      {row.loadCount} loads
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#0b0c0e] border-t-2 border-[#2a313b] font-black text-[#e8ebe6] text-xs">
                  <td className="py-3.5 px-4 font-sans uppercase text-[#d4a017]">PAD TOTALS</td>
                  {state.config.sandTypes.map((st) => {
                    const totalLbsForType = supplierRows.reduce(
                      (sum, r) => sum + (r.lbsPerSandType[st.name] || 0),
                      0
                    );
                    return (
                      <td key={st.id} className="py-3.5 px-3 text-right font-mono text-[#e8ebe6]">
                        {totalLbsForType.toLocaleString()}
                      </td>
                    );
                  })}
                  <td className="py-3.5 px-3 text-right font-mono text-[#d4a017] text-sm">
                    {supplierRows.reduce((s, r) => s + r.totalLbs, 0).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-[#e8ebe6]">
                    {(
                      supplierRows.reduce((s, r) => s + r.totalLbs, 0) / lbsPerTon
                    ).toFixed(1)}{' '}
                    T
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-[#8fa37a] text-sm">
                    {supplierRows.reduce((s, r) => s + r.loadCount, 0)} loads
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
