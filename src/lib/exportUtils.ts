import { calculateJobDesignMetrics, calculateDeliveredBySupplier, calculateSandDesignForWell, calculateSandPumpedForWell } from './sandRules';
import { getOperationalDate } from './dateUtils';
import { AppState, PadConfig, DeliveryTicket, RunRecord } from '../types';

export function generatePadCSV(state: AppState): string {
  const { config, deliveries, runs } = state;
  const lbsPerTon = config.lbsPerTon || 2000;

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

  let csv = '';

  // Header Metadata
  csv += `"PYTHON SAND TRACKER - END OF JOB SUMMARY REPORT"\n`;
  csv += `"Pad Name","${config.padName.replace(/"/g, '""')}"\n`;
  csv += `"Report Generated","${new Date().toLocaleString()}"\n`;
  csv += `"Total Sand Delivered (Lbs)","${totalDeliveredLbs}"\n`;
  csv += `"Total Sand Delivered (Tons)","${totalDeliveredTons.toFixed(2)}"\n`;
  csv += `"Total Sand Pumped (Lbs)","${totalPumpedLbs}"\n`;
  csv += `"Total Sand Pumped (Tons)","${totalPumpedTons.toFixed(2)}"\n`;
  csv += `"Current On-Hand Balance (Lbs)","${totalOnHandLbs}"\n`;
  csv += `"Current On-Hand Balance (Tons)","${totalOnHandTons.toFixed(2)}"\n`;
  csv += `\n`;

  // Section 1: Whole-Job Frac Design & Cross-Check Summary
  csv += `"=== WHOLE-JOB FRAC DESIGN & CROSS-CHECK SUMMARY ==="\n`;
  csv += `"Sand Type","Job Design Total (Lbs)","Job Design Total (Tons)","Delivered So Far (Lbs)","Still To Deliver (Lbs)","Truckloads Needed","Pumped So Far (Lbs)","Remaining In Design (Lbs)","Planned Sum (Lbs)","Cross-Check Diff (Lbs)","Cross-Check Diff (%)","Cross-Check Flag"\n`;
  jobMetrics.forEach((m) => {
    csv += `"${m.sandType.name.replace(/"/g, '""')}","${m.jobDesignTotalLbs}","${m.jobDesignTotalTons.toFixed(2)}","${m.deliveredSoFarLbs}","${m.stillToDeliverLbs}","${m.truckloadsStillNeeded.toFixed(1)}","${m.pumpedSoFarLbs}","${m.remainingInDesignLbs}","${m.plannedStagesSumLbs}","${m.plannedCrossCheckDiffLbs}","${m.plannedCrossCheckDiffPercent.toFixed(1)}%","${m.hasCrossCheckFlag ? 'FLAGGED (>2%)' : 'OK'}"\n`;
  });
  csv += `\n`;

  // Section 2: Wells & Per-Sand Type Design vs Pumped Breakdown
  csv += `"=== PER-WELL SAND DESIGN VS PUMPED BREAKDOWN ==="\n`;
  csv += `"Well Name","Planned Stages","Pumped Stages","Sand Type","Per-Stage Design (Lbs)","Well Design Total (Lbs)","Well Pumped (Lbs)","Variance (Lbs)"\n`;
  config.wells.forEach((well) => {
    const wellRuns = runs.filter((r) => r.wellId === well.id);
    const pumpedStages = new Set(wellRuns.map((r) => r.stageNumber)).size;

    config.sandTypes.forEach((st) => {
      const designLbs = calculateSandDesignForWell(well, st);
      const pumpedLbs = calculateSandPumpedForWell(well.id, st.name, state);
      const varianceLbs = pumpedLbs - designLbs;
      csv += `"${well.name.replace(/"/g, '""')}","${well.plannedStages}","${pumpedStages}","${st.name.replace(/"/g, '""')}","${st.perStageDesignLbs}","${designLbs}","${pumpedLbs}","${varianceLbs}"\n`;
    });
  });
  csv += `\n`;

  // Section 3: Delivered by Supplier Breakdown
  csv += `"=== DELIVERED BY SUPPLIER BREAKDOWN ==="\n`;
  const sandTypeHeader = config.sandTypes.map((st) => `"${st.name.replace(/"/g, '""')} (Lbs)"`).join(',');
  csv += `"Supplier Name",${sandTypeHeader},"Total Lbs","Total Tons","Load Count"\n`;
  supplierRows.forEach((row) => {
    const sandTypeCols = config.sandTypes.map((st) => `"${row.lbsPerSandType[st.name] || 0}"`).join(',');
    csv += `"${row.supplierName.replace(/"/g, '""')}",${sandTypeCols},"${row.totalLbs}","${row.totalTons.toFixed(2)}","${row.loadCount}"\n`;
  });
  csv += `\n`;

  // Section 4: Delivery Tickets Ledger
  csv += `"=== DELIVERY TICKETS LEDGER ==="\n`;
  csv += `"Ticket Number","Date","Time","Entered Timestamp","Silo Number","Sand Type","Supplier","Driver Name","Weight (Lbs)","Weight (Tons)","Notes"\n`;
  deliveries.forEach((d) => {
    const enteredTimeStr = d.createdAt ? new Date(d.createdAt).toLocaleString() : '';
    csv += `"${d.ticketNumber.replace(/"/g, '""')}","${d.date}","${d.timeOfDay || ''}","${enteredTimeStr}","Silo #${d.siloNumber}","${d.sandType.replace(/"/g, '""')}","${d.supplier.replace(/"/g, '""')}","${(d.driverName || '').replace(/"/g, '""')}","${d.lbs}","${(d.lbs / lbsPerTon).toFixed(2)}","${(d.notes || '').replace(/"/g, '""')}"\n`;
  });
  csv += `\n`;

  // Section 5: Stage Run Records Ledger
  csv += `"=== STAGE RUN RECORDS LEDGER ==="\n`;
  csv += `"Date","Entered Timestamp","Well","Stage Number","Silo Number","Sand Type","Weight Pulled (Lbs)","Weight Pulled (Tons)"\n`;
  runs.forEach((r) => {
    const wellObj = config.wells.find((w) => w.id === r.wellId);
    const wellName = wellObj ? wellObj.name : 'Well';
    const enteredTimeStr = r.createdAt ? new Date(r.createdAt).toLocaleString() : '';
    csv += `"${r.date}","${enteredTimeStr}","${wellName.replace(/"/g, '""')}","${r.stageNumber}","Silo #${r.siloNumber}","${r.sandType.replace(/"/g, '""')}","${r.lbsPulled}","${(r.lbsPulled / lbsPerTon).toFixed(2)}"\n`;
  });

  return csv;
}

export function downloadPadCSV(state: AppState) {
  const csvContent = generatePadCSV(state);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const safePadName = state.config.padName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const dateStr = getOperationalDate();
  link.href = url;
  link.setAttribute('download', `sand_tracker_job_export_${safePadName}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
