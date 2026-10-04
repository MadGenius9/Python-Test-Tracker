export interface WellConfig {
  id: string;
  name: string;
  customerName?: string; // e.g. "Diamondback Energy", "Chevron"
  plannedStages: number;
  perStageDesignOverrides?: Record<string, number>; // key: sandTypeId or sandTypeName -> perStageDesignLbs override
}

export interface SandTypeSpec {
  id: string;
  name: string; // e.g. "100 Mesh", "40/70"
  perStageDesignLbs: number; // e.g. 150000 lbs per stage
  jobDesignTotalLbs?: number; // e.g. 13,050,000 lbs whole job figure from frac design
  colorCategory: 'orange' | 'blue' | 'emerald' | 'amber' | 'slate';
}

export interface SiloConfig {
  siloNumber: number; // 1, 2, 3, 4, 5, 6...
  name?: string; // Optional custom name / label (e.g. "Silo 1A", "North Silo 1")
  side: string; // 'A' | 'B' | 'East' | 'West' or custom side label
  sandType: string | null; // e.g. "100 Mesh" or null if empty
  manualPriority: number | null; // e.g. 1, 2, 3 override for pull sequence
  maxCapacityLbs: number; // e.g. 350,000 lbs
  startingBalanceLbs: number; // set at pad setup for takeover on hand
  isOutOfService: boolean; // marked offline for maintenance
}

export type DrawStrategy =
  | 'sequential_rotation'
  | 'partials_then_rotate'
  | 'least_used_first'
  | 'emptiest_first'
  | 'fullest_first';

export interface ProductCodeMapping {
  mineCode: string; // e.g. "100M"
  sandType: string; // e.g. "100 Mesh"
}

export interface PadConfig {
  customerName?: string; // e.g. "Diamondback Energy"
  padName: string;
  siloCount: number; // default 6
  lbsPerTruckload: number; // default 57000 lbs
  lbsPerTon: number; // default 2000 lbs
  drawStrategy: DrawStrategy;
  partialThresholdPct?: number; // default 0.75 (75%)
  reorderThresholdStages: number; // default 5 stages
  suppliers?: string[]; // supplier dropdown list
  wells: WellConfig[];
  sandTypes: SandTypeSpec[];
  silos: SiloConfig[];
  productCodeMappings?: ProductCodeMapping[];
  clearManualPriorityAfterStage?: boolean; // default true: resets manual silo overrides after recording stage
  autoAdvanceWellStage?: boolean; // default true: advances zipper well/stage after recording run
  stageRecordsSchemaVersion?: number; // schema migration version for stage records (e.g. 1)
  paceTrackingStartedAt?: number; // timestamp when live trusted pace tracking began
  forecastMode?: ForecastMode; // selected forecast mode: 'adaptive' | 'rolling_24h' | 'recent_3d' | 'recent_7d' | 'manual'
  manualStagesPerDay?: number; // user manual what-if stages per day override
  manualHoursPerStage?: number; // user manual what-if hours per stage override
}

export type ForecastMode =
  | 'adaptive'
  | 'rolling_24h'
  | 'recent_3d'
  | 'recent_7d'
  | 'manual';

export type ForecastConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'WAITING FOR HISTORY';

export interface StageCycleDetail {
  wellId: string;
  wellName: string;
  stageNumber: number;
  completedAt: number;
  previousCompletedAt?: number;
  cycleDurationHours: number;
  isOutlierDowntime?: boolean;
  downtimeReason?: string;
}

export type TicketConfidence = 'confirmed' | 'probable' | 'unknown';
export type TicketParserType = 'atlas' | 'atlas-partial' | 'known_supplier' | 'generic_labeled' | 'unknown';

export interface ScanMetadata {
  method: 'camera' | 'photo' | 'manual';
  format?: string;
  parser?: TicketParserType;
  confidence?: TicketConfidence;
  rawValue?: string;
  winningScale?: string;
  engine?: string;
  scannedAt?: number;
}

