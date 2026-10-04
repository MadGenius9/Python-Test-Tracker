import { History, Search, Trash2, Truck, Layers, FileText, User, Camera, Calendar, FileSpreadsheet, Pencil, RotateCcw, AlertTriangle, Filter, ArrowUpDown, ArrowUp10, ArrowDown10, Clock } from 'lucide-react';
import { useState, useMemo } from 'react';
import { AppState, DeliveryTicket, RunRecord } from '../types';
import DeliveriesByDay from './DeliveriesByDay';
import JobExport from './JobExport';
import EditDeliveryModal from './EditDeliveryModal';
import EditRunModal from './EditRunModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import { formatLbs, formatTons } from '../lib/sandRules';

interface LogsProps {
  state: AppState;
  onDeleteDelivery: (id: string, reason?: string) => Promise<void> | void;
  onRestoreDelivery?: (id: string) => Promise<void> | void;
  onUpdateDelivery?: (id: string, updates: Partial<DeliveryTicket>) => Promise<void>;
  onDeleteRun: (id: string, reason?: string) => Promise<void> | void;
  onRestoreRun?: (id: string) => Promise<void> | void;
  onUpdateRun?: (id: string, updates: Partial<RunRecord>) => Promise<void>;
  onSuccessMessage?: (msg: string) => void;
  initialTab?: 'deliveries' | 'by_day' | 'runs' | 'deleted' | 'export';
  initialWellFilter?: string;
  initialSearchTerm?: string;
}

