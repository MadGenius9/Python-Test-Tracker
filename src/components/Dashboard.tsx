import {
  AlertTriangle,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Factory,
  FileSpreadsheet,
  Gauge,
  History,
  Layers,
  LayoutDashboard,
  Settings,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import React, { useState } from 'react';
import {
  calculateDeliveredBySupplier,
  calculateJobDesignMetrics,
  calculateSandDesignForWell,
  calculateSandTypeTotalOnHand,
  calculateSiloOnHandForSand,
  formatLbs,
  formatTons,
  getDiagnosticsReport,
  getEffectivePerStageDesign,
  getPadSummary,
  getSiloDerivedStates,
} from '../lib/sandRules';
import { AppState, DeliveryTicket, SandTypeSpec } from '../types';
import PadRecoveryModal from './PadRecoveryModal';
import HopperField from './HopperField';

interface DashboardProps {
  state: AppState;
  onNavigateTab: (
    tab: 'dashboard' | 'board' | 'pullsheet' | 'job_design' | 'progress' | 'stages' | 'reconciliation' | 'delivery' | 'run' | 'logs' | 'diagnostics' | 'setup',
    opts?: { siloNumber?: number }
  ) => void;
  onSelectPad?: (padId: string) => void;
}

// Helper to determine sand type color theme matching Silo Board
export function getSandColorClasses(sandName: string) {
  const lower = (sandName || '').toLowerCase();
  if (lower.includes('100')) {
    return {
      headerBg: 'bg-[#d4a017]/10 text-[#d4a017] border-[#d4a017]/40',
      badgeBg: 'bg-[#1b2027] text-[#d4a017] border border-[#d4a017]/50 font-semibold',
      textAccent: 'text-[#d4a017]',
      borderAccent: 'border-[#d4a017]/60',
      barColor: 'bg-[#d4a017]',
    };
  }
  if (lower.includes('40/70') || lower.includes('40')) {
    return {
      headerBg: 'bg-[#5b7c99]/10 text-[#5b7c99] border-[#5b7c99]/40',
      badgeBg: 'bg-[#1b2027] text-[#5b7c99] border border-[#5b7c99]/50 font-semibold',
      textAccent: 'text-[#5b7c99]',
      borderAccent: 'border-[#5b7c99]/60',
      barColor: 'bg-[#5b7c99]',
    };
  }
  return {
    headerBg: 'bg-[#8fa37a]/10 text-[#8fa37a] border-[#8fa37a]/40',
    badgeBg: 'bg-[#1b2027] text-[#8fa37a] border border-[#8fa37a]/50 font-semibold',
    textAccent: 'text-[#8fa37a]',
    borderAccent: 'border-[#8fa37a]/60',
    barColor: 'bg-[#8fa37a]',
  };
}

export default function Dashboard({ state, onNavigateTab, onSelectPad }: DashboardProps) {
  const { config, deliveries, runs } = state;
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [selectedSilo, setSelectedSilo] = useState<number | null>(null);
  const lbsPerTon = config.lbsPerTon || 2000;
  const lbsPerTruckload = config.lbsPerTruckload || 57000;
  const reorderThresholdStages = config.reorderThresholdStages || 5;

  const sandTypes = config.sandTypes || [];
  const silos = config.silos || [];
  const wells = config.wells || [];

  const padSummary = getPadSummary(state);
  const siloDerivedStates = getSiloDerivedStates(state);
  const jobMetrics = calculateJobDesignMetrics(state);
  const supplierRows = calculateDeliveredBySupplier(state);
  const diagReport = getDiagnosticsReport(state);

  const unconfiguredDeliverySands = deliveries
    .filter((d) => d.sandType && !sandTypes.some((st) => st.name.toLowerCase() === d.sandType.toLowerCase()))
    .map((d) => d.sandType);
  const uniqueUnconfiguredSands = Array.from(new Set(unconfiguredDeliverySands));

  const isPossibleReset =
    uniqueUnconfiguredSands.length > 0 ||
    (config.padName.toLowerCase().includes('rattlesnake') && deliveries.length > 0);

  // -------------------------------------------------------------
  // Section 1: ON-HAND POSITION CALCULATIONS
  // -------------------------------------------------------------
  const onHandPositions = sandTypes.map((st) => {
    // Starting balance
    const startingLbs = silos
      .filter((s) => s.sandType === st.name)
      .reduce((sum, s) => sum + (s.startingBalanceLbs || 0), 0);

    // Delivered
    const sandDeliveries = deliveries.filter((d) => d.sandType === st.name);
    const deliveredLbs = sandDeliveries.reduce((sum, d) => sum + (d.lbs || 0), 0);
    const deliveredTons = deliveredLbs / lbsPerTon;
    const deliveredLoads = sandDeliveries.length;
    const deliveredTruckloadsEquiv = deliveredLbs / lbsPerTruckload;

    // Pumped
    const sandRuns = runs.filter((r) => r.sandType === st.name);
    const pumpedLbs = sandRuns.reduce((sum, r) => sum + (r.lbsPulled || 0), 0);

    // On-Hand
    const onHandLbs = startingLbs + deliveredLbs - pumpedLbs;
    const onHandTons = onHandLbs / lbsPerTon;
    const stagesOnHand = st.perStageDesignLbs > 0 ? onHandLbs / st.perStageDesignLbs : 0;

    // Last delivery date
    let lastDeliveryDate = '—';
    if (sandDeliveries.length > 0) {
      const sorted = [...sandDeliveries].sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      lastDeliveryDate = sorted[0].date;
    }

    return {
      sandType: st,
      startingLbs,
      deliveredLbs,
      deliveredTons,
      deliveredLoads,
      deliveredTruckloadsEquiv,
      pumpedLbs,
      onHandLbs,
      onHandTons,
      stagesOnHand,
      lastDeliveryDate,
    };
  });

  // Pad Total On-Hand Position
  const totalDeliveredLbs = onHandPositions.reduce((sum, p) => sum + p.deliveredLbs, 0);
  const totalDeliveredTons = totalDeliveredLbs / lbsPerTon;
  const totalDeliveredLoads = onHandPositions.reduce((sum, p) => sum + p.deliveredLoads, 0);
  const totalDeliveredTruckloadsEquiv = totalDeliveredLbs / lbsPerTruckload;
  const totalPumpedLbs = onHandPositions.reduce((sum, p) => sum + p.pumpedLbs, 0);
  const totalOnHandLbs = onHandPositions.reduce((sum, p) => sum + p.onHandLbs, 0);
  const totalOnHandTons = totalOnHandLbs / lbsPerTon;

  const totalPerStageDesignLbs = sandTypes.reduce((sum, st) => sum + (st.perStageDesignLbs || 0), 0);
  const totalStagesOnHand = totalPerStageDesignLbs > 0 ? totalOnHandLbs / totalPerStageDesignLbs : 0;

  let totalLastDeliveryDate = '—';
  if (deliveries.length > 0) {
    const sorted = [...deliveries].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    totalLastDeliveryDate = sorted[0].date;
  }

  // -------------------------------------------------------------
  // Section 2: SAND RUNWAY CALCULATIONS
  // -------------------------------------------------------------
  const runwayData = onHandPositions.map((pos) => {
    const threshold = reorderThresholdStages;
    const stages = pos.stagesOnHand;
    // Status color: red below threshold, amber within half stage of it, green above
    let statusColor = 'green';
    let statusLabel = 'SAFE';
    if (stages < threshold) {
      statusColor = 'red';
      statusLabel = 'CRITICAL (< THRESHOLD)';
    } else if (stages <= threshold + 0.5) {
      statusColor = 'amber';
      statusLabel = 'WARNING (NEAR THRESHOLD)';
    }

    return {
      sandType: pos.sandType,
      stagesOnHand: stages,
      threshold,
      statusColor,
      statusLabel,
    };
  });

  // Calculate max scale for runway bars so all bars share proportional reference
  const maxRunwayStages = Math.max(
    reorderThresholdStages * 2,
    10,
    ...runwayData.map((r) => Math.ceil(r.stagesOnHand * 1.2))
  );

  // -------------------------------------------------------------
  // Section 3: STAGE PROGRESS CALCULATIONS
  // -------------------------------------------------------------
  const wellProgressList = wells.map((well) => {
    const wellRuns = runs.filter((r) => r.wellId === well.id);
    const pumpedStagesSet = new Set(wellRuns.map((r) => r.stageNumber));
    const stagesPumped = pumpedStagesSet.size;
    const stagesPlanned = well.plannedStages || 0;
    const stagesLeft = Math.max(0, stagesPlanned - stagesPumped);
    const percentComplete = stagesPlanned > 0 ? Math.min(100, Math.round((stagesPumped / stagesPlanned) * 100)) : 0;

    return {
      well,
      stagesPlanned,
      stagesPumped,
      stagesLeft,
      percentComplete,
    };
  });

  const padTotalStagesPlanned = wellProgressList.reduce((sum, w) => sum + w.stagesPlanned, 0);
  const padTotalStagesPumped = wellProgressList.reduce((sum, w) => sum + w.stagesPumped, 0);
  const padTotalStagesLeft = Math.max(0, padTotalStagesPlanned - padTotalStagesPumped);
  const padTotalPercentComplete =
    padTotalStagesPlanned > 0
      ? Math.min(100, Math.round((padTotalStagesPumped / padTotalStagesPlanned) * 100))
      : 0;

  // -------------------------------------------------------------
  // Section 5: ON HAND BY SILO CALCULATIONS
  // -------------------------------------------------------------
  const siloTableData = silos.map((silo) => {
    const delivered = deliveries
      .filter((d) => d.siloNumber === silo.siloNumber)
      .reduce((sum, d) => sum + (d.lbs || 0), 0);

    const runToDate = runs
      .filter((r) => r.siloNumber === silo.siloNumber)
      .reduce((sum, r) => sum + (r.lbsPulled || 0), 0);

    const onHandLbs = (silo.startingBalanceLbs || 0) + delivered - runToDate;
    const maxCap = silo.maxCapacityLbs || 350000;
    const percentFull = Math.min(999, Math.max(0, (onHandLbs / maxCap) * 100));
    const isNegative = onHandLbs < 0;

    return {
      silo,
      delivered,
      runToDate,
      onHandLbs,
      percentFull,
      isNegative,
    };
  });

  // -------------------------------------------------------------
  // Section 7: DELIVERIES BY DAY (LAST 14 DAYS FROM MOST RECENT TICKET)
  // -------------------------------------------------------------
  const generate14DayHistory = () => {
    let anchorDate: Date;
    if (deliveries.length > 0) {
      const dates = deliveries.map((d) => d.date).filter(Boolean).sort();
      const latestDateStr = dates[dates.length - 1];
      const [y, m, d] = latestDateStr.split('-').map(Number);
      anchorDate = new Date(y, m - 1, d, 12, 0, 0);
    } else {
      anchorDate = new Date();
    }

    const days: {
      dateStr: string;
      formattedDate: string;
      dayOfWeek: string;
      lbsPerSand: Record<string, number>;
      totalLbs: number;
      loadCount: number;
      hasDeliveries: boolean;
    }[] = [];

    // Group deliveries by date
    const deliveryMap: Record<string, DeliveryTicket[]> = {};
    deliveries.forEach((d) => {
      if (!deliveryMap[d.date]) deliveryMap[d.date] = [];
      deliveryMap[d.date].push(d);
    });

    for (let i = 0; i < 14; i++) {
      const d = new Date(anchorDate);
      d.setDate(anchorDate.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const dayTickets = deliveryMap[dateStr] || [];
      const lbsPerSand: Record<string, number> = {};
      sandTypes.forEach((st) => {
        lbsPerSand[st.name] = dayTickets
          .filter((t) => t.sandType === st.name)
          .reduce((sum, t) => sum + (t.lbs || 0), 0);
      });

      const dayTotalLbs = dayTickets.reduce((sum, t) => sum + (t.lbs || 0), 0);
      const loadCount = dayTickets.length;

      const formattedDate = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const dayOfWeek = d.toLocaleDateString('en-US', {
        weekday: 'short',
      });

      days.push({
        dateStr,
        formattedDate,
        dayOfWeek,
        lbsPerSand,
        totalLbs: dayTotalLbs,
        loadCount,
        hasDeliveries: loadCount > 0,
      });
    }

    return days;
  };

  const dailyHistory14Days = generate14DayHistory();
  const daily14TotalLbs = dailyHistory14Days.reduce((sum, d) => sum + d.totalLbs, 0);
  const daily14TotalLoads = dailyHistory14Days.reduce((sum, d) => sum + d.loadCount, 0);
  const daily14LbsPerSand: Record<string, number> = {};
  sandTypes.forEach((st) => {
    daily14LbsPerSand[st.name] = dailyHistory14Days.reduce(
      (sum, d) => sum + (d.lbsPerSand[st.name] || 0),
      0
    );
  });

  // -------------------------------------------------------------
  // Section 8: ALERTS AUDIT STRIP
  // -------------------------------------------------------------
  const alertsList: {
    id: string;
    label: string;
    count: number;
    description: string;
    targetTab: 'dashboard' | 'board' | 'pullsheet' | 'job_design' | 'progress' | 'stages' | 'reconciliation' | 'delivery' | 'run' | 'logs' | 'diagnostics' | 'setup';
    actionText: string;
  }[] = [];

  // 1. Tickets logged to silo not in config
  if (diagReport.unassignedSiloDeliveries.length > 0) {
    alertsList.push({
      id: 'unassigned-deliveries',
      label: 'Unconfigured Silo Tickets',
      count: diagReport.unassignedSiloDeliveries.length,
      description: `${diagReport.unassignedSiloDeliveries.length} ticket(s) logged to silo numbers not in this pad's active config.`,
      targetTab: 'logs',
      actionText: 'Fix in Logs',
    });
  }

  // 2. Duplicate ticket numbers
  if (diagReport.duplicateTicketNumbers.length > 0) {
    const totalDups = diagReport.duplicateTicketNumbers.reduce((sum, d) => sum + d.count, 0);
    alertsList.push({
      id: 'duplicate-tickets',
      label: 'Duplicate Tickets',
      count: diagReport.duplicateTicketNumbers.length,
      description: `${diagReport.duplicateTicketNumbers.length} ticket number(s) entered more than once (${totalDups} total entries).`,
      targetTab: 'logs',
      actionText: 'Review in Logs',
    });
  }

  // 3. Silos with negative on-hand
  if (diagReport.negativeSilos.length > 0) {
    alertsList.push({
      id: 'negative-silos',
      label: 'Negative Silo Balance',
      count: diagReport.negativeSilos.length,
      description: `${diagReport.negativeSilos.length} silo(s) have negative on-hand (missing delivery ticket or wrong can recorded).`,
      targetTab: 'board',
      actionText: 'View Silo Board',
    });
  }

  // 4. Silos with no sand type assigned
  if (diagReport.unassignedSilos.length > 0) {
    alertsList.push({
      id: 'unassigned-silos',
      label: 'Unassigned Silos',
      count: diagReport.unassignedSilos.length,
      description: `${diagReport.unassignedSilos.length} silo(s) have no sand type assigned in Setup.`,
      targetTab: 'setup',
      actionText: 'Assign in Setup',
    });
  }

  // 5. Sand types below reorder threshold
  const belowReorderSands = padSummary.sandTypeSummaries.filter((s) => s.isBelowReorderThreshold);
  if (belowReorderSands.length > 0) {
    alertsList.push({
      id: 'reorder-threshold',
      label: 'Low Sand Runway',
      count: belowReorderSands.length,
      description: `${belowReorderSands.map((s) => s.sandType).join(', ')} is below the ${reorderThresholdStages}-stage reorder reserve threshold.`,
      targetTab: 'delivery',
      actionText: 'Add Deliveries',
    });
  }

  return (
    <div className="space-y-4 pb-12">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4">
        <HopperField
          sides={Array.from(new Set(siloDerivedStates.map((s) => (s.side || 'A').trim()))).map((sideName) => ({
            sideName,
            silos: siloDerivedStates.filter((s) => (s.side || 'A').trim() === sideName),
          }))}
          selectedSilo={selectedSilo}
          onSelect={(siloNumber) => {
            setSelectedSilo(siloNumber);
            onNavigateTab('board', { siloNumber });
          }}
        />
        <aside className="space-y-3">
          <div className="rounded-xl border border-[#2a313b] bg-[#14171c] p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#9aa3ad]">Pad on hand</div>
            <div className="mt-1 text-3xl font-mono text-[#e8ebe6]">{(totalOnHandLbs / 1_000_000).toFixed(2)}M <span className="text-sm text-[#9aa3ad]">lbs</span></div>
          </div>
          <div className="rounded-xl border border-[#2a313b] bg-[#14171c] p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#9aa3ad]">Stages left</div>
            <div className="mt-1 text-3xl font-mono text-[#e8ebe6]">{padTotalStagesLeft} <span className="text-sm text-[#9aa3ad]">of {padTotalStagesPlanned}</span></div>
          </div>
          {padSummary.hasReorderAlert && (
            <button type="button" onClick={() => onNavigateTab('delivery')} className="w-full rounded-xl border border-[#c23b32] bg-[#260e0c] p-4 text-left">
              <div className="text-sm font-semibold text-[#e25a4a]">Low sand warning</div>
              <div className="text-xs text-[#9aa3ad] mt-1">A sand type is under the reorder reserve.</div>
            </button>
          )}
          <button type="button" onClick={() => setIsRecoveryOpen(true)} className="w-full rounded-xl border border-[#2a313b] bg-[#14171c] px-4 py-2 text-xs text-[#9aa3ad]">Restore setup</button>
        </aside>
      </div>
      <div className="rounded-xl border border-[#2a313b] bg-[#14171c] p-4">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-[#9aa3ad]">
          <span>Well progress</span>
          <span>{padTotalStagesPumped} / {padTotalStagesPlanned} stages</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-[#0b0c0e] overflow-hidden">
          <div className="h-full bg-[#c23b32]" style={{ width: `${padTotalPercentComplete}%` }} />
        </div>
        <div className="mt-2 text-sm text-[#e8ebe6]">Stage {padSummary.nextStageNumber} · {padSummary.nextWellName}</div>
      </div>

      {/* Discovered Well / Sand Setup Recovery Banner */}
      {isPossibleReset && (
        <div className="bg-[#1b2027] border border-[#d4a017]/60 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-start gap-3.5">
            <div className="bg-[#291e0a] text-[#d4a017] p-2.5 rounded-lg border border-[#d4a017]/40 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#d4a017] font-display uppercase tracking-wide flex items-center gap-2">
                <span>RECOVER YOUR WELL NAMES & SAND SETUP</span>
              </div>
              <p className="text-xs text-[#9aa3ad] mt-0.5 max-w-3xl">
                {uniqueUnconfiguredSands.length > 0
                  ? `Your logged delivery tickets contain sand types (${uniqueUnconfiguredSands.join(', ')}) that are not in the current setup.`
                  : 'Did your well or sand configuration reset? You can restore your custom well names, stages, sand types, and silo mappings with 1 click from your history or device backups.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsRecoveryOpen(true)}
              className="bg-[#d4a017] hover:bg-[#e0ad22] text-[#0b0c0e] font-semibold text-xs px-4 py-2.5 rounded-lg shadow uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>RECOVER WELL & SAND SETUP</span>
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SECTION 8: COMPACT ALERTS AUDIT STRIP (HIDDEN IF CLEAN) */}
      {/* ------------------------------------------------------------- */}
      {alertsList.length > 0 && (
        <div className="bg-[#260e0c] border border-[#c23b32]/60 rounded-xl p-4 sm:p-5 shadow-lg text-[#e8ebe6] space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-[#c23b32]/40 pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#e25a4a] shrink-0" />
              <span className="font-bold text-sm uppercase tracking-wide text-[#e25a4a] font-display">
                ATTENTION REQUIRED ({alertsList.length} {alertsList.length === 1 ? 'ALERT' : 'ALERTS'})
              </span>
            </div>
            <span className="text-[11px] font-mono text-[#9aa3ad]">
              Click any item to resolve directly
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {alertsList.map((alert) => (
              <div
                key={alert.id}
                className="bg-[#14171c] border border-[#c23b32]/40 rounded-lg p-3 flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-[#c23b32] text-[#e8ebe6] text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase">
                      {alert.count}
                    </span>
                    <span className="text-xs font-semibold uppercase text-[#e8ebe6] truncate font-sans">
                      {alert.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#9aa3ad] font-normal truncate mt-0.5">
                    {alert.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab(alert.targetTab)}
                  className="bg-[#c23b32] hover:bg-[#e25a4a] text-[#e8ebe6] text-xs font-semibold px-2.5 py-1.5 rounded-md uppercase shrink-0 transition flex items-center gap-1 shadow cursor-pointer"
                >
                  <span>{alert.actionText}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TWO COLUMNS ON DESKTOP (min-[900px]:grid min-[900px]:grid-cols-2) */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-6 items-start">
        {/* ========================================================= */}
        {/* LEFT COLUMN: 1. On-Hand Position, 2. Sand Runway, 3. Stage Progress */}
        {/* ========================================================= */}
        <div className="space-y-6">
          {/* --------------------------------------------------------- */}
          {/* SECTION 1: ON-HAND POSITION */}
          {/* --------------------------------------------------------- */}
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 sm:p-5 text-[#e8ebe6] shadow-lg space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#2a313b]">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#e8ebe6] font-display flex items-center gap-2">
                <Boxes className="w-4 h-4 text-[#8fa37a]" /> 1. ON-HAND POSITION
              </h3>
              <span className="text-[11px] font-mono text-[#9aa3ad]">
                {sandTypes.length} SAND {sandTypes.length === 1 ? 'TYPE' : 'TYPES'}
              </span>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-[#2a313b]">
                    <th className="py-2 px-3 text-left text-[11px] font-mono uppercase tracking-wider text-[#9aa3ad] w-44">
                      METRIC
                    </th>
                    {onHandPositions.map((pos) => {
                      const color = getSandColorClasses(pos.sandType.name);
                      return (
                        <th
                          key={pos.sandType.id}
                          className={`py-2 px-3 text-right text-xs font-mono uppercase border-b-2 ${color.headerBg} ${color.borderAccent}`}
                        >
                          {pos.sandType.name}
                        </th>
                      );
                    })}
                    <th className="py-2 px-3 text-right text-xs font-mono uppercase bg-[#1b2027] text-[#e8ebe6] border-b-2 border-[#2a313b]">
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a313b]/60">
                  {/* Delivered (lbs) */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Delivered (lbs)
                    </td>
                    {onHandPositions.map((pos) => (
                      <td key={pos.sandType.id} className="py-2.5 px-3 text-right text-[#e8ebe6]">
                        {pos.deliveredLbs.toLocaleString()}
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right font-semibold text-[#d4a017] bg-[#0b0c0e]/40">
                      {totalDeliveredLbs.toLocaleString()}
                    </td>
                  </tr>

                  {/* Delivered (tons) */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Delivered (tons)
                    </td>
                    {onHandPositions.map((pos) => (
                      <td key={pos.sandType.id} className="py-2.5 px-3 text-right text-[#9aa3ad]">
                        {pos.deliveredTons.toFixed(1)} T
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right font-semibold text-[#e8ebe6] bg-[#0b0c0e]/40">
                      {totalDeliveredTons.toFixed(1)} T
                    </td>
                  </tr>

                  {/* Delivered (loads) */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Delivered (loads)
                    </td>
                    {onHandPositions.map((pos) => (
                      <td key={pos.sandType.id} className="py-2.5 px-3 text-right text-[#9aa3ad]">
                        {pos.deliveredLoads}{' '}
                        <span className="text-[10px] text-[#9aa3ad]/70">
                          ({pos.deliveredTruckloadsEquiv.toFixed(1)} T-loads)
                        </span>
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right font-semibold text-[#e8ebe6] bg-[#0b0c0e]/40">
                      {totalDeliveredLoads}{' '}
                      <span className="text-[10px] text-[#9aa3ad]/70">
                        ({totalDeliveredTruckloadsEquiv.toFixed(1)} T-loads)
                      </span>
                    </td>
                  </tr>

                  {/* Pumped (lbs) */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Pumped (lbs)
                    </td>
                    {onHandPositions.map((pos) => (
                      <td key={pos.sandType.id} className="py-2.5 px-3 text-right text-[#9aa3ad]">
                        {pos.pumpedLbs.toLocaleString()}
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right font-semibold text-[#e8ebe6] bg-[#0b0c0e]/40">
                      {totalPumpedLbs.toLocaleString()}
                    </td>
                  </tr>

                  {/* ON HAND (lbs) - EMPHASIZED */}
                  <tr className="bg-[#1b2027] border-y border-[#2a313b]">
                    <td className="py-3 px-3 font-sans font-bold text-[#e8ebe6] text-sm">
                      ON HAND (lbs)
                    </td>
                    {onHandPositions.map((pos) => (
                      <td
                        key={pos.sandType.id}
                        className={`py-3 px-3 text-right font-mono font-bold text-sm ${
                          pos.onHandLbs < 0 ? 'text-[#e25a4a]' : 'text-[#d4a017]'
                        }`}
                      >
                        {pos.onHandLbs.toLocaleString()}
                      </td>
                    ))}
                    <td className="py-3 px-3 text-right font-mono font-bold text-sm text-[#d4a017] bg-[#0b0c0e]/50">
                      {totalOnHandLbs.toLocaleString()}
                    </td>
                  </tr>

                  {/* ON HAND (tons) - EMPHASIZED */}
                  <tr className="bg-[#1b2027]/50">
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad] text-xs">
                      ON HAND (tons)
                    </td>
                    {onHandPositions.map((pos) => (
                      <td
                        key={pos.sandType.id}
                        className={`py-2.5 px-3 text-right font-mono font-medium ${
                          pos.onHandTons < 0 ? 'text-[#e25a4a]' : 'text-[#e8ebe6]'
                        }`}
                      >
                        {pos.onHandTons.toFixed(1)} T
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#e8ebe6] bg-[#0b0c0e]/50">
                      {totalOnHandTons.toFixed(1)} T
                    </td>
                  </tr>

                  {/* Stages of sand on hand */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Stages of sand on hand
                    </td>
                    {onHandPositions.map((pos) => {
                      const isLow = pos.stagesOnHand < reorderThresholdStages;
                      return (
                        <td
                          key={pos.sandType.id}
                          className={`py-2.5 px-3 text-right font-mono font-semibold ${
                            isLow ? 'text-[#e25a4a]' : 'text-[#8fa37a]'
                          }`}
                        >
                          {pos.stagesOnHand.toFixed(1)} stg
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#8fa37a] bg-[#0b0c0e]/40">
                      {totalStagesOnHand.toFixed(1)} stg
                    </td>
                  </tr>

                  {/* Last delivery received */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Last delivery received
                    </td>
                    {onHandPositions.map((pos) => (
                      <td key={pos.sandType.id} className="py-2.5 px-3 text-right text-xs text-[#9aa3ad]">
                        {pos.lastDeliveryDate}
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right text-xs text-[#9aa3ad] bg-[#0b0c0e]/40">
                      {totalLastDeliveryDate}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --------------------------------------------------------- */}
          {/* SECTION 2: SAND RUNWAY */}
          {/* --------------------------------------------------------- */}
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 sm:p-5 text-[#e8ebe6] shadow-lg space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#2a313b]">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#e8ebe6] font-display flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#8fa37a]" /> 2. SAND RUNWAY (STAGES ON HAND)
              </h3>
              <span className="text-[11px] font-mono text-[#9aa3ad]">
                REORDER LINE: {reorderThresholdStages}.0 STAGES
              </span>
            </div>

            <div className="space-y-3">
              {runwayData.map((item) => {
                const color = getSandColorClasses(item.sandType.name);
                const barWidthPercent = Math.min(100, Math.max(0, (item.stagesOnHand / maxRunwayStages) * 100));
                const thresholdLinePercent = Math.min(100, (item.threshold / maxRunwayStages) * 100);

                let barBgColor = color.barColor;
                if (item.statusColor === 'red') barBgColor = 'bg-[#c23b32]';
                else if (item.statusColor === 'amber') barBgColor = 'bg-[#d4a017]';

                return (
                  <div key={item.sandType.id} className="bg-[#0b0c0e] border border-[#2a313b] p-3 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${color.badgeBg}`}>
                          {item.sandType.name}
                        </span>
                        <span className="font-mono text-[#9aa3ad]">
                          {item.sandType.perStageDesignLbs.toLocaleString()} lbs/stage
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                            item.statusColor === 'red'
                              ? 'bg-[#260e0c] text-[#e25a4a] border border-[#c23b32]/50'
                              : item.statusColor === 'amber'
                              ? 'bg-[#291e0a] text-[#d4a017] border border-[#d4a017]/50'
                              : 'bg-[#141e17] text-[#8fa37a] border border-[#8fa37a]/50'
                          }`}
                        >
                          {item.statusLabel}
                        </span>
                        <span className="font-mono font-semibold text-sm text-[#e8ebe6]">
                          {item.stagesOnHand.toFixed(1)}{' '}
                          <span className="text-[10px] text-[#9aa3ad] font-sans">STAGES</span>
                        </span>
                      </div>
                    </div>

                    {/* Progress Track & Marked Reorder Line */}
                    <div className="relative h-4 bg-[#1b2027] rounded-md overflow-visible border border-[#2a313b]">
                      {/* Active Sand Runway Bar */}
                      <div
                        className={`h-full rounded-md transition-all duration-300 ${barBgColor}`}
                        style={{ width: `${barWidthPercent}%` }}
                      />

                      {/* Reorder Threshold Marker Line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-[#c23b32] z-10 flex flex-col items-center justify-center shadow"
                        style={{ left: `${thresholdLinePercent}%` }}
                        title={`Reorder threshold: ${item.threshold} stages`}
                      >
                        <div className="absolute -top-4 text-[9px] font-mono bg-[#260e0c] text-[#e25a4a] px-1 py-0.2 rounded border border-[#c23b32]/50">
                          {item.threshold} stg
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[#9aa3ad]/70 font-mono">
                      <span>0 STAGES</span>
                      <span>{maxRunwayStages} STAGES MAX SCALE</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* --------------------------------------------------------- */}
          {/* SECTION 3: STAGE PROGRESS */}
          {/* --------------------------------------------------------- */}
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 sm:p-5 text-[#e8ebe6] shadow-lg space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#2a313b]">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#e8ebe6] font-display flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#8fa37a]" /> 3. STAGE PROGRESS
              </h3>
              <span className="text-[11px] font-mono text-[#9aa3ad]">
                {padTotalStagesPumped} / {padTotalStagesPlanned} STAGES ({padTotalPercentComplete}%)
              </span>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-[#2a313b] text-[11px] uppercase tracking-wider text-[#9aa3ad]">
                    <th className="py-2 px-3 text-left">WELL</th>
                    <th className="py-2 px-2 text-right">PLANNED</th>
                    <th className="py-2 px-2 text-right">PUMPED</th>
                    <th className="py-2 px-2 text-right">LEFT</th>
                    <th className="py-2 px-3 text-left w-36">% COMPLETE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a313b]/60">
                  {wellProgressList.map((wp) => (
                    <tr key={wp.well.id}>
                      <td className="py-2.5 px-3 font-sans font-medium text-[#e8ebe6] truncate max-w-[140px]">
                        {wp.well.name}
                      </td>
                      <td className="py-2.5 px-2 text-right text-[#9aa3ad]">
                        {wp.stagesPlanned}
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-[#e8ebe6]">
                        {wp.stagesPumped}
                      </td>
                      <td className="py-2.5 px-2 text-right text-[#9aa3ad]">
                        {wp.stagesLeft}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-[#0b0c0e] h-2.5 rounded-full overflow-hidden border border-[#2a313b]">
                            <div
                              className="bg-[#8fa37a] h-full rounded-full transition-all"
                              style={{ width: `${wp.percentComplete}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-[#e8ebe6] w-8 text-right">
                            {wp.percentComplete}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* PAD TOTAL ROW */}
                  <tr className="bg-[#1b2027] font-semibold border-t-2 border-[#2a313b]">
                    <td className="py-3 px-3 font-sans uppercase text-[#e8ebe6]">
                      PAD TOTAL
                    </td>
                    <td className="py-3 px-2 text-right text-[#9aa3ad]">
                      {padTotalStagesPlanned}
                    </td>
                    <td className="py-3 px-2 text-right text-[#e8ebe6]">
                      {padTotalStagesPumped}
                    </td>
                    <td className="py-3 px-2 text-right text-[#9aa3ad]">
                      {padTotalStagesLeft}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-[#0b0c0e] h-3 rounded-full overflow-hidden border border-[#2a313b]">
                          <div
                            className="bg-[#8fa37a] h-full rounded-full transition-all"
                            style={{ width: `${padTotalPercentComplete}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono font-semibold text-[#8fa37a] w-8 text-right">
                          {padTotalPercentComplete}%
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: 4. Job Plan vs Delivered, 5. On Hand by Silo, 6. Delivered by Supplier */}
        {/* ========================================================= */}
        <div className="space-y-6">
          {/* --------------------------------------------------------- */}
          {/* SECTION 4: JOB PLAN vs DELIVERED */}
          {/* --------------------------------------------------------- */}
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 sm:p-5 text-[#e8ebe6] shadow-lg space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#2a313b]">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#e8ebe6] font-display flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#8fa37a]" /> 4. JOB PLAN vs DELIVERED
              </h3>
              <span className="text-[11px] font-mono text-[#9aa3ad]">FRAC DESIGN CROSS-CHECK</span>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-[#2a313b]">
                    <th className="py-2 px-3 text-left text-[11px] font-mono uppercase tracking-wider text-[#9aa3ad] w-48">
                      JOB DESIGN METRIC
                    </th>
                    {jobMetrics.map((m) => {
                      const color = getSandColorClasses(m.sandType.name);
                      return (
                        <th
                          key={m.sandType.id}
                          className={`py-2 px-3 text-right text-xs font-mono uppercase border-b-2 ${color.headerBg} ${color.borderAccent}`}
                        >
                          {m.sandType.name}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a313b]/60">
                  {/* Job design total (lbs) */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Job design total (lbs)
                    </td>
                    {jobMetrics.map((m) => (
                      <td key={m.sandType.id} className="py-2.5 px-3 text-right text-[#e8ebe6]">
                        {m.jobDesignTotalLbs.toLocaleString()}
                      </td>
                    ))}
                  </tr>

                  {/* Still to deliver (lbs) -> RED WHEN NEGATIVE */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Still to deliver (lbs)
                    </td>
                    {jobMetrics.map((m) => (
                      <td
                        key={m.sandType.id}
                        className={`py-2.5 px-3 text-right font-mono font-semibold ${
                          m.stillToDeliverLbs < 0
                            ? 'text-[#e25a4a] bg-[#260e0c] rounded px-1.5'
                            : 'text-[#d4a017]'
                        }`}
                      >
                        {m.stillToDeliverLbs.toLocaleString()}
                      </td>
                    ))}
                  </tr>

                  {/* Truckloads still needed */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Truckloads still needed
                    </td>
                    {jobMetrics.map((m) => (
                      <td key={m.sandType.id} className="py-2.5 px-3 text-right text-[#9aa3ad]">
                        {m.truckloadsStillNeeded.toFixed(1)} loads
                      </td>
                    ))}
                  </tr>

                  {/* Stages in design */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Stages in design
                    </td>
                    {jobMetrics.map((m) => (
                      <td key={m.sandType.id} className="py-2.5 px-3 text-right text-[#9aa3ad]">
                        {m.stagesInDesign.toFixed(1)} stg
                      </td>
                    ))}
                  </tr>

                  {/* Stages pumped so far */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Stages pumped so far
                    </td>
                    {jobMetrics.map((m) => (
                      <td key={m.sandType.id} className="py-2.5 px-3 text-right text-[#9aa3ad]">
                        {m.stagesPumpedSoFar.toFixed(1)} stg
                      </td>
                    ))}
                  </tr>

                  {/* Stages of sand left in design */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Stages of sand left in design
                    </td>
                    {jobMetrics.map((m) => (
                      <td key={m.sandType.id} className="py-2.5 px-3 text-right text-[#e8ebe6]">
                        {m.stagesOfSandLeftInDesign.toFixed(1)} stg
                      </td>
                    ))}
                  </tr>

                  {/* Design check: total planned stages x per-stage design */}
                  <tr className="border-t-2 border-[#2a313b] bg-[#0b0c0e]/40">
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Design check (stages × per-stage)
                    </td>
                    {jobMetrics.map((m) => (
                      <td key={m.sandType.id} className="py-2.5 px-3 text-right font-mono text-[#e8ebe6]">
                        {m.plannedStagesSumLbs.toLocaleString()} lbs
                      </td>
                    ))}
                  </tr>

                  {/* Difference vs job design total -> AMBER WHEN DIFF > 2% */}
                  <tr className="bg-[#0b0c0e]/60">
                    <td className="py-2.5 px-3 font-sans text-[#9aa3ad]">
                      Difference vs job design total
                    </td>
                    {jobMetrics.map((m) => (
                      <td
                        key={m.sandType.id}
                        className={`py-2.5 px-3 text-right font-mono font-semibold ${
                          m.hasCrossCheckFlag
                            ? 'text-[#d4a017] bg-[#291e0a] border border-[#d4a017]/50 rounded px-2'
                            : 'text-[#8fa37a]'
                        }`}
                      >
                        {m.plannedCrossCheckDiffLbs > 0 ? '+' : ''}
                        {m.plannedCrossCheckDiffLbs.toLocaleString()} lbs ({m.plannedCrossCheckDiffPercent.toFixed(1)}%)
                        {m.hasCrossCheckFlag && (
                          <span className="block text-[9px] font-sans text-[#d4a017] uppercase tracking-tight">
                            ⚠️ &gt;2% variance
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --------------------------------------------------------- */}
          {/* SECTION 5: ON HAND BY SILO */}
          {/* --------------------------------------------------------- */}
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 sm:p-5 text-[#e8ebe6] shadow-lg space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#2a313b]">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#e8ebe6] font-display flex items-center gap-2">
                <Factory className="w-4 h-4 text-[#8fa37a]" /> 5. ON HAND BY SILO
              </h3>
              <span className="text-[11px] font-mono text-[#9aa3ad]">{silos.length} SILOS</span>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-[#2a313b] text-[11px] uppercase tracking-wider text-[#9aa3ad]">
                    <th className="py-2 px-3 text-left">SILO</th>
                    <th className="py-2 px-2 text-left">SAND</th>
                    <th className="py-2 px-2 text-right">DELIVERED</th>
                    <th className="py-2 px-2 text-right">RUN TO DATE</th>
                    <th className="py-2 px-2 text-right">ON HAND</th>
                    <th className="py-2 px-3 text-right">% FULL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a313b]/60">
                  {siloTableData.map((row) => {
                    const color = getSandColorClasses(row.silo.sandType || '');
                    return (
                      <tr
                        key={row.silo.siloNumber}
                        className={row.isNegative ? 'bg-[#260e0c]/40 border border-[#c23b32]/50' : ''}
                      >
                        <td className="py-2.5 px-3 font-semibold text-[#e8ebe6]">
                          Silo #{row.silo.siloNumber}
                          {row.silo.isOutOfService && (
                            <span className="ml-1.5 text-[9px] bg-[#1b2027] text-[#9aa3ad] border border-[#2a313b] px-1.5 py-0.5 rounded uppercase">
                              OFFLINE
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          {row.silo.sandType ? (
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${color.badgeBg}`}>
                              {row.silo.sandType}
                            </span>
                          ) : (
                            <span className="text-[#9aa3ad]/50 italic">Empty</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right text-[#9aa3ad]">
                          {row.delivered.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 text-right text-[#9aa3ad]">
                          {row.runToDate.toLocaleString()}
                        </td>
                        <td
                          className={`py-2.5 px-2 text-right font-mono font-semibold ${
                            row.isNegative ? 'text-[#e25a4a] text-sm' : 'text-[#d4a017]'
                          }`}
                        >
                          {row.onHandLbs.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[#e8ebe6]">
                          {row.percentFull.toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* --------------------------------------------------------- */}
          {/* SECTION 6: DELIVERED BY SUPPLIER */}
          {/* --------------------------------------------------------- */}
          <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 sm:p-5 text-[#e8ebe6] shadow-lg space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#2a313b]">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#e8ebe6] font-display flex items-center gap-2">
                <Users className="w-4 h-4 text-[#8fa37a]" /> 6. DELIVERED BY SUPPLIER
              </h3>
              <span className="text-[11px] font-mono text-[#9aa3ad]">
                {supplierRows.length} {supplierRows.length === 1 ? 'SUPPLIER' : 'SUPPLIERS'}
              </span>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-[#2a313b] text-[11px] uppercase tracking-wider text-[#9aa3ad]">
                    <th className="py-2 px-3 text-left">SUPPLIER</th>
                    {sandTypes.map((st) => (
                      <th key={st.id} className="py-2 px-2 text-right">
                        {st.name}
                      </th>
                    ))}
                    <th className="py-2 px-2 text-right">TOTAL LBS</th>
                    <th className="py-2 px-2 text-right">TOTAL TONS</th>
                    <th className="py-2 px-3 text-right">LOADS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a313b]/60">
                  {supplierRows.map((row) => (
                    <tr key={row.supplierName}>
                      <td className="py-2.5 px-3 font-sans font-medium text-[#e8ebe6] truncate max-w-[140px]">
                        {row.supplierName}
                      </td>
                      {sandTypes.map((st) => (
                        <td key={st.id} className="py-2.5 px-2 text-right text-[#9aa3ad]">
                          {(row.lbsPerSandType[st.name] || 0).toLocaleString()}
                        </td>
                      ))}
                      <td className="py-2.5 px-2 text-right font-semibold text-[#d4a017]">
                        {row.totalLbs.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-2 text-right text-[#e8ebe6]">
                        {row.totalTons.toFixed(1)} T
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#9aa3ad]">
                        {row.loadCount}
                      </td>
                    </tr>
                  ))}

                  {/* TOTAL ROW */}
                  <tr className="bg-[#1b2027] font-semibold border-t-2 border-[#2a313b]">
                    <td className="py-3 px-3 font-sans uppercase text-[#e8ebe6]">
                      SUPPLIERS TOTAL
                    </td>
                    {sandTypes.map((st) => {
                      const stTotal = supplierRows.reduce((sum, r) => sum + (r.lbsPerSandType[st.name] || 0), 0);
                      return (
                        <td key={st.id} className="py-3 px-2 text-right text-[#9aa3ad]">
                          {stTotal.toLocaleString()}
                        </td>
                      );
                    })}
                    <td className="py-3 px-2 text-right text-[#d4a017] font-bold">
                      {totalDeliveredLbs.toLocaleString()}
                    </td>
                    <td className="py-3 px-2 text-right text-[#e8ebe6]">
                      {totalDeliveredTons.toFixed(1)} T
                    </td>
                    <td className="py-3 px-3 text-right text-[#9aa3ad]">
                      {totalDeliveredLoads}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* FULL WIDTH SECTION UNDERNEATH: 7. DELIVERIES BY DAY (LAST 14 DAYS) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-4 sm:p-6 text-[#e8ebe6] shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#2a313b]">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#8fa37a]" />
            <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-[#e8ebe6] font-display">
              7. DELIVERIES BY DAY (LAST 14 DAYS)
            </h3>
          </div>
          <p className="text-xs text-[#9aa3ad] font-normal">
            Counting back 14 days from latest ticket. Days with no deliveries show a dash and grey out.
          </p>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-[#2a313b] text-[11px] uppercase tracking-wider text-[#9aa3ad]">
                <th className="py-2.5 px-3 text-left">DATE</th>
                <th className="py-2.5 px-2 text-left">DAY</th>
                {sandTypes.map((st) => (
                  <th key={st.id} className="py-2.5 px-3 text-right">
                    {st.name} (LBS)
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right">TOTAL DELIVERED</th>
                <th className="py-2.5 px-3 text-right">LOAD COUNT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a313b]/50">
              {dailyHistory14Days.map((day) => (
                <tr
                  key={day.dateStr}
                  className={
                    day.hasDeliveries
                      ? 'bg-[#14171c] hover:bg-[#1b2027] transition text-[#e8ebe6]'
                      : 'opacity-30 text-[#9aa3ad]'
                  }
                >
                  <td className="py-2.5 px-3 font-medium text-[#e8ebe6]">
                    {day.dateStr} <span className="text-[10px] text-[#9aa3ad]">({day.formattedDate})</span>
                  </td>
                  <td className="py-2.5 px-2 font-sans uppercase text-[#9aa3ad]">
                    {day.dayOfWeek}
                  </td>
                  {sandTypes.map((st) => (
                    <td key={st.id} className="py-2.5 px-3 text-right">
                      {day.hasDeliveries ? (
                        (day.lbsPerSand[st.name] || 0) > 0 ? (
                          day.lbsPerSand[st.name].toLocaleString()
                        ) : (
                          '—'
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                  ))}
                  <td
                    className={`py-2.5 px-3 text-right font-mono font-semibold ${
                      day.hasDeliveries ? 'text-[#d4a017]' : 'text-[#9aa3ad]'
                    }`}
                  >
                    {day.hasDeliveries ? `${day.totalLbs.toLocaleString()} lbs` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[#9aa3ad]">
                    {day.hasDeliveries ? `${day.loadCount} loads` : '—'}
                  </td>
                </tr>
              ))}

              {/* 14-DAY TOTAL ROW */}
              <tr className="bg-[#1b2027] font-semibold border-t-2 border-[#2a313b] text-sm">
                <td className="py-3 px-3 font-sans uppercase text-[#e8ebe6]" colSpan={2}>
                  14-DAY TOTAL
                </td>
                {sandTypes.map((st) => (
                  <td key={st.id} className="py-3 px-3 text-right text-[#9aa3ad]">
                    {(daily14LbsPerSand[st.name] || 0).toLocaleString()} lbs
                  </td>
                ))}
                <td className="py-3 px-3 text-right text-[#d4a017] font-mono font-bold">
                  {daily14TotalLbs.toLocaleString()} lbs
                </td>
                <td className="py-3 px-3 text-right text-[#e8ebe6]">
                  {daily14TotalLoads} loads
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Well & Sand Setup Recovery Modal */}
      <PadRecoveryModal
        isOpen={isRecoveryOpen}
        onClose={() => setIsRecoveryOpen(false)}
        state={state}
        onSelectPad={onSelectPad}
      />
    </div>
  );
}