export interface DeliveryTicket {
  id: string;
  date: string; // YYYY-MM-DD
  timeOfDay?: string; // e.g. "14:30"
  sandType: string;
  supplier: string;
  driverName?: string;
  notes?: string;
  siloNumber: number;
  ticketNumber: string;
  lbs: number;
  createdAt: number;
  editedAt?: number;
  editCount?: number;
  editedBy?: string | null;
  editedByEmail?: string | null;
  deleted?: boolean;
  deletedAt?: number | null;
  deletedReason?: string | null;
  deletedBy?: string | null;
  deletedByEmail?: string | null;
  photoUrl?: string | null;
  carrier?: string;
  truck?: string;
  poNumber?: string;
  productCode?: string;
  scanMetadata?: ScanMetadata;
  supervisorOverride?: boolean;
  overrideReason?: string | null;
  pendingSync?: boolean;
}

export interface RunRecord {
  id: string;
  date: string; // YYYY-MM-DD
  wellId: string;
  stageNumber: number;
  siloNumber: number;
  sandType: string; // tracked against silo AND sand type
  lbsPulled: number;
  runSequence?: number; // 1, 2, 3... explicit execution order within the stage
  submissionId?: string; // Idempotency key for stage submission
  startingSiloBalanceLbs?: number; // Authoritative historical silo balance before this run
  endingSiloBalanceLbs?: number; // Authoritative historical silo balance after this run
  rotationOutcome?: 'partial_remaining' | 'emptied'; // Permanent historical outcome
  nextRotationSilo?: number; // Authoritative historical next start silo immediately after this run
  createdAt: number;
  editedAt?: number;
  editCount?: number;
  editedBy?: string | null;
  editedByEmail?: string | null;
  deleted?: boolean;
  deletedAt?: number | null;
  deletedReason?: string | null;
  deletedBy?: string | null;
  deletedByEmail?: string | null;
  pendingSync?: boolean;
}

export interface StageRecord {
  wellId: string;
  stageNumber: number;
  status: 'partial' | 'complete';
  recordedBySand?: Record<string, number>;
  totalRecordedLbs?: number;
  lastSubmissionId?: string;
  updatedAt?: number;
  completedAt: number | null;
  completionTimestampSource?: 'live' | 'correction' | 'history_backfill' | 'imported_legacy' | 'backfill';
  source?: string;
}

export interface StageSubmissionMarker {
  stageKey: string;
  wellId: string;
  stageNumber: number;
  submissionId: string;
  processedAt: number;
  runIds: string[];
  totalSubmittedLbs: number;
}

export interface DeleteResult {
  status: 'deleted' | 'noop';
  count?: number;
}

export type SyncErrorCode =
  | 'DUPLICATE_TICKET'
  | 'STAGE_ALREADY_COMPLETE'
  | 'PAD_NOT_FOUND'
  | 'MALFORMED_QUEUE_ITEM'
  | 'PERMISSION_DENIED'
  | 'NETWORK_ERROR'
  | 'TEMPORARY_UNAVAILABLE'
  | 'UNKNOWN_ERROR';

export interface AppState {
  status?: 'ready' | 'not_found';
  padId?: string;
  config: PadConfig;
  deliveries: DeliveryTicket[];
  runs: RunRecord[];
  stageRecords?: Record<string, StageRecord> | StageRecord[];
  deletedDeliveries?: DeliveryTicket[];
  deletedRuns?: RunRecord[];
}

// Derived calculation types
export interface SiloDerivedState {
  siloNumber: number;
  name?: string;
  side: string;
  sandType: string | null;
  manualPriority: number | null;
  maxCapacityLbs: number;
  startingBalanceLbs: number;
  isOutOfService: boolean;
  onHandLbs: number;
  onHandTons: number;
  percentFull: number; // 0 - 100+
  isOverCapacity: boolean;
  isNegative: boolean;
  status: 'OK' | 'LOW' | 'EMPTY' | 'OUT_OF_SERVICE';
  runOrder: number | null; // 1, 2, 3 rank in pull sequence
  plannedPullLbs: number; // Lbs calculated for target stage run
  stagesLeft: number;
}

export interface SandTypeSummary {
  sandType: string;
  onHandLbs: number;
  onHandTons: number;
  stagesLeft: number;
  perStageDesignLbs: number;
  reorderThresholdLbs: number;
  isBelowReorderThreshold: boolean;
  stageShortfallLbs: number;
}

export interface PadSummary {
  customerName?: string;
  activeWellCustomerName?: string;
  padName: string;
  activeWellId: string;
  nextWellName: string;
  nextStageNumber: number;
  sandTypeSummaries: SandTypeSummary[];
  totalPadOnHandLbs: number;
  hasReorderAlert: boolean;
}

