import { useState, useEffect, ChangeEvent } from 'react';
import { Briefcase, Trash2, Download, AlertTriangle, CheckCircle2, Loader2, Plus, ArrowRight, ShieldAlert, UploadCloud, RefreshCw } from 'lucide-react';
import { PadSummaryInfo, listPadsWithDetails, deletePad, fetchPadFullState } from '../lib/firestoreService';
import { restoreUniversity40E, UNIVERSITY_40E_PAD_ID, importJobPackage } from '../lib/importService';
import { downloadPadCSV } from '../lib/exportUtils';
import { AppState } from '../types';
import { JobImportPackage } from '../types/import';

interface JobManagementProps {
  currentPadId: string;
  currentState?: AppState;
  onSelectPad: (padId: string) => void;
  onPadListUpdated?: () => void;
  onSuccessMessage?: (msg: string) => void;
}

export default function JobManagement({
  currentPadId,
  currentState,
  onSelectPad,
  onPadListUpdated,
  onSuccessMessage,
}: JobManagementProps) {
  const [padSummaries, setPadSummaries] = useState<PadSummaryInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Restore Staged Pad State
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgressText, setRestoreProgressText] = useState('');
  const [restoreProgressPct, setRestoreProgressPct] = useState(0);

  // Delete Modal State
  const [padToDelete, setPadToDelete] = useState<PadSummaryInfo | null>(null);
  const [confirmNameInput, setConfirmNameInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  const fetchSummaries = async () => {
    setLoading(true);
    try {
      const list = await listPadsWithDetails();
      setPadSummaries(list);
    } catch (err) {
      console.error('Error fetching pad details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummaries();
  }, [currentPadId]);

  const handleRestoreUniversity40E = async () => {
    setIsRestoring(true);
    setRestoreProgressText('Preparing staged records...');
    setRestoreProgressPct(5);
    try {
      const result = await restoreUniversity40E((msg, pct) => {
        setRestoreProgressText(msg);
        setRestoreProgressPct(pct);
      });
      if (onSuccessMessage) {
        onSuccessMessage(
          `Successfully restored University 40E! Imported ${result.deliveriesCount} deliveries and ${result.runsCount} stage runs.`
        );
      }
      await fetchSummaries();
      if (onPadListUpdated) {
        onPadListUpdated();
      }
      onSelectPad(UNIVERSITY_40E_PAD_ID);
    } catch (err) {
      console.error('Error restoring University 40E data:', err);
      alert('Failed to restore University 40E data. Please check your connection.');
    } finally {
      setIsRestoring(false);
      setRestoreProgressText('');
      setRestoreProgressPct(0);
    }
  };

  const handleImportJsonFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const pkg = JSON.parse(text) as JobImportPackage;
      if (!pkg.config || !pkg.deliveries || !pkg.runs) {
        alert('Invalid Job Package format. Please upload a valid SandTracker JSON package.');
        return;
      }

      setIsRestoring(true);
      const result = await importJobPackage(pkg, (msg, pct) => {
        setRestoreProgressText(msg);
        setRestoreProgressPct(pct);
      });

      if (onSuccessMessage) {
        onSuccessMessage(
          `Imported "${pkg.config.padName}" (${result.deliveriesCount} deliveries, ${result.runsCount} runs)!`
        );
      }
      await fetchSummaries();
      if (onPadListUpdated) {
        onPadListUpdated();
      }
      onSelectPad(result.padId);
    } catch (err) {
      console.error('Error parsing or importing JSON package:', err);
      alert('Failed to import JSON file. Please ensure it is a valid format.');
    } finally {
      setIsRestoring(false);
      setRestoreProgressText('');
      setRestoreProgressPct(0);
      e.target.value = '';
    }
  };

  const openDeleteModal = (pad: PadSummaryInfo) => {
    setPadToDelete(pad);
    setConfirmNameInput('');
    setExportDone(false);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setPadToDelete(null);
    setConfirmNameInput('');
    setExportDone(false);
  };

  const handleExportBeforeDelete = async () => {
    if (!padToDelete) return;
    setIsExporting(true);
    try {
      let stateToExport: AppState;
      if (currentState && currentState.padId === padToDelete.id) {
        stateToExport = currentState;
      } else {
        stateToExport = await fetchPadFullState(padToDelete.id);
      }
      downloadPadCSV(stateToExport);
      setExportDone(true);
      if (onSuccessMessage) {
        onSuccessMessage(`CSV record exported for "${padToDelete.name}"!`);
      }
    } catch (err) {
      console.error('Failed to export pad before delete:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!padToDelete) return;
    if (confirmNameInput.trim() !== padToDelete.name.trim()) return;

    const isCurrentActive = padToDelete.id === currentPadId;
    setIsDeleting(true);
    try {
      const result = await deletePad(padToDelete.id);
      if (onSuccessMessage) {
        onSuccessMessage(
          `Permanently deleted "${padToDelete.name}" (${result.deliveriesDeleted} tickets & ${result.runsDeleted} stage runs removed).`
        );
      }
      closeDeleteModal();
      await fetchSummaries();
      if (onPadListUpdated) {
        onPadListUpdated();
      }
      if (isCurrentActive) {
        onSelectPad('');
      }
    } catch (err) {
      console.error('Error deleting pad:', err);
      alert('Failed to delete well pad. Please check connection.');
    } finally {
      setIsDeleting(false);
    }
  };

  const isNameMatch = padToDelete ? confirmNameInput.trim() === padToDelete.name.trim() : false;

  return (
    <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 text-white shadow-2xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500/20 text-amber-400 p-2.5 rounded-2xl border border-amber-500/30">
            <Briefcase className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-xl font-black uppercase text-amber-400 tracking-tight">
              JOBS & WELL PADS MANAGER
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Review all registered job locations, switch active pads, or permanently purge completed jobs.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchSummaries}
          className="text-xs text-slate-400 hover:text-amber-400 font-mono font-bold bg-slate-950 border border-slate-800 hover:border-slate-700 px-3.5 py-2 rounded-xl transition self-start sm:self-auto"
        >
          {loading ? 'Refreshing...' : '↻ Refresh Counts'}
        </button>
      </div>

      {loading && padSummaries.length === 0 ? (
        <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
          <span className="text-sm font-bold">Loading pad records & database counts...</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400">
                <th className="py-3 px-4">Job / Pad Name</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Delivery Tickets</th>
                <th className="py-3 px-4 text-right">Stage Runs</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {padSummaries.map((pad) => {
                const isActive = pad.id === currentPadId;
                const isOnlyPad = padSummaries.length <= 1;

                return (
                  <tr
                    key={pad.id}
                    className={`transition ${
                      isActive ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-4 px-4">
                      <div className="font-black text-white text-base flex items-center gap-2">
                        {pad.name}
                        {isActive && (
                          <span className="bg-amber-500 text-slate-950 text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">ID: {pad.id}</div>
                    </td>

                    <td className="py-4 px-4 text-center">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          <CheckCircle2 className="w-3.5 h-3.5" /> CURRENT ACTIVE JOB
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectPad(pad.id)}
                          className="inline-flex items-center gap-1 text-xs font-black text-slate-400 hover:text-amber-400 bg-slate-950 hover:bg-slate-800 border border-slate-800 px-3 py-1 rounded-xl transition"
                        >
                          Switch to Job <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </td>

                    <td className="py-4 px-4 text-right font-mono font-bold text-amber-400">
                      {pad.deliveryCount.toLocaleString()}
                    </td>

                    <td className="py-4 px-4 text-right font-mono font-bold text-cyan-400">
                      {pad.runCount.toLocaleString()}
                    </td>

                    <td className="py-4 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openDeleteModal(pad)}
                        className="inline-flex items-center gap-1.5 text-xs font-black text-red-400 hover:text-white bg-red-950/40 hover:bg-red-600 border border-red-800/60 hover:border-red-500 px-3.5 py-1.5 rounded-xl transition shadow-sm active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> DELETE
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* RESTORE & IMPORT SECTION */}
      <div className="border-t border-slate-800 pt-6 mt-6 space-y-4">
        <div className="flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-amber-400" />
          <h4 className="text-sm font-black uppercase text-white tracking-wider">
            RESTORE & IMPORT WELL PAD DATA
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: 1-Click Restore University 40E */}
          <div className="bg-slate-950 border border-amber-500/40 rounded-2xl p-4 flex flex-col justify-between space-y-3 relative overflow-hidden">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase text-amber-400 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> RESTORE UNIVERSITY 40E
                </div>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black px-2 py-0.5 rounded-full">
                  688 Tickets • 184 Runs
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Directly restore all lost data for <strong>University 40E</strong> (Wells 1803WB & 1803WC, Silos 1-6, 100 Mesh & 40/70 sand, 688 delivery tickets, and 184 stage pulls).
              </p>
            </div>

            {isRestoring && restoreProgressText && (
              <div className="space-y-1.5 bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                <div className="flex justify-between text-[11px] font-bold text-amber-400">
                  <span>{restoreProgressText}</span>
                  <span>{restoreProgressPct}%</span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className="bg-amber-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${restoreProgressPct}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleRestoreUniversity40E}
              disabled={isRestoring}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-[0.99] text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> Restoring Records into Firestore...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 text-slate-950" /> 1-Click Restore "University 40E"
                </>
              )}
            </button>
          </div>

          {/* Card 2: Custom JSON Import */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="text-xs font-black uppercase text-cyan-400 flex items-center gap-1.5">
                <UploadCloud className="w-3.5 h-3.5" /> IMPORT BACKUP PACKAGE (JSON)
              </div>
              <p className="text-xs text-slate-300">
                Upload any exported SandTracker JSON job package to restore another well pad, well configurations, or delivery history.
              </p>
            </div>

            <label className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-200 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition">
              <UploadCloud className="w-4 h-4 text-cyan-400" />
              <span>Select .JSON Backup File</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJsonFile}
                disabled={isRestoring}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Irreversible Delete Confirmation Modal */}
      {padToDelete && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-red-500/80 rounded-3xl max-w-lg w-full p-6 text-white shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start gap-3.5 border-b border-slate-800 pb-4">
              <div className="bg-red-500/20 text-red-400 p-3 rounded-2xl border border-red-500/30 shrink-0">
                <ShieldAlert className="w-8 h-8 stroke-[2.5]" />
              </div>
              <div>
                <div className="text-[11px] font-black uppercase tracking-widest text-red-400">
                  PERMANENT DESTRUCTION WARNING
                </div>
                <h3 className="text-xl font-black uppercase text-white tracking-tight">
                  DELETE JOB & ALL SUBCOLLECTIONS
                </h3>
              </div>
            </div>

            {/* Destruction Summary */}
            <div className="bg-red-950/40 border border-red-900/60 rounded-2xl p-4 space-y-2 text-xs">
              <div className="font-bold text-red-200 text-sm">
                You are about to permanently delete:
              </div>
              <div className="text-base font-black text-white bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2">
                {padToDelete.name}
              </div>
              <p className="text-slate-300 font-medium pt-1">
                This operation will permanently purge the pad configuration document and explicitly delete all subcollection records in Firestore in batches:
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2 text-center">
                  <div className="text-[10px] uppercase font-sans text-slate-400 font-bold">Delivery Tickets</div>
                  <div className="text-base font-black text-amber-400">{padToDelete.deliveryCount.toLocaleString()}</div>
                </div>
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2 text-center">
                  <div className="text-[10px] uppercase font-sans text-slate-400 font-bold">Stage Runs</div>
                  <div className="text-base font-black text-cyan-400">{padToDelete.runCount.toLocaleString()}</div>
                </div>
              </div>
              <div className="text-red-400 font-bold text-[11px] pt-1">
                ⚠️ This action is irreversible. Soft delete does not apply.
              </div>
            </div>

            {/* Offer Export First */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase text-amber-400">OFFER: EXPORT BACKUP FIRST</div>
                <p className="text-[11px] text-slate-400">Download full CSV spreadsheet before deleting.</p>
              </div>
              <button
                type="button"
                onClick={handleExportBeforeDelete}
                disabled={isExporting}
                className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white border border-slate-700 font-black px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shrink-0 transition"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting...
                  </>
                ) : exportDone ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Exported!
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 text-amber-400" /> Download CSV First
                  </>
                )}
              </button>
            </div>

            {/* Confirmation input */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                To confirm permanent deletion, type <span className="font-mono text-amber-400 font-black">"{padToDelete.name}"</span> below:
              </label>
              <input
                type="text"
                value={confirmNameInput}
                onChange={(e) => setConfirmNameInput(e.target.value)}
                placeholder={padToDelete.name}
                disabled={isDeleting}
                className="w-full bg-slate-950 border-2 border-slate-700 focus:border-red-500 rounded-2xl px-4 py-3 text-sm font-bold text-white focus:outline-none"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-5 py-3 rounded-2xl text-xs transition"
              >
                CANCEL
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={!isNameMatch || isDeleting}
                className={`w-full sm:w-auto font-black px-6 py-3 rounded-2xl text-xs flex items-center justify-center gap-2 uppercase tracking-wide transition shadow-lg ${
                  isNameMatch && !isDeleting
                    ? 'bg-red-600 hover:bg-red-500 text-white cursor-pointer active:scale-95 border-2 border-red-400'
                    : 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                }`}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Purging Records...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" /> PERMANENTLY DELETE JOB
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
