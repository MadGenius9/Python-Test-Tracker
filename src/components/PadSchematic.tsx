import { getSiloDerivedStates } from '../lib/sandRules';
import { AppState } from '../types';
import HopperField from './HopperField';

interface PadSchematicProps {
  state: AppState;
  selectedSilo?: number | null;
  onSelectSilo?: (siloNumber: number) => void;
  compact?: boolean;
}

export default function PadSchematic({ state, selectedSilo, onSelectSilo }: PadSchematicProps) {
  const derived = getSiloDerivedStates(state);
  const sideNames = Array.from(new Set(derived.map((s) => (s.side || 'A').trim())));
  const sides = sideNames.map((sideName) => ({
    sideName,
    silos: derived.filter((s) => (s.side || 'A').trim() === sideName),
  }));

  return (
    <div className="min-w-0">
      <HopperField
        sides={sides}
        selectedSilo={selectedSilo}
        onSelect={onSelectSilo}
      />
    </div>
  );
}