export interface MismatchedDelivery {
  ticketId: string;
  ticketNumber: string;
  siloNumber: number;
  deliverySandType: string;
  siloCurrentSandType: string;
  date: string;
}

export interface StageRecordConsistencyIssue {
  wellId: string;
  wellName: string;
  stageNumber: number;
  issue: string;
  cachedStatus?: string;
  authoritativeStatus: string;
  cachedTotalLbs?: number;
  authoritativeTotalLbs: number;
}

export interface StageRecordConsistencyReport {
  isConsistent: boolean;
  inconsistentCount: number;
  issues: StageRecordConsistencyIssue[];
}

export interface DiagnosticsReport {
  computedPadOnHandLbs: number;
  sumOfSilosOnHandLbs: number;
  isPadTotalMismatch: boolean;
  negativeSilos: { siloNumber: number; onHandLbs: number }[];
  duplicateTicketNumbers: { ticketNumber: string; count: number }[];
  mismatchedDeliveries: MismatchedDelivery[];
  unassignedSilos: number[];
  unassignedSiloDeliveries: DeliveryTicket[];
  unassignedSiloRuns: RunRecord[];
  stageRecordConsistency: StageRecordConsistencyReport;
}

export type StartupStatus =
  | 'initializing_auth'
  | 'loading_pad'
  | 'ready'
  | 'offline_cached'
  | 'connection_error'
  | 'no_pad_selected'
  | 'pad_not_found';

// Stage Review & History types
export interface StagePullStep {
  stepOrder: number; // 1, 2, 3...
  siloNumber: number;
  sandType: string;
  lbsPulled: number;
  submissionId?: string;
  runId?: string;
  createdAt?: number;
  wasEdited?: boolean;
}

export interface StageCompactPull {
  siloNumber: number;
  sandType: string;
  lbsPulled: number;
}

export interface StageSubmissionGroup {
  submissionId: string;
  label: string; // e.g. "Submission 1"
  timestamp: number;
  totalLbs: number;
  siloCount: number;
  runs: RunRecord[];
}

export interface StageSummary {
  stageKey: string; // e.g. "w-1_stage_49"
  wellId: string;
  wellName: string;
  stageNumber: number;

  status: 'complete' | 'partial' | 'not_started';

  completionTimestamp: number | null;
  operationalDate: string | null; // YYYY-MM-DD in America/Chicago
  displayTime: string | null; // e.g. "7:42 PM"
  displayDateTime: string | null; // e.g. "Aug 27, 2026 • 7:42 PM"

  designBySand: Record<string, number>;
  actualBySand: Record<string, number>;

  totalDesignLbs: number;
  totalActualLbs: number;
  varianceLbs: number; // totalActualLbs - totalDesignLbs

  runs: RunRecord[];
  pullSequence: StagePullStep[];
  compactSequence: StageCompactPull[];

  submissionIds: string[];
  submissions: StageSubmissionGroup[];

  firstRunAt: number | null;
  lastRunAt: number | null;

  wasEdited: boolean;
  hasDeletedHistory: boolean;
  wasCorrected: boolean;
  deletedRuns: RunRecord[];

  startingSiloNumber?: number | null;
  lastUsedSiloNumber?: number | null;
}

// Reconciliation & Shift Handoff Types

export interface SandReconciliationSummary {
  sandType: string;
  deliveredLbs: number;
  pumpedLbs: number;
  expectedOnLocationLbs: number;
  siloInventoryLbs: number;
  varianceLbs: number;
  status: 'reconciled' | 'minor_variance' | 'needs_review';
  varianceDisplay: string; // e.g. "0 LB RECONCILED", "10,000 LB SHORT", "10,000 LB OVER"
}

export interface SiloReconciliationSummary {
  siloNumber: number;
  name?: string;
  side: string;
  sandType: string | null;
  onHandLbs: number;
  capacityLbs: number;
  percentFull: number;
  enabled: boolean;
  isNegative: boolean;
  isOverCapacity: boolean;
  status: 'OK' | 'LOW' | 'EMPTY' | 'OUT_OF_SERVICE' | 'NEGATIVE' | 'OVER_CAPACITY';
  issueText?: string;
}

export interface WellReconciliationStatus {
  wellId: string;
  wellName: string;
  currentStageNumber: number;
  totalPlannedStages: number;
  stageStatus: 'ready' | 'partial' | 'complete' | 'not_started';
  percentComplete: number;
}

