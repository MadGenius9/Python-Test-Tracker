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
          <div className="border border-cyan-500/30 bg-[#070b12] p-4 shadow-[0_0_20px_rgba(34,211,238,0.06)]">
            <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">Pad on hand</div>
            <div className="mt-1 text-3xl font-mono text-cyan-200 font-bold">{(totalOnHandLbs / 1_000_000).toFixed(2)}M <span className="text-sm font-normal text-cyan-400">lbs</span></div>
          </div>
          <div className="border border-cyan-500/30 bg-[#070b12] p-4 shadow-[0_0_20px_rgba(34,211,238,0.06)]">
            <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">Stages left</div>
            <div className="mt-1 text-3xl font-mono text-fuchsia-200 font-bold">{padTotalStagesLeft} <span className="text-sm font-normal text-cyan-400">of {padTotalStagesPlanned}</span></div>
          </div>
          {padSummary.hasReorderAlert && (
            <button type="button" onClick={() => onNavigateTab('delivery')} className="w-full border border-fuchsia-400 bg-fuchsia-500/10 p-4 text-left shadow-[0_0_20px_rgba(217,70,239,0.2)]">
              <div className="text-sm font-semibold font-mono uppercase text-fuchsia-300">Low sand warning</div>
              <div className="text-xs text-cyan-300/80 mt-1 font-mono">A sand type is under the reorder reserve.</div>
            </button>
          )}
          <button type="button" onClick={() => setIsRecoveryOpen(true)} className="w-full border border-cyan-500/30 bg-black hover:bg-[#0b1220] px-4 py-2 text-xs font-mono text-cyan-300 hover:text-cyan-100 transition">Restore setup</button>
        </aside>
      </div>
      <div className="border border-cyan-500/30 bg-[#070b12] p-4 shadow-[0_0_20px_rgba(34,211,238,0.06)]">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-cyan-400">
          <span>Well progress</span>
          <span className="text-fuchsia-300 font-bold">{padTotalStagesPumped} / {padTotalStagesPlanned} stages</span>
        </div>
        <div className="mt-3 h-2 bg-[#0b1220] border border-cyan-500/30 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-400 shadow-[0_0_12px_rgba(217,70,239,0.5)]" style={{ width: `${padTotalPercentComplete}%` }} />
        </div>
        <div className="mt-2 text-sm font-mono text-cyan-100">Stage {padSummary.nextStageNumber} · {padSummary.nextWellName}</div>
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
