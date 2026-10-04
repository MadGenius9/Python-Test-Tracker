import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  History,
  RotateCcw,
  Sparkles,
  Layers,
  FileSpreadsheet,
  HardDrive,
  ArrowRight,
  X,
  RefreshCw,
  Plus,
  Trash2,
} from 'lucide-react';
import { AppState, PadConfig, WellConfig, SandTypeSpec } from '../types';
import {
  reconstructPadConfigFromHistory,
  getLocalPadConfigBackup,
  getAllLocalPadBackups,
  savePadConfig,
  listPadsWithDetails,
  PadSummaryInfo,
} from '../lib/firestoreService';

export interface LocalBackupItem {
  name: string;
  customer?: string;
  savedAt: number;
  wells: string[];
  sandTypes: string[];
  config: PadConfig;
}

export interface PadRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onSelectPad?: (padId: string) => void;
}

export default function PadRecoveryModal({
  isOpen,
  onClose,
  state,
  onSelectPad,
}: PadRecoveryModalProps) {
  const { padId, config, deliveries, runs } = state;
  const [activeSubTab, setActiveSubTab] = useState<'auto_reconstruct' | 'device_backups' | 'all_pads' | 'manual_quick_fix'>('auto_reconstruct');
  const [isApplying, setIsApplying] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [allPads, setAllPads] = useState<PadSummaryInfo[]>([]);
  const [localBackups, setLocalBackups] = useState<Record<string, LocalBackupItem>>({});

  // Quick Manual Edit State
  const [quickPadName, setQuickPadName] = useState(config.padName || '');
  const [quickCustomer, setQuickCustomer] = useState(config.customerName || 'Diamondback Energy');
  const [quickWellsText, setQuickWellsText] = useState(
    config.wells.map((w) => `${w.name} (${w.plannedStages} stages)`).join(', ')
  );
  const [quickSandText, setQuickSandText] = useState(
    config.sandTypes.map((s) => s.name).join(', ')
  );

  useEffect(() => {
    if (isOpen) {
      setLocalBackups(getAllLocalPadBackups());
      listPadsWithDetails().then(setAllPads).catch(console.error);
      setSuccessMessage(null);
      setQuickPadName(config.padName || '');
      setQuickCustomer(config.customerName || 'Diamondback Energy');
      setQuickWellsText(config.wells.map((w) => `${w.name} (${w.plannedStages} stages)`).join(', '));
      setQuickSandText(config.sandTypes.map((s) => s.name).join(', '));
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  // Compute reconstructed configuration preview from history
  const reconstructedConfig = reconstructPadConfigFromHistory(state);

  const allDeliveriesCount = deliveries.length + (state.deletedDeliveries?.length || 0);
  const allRunsCount = runs.length + (state.deletedRuns?.length || 0);

  // Extract unique sand types found in tickets
  const detectedSandInDeliveries = Array.from(
    new Set(deliveries.map((d) => d.sandType).filter(Boolean))
  );
  const detectedSandInRuns = Array.from(
    new Set(runs.map((r) => r.sandType).filter(Boolean))
  );
  const allDetectedSand = Array.from(
    new Set([...detectedSandInDeliveries, ...detectedSandInRuns])
  );

  // Extract unique wells found in runs
  const detectedWellIdsInRuns = Array.from(
    new Set(runs.map((r) => r.wellId).filter(Boolean))
  );

  const handleApplyReconstruction = async () => {
    setIsApplying(true);
    try {
      await savePadConfig(padId, reconstructedConfig);
      setSuccessMessage('Successfully reconstructed configuration from historical delivery and run records!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Failed to apply reconstruction:', err);
    } finally {
      setIsApplying(false);
    }
  };

  const handleRestoreBackup = async (backupConfig: PadConfig) => {
    setIsApplying(true);
    try {
      await savePadConfig(padId, backupConfig);
      setSuccessMessage(`Successfully restored configuration from ${backupConfig.padName}!`);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Failed to restore backup:', err);
    } finally {
      setIsApplying(false);
    }
  };

  const handleApplyQuickManual = async () => {
    setIsApplying(true);
    try {
      // Parse wells
      const wellParts = quickWellsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const parsedWells: WellConfig[] = wellParts.map((raw, idx) => {
        const match = raw.match(/^(.*?)(?:\s*\(([0-9]+)\s*stages?\))?$/i);
        const name = match ? match[1].trim() : raw;
        const stages = match && match[2] ? parseInt(match[2], 10) : 45;
        return {
          id: `w-${idx + 1}`,
          name: name || `Well ${idx + 1}`,
          plannedStages: isNaN(stages) ? 45 : stages,
          customerName: quickCustomer,
        };
      });

      // Parse sand types
      const sandParts = quickSandText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const colorCats: ('orange' | 'blue' | 'emerald' | 'amber' | 'slate')[] = [
        'orange',
        'blue',
        'emerald',
        'amber',
        'slate',
      ];
      const parsedSandTypes: SandTypeSpec[] = sandParts.map((name, idx) => ({
        id: `st-${idx + 1}`,
        name,
        perStageDesignLbs: 150000,
        jobDesignTotalLbs: 10000000,
        colorCategory: colorCats[idx % colorCats.length],
      }));

      // Update silos
      const updatedSilos = config.silos.map((s, idx) => {
        const assignedSand = parsedSandTypes.length > 0
          ? parsedSandTypes[idx % parsedSandTypes.length].name
          : null;
        return {
          ...s,
          sandType: assignedSand,
        };
      });

      const newConfig: PadConfig = {
        ...config,
        padName: quickPadName.trim() || 'Well Pad',
        customerName: quickCustomer.trim(),
        wells: parsedWells.length > 0 ? parsedWells : config.wells,
        sandTypes: parsedSandTypes.length > 0 ? parsedSandTypes : config.sandTypes,
        silos: updatedSilos,
      };

      await savePadConfig(padId, newConfig);
      setSuccessMessage('Successfully updated pad, wells, and sand configuration!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to save quick manual config:', err);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div
      id="pad-recovery-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div
        id="pad-recovery-modal-container"
        className="bg-slate-900 border-2 border-amber-500/80 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="bg-slate-950 border-b border-slate-800 p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-slate-950 p-2.5 rounded-2xl font-black shrink-0">
              <Sparkles className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black uppercase text-white tracking-tight">
                WELL & SAND DATA RECOVERY
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Restore or auto-reconstruct your wells, sand types, and silo mappings
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Success Banner */}
        {successMessage && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/50 p-4 text-emerald-300 font-bold text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="bg-slate-950/60 border-b border-slate-800 px-5 flex items-center gap-2 overflow-x-auto text-xs font-black uppercase tracking-wider">
          <button
            type="button"
            onClick={() => setActiveSubTab('auto_reconstruct')}
            className={`py-3.5 px-3 border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeSubTab === 'auto_reconstruct'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Auto-Reconstruct from History ({allDeliveriesCount} Tickets)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('manual_quick_fix')}
            className={`py-3.5 px-3 border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeSubTab === 'manual_quick_fix'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Quick Well & Sand Editor</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('all_pads')}
            className={`py-3.5 px-3 border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeSubTab === 'all_pads'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>All Database Pads ({allPads.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('device_backups')}
            className={`py-3.5 px-3 border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeSubTab === 'device_backups'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Device Backups ({Object.keys(localBackups).length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* TAB 1: AUTO RECONSTRUCT */}
          {activeSubTab === 'auto_reconstruct' && (
            <div className="space-y-6">
              <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 text-xs text-amber-200 space-y-1">
                <div className="font-black uppercase text-amber-300 flex items-center gap-2 text-sm">
                  <Sparkles className="w-4 h-4" /> AUTO-DISCOVERY FROM LOGGED DELIVERIES & RUNS
                </div>
                <p>
                  We scanned your active database history (<strong>{deliveries.length} active delivery tickets</strong> and{' '}
                  <strong>{runs.length} stage pull records</strong>). Below is the detected configuration based on actual
                  sand dropped and stages pulled.
                </p>
              </div>

              {/* Detected Data Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Detected Sand Types */}
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3">
                  <div className="text-xs font-black text-slate-400 uppercase tracking-wider">
                    Detected Sand Types ({allDetectedSand.length})
                  </div>
                  {allDetectedSand.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {allDetectedSand.map((sand) => (
                        <span
                          key={sand}
                          className="bg-amber-500/20 text-amber-300 border border-amber-500/50 px-3 py-1 rounded-xl text-xs font-black uppercase"
                        >
                          {sand}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      No delivery tickets or runs have been recorded yet on this pad.
                    </p>
                  )}
                </div>

                {/* Detected Wells */}
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3">
                  <div className="text-xs font-black text-slate-400 uppercase tracking-wider">
                    Detected Wells in Runs ({detectedWellIdsInRuns.length})
                  </div>
                  {detectedWellIdsInRuns.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {detectedWellIdsInRuns.map((wId) => {
                        const well = config.wells.find((w) => w.id === wId);
                        return (
                          <span
                            key={wId}
                            className="bg-blue-500/20 text-blue-300 border border-blue-500/50 px-3 py-1 rounded-xl text-xs font-black uppercase"
                          >
                            {well?.name || wId}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {config.wells.map((w) => (
                        <span
                          key={w.id}
                          className="bg-slate-800 text-slate-300 px-3 py-1 rounded-xl text-xs font-bold"
                        >
                          {w.name} ({w.plannedStages} stages)
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Silo Assignment Preview */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3">
                <div className="text-xs font-black text-slate-400 uppercase tracking-wider">
                  Reconstructed Silo Sand Assignments
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {reconstructedConfig.silos.map((silo) => (
                    <div
                      key={silo.siloNumber}
                      className="bg-slate-900 border border-slate-800 p-3 rounded-xl text-center space-y-1"
                    >
                      <div className="text-xs font-black text-slate-400">
                        SILO #{silo.siloNumber} ({silo.side})
                      </div>
                      <div className="text-xs font-black text-amber-400 truncate">
                        {silo.sandType || '(Empty)'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  disabled={isApplying}
                  onClick={handleApplyReconstruction}
                  className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 text-slate-950 font-black text-sm px-6 py-3.5 rounded-2xl shadow-xl border-2 border-amber-300 flex items-center gap-2 uppercase tracking-wider transition cursor-pointer"
                >
                  <Sparkles className="w-5 h-5 stroke-[2.5]" />
                  <span>{isApplying ? 'Applying...' : 'Apply Reconstructed Setup to Pad'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: QUICK WELL & SAND EDITOR */}
          {activeSubTab === 'manual_quick_fix' && (
            <div className="space-y-5">
              <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-1.5">
                      Pad / Location Name
                    </label>
                    <input
                      type="text"
                      value={quickPadName}
                      onChange={(e) => setQuickPadName(e.target.value)}
                      placeholder="e.g. Red Hills Pad 1-4H"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-1.5">
                      Customer / Operator
                    </label>
                    <input
                      type="text"
                      value={quickCustomer}
                      onChange={(e) => setQuickCustomer(e.target.value)}
                      placeholder="e.g. Diamondback Energy, Chevron"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Well Names (Comma Separated)
                  </label>
                  <input
                    type="text"
                    value={quickWellsText}
                    onChange={(e) => setQuickWellsText(e.target.value)}
                    placeholder="e.g. Well 1H (45 stages), Well 2H (42 stages)"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Example: Well 1H (45 stages), Well 2H (42 stages), Well 3H (40 stages)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-1.5">
                    Sand Types on Pad (Comma Separated)
                  </label>
                  <input
                    type="text"
                    value={quickSandText}
                    onChange={(e) => setQuickSandText(e.target.value)}
                    placeholder="e.g. 100 Mesh, 40/70"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Example: 100 Mesh, 40/70, 30/50
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={isApplying}
                  onClick={handleApplyQuickManual}
                  className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 text-slate-950 font-black text-sm px-6 py-3.5 rounded-2xl shadow-xl border-2 border-amber-300 flex items-center gap-2 uppercase tracking-wider transition cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                  <span>{isApplying ? 'Saving...' : 'Save & Update Pad Setup'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: ALL DATABASE PADS */}
          {activeSubTab === 'all_pads' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-400">
                Below are all registered well pads discovered in your Firestore database. If your data is located on another pad ID, you can switch immediately:
              </div>

              <div className="space-y-2">
                {allPads.map((pad) => {
                  const isCurrent = pad.id === padId;
                  return (
                    <div
                      key={pad.id}
                      className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-amber-500/10 border-amber-500/80'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-base text-white">{pad.name}</span>
                          {isCurrent && (
                            <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-md uppercase">
                              ACTIVE PAD
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          ID: {pad.id} • {pad.deliveryCount} Deliveries • {pad.runCount} Stage Runs
                        </div>
                      </div>

                      {!isCurrent && onSelectPad && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectPad(pad.id);
                            onClose();
                          }}
                          className="bg-slate-800 hover:bg-slate-700 text-amber-400 font-black text-xs px-4 py-2.5 rounded-xl border border-slate-700 flex items-center gap-1.5 uppercase transition cursor-pointer"
                        >
                          <span>Switch to this Pad</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: DEVICE BACKUPS */}
          {activeSubTab === 'device_backups' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-400">
                Snapshots stored locally on this browser from previous setup saves:
              </div>

              {Object.keys(localBackups).length > 0 ? (
                <div className="space-y-3">
                  {(Object.entries(localBackups) as [string, LocalBackupItem][]).map(([bId, bData]) => (
                    <div
                      key={bId}
                      className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-black text-white text-base">{bData.name}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          Saved: {new Date(bData.savedAt).toLocaleString()} • Wells: {bData.wells.join(', ')} • Sand:{' '}
                          {bData.sandTypes.join(', ')}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRestoreBackup(bData.config)}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl uppercase flex items-center gap-1.5 transition cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Restore Snapshot</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl text-center text-slate-500 text-xs">
                  No local snapshots found on this browser device yet.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
