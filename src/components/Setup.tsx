import { Plus, Settings, Trash2, FolderPlus, Wrench, ArrowRight, Tag, AlertTriangle, FileSpreadsheet, Download, Sparkles, RotateCcw } from 'lucide-react';
import { useState, useEffect } from 'react';
import JobExport from './JobExport';
import JobManagement from './JobManagement';
import PadRecoveryModal from './PadRecoveryModal';
import { createNewPad } from '../lib/firestoreService';
import { blankPadConfig } from '../lib/firestoreService';
import { DrawStrategy, PadConfig, ProductCodeMapping, SandTypeSpec, WellConfig, AppState } from '../types';

interface SetupProps {
  state?: AppState | null;
  config?: PadConfig | null;
  currentPadId: string;
  padList: { id: string; name: string }[];
  onSelectPad: (padId: string) => void;
  onRefreshPadList?: () => void;
  onUpdateConfig: (newConfig: PadConfig) => void;
  onSuccessMessage?: (msg: string) => void;
}

export default function Setup({
  state,
  config: incomingConfig,
  currentPadId,
  padList,
  onSelectPad,
  onRefreshPadList,
  onUpdateConfig,
  onSuccessMessage,
}: SetupProps) {
  const config = incomingConfig || blankPadConfig;

  // Local editable copy of config
  const [customerName, setCustomerName] = useState(config.customerName || 'Diamondback Energy');
  const [padName, setPadName] = useState(config.padName || '');
  const [siloCount, setSiloCount] = useState(config.siloCount || 6);
  const [lbsPerTruckload, setLbsPerTruckload] = useState(config.lbsPerTruckload || 57000);
  const [lbsPerTon, setLbsPerTon] = useState(config.lbsPerTon || 2000);
  const [drawStrategy, setDrawStrategy] = useState<DrawStrategy>(config.drawStrategy || 'partials_then_rotate');
  const [partialThresholdPct, setPartialThresholdPct] = useState<number>(
    config.partialThresholdPct ?? 0.75
  );
  const [reorderThresholdStages, setReorderThresholdStages] = useState(
    config.reorderThresholdStages || 5
  );

  const [wells, setWells] = useState<WellConfig[]>(config.wells || []);
  const [sandTypes, setSandTypes] = useState<SandTypeSpec[]>(config.sandTypes || []);
  const [silos, setSilos] = useState(config.silos || []);
  const [suppliers, setSuppliers] = useState<string[]>(
    config.suppliers || []
  );
  const [productCodeMappings, setProductCodeMappings] = useState<ProductCodeMapping[]>(
    config.productCodeMappings || [
      { mineCode: '100M', sandType: '100 Mesh' },
      { mineCode: '4070', sandType: '40/70' },
      { mineCode: '40/70', sandType: '40/70' },
    ]
  );

  // Synchronize local form state whenever incoming config or currentPadId changes
  useEffect(() => {
    const c = incomingConfig || blankPadConfig;
    setCustomerName(c.customerName || 'Diamondback Energy');
    setPadName(c.padName || '');
    setSiloCount(c.siloCount || 6);
    setLbsPerTruckload(c.lbsPerTruckload || 57000);
    setLbsPerTon(c.lbsPerTon || 2000);
    setDrawStrategy(c.drawStrategy || 'partials_then_rotate');
    setPartialThresholdPct(c.partialThresholdPct ?? 0.75);
    setReorderThresholdStages(c.reorderThresholdStages || 5);
    setWells(c.wells || []);
    setSandTypes(c.sandTypes || []);
    setSilos(c.silos || []);
    setSuppliers(c.suppliers || []);
    setProductCodeMappings(c.productCodeMappings || []);
  }, [incomingConfig, currentPadId]);

  // New Pad Modal State
  const [isCreatingPad, setIsCreatingPad] = useState(false);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [newPadNameInput, setNewPadNameInput] = useState('');

  // New item inputs
  const [newWellName, setNewWellName] = useState('');
  const [newWellCustomer, setNewWellCustomer] = useState('');
  const [newWellStages, setNewWellStages] = useState('40');

  const [newSandName, setNewSandName] = useState('');
  const [newSandDesign, setNewSandDesign] = useState('150000');
  const [newSandJobDesign, setNewSandJobDesign] = useState('13050000');

  const [newSupplierName, setNewSupplierName] = useState('');

  const [newMineCode, setNewMineCode] = useState('');
  const [newMappingSandType, setNewMappingSandType] = useState(sandTypes[0]?.name || '100 Mesh');

  // Track orphaned deliveries/runs if siloCount is lowered or silos deleted
  const currentSiloNumbers = silos.map((s) => s.siloNumber);
  const activeDeliveries = (state?.deliveries || []).filter((d) => !d.deleted);
  const activeRuns = (state?.runs || []).filter((r) => !r.deleted);
  const orphanedDeliveries = activeDeliveries.filter((d) => !currentSiloNumbers.includes(d.siloNumber));
  const orphanedRuns = activeRuns.filter((r) => !currentSiloNumbers.includes(r.siloNumber));
  const totalOrphanedCount = orphanedDeliveries.length + orphanedRuns.length;

  // Handle Silo Count change
  const handleSiloCountChange = (count: number) => {
    setSiloCount(count);
    const updatedSilos = [...silos];
    if (count > updatedSilos.length) {
      for (let i = updatedSilos.length + 1; i <= count; i++) {
        updatedSilos.push({
          siloNumber: i,
          name: `Silo ${i}`,
          side: i % 2 === 1 ? 'A' : 'B',
          sandType: sandTypes[0]?.name || null,
          manualPriority: null,
          maxCapacityLbs: 350000,
          startingBalanceLbs: 0,
          isOutOfService: false,
        });
      }
    } else if (count < updatedSilos.length) {
      updatedSilos.length = count;
    }
    setSilos(updatedSilos);
  };

  const handleAddSilo = () => {
    const nextNum = silos.length > 0 ? Math.max(...silos.map((s) => s.siloNumber)) + 1 : 1;
    const defaultSide = nextNum % 2 === 1 ? 'A' : 'B';
    const newSilo = {
      siloNumber: nextNum,
      name: `Silo ${nextNum}`,
      side: defaultSide,
      sandType: sandTypes[0]?.name || null,
      manualPriority: null,
      maxCapacityLbs: 350000,
      startingBalanceLbs: 0,
      isOutOfService: false,
    };
    const updated = [...silos, newSilo];
    setSilos(updated);
    setSiloCount(updated.length);
  };

  const handleDeleteSilo = (siloNum: number) => {
    if (silos.length <= 1) return;
    const updated = silos.filter((s) => s.siloNumber !== siloNum);
    setSilos(updated);
    setSiloCount(updated.length);
  };

  // Well Handlers
  const handleAddWell = () => {
    if (!newWellName.trim()) return;
    const stages = parseInt(newWellStages, 10) || 40;
    const newWell: WellConfig = {
      id: 'w-' + Date.now(),
      name: newWellName.trim(),
      customerName: newWellCustomer.trim() || customerName.trim() || undefined,
      plannedStages: stages,
      perStageDesignOverrides: {},
    };
    setWells([...wells, newWell]);
    setNewWellName('');
    setNewWellCustomer('');
  };

  const handleRemoveWell = (id: string) => {
    setWells(wells.filter((w) => w.id !== id));
  };

  const handleWellOverrideChange = (wellId: string, sandTypeId: string, valStr: string) => {
    setWells(
      wells.map((w) => {
        if (w.id !== wellId) return w;
        const overrides = { ...(w.perStageDesignOverrides || {}) };
        if (valStr.trim() === '') {
          delete overrides[sandTypeId];
        } else {
          const num = parseInt(valStr, 10);
          if (!isNaN(num)) {
            overrides[sandTypeId] = num;
          }
        }
        return { ...w, perStageDesignOverrides: overrides };
      })
    );
  };

  // Sand Type Handlers
  const handleAddSandType = () => {
    if (!newSandName.trim()) return;
    const design = parseInt(newSandDesign, 10) || 150000;
    const jobDesign = parseInt(newSandJobDesign, 10) || design * 87;
    const newSt: SandTypeSpec = {
      id: 'st-' + Date.now(),
      name: newSandName.trim(),
      perStageDesignLbs: design,
      jobDesignTotalLbs: jobDesign,
      colorCategory: 'orange',
    };
    setSandTypes([...sandTypes, newSt]);
    setNewSandName('');
  };

  const handleRemoveSandType = (id: string) => {
    setSandTypes(sandTypes.filter((st) => st.id !== id));
  };

  const handleUpdateSandType = (id: string, updates: Partial<SandTypeSpec>) => {
    setSandTypes(sandTypes.map((st) => (st.id === id ? { ...st, ...updates } : st)));
  };

  // Supplier Handlers
  const handleAddSupplier = () => {
    if (!newSupplierName.trim()) return;
    const name = newSupplierName.trim();
    if (!suppliers.includes(name)) {
      setSuppliers([...suppliers, name]);
    }
    setNewSupplierName('');
  };

  const handleRemoveSupplier = (name: string) => {
    setSuppliers(suppliers.filter((s) => s !== name));
  };

  // Product Code Mapping Handlers
  const handleAddProductCodeMapping = () => {
    if (!newMineCode.trim()) return;
    const cleanCode = newMineCode.trim().toUpperCase();
    const existingIdx = productCodeMappings.findIndex(
      (m) => m.mineCode.trim().toUpperCase() === cleanCode
    );
    if (existingIdx >= 0) {
      const updated = [...productCodeMappings];
      updated[existingIdx] = { mineCode: cleanCode, sandType: newMappingSandType };
      setProductCodeMappings(updated);
    } else {
      setProductCodeMappings([
        ...productCodeMappings,
        { mineCode: cleanCode, sandType: newMappingSandType },
      ]);
    }
    setNewMineCode('');
  };

  const handleRemoveProductCodeMapping = (mineCode: string) => {
    setProductCodeMappings(
      productCodeMappings.filter((m) => m.mineCode.toLowerCase() !== mineCode.toLowerCase())
    );
  };

  const handleReorderSandType = (index: number, direction: 'up' | 'down') => {
    const newArr = [...sandTypes];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newArr.length) return;
    const temp = newArr[index];
    newArr[index] = newArr[targetIdx];
    newArr[targetIdx] = temp;
    setSandTypes(newArr);
  };

  const handleCreatePadSubmit = async () => {
    if (!newPadNameInput.trim()) return;
    try {
      const createdId = await createNewPad(newPadNameInput.trim());
      setIsCreatingPad(false);
      setNewPadNameInput('');
      onSelectPad(createdId);
      if (onSuccessMessage) {
        onSuccessMessage(`Created new well pad: "${newPadNameInput.trim()}"`);
      }
    } catch (err) {
      console.error('Failed to create new pad:', err);
    }
  };

  // Save Config
  const handleSaveAll = () => {
    const updatedConfig: PadConfig = {
      customerName: customerName.trim(),
      padName,
      siloCount,
      lbsPerTruckload,
      lbsPerTon,
      drawStrategy,
      partialThresholdPct,
      reorderThresholdStages,
      suppliers,
      wells,
      sandTypes,
      silos,
      productCodeMappings,
    };

    onUpdateConfig(updatedConfig);
    if (onSuccessMessage) {
      onSuccessMessage('Pad Setup Configuration updated successfully!');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Top Banner & Multi-Pad Switcher (Section B) */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 text-[#e8ebe6] shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#d4a017] text-[#0b0c0e] p-3 rounded-lg font-black">
            <Settings className="w-8 h-8 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold uppercase tracking-wide font-display">PAD SETUP</h2>
            <p className="text-xs text-[#9aa3ad] font-medium">
              Configure pad identity, wells, sand specifications, and silo layout.
            </p>
          </div>
        </div>

        {/* Multi-Pad Selector & Create Pad */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsRecoveryOpen(true)}
            className="bg-[#d4a017] hover:bg-[#d4a017] active:bg-[#d4a017] text-[#0b0c0e] font-black px-4 py-3 rounded-lg text-xs flex items-center gap-1.5 shrink-0 shadow-lg border border-[#d4a017] uppercase tracking-wider transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4 stroke-[2.5]" /> RESTORE / RECOVER WELLS
          </button>

          <select
            value={currentPadId}
            onChange={(e) => onSelectPad(e.target.value)}
            className="bg-[#0b0c0e] border border-[#d4a017]/80 text-[#d4a017] rounded-lg px-4 py-3 text-sm font-black focus:outline-none"
          >
            {padList.map((p) => (
              <option key={p.id} value={p.id}>
                Pad: {p.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setIsCreatingPad(true)}
            className="bg-[#1b2027] hover:bg-[#2a313b] text-[#d4a017] border border-[#2a313b] font-bold px-4 py-3 rounded-lg text-xs flex items-center gap-1.5 shrink-0"
          >
            <FolderPlus className="w-4 h-4" /> NEW PAD
          </button>
        </div>
      </div>

      {/* New Pad Modal */}
      {isCreatingPad && (
        <div className="fixed inset-0 bg-[#0b0c0e]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#14171c] border border-[#2a313b] rounded-lg max-w-md w-full p-6 text-[#e8ebe6] shadow-2xl">
            <h3 className="text-xl font-black uppercase text-[#d4a017] mb-1">
              CREATE NEW WELL PAD
            </h3>
            <p className="text-xs text-[#9aa3ad] mb-4">
              Enter a name for the new well pad location.
            </p>

            <input
              type="text"
              placeholder="e.g. Eagle Ford Unit Pad 2"
              value={newPadNameInput}
              onChange={(e) => setNewPadNameInput(e.target.value)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3.5 text-base font-black text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none mb-6"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreatingPad(false)}
                className="bg-[#1b2027] hover:bg-[#2a313b] text-[#e8ebe6] font-bold px-4 py-2.5 rounded-xl text-xs"
              >
                CANCEL
              </button>

              <button
                type="button"
                onClick={handleCreatePadSubmit}
                className="bg-[#d4a017] hover:bg-[#d4a017] text-[#0b0c0e] font-black px-6 py-2.5 rounded-xl text-xs"
              >
                CREATE & SWITCH
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Jobs / Well Pads Manager */}
      <JobManagement
        currentPadId={currentPadId}
        currentState={state}
        onSelectPad={onSelectPad}
        onPadListUpdated={onRefreshPadList}
        onSuccessMessage={onSuccessMessage}
      />

      {/* 1. General Pad Config & Draw Strategy */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 text-[#e8ebe6] shadow-2xl space-y-5">
        <h3 className="text-lg font-black uppercase text-[#d4a017] border-b border-[#2a313b] pb-2">
          1. PAD IDENTITY & DRAW STRATEGY
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-black uppercase text-[#d4a017] mb-2">
              CUSTOMER NAME / OPERATOR
            </label>
            <input
              type="text"
              placeholder="e.g. Diamondback Energy"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3.5 text-lg font-black text-[#d4a017] focus:border-[#d4a017] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-[#9aa3ad] mb-2">WELL PAD NAME</label>
            <input
              type="text"
              value={padName}
              onChange={(e) => setPadName(e.target.value)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3.5 text-lg font-black text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-[#9aa3ad] mb-2">
              SILO DRAW STRATEGY
            </label>
            <select
              value={drawStrategy}
              onChange={(e) => setDrawStrategy(e.target.value as DrawStrategy)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3.5 text-base font-black text-[#d4a017] focus:border-[#d4a017] focus:outline-none"
            >
              <option value="sequential_rotation">Sequential carousel (Finish partials → 1-6 rotation) (Default)</option>
              <option value="partials_then_rotate">Finish partials, then rotate (Least run-to-date)</option>
              <option value="least_used_first">Least used first (rotation)</option>
              <option value="emptiest_first">Emptiest silos first</option>
              <option value="fullest_first">Fullest silos first</option>
            </select>
            <p className="text-xs text-[#9aa3ad] mt-2 font-medium">
              {drawStrategy === 'sequential_rotation' &&
                'Finish open partials first (silo left partially drained from preceding stage). Then rotate through remaining silos sequentially in ascending numerical order (1 → 2 → 3 → 4 → 5 → 6 → 1).'}
              {drawStrategy === 'partials_then_rotate' &&
                'Finish open partials first (< threshold % full, emptiest first). Next, rotate through silos not pulled from in the previous stage (least run-to-date first). Finally, fall back to silos used last stage if additional sand is needed.'}
              {drawStrategy === 'least_used_first' &&
                'Rank by total lbs already run out of each silo (ascending). Entering delivery tickets never reshuffles the run order.'}
              {drawStrategy === 'emptiest_first' &&
                'Silos with the least sand currently on hand are pulled first to empty them out.'}
              {drawStrategy === 'fullest_first' &&
                'Silos with the most sand currently on hand are pulled first to maximize available headspace.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2">
          <div>
            <label className="block text-xs font-black uppercase text-[#9aa3ad] mb-2">SILO COUNT</label>
            <input
              type="number"
              value={siloCount}
              onChange={(e) => handleSiloCountChange(parseInt(e.target.value, 10) || 6)}
              min={1}
              max={12}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3 text-lg font-black text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-[#9aa3ad] mb-2">LBS PER TRUCKLOAD</label>
            <input
              type="number"
              value={lbsPerTruckload}
              onChange={(e) => setLbsPerTruckload(parseInt(e.target.value, 10) || 57000)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3 text-lg font-black text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-[#9aa3ad] mb-2">LBS PER TON</label>
            <input
              type="number"
              value={lbsPerTon}
              onChange={(e) => setLbsPerTon(parseInt(e.target.value, 10) || 2000)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3 text-lg font-black text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
            />
          </div>

          {/* Reorder Threshold in Stages (Section C #4) */}
          <div>
            <label className="block text-xs font-black uppercase text-[#9aa3ad] mb-2">
              REORDER ALERT THRESHOLD (STAGES)
            </label>
            <input
              type="number"
              value={reorderThresholdStages}
              onChange={(e) => setReorderThresholdStages(parseInt(e.target.value, 10) || 5)}
              className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3 text-lg font-black text-[#d4a017] focus:border-[#d4a017] focus:outline-none"
            />
          </div>

          {/* Silo counts as PARTIAL below this % full */}
          <div>
            <label className="block text-xs font-black uppercase text-[#9aa3ad] mb-2">
              SILO COUNTS AS PARTIAL BELOW THIS % FULL
            </label>
            <div className="relative">
              <input
                type="number"
                min={10}
                max={99}
                value={Math.round(partialThresholdPct * 100)}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setPartialThresholdPct((isNaN(val) ? 75 : val) / 100);
                }}
                className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3 text-lg font-black text-[#d4a017] focus:border-[#d4a017] focus:outline-none pr-8"
              />
              <span className="absolute right-3.5 top-3.5 text-sm font-black text-[#9aa3ad]">%</span>
            </div>
          </div>
        </div>

        {totalOrphanedCount > 0 && (
          <div className="bg-[#260e0c]/80 border border-[#c23b32] rounded-lg p-4 text-[#e8ebe6] text-xs space-y-1 mt-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#e25a4a] shrink-0 mt-0.5 animate-pulse" />
            <div>
              <div className="font-black text-[#e25a4a] uppercase tracking-wide">
                WARNING: {totalOrphanedCount} EXISTING {totalOrphanedCount === 1 ? 'RECORD IS' : 'RECORDS ARE'} LOGGED TO REMOVED SILOS
              </div>
              <p className="text-[#e25a4a] font-medium">
                Lowering silo count leaves {orphanedDeliveries.length} ticket(s) and {orphanedRuns.length} stage run(s) unassigned.
                These records remain in Firestore and will be shown in the red <strong>UNASSIGNED</strong> column on the Logs screen.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Wells Config */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 text-[#e8ebe6] shadow-2xl space-y-4">
        <h3 className="text-lg font-black uppercase text-[#d4a017] border-b border-[#2a313b] pb-2">
          2. WELLS, PLANNED STAGES & PER-STAGE DESIGN OVERRIDES
        </h3>

        <div className="space-y-3">
          {wells.map((well) => (
            <div key={well.id} className="bg-[#0b0c0e] p-4 rounded-lg border border-[#2a313b] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#14171c] pb-2">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-[#9aa3ad] font-bold uppercase block mb-1">Well Name:</label>
                    <input
                      type="text"
                      value={well.name}
                      onChange={(e) => {
                        setWells(
                          wells.map((w) => (w.id === well.id ? { ...w, name: e.target.value } : w))
                        );
                      }}
                      className="w-full bg-[#14171c] border border-[#2a313b] rounded-lg px-2.5 py-1.5 text-sm font-bold text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#d4a017] font-bold uppercase block mb-1">Customer Name:</label>
                    <input
                      type="text"
                      placeholder="e.g. Diamondback Energy"
                      value={well.customerName ?? customerName ?? ''}
                      onChange={(e) => {
                        setWells(
                          wells.map((w) => (w.id === well.id ? { ...w, customerName: e.target.value } : w))
                        );
                      }}
                      className="w-full bg-[#14171c] border border-[#2a313b] rounded-lg px-2.5 py-1.5 text-sm font-bold text-[#d4a017] focus:border-[#d4a017] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#9aa3ad] font-bold uppercase block mb-1">Planned Stages:</label>
                    <input
                      type="number"
                      value={well.plannedStages || 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 0;
                        setWells(
                          wells.map((w) => (w.id === well.id ? { ...w, plannedStages: val } : w))
                        );
                      }}
                      className="w-full bg-[#14171c] border border-[#2a313b] rounded-lg px-2.5 py-1.5 text-sm font-bold text-[#d4a017] focus:border-[#d4a017] focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveWell(well.id)}
                  className="text-[#e25a4a] hover:text-[#e25a4a] p-1.5 rounded-xl hover:bg-[#260e0c]/50 transition shrink-0 self-end sm:self-center"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              {/* Per-Stage Design Overrides for each Sand Type */}
              <div className="pt-1">
                <div className="text-[11px] font-black uppercase text-[#9aa3ad] mb-1.5">
                  Optional Per-Stage Design Overrides (lbs) — <span className="text-[#9aa3ad] font-normal">Leave blank to use pad default</span>:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {sandTypes.map((st) => {
                    const overrideVal =
                      well.perStageDesignOverrides?.[st.id] ??
                      well.perStageDesignOverrides?.[st.name] ??
                      '';
                    return (
                      <div key={st.id} className="bg-[#14171c]/80 p-2.5 rounded-xl border border-[#2a313b]">
                        <label className="block text-[10px] font-bold text-[#d4a017] uppercase truncate">
                          {st.name} <span className="text-[#9aa3ad] font-normal">(Default: {st.perStageDesignLbs.toLocaleString()} lbs)</span>
                        </label>
                        <input
                          type="number"
                          placeholder={`Default: ${st.perStageDesignLbs}`}
                          value={overrideVal}
                          onChange={(e) => handleWellOverrideChange(well.id, st.id, e.target.value)}
                          className="w-full mt-1 bg-[#0b0c0e] border border-[#2a313b] rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add Well Form */}
        <div className="bg-[#0b0c0e] p-4 rounded-lg border border-[#2a313b] space-y-2 pt-3">
          <div className="text-xs font-black uppercase text-[#d4a017] tracking-wider">
            ADD NEW WELL TO PAD
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-bold uppercase text-[#e8ebe6] mb-1">
                WELL NAME / IDENTIFIER *
              </label>
              <input
                type="text"
                placeholder="e.g. Well 4H"
                value={newWellName}
                onChange={(e) => setNewWellName(e.target.value)}
                className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-3.5 py-2.5 text-sm text-[#e8ebe6] font-bold focus:border-[#d4a017] focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-bold uppercase text-[#d4a017] mb-1">
                CUSTOMER NAME
              </label>
              <input
                type="text"
                placeholder="e.g. Diamondback Energy"
                value={newWellCustomer}
                onChange={(e) => setNewWellCustomer(e.target.value)}
                className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-3.5 py-2.5 text-sm text-[#d4a017] font-bold focus:border-[#d4a017] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#e8ebe6] mb-1">
                PLANNED STAGES *
              </label>
              <input
                type="number"
                placeholder="e.g. 45"
                value={newWellStages}
                onChange={(e) => setNewWellStages(e.target.value)}
                className="w-full sm:w-28 bg-[#14171c] border border-[#2a313b] rounded-xl px-3 py-2.5 text-sm font-mono text-[#d4a017] font-bold focus:border-[#d4a017] focus:outline-none"
              />
            </div>
            <div className="self-end">
              <button
                type="button"
                onClick={handleAddWell}
                className="w-full sm:w-auto bg-[#d4a017] hover:bg-[#d4a017] active:bg-[#d4a017] text-[#0b0c0e] font-black px-5 py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-1.5 shrink-0 transition"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" /> ADD WELL
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Sand Types & Run Order Config */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 text-[#e8ebe6] shadow-2xl space-y-5">
        <div className="border-b border-[#2a313b] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-black uppercase text-[#d4a017] tracking-tight">
              3. SAND TYPES, PER-STAGE DESIGN & WHOLE-JOB DESIGN TOTALS
            </h3>
            <p className="text-xs text-[#9aa3ad] font-semibold mt-0.5">
              Specify sand mesh names, per-stage target weights, and overall job frac design figures.
            </p>
          </div>
          <span className="text-xs text-[#d4a017]/90 font-mono font-bold bg-[#d4a017]/10 px-3 py-1 rounded-xl border border-[#d4a017]/20 shrink-0">
            List order = Stage run order
          </span>
        </div>

        {/* List of Configured Sand Types */}
        <div className="space-y-4">
          {sandTypes.map((st, idx) => {
            const perStageTons = ((st.perStageDesignLbs || 0) / lbsPerTon).toFixed(1);
            const jobTotalTons = ((st.jobDesignTotalLbs || 0) / lbsPerTon).toFixed(1);

            return (
              <div key={st.id} className="bg-[#0b0c0e] p-4 rounded-lg border border-[#2a313b] space-y-4 shadow-lg">
                {/* Top Row: Priority Order, Sand Name Label & Input, Action Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2a313b]/80 pb-3">
                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-black uppercase text-[#9aa3ad] mb-0.5">ORDER</span>
                      <span className="w-8 h-8 bg-[#d4a017] text-[#0b0c0e] rounded-xl font-black text-sm flex items-center justify-center shadow-md">
                        #{idx + 1}
                      </span>
                    </div>

                    <div className="flex-1">
                      <label className="block text-xs font-black uppercase text-[#d4a017] tracking-wider mb-1">
                        SAND MESH / TYPE NAME *
                      </label>
                      <input
                        type="text"
                        value={st.name}
                        onChange={(e) => handleUpdateSandType(st.id, { name: e.target.value })}
                        className="w-full sm:w-64 bg-[#14171c] border border-[#2a313b] text-[#e8ebe6] text-base font-black px-3.5 py-1.5 rounded-xl focus:border-[#d4a017] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Reorder and Delete Controls */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleReorderSandType(idx, 'up')}
                      disabled={idx === 0}
                      className="bg-[#1b2027] hover:bg-[#2a313b] disabled:opacity-30 text-[#e8ebe6] px-3 py-1.5 rounded-xl text-xs font-black border border-[#2a313b] transition"
                    >
                      ▲ UP
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorderSandType(idx, 'down')}
                      disabled={idx === sandTypes.length - 1}
                      className="bg-[#1b2027] hover:bg-[#2a313b] disabled:opacity-30 text-[#e8ebe6] px-3 py-1.5 rounded-xl text-xs font-black border border-[#2a313b] transition"
                    >
                      ▼ DOWN
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSandType(st.id)}
                      className="text-[#e25a4a] hover:text-[#e25a4a] p-2 rounded-xl hover:bg-[#260e0c]/50 transition border border-transparent hover:border-[#c23b32]"
                      title="Delete Sand Type"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Bottom Row: Per-Stage Design Lbs & Whole-Job Design Lbs Input Boxes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Per-Stage Design Input Box */}
                  <div className="bg-[#14171c]/90 p-3 rounded-xl border border-[#2a313b]">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-black uppercase text-[#d4a017] tracking-wide">
                        PER-STAGE DESIGN (LBS)
                      </label>
                      <span className="text-[11px] font-mono font-bold text-[#9aa3ad] bg-[#0b0c0e] px-2 py-0.5 rounded border border-[#2a313b]">
                        {perStageTons} Tons / stage
                      </span>
                    </div>
                    <input
                      type="number"
                      value={st.perStageDesignLbs || 0}
                      onChange={(e) =>
                        handleUpdateSandType(st.id, {
                          perStageDesignLbs: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-2.5 text-base font-mono font-black text-[#d4a017] focus:border-[#d4a017] focus:outline-none"
                    />
                    <p className="text-[10px] text-[#9aa3ad] font-medium mt-1">
                      Standard default weight per single frac stage for {st.name}.
                    </p>
                  </div>

                  {/* Whole-Job Frac Design Input Box */}
                  <div className="bg-[#14171c]/90 p-3 rounded-xl border border-[#2a313b]">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-black uppercase text-[#8fa37a] tracking-wide">
                        WHOLE-JOB FRAC DESIGN (LBS)
                      </label>
                      <span className="text-[11px] font-mono font-bold text-[#9aa3ad] bg-[#0b0c0e] px-2 py-0.5 rounded border border-[#2a313b]">
                        {jobTotalTons} Total Tons
                      </span>
                    </div>
                    <input
                      type="number"
                      value={st.jobDesignTotalLbs || 0}
                      onChange={(e) =>
                        handleUpdateSandType(st.id, {
                          jobDesignTotalLbs: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full bg-[#0b0c0e] border border-[#2a313b] rounded-xl p-2.5 text-base font-mono font-black text-[#8fa37a] focus:border-[#d4a017] focus:outline-none"
                    />
                    <p className="text-[10px] text-[#9aa3ad] font-medium mt-1">
                      Total volume specified in frac job proposal for entire pad.
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add New Sand Type Section with Clear Input Labels */}
        <div className="bg-[#0b0c0e] p-4 rounded-lg border border-[#2a313b] space-y-3 pt-4">
          <div className="text-xs font-black uppercase text-[#d4a017] tracking-wider">
            ADD NEW SAND TYPE TO SPECIFICATION
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#e8ebe6] mb-1">
                SAND NAME / MESH *
              </label>
              <input
                type="text"
                placeholder="e.g. 30/50, Resin Coated"
                value={newSandName}
                onChange={(e) => setNewSandName(e.target.value)}
                className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-3.5 py-2.5 text-sm text-[#e8ebe6] font-bold focus:border-[#d4a017] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-[#d4a017] mb-1">
                PER-STAGE DESIGN (LBS)
              </label>
              <input
                type="number"
                placeholder="e.g. 150000"
                value={newSandDesign}
                onChange={(e) => setNewSandDesign(e.target.value)}
                className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-3.5 py-2.5 text-sm font-mono text-[#d4a017] font-bold focus:border-[#d4a017] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-[#8fa37a] mb-1">
                WHOLE-JOB DESIGN TOTAL (LBS)
              </label>
              <input
                type="number"
                placeholder="e.g. 13050000"
                value={newSandJobDesign}
                onChange={(e) => setNewSandJobDesign(e.target.value)}
                className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-3.5 py-2.5 text-sm font-mono text-[#8fa37a] font-bold focus:border-[#d4a017] focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleAddSandType}
              className="bg-[#d4a017] hover:bg-[#d4a017] active:bg-[#d4a017] text-[#0b0c0e] font-black px-6 py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-1.5 shrink-0 transition"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" /> ADD SAND TYPE
            </button>
          </div>
        </div>
      </div>

      {/* 4. Silos Config (Section C #1, #2, #3) */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 text-[#e8ebe6] shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#2a313b] pb-3">
          <div>
            <h3 className="text-lg font-black uppercase text-[#d4a017]">
              4. SILOS, CAPACITY, SIDES & STARTING BALANCES
            </h3>
            <p className="text-xs text-[#9aa3ad] font-medium mt-0.5">
              Customize silo names, sides, maximum capacities, starting inventory balances, and sand type assignments.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddSilo}
            className="bg-[#d4a017] hover:bg-[#d4a017] active:bg-[#d4a017] text-[#0b0c0e] font-black px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shrink-0 transition"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" /> ADD NEW SILO
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {silos.map((s) => {
            const startTons = ((s.startingBalanceLbs || 0) / (lbsPerTon || 2000)).toFixed(1);
            const maxTons = ((s.maxCapacityLbs || 350000) / (lbsPerTon || 2000)).toFixed(1);

            return (
              <div key={s.siloNumber} className="bg-[#0b0c0e] p-4 rounded-lg border border-[#2a313b] space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-[#2a313b]/80">
                  <div className="font-black text-[#d4a017] text-sm flex items-center gap-1.5">
                    <span>SILO #{s.siloNumber}</span>
                    {s.name && s.name !== `Silo ${s.siloNumber}` && (
                      <span className="text-xs text-[#9aa3ad] font-medium">({s.name})</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = silos.map((item) =>
                          item.siloNumber === s.siloNumber
                            ? { ...item, isOutOfService: !item.isOutOfService }
                            : item
                        );
                        setSilos(updated);
                      }}
                      className={`px-2 py-1 rounded text-[10px] font-black uppercase flex items-center gap-1 transition ${
                        s.isOutOfService ? 'bg-[#c23b32] text-[#e8ebe6]' : 'bg-[#1b2027] text-[#e8ebe6]'
                      }`}
                    >
                      <Wrench className="w-3 h-3" />
                      {s.isOutOfService ? 'OFFLINE' : 'ONLINE'}
                    </button>

                    {silos.length > 1 && (
                      <button
                        type="button"
                        title="Delete Silo"
                        onClick={() => handleDeleteSilo(s.siloNumber)}
                        className="p-1 rounded bg-[#14171c] hover:bg-[#260e0c] text-[#9aa3ad] hover:text-[#e25a4a] transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Silo Name / Identifier Edit Input */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#d4a017] mb-1">
                    SILO NAME / IDENTIFIER
                  </label>
                  <input
                    type="text"
                    placeholder={`e.g. Silo ${s.siloNumber} or Silo 1A`}
                    value={s.name ?? `Silo ${s.siloNumber}`}
                    onChange={(e) => {
                      const updated = silos.map((item) =>
                        item.siloNumber === s.siloNumber
                          ? { ...item, name: e.target.value }
                          : item
                      );
                      setSilos(updated);
                    }}
                    className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-3 py-2 text-xs font-bold text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
                  />
                </div>

                {/* Side & Assigned Sand Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#e8ebe6] mb-1">
                      SIDE / LOCATION
                    </label>
                    <input
                      type="text"
                      list={`side-presets-${s.siloNumber}`}
                      placeholder="e.g. A, B, East, West"
                      value={s.side || ''}
                      onChange={(e) => {
                        const updated = silos.map((item) =>
                          item.siloNumber === s.siloNumber
                            ? { ...item, side: e.target.value }
                            : item
                        );
                        setSilos(updated);
                      }}
                      className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-3 py-2 text-xs font-bold text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
                    />
                    <datalist id={`side-presets-${s.siloNumber}`}>
                      <option value="A">Side A</option>
                      <option value="B">Side B</option>
                      <option value="Side A">Side A</option>
                      <option value="Side B">Side B</option>
                      <option value="East">East Side</option>
                      <option value="West">West Side</option>
                      <option value="North">North Row</option>
                      <option value="South">South Row</option>
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#e8ebe6] mb-1">
                      ASSIGNED SAND
                    </label>
                    <select
                      value={s.sandType || ''}
                      onChange={(e) => {
                        const updated = silos.map((item) =>
                          item.siloNumber === s.siloNumber
                            ? { ...item, sandType: e.target.value || null }
                            : item
                        );
                        setSilos(updated);
                      }}
                      className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-2.5 py-2 text-xs font-bold text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
                    >
                      {sandTypes.map((st) => (
                        <option key={st.id} value={st.name}>
                          {st.name}
                        </option>
                      ))}
                      <option value="">(None / Empty)</option>
                    </select>
                  </div>
                </div>

                {/* Starting Balance & Max Capacity Inputs */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-[#9aa3ad] uppercase">
                        STARTING BAL. (LBS)
                      </label>
                      <span className="text-[10px] font-mono font-bold text-[#d4a017]">
                        {startTons} T
                      </span>
                    </div>
                    <input
                      type="number"
                      value={s.startingBalanceLbs || 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 0;
                        const updated = silos.map((item) =>
                          item.siloNumber === s.siloNumber
                            ? { ...item, startingBalanceLbs: val }
                            : item
                        );
                        setSilos(updated);
                      }}
                      className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl p-2 text-xs font-bold font-mono text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-[#9aa3ad] uppercase">
                        MAX CAPACITY (LBS)
                      </label>
                      <span className="text-[10px] font-mono font-bold text-[#d4a017]">
                        {maxTons} T
                      </span>
                    </div>
                    <input
                      type="number"
                      value={s.maxCapacityLbs || 350000}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 350000;
                        const updated = silos.map((item) =>
                          item.siloNumber === s.siloNumber
                            ? { ...item, maxCapacityLbs: val }
                            : item
                        );
                        setSilos(updated);
                      }}
                      className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl p-2 text-xs font-bold font-mono text-[#e8ebe6] focus:border-[#d4a017] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Sand Suppliers List */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 text-[#e8ebe6] shadow-2xl space-y-4">
        <h3 className="text-lg font-black uppercase text-[#d4a017] border-b border-[#2a313b] pb-2">
          5. SAVED SAND SUPPLIERS
        </h3>
        <p className="text-xs text-[#9aa3ad]">
          Suppliers configured here feed the supplier selection dropdown when logging deliveries.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {suppliers.map((sup) => (
            <div
              key={sup}
              className="bg-[#0b0c0e] border border-[#2a313b] rounded-xl px-3 py-1.5 flex items-center gap-2 font-bold text-xs text-[#e8ebe6]"
            >
              <span>{sup}</span>
              <button
                type="button"
                onClick={() => handleRemoveSupplier(sup)}
                className="text-[#e25a4a] hover:text-[#e25a4a] p-0.5 rounded hover:bg-[#260e0c]/60"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {suppliers.length === 0 && (
            <div className="w-full bg-[#0b0c0e] border-2 border-dashed border-[#2a313b] rounded-lg p-4 text-center space-y-1 my-1">
              <div className="text-xs font-black text-[#d4a017] uppercase tracking-wide">
                No sand suppliers set up yet
              </div>
              <div className="text-xs text-[#9aa3ad]">
                Add supplier or hauler names below (e.g. Atlas Sand, Badger Mining, U.S. Silica) so they populate the supplier selection dropdown when logging delivery tickets.
              </div>
            </div>
          )}
        </div>

        {/* Add Supplier Form */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <input
            type="text"
            placeholder="New Supplier Name (e.g. Atlas Sand, Badger Mining)"
            value={newSupplierName}
            onChange={(e) => setNewSupplierName(e.target.value)}
            className="flex-1 bg-[#0b0c0e] border border-[#2a313b] rounded-xl px-3.5 py-2.5 text-sm text-[#e8ebe6] font-bold"
          />
          <button
            type="button"
            onClick={handleAddSupplier}
            className="bg-[#1b2027] hover:bg-[#2a313b] text-[#d4a017] font-bold px-4 py-2.5 rounded-xl border border-[#2a313b] flex items-center justify-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" /> ADD SUPPLIER
          </button>
        </div>
      </div>

      {/* 6. Product Code Mapping Table (Mine Code -> Sand Type) */}
      <div className="bg-[#14171c] border border-[#2a313b] rounded-xl p-6 text-[#e8ebe6] shadow-2xl space-y-4">
        <div className="border-b border-[#2a313b] pb-2 flex items-center justify-between">
          <h3 className="text-lg font-black uppercase text-[#d4a017] flex items-center gap-2">
            <Tag className="w-5 h-5" /> 6. PRODUCT CODE MAPPINGS (MINE CODE ➔ SAND TYPE)
          </h3>
        </div>
        <p className="text-xs text-[#9aa3ad] leading-relaxed">
          When scanning tickets (such as Atlas 6-part QR codes), field [4] contains a mine product code like <code className="text-[#d4a017] font-bold">100M</code>.
          Map mine product codes directly to your pad's sand types so scanning fills the sand type automatically.
        </p>

        {/* List of Mappings */}
        <div className="space-y-2 pt-1">
          {productCodeMappings.map((m) => (
            <div
              key={m.mineCode}
              className="bg-[#0b0c0e] border border-[#2a313b] p-3 rounded-lg flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-black text-[#d4a017] bg-[#14171c] px-3 py-1 rounded-xl border border-[#2a313b] text-sm">
                  {m.mineCode}
                </span>
                <ArrowRight className="w-4 h-4 text-[#9aa3ad] shrink-0" />
                <span className="font-black text-[#e8ebe6] text-sm">{m.sandType}</span>
              </div>

              <button
                type="button"
                onClick={() => handleRemoveProductCodeMapping(m.mineCode)}
                className="text-[#e25a4a] hover:text-[#e25a4a] p-1.5 rounded-xl hover:bg-[#260e0c]/50 transition"
                title="Remove Mapping"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {productCodeMappings.length === 0 && (
            <div className="text-[#9aa3ad] text-xs italic py-2">
              No product code mappings defined. Add one below!
            </div>
          )}
        </div>

        {/* Add Product Code Mapping Form */}
        <div className="bg-[#0b0c0e] p-4 rounded-lg border border-[#2a313b] space-y-3 pt-3">
          <div className="text-xs font-black uppercase text-[#d4a017] tracking-wider">
            ADD NEW MINE CODE MAPPING
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-bold uppercase text-[#e8ebe6] mb-1">
                MINE PRODUCT CODE *
              </label>
              <input
                type="text"
                placeholder="e.g. 100M, 4070, RC-100"
                value={newMineCode}
                onChange={(e) => setNewMineCode(e.target.value)}
                className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-3.5 py-2.5 text-sm font-mono text-[#d4a017] font-bold focus:border-[#d4a017] focus:outline-none"
              />
            </div>

            <div className="flex-1">
              <label className="block text-[11px] font-bold uppercase text-[#e8ebe6] mb-1">
                OUR SAND TYPE *
              </label>
              <select
                value={newMappingSandType}
                onChange={(e) => setNewMappingSandType(e.target.value)}
                className="w-full bg-[#14171c] border border-[#2a313b] rounded-xl px-3.5 py-2.5 text-sm text-[#e8ebe6] font-bold focus:border-[#d4a017] focus:outline-none"
              >
                {sandTypes.map((st) => (
                  <option key={st.id} value={st.name}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="self-end">
              <button
                type="button"
                onClick={handleAddProductCodeMapping}
                className="w-full sm:w-auto bg-[#d4a017] hover:bg-[#d4a017] active:bg-[#d4a017] text-[#0b0c0e] font-black px-5 py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-1.5 shrink-0 transition"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" /> ADD PAIRING
              </button>
            </div>
          </div>
        </div>
      </div>

      {totalOrphanedCount > 0 && (
        <div className="bg-[#260e0c]/90 border border-[#c23b32] rounded-xl p-5 text-[#e8ebe6] shadow-2xl flex items-start gap-4 text-left">
          <AlertTriangle className="w-7 h-7 text-[#e25a4a] shrink-0 mt-0.5 animate-pulse" />
          <div className="space-y-1">
            <h4 className="text-base font-black text-[#e25a4a] uppercase tracking-wide">
              NOTICE: {totalOrphanedCount} EXISTING {totalOrphanedCount === 1 ? 'RECORD' : 'RECORDS'} WILL BE UNASSIGNED
            </h4>
            <p className="text-xs text-[#e25a4a] font-medium">
              Saving this configuration will leave {orphanedDeliveries.length} ticket(s) and {orphanedRuns.length} stage run(s) mapped to silos not in your new setup.
              These records are safely stored in Firestore and will be prominently displayed in the red <strong>UNASSIGNED</strong> column in the Logs view for reassignment.
            </p>
          </div>
        </div>
      )}

      <div className="pt-4 text-center">
        <button
          type="button"
          onClick={handleSaveAll}
          className="bg-[#d4a017] hover:bg-[#d4a017] text-[#0b0c0e] font-black text-xl py-4 px-10 rounded-lg shadow-2xl border border-[#d4a017] transition active:scale-95"
        >
          SAVE ALL SETUP CHANGES
        </button>
      </div>

      {state && (
        <div className="pt-8 border-t-2 border-[#2a313b]">
          <JobExport state={state} onSuccessMessage={onSuccessMessage} />
        </div>
      )}

      {/* Recovery Modal */}
      {state && (
        <PadRecoveryModal
          isOpen={isRecoveryOpen}
          onClose={() => setIsRecoveryOpen(false)}
          state={state}
          onSelectPad={onSelectPad}
        />
      )}
    </div>
  );
}