export interface PartialStagePullStep {
  stepOrder: number;
  siloNumber: number;
  lbsPulled: number;
  sandType: string;
}

export interface PartialStageSummary {
  wellId: string;
  wellName: string;
  stageNumber: number;
  stageKey: string;
  designLbs: number;
  actualRecordedLbs: number;
  remainingLbs: number;
  pullSequence: PartialStagePullStep[];
  resumeSilo: number | null;
  resumeReason: string;
}

export interface RotationReconciliationStatus {
  lastActualSilo: number | null;
  lastActualWellName?: string | null;
  lastActualStageNumber?: number | null;
  lastActualRunLbs?: number | null;
  lastActualSandType?: string | null;
  nextStartSilo: number | null;
  expectedNextStartSilo: number | null;
  currentStoredSilo?: number | null;
  valid: boolean;
  status: 'valid' | 'mismatch' | 'unknown';
  why: string;
  disagreementDetails?: string;
}

export interface TicketAuditSummary {
  activeCount: number;
  activeTotalLbs: number;
  correctedCount: number;
  deletedCount: number;
}

export interface StageAuditSummary {
  partialStagesCount: number;
  correctedStagesCount: number;
  completedStagesCount: number;
  totalRecordedStagesCount: number;
}

export interface SyncReconciliationStatus {
  isOnline: boolean;
  cloudStatusDisplay: string;
}

export interface ReconciliationIssue {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category:
    | 'inventory'
    | 'silo'
    | 'stage'
    | 'rotation'
    | 'ticket'
    | 'sync'
    | 'configuration';
  title: string;
  description: string;
  relatedWellId?: string;
  relatedStageNumber?: number;
  relatedSiloNumber?: number;
  relatedTicketId?: string;
}

export interface ReconciliationSummary {
  padId: string;
  padName: string;
  generatedAt: number;

  sandSummaries: SandReconciliationSummary[];

  totalDeliveredLbs: number;
  totalPumpedLbs: number;
  totalExpectedOnLocationLbs: number;
  totalSiloInventoryLbs: number;
  totalVarianceLbs: number;
  varianceDisplay: string;

  siloSummaries: SiloReconciliationSummary[];

  wellStatuses: WellReconciliationStatus[];

  partialStages: PartialStageSummary[];

  lastCompletedStage: StageSummary | null;

  rotationStatus: RotationReconciliationStatus;

  recentDeliveries: DeliveryTicket[];

  ticketAudit: TicketAuditSummary;

  stageAudit: StageAuditSummary;

  syncStatus: SyncReconciliationStatus;

  issues: ReconciliationIssue[];

  overallStatus: 'reconciled' | 'warning' | 'needs_review';
}

export interface ShiftHandoff {
  id: string;
  padId: string;
  padName: string;
  createdAt: number;
  operationalDate: string;
  createdBy?: string;
  createdByEmail?: string;
  overallStatus: 'reconciled' | 'warning' | 'needs_review';
  totalDeliveredLbs: number;
  totalPumpedLbs: number;
  totalExpectedOnLocationLbs: number;
  totalSiloInventoryLbs: number;
  totalVarianceLbs: number;
  varianceDisplay: string;

  sandSnapshot: Record<
    string,
    {
      deliveredLbs: number;
      pumpedLbs: number;
      expectedOnLocationLbs: number;
      siloInventoryLbs: number;
      varianceLbs: number;
    }
  >;

  siloSnapshot: Array<{
    siloNumber: number;
    name?: string;
    sandType: string | null;
    inventoryLbs: number;
    capacityLbs: number;
    enabled: boolean;
  }>;

  wellSnapshot: Array<{
    wellId: string;
    wellName: string;
    stageNumber: number;
    status: string;
  }>;

  partialStageSnapshot: PartialStageSummary[];

  rotationSnapshot: {
    lastActualSilo: number | null;
    nextStartSilo: number | null;
    valid: boolean;
  };

  lastDeliveryTicketId?: string | null;
  lastDeliveryTicketNumber?: string | null;
  lastDeliveryAt?: number | null;

  deliveriesTodayCount: number;
  deliveriesTodayLbs: number;

  waitingSyncCount?: number;
  conflictCount?: number;

  notes: string;
}

export interface HandoffNotes {
  text: string;
  updatedAt: number;
  updatedBy?: string | null;
  updatedByEmail?: string | null;
}

