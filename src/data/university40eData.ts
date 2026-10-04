import { PadConfig } from '../types';

export const university40eConfig: PadConfig = {
  customerName: '',
  padName: 'University 40E',
  siloCount: 6,
  lbsPerTruckload: 57000.0,
  lbsPerTon: 2000.0,
  drawStrategy: 'sequential_rotation' as const,
  partialThresholdPct: 0.75,
  reorderThresholdStages: 2.0,
  suppliers: ['Atlas'],
  wells: [
    {
      id: 'well-1803wb',
      name: '1803WB',
      plannedStages: 86,
    },
    {
      id: 'well-1803wc',
      name: '1803WC',
      plannedStages: 86,
    },
  ],
  sandTypes: [
    {
      id: 'st-100-mesh',
      name: '100 Mesh',
      perStageDesignLbs: 453600.0,
      jobDesignTotalLbs: 78019200.0,
      colorCategory: 'amber' as const,
    },
  ],
  silos: [
    {
      siloNumber: 1,
      side: 'A' as const,
      sandType: '100 Mesh',
      manualPriority: 6,
      maxCapacityLbs: 390000.0,
      startingBalanceLbs: 0,
      isOutOfService: false,
    },
    {
      siloNumber: 2,
      side: 'A' as const,
      sandType: '100 Mesh',
      manualPriority: 1,
      maxCapacityLbs: 390000.0,
      startingBalanceLbs: 0,
      isOutOfService: false,
    },
    {
      siloNumber: 3,
      side: 'A' as const,
      sandType: '100 Mesh',
      manualPriority: 2,
      maxCapacityLbs: 390000.0,
      startingBalanceLbs: 0,
      isOutOfService: false,
    },
    {
      siloNumber: 4,
      side: 'B' as const,
      sandType: '100 Mesh',
      manualPriority: 3,
      maxCapacityLbs: 390000.0,
      startingBalanceLbs: 0,
      isOutOfService: false,
    },
    {
      siloNumber: 5,
      side: 'B' as const,
      sandType: '100 Mesh',
      manualPriority: 4,
      maxCapacityLbs: 390000.0,
      startingBalanceLbs: 0,
      isOutOfService: false,
    },
    {
      siloNumber: 6,
      side: 'B' as const,
      sandType: '100 Mesh',
      manualPriority: 5,
      maxCapacityLbs: 390000.0,
      startingBalanceLbs: 0,
      isOutOfService: false,
    },
  ],
  clearManualPriorityAfterStage: true,
  autoAdvanceWellStage: true,
};

export const university40ePadConfig = university40eConfig;

