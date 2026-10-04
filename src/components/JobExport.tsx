import { Download, FileSpreadsheet, Copy, Check, Table, CheckCircle2, Building2 } from 'lucide-react';
import React, { useState } from 'react';
import { generatePadCSV, downloadPadCSV } from '../lib/exportUtils';
import {
  formatLbs,
  formatTons,
  calculateJobDesignMetrics,
  calculateDeliveredBySupplier,
  calculateSandDesignForWell,
  calculateSandPumpedForWell,
} from '../lib/sandRules';
import { AppState } from '../types';

interface JobExportProps {
  state: AppState;
  onSuccessMessage?: (msg: string) => void;
}

export default function JobExport({ state, onSuccessMessage }: JobExportProps) {
  const { config, deliveries, runs } = state;
  const lbsPerTon = config.lbsPerTon || 2000;
  const [copied, setCopied] = useState(false);

  const jobMetrics = calculateJobDesignMetrics(state);
  const supplierRows = calculateDeliveredBySupplier(state);

  // Pad Totals
  const totalDeliveredLbs = deliveries.reduce((sum, d) => sum + (d.lbs || 0), 0);
  const totalDeliveredTons = totalDeliveredLbs / lbsPerTon;

  const totalPumpedLbs = runs.reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
  const totalPumpedTons = totalPumpedLbs / lbsPerTon;

  const totalOnHandLbs = config.silos.reduce((sum, s) => {
    const delivered = deliveries.filter((d) => d.siloNumber === s.siloNumber).reduce((a, b) => a + (b.lbs || 0), 0);
    const pumped = runs.filter((r) => r.siloNumber === s.siloNumber).reduce((a, b) => a + (b.lbsPulled || 0), 0);
    return sum + (s.startingBalanceLbs || 0) + delivered - pumped;
  }, 0);
  const totalOnHandTons = totalOnHandLbs / lbsPerTon;

  // Download CSV File
  const handleDownloadCSV = () => {
    downloadPadCSV(state);
    if (onSuccessMessage) {
      onSuccessMessage('Spreadsheet CSV exported successfully!');
    }
  };

  // Copy CSV Content to Clipboard
  const handleCopyCSV = async () => {
    const csvContent = generatePadCSV(state);
    try {
      await navigator.clipboard.writeText(csvContent);
      setCopied(true);
      if (onSuccessMessage) {
        onSuccessMessage('CSV data copied to clipboard!');
      }
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy CSV:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="bg-amber-500 text-slate-950 p-3 rounded-2xl font-black shadow-lg">
            <FileSpreadsheet className="w-7 h-7 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-amber-400">
              JOB REPORTING & ARCHIVING
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">
              END-OF-JOB SPREADSHEET EXPORT
            </h2>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Export complete pad summary, ticket ledgers, and stage run logs into CSV for Excel / Sheets.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleDownloadCSV}
            className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs px-5 py-3 rounded-2xl shadow-xl border-2 border-amber-300 transition flex items-center justify-center gap-2 uppercase tracking-wide active:scale-95"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            <span>DOWNLOAD .CSV</span>
          </button>

          <button
            type="button"
            onClick={handleCopyCSV}
            className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-black text-xs px-4 py-3 rounded-2xl shadow-lg border border-slate-700 transition flex items-center justify-center gap-2 uppercase tracking-wide"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 stroke-[3] text-emerald-400" />
                <span>COPIED!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-amber-400" />
                <span>COPY CSV</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary Preview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 shadow-xl space-y-2">
          <div className="text-xs font-black uppercase text-slate-400">TOTAL DELIVERIES LOGGED</div>
          <div className="text-2xl font-black font-mono text-white">{deliveries.length} Tickets</div>
          <div className="text-sm font-black font-mono text-amber-400">{formatLbs(totalDeliveredLbs)} ({totalDeliveredTons.toFixed(1)} Tons)</div>
        </div>

        <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 shadow-xl space-y-2">
          <div className="text-xs font-black uppercase text-slate-400">TOTAL STAGE RUNS LOGGED</div>
          <div className="text-2xl font-black font-mono text-white">{runs.length} Runs</div>
          <div className="text-sm font-black font-mono text-emerald-400">{formatLbs(totalPumpedLbs)} ({totalPumpedTons.toFixed(1)} Tons)</div>
        </div>

        <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 shadow-xl space-y-2">
          <div className="text-xs font-black uppercase text-slate-400">CURRENT ON-HAND BALANCE</div>
          <div className="text-2xl font-black font-mono text-white">{formatLbs(totalOnHandLbs)}</div>
          <div className="text-sm font-black font-mono text-slate-300">{totalOnHandTons.toFixed(1)} Tons On Pad</div>
        </div>
      </div>

      {/* Structured Preview Tables */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-base font-black uppercase text-white flex items-center gap-2">
            <Table className="w-5 h-5 text-amber-500" />
            EXPORT DATASET PREVIEW ({config.padName})
          </h3>
          <span className="text-xs font-bold text-slate-400">Ready for Excel / Sheets</span>
        </div>

        {/* Wells Breakdown Table */}
        <div className="space-y-2">
          <div className="text-xs font-black uppercase text-amber-400 tracking-wider">
            1. WELLS & STAGE SUMMARY
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase">
                  <th className="p-2.5 font-black">Well Name</th>
                  <th className="p-2.5 font-black text-right">Planned Stages</th>
                  <th className="p-2.5 font-black text-right">Pumped Stages</th>
                  <th className="p-2.5 font-black text-right">Remaining Stages</th>
                  <th className="p-2.5 font-black text-right">Sand Pumped (Lbs)</th>
                </tr>
              </thead>
              <tbody>
                {config.wells.map((well) => {
                  const wellRuns = runs.filter((r) => r.wellId === well.id);
                  const pumped = new Set(wellRuns.map((r) => r.stageNumber)).size;
                  const remaining = Math.max(0, well.plannedStages - pumped);
                  const lbsPumped = wellRuns.reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
                  return (
                    <tr key={well.id} className="border-b border-slate-800/60 hover:bg-slate-950/50">
                      <td className="p-2.5 font-black text-white">{well.name}</td>
                      <td className="p-2.5 text-right">{well.plannedStages}</td>
                      <td className="p-2.5 text-right text-emerald-400 font-bold">{pumped}</td>
                      <td className="p-2.5 text-right text-amber-400">{remaining}</td>
                      <td className="p-2.5 text-right text-white">{lbsPumped.toLocaleString()} lbs</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sand Types Table */}
        <div className="space-y-2 pt-2">
          <div className="text-xs font-black uppercase text-amber-400 tracking-wider">
            2. SAND TYPE TOTALS
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase">
                  <th className="p-2.5 font-black">Sand Type</th>
                  <th className="p-2.5 font-black text-right">Design Per Stage (Lbs)</th>
                  <th className="p-2.5 font-black text-right">Total Delivered (Lbs)</th>
                  <th className="p-2.5 font-black text-right">Total Pumped (Lbs)</th>
                </tr>
              </thead>
              <tbody>
                {config.sandTypes.map((st) => {
                  const delivered = deliveries.filter((d) => d.sandType === st.name).reduce((sum, d) => sum + (d.lbs || 0), 0);
                  const pumped = runs.filter((r) => r.sandType === st.name).reduce((sum, r) => sum + (r.lbsPulled || 0), 0);
                  return (
                    <tr key={st.id} className="border-b border-slate-800/60 hover:bg-slate-950/50">
                      <td className="p-2.5 font-black text-white">{st.name}</td>
                      <td className="p-2.5 text-right">{st.perStageDesignLbs.toLocaleString()} lbs</td>
                      <td className="p-2.5 text-right text-amber-400 font-bold">{delivered.toLocaleString()} lbs</td>
                      <td className="p-2.5 text-right text-emerald-400">{pumped.toLocaleString()} lbs</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
