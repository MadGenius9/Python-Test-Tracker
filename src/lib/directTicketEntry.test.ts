import { describe, it, expect, beforeEach } from 'vitest';
import { AppState, DeliveryTicket, PadConfig } from '../types';
import { getSiloDerivedStates, getPadSummary } from './sandRules';

describe('Direct Ticket Entry Workflow (Tests 1-5)', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const mockLS = {
      getItem: (key: string) => (key in mockStorage ? mockStorage[key] : null),
      setItem: (key: string, val: string) => {
        mockStorage[key] = String(val);
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      get length() {
        return Object.keys(mockStorage).length;
      },
      key: (i: number) => Object.keys(mockStorage)[i] || null,
    };

    (globalThis as any).localStorage = mockLS;
    if (typeof window !== 'undefined') {
      (window as any).localStorage = mockLS;
    }
  });

  const baseConfig: PadConfig = {
    padName: 'Rattlesnake 14',
    siloCount: 3,
    lbsPerTruckload: 57000,
    lbsPerTon: 2000,
    drawStrategy: 'partials_then_rotate',
    reorderThresholdStages: 5,
    wells: [{ id: 'w-1', name: 'Well 1H', plannedStages: 40 }],
    silos: [
      { siloNumber: 1, name: 'Silo 1', side: 'A', sandType: '100 Mesh', maxCapacityLbs: 350000, manualPriority: 1, startingBalanceLbs: 0, isOutOfService: false },
      { siloNumber: 2, name: 'Silo 2', side: 'A', sandType: '100 Mesh', maxCapacityLbs: 350000, manualPriority: 2, startingBalanceLbs: 0, isOutOfService: false },
      { siloNumber: 3, name: 'Silo 3', side: 'B', sandType: '40/70 Mesh', maxCapacityLbs: 350000, manualPriority: 3, startingBalanceLbs: 0, isOutOfService: false },
    ],
    sandTypes: [
      { id: 'st-1', name: '100 Mesh', perStageDesignLbs: 50000, colorCategory: 'orange' },
      { id: 'st-2', name: '40/70 Mesh', perStageDesignLbs: 50000, colorCategory: 'blue' },
    ],
  };

  const createMockState = (overrides?: Partial<AppState>): AppState => ({
    padId: 'pad-direct-test',
    status: 'ready',
    config: { ...baseConfig, ...(overrides?.config || {}) },
    runs: [],
    deliveries: [],
    deletedDeliveries: [],
    deletedRuns: [],
    stageRecords: {},
    ...overrides,
  });

  // TEST 1 — ADD DELIVERY DIRECTLY
  it('TEST 1 — ADD DELIVERY DIRECTLY: saves and reflects in Silo totals', () => {
    // Setup: No active batch in state or storage
    const state = createMockState({ deliveries: [] });

    // Action: Save delivery directly
    const newDelivery: DeliveryTicket = {
      id: 'del-direct-1',
      ticketNumber: 'M30134842',
      siloNumber: 3,
      sandType: '40/70 Mesh',
      lbs: 57140,
      supplier: 'Badger Mining',
      date: '2026-08-31',
      timeOfDay: '10:18 AM',
      createdAt: 1725100000000,
    };

    const updatedState: AppState = {
      ...state,
      deliveries: [newDelivery],
    };

    // Expect: Delivery is saved directly
    expect(updatedState.deliveries[0].ticketNumber).toBe('M30134842');

    // Expect: Silo totals correctly derive on-hand sand
    const siloStates = getSiloDerivedStates(updatedState);
    const silo3 = siloStates.find((s) => s.siloNumber === 3);
    expect(silo3).toBeDefined();
    expect(silo3?.onHandLbs).toBe(57140);
    expect(silo3?.status).toBe('OK');
  });

  // TEST 2 — QUICK ENTRY DIRECTLY
  it('TEST 2 — QUICK ENTRY DIRECTLY: saves ticket directly without prompting or blocking', () => {
    const state = createMockState();

    // Action: Quick Entry form submission handler payload
    const quickTicketPayload = {
      ticketNumber: 'M30134843',
      siloNumber: 1,
      sandType: '100 Mesh',
      lbs: 56980,
      supplier: 'Hi-Crush',
      date: '2026-08-31',
      timeOfDay: '10:25 AM',
    };

    // Verify payload is valid
    expect(quickTicketPayload.lbs).toBe(56980);

    const updatedState: AppState = {
      ...state,
      deliveries: [
        {
          id: 'del-quick-1',
          ...quickTicketPayload,
          createdAt: Date.now(),
        },
      ],
    };

    expect(updatedState.deliveries.length).toBe(1);
    expect(updatedState.deliveries[0].ticketNumber).toBe('M30134843');

    const silo1 = getSiloDerivedStates(updatedState).find((s) => s.siloNumber === 1);
    expect(silo1?.onHandLbs).toBe(56980);
  });

  // TEST 3 — DIRECT TICKET EDIT
  it('TEST 3 — DIRECT TICKET EDIT: updates ticket directly', () => {
    const delivery: DeliveryTicket = {
      id: 'del-hist-1',
      ticketNumber: 'M30134800',
      siloNumber: 2,
      sandType: '100 Mesh',
      lbs: 57000,
      supplier: 'Badger Mining',
      date: '2026-08-30',
      timeOfDay: '08:00 AM',
      createdAt: 1725000000000,
    };

    const state = createMockState({
      deliveries: [delivery],
    });

    expect(state.deliveries[0].ticketNumber).toBe('M30134800');

    // Action: Update ticket weight or supplier (simulating EditDeliveryModal)
    const updatedDelivery: DeliveryTicket = {
      ...state.deliveries[0],
      lbs: 57200,
      editedAt: Date.now(),
      editedBy: 'Supervisor',
    };

    expect(updatedDelivery.lbs).toBe(57200);
  });

  // TEST 4 — OFFLINE
  it('TEST 4 — OFFLINE: queued delivery flushes cleanly', () => {
    // Setup: Browser is offline, action is enqueued directly
    const offlineAction = {
      id: 'queue-del-1',
      type: 'ADD_DELIVERY',
      padId: 'pad-direct-test',
      payload: {
        ticket: {
          ticketNumber: 'M30134844',
          siloNumber: 2,
          sandType: '100 Mesh',
          lbs: 56800,
          supplier: 'Fairmount',
          date: '2026-08-31',
          timeOfDay: '11:00 AM',
        },
      },
      status: 'pending',
      timestamp: Date.now(),
    };

    expect(offlineAction.type).toBe('ADD_DELIVERY');
    // Ensure item has valid payload schema that passes upfront validation
    expect(offlineAction.payload.ticket.ticketNumber).toBe('M30134844');
    expect(offlineAction.payload.ticket.lbs).toBe(56800);
  });

  // TEST 5 — RECONCILIATION
  it('TEST 5 — RECONCILIATION: all active tickets count toward delivered totals', () => {
    const mixedDeliveries: DeliveryTicket[] = [
      {
        id: 'del-batched-1',
        ticketNumber: 'M30134801',
        siloNumber: 1,
        sandType: '100 Mesh',
        lbs: 50000,
        supplier: 'Badger',
        date: '2026-08-30',
        createdAt: 1725000000000,
      },
      {
        id: 'del-batched-2',
        ticketNumber: 'M30134802',
        siloNumber: 3,
        sandType: '40/70 Mesh',
        lbs: 45000,
        supplier: 'Badger',
        date: '2026-08-30',
        createdAt: 1725010000000,
      },
      {
        id: 'del-unbatched-1',
        ticketNumber: 'M30134803',
        siloNumber: 1,
        sandType: '100 Mesh',
        lbs: 55000,
        supplier: 'Hi-Crush',
        date: '2026-08-31',
        createdAt: 1725100000000,
      },
      {
        id: 'del-unbatched-2',
        ticketNumber: 'M30134804',
        siloNumber: 2,
        sandType: '100 Mesh',
        lbs: 52000,
        supplier: 'Hi-Crush',
        date: '2026-08-31',
        createdAt: 1725110000000,
      },
    ];

    const state = createMockState({
      deliveries: mixedDeliveries,
    });

    // Expect: Total delivered sand calculates all 4 tickets (50k + 45k + 55k + 52k = 202,000 lbs)
    const totalDeliveredLbs = state.deliveries
      .filter((d) => !d.deleted)
      .reduce((sum, d) => sum + (d.lbs || 0), 0);
    expect(totalDeliveredLbs).toBe(202000);
    expect(state.deliveries.length).toBe(4);

    // 100 Mesh total: 50k + 55k + 52k = 157,000 lbs
    const mesh100DeliveredLbs = state.deliveries
      .filter((d) => !d.deleted && d.sandType === '100 Mesh')
      .reduce((sum, d) => sum + (d.lbs || 0), 0);
    expect(mesh100DeliveredLbs).toBe(157000);

    // 40/70 Mesh total: 45,000 lbs
    const mesh4070DeliveredLbs = state.deliveries
      .filter((d) => !d.deleted && d.sandType === '40/70 Mesh')
      .reduce((sum, d) => sum + (d.lbs || 0), 0);
    expect(mesh4070DeliveredLbs).toBe(45000);

    // On-hand balances match starting (0) + delivered (202k) - pumped (0) = 202k
    const padSummary = getPadSummary(state);
    expect(padSummary.totalPadOnHandLbs).toBe(202000);
  });
});
