import { AlertTriangle, CheckCircle2, Stethoscope, Copy, FileText, Layers, RefreshCw, QrCode, ScanLine, Sparkles, Database, RotateCcw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { getDiagnosticsReport, formatLbs } from '../lib/sandRules';
import { parseTicketScanValue, extractTicketNumberFromScannedValue } from '../lib/ticketUtils';
import { rebuildStageRecordsFromRunHistory } from '../lib/firestoreService';
import { AppState } from '../types';
import TicketScannerModal from './TicketScannerModal';
import PadRecoveryModal from './PadRecoveryModal';

interface DiagnosticsProps {
  state: AppState;
  onSelectPad?: (padId: string) => void;
}

export default function Diagnostics({ state, onSelectPad }: DiagnosticsProps) {
  const report = getDiagnosticsReport(state);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [isRebuildingStages, setIsRebuildingStages] = useState(false);
  const [rebuildStatusMsg, setRebuildStatusMsg] = useState<string | null>(null);
  const [testScanResult, setTestScanResult] = useState<{
    rawValue: string;
    format: string;
    winningScale?: string;
    engine?: string;
  } | null>(null);

  const handleRebuildStageRecords = async () => {
    if (!state.padId) return;
    setIsRebuildingStages(true);
    setRebuildStatusMsg(null);
    try {
      await rebuildStageRecordsFromRunHistory(state.padId);
      setRebuildStatusMsg('Successfully reconciled and rebuilt all StageRecords from active RunRecords.');
    } catch (err: any) {
      console.error('Failed to rebuild stage records:', err);
      setRebuildStatusMsg(`Error rebuilding stages: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsRebuildingStages(false);
    }
  };

  const hasConsistencyIssues = !(report.stageRecordConsistency?.isConsistent ?? true);
  const isAllPassed =
    !report.isPadTotalMismatch &&
    report.negativeSilos.length === 0 &&
    report.duplicateTicketNumbers.length === 0 &&
    report.mismatchedDeliveries.length === 0 &&
    report.unassignedSilos.length === 0 &&
    report.unassignedSiloDeliveries.length === 0 &&
    report.unassignedSiloRuns.length === 0 &&
    !hasConsistencyIssues;

  const handleTestScan = (result: {
    rawValue: string;
    format: string;
    winningScale?: string;
    engine?: string;
  }) => {
    setIsScannerOpen(false);
    setTestScanResult(result);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header Banner */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 text-[#e8ebe6] shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#d4a017] text-[#0b0c0e] p-3.5 rounded-lg font-black">
            <Stethoscope className="w-8 h-8 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold uppercase tracking-wide font-display">PAD DIAGNOSTICS</h2>
            <p className="text-xs text-[#9aa3ad] font-medium">
              Data integrity audit for {state.config.padName || 'Current Pad'}
            </p>
          </div>
        </div>

        {/* Status Indicator Pill */}
        <div>
          {isAllPassed ? (
            <span className="bg-[#8fa37a] text-[#e8ebe6] font-black text-xs px-4 py-2.5 rounded-lg uppercase tracking-wider shadow inline-flex items-center gap-2 border border-[#8fa37a]">
              <CheckCircle2 className="w-4 h-4" /> ALL DIAGNOSTICS PASSED
            </span>
          ) : (
            <span className="bg-[#c23b32] text-[#e8ebe6] font-black text-xs px-4 py-2.5 rounded-lg uppercase tracking-wider shadow inline-flex items-center gap-2 border border-[#c23b32] animate-pulse">
              <AlertTriangle className="w-4 h-4" /> ATTENTION REQUIRED
            </span>
          )}
        </div>
      </div>

      {/* 1. Pad On-Hand Reconciliation */}
      <div
        className={`border-2 rounded-xl p-6 text-[#e8ebe6] shadow-2xl transition-all ${
          report.isPadTotalMismatch
            ? 'bg-[#260e0c]/60 border-[#c23b32]'
            : 'bg-[#14171c] border-[#2a313b]'
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#2a313b]">
          <h3 className="text-lg font-black uppercase text-[#d4a017] flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-[#d4a017]" /> 1. PAD TOTAL ON-HAND RECONCILIATION
          </h3>

          {report.isPadTotalMismatch ? (
            <span className="bg-[#c23b32] text-[#0b0c0e] font-black text-xs px-3 py-1 rounded-lg uppercase">
              MISMATCH FLAGGED
            </span>
          ) : (
            <span className="bg-[#8fa37a]/20 text-[#8fa37a] font-black text-xs px-3 py-1 rounded-lg border border-[#8fa37a]/40 uppercase">
              BALANCED
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="bg-[#0b0c0e] border border-[#2a313b] p-4 rounded-lg">
            <div className="text-xs font-bold text-[#9aa3ad] uppercase">
              Sum of Sand Type Summaries
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-[#e8ebe6] mt-1">
              {report.computedPadOnHandLbs.toLocaleString()} LBS
            </div>
            <p className="text-[11px] text-[#9aa3ad] mt-1">
              (Total starting balance + all deliveries − all stage pulls per sand type)
            </p>
          </div>

          <div className="bg-[#0b0c0e] border border-[#2a313b] p-4 rounded-lg">
            <div className="text-xs font-bold text-[#9aa3ad] uppercase">
              Sum of Individual Silo Balances
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-[#e8ebe6] mt-1">
              {report.sumOfSilosOnHandLbs.toLocaleString()} LBS
            </div>
            <p className="text-[11px] text-[#9aa3ad] mt-1">
              (Sum of current active on-hand across Silos #1 – #{state.config.siloCount})
            </p>
          </div>
        </div>

        {report.isPadTotalMismatch && (
          <div className="mt-4 p-4 rounded-lg bg-[#260e0c]/40 border border-[#c23b32]/50 text-[#e25a4a] text-xs font-semibold flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-[#e25a4a] shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-[#e25a4a] uppercase">DISCREPANCY DETECTED</div>
              The computed pad total does not equal the sum of current silo balances. This can occur if sand delivered to a silo was previously recorded under a different sand type.
            </div>
          </div>
        )}
      </div>

      {/* 2. Negative Silo Balances */}
      <div
        className={`border-2 rounded-xl p-6 text-[#e8ebe6] shadow-2xl ${
          report.negativeSilos.length > 0 ? 'bg-[#260e0c]/60 border-[#c23b32]' : 'bg-[#14171c] border-[#2a313b]'
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#2a313b]">
          <h3 className="text-lg font-black uppercase text-[#d4a017] flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#d4a017]" /> 2. NEGATIVE SILO BALANCES
          </h3>
          <span className="text-xs font-bold text-[#9aa3ad] font-mono">
            {report.negativeSilos.length} SILOS
          </span>
        </div>

        {report.negativeSilos.length === 0 ? (
          <div className="mt-4 p-4 rounded-lg bg-[#0b0c0e]/80 border border-[#2a313b] text-[#e8ebe6] text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#8fa37a]" /> No silos are sitting at a negative balance.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {report.negativeSilos.map((item) => (
              <div
                key={item.siloNumber}
                className="bg-[#260e0c]/30 border border-[#c23b32]/60 p-4 rounded-lg flex items-center justify-between"
              >
                <div>
                  <span className="font-black text-lg text-[#e8ebe6]">SILO #{item.siloNumber}</span>
                  <p className="text-xs text-[#e25a4a]">
                    Silo pulled more sand than recorded delivery tickets account for.
                  </p>
                </div>
                <div className="text-xl font-mono font-black text-[#e25a4a]">
                  {item.onHandLbs.toLocaleString()} LBS
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Duplicate Delivery Tickets */}
      <div
        className={`border-2 rounded-xl p-6 text-[#e8ebe6] shadow-2xl ${
          report.duplicateTicketNumbers.length > 0 ? 'bg-[#291e04]/60 border-[#d4a017]' : 'bg-[#14171c] border-[#2a313b]'
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#2a313b]">
          <h3 className="text-lg font-black uppercase text-[#d4a017] flex items-center gap-2">
            <Copy className="w-5 h-5 text-[#d4a017]" /> 3. DUPLICATE DELIVERY TICKET NUMBERS
          </h3>
          <span className="text-xs font-bold text-[#9aa3ad] font-mono">
            {report.duplicateTicketNumbers.length} DUPLICATES
          </span>
        </div>

        {report.duplicateTicketNumbers.length === 0 ? (
          <div className="mt-4 p-4 rounded-lg bg-[#0b0c0e]/80 border border-[#2a313b] text-[#e8ebe6] text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#8fa37a]" /> No duplicate delivery ticket numbers found.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {report.duplicateTicketNumbers.map((item) => (
              <div
                key={item.ticketNumber}
                className="bg-[#291e04]/40 border border-[#d4a017]/50 p-4 rounded-lg flex items-center justify-between"
              >
                <div>
                  <span className="font-mono font-black text-lg text-[#d4a017] uppercase">
                    TICKET #{item.ticketNumber}
                  </span>
                  <p className="text-xs text-[#d4a017]/80">
                    Logged {item.count} times in delivery history.
                  </p>
                </div>
                <span className="bg-[#d4a017] text-[#0b0c0e] font-black text-xs px-3 py-1 rounded-lg">
                  {item.count} OCCURRENCES
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Sand Type Mismatches */}
      <div
        className={`border-2 rounded-xl p-6 text-[#e8ebe6] shadow-2xl ${
          report.mismatchedDeliveries.length > 0 ? 'bg-[#291e04]/60 border-[#d4a017]' : 'bg-[#14171c] border-[#2a313b]'
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#2a313b]">
          <h3 className="text-lg font-black uppercase text-[#d4a017] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#d4a017]" /> 4. DELIVERIES WITH SAND TYPE MISMATCH
          </h3>
          <span className="text-xs font-bold text-[#9aa3ad] font-mono">
            {report.mismatchedDeliveries.length} MISMATCHES
          </span>
        </div>

        {report.mismatchedDeliveries.length === 0 ? (
          <div className="mt-4 p-4 rounded-lg bg-[#0b0c0e]/80 border border-[#2a313b] text-[#e8ebe6] text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#8fa37a]" /> All delivery tickets match their silo's currently assigned sand type.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {report.mismatchedDeliveries.map((m) => (
              <div
                key={m.ticketId}
                className="bg-[#0b0c0e] border border-[#2a313b] p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-[#e8ebe6]">#{m.ticketNumber}</span>
                    <span className="text-xs bg-[#1b2027] text-[#e8ebe6] px-2 py-0.5 rounded font-bold">
                      SILO #{m.siloNumber}
                    </span>
                    <span className="text-xs text-[#9aa3ad]">{m.date}</span>
                  </div>
                  <div className="text-xs text-[#9aa3ad] mt-1">
                    Delivered Sand: <span className="text-[#d4a017] font-bold">{m.deliverySandType}</span> • Silo Assigned:{' '}
                    <span className="text-[#e8ebe6] font-bold">{m.siloCurrentSandType}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Unassigned Silos */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 text-[#e8ebe6] shadow-2xl">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#2a313b]">
          <h3 className="text-lg font-black uppercase text-[#d4a017] flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#d4a017]" /> 5. SILOS WITHOUT SAND TYPE ASSIGNED
          </h3>
          <span className="text-xs font-bold text-[#9aa3ad] font-mono">
            {report.unassignedSilos.length} UNASSIGNED
          </span>
        </div>

        {report.unassignedSilos.length === 0 ? (
          <div className="mt-4 p-4 rounded-lg bg-[#0b0c0e]/80 border border-[#2a313b] text-[#e8ebe6] text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#8fa37a]" /> Every silo has a designated sand type assigned.
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {report.unassignedSilos.map((sNum) => (
              <span
                key={sNum}
                className="bg-[#d4a017]/20 text-[#d4a017] border border-[#d4a017]/40 px-3 py-1.5 rounded-xl font-black text-sm"
              >
                SILO #{sNum} (EMPTY / UNASSIGNED)
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 6. Deliveries Assigned to Silo Not in Config */}
      <div
        className={`border-2 rounded-xl p-6 text-[#e8ebe6] shadow-2xl ${
          report.unassignedSiloDeliveries.length > 0
            ? 'bg-[#260e0c]/60 border-[#c23b32]'
            : 'bg-[#14171c] border-[#2a313b]'
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#2a313b]">
          <h3 className="text-lg font-black uppercase text-[#d4a017] flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#d4a017]" /> 6. DELIVERIES ASSIGNED TO A SILO NOT IN CONFIG
          </h3>
          <span className="text-xs font-bold text-[#9aa3ad] font-mono">
            {report.unassignedSiloDeliveries.length} TICKETS
          </span>
        </div>

        {report.unassignedSiloDeliveries.length === 0 ? (
          <div className="mt-4 p-4 rounded-lg bg-[#0b0c0e]/80 border border-[#2a313b] text-[#e8ebe6] text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#8fa37a]" /> All delivery tickets are assigned to valid configured silos.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <div className="bg-[#260e0c]/40 border border-[#c23b32]/50 p-3.5 rounded-lg text-xs text-[#e25a4a] font-semibold mb-3">
              <span className="font-black uppercase text-[#e25a4a]">ATTENTION: </span>
              These tickets belong to silo numbers that do not exist in this pad's current configuration. Edit their silo in Logs or add the missing silo in Setup.
            </div>
            {report.unassignedSiloDeliveries.map((del) => (
              <div
                key={del.id}
                className="bg-[#0b0c0e] border border-[#c23b32]/60 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-[#d4a017] text-base">#{del.ticketNumber}</span>
                    <span className="text-xs bg-[#c23b32] text-[#e8ebe6] font-black px-2.5 py-0.5 rounded-lg uppercase">
                      UNCONFIGURED SILO #{del.siloNumber}
                    </span>
                    <span className="text-xs text-[#9aa3ad]">{del.date}</span>
                  </div>
                  <div className="text-xs text-[#e8ebe6] mt-1">
                    {del.sandType} • {del.supplier} • {del.lbs.toLocaleString()} LBS
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-mono font-black text-[#e25a4a]">
                    {del.lbs.toLocaleString()} LBS
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 7. Stage Runs Assigned to Silo Not in Config */}
      <div
        className={`border-2 rounded-xl p-6 text-[#e8ebe6] shadow-2xl ${
          report.unassignedSiloRuns.length > 0
            ? 'bg-[#260e0c]/60 border-[#c23b32]'
            : 'bg-[#14171c] border-[#2a313b]'
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#2a313b]">
          <h3 className="text-lg font-black uppercase text-[#d4a017] flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#d4a017]" /> 7. STAGE RUNS ASSIGNED TO A SILO NOT IN CONFIG
          </h3>
          <span className="text-xs font-bold text-[#9aa3ad] font-mono">
            {report.unassignedSiloRuns.length} RUNS
          </span>
        </div>

        {report.unassignedSiloRuns.length === 0 ? (
          <div className="mt-4 p-4 rounded-lg bg-[#0b0c0e]/80 border border-[#2a313b] text-[#e8ebe6] text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#8fa37a]" /> All stage runs are pulled from valid configured silos.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <div className="bg-[#260e0c]/40 border border-[#c23b32]/50 p-3.5 rounded-lg text-xs text-[#e25a4a] font-semibold mb-3">
              <span className="font-black uppercase text-[#e25a4a]">ATTENTION: </span>
              These stage run records are pulled from silo numbers that do not exist in this pad's current configuration.
            </div>
            {report.unassignedSiloRuns.map((r) => {
              const wellObj = state.config.wells.find((w) => w.id === r.wellId);
              return (
                <div
                  key={r.id}
                  className="bg-[#0b0c0e] border border-[#c23b32]/60 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-[#d4a017] text-base uppercase">
                        {wellObj?.name || 'Well'}
                      </span>
                      <span className="text-xs bg-[#1b2027] text-[#e8ebe6] font-bold px-2 py-0.5 rounded">
                        Stage {r.stageNumber}
                      </span>
                      <span className="text-xs bg-[#c23b32] text-[#e8ebe6] font-black px-2.5 py-0.5 rounded-lg uppercase">
                        UNCONFIGURED SILO #{r.siloNumber}
                      </span>
                      <span className="text-xs text-[#9aa3ad]">{r.date}</span>
                    </div>
                    <div className="text-xs text-[#e8ebe6] mt-1">
                      {r.sandType} • {r.lbsPulled.toLocaleString()} LBS PULLED
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono font-black text-[#e25a4a]">
                      {r.lbsPulled.toLocaleString()} LBS
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 8. Scan Test (Diagnostic Tool) */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 text-[#e8ebe6] shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2a313b]">
          <div>
            <h3 className="text-lg font-black uppercase text-[#d4a017] flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-[#d4a017]" /> 8. TICKET SCAN TEST
            </h3>
            <p className="text-xs text-[#9aa3ad] font-medium mt-0.5">
              Inspect raw barcode data and format on sand tickets or freight BOLs before relying on auto-fill.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="bg-[#d4a017] hover:bg-[#d4a017] active:bg-[#d4a017] text-[#0b0c0e] font-black text-xs px-5 py-3 rounded-lg shadow-lg border border-[#d4a017] flex items-center justify-center gap-2 uppercase tracking-wider transition active:scale-95 shrink-0 cursor-pointer"
          >
            <QrCode className="w-4 h-4 stroke-[2.5]" />
            <span>TEST SCAN TICKET</span>
          </button>
        </div>

        {testScanResult ? (
          <div className="bg-[#0b0c0e] border border-[#d4a017]/80 p-5 rounded-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black uppercase text-[#d4a017]">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#8fa37a]" /> SCAN TEST RESULT
              </span>
              <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
                {testScanResult.winningScale && (
                  <span className="bg-[#8fa37a]/20 text-[#8fa37a] border border-[#8fa37a]/40 px-2.5 py-1 rounded-lg">
                    SCALE: {testScanResult.winningScale}
                  </span>
                )}
                {testScanResult.engine && (
                  <span className="bg-[#1b2027] text-[#e8ebe6] border border-[#2a313b] px-2.5 py-1 rounded-lg">
                    {testScanResult.engine}
                  </span>
                )}
                <span className="bg-[#d4a017]/20 text-[#d4a017] border border-[#d4a017]/40 px-3 py-1 rounded-lg">
                  FORMAT: {testScanResult.format}
                </span>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-black uppercase text-[#9aa3ad] tracking-wider mb-1">
                RAW UNMODIFIED DECODED VALUE:
              </div>
              <div className="text-sm font-mono font-black text-[#e8ebe6] break-all bg-[#14171c] p-3.5 rounded-xl border border-[#2a313b]">
                {testScanResult.rawValue}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-black uppercase text-[#9aa3ad] tracking-wider mb-1">
                PARSED ATLAS QR FIELDS:
              </div>
              {(() => {
                const parsed = parseTicketScanValue(testScanResult.rawValue, state.config.productCodeMappings || []);
                return (
                  <div className="bg-[#14171c] p-3.5 rounded-xl border border-[#2a313b] space-y-2 text-xs font-mono">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-[#9aa3ad]">TICKET: </span>
                        <strong className="text-[#d4a017]">{parsed.ticketNumber || 'N/A'}</strong>
                      </div>
                      <div>
                        <span className="text-[#9aa3ad]">WEIGHT: </span>
                        <strong className="text-[#e8ebe6]">{parsed.lbs ? `${parsed.lbs.toLocaleString()} lbs` : 'N/A'}</strong>
                      </div>
                      <div>
                        <span className="text-[#9aa3ad]">CARRIER: </span>
                        <strong className="text-[#e8ebe6]">{parsed.carrier || 'N/A'}</strong>
                      </div>
                      <div>
                        <span className="text-[#9aa3ad]">TRUCK: </span>
                        <strong className="text-[#e8ebe6]">{parsed.truck || 'N/A'}</strong>
                      </div>
                      <div>
                        <span className="text-[#9aa3ad]">PO: </span>
                        <strong className="text-[#e8ebe6]">{parsed.poNumber || 'N/A'}</strong>
                      </div>
                      <div>
                        <span className="text-[#9aa3ad]">MINE CODE: </span>
                        <strong className="text-[#d4a017]">{parsed.productCode || 'N/A'}</strong>
                      </div>
                    </div>
                    {parsed.matchedSandType && (
                      <div className="text-[#8fa37a] font-bold border-t border-[#2a313b] pt-1.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>AUTO-MATCHED SAND TYPE: {parsed.matchedSandType}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="text-[11px] text-[#9aa3ad] italic pt-1">
              Note: This diagnostic scan saved nothing.
            </div>
          </div>
        ) : (
          <div className="bg-[#0b0c0e]/80 border border-[#2a313b] p-4 rounded-lg text-[#9aa3ad] text-xs font-medium">
            Tap <strong className="text-[#d4a017]">TEST SCAN TICKET</strong> above to open the camera scanner and inspect your tickets' raw barcode formats.
          </div>
        )}
      </div>

      {/* 9. Well & Sand Recovery & History Audit */}
      <div className="bg-[#14171c] border border-[#d4a017]/80 rounded-xl p-6 text-[#e8ebe6] shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2a313b]">
          <div>
            <h3 className="text-lg font-black uppercase text-[#d4a017] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#d4a017]" /> 9. WELL & SAND DATA RECOVERY / RESTORATION
            </h3>
            <p className="text-xs text-[#9aa3ad] font-medium mt-0.5">
              Reconstruct your well names, sand types, and silo mappings directly from logged delivery tickets and run records.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsRecoveryOpen(true)}
            className="bg-[#d4a017] hover:bg-[#d4a017] active:bg-[#d4a017] text-[#0b0c0e] font-black text-xs px-5 py-3 rounded-lg shadow-lg border border-[#d4a017] flex items-center justify-center gap-2 uppercase tracking-wider transition active:scale-95 shrink-0 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 stroke-[2.5]" />
            <span>OPEN DATA RECOVERY TOOL</span>
          </button>
        </div>

        <div className="bg-[#0b0c0e]/80 border border-[#2a313b] p-4 rounded-lg text-[#e8ebe6] text-xs flex items-center justify-between gap-4">
          <div>
            <span className="font-bold text-[#d4a017]">Lost a well name or did your sand types change?</span> Use this tool to scan all historical tickets, inspect other database pads, or restore from local device snapshots.
          </div>
          <button
            type="button"
            onClick={() => setIsRecoveryOpen(true)}
            className="text-[#d4a017] hover:underline font-black uppercase text-xs shrink-0 cursor-pointer"
          >
            Launch Recovery &rarr;
          </button>
        </div>
      </div>

      {/* 10. Stage Record Consistency & Reconciliation */}
      <div
        className={`border-2 rounded-xl p-6 text-[#e8ebe6] shadow-2xl space-y-4 ${
          hasConsistencyIssues ? 'bg-[#291e04]/60 border-[#d4a017]' : 'bg-[#14171c] border-[#2a313b]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2a313b]">
          <div>
            <h3 className="text-lg font-black uppercase text-[#d4a017] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#d4a017]" /> 10. STAGE RECORD CONSISTENCY & RUN AUTHORITY
            </h3>
            <p className="text-xs text-[#9aa3ad] font-medium mt-0.5">
              Audits StageRecord documents against active RunRecords to detect and resolve cache drift or orphaned stages.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRebuildStageRecords}
            disabled={isRebuildingStages}
            className="bg-[#d4a017] hover:bg-[#d4a017] active:bg-[#d4a017] text-[#0b0c0e] font-black text-xs px-5 py-3 rounded-lg shadow-lg border border-[#d4a017] flex items-center justify-center gap-2 uppercase tracking-wider transition active:scale-95 shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 stroke-[2.5] ${isRebuildingStages ? 'animate-spin' : ''}`} />
            <span>{isRebuildingStages ? 'REBUILDING...' : 'RECONCILE ALL STAGE RECORDS'}</span>
          </button>
        </div>

        {rebuildStatusMsg && (
          <div className="bg-[#0b0c0e] p-3.5 rounded-xl border border-[#d4a017]/50 text-xs font-bold text-[#d4a017]">
            {rebuildStatusMsg}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-[#0b0c0e] border border-[#2a313b] p-3 rounded-xl">
            <div className="text-[10px] font-bold text-[#9aa3ad] uppercase">Status</div>
            <div className={`text-lg font-black font-mono mt-0.5 ${report.stageRecordConsistency?.isConsistent ? 'text-[#8fa37a]' : 'text-[#d4a017]'}`}>
              {report.stageRecordConsistency?.isConsistent ? 'CONSISTENT' : 'DRIFT DETECTED'}
            </div>
          </div>
          <div className="bg-[#0b0c0e] border border-[#2a313b] p-3 rounded-xl">
            <div className="text-[10px] font-bold text-[#9aa3ad] uppercase">Inconsistencies</div>
            <div className={`text-xl font-black font-mono mt-0.5 ${(report.stageRecordConsistency?.inconsistentCount || 0) > 0 ? 'text-[#d4a017]' : 'text-[#9aa3ad]'}`}>
              {report.stageRecordConsistency?.inconsistentCount ?? 0}
            </div>
          </div>
          <div className="bg-[#0b0c0e] border border-[#2a313b] p-3 rounded-xl col-span-2 sm:col-span-1">
            <div className="text-[10px] font-bold text-[#9aa3ad] uppercase">Authority Source</div>
            <div className="text-xs font-mono font-bold text-[#e8ebe6] mt-1">
              Active RunRecords
            </div>
          </div>
        </div>

        {!hasConsistencyIssues ? (
          <div className="bg-[#0b0c0e]/80 border border-[#2a313b] p-4 rounded-lg text-[#e8ebe6] text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#8fa37a]" />
            All StageRecords are 100% consistent with active RunRecords. Active run history is the sole authority.
          </div>
        ) : (
          <div className="space-y-2">
            {report.stageRecordConsistency?.issues.map((iss, idx) => (
              <div
                key={`${iss.wellId}_stage_${iss.stageNumber}_${idx}`}
                className="bg-[#291e04]/40 border border-[#d4a017]/60 p-3.5 rounded-lg text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-[#e8ebe6] text-sm">
                    {iss.wellName} — STAGE #{iss.stageNumber}
                  </span>
                  <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-[#d4a017]/20 text-[#d4a017] border border-[#d4a017]/40">
                    DISCREPANCY
                  </span>
                </div>
                <div className="text-[#d4a017] text-xs font-medium">
                  {iss.issue}
                </div>
                <div className="text-[#e8ebe6] grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-[11px] pt-1">
                  <div>
                    Weight: <span className="text-[#e25a4a] font-bold">Cached {iss.cachedTotalLbs !== undefined ? formatLbs(iss.cachedTotalLbs) : '—'}</span> vs{' '}
                    <span className="text-[#8fa37a] font-bold">Active {formatLbs(iss.authoritativeTotalLbs)}</span>
                  </div>
                  <div>
                    Status: <span className="text-[#e25a4a] font-bold">Cached {iss.cachedStatus?.toUpperCase() || '—'}</span> vs{' '}
                    <span className="text-[#8fa37a] font-bold">Authoritative {iss.authoritativeStatus.toUpperCase()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ticket Scanner Modal */}
      <TicketScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleTestScan}
        title="DIAGNOSTIC TICKET SCAN TEST"
      />

      {/* Pad Recovery Modal */}
      <PadRecoveryModal
        isOpen={isRecoveryOpen}
        onClose={() => setIsRecoveryOpen(false)}
        state={state}
        onSelectPad={onSelectPad}
      />
    </div>
  );
}
