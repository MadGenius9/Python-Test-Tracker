import {
  Boxes,
  Truck,
  Layers,
  History,
  Settings,
  Stethoscope,
  Radio,
  AlertTriangle,
  FileText,
  Activity,
  BookOpen,
  FileSpreadsheet,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  ClipboardCheck,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import PadSchematic from './components/PadSchematic';
import AddDelivery from './components/AddDelivery';
import Dashboard from './components/Dashboard';
import Diagnostics from './components/Diagnostics';
import JobDesign from './components/JobDesign';
import Logs from './components/Logs';
import RecordRun from './components/RecordRun';
import Setup from './components/Setup';
import SiloBoard from './components/SiloBoard';
import StageProgress from './components/StageProgress';
import StagePullSheet from './components/StagePullSheet';
import StageReview from './components/StageReview';
import { Reconciliation } from './components/Reconciliation';
import QuickEntry from './components/QuickEntry';
import { onFirebaseError, waitForFirebaseAuth, resetAuthReadyPromise } from './lib/firebase';
import { getNextWellAndStage, isStageComplete, getSiloDerivedStates, getPadSummary } from './lib/sandRules';
import HopperField from './components/HopperField';
import {
  addDeliveryTicket,
  addRunRecords,
  deleteDeliveryTicket,
  restoreDeliveryTicket,
  deleteRunRecord,
  deleteStage,
  restoreRunRecord,
  updateDeliveryTicket,
  updateRunRecord,
  listPads,
  savePadConfig,
  subscribeToPad,
  updateSiloInPad,
  updateSilosInPad,
  UNIVERSITY_40E_PAD_ID,
} from './lib/firestoreService';
import { cleanObsoleteQueueStorage } from './lib/offlineQueue';
import { AppState, PadConfig, StartupStatus } from './types';

const ACTIVE_PAD_STORAGE_KEY = 'sandtracker_active_pad_id';

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'board' | 'pullsheet' | 'job_design' | 'progress' | 'stages' | 'reconciliation' | 'delivery' | 'run' | 'logs' | 'diagnostics' | 'setup'
  >('dashboard');

  const [logsFilter, setLogsFilter] = useState<{
    tab?: 'deliveries' | 'by_day' | 'runs' | 'deleted' | 'export';
    wellFilter?: string;
    searchTerm?: string;
  } | null>(null);

  // Active pad ID: initialized to URL, storage parameter, or default design pad
  const [currentPadId, setCurrentPadId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return UNIVERSITY_40E_PAD_ID;
    const params = new URLSearchParams(window.location.search);
    const urlPad = params.get('pad');
    if (urlPad) return urlPad;
    try {
      const stored = localStorage.getItem(ACTIVE_PAD_STORAGE_KEY);
      if (stored) return stored;
    } catch (e) {
      // ignore
    }
    return UNIVERSITY_40E_PAD_ID;
  });

  // Explicit startup and auth lifecycle states for local design mode
  const [isAuthReady, setIsAuthReady] = useState<boolean>(true);
  const [startupStatus, setStartupStatus] = useState<StartupStatus>('ready');
  const [startupError, setStartupError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  // Pad list initialized to empty array
  const [padList, setPadList] = useState<{ id: string; name: string }[]>([]);

  // AppState initialized to null (Fix 3 & Fix 5)
  const [state, setState] = useState<AppState | null>(null);

  // Ref tracking currently active pad to prevent race conditions & late snapshots (Fix 7)
  const activePadIdRef = useRef<string | null>(currentPadId);
  useEffect(() => {
    activePadIdRef.current = currentPadId;
  }, [currentPadId]);

  const [deliveryInitialSilo, setDeliveryInitialSilo] = useState<number | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Pinned read-only stage pull sheet from URL (Fix 8)
  const [pinnedUrlParams] = useState<{ wellId: string | null; stageNumber: number | null }>(() => {
    if (typeof window === 'undefined') return { wellId: null, stageNumber: null };
    const params = new URLSearchParams(window.location.search);
    const well = params.get('well');
    const stage = params.get('stage') ? parseInt(params.get('stage')!, 10) : null;
    if (well && stage) {
      return { wellId: well, stageNumber: stage };
    }
    return { wellId: null, stageNumber: null };
  });

  const isPinnedReadOnly = Boolean(pinnedUrlParams.wellId && pinnedUrlParams.stageNumber);

  // Pull sheet target for auto-advance (Fix 8 & Fix 9)
  const [pullSheetTarget, setPullSheetTarget] = useState<{
    wellId: string;
    stageNumber: number;
  } | null>(null);
  const [pullSheetResetSignal, setPullSheetResetSignal] = useState<number>(0);
  const [lastRanWellId, setLastRanWellId] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Purge any obsolete queue storage keys from legacy offline-queue system
    cleanObsoleteQueueStorage();

    // One-time cleanup for obsolete batch storage items
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (
            key &&
            (key.startsWith('sandtracker_active_ticket_batch_') ||
              key.startsWith('sandtracker_pending_ticket_batches_'))
          ) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch (_) {}
  }, []);

  // Keep localStorage in sync with active pad (Never clear on transient error) (Fix 4)
  useEffect(() => {
    if (currentPadId) {
      try {
        localStorage.setItem(ACTIVE_PAD_STORAGE_KEY, currentPadId);
      } catch (e) {
        console.warn('Unable to persist padId to localStorage:', e);
      }
    }
  }, [currentPadId]);

  // Scroll to top of page whenever activeTab or initial silo changes
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [activeTab, deliveryInitialSilo]);

  useEffect(() => {
    return onFirebaseError((err) => setFirebaseError(err));
  }, []);

  // Toast Notification
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // 1. Startup Sequence: Load pad list immediately
  useEffect(() => {
    let isMounted = true;
    setIsAuthReady(true);

    listPads()
      .then((pads) => {
        if (isMounted && pads && pads.length > 0) {
          setPadList(pads);
        }
      })
      .catch((err) => {
        console.warn('Pad list fetch warning:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [retryTrigger]);

  // 2. Direct Pad Subscription after Auth is Ready (Fix 5, Fix 6, Fix 11, Fix 14)
  useEffect(() => {
    if (!isAuthReady || !currentPadId) {
      if (!currentPadId && isAuthReady) {
        activePadIdRef.current = null;
        setState(null);
        setPullSheetTarget(null);
        setStartupStatus('no_pad_selected');
      }
      return;
    }

    activePadIdRef.current = currentPadId;
    // Clear stale state immediately when switching pads so previous pad data is never visible
    setState(null);
    setPullSheetTarget(null);
    setStartupStatus('loading_pad');

    const unsub = subscribeToPad(
      currentPadId,
      (updatedState) => {
        // Protect against late snapshot from an earlier subscribed pad (Fix 7)
        if (updatedState.padId !== activePadIdRef.current) {
          console.log(
            `[IGNORE LATE SNAPSHOT] Discarding snapshot for ${updatedState.padId} (current: ${activePadIdRef.current})`
          );
          return;
        }

        setState(updatedState);

        if (updatedState.status === 'ready') {
          setStartupStatus('ready');
          setStartupError(null);
        } else if (updatedState.status === 'not_found') {
          setStartupStatus('pad_not_found');
        }

        // Refresh pad list in background without disturbing active state (Fix 14)
        listPads()
          .then((pads) => {
            if (pads && pads.length > 0) {
              setPadList(pads);
            }
          })
          .catch(() => {});
      },
      (err: any) => {
        console.error('Error in pad subscription:', err);
        // Only show connection error if we have no prior state for this pad (Fix 11)
        if (activePadIdRef.current === currentPadId) {
          setStartupStatus('connection_error');
          setStartupError(err?.message || 'Unable to connect to database');
        }
      }
    );

    return () => {
      unsub();
    };
  }, [isAuthReady, currentPadId, retryTrigger]);

  // 3. Auto-Advance Catch-up: Clear pullSheetTarget once Firestore catches up (Fix 6)
  useEffect(() => {
    if (!pullSheetTarget || !state || !state.runs) return;
    const next = getNextWellAndStage(state, lastRanWellId);
    if (
      next &&
      next.wellId === pullSheetTarget.wellId &&
      next.stageNumber === pullSheetTarget.stageNumber
    ) {
      console.log(
        `[PULL SHEET CATCHUP] Live runs match target (Well ${next.wellId} Stage ${next.stageNumber}), clearing pullSheetTarget`
      );
      setPullSheetTarget(null);
    }
  }, [state?.runs, pullSheetTarget, lastRanWellId]);

  // Handler: Return to Job List when a pad is deleted or not found (Authoritative clear only) (Fix 4 & Fix 6)
  const handleReturnToJobList = () => {
    try {
      localStorage.removeItem(ACTIVE_PAD_STORAGE_KEY);
    } catch (_) {}
    const url = new URL(window.location.href);
    url.searchParams.delete('pad');
    url.searchParams.delete('well');
    url.searchParams.delete('stage');
    window.history.replaceState({}, '', url.pathname + (url.search || ''));

    activePadIdRef.current = null;
    setCurrentPadId(null);
    setState(null);
    setPullSheetTarget(null);
    setStartupStatus('no_pad_selected');
    setActiveTab('setup');
    listPads()
      .then((pads) => setPadList(pads))
      .catch(() => {});
  };

  // Handler: Change Silo Sand Type (Fix 12: Write Locking)
  const handleChangeSiloSand = async (siloNumber: number, sandType: string | null) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await updateSiloInPad(currentPadId, siloNumber, (s) => ({
        ...s,
        sandType,
      }));
      showToast(`Silo #${siloNumber} sand updated to ${sandType || 'Empty'}`);
    } catch (err) {
      console.error('Error changing sand type:', err);
    }
  };

  // Handler: Change Silo Priority Override (Fix 12: Write Locking)
  const handleChangeSiloPriority = async (siloNumber: number, priority: number | null) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await updateSiloInPad(currentPadId, siloNumber, (s) => ({
        ...s,
        manualPriority: priority,
      }));
      showToast(
        priority !== null
          ? `Silo #${siloNumber} manual priority set to Slot #${priority}`
          : `Silo #${siloNumber} manual priority cleared`
      );
    } catch (err) {
      console.error('Error changing silo priority:', err);
    }
  };

  // Handler: Clear All Silo Priority Overrides (Fix 12: Write Locking)
  const handleClearAllSiloPriorities = async () => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await updateSilosInPad(currentPadId, (silos) =>
        silos.map((s) => ({ ...s, manualPriority: null }))
      );
      showToast('All silo run-order overrides cleared (Reset to Auto)');
    } catch (err) {
      console.error('Error clearing silo priorities:', err);
    }
  };

  // Handler: Set Multiple Silo Priority Overrides in Bulk (Fix 12: Write Locking)
  const handleSetAllSiloPriorities = async (priorityMap: Record<number, number | null>) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await updateSilosInPad(currentPadId, (silos) =>
        silos.map((s) => {
          if (s.siloNumber in priorityMap) {
            return { ...s, manualPriority: priorityMap[s.siloNumber] };
          }
          return s;
        })
      );
      showToast('Custom silo run sequence saved successfully');
    } catch (err) {
      console.error('Error saving silo sequence:', err);
    }
  };

  // Handler: Toggle Silo Maintenance / Out of Service (Fix 12: Write Locking)
  const handleToggleSiloMaintenance = async (siloNumber: number, isOutOfService: boolean) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await updateSiloInPad(currentPadId, siloNumber, (s) => ({
        ...s,
        isOutOfService,
      }));
      showToast(
        isOutOfService
          ? `Silo #${siloNumber} marked OUT OF SERVICE (Offline)`
          : `Silo #${siloNumber} returned to ONLINE service`
      );
    } catch (err) {
      console.error('Error toggling silo maintenance:', err);
    }
  };

  // Handler: Add Delivery Ticket (Fix 12: Write Locking & Authoritative Duplicate Protection)
  const handleAddDelivery = async (deliveryData: any) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      const { supervisorOverride, overrideReason, ...ticketFields } = deliveryData;
      await addDeliveryTicket(currentPadId, ticketFields, {
        supervisorOverride: !!supervisorOverride,
        overrideReason,
      });
      showToast(
        `Ticket #${deliveryData.ticketNumber} added for Silo #${deliveryData.siloNumber}`
      );
    } catch (err: any) {
      console.error('Error adding delivery ticket:', err);
      const errMsg = err?.message || 'Failed to add delivery ticket';
      showToast(`❌ ERROR: ${errMsg}`);
      throw err;
    }
  };

  // Handler: Delete Delivery Ticket (Soft Delete) (Fix 12: Write Locking)
  const handleDeleteDelivery = async (id: string, reason?: string) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await deleteDeliveryTicket(currentPadId, id, reason);
      showToast('Delivery ticket moved to Deleted log');
    } catch (err: any) {
      console.error('Error deleting delivery ticket:', err);
      showToast(`❌ ERROR: ${err?.message || 'Failed to delete delivery ticket'}`);
    }
  };

  // Handler: Restore Delivery Ticket (Fix 12: Write Locking)
  const handleRestoreDelivery = async (id: string) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await restoreDeliveryTicket(currentPadId, id);
      showToast('Delivery ticket restored to active inventory');
    } catch (err: any) {
      console.error('Error restoring delivery ticket:', err);
      showToast(`❌ ERROR: ${err?.message || 'Failed to restore delivery ticket'}`);
    }
  };

  // Handler: Update Delivery Ticket (Fix 12: Write Locking)
  const handleUpdateDelivery = async (id: string, updates: any) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await updateDeliveryTicket(currentPadId, id, updates);
      showToast('Delivery ticket updated successfully');
    } catch (err: any) {
      console.error('Error updating delivery ticket:', err);
      showToast(`❌ ERROR: ${err?.message || 'Failed to update delivery ticket'}`);
      throw err;
    }
  };

  // Handler: Record Stage Run (Fix 8, Fix 9, Fix 10, Fix 12)
  const handleRecordRun = async (
    records: any[],
    options?: { clearManualOverrides?: boolean }
  ) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current || !state) return;
    try {
      const created = await addRunRecords(currentPadId, records);
      const justRan = records[0]?.wellId;
      setLastRanWellId(justRan);

      // Manual Override Hygiene: temporary stage-specific locks are cleared only once the stage is ACTUALLY COMPLETE
      const optimisticRuns = [...(state.runs || []), ...(created || records)];
      const optimisticState: AppState = {
        ...state,
        runs: optimisticRuns,
      };

      const wellId = records[0]?.wellId;
      const stageNum = records[0]?.stageNumber;
      const isComplete = wellId && stageNum ? isStageComplete(optimisticState, wellId, stageNum) : true;

      const hasOverrides = state.config.silos.some(
        (s) => s.manualPriority !== null && s.manualPriority !== undefined
      );
      const shouldClear = options?.clearManualOverrides !== undefined
        ? options.clearManualOverrides
        : (state.config.clearManualPriorityAfterStage ?? true);

      if (isComplete && shouldClear && hasOverrides) {
        await updateSilosInPad(currentPadId, (silos) =>
          silos.map((s) => ({ ...s, manualPriority: null }))
        );
      }

      // Auto-advance well / stage using optimistic state (Fix 9)
      const autoAdvance = state.config.autoAdvanceWellStage ?? true;
      if (autoAdvance) {
        const next = getNextWellAndStage(optimisticState, justRan);
        if (next) {
          console.log(`[AUTO ADVANCE] Next target: Well ${next.wellId}, Stage ${next.stageNumber}`);
          setPullSheetTarget({
            wellId: next.wellId,
            stageNumber: next.stageNumber,
          });
        }
      }

      showToast(`Recorded stage run for Stage #${records[0]?.stageNumber}`);
      setPullSheetResetSignal(Date.now());
      // Navigate to pullsheet tab without entering pinned read-only mode (Fix 8)
      setActiveTab('pullsheet');
    } catch (err: any) {
      console.error('Error recording stage run:', err);
      const errMsg = err?.message || 'Failed to record stage run';
      showToast(`❌ ERROR: ${errMsg}`);
      throw err;
    }
  };

  // Handler: Delete Stage Run (Soft Delete) (Fix 12: Write Locking)
  const handleDeleteRun = async (id: string, reason?: string) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await deleteRunRecord(currentPadId, id, reason);
      showToast('Stage run record moved to Deleted log');
    } catch (err: any) {
      console.error('Error deleting stage run:', err);
      showToast(`❌ ERROR: ${err?.message || 'Failed to delete stage run'}`);
    }
  };

  // Handler: Delete Entire Stage (Fix 12: Write Locking)
  const handleDeleteStage = async (wellId: string, stageNumber: number, reason?: string) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await deleteStage(currentPadId, wellId, stageNumber, reason);
      showToast(`Stage #${stageNumber} deleted and removed from active history`);
    } catch (err: any) {
      console.error('Error deleting stage:', err);
      showToast(`❌ ERROR: ${err?.message || 'Failed to delete stage'}`);
      throw err;
    }
  };

  // Handler: Restore Stage Run (Fix 12: Write Locking)
  const handleRestoreRun = async (id: string) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await restoreRunRecord(currentPadId, id);
      showToast('Stage run record restored to active calculations');
    } catch (err: any) {
      console.error('Error restoring stage run:', err);
      showToast(`❌ ERROR: ${err?.message || 'Failed to restore stage run'}`);
    }
  };

  // Handler: Update Stage Run (Fix 12: Write Locking)
  const handleUpdateRun = async (id: string, updates: any) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await updateRunRecord(currentPadId, id, updates);
      showToast('Stage run record updated successfully');
    } catch (err: any) {
      console.error('Error updating stage run record:', err);
      showToast(`❌ ERROR: ${err?.message || 'Failed to update stage run'}`);
      throw err;
    }
  };

  // Handler: Update Pad Config (Fix 12: Write Locking)
  const handleUpdateConfig = async (newConfig: PadConfig) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current) return;
    try {
      await savePadConfig(currentPadId, newConfig);
      showToast('Pad setup updated successfully');
    } catch (err) {
      console.error('Error saving pad config:', err);
    }
  };

  const handleSaveProductCodeMapping = async (mineCode: string, sandType: string) => {
    if (!currentPadId || currentPadId !== activePadIdRef.current || !state) return;
    const currentMappings = state.config.productCodeMappings || [];
    const cleanCode = mineCode.trim().toUpperCase();
    const existingIdx = currentMappings.findIndex(
      (m) => m.mineCode.trim().toUpperCase() === cleanCode
    );
    let updatedMappings = [...currentMappings];
    if (existingIdx >= 0) {
      updatedMappings[existingIdx] = { mineCode: cleanCode, sandType };
    } else {
      updatedMappings.push({ mineCode: cleanCode, sandType });
    }

    const newConfig = { ...state.config, productCodeMappings: updatedMappings };
    await savePadConfig(currentPadId, newConfig);
    showToast(`Saved Product Mapping: ${cleanCode} ➔ ${sandType}`);
  };

  // 1. PINNED READ-ONLY VIEW (Only active via URL with explicit ?well= and ?stage=) (Fix 8)
  if (isPinnedReadOnly && state && state.status !== 'not_found') {
    return (
      <div className="min-h-screen bg-[#0b0c0e] text-[#e8ebe6] font-sans selection:bg-[#c23b32] selection:text-[#e8ebe6] p-4 sm:p-6">
        {firebaseError && (
          <div className="bg-[#260e0c] text-[#e25a4a] font-medium px-4 py-2.5 text-center border-b border-[#c23b32] shadow-lg flex items-center justify-center gap-2.5 text-xs sm:text-sm z-50 relative mb-4 rounded-lg">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#e25a4a]" />
            <span>{firebaseError}</span>
          </div>
        )}

        <div className="max-w-4xl mx-auto mb-4 bg-[#14171c] border border-[#2a313b] rounded-xl px-4 py-2 text-center text-xs font-mono uppercase tracking-wider text-[#9aa3ad] flex items-center justify-center gap-2 shadow-lg">
          <Boxes className="w-4 h-4 text-[#8fa37a]" />
          <span className="text-[#e8ebe6] font-semibold">{state.config.padName || 'PAD'}</span>
          <span className="text-[#2a313b]">•</span>
          <span className="text-[#8fa37a]">READ-ONLY VIEW</span>
        </div>

        <main className="max-w-7xl mx-auto">
          <StagePullSheet
            state={state}
            initialWellId={pinnedUrlParams.wellId || undefined}
            initialStageNumber={pinnedUrlParams.stageNumber || undefined}
            isPinned={true}
            onSuccessMessage={showToast}
          />
        </main>
      </div>
    );
  }

  // 2. QUICK ENTRY MODE (via ?mode=entry URL parameter)
  const isQuickEntryMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'entry';
  if (isQuickEntryMode && state && state.status !== 'not_found') {
    return (
      <div className="min-h-screen bg-[#0b0c0e] text-[#e8ebe6] font-sans selection:bg-[#c23b32] selection:text-[#e8ebe6]">
        {firebaseError && (
          <div className="bg-[#260e0c] text-[#e25a4a] font-medium px-4 py-2.5 text-center border-b border-[#c23b32] shadow-lg flex items-center justify-center gap-2.5 text-xs sm:text-sm z-50 relative">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#e25a4a]" />
            <span>{firebaseError}</span>
          </div>
        )}

        {toastMessage && (
          <div className="fixed top-4 right-4 z-50 bg-[#1b2027] text-[#e8ebe6] px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium shadow-2xl border border-[#8fa37a]/60 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#8fa37a] shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        <QuickEntry
          state={state}
          onAddDelivery={async (deliveryData) => {
            await addDeliveryTicket(currentPadId!, deliveryData);
            showToast(`Logged Ticket #${deliveryData.ticketNumber} for Silo #${deliveryData.siloNumber}`);
          }}
          onSaveProductCodeMapping={handleSaveProductCodeMapping}
          onNavigateToSetup={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete('mode');
            window.history.pushState({}, '', url.pathname + url.search);
            setActiveTab('setup');
          }}
        />
      </div>
    );
  }

  // 3. DELETED / NOT FOUND PAD STATE (Authoritative Firestore response only) (Fix 5 & Fix 6)
  if (state?.status === 'not_found' || startupStatus === 'pad_not_found') {
    return (
      <div className="min-h-screen bg-[#0b0c0e] text-[#e8ebe6] flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-[#14171c] border border-[#2a313b] rounded-xl p-6 sm:p-8 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 bg-[#260e0c] text-[#e25a4a] rounded-xl flex items-center justify-center mx-auto border border-[#c23b32]/40">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg sm:text-xl font-bold uppercase text-[#e8ebe6] tracking-wider font-display">
              THIS JOB NO LONGER EXISTS
            </h2>
            <p className="text-sm text-[#9aa3ad]">
              The requested well pad was confirmed not found in Firestore. It may have been permanently deleted or moved.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReturnToJobList}
            className="bg-[#c23b32] hover:bg-[#e25a4a] text-[#e8ebe6] font-semibold px-5 py-2.5 rounded-lg text-sm transition shadow cursor-pointer inline-flex items-center gap-2"
          >
            RETURN TO JOB LIST
          </button>
        </div>
      </div>
    );
  }

  // 4. DATABASE INITIALIZING / AUTH LOADING STATE (Fix 1 & Fix 2)
  if (startupStatus === 'initializing_auth' || (startupStatus === 'loading_pad' && !state)) {
    return (
      <div className="min-h-screen bg-[#0b0c0e] text-[#e8ebe6] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-8 h-8 text-[#8fa37a] animate-spin" />
          <div className="text-xs font-mono text-[#9aa3ad] uppercase tracking-widest">
            CONNECTING TO DATABASE...
          </div>
          {currentPadId && (
            <div className="text-xs text-[#9aa3ad]/70 font-mono">
              Opening: {currentPadId}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 5. CONNECTION ERROR STATE (Saved pad preserved, never clears localStorage) (Fix 4, Fix 11, Fix 12)
  if (startupStatus === 'connection_error' && !state) {
    return (
      <div className="min-h-screen bg-[#0b0c0e] text-[#e8ebe6] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#14171c] border border-[#2a313b] rounded-xl p-6 sm:p-8 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 bg-[#291e0a] text-[#d4a017] rounded-xl flex items-center justify-center mx-auto border border-[#d4a017]/40">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg sm:text-xl font-bold uppercase text-[#e8ebe6] tracking-wider font-display">
              UNABLE TO CONNECT
            </h2>
            <p className="text-sm text-[#9aa3ad]">
              {currentPadId
                ? `Your saved job (${currentPadId}) is preserved. Waiting for database connection...`
                : 'Unable to reach the database. Please check your connection.'}
            </p>
            {startupError && (
              <p className="text-xs text-[#e25a4a] font-mono bg-[#0b0c0e] p-2.5 rounded-lg border border-[#2a313b] break-words">
                {startupError}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                resetAuthReadyPromise();
                setStartupStatus('initializing_auth');
                setRetryTrigger((c) => c + 1);
              }}
              className="w-full sm:w-auto bg-[#c23b32] hover:bg-[#e25a4a] text-[#e8ebe6] font-semibold px-5 py-2.5 rounded-lg text-xs sm:text-sm transition shadow inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> RETRY CONNECTION
            </button>
            <button
              type="button"
              onClick={handleReturnToJobList}
              className="w-full sm:w-auto bg-[#1b2027] hover:bg-[#2a313b] text-[#9aa3ad] hover:text-[#e8ebe6] font-medium px-4 py-2.5 rounded-lg text-xs transition cursor-pointer"
            >
              JOB LIST
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Derive effective pad list to include currentPadId if loaded state exists
  const effectivePadList = padList.some((p) => p.id === currentPadId)
    ? padList
    : currentPadId && state
    ? [...padList, { id: currentPadId, name: state.config?.padName || currentPadId }]
    : padList;

  // 6. NO ACTIVE PAD / JOB LIST VIEW (Fix 9: No arbitrary auto-selection)
  if (!currentPadId || !state) {
    return (
      <div className="min-h-screen bg-[#0b0c0e] text-[#e8ebe6] font-sans selection:bg-[#c23b32] selection:text-[#e8ebe6]">
        <header className="sticky top-0 z-40 bg-[#14171c]/95 backdrop-blur-md border-b border-[#2a313b] shadow-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="leading-tight">
                <div className="flex items-center gap-2">
                  <span className="text-xl sm:text-2xl font-bold tracking-wider text-[#e8ebe6] font-display">
                    PYTHON
                  </span>
                  <span className="text-xs font-semibold text-[#9aa3ad] font-sans">
                    Sand Tracker
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8">
          <Setup
            state={null}
            config={null}
            currentPadId=""
            padList={effectivePadList}
            onSelectPad={(padId) => {
              setCurrentPadId(padId);
              setActiveTab('dashboard');
            }}
            onRefreshPadList={() => {
              listPads().then((pads) => setPadList(pads)).catch(() => {});
            }}
            onUpdateConfig={handleUpdateConfig}
            onSuccessMessage={showToast}
          />
        </main>
      </div>
    );
  }

  // Primary navigation tabs
  const primaryTabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'board' as const, label: 'Silos', icon: Boxes },
    { id: 'delivery' as const, label: 'Tickets', icon: Truck },
    { id: 'pullsheet' as const, label: 'Pull sheet', icon: FileText },
    { id: 'run' as const, label: 'Record run', icon: Layers },
  ];

  // Secondary tabs under More menu
  const moreTabs = [
    { id: 'job_design' as const, label: 'Job design', icon: FileSpreadsheet },
    { id: 'progress' as const, label: 'Stage progress', icon: Activity },
    { id: 'stages' as const, label: 'Stages', icon: BookOpen },
    { id: 'reconciliation' as const, label: 'Reconciliation', icon: ClipboardCheck },
    { id: 'logs' as const, label: 'Logs', icon: History },
    { id: 'diagnostics' as const, label: 'Diagnostics', icon: Stethoscope },
    { id: 'setup' as const, label: 'Setup', icon: Settings },
  ];

  const activeMoreTab = moreTabs.find((t) => t.id === activeTab);
  const isMoreActive = Boolean(activeMoreTab);

  const padSummary = getPadSummary(state);

  // 7. MAIN APPLICATION UI
  return (
    <div className="min-h-screen bg-[#090c10] text-[#e7e1d6] font-sans selection:bg-[#d7c4a3]/30 selection:text-[#f3efe4]">
      <header className="border-b border-[#222832] bg-[#0d1016]/95 backdrop-blur-md px-4 sm:px-6 py-3 sticky top-0 z-40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Brand & Pad Live Status */}
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-[#e7e1d6]">
                  PAD CONSOLE
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </span>
              </div>
              <div className="text-[11px] font-mono text-[#8c96a3] mt-0.5 flex items-center gap-2">
                <span>{padSummary.nextWellName}</span>
                <span className="text-[#454f5c]">·</span>
                <span className="text-[#d7c4a3] font-semibold">STAGE #{padSummary.nextStageNumber}</span>
                <span className="text-[#454f5c]">·</span>
                <span>{Math.round(padSummary.totalPadOnHandLbs / 1000).toLocaleString()}k LBS ON PAD</span>
              </div>
            </div>
          </div>

          {/* Pad Selection Dropdown & Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#12161f] border border-[#262e3a] rounded-lg px-2.5 py-1">
              <span className="text-[10px] font-mono uppercase text-[#707c8b] tracking-wider">PAD:</span>
              <select
                value={currentPadId || ''}
                onChange={(e) => setCurrentPadId(e.target.value)}
                className="bg-transparent text-[#e7e1d6] text-xs font-mono font-semibold focus:outline-none cursor-pointer"
              >
                {effectivePadList.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#0e1218] text-[#e7e1d6]">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Executive Segmented Navigation Bar */}
        <nav className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 border-t border-[#1d232c] pt-2.5 text-xs font-mono">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'delivery') setDeliveryInitialSilo(undefined);
                  setActiveTab(tab.id);
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all duration-150 uppercase tracking-wider whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#d7c4a3] text-[#0c0f14] font-bold shadow-md shadow-[#d7c4a3]/20'
                    : 'text-[#8c96a3] hover:text-[#e7e1d6] hover:bg-[#161b24]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}

          <div className="h-4 w-[1px] bg-[#222832] mx-1 shrink-0" />

          {/* Secondary tabs */}
          {moreTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-150 uppercase tracking-wider whitespace-nowrap text-[11px] cursor-pointer ${
                  isActive
                    ? 'bg-[#1a212b] text-[#d7c4a3] font-bold border border-[#354152] shadow-sm'
                    : 'text-[#8c96a3] hover:text-[#e7e1d6] hover:bg-[#161b24]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </header>
      <div>
      {firebaseError && (
        <div className="bg-[#260e0c] text-[#e25a4a] font-medium px-4 py-2.5 text-center border-b border-[#c23b32] shadow-lg flex items-center justify-center gap-2.5 text-xs sm:text-sm z-50 relative">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#e25a4a]" />
          <span>{firebaseError}</span>
        </div>
      )}

      {/* Clean Field Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-[#1b2027] text-[#e8ebe6] px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium shadow-2xl border border-[#8fa37a]/60 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#8fa37a] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main View Container */}
      <main className="px-3 py-4">
        {activeTab === 'board' ? (
          <SiloBoard
            state={state}
            onChangeSiloSand={handleChangeSiloSand}
            onChangeSiloPriority={handleChangeSiloPriority}
            onClearAllSiloPriorities={handleClearAllSiloPriorities}
            onSetAllSiloPriorities={handleSetAllSiloPriorities}
            onToggleSiloMaintenance={handleToggleSiloMaintenance}
            onNavigateToDelivery={(siloNum) => {
              setDeliveryInitialSilo(siloNum);
              setActiveTab('delivery');
            }}
            onNavigateToRun={() => setActiveTab('run')}
            onNavigateToPullSheet={() => setActiveTab('pullsheet')}
            onSuccessMessage={showToast}
          />
        ) : activeTab === 'run' ? (
          <RecordRun
            state={state}
            initialSiloNumber={deliveryInitialSilo}
            onSelectSilo={(siloNum) => setDeliveryInitialSilo(siloNum)}
            onRecordRun={handleRecordRun}
            onCancel={() => setActiveTab('board')}
          />
        ) : activeTab === 'dashboard' ? (
          <Dashboard
            state={state}
            onNavigateTab={(tab, opts) => {
              if (opts?.siloNumber !== undefined) {
                setDeliveryInitialSilo(opts.siloNumber);
              }
              setActiveTab(tab);
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            }}
            onSelectPad={(padId) => setCurrentPadId(padId)}
          />
        ) : activeTab === 'delivery' ? (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_520px] 2xl:grid-cols-[minmax(0,1fr)_580px] gap-4 items-start">
            <div className="min-w-0">
              <HopperField
                sides={(() => {
                  const derived = getSiloDerivedStates(state);
                  const sideNames = Array.from(new Set(derived.map((s) => (s.side || 'A').trim())));
                  return sideNames.map((sideName) => ({
                    sideName,
                    silos: derived.filter((s) => (s.side || 'A').trim() === sideName),
                  }));
                })()}
                selectedSilo={deliveryInitialSilo ?? (state.config.silos[0]?.siloNumber || 1)}
                onSelect={(siloNum) => {
                  setDeliveryInitialSilo(siloNum);
                }}
              />
            </div>
            <div className="min-w-0">
              <AddDelivery
                state={state}
                initialSiloNumber={deliveryInitialSilo}
                onSelectSilo={(siloNum) => {
                  setDeliveryInitialSilo(siloNum);
                }}
                onAddDelivery={handleAddDelivery}
                onDeleteDelivery={handleDeleteDelivery}
                onSaveProductCodeMapping={handleSaveProductCodeMapping}
                onChangeSiloSand={handleChangeSiloSand}
                onNavigateToSetup={() => setActiveTab('setup')}
                onNavigateToLogs={() => {
                  setActiveTab('logs');
                  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                }}
                onDone={() => setActiveTab('board')}
                onCancel={() => setActiveTab('board')}
              />
            </div>
          </div>
        ) : activeTab === 'pullsheet' ? (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_520px] gap-4 items-start">
            <HopperField
              sides={(() => {
                const derived = getSiloDerivedStates(state);
                const sideNames = Array.from(new Set(derived.map((s) => (s.side || 'A').trim())));
                return sideNames.map((sideName) => ({
                  sideName,
                  silos: derived.filter((s) => (s.side || 'A').trim() === sideName),
                }));
              })()}
              selectedSilo={deliveryInitialSilo ?? (state.config.silos[0]?.siloNumber || 1)}
              onSelect={(siloNum) => setDeliveryInitialSilo(siloNum)}
            />
            <StagePullSheet
              state={state}
              targetWellId={pullSheetTarget?.wellId}
              targetStageNumber={pullSheetTarget?.stageNumber}
              onSuccessMessage={showToast}
              resetSignal={pullSheetResetSignal}
              lastRanWellId={lastRanWellId}
              onRecordRun={handleRecordRun}
              onClearAllSiloPriorities={handleClearAllSiloPriorities}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] gap-4 items-start">
            <PadSchematic
              state={state}
              selectedSilo={deliveryInitialSilo}
              onSelectSilo={(siloNumber) => {
                setDeliveryInitialSilo(siloNumber);
                setActiveTab('board');
              }}
            />
            <div className="min-w-0">
        {activeTab === 'job_design' && <JobDesign state={state} />}

        {activeTab === 'progress' && <StageProgress state={state} />}

        {activeTab === 'stages' && (
          <StageReview
            state={state}
            onOpenLogs={(wellId, stageNumber) => {
              setLogsFilter({
                tab: 'runs',
                wellFilter: wellId,
                searchTerm: `Stage ${stageNumber}`,
              });
              setActiveTab('logs');
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            }}
            onNavigateToPullSheet={(wellId, stageNumber) => {
              setPullSheetTarget({ wellId, stageNumber });
              setActiveTab('pullsheet');
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            }}
            onDeleteStage={handleDeleteStage}
          />
        )}

        {activeTab === 'reconciliation' && (
          <Reconciliation
            state={state}
            onNavigateTab={(tab, opts) => {
              if (opts?.tab) {
                setLogsFilter({ tab: opts.tab });
              }
              setActiveTab(tab);
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            }}
            onSuccessMessage={showToast}
          />
        )}

        {activeTab === 'logs' && (
          <Logs
            state={state}
            onDeleteDelivery={handleDeleteDelivery}
            onRestoreDelivery={handleRestoreDelivery}
            onUpdateDelivery={handleUpdateDelivery}
            onDeleteRun={handleDeleteRun}
            onRestoreRun={handleRestoreRun}
            onUpdateRun={handleUpdateRun}
            onSuccessMessage={showToast}
            initialTab={logsFilter?.tab}
            initialWellFilter={logsFilter?.wellFilter}
            initialSearchTerm={logsFilter?.searchTerm}
          />
        )}

        {activeTab === 'diagnostics' && (
          <Diagnostics
            state={state}
            onSelectPad={(padId) => setCurrentPadId(padId)}
          />
        )}

        {activeTab === 'setup' && (
          <Setup
            state={state}
            config={state.config}
            currentPadId={currentPadId}
            padList={padList}
            onSelectPad={(padId) => setCurrentPadId(padId)}
            onRefreshPadList={() => {
              listPads().then((pads) => {
                setPadList(pads);
              });
            }}
            onUpdateConfig={handleUpdateConfig}
            onSuccessMessage={showToast}
          />
        )}
            </div>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
