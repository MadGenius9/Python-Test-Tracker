import { getPadSummary, getSiloDerivedStates } from '../lib/sandRules';
import { AppState } from '../types';

interface PadSchematicProps {
  state: AppState;
  selectedSilo?: number | null;
  onSelectSilo?: (siloNumber: number) => void;
  compact?: boolean;
}

export default function PadSchematic({ state, selectedSilo, onSelectSilo, compact }: PadSchematicProps) {
  const summary = getPadSummary(state);
  const silos = getSiloDerivedStates(state, summary.activeWellId, summary.nextStageNumber);
  const sides = Array.from(new Set(silos.map((s) => (s.side || 'A').trim())));

  return (
    <div
      className="bg-[#101318] border border-[#2a313b] rounded-xl p-4 min-w-0"
      style={{
        backgroundImage:
          'linear-gradient(rgba(42,49,59,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(42,49,59,0.35) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-[#d4a017]">
            {summary.padName} pad map
          </div>
          <div className="text-xs text-[#9aa3ad] mt-1">
            {summary.nextWellName} · Stage {summary.nextStageNumber}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono uppercase text-[#9aa3ad]">On hand</div>
          <div className="text-sm font-mono text-[#e8ebe6]">{Math.round(summary.totalPadOnHandLbs).toLocaleString()} lbs</div>
        </div>
      </div>
      <div className="space-y-4">
        {sides.map((side) => (
          <div key={side}>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#9aa3ad] mb-2">
              {side.toUpperCase().startsWith('SIDE') ? side.toUpperCase() : `SIDE ${side.toUpperCase()}`}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {silos
                .filter((s) => (s.side || 'A').trim() === side)
                .map((silo) => {
                  const fill = Math.max(0, Math.min(100, silo.percentFull || 0));
                  const sand = (silo.sandType || '').toLowerCase();
                  const fillColor = silo.isOutOfService
                    ? '#2a313b'
                    : sand.includes('100')
                    ? '#d4a017'
                    : sand.includes('40')
                    ? '#5b7c99'
                    : silo.sandType
                    ? '#8fa37a'
                    : '#2a313b';
                  const selected = selectedSilo === silo.siloNumber;
                  return (
                    <button
                      key={silo.siloNumber}
                      type="button"
                      title={`Silo #${silo.siloNumber}: ${Math.round(silo.onHandLbs).toLocaleString()} lbs remaining · ${silo.stagesLeft.toFixed(2)} stages left`}
                      onClick={() => onSelectSilo?.(silo.siloNumber)}
                      className={`group relative shrink-0 rounded-lg px-1.5 py-2 text-center transition ${
                        selected ? 'shadow-[inset_0_0_0_2px_#c23b32] bg-[#1b2027]' : 'hover:bg-[#1b2027]/70'
                      }`}
                    >
                      {/* Hover tooltip showing pounds remaining and stages left */}
                      <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 z-30 opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 bg-[#0b0c0e]/95 backdrop-blur-md border border-[#c23b32]/60 px-2 py-0.5 rounded shadow-2xl text-center whitespace-nowrap min-w-[80px]">
                        <div className="text-[10px] font-mono font-bold text-[#e8ebe6]">
                          {Math.round(silo.onHandLbs).toLocaleString()} lbs
                        </div>
                        <div className="text-[9px] font-mono text-[#d4a017]">
                          {silo.stagesLeft > 99 ? '>99' : silo.stagesLeft.toFixed(1)} stg left
                        </div>
                      </div>

                      <svg viewBox="0 0 120 210" className={compact ? 'mx-auto h-28 w-16' : 'mx-auto h-40 w-20'}>
                        <ellipse cx="60" cy="22" rx="34" ry="10" fill="#1b2027" stroke="#2a313b" />
                        <path d="M26 22 H94 V128 L78 168 H42 L26 128 Z" fill="#14171c" stroke="#2a313b" />
                        <clipPath id={`pad-fill-${silo.siloNumber}`}>
                          <path d="M28 28 H92 V126 L77 164 H43 L28 126 Z" />
                        </clipPath>
                        <g clipPath={`url(#pad-fill-${silo.siloNumber})`}>
                          <rect x="26" y={168 - fill * 1.36} width="68" height="150" fill={fillColor} opacity="0.9" />
                        </g>
                        <path
                          d="M26 22 H94 V128 L78 168 H42 L26 128 Z"
                          fill="none"
                          stroke={selected ? '#c23b32' : '#3a4452'}
                          strokeWidth={selected ? 3 : 1.5}
                        />
                        <path d="M36 168 L30 196 M84 168 L90 196 M30 196 H90" fill="none" stroke="#2a313b" strokeWidth="3" />
                        <text x="60" y="100" textAnchor="middle" fontSize="14" fill="#e8ebe6">
                          {Math.round(fill)}%
                        </text>
                      </svg>
                      <div className="text-[10px] font-mono uppercase text-[#d4a017]">{silo.sandType || 'Empty'}</div>
                      <div className="text-[10px] font-mono text-[#e8ebe6]">{Math.round(silo.onHandLbs).toLocaleString()}</div>
                      <div className="text-[10px] font-mono uppercase text-[#9aa3ad]">Silo {silo.siloNumber}</div>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
