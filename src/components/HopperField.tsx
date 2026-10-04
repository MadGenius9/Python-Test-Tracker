import { SiloDerivedState } from '../types';

interface HopperFieldProps {
  sides: { sideName: string; silos: SiloDerivedState[] }[];
  selectedSilo?: number | null;
  onSelect?: (siloNumber: number) => void;
}

export default function HopperField({ sides, selectedSilo, onSelect }: HopperFieldProps) {
  return (
    <div
      className="relative rounded-xl border border-[#2a313b] bg-[#0c0d10] p-4 sm:p-6 pt-8 sm:pt-9 overflow-x-auto"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at center, rgba(42,49,59,0.35), transparent 70%), linear-gradient(rgba(42,49,59,0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(42,49,59,0.28) 1px, transparent 1px)',
        backgroundSize: 'auto, 32px 32px, 32px 32px',
      }}
    >
      <div className="space-y-8">
        {sides.map(({ sideName, silos }) => (
          <div key={sideName} className="flex items-center gap-3">
            <div className="w-14 shrink-0 text-[11px] font-mono uppercase tracking-widest text-[#9aa3ad]">
              {sideName.toUpperCase().startsWith('SIDE') ? sideName.toUpperCase() : `Side ${sideName}`}
            </div>
            <div className="flex flex-1 gap-2 overflow-x-auto pb-1 pt-2">
              {silos.map((silo) => {
                const fill = Math.max(4, Math.min(100, silo.percentFull || 0));
                const selected = selectedSilo === silo.siloNumber;
                const low = !silo.isOutOfService && silo.plannedPullLbs <= 0 && silo.onHandLbs < silo.maxCapacityLbs * 0.25;
                return (
                  <button
                    key={silo.siloNumber}
                    type="button"
                    title={`Silo #${silo.siloNumber}: ${Math.round(silo.onHandLbs).toLocaleString()} lbs remaining · ${silo.stagesLeft.toFixed(2)} stages left`}
                    onClick={() => onSelect?.(silo.siloNumber)}
                    className="group relative shrink-0 w-[92px] text-center transition focus:outline-none"
                  >
                    {/* Hover Callout: Pounds remaining & Stages left */}
                    <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 z-30 opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 bg-[#0b0c0e]/95 backdrop-blur-md border border-[#c23b32]/60 px-2 py-0.5 rounded shadow-2xl text-center whitespace-nowrap min-w-[85px]">
                      <div className="text-[10px] font-mono font-bold text-[#e8ebe6]">
                        {Math.round(silo.onHandLbs).toLocaleString()} lbs remaining
                      </div>
                      <div className="text-[9px] font-mono text-[#d4a017]">
                        {silo.stagesLeft > 99 ? '>99' : silo.stagesLeft.toFixed(1)} stages left
                      </div>
                    </div>

                    <svg viewBox="0 0 100 150" className="mx-auto h-36 w-[84px] transition-transform duration-200 group-hover:scale-105">
                      <ellipse cx="50" cy="18" rx="28" ry="7" fill="#1b2027" stroke={selected ? '#e25a4a' : '#3a4452'} />
                      <path d="M24 16 h52 v4 h-52z" fill="none" stroke={selected ? '#e25a4a' : '#3a4452'} />
                      <path d="M22 22 H78 V88 L66 118 H34 L22 88 Z" fill="#14171c" stroke={selected ? '#e25a4a' : '#3a4452'} strokeWidth={selected ? 2.4 : 1.2} />
                      <path d="M28 86 L36 112 H64 L72 86 Z" fill="#101318" />
                      <polygon
                        points={`30,${92 - fill * 0.55} 50,${78 - fill * 0.45} 70,${92 - fill * 0.55}`}
                        fill={silo.isOutOfService ? '#2a313b' : '#c4a15a'}
                        opacity="0.95"
                      />
                      <path d="M30 118 L26 136 M70 118 L74 136 M26 136 H74" fill="none" stroke="#3a4452" strokeWidth="2" />
                    </svg>
                    <div className={`text-[11px] font-mono ${selected ? 'text-[#e25a4a]' : 'text-[#9aa3ad]'}`}>
                      {silo.name && silo.name !== `Silo ${silo.siloNumber}` ? silo.name : `T-${String(silo.siloNumber).padStart(2, '0')}`}
                    </div>
                    <div className="text-[10px] font-mono text-[#d4a017]">{Math.round(silo.onHandLbs).toLocaleString()}</div>
                    <div className="text-[9px] font-mono text-[#9aa3ad] transition-colors group-hover:text-[#8fa37a]">
                      {silo.stagesLeft > 99 ? '>99' : silo.stagesLeft.toFixed(1)} stg left
                    </div>
                    {low && <div className="text-[10px] uppercase text-[#e25a4a]">Low</div>}
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