export default function Logs({
  state,
  onDeleteDelivery,
  onRestoreDelivery,
  onUpdateDelivery,
  onDeleteRun,
  onRestoreRun,
  onUpdateRun,
  onSuccessMessage,
  initialTab,
  initialWellFilter,
  initialSearchTerm,
}: LogsProps) {
  const [activeTab, setActiveTab] = useState<'deliveries' | 'by_day' | 'runs' | 'deleted' | 'export'>(
    initialTab || 'deliveries'
  );
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [editingTicket, setEditingTicket] = useState<DeliveryTicket | null>(null);
  const [editingRun, setEditingRun] = useState<RunRecord | null>(null);
  const [deletingTarget, setDeletingTarget] = useState<{ type: 'ticket'; item: DeliveryTicket } | { type: 'run'; item: RunRecord } | null>(null);

  // Well and Stage Runs filtering & sorting
  const [selectedWellFilter, setSelectedWellFilter] = useState<string>(initialWellFilter || 'all');
  const [stageSortOrder, setStageSortOrder] = useState<'stage_asc' | 'stage_desc' | 'date_desc' | 'date_asc'>('stage_asc');


  const { config, deliveries, runs } = state;
  const deletedDeliveries = state.deletedDeliveries || [];
  const deletedRuns = state.deletedRuns || [];
  const deletedTotalCount = deletedDeliveries.length + deletedRuns.length;

  const allDeletedItems = [
    ...deletedDeliveries.map((d) => ({ kind: 'ticket' as const, item: d, deletedAt: d.deletedAt || 0 })),
    ...deletedRuns.map((r) => ({ kind: 'run' as const, item: r, deletedAt: r.deletedAt || 0 })),
  ].sort((a, b) => b.deletedAt - a.deletedAt);

  const filteredDeletedItems = allDeletedItems.filter(({ kind, item }) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    if (kind === 'ticket') {
      const t = item as DeliveryTicket;
      return (
        (t.ticketNumber && t.ticketNumber.toLowerCase().includes(term)) ||
        (t.supplier && t.supplier.toLowerCase().includes(term)) ||
        (t.sandType && t.sandType.toLowerCase().includes(term)) ||
        (t.deletedReason && t.deletedReason.toLowerCase().includes(term)) ||
        (t.deletedByEmail && t.deletedByEmail.toLowerCase().includes(term)) ||
        (t.deletedBy && t.deletedBy.toLowerCase().includes(term)) ||
        `silo ${t.siloNumber}`.includes(term)
      );
    } else {
      const r = item as RunRecord;
      const well = config.wells.find((w) => w.id === r.wellId);
      return (
        `stage ${r.stageNumber}`.includes(term) ||
        (well && well.name.toLowerCase().includes(term)) ||
        (r.sandType && r.sandType.toLowerCase().includes(term)) ||
        (r.deletedReason && r.deletedReason.toLowerCase().includes(term)) ||
        (r.deletedByEmail && r.deletedByEmail.toLowerCase().includes(term)) ||
        (r.deletedBy && r.deletedBy.toLowerCase().includes(term)) ||
        `silo ${r.siloNumber}`.includes(term)
      );
    }
  });

  const siloCount = config.siloCount || config.silos?.length || 6;
  const siloList = Array.from({ length: siloCount }, (_, idx) => {
    const siloNum = idx + 1;
    const existingConfig = config.silos?.find((s) => s.siloNumber === siloNum);
    return (
      existingConfig || {
        siloNumber: siloNum,
        name: `Silo ${siloNum}`,
        side: 'A',
        sandType: null,
        manualPriority: null,
        maxCapacityLbs: 350000,
        startingBalanceLbs: 0,
        isOutOfService: false,
      }
    );
  });

  const getSiloHeaderStyle = (sandType: string | null | undefined) => {
    if (!sandType) {
      return {
        border: 'border-[#2a313b]',
        bg: 'bg-[#14171c]',
        badge: 'bg-[#1b2027] text-[#9aa3ad] border border-[#2a313b]',
        titleText: 'text-[#e8ebe6]',
        mutedText: 'text-[#9aa3ad]',
      };
    }
    const lower = sandType.toLowerCase();
    const spec = config.sandTypes?.find((s) => s.name.toLowerCase() === lower);
    const cat = spec?.colorCategory;

    if (cat === 'amber' || lower.includes('100')) {
      return {
        border: 'border-[#d4a017]/60',
        bg: 'bg-gradient-to-b from-[#d4a017]/80 to-[#14171c]',
        badge: 'bg-[#d4a017] text-[#0b0c0e] font-black',
        titleText: 'text-[#d4a017]',
        mutedText: 'text-[#d4a017]/80',
      };
    }
    if (cat === 'blue' || lower.includes('40/70') || lower.includes('40')) {
      return {
        border: 'border-[#5b7c99]/60',
        bg: 'bg-gradient-to-b from-[#5b7c99]/80 to-[#14171c]',
        badge: 'bg-[#5b7c99] text-[#e8ebe6] font-black',
        titleText: 'text-[#5b7c99]',
        mutedText: 'text-[#5b7c99]/80',
      };
    }
    if (cat === 'orange') {
      return {
        border: 'border-[#d4a017]/60',
        bg: 'bg-gradient-to-b from-[#d4a017]/80 to-[#14171c]',
        badge: 'bg-[#d4a017] text-[#0b0c0e] font-black',
        titleText: 'text-[#d4a017]',
        mutedText: 'text-[#d4a017]/80',
      };
    }
    return {
      border: 'border-[#8fa37a]/60',
      bg: 'bg-gradient-to-b from-[#8fa37a]/80 to-[#14171c]',
      badge: 'bg-[#8fa37a] text-[#e8ebe6] font-black',
      titleText: 'text-[#8fa37a]',
      mutedText: 'text-[#8fa37a]/80',
    };
  };

  const filteredDeliveries = deliveries.filter((d) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      d.ticketNumber.toLowerCase().includes(term) ||
      d.supplier.toLowerCase().includes(term) ||
      d.sandType.toLowerCase().includes(term) ||
      (d.driverName && d.driverName.toLowerCase().includes(term)) ||
      (d.notes && d.notes.toLowerCase().includes(term)) ||
      `silo ${d.siloNumber}`.includes(term)
    );
  });

  const unassignedDeliveries = filteredDeliveries
    .filter((d) => !siloList.some((s) => s.siloNumber === d.siloNumber))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const allUnassignedDeliveriesCount = deliveries.filter(
    (d) => !siloList.some((s) => s.siloNumber === d.siloNumber)
  ).length;

  const totalUnassignedLbs = unassignedDeliveries.reduce((sum, d) => sum + d.lbs, 0);

  // Per-well run statistics
  const wellRunStats = useMemo(() => {
    const stats: Record<string, { runCount: number; stages: Set<number>; totalLbs: number; sandBreakdown: Record<string, number> }> = {};
    
    // Initialize for all configured wells
    config.wells.forEach((w) => {
      stats[w.id] = { runCount: 0, stages: new Set(), totalLbs: 0, sandBreakdown: {} };
    });

    runs.forEach((r) => {
      const wellKey = r.wellId || 'unassigned';
      if (!stats[wellKey]) {
        stats[wellKey] = { runCount: 0, stages: new Set(), totalLbs: 0, sandBreakdown: {} };
      }
      stats[wellKey].runCount += 1;
      stats[wellKey].stages.add(r.stageNumber);
      stats[wellKey].totalLbs += r.lbsPulled || 0;
      const st = r.sandType || 'Unknown';
      stats[wellKey].sandBreakdown[st] = (stats[wellKey].sandBreakdown[st] || 0) + (r.lbsPulled || 0);
    });

    return stats;
  }, [config.wells, runs]);

  // Filtered & Sorted stage runs
  const filteredRuns = useMemo(() => {
    return runs
      .filter((r) => {
        // Well filter
        if (selectedWellFilter !== 'all') {
          if (selectedWellFilter === 'unassigned') {
            const isConfiguredWell = config.wells.some((w) => w.id === r.wellId);
            if (isConfiguredWell) return false;
          } else if (r.wellId !== selectedWellFilter) {
            return false;
          }
        }

        // Search term filter
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase().trim();
        const wellObj = config.wells.find((w) => w.id === r.wellId);
        const wellName = wellObj ? wellObj.name.toLowerCase() : '';
        return (
          wellName.includes(term) ||
          `stage ${r.stageNumber}`.includes(term) ||
          `#${r.stageNumber}`.includes(term) ||
          `${r.stageNumber}` === term ||
          `silo ${r.siloNumber}`.includes(term) ||
          (r.sandType && r.sandType.toLowerCase().includes(term)) ||
          (r.date && r.date.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => {
        if (stageSortOrder === 'stage_asc') {
          // If viewing all wells, order by well index in config first, then numerical stage number
          if (selectedWellFilter === 'all') {
            const wellIdxA = config.wells.findIndex((w) => w.id === a.wellId);
            const wellIdxB = config.wells.findIndex((w) => w.id === b.wellId);
            const safeIdxA = wellIdxA === -1 ? 999 : wellIdxA;
            const safeIdxB = wellIdxB === -1 ? 999 : wellIdxB;
            if (safeIdxA !== safeIdxB) return safeIdxA - safeIdxB;
          }
          // Primary: Numerical order by stage number
          const stageDiff = (a.stageNumber || 0) - (b.stageNumber || 0);
          if (stageDiff !== 0) return stageDiff;
          // Secondary: Silo number ascending
          const siloDiff = (a.siloNumber || 0) - (b.siloNumber || 0);
          if (siloDiff !== 0) return siloDiff;
          // Tertiary: Created timestamp
          return (a.createdAt || 0) - (b.createdAt || 0);
        }

        if (stageSortOrder === 'stage_desc') {
          if (selectedWellFilter === 'all') {
            const wellIdxA = config.wells.findIndex((w) => w.id === a.wellId);
            const wellIdxB = config.wells.findIndex((w) => w.id === b.wellId);
            const safeIdxA = wellIdxA === -1 ? 999 : wellIdxA;
            const safeIdxB = wellIdxB === -1 ? 999 : wellIdxB;
            if (safeIdxA !== safeIdxB) return safeIdxA - safeIdxB;
          }
          const stageDiff = (b.stageNumber || 0) - (a.stageNumber || 0);
          if (stageDiff !== 0) return stageDiff;
          return (a.siloNumber || 0) - (b.siloNumber || 0);
        }

        if (stageSortOrder === 'date_desc') {
          return (b.createdAt || 0) - (a.createdAt || 0);
        }

        if (stageSortOrder === 'date_asc') {
          return (a.createdAt || 0) - (b.createdAt || 0);
        }

        return 0;
      });
  }, [runs, selectedWellFilter, searchTerm, config.wells, stageSortOrder]);

  const allUnassignedRunsCount = runs.filter(
    (r) => !siloList.some((s) => s.siloNumber === r.siloNumber)
  ).length;

  // Unassigned well runs (runs with wellId not in config.wells)
  const unassignedWellRunsCount = runs.filter(
    (r) => !config.wells.some((w) => w.id === r.wellId)
  ).length;

  const scrollToSiloColumn = (siloKey: string | number) => {
    const colEl = document.getElementById(`silo-col-${siloKey}`);
    if (colEl) {
      colEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Top Banner */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 text-[#e8ebe6] shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#d4a017] text-[#0b0c0e] p-3 rounded-lg font-black">
            <History className="w-8 h-8 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold uppercase tracking-wide font-display">FIELD ACTIVITY LOGS</h2>
            <p className="text-xs text-[#9aa3ad] font-medium">
              Review history of sand tickets, daily totals, and stage run records.
            </p>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="bg-[#0b0c0e] p-1.5 rounded-lg border border-[#2a313b] flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('deliveries')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase transition shrink-0 flex items-center gap-2 ${
              activeTab === 'deliveries'
                ? 'bg-[#d4a017] text-[#0b0c0e] shadow-lg'
                : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
            }`}
          >
            <Truck className="w-4 h-4" /> TICKETS ({deliveries.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('by_day')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase transition shrink-0 flex items-center gap-2 ${
              activeTab === 'by_day'
                ? 'bg-[#d4a017] text-[#0b0c0e] shadow-lg'
                : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
            }`}
          >
            <Calendar className="w-4 h-4" /> BY DAY
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('runs')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase transition shrink-0 flex items-center gap-2 ${
              activeTab === 'runs'
                ? 'bg-[#d4a017] text-[#0b0c0e] shadow-lg'
                : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
            }`}
          >
            <Layers className="w-4 h-4" /> STAGE RUNS ({runs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('deleted')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase transition shrink-0 flex items-center gap-2 ${
              activeTab === 'deleted'
                ? 'bg-[#c23b32] text-[#e8ebe6] shadow-lg'
                : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
            }`}
          >
            <Trash2 className="w-4 h-4" /> DELETED ({deletedTotalCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase transition shrink-0 flex items-center gap-2 ${
              activeTab === 'export'
                ? 'bg-[#d4a017] text-[#0b0c0e] shadow-lg'
                : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" /> EXPORT SPREADSHEET
          </button>
        </div>
      </div>

      {/* Deliveries By Day Tab */}
      {activeTab === 'by_day' && <DeliveriesByDay state={state} />}

      {/* Job Export Tab */}
      {activeTab === 'export' && <JobExport state={state} onSuccessMessage={onSuccessMessage} />}

      {/* Search Input for Tickets and Stage Runs */}
      {activeTab !== 'by_day' && activeTab !== 'export' && (
        <div className="relative">
          <Search className="w-5 h-5 text-[#9aa3ad] absolute left-4 top-3.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter logs by ticket #, well, driver, silo, supplier, or sand type..."
            className="w-full bg-[#14171c] border border-[#2a313b] rounded-lg pl-12 pr-4 py-3 text-sm font-bold text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
          />
        </div>
      )}

      {/* Deliveries Tab Content (Per Silo Columns) */}
      {activeTab === 'deliveries' && (
        <div className="space-y-4">
          {/* Warning Banner for Unassigned / Missing Silo Tickets */}
          {allUnassignedDeliveriesCount > 0 && (
            <div className="bg-[#260e0c]/90 border border-[#c23b32] text-[#e8ebe6] p-4 rounded-lg shadow-xl flex items-center gap-3.5 text-xs sm:text-sm font-bold">
              <AlertTriangle className="w-6 h-6 text-[#e25a4a] shrink-0 animate-pulse" />
              <div>
                <span className="font-black text-[#e25a4a] uppercase tracking-wide">
                  {allUnassignedDeliveriesCount} {allUnassignedDeliveriesCount === 1 ? 'ticket is' : 'tickets are'} logged to silos that aren't in this pad's config.
                </span>
                <span className="text-[#e25a4a] ml-1 font-medium">
                  Fix their silo using the EDIT button in the UNASSIGNED column, or add the missing silo in Setup.
                </span>
              </div>
            </div>
          )}

          {/* Row of Silo Jump Buttons for mobile / narrow screens */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 min-[900px]:hidden">
            <span className="text-xs font-bold text-[#9aa3ad] uppercase shrink-0">JUMP TO:</span>
            {siloList.map((s) => {
              const count = filteredDeliveries.filter((d) => d.siloNumber === s.siloNumber).length;
              return (
                <button
                  key={s.siloNumber}
                  type="button"
                  onClick={() => scrollToSiloColumn(s.siloNumber)}
                  className="bg-[#1b2027] hover:bg-[#2a313b] active:scale-95 text-[#d4a017] border border-[#2a313b] px-3 py-1.5 rounded-xl font-black text-xs uppercase shrink-0 transition flex items-center gap-1.5 shadow-sm"
                >
                  <span>SILO #{s.siloNumber}</span>
                  <span className="bg-[#14171c] text-[#e8ebe6] px-1.5 py-0.5 rounded-md text-[10px] font-bold">
                    {count}
                  </span>
                </button>
              );
            })}
            {unassignedDeliveries.length > 0 && (
              <button
                type="button"
                onClick={() => scrollToSiloColumn('unassigned')}
                className="bg-[#260e0c]/80 hover:bg-[#260e0c] active:scale-95 text-[#e25a4a] border border-[#c23b32] px-3 py-1.5 rounded-xl font-black text-xs uppercase shrink-0 transition flex items-center gap-1.5 shadow-sm"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-[#e25a4a]" />
                <span>UNASSIGNED</span>
                <span className="bg-[#260e0c] text-[#e25a4a] px-1.5 py-0.5 rounded-md text-[10px] font-bold">
                  {unassignedDeliveries.length}
                </span>
              </button>
            )}
          </div>

          {/* Per-Silo Column Grid / Scroll-Snap Strip */}
          <div
            className="flex min-[900px]:grid gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 no-scrollbar"
            style={{
              gridTemplateColumns: `repeat(${siloList.length + (unassignedDeliveries.length > 0 ? 1 : 0)}, minmax(0, 1fr))`,
            }}
          >
            {siloList.map((silo) => {
              const siloTickets = filteredDeliveries
                .filter((d) => d.siloNumber === silo.siloNumber)
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

              const totalLbs = siloTickets.reduce((sum, d) => sum + d.lbs, 0);
              const headerStyle = getSiloHeaderStyle(silo.sandType);

              return (
                <div
                  key={silo.siloNumber}
                  id={`silo-col-${silo.siloNumber}`}
                  className="w-[85vw] max-w-[340px] min-[900px]:w-auto shrink-0 snap-center space-y-3"
                >
                  {/* Column Header */}
                  <div
                    className={`p-3.5 rounded-lg border-2 shadow-lg space-y-1.5 ${headerStyle.bg} ${headerStyle.border}`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span
                        className={`font-black uppercase text-sm sm:text-base tracking-tight ${headerStyle.titleText}`}
                      >
                        SILO #{silo.siloNumber}
                      </span>
                      <span
                        className={`text-[10px] sm:text-xs font-black uppercase px-2 py-0.5 rounded-lg tracking-wider ${headerStyle.badge}`}
                      >
                        {silo.sandType || 'not set'}
                      </span>
                    </div>
                    <div className={`text-xs font-bold font-mono tracking-tight ${headerStyle.mutedText}`}>
                      {siloTickets.length} {siloTickets.length === 1 ? 'load' : 'loads'}, {totalLbs.toLocaleString()} lbs
                    </div>
                  </div>

                  {/* Tickets List or Empty Box */}
                  {siloTickets.length === 0 ? (
                    <div className="border-2 border-dashed border-[#2a313b] rounded-lg p-6 text-center">
                      <span className="text-xs font-black uppercase text-[#9aa3ad] tracking-wider">
                        no tickets
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {siloTickets.map((del) => (
                        <div
                          key={del.id}
                          className="bg-[#0b0c0e] p-3 rounded-lg border border-[#2a313b] space-y-2 relative shadow-md hover:border-[#2a313b] transition"
                        >
                          {/* Ticket # + Actions */}
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-mono font-black text-[#d4a017] text-base sm:text-lg tracking-tight uppercase">
                              #{del.ticketNumber}
                            </span>
                            <div className="flex items-center gap-1">
                              {del.photoUrl && (
                                <button
                                  type="button"
                                  onClick={() => setViewingPhotoUrl(del.photoUrl || null)}
                                  className="bg-[#1b2027] hover:bg-[#2a313b] text-[#d4a017] text-xs px-2 py-1 rounded-lg flex items-center gap-1 font-bold transition active:scale-95"
                                  title="View ticket photo scan"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setEditingTicket(del)}
                                className="bg-[#1b2027] hover:bg-[#2a313b] active:bg-[#d4a017] text-[#d4a017] active:text-[#0b0c0e] text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition active:scale-95 border border-[#2a313b]"
                                title="Edit ticket details"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>EDIT</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingTarget({ type: 'ticket', item: del })}
                                className="text-[#e25a4a] hover:text-[#e25a4a] p-1.5 rounded-lg hover:bg-[#260e0c]/50 transition active:scale-95"
                                title="Delete ticket"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Weight LBS */}
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="text-lg sm:text-xl font-black font-mono text-[#e8ebe6] tracking-tight">
                              {del.lbs.toLocaleString()}{' '}
                              <span className="text-xs font-bold text-[#9aa3ad] font-sans uppercase">LBS</span>
                            </div>
                            <div className="text-xs font-bold text-[#9aa3ad] font-mono">
                              {(del.lbs / (config.lbsPerTon || 2000)).toFixed(1)} t
                            </div>
                          </div>

                          {/* Date and Supplier on Muted Line */}
                          <div className="text-xs text-[#9aa3ad] font-medium truncate flex flex-wrap items-center gap-1.5 border-t border-[#2a313b]/80 pt-2">
                            <span>{del.date}</span>
                            {del.timeOfDay && (
                              <>
                                <span className="text-[#9aa3ad]">•</span>
                                <span className="font-mono text-[#e8ebe6]">{del.timeOfDay}</span>
                              </>
                            )}
                            <span className="text-[#9aa3ad]">•</span>
                            <span className="text-[#e8ebe6] font-bold truncate">{del.supplier}</span>
                          </div>

                          {/* Entry Timestamp & Edited Tag on Ticket */}
                          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
                            {del.createdAt && (
                              <div className="text-[10px] text-[#9aa3ad] font-mono bg-[#14171c]/90 px-2 py-1 rounded-lg border border-[#2a313b] flex items-center gap-1.5">
                                <span className="text-[#9aa3ad] font-bold uppercase tracking-wider">Entered:</span>
                                <span className="text-[#d4a017] font-black">
                                  {new Date(del.createdAt).toLocaleString('en-US', {
                                    month: 'numeric',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    hour12: true,
                                  })}
                                </span>
                              </div>
                            )}

                            {del.editedAt && (
                              <div className="text-[10px] text-[#d4a017] font-mono bg-[#291e04]/80 border border-[#d4a017]/50 px-2 py-1 rounded-lg flex items-center gap-1">
                                <Pencil className="w-2.5 h-2.5 text-[#d4a017] shrink-0" />
                                <span className="font-bold uppercase">Edited</span>
                                <span>•</span>
                                <span>
                                  {new Date(del.editedAt).toLocaleString('en-US', {
                                    month: 'numeric',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true,
                                  })}
                                </span>
                                {del.editedBy && (
                                  <>
                                    <span>•</span>
                                    <span className="text-[#e8ebe6] font-sans">{del.editedBy}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Driver / Notes */}
                          {(del.driverName || del.notes) && (
                            <div className="text-[11px] text-[#9aa3ad] space-y-0.5 pt-0.5">
                              {del.driverName && (
                                <div className="flex items-center gap-1 truncate text-[#e8ebe6]">
                                  <User className="w-3 h-3 text-[#d4a017] shrink-0" />
                                  <span className="truncate">{del.driverName}</span>
                                </div>
                              )}
                              {del.notes && (
                                <div className="flex items-center gap-1 truncate text-[#9aa3ad] font-mono italic">
                                  <FileText className="w-3 h-3 text-[#9aa3ad] shrink-0" />
                                  <span className="truncate">{del.notes}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* UNASSIGNED Column — rendered when deliveries are logged to silos not in current config */}
            {unassignedDeliveries.length > 0 && (
              <div
                id="silo-col-unassigned"
                className="w-[85vw] max-w-[340px] min-[900px]:w-auto shrink-0 snap-center space-y-3"
              >
                {/* Unassigned Column Header in Red */}
                <div className="p-3.5 rounded-lg border border-[#c23b32] shadow-lg space-y-1.5 bg-gradient-to-b from-[#c23b32] to-[#14171c]">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-black uppercase text-sm sm:text-base tracking-tight text-[#e25a4a] flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-[#e25a4a] shrink-0" />
                      UNASSIGNED
                    </span>
                    <span className="text-[10px] sm:text-xs font-black uppercase px-2 py-0.5 rounded-lg tracking-wider bg-[#c23b32] text-[#e8ebe6]">
                      silo not in config
                    </span>
                  </div>
                  <div className="text-xs font-bold font-mono tracking-tight text-[#e25a4a]">
                    {unassignedDeliveries.length} {unassignedDeliveries.length === 1 ? 'load' : 'loads'}, {totalUnassignedLbs.toLocaleString()} lbs
                  </div>
                </div>

                {/* Unassigned Tickets List */}
                <div className="space-y-2.5">
                  {unassignedDeliveries.map((del) => (
                    <div
                      key={del.id}
                      className="bg-[#0b0c0e] border border-[#c23b32]/70 p-3.5 rounded-lg space-y-2.5 transition shadow-md relative"
                    >
                      {/* Top Row: Ticket Number + Action Buttons */}
                      <div className="flex items-center justify-between gap-2 border-b border-[#14171c] pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-[#d4a017] text-sm tracking-tight">
                            #{del.ticketNumber}
                          </span>
                          <span className="text-[10px] bg-[#c23b32] text-[#e8ebe6] font-black px-2 py-0.5 rounded uppercase">
                            SILO #{del.siloNumber}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {del.photoUrl && (
                            <button
                              type="button"
                              onClick={() => setViewingPhotoUrl(del.photoUrl!)}
                              className="text-[#d4a017] hover:text-[#d4a017] p-1 rounded-lg hover:bg-[#1b2027] transition active:scale-95"
                              title="View scanned ticket photo"
                            >
                              <Camera className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditingTicket(del)}
                            className="bg-[#c23b32] hover:bg-[#c23b32] active:bg-[#d4a017] text-[#e8ebe6] active:text-[#0b0c0e] text-xs px-2 py-1 rounded-lg flex items-center gap-1 font-black transition active:scale-95 border border-[#c23b32]"
                            title="Edit and assign to a valid silo"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>EDIT</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingTarget({ type: 'ticket', item: del })}
                            className="text-[#e25a4a] hover:text-[#e25a4a] p-1 rounded-lg hover:bg-[#260e0c]/50 transition active:scale-95"
                            title="Delete delivery"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Weight & Sand Type */}
                      <div>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-lg font-black font-mono text-[#e8ebe6] tracking-tight">
                            {del.lbs.toLocaleString()}{' '}
                            <span className="text-xs text-[#9aa3ad] font-sans font-bold">LBS</span>
                          </span>
                          <span className="text-xs font-bold text-[#9aa3ad] font-mono">
                            {(del.lbs / (config.lbsPerTon || 2000)).toFixed(2)} T
                          </span>
                        </div>
                        <div className="text-xs text-[#d4a017] font-bold truncate mt-0.5">
                          {del.sandType} • {del.supplier}
                        </div>
                      </div>

                      {/* Delivery Date */}
                      <div className="text-[11px] text-[#9aa3ad] space-y-0.5 border-t border-[#14171c] pt-2 font-medium">
                        <div className="flex items-center justify-between text-[#e8ebe6]">
                          <span>Delivered:</span>
                          <span className="font-bold text-[#e8ebe6]">
                            {del.date} {del.timeOfDay ? `@ ${del.timeOfDay}` : ''}
                          </span>
                        </div>
                      </div>

                      {/* Driver / Notes */}
                      {(del.driverName || del.notes) && (
                        <div className="text-[11px] text-[#9aa3ad] space-y-0.5 pt-0.5">
                          {del.driverName && (
                            <div className="flex items-center gap-1 truncate text-[#e8ebe6]">
                              <User className="w-3 h-3 text-[#d4a017] shrink-0" />
                              <span className="truncate">{del.driverName}</span>
                            </div>
                          )}
                          {del.notes && (
                            <div className="flex items-center gap-1 truncate text-[#9aa3ad] font-mono italic">
                              <FileText className="w-3 h-3 text-[#9aa3ad] shrink-0" />
                              <span className="truncate">{del.notes}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stage Runs Tab Content */}
      {activeTab === 'runs' && (
        <div className="space-y-4">
          {/* Warning Banner for Unassigned / Missing Silo Runs */}
          {allUnassignedRunsCount > 0 && (
            <div className="bg-[#260e0c]/90 border border-[#c23b32] text-[#e8ebe6] p-4 rounded-lg shadow-xl flex items-center gap-3.5 text-xs sm:text-sm font-bold">
              <AlertTriangle className="w-6 h-6 text-[#e25a4a] shrink-0 animate-pulse" />
              <div>
                <span className="font-black text-[#e25a4a] uppercase tracking-wide">
                  {allUnassignedRunsCount} stage {allUnassignedRunsCount === 1 ? 'run is' : 'runs are'} logged to silos that aren't in this pad's config.
                </span>
                <span className="text-[#e25a4a] ml-1 font-medium">
                  Fix their silo using the EDIT button, or add the missing silo in Setup.
                </span>
              </div>
            </div>
          )}

          {/* Controls Bar: Well Filter & Numerical Sort Order */}
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 text-[#e8ebe6] shadow-2xl space-y-4">
            {/* Top row: Section title & Sort Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#2a313b] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#d4a017]" />
                  <h3 className="text-lg sm:text-xl font-bold uppercase tracking-wide font-display text-[#e8ebe6]">
                    STAGE RUN LOGS
                  </h3>
                </div>
                <p className="text-xs text-[#9aa3ad] font-medium mt-0.5">
                  Filter stage runs by well, inspect sand pulled per stage, and review logs in numerical sequence.
                </p>
              </div>

              {/* Sort Order Toggle */}
              <div className="flex items-center gap-2 flex-wrap bg-[#0b0c0e] p-1.5 rounded-lg border border-[#2a313b]">
                <span className="text-[10px] font-black uppercase text-[#9aa3ad] px-2 flex items-center gap-1">
                  <ArrowUpDown className="w-3 h-3 text-[#d4a017]" /> Order:
                </span>
                <button
                  type="button"
                  onClick={() => setStageSortOrder('stage_asc')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition flex items-center gap-1.5 ${
                    stageSortOrder === 'stage_asc'
                      ? 'bg-[#d4a017] text-[#0b0c0e] shadow-md font-black'
                      : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
                  }`}
                  title="Sort numerically by stage number (Stage 1, 2, 3...)"
                >
                  <ArrowUp10 className="w-3.5 h-3.5" />
                  <span>Stage # (1 → N)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStageSortOrder('stage_desc')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition flex items-center gap-1.5 ${
                    stageSortOrder === 'stage_desc'
                      ? 'bg-[#d4a017] text-[#0b0c0e] shadow-md font-black'
                      : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
                  }`}
                  title="Sort descending by stage number (Stage N → 1)"
                >
                  <ArrowDown10 className="w-3.5 h-3.5" />
                  <span>Stage # (N → 1)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStageSortOrder('date_desc')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition flex items-center gap-1.5 ${
                    stageSortOrder === 'date_desc'
                      ? 'bg-[#d4a017] text-[#0b0c0e] shadow-md font-black'
                      : 'text-[#9aa3ad] hover:text-[#e8ebe6]'
                  }`}
                  title="Sort by entry timestamp (Newest first)"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Newest</span>
                </button>
              </div>
            </div>

            {/* Well Filter Tabs */}
            <div className="space-y-2">
              <div className="text-[11px] font-black uppercase tracking-wider text-[#9aa3ad] flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#d4a017]" />
                <span>FILTER BY WELL:</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {/* ALL WELLS Button */}
                <button
                  type="button"
                  onClick={() => setSelectedWellFilter('all')}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition shrink-0 flex items-center gap-2 border ${
                    selectedWellFilter === 'all'
                      ? 'bg-[#d4a017] text-[#0b0c0e] border-[#d4a017] shadow-lg scale-[1.02]'
                      : 'bg-[#0b0c0e] text-[#e8ebe6] border-[#2a313b] hover:border-[#2a313b] hover:text-[#e8ebe6]'
                  }`}
                >
                  <span>ALL WELLS</span>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-black ${
                      selectedWellFilter === 'all'
                        ? 'bg-[#0b0c0e] text-[#d4a017]'
                        : 'bg-[#1b2027] text-[#e8ebe6]'
                    }`}
                  >
                    {runs.length} runs
                  </span>
                </button>

                {/* Specific Well Buttons */}
                {config.wells.map((well) => {
                  const stats = wellRunStats[well.id] || { runCount: 0, stages: new Set(), totalLbs: 0 };
                  const isSelected = selectedWellFilter === well.id;
                  return (
                    <button
                      key={well.id}
                      type="button"
                      onClick={() => setSelectedWellFilter(well.id)}
                      className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition shrink-0 flex items-center gap-2 border ${
                        isSelected
                          ? 'bg-[#d4a017] text-[#0b0c0e] border-[#d4a017] shadow-lg scale-[1.02]'
                          : 'bg-[#0b0c0e] text-[#e8ebe6] border-[#2a313b] hover:border-[#2a313b] hover:text-[#e8ebe6]'
                      }`}
                    >
                      <span>{well.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-black ${
                          isSelected
                            ? 'bg-[#0b0c0e] text-[#d4a017]'
                            : 'bg-[#1b2027] text-[#e8ebe6]'
                        }`}
                      >
                        {stats.stages.size}{well.plannedStages ? `/${well.plannedStages}` : ''} stages
                      </span>
                    </button>
                  );
                })}

                {/* Unassigned Well Button (if any exist) */}
                {unassignedWellRunsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedWellFilter('unassigned')}
                    className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition shrink-0 flex items-center gap-2 border ${
                      selectedWellFilter === 'unassigned'
                        ? 'bg-[#c23b32] text-[#e8ebe6] border-[#c23b32] shadow-lg'
                        : 'bg-[#0b0c0e] text-[#e25a4a] border-[#c23b32]/60 hover:border-[#c23b32]'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>UNASSIGNED WELL</span>
                    <span className="bg-[#260e0c] text-[#e25a4a] px-2 py-0.5 rounded-lg text-[10px] font-mono font-black">
                      {unassignedWellRunsCount}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Well Summary Banner */}
            {selectedWellFilter !== 'all' ? (
              (() => {
                const wellObj = config.wells.find((w) => w.id === selectedWellFilter);
                const stats = wellRunStats[selectedWellFilter] || { runCount: 0, stages: new Set(), totalLbs: 0, sandBreakdown: {} };
                const lbsPerTon = config.lbsPerTon || 2000;
                return (
                  <div className="bg-[#0b0c0e]/80 border border-[#2a313b] p-4 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#9aa3ad] uppercase tracking-wider">
                          Active Well:
                        </span>
                        <span className="text-lg font-black text-[#d4a017] uppercase">
                          {wellObj?.name || 'Unassigned Well'}
                        </span>
                      </div>
                      <div className="text-xs text-[#e8ebe6] flex flex-wrap items-center gap-3">
                        <span>
                          Stages Completed:{' '}
                          <span className="font-mono font-black text-[#e8ebe6]">
                            {stats.stages.size}
                            {wellObj?.plannedStages ? ` / ${wellObj.plannedStages}` : ''}
                          </span>
                        </span>
                        <span>•</span>
                        <span>
                          Run Records:{' '}
                          <span className="font-mono font-bold text-[#e8ebe6]">{stats.runCount}</span>
                        </span>
                        <span>•</span>
                        <span>
                          Total Sand Pulled:{' '}
                          <span className="font-mono font-black text-[#d4a017]">
                            {formatLbs(stats.totalLbs)}
                          </span>{' '}
                          <span className="text-[#9aa3ad] font-mono">
                            ({formatTons(stats.totalLbs / lbsPerTon)})
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Sand Types Breakdown */}
                    {Object.keys(stats.sandBreakdown).length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {Object.entries(stats.sandBreakdown).map(([st, lbs]) => (
                          <div
                            key={st}
                            className="bg-[#14171c] border border-[#2a313b] px-2.5 py-1 rounded-xl text-xs font-medium text-[#e8ebe6]"
                          >
                            <span className="text-[#d4a017] font-bold">{st}:</span>{' '}
                            <span className="font-mono font-bold text-[#e8ebe6]">{formatLbs(Number(lbs) || 0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="bg-[#0b0c0e]/50 border border-[#2a313b]/80 px-4 py-2.5 rounded-lg flex items-center justify-between text-xs text-[#9aa3ad] font-medium">
                <div>
                  Showing all <span className="text-[#e8ebe6] font-bold">{filteredRuns.length}</span> stage runs across all wells (sorted {stageSortOrder === 'stage_asc' ? 'numerically Stage # 1 → N' : stageSortOrder === 'stage_desc' ? 'descending Stage # N → 1' : 'by entry time'}).
                </div>
                <div className="text-[#e8ebe6] font-mono font-bold">
                  Total: {formatLbs(runs.reduce((s, r) => s + (r.lbsPulled || 0), 0))}
                </div>
              </div>
            )}
          </div>

          {/* Stage Runs Record Cards */}
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-5 text-[#e8ebe6] shadow-2xl space-y-3">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-[#d4a017] mb-1">
              <span>LOGGED STAGE RUNS ({filteredRuns.length})</span>
              <span className="text-[#9aa3ad] font-medium text-[11px]">
                {stageSortOrder === 'stage_asc' ? 'Numerical Sequence (Stage 1, 2, 3...)' : ''}
              </span>
            </div>

            {filteredRuns.length === 0 ? (
              <div className="text-center py-12 text-[#9aa3ad] font-bold text-sm bg-[#0b0c0e]/50 rounded-lg border border-[#2a313b]">
                No stage run records found matching the active well and search filter.
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredRuns.map((r) => {
                  const wellObj = config.wells.find((w) => w.id === r.wellId);
                  const isUnassignedSilo = !siloList.some((s) => s.siloNumber === r.siloNumber);
                  return (
                    <div
                      key={r.id}
                      className={`p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition hover:border-[#2a313b] ${
                        isUnassignedSilo
                          ? 'bg-[#0b0c0e] border border-[#c23b32]/80 shadow-lg'
                          : 'bg-[#0b0c0e] border border-[#2a313b]'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Prominent Numerical Stage Badge */}
                          <span className="text-xs font-black text-[#0b0c0e] bg-[#d4a017] px-3 py-1 rounded-lg uppercase tracking-tight font-mono shadow-sm">
                            STAGE #{r.stageNumber}
                          </span>

                          <span className="font-black text-[#e8ebe6] text-base uppercase">
                            {wellObj?.name || 'Unassigned Well'}
                          </span>

                          {isUnassignedSilo ? (
                            <span className="text-xs font-black text-[#e8ebe6] bg-[#c23b32] px-2.5 py-0.5 rounded-lg uppercase flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              UNCONFIGURED SILO #{r.siloNumber}
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-[#e8ebe6] bg-[#1b2027] px-2.5 py-0.5 rounded-lg">
                              SILO #{r.siloNumber}
                            </span>
                          )}

                          <span className="text-xs font-bold text-[#d4a017] bg-[#14171c] border border-[#2a313b] px-2.5 py-0.5 rounded-lg">
                            {r.sandType}
                          </span>
                        </div>

                        <div className="text-xs text-[#9aa3ad] font-medium flex flex-wrap items-center gap-2">
                          <span>
                            Run Date: <span className="text-[#e8ebe6] font-bold">{r.date}</span>
                          </span>
                          {r.createdAt && (
                            <span className="text-[#9aa3ad] font-mono text-[11px] bg-[#14171c] px-2 py-0.5 rounded border border-[#2a313b]">
                              Entered:{' '}
                              <span className="text-[#d4a017] font-bold">
                                {new Date(r.createdAt).toLocaleString('en-US', {
                                  month: 'numeric',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  second: '2-digit',
                                  hour12: true,
                                })}
                              </span>
                            </span>
                          )}
                          {r.editedAt && (
                            <span className="text-[10px] text-[#d4a017] font-mono bg-[#291e04]/80 border border-[#d4a017]/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Pencil className="w-2.5 h-2.5 text-[#d4a017] shrink-0" />
                              <span className="font-bold uppercase">Edited</span>
                              <span>•</span>
                              <span>
                                {new Date(r.editedAt).toLocaleString('en-US', {
                                  month: 'numeric',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true,
                                })}
                              </span>
                              {r.editedBy && (
                                <>
                                  <span>•</span>
                                  <span className="text-[#e8ebe6] font-sans">{r.editedBy}</span>
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#14171c]">
                        <div className="text-left sm:text-right">
                          <div className="text-xl font-black font-mono text-[#e8ebe6] tracking-tight">
                            {r.lbsPulled.toLocaleString()}{' '}
                            <span className="text-xs text-[#9aa3ad] font-sans font-bold">LBS</span>
                          </div>
                          <div className="text-xs font-bold text-[#9aa3ad] font-mono">
                            {(r.lbsPulled / (config.lbsPerTon || 2000)).toFixed(2)} Tons
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingRun(r)}
                            className="bg-[#1b2027] hover:bg-[#2a313b] active:bg-[#d4a017] text-[#d4a017] active:text-[#0b0c0e] text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-bold transition active:scale-95 border border-[#2a313b]"
                            title="Edit stage run record"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>EDIT</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingTarget({ type: 'run', item: r })}
                            className="text-[#e25a4a] hover:text-[#e25a4a] p-2 rounded-xl hover:bg-[#260e0c]/50 transition active:scale-95 border border-transparent hover:border-[#c23b32]/50"
                            title="Delete record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deleted Tab Content */}
      {activeTab === 'deleted' && (
        <div className="space-y-4">
          <div className="bg-[#14171c] border border-[#2a313b] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[#e8ebe6] text-xs">
            <div>
              <span className="font-bold uppercase text-[#e25a4a]">SOFT DELETED RECORDS AUDIT TRAIL</span>
              <p className="text-[#9aa3ad] mt-0.5">
                These records are excluded from all silo balances, daily totals, and diagnostics. Click RESTORE to reactivate any entry.
              </p>
            </div>
            <div className="bg-[#0b0c0e] px-3 py-1.5 rounded-xl border border-[#2a313b] font-mono text-xs font-bold text-[#e8ebe6] shrink-0">
              TOTAL DELETED: <span className="text-[#e25a4a] font-black">{deletedTotalCount}</span>
            </div>
          </div>

          {filteredDeletedItems.length === 0 ? (
            <div className="bg-[#14171c] border-2 border-dashed border-[#2a313b] rounded-xl p-12 text-center text-[#9aa3ad]">
              <Trash2 className="w-12 h-12 mx-auto text-[#9aa3ad] mb-3" />
              <p className="font-bold uppercase text-sm text-[#9aa3ad]">NO DELETED RECORDS FOUND</p>
              <p className="text-xs text-[#9aa3ad] mt-1">
                {searchTerm ? 'No deleted items matched your search filter.' : 'No delivery tickets or stage runs have been deleted.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDeletedItems.map(({ kind, item, deletedAt }) => {
                if (kind === 'ticket') {
                  const del = item as DeliveryTicket;
                  return (
                    <div
                      key={`del-ticket-${del.id}`}
                      className="bg-[#14171c]/80 border border-[#2a313b] hover:border-[#2a313b] rounded-lg p-4 text-[#e8ebe6] transition shadow-md"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2a313b]/80">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-[#260e0c] text-[#e25a4a] border border-[#c23b32]/80 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg tracking-wider">
                            DELIVERY TICKET
                          </span>
                          <span className="line-through font-mono font-bold text-[#9aa3ad] text-base">
                            #{del.ticketNumber}
                          </span>
                          <span className="text-xs font-bold text-[#e8ebe6] bg-[#1b2027] px-2 py-0.5 rounded">
                            SILO #{del.siloNumber}
                          </span>
                          <span className="text-xs font-bold text-[#d4a017] bg-[#291e04]/60 border border-[#d4a017]/60 px-2 py-0.5 rounded">
                            {del.sandType}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRestoreDelivery && onRestoreDelivery(del.id)}
                          className="bg-[#8fa37a] hover:bg-[#8fa37a] active:bg-[#8fa37a] text-[#e8ebe6] font-black text-xs px-4 py-2 rounded-xl shadow border border-[#8fa37a] transition flex items-center gap-1.5 active:scale-95 shrink-0"
                          title="Restore ticket back into live inventory"
                        >
                          <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>RESTORE TICKET</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-3 text-xs">
                        <div>
                          <span className="text-[#9aa3ad] font-bold uppercase text-[10px]">WEIGHT / SUPPLIER</span>
                          <div className="font-mono font-bold text-[#e8ebe6] text-sm">
                            {del.lbs.toLocaleString()} LBS <span className="text-[#9aa3ad] text-xs">({(del.lbs / (config.lbsPerTon || 2000)).toFixed(1)} Tons)</span>
                          </div>
                          <div className="text-[#e8ebe6] font-bold mt-0.5">{del.supplier}</div>
                        </div>

                        <div>
                          <span className="text-[#9aa3ad] font-bold uppercase text-[10px]">DELIVERY DATE</span>
                          <div className="text-[#e8ebe6] font-bold">{del.date} {del.timeOfDay ? `• ${del.timeOfDay}` : ''}</div>
                          {del.createdAt && (
                            <div className="text-[11px] text-[#9aa3ad] font-mono mt-0.5">
                              Entered: {new Date(del.createdAt).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                            </div>
                          )}
                        </div>

                        <div>
                          <span className="text-[#9aa3ad] font-bold uppercase text-[10px]">DELETION AUDIT</span>
                          <div className="text-[#e25a4a] font-mono font-bold">
                            {deletedAt ? new Date(deletedAt).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : 'Soft deleted'}
                          </div>
                          {(del.deletedByEmail || del.deletedBy) && (
                            <div className="text-[#e8ebe6] text-[11px] mt-0.5">
                              Deleted by: <span className="font-bold text-[#e8ebe6]">{del.deletedByEmail || del.deletedBy}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {del.deletedReason && (
                        <div className="bg-[#260e0c]/40 border border-[#c23b32]/60 rounded-xl px-3 py-2 text-xs text-[#e25a4a] font-mono flex items-center gap-2">
                          <span className="font-black text-[#e25a4a] uppercase text-[10px] shrink-0">REASON:</span>
                          <span className="italic">"{del.deletedReason}"</span>
                        </div>
                      )}
                    </div>
                  );
                } else {
                  const run = item as RunRecord;
                  const wellObj = config.wells.find((w) => w.id === run.wellId);
                  return (
                    <div
                      key={`del-run-${run.id}`}
                      className="bg-[#14171c]/80 border border-[#2a313b] hover:border-[#2a313b] rounded-lg p-4 text-[#e8ebe6] transition shadow-md"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2a313b]/80">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-[#291e04] text-[#d4a017] border border-[#d4a017]/80 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg tracking-wider">
                            STAGE RUN
                          </span>
                          <span className="line-through font-mono font-bold text-[#9aa3ad] text-base">
                            {wellObj?.name || 'Well'} • STAGE #{run.stageNumber}
                          </span>
                          <span className="text-xs font-bold text-[#e8ebe6] bg-[#1b2027] px-2 py-0.5 rounded">
                            SILO #{run.siloNumber}
                          </span>
                          <span className="text-xs font-bold text-[#e8ebe6] bg-[#14171c] border border-[#2a313b] px-2 py-0.5 rounded">
                            {run.sandType}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRestoreRun && onRestoreRun(run.id)}
                          className="bg-[#8fa37a] hover:bg-[#8fa37a] active:bg-[#8fa37a] text-[#e8ebe6] font-black text-xs px-4 py-2 rounded-xl shadow border border-[#8fa37a] transition flex items-center gap-1.5 active:scale-95 shrink-0"
                          title="Restore stage run back into live calculations"
                        >
                          <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>RESTORE RUN</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-3 text-xs">
                        <div>
                          <span className="text-[#9aa3ad] font-bold uppercase text-[10px]">PULLED WEIGHT</span>
                          <div className="font-mono font-bold text-[#e8ebe6] text-sm">
                            {run.lbsPulled.toLocaleString()} LBS <span className="text-[#9aa3ad] text-xs">({(run.lbsPulled / (config.lbsPerTon || 2000)).toFixed(1)} Tons)</span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[#9aa3ad] font-bold uppercase text-[10px]">RUN DATE</span>
                          <div className="text-[#e8ebe6] font-bold">{run.date}</div>
                          {run.createdAt && (
                            <div className="text-[11px] text-[#9aa3ad] font-mono mt-0.5">
                              Entered: {new Date(run.createdAt).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                            </div>
                          )}
                        </div>

                        <div>
                          <span className="text-[#9aa3ad] font-bold uppercase text-[10px]">DELETION AUDIT</span>
                          <div className="text-[#e25a4a] font-mono font-bold">
                            {deletedAt ? new Date(deletedAt).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : 'Soft deleted'}
                          </div>
                          {(run.deletedByEmail || run.deletedBy) && (
                            <div className="text-[#e8ebe6] text-[11px] mt-0.5">
                              Deleted by: <span className="font-bold text-[#e8ebe6]">{run.deletedByEmail || run.deletedBy}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {run.deletedReason && (
                        <div className="bg-[#260e0c]/40 border border-[#c23b32]/60 rounded-xl px-3 py-2 text-xs text-[#e25a4a] font-mono flex items-center gap-2">
                          <span className="font-black text-[#e25a4a] uppercase text-[10px] shrink-0">REASON:</span>
                          <span className="italic">"{run.deletedReason}"</span>
                        </div>
                      )}
                    </div>
                  );
                }
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTarget && (
        <DeleteConfirmModal
          state={state}
          target={deletingTarget}
          onConfirmDelete={async (reason) => {
            if (deletingTarget.type === 'ticket') {
              await onDeleteDelivery(deletingTarget.item.id, reason);
            } else {
              await onDeleteRun(deletingTarget.item.id, reason);
            }
          }}
          onClose={() => setDeletingTarget(null)}
        />
      )}

      {/* Edit Delivery Modal */}
      {editingTicket && (
        <EditDeliveryModal
          state={state}
          ticket={editingTicket}
          onSave={async (updates) => {
            if (onUpdateDelivery) {
              await onUpdateDelivery(editingTicket.id, updates);
            }
          }}
          onClose={() => setEditingTicket(null)}
        />
      )}

      {/* Edit Stage Run Modal */}
      {editingRun && (
        <EditRunModal
          state={state}
          run={editingRun}
          onSave={async (updates) => {
            if (onUpdateRun) {
              await onUpdateRun(editingRun.id, updates);
            }
          }}
          onClose={() => setEditingRun(null)}
        />
      )}

      {/* Photo View Modal */}
      {viewingPhotoUrl && (
        <div className="fixed inset-0 bg-[#0b0c0e]/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#14171c] border border-[#2a313b] rounded-lg max-w-2xl w-full p-4 text-[#e8ebe6] shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-[#2a313b] mb-3">
              <h3 className="font-black uppercase text-[#d4a017] text-sm">ATTACHED TICKET SCAN</h3>
              <button
                type="button"
                onClick={() => setViewingPhotoUrl(null)}
                className="bg-[#1b2027] hover:bg-[#2a313b] px-3 py-1 rounded-lg text-xs font-bold"
              >
                CLOSE
              </button>
            </div>
            <img src={viewingPhotoUrl} alt="Full Ticket Scan" className="max-h-[75vh] w-full object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
}
